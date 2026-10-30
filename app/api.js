import { t } from "./i18n.js";

const KEYS = { access: "hpc.access", refresh: "hpc.refresh", household: "hpc.household" };
const LOCK = "hpc.refresh";
const EARLY_SECONDS = 30;
// Every request has an end: one attempt waits at most ATTEMPT_MS (above the 60 s the AI provider may take), and while the server wakes up
// (Render sleeps an idle service and answers 502 or 503 for about a minute) the request is tried again until PATIENCE_MS have passed, then
// fails with a clear error.
const ATTEMPT_MS = 75000;
const PATIENCE_MS = 150000;
const WAKING = new Set([502, 503, 504]);

export class ApiError extends Error {
  constructor(problem, status) {
    super(problem.detail || problem.title || t("error.request"));
    this.status = status;
    this.problem = problem;
  }
}

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function expiresAt(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).exp * 1000;
  } catch {
    return 0;
  }
}

export const session = {
  get access() { return read(KEYS.access); },
  get refresh() { return read(KEYS.refresh); },
  get household() { return read(KEYS.household); },
  set household(id) { write(KEYS.household, id); },
  store(tokens) {
    write(KEYS.access, tokens.accessToken);
    write(KEYS.refresh, tokens.refreshToken);
  },
  clear() { Object.values(KEYS).forEach((key) => write(key, null)); },
  get signedIn() { return Boolean(this.refresh || this.access); },
};

function signedOut() {
  session.clear();
  window.dispatchEvent(new Event("hpc:signed-out"));
}

// How many requests are waiting and since when, told to the shell (hpc:network) so it can say the server is loading.
const waiting = new Set();
function tell() {
  const since = waiting.size ? Math.min(...waiting) : 0;
  window.dispatchEvent(new CustomEvent("hpc:network", { detail: { waiting: waiting.size, since } }));
}

async function attempt(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// A read is tried again after a timeout or a dropped connection; a write only when it never reached the server (no connection) or the
// proxy answered for a sleeping server, so nothing is saved twice.
export async function patiently(url, init = {}) {
  const read = !init.method || init.method === "GET";
  const started = Date.now();
  waiting.add(started);
  tell();
  try {
    for (let pause = 1000; ; pause = Math.min(pause * 2, 8000)) {
      let response = null;
      let failure = null;
      try {
        response = await attempt(url, init);
      } catch (error) {
        failure = error;
      }
      const retry = failure ? read || failure.name !== "AbortError" : WAKING.has(response.status) && !response.headers.get("Content-Type")?.includes("problem");
      const late = Date.now() - started + pause > PATIENCE_MS;
      if (response && (!retry || late)) return response;
      if (!retry || late) {
        window.dispatchEvent(new Event("hpc:network-failed"));
        throw new ApiError({ title: t("net.failed") }, 0);
      }
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  } finally {
    waiting.delete(started);
    tell();
  }
}

async function exchange(used) {
  if (session.refresh !== used) return Boolean(session.access);
  const response = await patiently("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refreshToken: used }),
  });
  if (response.status === 401 || response.status === 400) {
    if (session.refresh === used) signedOut();
    return false;
  }
  if (!response.ok) return false;
  session.store(await response.json());
  return true;
}

let pending = null;

function refreshTokens() {
  const used = session.refresh;
  if (!used) return Promise.resolve(false);
  if (!pending) {
    const run = () => exchange(used);
    pending = (navigator.locks ? navigator.locks.request(LOCK, run) : run())
      .catch(() => false)
      .finally(() => { pending = null; });
  }
  return pending;
}

export async function freshAccess() {
  const access = session.access;
  if (access && expiresAt(access) - EARLY_SECONDS * 1000 > Date.now()) return access;
  await refreshTokens();
  return session.access;
}

async function send(path, { method = "GET", body, auth = true } = {}) {
  const headers = { Accept: "application/json, application/problem+json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const access = await freshAccess();
    if (access) headers.Authorization = `Bearer ${access}`;
  }
  return patiently(`/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function api(path, options = {}) {
  let response = await send(path, options);
  if (response.status === 401 && options.auth !== false && (await refreshTokens())) {
    response = await send(path, options);
  }
  if (response.status === 401 && options.auth !== false) signedOut();
  if (response.status === 204) return null;
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(payload || {}, response.status);
  return payload;
}

window.addEventListener("storage", (event) => {
  if (event.key === KEYS.refresh) {
    window.dispatchEvent(new CustomEvent("hpc:session-changed", { detail: Boolean(event.newValue) }));
  }
  if (event.key === null) window.dispatchEvent(new CustomEvent("hpc:session-changed", { detail: false }));
});

export async function passwordProof(email, password) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(`haypacomer:${email.trim().toLowerCase()}`), iterations: 100000 },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
