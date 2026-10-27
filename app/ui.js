import { foodName, formatNumber, plural, t } from "./i18n.js";
import { easing, reduced, token } from "./motion.js";
import { play } from "./sound.js";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

const KEYED = "[data-key]";
const onScreen = (rect) => rect.width > 0 && rect.bottom > 0 && innerHeight > rect.top;

// Re-render in place: keyed items that moved slide from where they were, new ones grow in, removed ones fade out as inert copies, focus stays.
export async function swap(root, update) {
  const still = reduced();
  const active = root.contains(document.activeElement) ? document.activeElement : null;
  const focusId = active?.id;
  const focusKey = active?.closest(KEYED)?.dataset.key;
  const before = new Map();
  if (!still) {
    for (const element of root.querySelectorAll(KEYED)) {
      if (before.size >= 60) break;
      const rect = element.getBoundingClientRect();
      if (onScreen(rect)) before.set(element.dataset.key, { rect, ghost: element.cloneNode(true) });
    }
  }
  await update();
  const target = (focusId && document.getElementById(focusId)) || (focusKey && root.querySelector(`[data-key="${CSS.escape(focusKey)}"]`));
  if (target && root.contains(target)) target.focus({ preventScroll: true });
  if (still) return;
  const spring = easing("ease-spring");
  const kept = new Set();
  root.querySelectorAll(KEYED).forEach((element) => {
    kept.add(element.dataset.key);
    const old = before.get(element.dataset.key);
    const rect = element.getBoundingClientRect();
    if (!onScreen(rect)) return;
    if (!old) {
      element.animate([{ opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1 }], { duration: token("duration-base"), easing: spring });
      return;
    }
    const dx = old.rect.left - rect.left;
    const dy = old.rect.top - rect.top;
    if (Math.abs(dx) + Math.abs(dy) >= 1) element.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: token("duration-slow"), easing: spring });
  });
  before.forEach(({ rect, ghost }, key) => {
    if (kept.has(key)) return;
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    [ghost, ...ghost.querySelectorAll("[id]")].forEach((node) => node.removeAttribute("id"));
    Object.assign(ghost.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", pointerEvents: "none", zIndex: "5", listStyle: "none" });
    document.body.append(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0, scale: 0.96 }], { duration: token("duration-withdraw"), easing: easing("ease-exit"), fill: "forwards" }).finished.finally(() => ghost.remove());
  });
}

const DIGITS = "0123456789";

export function ticker(element, text) {
  const value = String(text);
  if (!element.querySelector(".ticker")) element.innerHTML = `<span class="visually-hidden"></span><span class="ticker" aria-hidden="true"></span>`;
  element.querySelector(".visually-hidden").textContent = value;
  const roll = element.querySelector(".ticker");
  const chars = [...value];
  const kept = roll.children.length === chars.length && chars.every((char, index) => DIGITS.includes(char) === roll.children[index].classList.contains("tick-digit"));
  if (!kept) {
    roll.innerHTML = chars
      .map((char) => (DIGITS.includes(char) ? `<span class="tick-digit"><span>${[...DIGITS].join("<br>")}</span></span>` : `<span>${esc(char)}</span>`))
      .join("");
  }
  [...roll.children].forEach((slot, index) => {
    if (!slot.classList.contains("tick-digit")) {
      slot.textContent = chars[index];
      return;
    }
    const column = slot.firstElementChild;
    const target = `0 ${-Number(chars[index])}em`;
    if (!kept) column.animate([{ translate: "0 0" }, { translate: target }], { duration: token("duration-shutter"), easing: easing("ease-emphasized") });
    column.style.translate = target;
  });
}

export function grams(value) {
  const number = Number(value);
  if (number >= 1000) return `${formatNumber(number / 1000, number % 1000 === 0 ? 0 : 2)} kg`;
  return `${formatNumber(Math.round(number))} g`;
}

