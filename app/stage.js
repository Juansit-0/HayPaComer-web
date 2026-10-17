import { api } from "./api.js";
import { foodName, formatNumber, t } from "./i18n.js";
import { daysLeft, esc, grams, openSheet, toast, whenText } from "./ui.js";

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
let three = null;
let threeReady = null;
let lastRoute = "now";
let household = null;
let pending = null;
let currentFridge = null;
let zones = null;
let focusRequest = null;

export function shapeClass(name) {
  return `food f-${(SHAPES[name] ?? "otro").split(" ").join(" f-")}`;
}

function food(item) {
  return `<i class="${shapeClass(item.name)}" title="${esc(`${foodName(item.name)}, ${grams(item.grams)}`)}"></i>`;
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
    if (tray && slot.tagName === "A") slot.setAttribute("href", `#/fridge/${tray.id}`);
    slot.setAttribute("aria-label", `${t("nav.fridge")}${tray ? `: ${grams(tray.grams)}` : ""}`);
  });
  root.querySelector("[data-celsius]").textContent =
    twin?.celsius === null || twin?.celsius === undefined ? "--" : `${formatNumber(twin.celsius, 1)} °C`;
  root.querySelector("[data-rings]").innerHTML = rings(week);
  root.querySelector("[data-rescued]").textContent = grams(week?.rescuedGrams ?? 0);
  root.querySelector(".fridge").classList.toggle("door-alarm", Boolean(twin?.doorOpen));
}

