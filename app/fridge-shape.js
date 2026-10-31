import { api } from "./api.js";
import { placeName, t } from "./i18n.js";
import { chips, esc, numberField, openSheet, showError, toast } from "./ui.js";
import { previewShape, refreshStage } from "./stage.js";

const TYPES = ["MINIBAR", "TOP_FREEZER", "BOTTOM_FREEZER", "SIDE_BY_SIDE", "SINGLE_DOOR"];
const MAX_FREEZER = { MINIBAR: 1, SINGLE_DOOR: 1, TOP_FREEZER: 4, BOTTOM_FREEZER: 4, SIDE_BY_SIDE: 6 };
const NEEDS_FREEZER = ["TOP_FREEZER", "BOTTOM_FREEZER", "SIDE_BY_SIDE"];
const NUMBERS = ["shelves", "doorRacks", "drawers", "freezerShelves", "widthCm", "heightCm", "depthCm"];

// A front view of the fridge with its door open, drawn from the shape: the cold section with its shelves and drawers, the freezer hatched,
// the ice box of a minibar, and the racks on the door at the hinge side. It follows every change in the form.
export function shapeDrawing(shape) {
  const scale = 150 / Math.max(shape.heightCm, shape.widthCm * 1.4);
  const width = shape.widthCm * scale;
  const height = shape.heightCm * scale;
  const door = width * 0.32;
  const left = shape.hinge === "RIGHT" ? 6 : 6 + door + 4;
  const top = 6;
  const parts = [`<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="4" class="body"/>`];
  let cold = { x: left, y: top, w: width, h: height };
  if (shape.type === "TOP_FREEZER" || shape.type === "BOTTOM_FREEZER") {
    const freezerHeight = height * 0.34;
    const freezerY = shape.type === "TOP_FREEZER" ? top : top + height - freezerHeight;
    parts.push(`<rect x="${left}" y="${freezerY}" width="${width}" height="${freezerHeight}" class="freezer"/>`);
    cold = { x: left, y: shape.type === "TOP_FREEZER" ? top + freezerHeight : top, w: width, h: height - freezerHeight };
  } else if (shape.type === "SIDE_BY_SIDE") {
    parts.push(`<rect x="${left}" y="${top}" width="${width * 0.42}" height="${height}" class="freezer"/>`);
    cold = { x: left + width * 0.42, y: top, w: width * 0.58, h: height };
  }
  const icebox = NEEDS_FREEZER.includes(shape.type) || !shape.freezerShelves ? 0 : cold.h * 0.18;
  if (icebox) parts.push(`<rect x="${cold.x + cold.w * 0.12}" y="${cold.y + 4}" width="${cold.w * 0.62}" height="${icebox}" rx="2" class="freezer"/>`);
  const drawerHeight = shape.drawers ? cold.h * 0.18 : 0;
  for (let index = 0; shape.drawers > index; index++) {
    const drawerWidth = (cold.w - 8) / shape.drawers;
    parts.push(`<rect x="${cold.x + 4 + index * drawerWidth}" y="${cold.y + cold.h - drawerHeight - 4}" width="${drawerWidth - 3}" height="${drawerHeight}" rx="2" class="drawer"/>`);
  }
  const shelfTop = cold.y + (icebox ? icebox + 8 : 0);
  const shelfBottom = cold.y + cold.h - drawerHeight - (drawerHeight ? 10 : 4);
  for (let index = 0; shape.shelves > index; index++) {
    const y = shelfTop + ((index + 1) * (shelfBottom - shelfTop)) / (shape.shelves + 1);
    parts.push(`<line x1="${cold.x + 4}" x2="${cold.x + cold.w - 4}" y1="${y}" y2="${y}" class="shelf"/>`);
  }
  const doorX = shape.hinge === "RIGHT" ? left + width + 4 : 6;
  parts.push(`<rect x="${doorX}" y="${cold.y}" width="${door}" height="${cold.h}" rx="4" class="door"/>`);
  for (let index = 0; shape.doorRacks > index; index++) {
    const y = cold.y + (cold.h * (index + 1)) / (shape.doorRacks + 1);
    parts.push(`<line x1="${doorX + 5}" x2="${doorX + door - 5}" y1="${y}" y2="${y}" class="shelf"/>`);
  }
  return `<svg class="shape-drawing" viewBox="0 0 ${width + door + 16} ${height + 12}" role="img" aria-label="${esc(t("fridge-shape.preview"))}">${parts.join("")}</svg>`;
}

