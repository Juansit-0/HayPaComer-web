import { api, passwordProof, session } from "./api.js";
import { currentLocale, t } from "./i18n.js";
import { esc, formData, showError, toast } from "./ui.js";

function poster(content) {
  return `<section class="auth-split">
    <div class="auth-poster">
      <p class="auth-question" aria-hidden="true">${t("now.question")}</p>
      <figure class="auth-photo">
        <img src="/brand/photos/potrerillo.jpg" alt="" width="1200" height="900">
        <figcaption>${esc(t("photo.credit", { credit: "El Potrerillo, Pasto. Υ.Γ., CC BY-SA 4.0" }))}</figcaption>
      </figure>
    </div>
    ${content}
  </section>`;
}

const MIN_PASSWORD = 10;
const JOIN_KEY = "hpc.join";

// An invitation link can open signed out, so its token waits here until there is an account to accept it with.
export function rememberJoin(token) {
  try {
    sessionStorage.setItem(JOIN_KEY, token);
  } catch {}
}

export function takeJoin() {
  try {
    const token = sessionStorage.getItem(JOIN_KEY);
    sessionStorage.removeItem(JOIN_KEY);
    return token;
  } catch {
    return null;
  }
}

function accountPage(id, title, lead, content) {
  return poster(`
    <section class="auth stack" aria-labelledby="${id}">
      <div>
        <h1 id="${id}">${title}</h1>
        <p class="lead">${lead}</p>
      </div>
      ${content}
    </section>`);
}

export function renderForgot(main) {
  main.innerHTML = accountPage(
    "forgot-title",
    t("auth.forgot-title"),
    t("auth.forgot-lead"),
    `<form novalidate>
      <label>${t("auth.email")}<input name="email" type="email" autocomplete="email" required></label>
      <button class="primary" type="submit">${t("auth.forgot-send")}</button>
    </form>
    <a class="button ghost" href="#/signin">${t("auth.back-signin")}</a>`,
  );
  main.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { email } = formData(event.target);
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email }, auth: false });
      event.target.innerHTML = `<p role="status">${t("auth.forgot-sent")}</p>`;
    } catch (error) {
      button.disabled = false;
      showError(event.target, error);
    }
  });
}

export function renderReset(main, token) {
  main.innerHTML = accountPage(
    "reset-title",
    t("auth.reset-title"),
    t("auth.reset-lead"),
    `<form novalidate>
      <label>${t("auth.password-new")}<input name="password" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD}"></label>
      <button class="primary" type="submit">${t("auth.reset-save")}</button>
    </form>`,
  );
  main.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { password } = formData(event.target);
    if (MIN_PASSWORD > password.length) return showError(event.target, { message: t("auth.password-short") });
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password }, auth: false });
      session.clear();
      toast(t("auth.reset-done"));
      location.hash = "#/signin";
    } catch (error) {
      button.disabled = false;
      showError(event.target, error.status === 400 ? error : { message: t("auth.link-bad") });
    }
  });
}

export async function renderVerify(main, token) {
  const done = await api("/auth/verify-email", { method: "POST", body: { token }, auth: false }).then(() => true, () => false);
  main.innerHTML = accountPage(
    "verify-title",
    t("auth.verify-title"),
    done ? t("auth.verify-done") : t("auth.link-bad"),
    `<a class="button primary" href="#/now">${t("auth.continue")}</a>`,
  );
}

export function renderSignIn(main, onDone, initial = "signin", notice = null) {
  let mode = initial;
  const draw = () => {
    const creating = mode === "register";
    main.innerHTML = poster(`
      <section class="auth stack" aria-labelledby="auth-title">
        <div>
          <h1 id="auth-title">${creating ? t("auth.create-title") : t("auth.signin-title")}</h1>
          <p class="lead">${
            creating
              ? t("auth.create-lead")
              : t("auth.signin-lead")
          }</p>
          ${notice ? `<p role="status">${esc(notice)}</p>` : ""}
        </div>
        <form novalidate>
          ${
            creating
              ? `<label>${t("auth.name")}<input name="displayName" autocomplete="name" required maxlength="80"></label>`
              : ""
          }
          <label>${t("auth.email")}<input name="email" type="email" autocomplete="email" required></label>
          <label>${creating ? t("auth.password-new") : t("auth.password")}
            <span class="password-field">
              <input name="password" type="password" autocomplete="${
                creating ? "new-password" : "current-password"
              }" required minlength="${creating ? MIN_PASSWORD : 1}">
              <button class="ghost" type="button" data-reveal aria-pressed="false">${t("auth.show-password")}</button>
            </span>
          </label>
          <button class="primary" type="submit">${creating ? t("auth.create") : t("auth.signin")}</button>
        </form>
        <button class="ghost" type="button" data-switch>${
          creating ? t("auth.have-account") : t("auth.create-account")
        }</button>
        ${creating ? "" : `<a class="button ghost" href="#/forgot">${t("auth.forgot-link")}</a>`}
      </section>`);
    main.querySelector("[data-reveal]").addEventListener("click", (event) => {
      const input = main.querySelector("[name=password]");
      const shown = input.type === "text";
      input.type = shown ? "password" : "text";
      event.currentTarget.setAttribute("aria-pressed", String(!shown));
      event.currentTarget.textContent = shown ? t("auth.show-password") : t("auth.hide-password");
    });
    main.querySelector("[data-switch]").addEventListener("click", () => {
      mode = creating ? "signin" : "register";
      draw();
    });
    main.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = formData(event.target);
      // The server only ever sees a proof of the password, so its length can be checked only here.
      if (creating && MIN_PASSWORD > values.password.length) return showError(event.target, { message: t("auth.password-short") });
      const button = event.target.querySelector("button[type=submit]");
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      try {
        const proof = await passwordProof(values.email, values.password);
        if (creating) {
          await api("/auth/register", {
            method: "POST",
            body: { email: values.email, displayName: values.displayName, passwordProof: proof },
            auth: false,
          });
        }
        const login = (body) => api("/auth/login", { method: "POST", body: { email: values.email, ...body }, auth: false });
        session.store(
          await login({ passwordProof: proof }).catch((error) =>
            error.status === 401 ? login({ password: values.password }) : Promise.reject(error),
          ),
        );
        await api("/me/locale", { method: "PUT", body: { locale: currentLocale() } }).catch(() => null);
        onDone();
      } catch (error) {
        showError(event.target, error);
      } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    });
  };
  draw();
}

export async function chooseHousehold(main, onDone) {
  const households = await api("/households");
  if (households.length > 0) {
    if (!households.some((household) => household.id === session.household)) {
      session.household = households[0].id;
    }
    onDone(households.find((household) => household.id === session.household));
    return;
  }
  main.innerHTML = poster(`
    <section class="auth stack" aria-labelledby="home-title">
      <div>
        <h1 id="home-title">${t("home.title")}</h1>
        <p class="lead">${t("home.lead")}</p>
      </div>
      <form>
        <label>${t("home.name")}<input name="name" required maxlength="60" placeholder="${esc(t("home.name-example"))}"></label>
        <label>${t("home.currency")}<input name="currency" required value="COP" maxlength="3" class="grams"></label>
        <button class="primary" type="submit">${t("home.create")}</button>
      </form>
    </section>`);
  main.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formData(event.target);
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const household = await api("/households", {
        method: "POST",
        body: {
          name: values.name,
          currency: values.currency.toUpperCase(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      session.household = household.id;
      onDone(household);
    } catch (error) {
      button.disabled = false;
      showError(event.target, error);
    }
  });
}

export function householdLabel(household) {
  return esc(household?.name ?? "");
}