function wantsThree() {
  if (!matchMedia("(min-width: 1024px)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

const PALETTE = ["Tomato", "Egg", "Milk", "Chicken breast", "Potato", "Carrot", "Avocado", "Cheese", "Yogurt", "Banana"];

function changed() {
  refreshStage();
  window.dispatchEvent(new CustomEvent("hpc:inventory-changed"));
}

// shortcut: a typical pack per food so a drop needs no typing, the user adjusts later on the Fridge screen
const PACK_GRAMS = { Tomato: 500, Egg: 360, Milk: 1000, "Chicken breast": 500, Potato: 1000, Carrot: 500, Avocado: 400, Cheese: 250, Yogurt: 150, Banana: 600 };
const SHARES = [1, 0.5, 0.25];

async function undoable(task, message) {
  const base = `/households/${household.id}`;
  try {
    await task();
    toast(message, {
      label: t("stage.undo"),
      run: async () => {
        await api(`${base}/inventory/undo`, { method: "POST" }).catch((error) => toast(error.message));
        changed();
      },
    });
  } catch (error) {
    toast(error.message);
  }
  changed();
}

async function quickAdd(food, trayId) {
  const fridge = currentFridge;
  if (!fridge || !trayId) return;
  const amount = PACK_GRAMS[food] ?? 250;
  await undoable(
    () => api(`/households/${household.id}/items`, { method: "POST", body: { fridgeId: fridge.id, trayId, food, grams: amount, opened: false, expiresOn: null, expirySource: null } }),
    t("fridge.toast-added", { grams: grams(amount), food: foodName(food) }),
  );
}

async function act(drop) {
  const base = `/households/${household.id}`;
  const food = foodName(drop.item.name);
  if (drop.kind === "move") {
    await undoable(() => api(`${base}/items/${drop.item.id}/move`, { method: "POST", body: { trayId: drop.trayId } }), t("stage.moved", { food }));
    return;
  }
  if (drop.kind === "discard") {
    await undoable(() => api(`${base}/items/${drop.item.id}/discard`, { method: "POST" }), t("fridge.toast-discarded", { food }));
    return;
  }
  const total = Number(drop.item.grams);
  const dialog = openSheet(
    t("stage.use-title", { food }),
    `<div class="use-shares" data-shares>${SHARES.map(
      (share) => `<button type="button" class="use-share" data-grams="${Math.max(1, Math.round(total * share))}">
        <span class="use-share-name">${t(`stage.share.${share * 100}`)}</span><span class="data">${grams(Math.max(1, Math.round(total * share)))}</span>
      </button>`,
    ).join("")}</div>`,
  );
  let used = false;
  dialog.addEventListener("close", () => used || changed(), { once: true });
  dialog.querySelectorAll("[data-grams]").forEach((button) =>
    button.addEventListener("click", async () => {
      used = true;
      const amount = Number(button.dataset.grams);
      dialog.close();
      await undoable(
        () => api(`${base}/items/${drop.item.id}/consume`, { method: "POST", body: { grams: amount } }),
        t("now.toast-used", { grams: grams(amount), food }),
      );
    }),
  );
}

function palette(stageBox, canvas) {
  const tray = document.createElement("div");
  tray.className = "stage-palette";
  tray.innerHTML = `<p class="hint">${t("stage.palette")}</p>
    <div class="palette-chips">${PALETTE.map((name) => `<button type="button" class="palette-chip" data-food="${esc(name)}"><i class="${shapeClass(name)}" aria-hidden="true"></i>${esc(foodName(name))}</button>`).join("")}
      <form class="palette-other" data-other><label class="visually-hidden" for="palette-other">${t("stage.other")}</label><input id="palette-other" name="name" maxlength="60" autocomplete="off" placeholder="${esc(t("stage.other"))}"></form>
    </div>`;
  canvas.after(tray);
  let ghost = null;
  tray.addEventListener("pointerdown", (event) => {
    const chip = event.target.closest("[data-food]");
    if (!chip || !three) return;
    event.preventDefault();
    chip.setPointerCapture(event.pointerId);
    ghost = chip.cloneNode(true);
    ghost.classList.add("palette-ghost");
    document.body.append(ghost);
    const start = { x: event.clientX, y: event.clientY };
    let dragged = false;
    const move = (moving) => {
      dragged ||= Math.hypot(moving.clientX - start.x, moving.clientY - start.y) > 6;
      const over = three.showTarget(moving.clientX, moving.clientY, chip.dataset.food, PACK_GRAMS[chip.dataset.food]);
      ghost.style.translate = `${moving.clientX - 30}px ${moving.clientY - 24}px`;
      ghost.classList.toggle("landing", Boolean(over));
    };
    move(event);
    chip.addEventListener("pointermove", move);
    chip.addEventListener(
      "pointerup",
      (up) => {
        chip.removeEventListener("pointermove", move);
        const trayId = three.showTarget(up.clientX, up.clientY, chip.dataset.food, PACK_GRAMS[chip.dataset.food]);
        three.showTarget(null, null);
        ghost.remove();
        ghost = null;
        if (dragged) quickAdd(chip.dataset.food, trayId);
        else import("./fridge.js").then(({ openAddFood }) => openAddFood(household, { food: chip.dataset.food, onDone: changed }));
      },
      { once: true },
    );
  });
  tray.querySelector("[data-other]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = event.target.elements.name;
    const name = input.value.trim();
    if (!name) return;
    input.disabled = true;
    try {
      const food = await api(`/households/${household.id}/foods`, { method: "POST", body: { name } });
      input.value = "";
      tray.querySelector(".palette-chips").insertAdjacentHTML(
        "afterbegin",
        `<button type="button" class="palette-chip" data-food="${esc(food.name)}"><i class="${shapeClass(food.name)}" aria-hidden="true"></i>${esc(foodName(food.name))}</button>`,
      );
      toast(t("add.learned", { food: foodName(food.name) }));
    } catch (error) {
      toast(error.message);
    } finally {
      input.disabled = false;
    }
  });
}

function mountThree(element) {
  const canvas = document.createElement("canvas");
  canvas.className = "stage-canvas";
  canvas.setAttribute("aria-hidden", "true");
  element.after(canvas);
  element.closest(".stage").classList.add("has-three");
  threeReady = import("./stage3d.js")
    .then(({ createFridgeScene }) => {
      three = createFridgeScene(canvas, {
        labels: { market: t("nav.market") },
        describe: (item) => (item.days !== null && 2 >= item.days ? `${grams(item.grams)}, ${whenText(item.expiresOn)}` : grams(item.grams)),
        onDrop: act,
        zoneAt: (x, y) => {
          if (!zones?.classList.contains("open")) return null;
          let found = null;
          zones?.querySelectorAll("[data-zone]").forEach((zone) => {
            const box = zone.getBoundingClientRect();
            const over = x >= box.left && box.right >= x && y >= box.top && box.bottom >= y;
            zone.classList.toggle("over", over);
            if (over) found = zone.dataset.zone;
          });
          return found;
        },
        onDragging: (on) => {
          zones?.classList.toggle("open", on);
          if (!on) zones?.querySelectorAll(".over").forEach((zone) => zone.classList.remove("over"));
        },
        onPart: (part, data) => {
          if (part === "fridge" && data.itemId) focusRequest = data.itemId;
          if (part === "fridge" && data.trayId) {
            const target = `#/fridge/${data.trayId}`;
            if (location.hash === target) window.dispatchEvent(new CustomEvent("hpc:focus-item"));
            else location.hash = target;
          }
          else location.hash = `#/${part}`;
        },
      });
      three.goTo(lastRoute);
      palette(element.closest(".stage"), canvas);
      zones = document.createElement("div");
      zones.className = "stage-zones";
      zones.setAttribute("aria-hidden", "true");
      zones.innerHTML = `<span data-zone="use">${t("fridge.use")}</span><span data-zone="discard">${t("fridge.discard")}</span>`;
      canvas.after(zones);
      return three;
    })
    .catch(() => {
      canvas.remove();
      element.closest(".stage").classList.remove("has-three");
      return null;
    });
}

export function mountStage(element) {
  root = element;
  root.innerHTML = markup();
  if (wantsThree()) mountThree(element);
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

export function takeFocusRequest() {
  const itemId = focusRequest;
  focusRequest = null;
  return itemId;
}

export function focusFood(itemId) {
  three?.focus(itemId);
}

export function highlightFoods(names) {
  three?.highlight(names);
}

export function showRoute(route) {
  if (!root) return;
  lastRoute = route;
  three?.goTo(route);
  if (route !== "chef") three?.highlight([]);
  if (route !== "fridge") three?.focus(null);
  root.dataset.route = route;
  root.closest(".stage").dataset.route = route;
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
  const [fridges, listed, metrics, catalog] = await Promise.all([
    api(`${base}/fridges`).catch(() => []),
    api(`${base}/inventory`).catch(() => []),
    api(`${base}/analytics?from=${day(from)}&to=${day(to)}`).catch(() => null),
    api("/foods?q=").catch(() => []),
  ]);
  const categories = new Map(catalog.map((food) => [food.name.toLowerCase(), food.category]));
  const inventory = listed.map((item) => ({ ...item, category: categories.get(item.name.toLowerCase()), days: daysLeft(item.expiresOn) }));
  const fridge = fridges[0];
  currentFridge = fridge;
  const twin = fridge ? await api(`${base}/fridges/${fridge.id}/twin`).catch(() => null) : null;
  fill(fridge, inventory, twin, metrics?.total);
  const scene = await threeReady;
  if (scene) {
    const week = metrics?.total;
    const moved = Number(week?.consumedGrams ?? 0) + Number(week?.discardedGrams ?? 0);
    scene.placeItems(fridge, inventory);
    scene.setStatus(twin);
    scene.setRings(
      moved > 0
        ? [Number(week.consumedGrams) / moved, Number(week.rescuedGrams) / Math.max(1, Number(week.consumedGrams)), Number(week.discardedGrams) / moved]
        : [0, 0, 0],
      ["eaten", "rescued", "wasted"].map((ring, index) =>
        t(`numbers.ring.${ring}-short`, { grams: grams([week?.consumedGrams, week?.rescuedGrams, week?.discardedGrams][index] ?? 0) }),
      ),
    );
  }
}

export function refreshStageSoon() {
  clearTimeout(pending);
  pending = setTimeout(() => refreshStage(), 500);
}