function shapeForm(shape, examples) {
  return `<form class="shape-form" data-shape-form novalidate>
    <p class="hint">${t("fridge-shape.lead")}</p>
    ${chips("example", t("fridge-shape.examples"), examples.map((example) => [example.key, t(`fridge-example.${example.key}`)]), null)}
    <div class="shape-preview" data-shape-preview>${shapeDrawing(shape)}</div>
    ${chips("type", t("fridge-shape.type"), TYPES.map((type) => [type, t(`fridge-type.${type}`)]), shape.type)}
    <div class="shape-counts">
      ${numberField({ name: "shelves", label: t("fridge-shape.shelves"), value: shape.shelves, min: 0, max: 6 })}
      ${numberField({ name: "doorRacks", label: t("fridge-shape.racks"), value: shape.doorRacks, min: 0, max: 5 })}
      ${numberField({ name: "drawers", label: t("fridge-shape.drawers"), value: shape.drawers, min: 0, max: 3 })}
      ${numberField({ name: "freezerShelves", label: t("fridge-shape.freezer"), value: shape.freezerShelves, min: 0, max: MAX_FREEZER[shape.type] })}
    </div>
    ${chips("hinge", t("fridge-shape.hinge"), [["LEFT", t("fridge-shape.hinge-left")], ["RIGHT", t("fridge-shape.hinge-right")]], shape.hinge)}
    <fieldset class="shape-size"><legend>${t("fridge-shape.size")}</legend>
      ${numberField({ name: "widthCm", label: t("fridge-shape.width"), unit: "cm", value: shape.widthCm, min: 20, max: 250 })}
      ${numberField({ name: "heightCm", label: t("fridge-shape.height"), unit: "cm", value: shape.heightCm, min: 20, max: 250 })}
      ${numberField({ name: "depthCm", label: t("fridge-shape.depth"), unit: "cm", value: shape.depthCm, min: 20, max: 250 })}
    </fieldset>
    <button class="primary" type="submit">${t("fridge-shape.save")}</button>
  </form>`;
}

function read(form) {
  const data = new FormData(form);
  const shape = { type: data.get("type"), hinge: data.get("hinge") };
  NUMBERS.forEach((name) => (shape[name] = Math.round(Number(data.get(name)) || 0)));
  // A freezer type keeps at least one freezer shelf, and none of them more than its type allows.
  const most = MAX_FREEZER[shape.type];
  shape.freezerShelves = Math.min(most, Math.max(NEEDS_FREEZER.includes(shape.type) ? 1 : 0, shape.freezerShelves));
  return shape;
}

function fill(form, shape) {
  form.querySelector(`input[name=type][value=${shape.type}]`).checked = true;
  form.querySelector(`input[name=hinge][value=${shape.hinge}]`).checked = true;
  NUMBERS.forEach((name) => (form.querySelector(`input[name=${name}]`).value = shape[name]));
}

// The sheet where a household describes its fridge: an example to start from, then its parts and size. Every change redraws the drawing in
// the sheet and the 3D fridge behind it; closing without saving puts the saved shape back.
export async function openFridgeShape(household, fridge, onSaved) {
  const base = `/households/${household.id}/fridges/${fridge.id}`;
  const [shape, examples] = await Promise.all([api(`${base}/shape`), api("/fridge-examples").catch(() => [])]);
  let saved = false;
  const dialog = openSheet(t("fridge-shape.title"), shapeForm(shape, examples), (sheet) => {
    const form = sheet.querySelector("[data-shape-form]");
    const redraw = () => {
      const current = read(form);
      form.querySelector("input[name=freezerShelves]").max = MAX_FREEZER[current.type];
      form.querySelector("[data-shape-preview]").innerHTML = shapeDrawing(current);
      previewShape(current);
    };
    form.addEventListener("input", redraw);
    form.addEventListener("change", (event) => {
      if (event.target.name === "example") {
        const example = examples.find((candidate) => candidate.key === event.target.value);
        if (example) fill(form, example.shape);
      }
      redraw();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api(`${base}/shape`, { method: "PUT", body: read(form) });
        saved = true;
        toast(t("fridge-shape.saved"));
        sheet.close();
        await refreshStage();
        onSaved?.();
      } catch (error) {
        const tray = fridge.children.flatMap((zone) => zone.children.map((child) => ({ zone, child }))).find(({ child }) => child.id === error.problem?.trayId);
        if (tray) {
          showError(form, { message: t("fridge-shape.tray-full", { tray: `${placeName(tray.zone.name)}: ${placeName(tray.child.name)}` }) });
        } else {
          showError(form, error);
        }
      }
    });
  });
  dialog.addEventListener("close", () => {
    if (!saved) previewShape(null);
  });
}