export function daysLeft(isoDate) {
  if (!isoDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(`${isoDate}T00:00:00`);
  return Math.round((day - today) / 86400000);
}

export function whenText(isoDate) {
  const days = daysLeft(isoDate);
  if (days === null) return t("expiry.none");
  if (days < 0) return days === -1 ? t("expiry.yesterday") : plural("expiry.ago", -days);
  if (days === 0) return t("expiry.today");
  if (days === 1) return t("expiry.tomorrow");
  return plural("expiry.in", days);
}

export function expiryText(item) {
  const text = whenText(item.expiresOn);
  if (!item.expiresOn) return text;
  if (item.expirySource === "ESTIMATED" || item.expirySource === "AI_SUGGESTED") {
    return `\u2248\u2009${text} (${t("expiry.estimated")})`;
  }
  if (item.expirySource === "LABEL") return `${text} (${t("expiry.label")})`;
  return text;
}

const STATUS = {
  EXPIRED: ["attention", "status.expired"],
  UNDER_REVIEW: ["attention", "status.under-review"],
  AT_RISK: ["attention", "status.at-risk"],
  LEFTOVER: ["attention", "status.leftover"],
  PRIVATE: ["quiet", "status.private"],
  ASK_FIRST: ["quiet", "status.ask-first"],
};

const ORDER = ["EXPIRED", "UNDER_REVIEW", "AT_RISK", "LEFTOVER", "PRIVATE", "ASK_FIRST"];

export function statusPill(statuses = []) {
  const key = ORDER.find((status) => statuses.includes(status));
  if (!key) return `<span class="status">${t("status.fresh")}</span>`;
  const [tone, label] = STATUS[key];
  return `<span class="status ${tone}">${t(label)}</span>`;
}

export function toast(message, action) {
  const element = document.querySelector("[data-toast]");
  element.textContent = message;
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      element.classList.remove("visible");
      action.run();
    }, { once: true });
    element.append(button);
  }
  element.classList.toggle("has-action", Boolean(action));
  element.classList.add("visible");
  play("pop");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), action ? 6000 : 3200);
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function errorText(error) {
  if (error?.problem?.errors) {
    return Object.entries(error.problem.errors)
      .map(([field, message]) => `${field} ${message}`)
      .join(". ");
  }
  return error?.message || t("error.generic");
}

export function showError(form, error) {
  let box = form.querySelector(".error");
  if (!box) {
    box = document.createElement("p");
    box.className = "error";
    box.setAttribute("role", "alert");
    form.append(box);
  }
  box.textContent = errorText(error);
}

export function foodOptions(id) {
  return `<datalist id="${id}"></datalist>`;
}

export function wireFoodSearch(input, api) {
  const list = document.getElementById(input.getAttribute("list"));
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) return;
    timer = setTimeout(async () => {
      const foods = await api(`/foods?q=${encodeURIComponent(query)}`);
      list.innerHTML = foods
        .map((food) => `<option value="${esc(food.name)}" label="${esc(foodName(food.name))}"></option>`)
        .join("");
    }, 200);
  });
}

export function kpi(value, label, tone = "") {
  return `<div class="kpi ${tone}"><span class="value">${value}</span><span class="label">${esc(label)}</span></div>`;
}

export function numberField({ name, label, unit, value = "", min = 0, max, step = 1, bigStep, money = false, hint, required = true }) {
  const id = `field-${name}-${Math.random().toString(36).slice(2, 8)}`;
  return `<div class="number-field">
    <label for="${id}">${esc(label)}</label>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
    <div class="number-input" data-stepper>
      <button type="button" data-step="-1" aria-label="${esc(t("stepper.less", { label }))}">−</button>
      <input id="${id}" class="${money ? "money" : "grams"}" name="${esc(name)}" type="number" inputmode="${step < 1 ? "decimal" : "numeric"}" min="${min}" ${max === undefined ? "" : `max="${max}"`} step="${step}" ${bigStep ? `data-big-step="${bigStep}"` : ""} value="${esc(value)}" ${required ? "required" : ""}>
      ${unit ? `<span class="unit" aria-hidden="true">${esc(unit)}</span>` : ""}
      <button type="button" data-step="1" aria-label="${esc(t("stepper.more", { label }))}">+</button>
    </div>
  </div>`;
}

