import { api, passwordProof, session } from "./api.js";
import { currentLocale, t } from "./i18n.js";
import { esc, formData, showError } from "./ui.js";

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

export function renderSignIn(main, onDone, initial = "signin") {
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
              }" required minlength="${creating ? 10 : 1}">
              <button class="ghost" type="button" data-reveal aria-pressed="false">${t("auth.show-password")}</button>
            </span>
          </label>
          <button class="primary" type="submit">${creating ? t("auth.create") : t("auth.signin")}</button>
        </form>
        <button class="ghost" type="button" data-switch>${
          creating ? t("auth.have-account") : t("auth.create-account")
        }</button>
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
      showError(event.target, error);
    }
  });
}

export function householdLabel(household) {
  return esc(household?.name ?? "");
}
