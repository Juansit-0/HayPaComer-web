import { art } from "./art/drawings.js";
import { easing, newPage, reduced, token } from "./motion.js";
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
const bar = document.querySelector(".bar");
const accountButton = document.querySelector("[data-account]");
const accountMenu = document.querySelector("[data-account-menu]");
const tabsBlot = tabs.querySelector(".tabs-blot");
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

// The bell always stays; a tomato badge counts what is unread and the label says it in words.
async function refreshInbox() {
  const notifications = await api("/notifications").catch(() => []);
  const unread = notifications.filter((notification) => !notification.readAt).length;
  const bell = document.querySelector("[data-inbox]");
  const badge = bell.querySelector("[data-inbox-count]");
  badge.textContent = unread > 9 ? "9+" : String(unread);
  badge.hidden = !unread;
  bell.setAttribute("aria-label", unread ? `${t("nav.notifications")}, ${plural("inbox.unread", unread)}` : t("nav.notifications"));
  bell.title = notifications[0]?.title ?? "";
}

// The ink blot slides under the current section; it is placed without travel the first time and fades out where no tab is current.
function placeBlot(route) {
  const link = tabs.querySelector(`a[data-tab="${route}"]`);
  tabsBlot.style.setProperty("--blot-on", link ? "1" : "0");
  if (!link) return;
  tabsBlot.style.setProperty("--blot-x", `${link.offsetLeft}px`);
  tabsBlot.style.setProperty("--blot-y", `${link.offsetTop}px`);
  tabsBlot.style.setProperty("--blot-w", `${link.offsetWidth}px`);
  tabsBlot.style.setProperty("--blot-h", `${link.offsetHeight}px`);
  if (!tabsBlot.classList.contains("moving")) requestAnimationFrame(() => tabsBlot.classList.add("moving"));
}
new ResizeObserver(() => placeBlot(current())).observe(tabs);

// Light or night paper: the reader's choice when they made one, the system's until then. The new paper spreads from the button in a circle.
const THEME_KEY = "hpc.theme";
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const themeButton = document.querySelector("[data-theme-toggle]");
function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}
function applyTheme(theme = savedTheme() ?? (systemDark.matches ? "dark" : "light")) {
  document.documentElement.dataset.theme = theme;
  themeButton.setAttribute("aria-pressed", String(theme === "dark"));
  dispatchEvent(new CustomEvent("hpc:theme", { detail: theme }));
}
applyTheme();
systemDark.addEventListener("change", () => applyTheme());
themeButton.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}
  if (reduced() || !document.startViewTransition) return applyTheme(next);
  const box = themeButton.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(() => applyTheme(next)).ready.then(() =>
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
      { duration: token("duration-spring"), easing: easing("ease-emphasized"), pseudoElement: "::view-transition-new(root)" },
    ),
  );
});

// Signed in, language and sound live in the account menu; signed out they sit in the bar for the landing.
function placePreferences(signedIn) {
  const sound = document.querySelector("[data-sound]");
  const signout = accountMenu.querySelector("[data-signout]");
  if (signedIn) {
    accountMenu.querySelector("[data-language-row]").append(languageSwitch);
    signout.before(sound);
  }
  else bar.append(sound, languageSwitch);
}

accountMenu.addEventListener("beforetoggle", (event) => {
  accountButton.setAttribute("aria-expanded", String(event.newState === "open"));
  if (event.newState !== "open") return;
  const box = accountButton.getBoundingClientRect();
  accountMenu.style.top = `${box.bottom + 8}px`;
  accountMenu.style.right = `${Math.max(8, innerWidth - box.right)}px`;
});
accountMenu.addEventListener("toggle", (event) => event.newState === "open" && accountMenu.querySelector("button")?.focus());

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

let inkedPaint = false;
async function paint(update) {
  const inked = loader.classList.contains("gone") && stageBox.classList.contains("has-three") && !stageBox.hidden && !reduced();
  inkedPaint = inked;
  if (!inked) return update();
  const column = document.querySelector(".column");
  const withdraw = inkTo(column, "0.5%", token("duration-withdraw"), INK_EXIT);
  const done = await withdraw.finished.then(() => true, () => false);
  if (!done) return false;
  update();
  const reveal = inkTo(column, "112%", token("duration-spring"), getComputedStyle(document.documentElement).getPropertyValue("--ease-spring").trim());
  reveal.finished.then(() => reveal === ink && (reveal.cancel(), (ink = null)), () => null);
}

// Sections in the order of the tab bar: a change of section enters from the side it lies on.
const SECTIONS = ["now", "fridge", "market", "numbers", "chef", "settings"];
let shownRoute = null;

// Where no ink edge withdraws the panel (phones, no 3D), the new chapter's colour sweeps across its band from that side instead.
function enter(route) {
  main.setAttribute("aria-busy", "false");
  [...main.querySelectorAll(":scope > header, .bento > *")].forEach((element, index) => element.style.setProperty("--i", Math.min(index, 5)));
  const step = route && shownRoute ? Math.sign(SECTIONS.indexOf(route) - SECTIONS.indexOf(shownRoute)) : 0;
  shownRoute = route ?? shownRoute;
  main.style.setProperty("--enter-x", `${step * 24}px`);
  main.setAttribute("data-enter", inkedPaint || !step ? "" : step > 0 ? "next" : "previous");
  setTimeout(() => main.removeAttribute("data-enter"), 1400);
}