export function moneyField({ name, label, currency, value = "", step = 10000, hint }) {
  const id = `field-${name}-${Math.random().toString(36).slice(2, 8)}`;
  const shown = value === "" ? "" : formatNumber(value);
  return `<div class="number-field">
    <label for="${id}">${esc(label)}</label>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
    <div class="number-input" data-stepper>
      <button type="button" data-step="-1" aria-label="${esc(t("stepper.less", { label }))}">\u2212</button>
      <input id="${id}" class="money" name="${esc(name)}" type="text" inputmode="numeric" autocomplete="off" data-money data-big-step="${step}" value="${esc(shown)}" required>
      <span class="unit" aria-hidden="true">${esc(currency)}</span>
      <button type="button" data-step="1" aria-label="${esc(t("stepper.more", { label }))}">+</button>
    </div>
  </div>`;
}

export function moneyValue(text) {
  const digits = String(text ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function wireSteppers(root) {
  root.querySelectorAll("[data-stepper]").forEach((box) => {
    const input = box.querySelector("input");
    const money = input.hasAttribute("data-money");
    if (money) {
      input.addEventListener("input", () => {
        const amount = moneyValue(input.value);
        input.value = amount ? formatNumber(amount) : "";
      });
    }
    box.querySelectorAll("[data-step]").forEach((button) => {
      button.addEventListener("click", () => {
        const step = Number(input.step) || 1;
        const big = Number(input.dataset.bigStep) || step;
        const current = money ? moneyValue(input.value) : Number(input.value) || 0;
        const next = current + Number(button.dataset.step) * big;
        const min = input.min === "" ? -Infinity : Number(input.min);
        const max = input.max === "" ? Infinity : Number(input.max);
        const bounded = Math.min(max, Math.max(min, next));
        input.value = money ? formatNumber(Math.max(0, bounded)) : String(bounded);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  });
}

export function chips(name, legend, options, selected) {
  return `<fieldset class="chips"><legend>${esc(legend)}</legend>${options
    .map(
      ([value, text]) => `<label class="chip"><input type="radio" name="${esc(name)}" value="${esc(value)}" ${
        value === selected ? "checked" : ""
      }><span>${esc(text)}</span></label>`,
    )
    .join("")}</fieldset>`;
}

export function dateField({ name, label, value = "", unknownLabel = t("field.unknown-date") }) {
  const id = `field-${name}-${Math.random().toString(36).slice(2, 8)}`;
  return `<div class="date-field" data-date-field>
    <label for="${id}">${esc(label)}</label>
    <div class="row-form">
      <input id="${id}" name="${esc(name)}" type="date" value="${esc(value)}">
      <label class="check"><input type="checkbox" data-unknown>${esc(unknownLabel)}</label>
    </div>
  </div>`;
}

export function wireDateFields(root) {
  root.querySelectorAll("[data-date-field]").forEach((field) => {
    const date = field.querySelector('input[type="date"]');
    field.querySelector("[data-unknown]").addEventListener("change", (event) => {
      date.disabled = event.target.checked;
      if (event.target.checked) date.value = "";
    });
  });
}

const sheetMotion = () => !reduced();
const cssValue = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const compactSheet = () => matchMedia("(max-width: 760px)").matches;

// Every way out (close button, backdrop, Esc, a finished form) plays the exit before the dialog really closes.
export function closeSheet(dialog) {
  if (!dialog.open || dialog.dataset.closing) return;
  dialog.dispatchEvent(new Event("closing"));
  const shut = () => HTMLDialogElement.prototype.close.call(dialog);
  if (!sheetMotion()) return shut();
  dialog.dataset.closing = "";
  const duration = parseFloat(cssValue("--duration-withdraw")) || 180;
  const easing = cssValue("--ease-exit") || "ease-in";
  dialog.animate({ opacity: [1, 0] }, { duration, easing, pseudoElement: "::backdrop", fill: "forwards" });
  dialog
    .animate([{ translate: "0 0", opacity: 1 }, { translate: compactSheet() ? "0 100%" : "0 24px", opacity: compactSheet() ? 1 : 0 }], { duration, easing, fill: "forwards" })
    .finished.finally(shut);
}

export function openSheet(title, body, onReady) {
  const dialog = document.createElement("dialog");
  dialog.className = "sheet";
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `<div><div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="ghost" data-close>${t("action.close")}</button></div>${body}</div>`;
  document.body.append(dialog);
  dialog.close = () => closeSheet(dialog);
  dialog.querySelector("[data-close]").addEventListener("click", () => closeSheet(dialog));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSheet(dialog);
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeSheet(dialog);
  });
  wireSteppers(dialog);
  wireDateFields(dialog);
  dialog.showModal();
  if (sheetMotion()) {
    const duration = parseFloat(cssValue("--duration-spring")) || 745;
    dialog.animate({ opacity: [0, 1] }, { duration: duration / 2, easing: "ease-out", pseudoElement: "::backdrop" });
    dialog.animate([{ translate: compactSheet() ? "0 100%" : "0 24px", opacity: compactSheet() ? 1 : 0 }, { translate: "0 0", opacity: 1 }], { duration, easing: cssValue("--ease-spring") || "ease-out" });
  }
  onReady?.(dialog);
  return dialog;
}

const SKELETONS = {
  now: [[7, 340], [5, 340], [4], [4], [4]],
  fridge: [[5, 520], [7, 520]],
  market: [[5, 300], [7, 300], [12]],
  numbers: [[12, 280], [8, 300], [4, 300]],
  chef: [[8, 460], [4, 460]],
  settings: [[7, 360], [5, 360], [12]],
};

export function skeleton(route, title) {
  const tiles = (SKELETONS[route] ?? SKELETONS.now)
    .map(
      ([width, height], index) => `<div class="skel w-${width}" style="--i:${index};--h:${height ?? 220}px">
        <span class="skel-line big"></span><span class="skel-line mid"></span><span class="skel-line short"></span>
      </div>`,
    )
    .join("");
  return `<header><h1>${esc(title)}</h1></header><div class="bento skeleton-screen" aria-hidden="true">${tiles}</div>`;
}

export async function busy(button, task) {
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

const holding = new WeakMap();
const holdValue = (button) => parseFloat(getComputedStyle(button).getPropertyValue("--hold")) || 0;

// The fill runs on --duration-hold, which reduced motion never zeroes; the press completes only when it finishes.
function startHold(button) {
  if (button.disabled || holding.has(button)) return;
  const from = holdValue(button);
  const run = button.animate([{ "--hold": from }, { "--hold": 1 }], { duration: token("duration-hold") * (1 - from), easing: "linear", fill: "forwards" });
  holding.set(button, run);
  run.finished.then(
    () => {
      if (holding.get(button) !== run) return;
      holding.delete(button);
      run.cancel();
      stamp(button);
      button.dataset.held = "true";
      button.click();
    },
    () => null,
  );
}

function stopHold(button) {
  const run = holding.get(button);
  if (!run) return;
  holding.delete(button);
  const from = holdValue(button);
  run.cancel();
  if (from > 0) button.animate([{ "--hold": from }, { "--hold": 0 }], { duration: token("duration-withdraw") || 1, easing: "ease-out" });
}

function stamp(button) {
  navigator.vibrate?.(12);
  play("stamp");
  if (reduced()) button.animate([{ filter: "none" }, { filter: "brightness(0.82)" }, { filter: "none" }], { duration: token("duration-slow") || 1 });
  else button.animate([{ scale: 1 }, { scale: 0.94 }, { scale: 1.04 }, { scale: 1 }], { duration: token("duration-slow"), easing: easing("ease-spring") });
}

const holdTarget = (event) => event.target.closest?.("[data-hold]");
document.addEventListener("pointerdown", (event) => holdTarget(event) && startHold(holdTarget(event)));
["pointerup", "pointerleave", "pointercancel"].forEach((type) =>
  document.addEventListener(type, (event) => holdTarget(event) && stopHold(holdTarget(event)), true),
);
document.addEventListener("keydown", (event) => {
  const button = holdTarget(event);
  if (!button || (event.key !== " " && event.key !== "Enter")) return;
  event.preventDefault();
  if (!event.repeat) startHold(button);
});
document.addEventListener("keyup", (event) => {
  const button = holdTarget(event);
  if (button && (event.key === " " || event.key === "Enter")) stopHold(button);
});
document.addEventListener(
  "click",
  (event) => {
    const button = holdTarget(event);
    if (!button) return;
    if (button.dataset.held) {
      delete button.dataset.held;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    toast(t("hold.hint"));
  },
  true,
);
