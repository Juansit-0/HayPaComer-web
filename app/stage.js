import { api } from "./api.js";
import { foodName, formatNumber, t } from "./i18n.js";
import { busy, daysLeft, esc, grams, numberField, openSheet, showError, toast, whenText, wireSteppers } from "./ui.js";

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

async function act(drop) {
  const base = `/households/${household.id}`;
  const food = foodName(drop.item.name);
  if (drop.kind === "move") {
    try {
      await api(`${base}/items/${drop.item.id}/move`, { method: "POST", body: { trayId: drop.trayId } });
      toast(t("stage.moved", { food }));
    } catch (error) {
      toast(error.message);
    }
    changed();
    return;
  }
  const using = drop.kind === "use";
  const dialog = openSheet(
    using ? t("stage.use-title", { food }) : t("stage.discard-title", { food }),
    `<form class="stack" data-drop-form>
      ${
        using
          ? numberField({ name: "grams", label: t("now.grams-used"), unit: "g", value: Math.round(drop.item.grams), min: 1, bigStep: 50 })
          : `<p>${esc(t("stage.discard-lead", { food, grams: grams(drop.item.grams) }))}</p>`
      }
      <button class="primary" type="submit">${using ? t("now.mark-used") : t("fridge.discard")}</button>
    </form>`,
    (sheet) => wireSteppers(sheet),
  );
  dialog.addEventListener("close", changed, { once: true });
  dialog.querySelector("[data-drop-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await busy(event.submitter, () =>
        using
          ? api(`${base}/items/${drop.item.id}/consume`, { method: "POST", body: { grams: Number(new FormData(event.target).get("grams")) } })
          : api(`${base}/items/${drop.item.id}/discard`, { method: "POST" }),
      );
      toast(using ? t("now.toast-used", { grams: grams(new FormData(event.target).get("grams")), food }) : t("fridge.toast-discarded", { food }));
      dialog.close();
    } catch (error) {
      showError(event.target, error);
    }
  });
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
    const move = (moving) => {
      ghost.style.translate = `${moving.clientX - 30}px ${moving.clientY - 24}px`;
      three.showTarget(moving.clientX, moving.clientY);
    };
    move(event);
    chip.addEventListener("pointermove", move);
    chip.addEventListener(
      "pointerup",
      (up) => {
        chip.removeEventListener("pointermove", move);
        const trayId = three.showTarget(up.clientX, up.clientY);
        three.showTarget(null, null);
        ghost.remove();
        ghost = null;
        import("./fridge.js").then(({ openAddFood }) => openAddFood(household, { food: chip.dataset.food, trayId, onDone: changed }));
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
        onPart: (part, data) => {
          if (part === "fridge" && data.trayId) location.hash = `#/fridge/${data.trayId}`;
          else location.hash = `#/${part}`;
        },
      });
      three.goTo(lastRoute);
      palette(element.closest(".stage"), canvas);
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

export function highlightFoods(names) {
  three?.highlight(names);
}

export function showRoute(route) {
  if (!root) return;
  lastRoute = route;
  three?.goTo(route);
  if (route !== "chef") three?.highlight([]);
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
  const [fridges, listed, metrics, catalog] = await Promise.all([
    api(`${base}/fridges`).catch(() => []),
    api(`${base}/inventory`).catch(() => []),
    api(`${base}/analytics?from=${day(from)}&to=${day(to)}`).catch(() => null),
    api("/foods?q=").catch(() => []),
  ]);
  const categories = new Map(catalog.map((food) => [food.name.toLowerCase(), food.category]));
  const inventory = listed.map((item) => ({ ...item, category: categories.get(item.name.toLowerCase()), days: daysLeft(item.expiresOn) }));
  const fridge = fridges[0];
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