let renders = 0;

async function render({ navigate = false, refresh = false } = {}) {
  const ticket = ++renders;
  newPage();
  if (!session.signedIn) {
    placePreferences(false);
    tabs.hidden = true;
    stageBox.hidden = true;
    sessionBar.hidden = true;
    const route = location.hash.replace("#/", "").split("/")[0];
    document.documentElement.dataset.chapter = "now";
    delete document.documentElement.dataset.app;
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
  placePreferences(true);
  // Night paper follows the system only inside the app; the landing's engraving is printed for daylight paper.
  document.documentElement.dataset.app = "";
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
  placeBlot(route);
  try {
    await views[route](main, household);
    if (ticket !== renders) return;
    enter(route);
    refreshInbox();
    refreshStatus();
  } catch (error) {
    main.innerHTML = `<section class="empty">${art("plug")}<h1>${t("screen.failed")}</h1><p>${esc(errorText(error))}</p><button type="button" data-retry>${t("action.retry")}</button></section>`;
    main.querySelector("[data-retry]").addEventListener("click", render);
    enter();
  }
}

window.addEventListener("hashchange", () => render({ navigate: true }));

// Phones: a sideways swipe on the page moves to the neighbouring section. The page follows the finger and springs back if the swipe falls
// short; swipes inside sideways scrollers, fields and dialogs, near the screen edges (system back) or mostly vertical are left alone.
const SWIPE_IGNORE = ".dish-row, .shelf-chips, .palette-chips, input, select, textarea, [data-scroll-x]";
let swipe = null;
main.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch" || tabs.hidden || matchMedia("(min-width: 1024px)").matches || event.target.closest(SWIPE_IGNORE)) return;
  if (24 > event.clientX || event.clientX > innerWidth - 24) return;
  swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), dx: 0, locked: false };
});
main.addEventListener("pointermove", (event) => {
  if (swipe?.id !== event.pointerId) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  if (!swipe.locked) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) swipe = null;
    else if (Math.abs(dx) > 10) swipe.locked = true;
    return;
  }
  swipe.dx = dx;
  const index = SECTIONS.indexOf(current());
  const edge = (dx > 0 && index === 0) || (0 > dx && index === 4) || index > 4;
  if (!reduced()) main.style.translate = `${dx * (edge ? 0.15 : 0.6)}px 0`;
});
const endSwipe = (event) => {
  if (swipe?.id !== event.pointerId) return;
  const { dx, at, locked } = swipe;
  swipe = null;
  if (!locked) return;
  const index = SECTIONS.indexOf(current());
  const next = SECTIONS[index + (dx > 0 ? -1 : 1)];
  const far = Math.abs(dx) > innerWidth * 0.25 || Math.abs(dx) / (performance.now() - at) > 0.5;
  if (event.type === "pointerup" && far && next && next !== "settings" && index !== -1 && 5 > index) {
    main.style.translate = "";
    location.hash = `#/${next}`;
    return;
  }
  const from = main.style.translate || "0px 0";
  main.style.translate = "";
  if (!reduced()) main.animate([{ translate: from }, { translate: "0px 0" }], { duration: token("duration-slow"), easing: easing("ease-spring") });
};
main.addEventListener("pointerup", endSwipe);
main.addEventListener("pointercancel", endSwipe);

document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
});

window.addEventListener("hpc:live-state", (event) => {
  document.querySelector("[data-live]").dataset.state = event.detail;
  document.querySelector("[data-live]").textContent = event.detail === "on" ? t("live.on") : t("live.reconnecting");
});

// A new alert rings the bell once (when the page is in view), so it is noticed without a banner taking over the screen.
window.addEventListener("hpc:live", async (event) => {
  if (event.detail.kind !== "alert") {
    refreshStageSoon();
    return;
  }
  await refreshInbox();
  if (document.hidden || reduced()) return;
  play("pop");
  document.querySelector("[data-inbox] .icon").animate(
    [{ rotate: "0deg" }, { rotate: "-16deg" }, { rotate: "12deg" }, { rotate: "-7deg" }, { rotate: "3deg" }, { rotate: "0deg" }],
    { duration: token("duration-spring") + 200, easing: easing("ease-standard") },
  );
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
  accountMenu.hidePopover();
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
const fitLoader = () => {
  const word = document.querySelector(".loader-word");
  const style = getComputedStyle(loader);
  const room = loader.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const width = word.firstElementChild.getBoundingClientRect().width;
  if (width > room) word.style.fontSize = `${(parseFloat(getComputedStyle(word).fontSize) * room) / width}px`;
};
fitLoader();
await Promise.all([loadLocale(), fontsOrLate]);
fitLoader();
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
