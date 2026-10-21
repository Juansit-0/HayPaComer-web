// Screenshot the mock-served UI with headless Chrome over CDP.
// usage: node cap.mjs <route> <out-prefix> <width> [waitMs]
// env: OUT_SIGNED=1 signed out, REDUCED=1 reduced motion, PRELOAD=<js run before each page>, EVAL=<js, awaited, printed>, AT=<comma list: story share or #selector, one shot each>
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [route = "now", out = "shots/cap", width = "1440", wait = "6000"] = process.argv.slice(2);
const height = Number(width) < 700 ? 844 : 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "hpc-chrome-"));
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--no-first-run", `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });
const done = () => { chrome.kill(); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); };
setTimeout(() => { console.log("timed out"); done(); setTimeout(() => process.exit(2), 600); }, Number(wait) + 60000).unref();
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).then((list) => list.find((t) => t.type === "page")).catch(() => null);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height, deviceScaleFactor: 1, mobile: Number(width) < 700 });
  if (process.env.PRELOAD) await send("Page.addScriptToEvaluateOnNewDocument", { source: process.env.PRELOAD });
  if (process.env.REDUCED) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url: "http://localhost:8091/" });
  await sleep(800);
  const jwt = "x." + Buffer.from(JSON.stringify({ exp: 4102444800, sub: "u1" })).toString("base64").replace(/=+$/, "") + ".y";
  const session = process.env.OUT_SIGNED ? "localStorage.clear();" : `localStorage.setItem("hpc.access", "${jwt}"); localStorage.setItem("hpc.refresh", "mock"); localStorage.setItem("hpc.household", "11111111-1111-4111-8111-111111111111");`;
  await send("Runtime.evaluate", { expression: `${session} localStorage.setItem("hpc.locale", "es-CO");` });
  await send("Page.navigate", { url: `http://localhost:8091/${process.env.AT || process.env.DEV ? "?dev=review" : ""}#/${route}` });
  await sleep(Number(wait));
  if (process.env.EVAL) console.log(JSON.stringify((await send("Runtime.evaluate", { expression: process.env.EVAL, returnByValue: true, awaitPromise: true })).result.result?.value ?? null));
  const points = process.env.AT ? process.env.AT.split(",") : [null];
  for (const at of points) {
    if (at !== null) {
      await send("Runtime.evaluate", { expression: `(() => { const v = ${JSON.stringify(at)}; if (v.startsWith("#")) { document.querySelector(v).scrollIntoView(); return; } if (window.__hpc?.seek) return window.__hpc.seek(Number(v)); const s = document.querySelector("[data-story]"); scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * Number(v)); })()` });
      await sleep(Number(process.env.SETTLE ?? 1500));
    }
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = at === null ? `${out}-${width}.png` : `${out}-${at}.png`;
    writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    console.log(file);
  }
  console.log(errors.length ? "ERRORS " + errors.join(" | ").slice(0, 600) : "no errors");
} finally {
  done();
}
