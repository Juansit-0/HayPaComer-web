import { api } from "./api.js";
import { foodName, formatNumber, t } from "./i18n.js";
import { esc, grams } from "./ui.js";

const SHAPES = {
  Arepa: "arepa",
  Avocado: "aguacate",
  Banana: "banano",
  "Black beans": "frasco oscuro",
  Bread: "pan",
  Butter: "mantequilla",
  Carrot: "zanahoria",
  Cheese: "queso",
  "Chicken breast": "pollo",
  Egg: "huevo",
  "Ground beef": "carne",
  Lentils: "frasco",
  Milk: "leche",
  Onion: "cebolla",
  "Orange juice": "jugo",
  Pasta: "caja",
  Plantain: "platano",
  Potato: "papa",
  Rice: "bolsa",
  Soup: "olla",
  "Soy sauce": "botella oscura",
  Tomato: "tomate",
  Tuna: "lata",
  Yogurt: "yogur",
};
const PARTS = [
  ["chef", "book"],
  ["numbers", "freezer"],
  ["fridge", "shelf"],
  ["settings", "knob"],
  ["now", "door"],
  ["market", "note"],
];
const MAX_FOODS = 5;

let root = null;
let household = null;
let pending = null;

function food(item) {
  const shape = SHAPES[item.name] ?? "otro";
  return `<i class="food f-${shape.split(" ").join(" f-")}" title="${esc(`${foodName(item.name)}, ${grams(item.grams)}`)}"></i>`;
}

function foods(items) {
  return items.slice(0, MAX_FOODS).map(food).join("");
}

function rings(week) {
  const total = Number(week?.consumedGrams ?? 0) + Number(week?.discardedGrams ?? 0);
  const share = (value, of) => (of > 0 ? Math.min(1, Number(value) / of) : 0);
  const arcs = [
    [27, share(week?.consumedGrams, total), "eaten"],
    [18, share(week?.rescuedGrams, Number(week?.consumedGrams ?? 0)), "rescued"],
    [9, share(week?.discardedGrams, total), "wasted"],
  ];
  return `<svg class="rings" viewBox="0 0 64 64" aria-hidden="true">${arcs
    .map(([r, part, kind]) => {
      const length = 2 * Math.PI * r;
      return `<circle class="ring-bg" cx="32" cy="32" r="${r}"/><circle class="ring ${kind}" cx="32" cy="32" r="${r}" style="--len:${length.toFixed(1)};--to:${(length * (1 - part)).toFixed(1)}"/>`;
    })
    .join("")}</svg>`;
}

function markup() {
  return `<div class="fridge" data-fridge>
    <span class="face back"></span><span class="face side"></span><span class="face side l"></span><span class="face lid"></span>
    <a class="part book" href="#/chef" data-part="chef"><span class="part-name">${t("nav.chef")}</span></a>
    <a class="part freezer" href="#/numbers" data-part="numbers">
      <span data-rings>${rings(null)}</span>
      <span class="freezer-text"><b data-rescued>0 g</b><small>${t("nav.numbers")}</small></span>
      <span class="handle"></span>
    </a>
    <div class="cabin">
      <a class="part shelf" href="#/fridge" data-part="fridge" data-zone="SHELF" data-index="0"></a>
      <a class="part shelf" href="#/fridge" data-part="fridge" data-zone="SHELF" data-index="1"></a>
      <a class="part shelf" href="#/fridge" data-part="fridge" data-zone="SHELF" data-index="2"></a>
      <a class="part shelf drawer" href="#/fridge" data-part="fridge" data-zone="DRAWER" data-index="0"></a>
      <a class="part knob" href="#/settings" data-part="settings"><i></i><span data-celsius>--</span></a>
      <span class="light"></span>
    </div>
    <a class="part door" href="#/now" data-part="now">
      <span class="door-outer"><span class="handle"></span></span>
      <span class="door-inner"><span class="rack" data-zone="DOOR" data-index="0"></span><span class="rack" data-zone="DOOR" data-index="1"></span><span class="rack" data-zone="DOOR" data-index="2"></span></span>
    </a>
    <a class="part note" href="#/market" data-part="market"><span></span><span></span><span></span><span class="part-name">${t("nav.market")}</span></a>
  </div>`;
}

function fill(fridge, inventory, twin, week) {
  const zones = fridge?.children ?? [];
  root.querySelectorAll("[data-zone]").forEach((slot) => {
    const zone = zones.filter((candidate) => (candidate.kind ?? "SHELF") === slot.dataset.zone);
    const trays = zone.flatMap((candidate) => candidate.children);
    const tray = trays[Number(slot.dataset.index)];
    const items = tray ? inventory.filter((item) => item.trayId === tray.id) : [];
    slot.innerHTML = `${foods(items)}${tray && slot.classList.contains("shelf") ? `<span class="shelf-grams">${grams(tray.grams)}</span>` : ""}`;
    slot.dataset.tray = tray?.id ?? "";
    slot.setAttribute("aria-label", `${t("nav.fridge")}${tray ? `: ${grams(tray.grams)}` : ""}`);
  });
  root.querySelector("[data-celsius]").textContent =
    twin?.celsius === null || twin?.celsius === undefined ? "--" : `${formatNumber(twin.celsius, 1)} °C`;
  root.querySelector("[data-rings]").innerHTML = rings(week);
  root.querySelector("[data-rescued]").textContent = grams(week?.rescuedGrams ?? 0);
  root.querySelector(".fridge").classList.toggle("door-alarm", Boolean(twin?.doorOpen));
}

export function mountStage(element) {
  root = element;
  root.innerHTML = markup();
  const resize = () => {
    const box = root.getBoundingClientRect();
    root.style.setProperty("--fit", Math.max(0.5, Math.min(box.width / 480, (box.height - 60) / 560, 1.5)).toFixed(3));
  };
  new ResizeObserver(resize).observe(root);
  const box = root.closest(".stage");
  window.addEventListener("scroll", () => box.classList.toggle("compact", window.scrollY > 160), { passive: true });
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.addEventListener("pointermove", (event) => {
      const box = root.getBoundingClientRect();
      root.style.setProperty("--tilt-x", ((event.clientX - box.left) / box.width - 0.5).toFixed(3));
      root.style.setProperty("--tilt-y", ((event.clientY - box.top) / box.height - 0.5).toFixed(3));
    });
    root.addEventListener("pointerleave", () => {
      root.style.setProperty("--tilt-x", 0);
      root.style.setProperty("--tilt-y", 0);
    });
  }
}

export function showRoute(route) {
  if (!root) return;
  root.dataset.route = route;
  root.querySelectorAll("[data-part]").forEach((part) => {
    if (part.dataset.part === route) part.setAttribute("aria-current", "page");
    else part.removeAttribute("aria-current");
  });
}

export async function refreshStage(chosen) {
  if (!root) return;
  household = chosen ?? household;
  if (!household) return;
  clearTimeout(pending);
  const base = `/households/${household.id}`;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  const day = (date) => date.toLocaleDateString("en-CA");
  const [fridges, inventory, metrics] = await Promise.all([
    api(`${base}/fridges`).catch(() => []),
    api(`${base}/inventory`).catch(() => []),
    api(`${base}/analytics?from=${day(from)}&to=${day(to)}`).catch(() => null),
  ]);
  const fridge = fridges[0];
  const twin = fridge ? await api(`${base}/fridges/${fridge.id}/twin`).catch(() => null) : null;
  fill(fridge, inventory, twin, metrics?.total);
}

export function refreshStageSoon() {
  clearTimeout(pending);
  pending = setTimeout(() => refreshStage(), 500);
}
