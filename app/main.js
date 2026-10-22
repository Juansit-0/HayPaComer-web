import { newPage, reduced, token } from "./motion.js";
import { play, setSound, soundOn } from "./sound.js";
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
import { errorText, esc, skeleton, swap } from "./ui.js";

const main = document.getElementById("main");
const loader = document.querySelector("[data-loader]");
const tabs = document.querySelector(".tabs");
const stageBox = document.querySelector("[data-stage-box]");
const sessionBar = document.querySelector(".session");
const syncSound = () => document.querySelectorAll("[data-sound]").forEach((button) => button.setAttribute("aria-pressed", String(soundOn())));
syncSound();
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-sound]")) {
    setSound(!soundOn());
    syncSound();
    return;
  }
  if (event.target.closest("button, a.button, .chip, .palette-chip")) play("click");
});
document.addEventListener("change", (event) => event.target.matches("input[type=checkbox], input[type=radio]") && play("tick"));
["pointerdown", "keydown"].forEach((type) => window.addEventListener(type, () => soundOn() && setSound(true), { once: true }));
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

let ink = null;
// A gentler exit than --ease-exit: its steep tail would move the ink edge a third of the panel in one frame.
const INK_EXIT = "cubic-bezier(.45,0,.75,.65)";

// The panel withdraws behind the ink edge from wherever it is, so a new route can interrupt the last one at any point.
function inkTo(column, to, duration, easing) {
  const from = getComputedStyle(column).getPropertyValue("--ink").trim() || "112%";
  ink?.cancel();
  ink = column.animate([{ "--ink": from }, { "--ink": to }], { duration, easing, fill: "forwards" });
  return ink;
}

async function paint(update) {
  const inked = loader.classList.contains("gone") && stageBox.classList.contains("has-three") && !stageBox.hidden && !reduced();
  if (!inked) return update();
  const column = document.querySelector(".column");
  const withdraw = inkTo(column, "0.5%", token("duration-withdraw"), INK_EXIT);
  const done = await withdraw.finished.then(() => true, () => false);
  if (!done) return false;
  update();
  const reveal = inkTo(column, "112%", token("duration-spring"), getComputedStyle(document.documentElement).getPropertyValue("--ease-spring").trim());
  reveal.finished.then(() => reveal === ink && (reveal.cancel(), (ink = null)), () => null);
}

function enter() {
  main.setAttribute("aria-busy", "false");
  [...main.querySelectorAll(":scope > header, .bento > *")].forEach((element, index) => element.style.setProperty("--i", Math.min(index, 5)));
  main.setAttribute("data-enter", "");
  setTimeout(() => main.removeAttribute("data-enter"), 1400);
}

let renders = 0;

async function render({ navigate = false, refresh = false } = {}) {
  const ticket = ++renders;
  newPage();
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
  if (refresh && main.dataset.route === route) {
    await swap(main, () => views[route](main, household)).catch(() => null);
    return;
  }
  main.setAttribute("aria-busy", "true");
  await paint(() => {
    main.innerHTML = skeleton(route, t(`nav.${route}`));
    main.dataset.route = route;
    if (navigate) {
      window.scrollTo(0, 0);
      document.querySelector(".column").scrollTop = 0;
      main.focus({ preventScroll: true });
    }
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

window.addEventListener("hashchange", () => render({ navigate: true }));

document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
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
  if (["now", "fridge"].includes(current()) && !document.querySelector("dialog[open]")) render({ refresh: true });
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

const languageSwitch = document.querySelector("[data-language]");

// A pill of short codes with an ink blot behind the chosen one; each button carries the full language name for screen readers.
function drawLanguages() {
  const options = locales();
  const chosen = Math.max(0, options.findIndex((option) => option.code === currentLocale()));
  languageSwitch.style.setProperty("--count", options.length);
  languageSwitch.style.setProperty("--chosen", chosen);
  languageSwitch.innerHTML = `<span class="language-blot" aria-hidden="true"></span>${options
    .map(
      (option) =>
        `<button type="button" data-locale="${esc(option.code)}" lang="${esc(option.code)}" aria-label="${esc(option.name)}" aria-pressed="${option.code === currentLocale()}">${esc(option.code.split("-")[0].toUpperCase())}</button>`,
    )
    .join("")}`;
}

languageSwitch.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-locale]");
  if (!button || button.getAttribute("aria-pressed") === "true") return;
  await loadLocale(button.dataset.locale);
  drawLanguages();
  languageSwitch.querySelector(`[data-locale="${CSS.escape(button.dataset.locale)}"]`)?.focus();
  if (session.signedIn) {
    await api("/me/locale", { method: "PUT", body: { locale: currentLocale() } }).catch(() => null);
  }
  translatePage();
  await render();
});

progress(0.2);
const fontsOrLate = Promise.race([document.fonts.load("900 1em Fraunces").catch(() => null), new Promise((resolve) => setTimeout(resolve, 600))]);
await Promise.all([loadLocale(), fontsOrLate]);
progress(0.6);
drawLanguages();
await render();
progress(1);
loader.classList.add("done");
document.documentElement.dataset.ready = "";
const leave = () => loader.classList.add("gone");
if (reduced()) leave();
else {
  loader.addEventListener("transitionend", (event) => event.target === loader && leave());
  setTimeout(leave, token("duration-shutter") + 400);
}
