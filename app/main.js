import { api, session } from "./api.js";
import { chooseHousehold, householdLabel, renderSignIn } from "./auth.js";
import { renderFridge } from "./fridge.js";
import { renderAnalytics } from "./analytics.js";
import { renderChef } from "./chef.js";
import { renderMarket } from "./market.js";
import { connectLive, disconnectLive } from "./live.js";
import { renderNow } from "./now.js";
import { renderSettings } from "./settings.js";
import { renderLanding } from "./landing.js";
import { openInbox } from "./inbox.js";
import { mountStage, refreshStage, refreshStageSoon, showRoute } from "./stage.js";
import { currentLocale, loadLocale, locales, plural, t, translatePage } from "./i18n.js";
import { errorText, esc, skeleton } from "./ui.js";

const main = document.getElementById("main");
const loader = document.querySelector("[data-loader]");
const tabs = document.querySelector(".tabs");
const stageBox = document.querySelector("[data-stage-box]");
const sessionBar = document.querySelector(".session");
const views = {
  now: renderNow,
  fridge: renderFridge,
  market: renderMarket,
  numbers: renderAnalytics,
  chef: renderChef,
  settings: (main, household) => renderSettings(main, household, () => {
    drawLanguages();
    translatePage();
    render();
  }),
};
let household = null;
let stageHousehold = null;

function current() {
  const route = location.hash.replace("#/", "").split("/")[0];
  return views[route] ? route : "now";
}

async function refreshInbox() {
  const notifications = await api("/notifications").catch(() => []);
  const unread = notifications.filter((notification) => !notification.readAt).length;
  const link = document.querySelector("[data-inbox]");
  link.textContent = unread ? plural("inbox.unread", unread) : "";
  link.title = notifications[0]?.title ?? "";
}

async function refreshStatus() {
  const status = await api("/status").catch(() => null);
  const notice = document.querySelector("[data-degraded]");
  if (!status || status.state === "OK") {
    notice.hidden = true;
    return;
  }
  const parts = status.degraded.map((item) => item.component).join(", ");
  notice.textContent = t("status.saved-mode", { parts });
  notice.hidden = false;
}

function progress(value) {
  loader.style.setProperty("--p", value);
}

const still = matchMedia("(prefers-reduced-motion: reduce)");

function paint(update) {
  if (!loader.classList.contains("gone")) return Promise.resolve(update());
  if (stageBox.classList.contains("has-three") && !stageBox.hidden) {
    const column = document.querySelector(".column");
    if (still.matches) return Promise.resolve(update());
    return column.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-28px)" }], { duration: 160, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }).finished.then(() => {
      update();
      column.animate([{ opacity: 0, transform: "translateX(-56px)" }, { opacity: 1, transform: "none" }], { duration: 460, easing: "cubic-bezier(.2,.8,.2,1)", fill: "none" });
      column.getAnimations().filter((animation) => animation.effect.getComputedTiming().fill === "forwards").forEach((animation) => animation.cancel());
    });
  }
  if (!document.startViewTransition) return Promise.resolve(update());
  const transition = document.startViewTransition(update);
  transition.ready.catch(() => null);
  return transition.updateCallbackDone.catch(() => null);
}

function enter() {
  main.setAttribute("aria-busy", "false");
  [...main.children, ...main.querySelectorAll(".bento > *")].forEach((element, index) =>
    element.style.setProperty("--i", Math.min(index, 8)),
  );
  main.setAttribute("data-enter", "");
  setTimeout(() => main.removeAttribute("data-enter"), 1400);
}

let renders = 0;

async function render() {
  const ticket = ++renders;
  if (!session.signedIn) {
    tabs.hidden = true;
    stageBox.hidden = true;
    sessionBar.hidden = true;
    const route = location.hash.replace("#/", "").split("/")[0];
    document.documentElement.dataset.chapter = "now";
    if (route === "signin" || route === "register") renderSignIn(main, render, route);
    else renderLanding(main);
    main.setAttribute("aria-busy", "false");
    return;
  }
  if (!household) {
    await chooseHousehold(main, (chosen) => {
      household = chosen;
      render();
    });
    return;
  }
  tabs.hidden = false;
  sessionBar.hidden = false;
  if (stageBox.hidden) {
    stageBox.hidden = false;
    if (!stageHousehold) mountStage(document.querySelector("[data-stage]"));
  }
  if (stageHousehold !== household.id) {
    stageHousehold = household.id;
    refreshStage(household);
  }
  connectLive(household.id);
  document.querySelector("[data-household]").innerHTML = householdLabel(household);
  const route = current();
  document.documentElement.dataset.chapter = route;
  showRoute(route);
  main.setAttribute("aria-busy", "true");
  await paint(() => {
    main.innerHTML = skeleton(route, t(`nav.${route}`));
  });
  if (ticket !== renders) return;
  document.querySelectorAll(".tabs a, [data-settings-link]").forEach((link) => {
    if (link.dataset.tab === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  try {
    await views[route](main, household);
    if (ticket !== renders) return;
    enter();
    refreshInbox();
    refreshStatus();
  } catch (error) {
    main.innerHTML = `<section class="empty"><h1>${t("screen.failed")}</h1><p>${esc(errorText(error))}</p><button type="button" data-retry>${t("action.retry")}</button></section>`;
    main.querySelector("[data-retry]").addEventListener("click", render);
    enter();
  }
}

window.addEventListener("hashchange", async () => {
  await render();
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
});

window.addEventListener("hpc:live-state", (event) => {
  document.querySelector("[data-live]").dataset.state = event.detail;
  document.querySelector("[data-live]").textContent = event.detail === "on" ? t("live.on") : t("live.reconnecting");
});

window.addEventListener("hpc:live", (event) => {
  if (event.detail.kind === "alert") refreshInbox();
  else refreshStageSoon();
});

window.addEventListener("hpc:inventory-changed", () => {
  if (["now", "fridge"].includes(current()) && !document.querySelector("dialog[open]")) render();
});

window.addEventListener("hpc:session-changed", (event) => {
  if (event.detail && household) return;
  disconnectLive();
  household = null;
  render();
});

window.addEventListener("hpc:signed-out", () => {
  disconnectLive();
  household = null;
  render();
});

document.querySelector("[data-signout]").addEventListener("click", async () => {
  const refreshToken = session.refresh;
  session.clear();
  disconnectLive();
  household = null;
  if (refreshToken) {
    await api("/auth/logout", { method: "POST", body: { refreshToken }, auth: false }).catch(() => null);
  }
  location.hash = "#/now";
  render();
});

document.querySelector("[data-inbox]").addEventListener("click", (event) => {
  event.preventDefault();
  openInbox(refreshInbox);
});

const languageSelect = document.querySelector("[data-language]");

function drawLanguages() {
  languageSelect.innerHTML = locales()
    .map(
      (option) =>
        `<option value="${esc(option.code)}" ${option.code === currentLocale() ? "selected" : ""}>${esc(option.name)}</option>`,
    )
    .join("");
}

languageSelect.addEventListener("change", async () => {
  await loadLocale(languageSelect.value);
  drawLanguages();
  if (session.signedIn) {
    await api("/me/locale", { method: "PUT", body: { locale: currentLocale() } }).catch(() => null);
  }
  translatePage();
  await render();
});

progress(0.2);
await Promise.all([loadLocale(), document.fonts.load("900 1em Fraunces").catch(() => null)]);
progress(0.6);
drawLanguages();
await render();
progress(1);
setTimeout(() => {
  loader.classList.add("done");
  setTimeout(() => loader.classList.add("gone"), 2400);
}, 450);
