import * as THREE from "./vendor/three.module.min.js";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";
import { boil, css, engrave, foodModel, group, hash, lathe, mesh, outline, paint, sized } from "./engrave.js";
import { buildKitchen } from "./stage/kitchen.js";
import { damp, loop, onReduced, reduced as prefersReduced, SPRINGS, springConstants, springStep } from "./motion.js";

const T = 0.035;
const DOOR_OPEN = -1.92;
// The fridge drawn before the household's shape arrives: the tall top-freezer the app always showed.
const DEFAULT_SHAPE = { type: "TOP_FREEZER", shelves: 3, doorRacks: 3, drawers: 1, freezerShelves: 1, hinge: "LEFT", widthCm: 72, heightCm: 170, depthCm: 66 };
// The fridge's right side stays next to the counter (kitchen.js starts it at 0.42); a wider or narrower fridge grows to the left.
const RIGHT_EDGE = 0.36;

// Where every part of a fridge goes, in metres, from the shape the household described: the fridge and freezer sections, the shelves
// spread evenly above the drawers, the racks along the door, and an ice box inside a fridge with no freezer door.
export function fridgeGeometry(shape = DEFAULT_SHAPE) {
  const W = Math.min(1.1, Math.max(0.4, shape.widthCm / 100));
  const H = Math.min(2.1, Math.max(0.5, shape.heightCm / 100));
  const D = Math.min(0.85, Math.max(0.4, shape.depthCm / 100));
  const base = 0.04;
  let cold = { x0: -W / 2, x1: W / 2, y0: base, y1: H };
  let freezer = null;
  let icebox = 0;
  if (shape.type === "TOP_FREEZER") {
    const split = base + (H - base) * 0.66;
    cold = { ...cold, y1: split };
    freezer = { x0: -W / 2, x1: W / 2, y0: split + T, y1: H, divider: "y", at: split };
  } else if (shape.type === "BOTTOM_FREEZER") {
    const split = base + (H - base) * 0.34;
    freezer = { x0: -W / 2, x1: W / 2, y0: base, y1: split, divider: "y", at: split };
    cold = { ...cold, y0: split + T };
  } else if (shape.type === "SIDE_BY_SIDE") {
    const split = -W / 2 + W * 0.42;
    freezer = { x0: -W / 2, x1: split, y0: base, y1: H, divider: "x", at: split };
    cold = { ...cold, x0: split };
  } else if (shape.freezerShelves > 0) {
    icebox = Math.min(0.16, (H - base) * 0.2);
  }
  const inner = { x0: cold.x0 + T, x1: cold.x1 - T };
  const innerWidth = inner.x1 - inner.x0;
  const drawerHeight = shape.drawers ? Math.min(0.2, (cold.y1 - cold.y0) * 0.2) : 0;
  const drawers = Array.from({ length: shape.drawers }, (_, index) => {
    const width = innerWidth / shape.drawers;
    return { x: inner.x0 + width * (index + 0.5), width: width - 0.012, y: cold.y0 + 0.02, height: drawerHeight };
  });
  const top = cold.y1 - (icebox ? icebox + 0.02 : 0);
  const bottom = drawerHeight ? cold.y0 + 0.02 + drawerHeight + 0.09 : cold.y0 + 0.08;
  const span = top - bottom;
  const shelves = Array.from({ length: shape.shelves }, (_, index) => top - ((index + 1) * span) / shape.shelves);
  // Side by side: the fridge door hangs on the outer right edge and the freezer's on the outer left.
  const hinge = shape.type === "SIDE_BY_SIDE" ? "RIGHT" : shape.hinge;
  const door = { x0: cold.x0, x1: cold.x1, y0: cold.y0, height: cold.y1 - cold.y0, side: hinge === "RIGHT" ? -1 : 1 };
  const racks = Array.from({ length: shape.doorRacks }, (_, index) => door.height * (shape.doorRacks > 1 ? 0.2 + (0.6 * index) / (shape.doorRacks - 1) : 0.5));
  const offset = RIGHT_EDGE - W / 2;
  return { shape, W, H, D, base, cold, freezer, icebox, inner, drawers, shelves, top, door, racks, offset, freezerSide: shape.type === "SIDE_BY_SIDE" ? 1 : door.side };
}

// One camera stop per section along the kitchen wall, in tab order from the fridge on the left; Ajustes steps back to see the whole room.
const VIEWS = {
  now: { position: [0.95, 1.38, 1.75], target: [0.72, 1.05, 0], door: 0, freezer: 0 },
  fridge: { position: [0.2, 0.78, 1.32], target: [0, 0.58, 0], door: DOOR_OPEN, freezer: 0 },
  market: { position: [2.2, 1.35, 1.3], target: [2.3, 1.0, -0.1], door: 0, freezer: 0 },
  numbers: { position: [0.88, 1.62, 1.05], target: [0.87, 1.64, -0.3], door: 0, freezer: 0 },
  chef: { position: [1.68, 1.45, 1.25], target: [1.55, 0.98, -0.05], door: 0, freezer: 0 },
  settings: { position: [1.05, 1.6, 3.7], target: [1.05, 1.0, -0.1], door: 0, freezer: 0 },
};

const CAMERA = springConstants(SPRINGS.camera);
const DOOR = springConstants(SPRINGS.door);
const DROP = springConstants(SPRINGS.drop);
const RETURN = springConstants(SPRINGS.snappy);
const RING_RADIAL = 16;
const RING_TUBULAR = 96;

// A full torus whose triangles run around the ring, so setDrawRange shows any arc without new geometry.
function ringArc(radius, tube) {
  const geometry = new THREE.TorusGeometry(radius, tube, RING_RADIAL, RING_TUBULAR);
  const index = [];
  const row = RING_TUBULAR + 1;
  for (let i = 1; RING_TUBULAR >= i; i++) {
    for (let j = 1; RING_RADIAL >= j; j++) {
      const a = row * j + i - 1;
      const b = row * (j - 1) + i - 1;
      const c = row * (j - 1) + i;
      const d = row * j + i;
      index.push(a, b, d, b, c, d);
    }
  }
  geometry.setIndex(index);
  return geometry;
}

const arcRange = (share) => Math.round(Math.min(1, Math.max(0, share)) * RING_TUBULAR) * RING_RADIAL * 6;

function labelTexture(text, background, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, 256, 320);
  context.fillStyle = "#121212";
  for (let line = 0; line < 4; line++) context.fillRect(28, 96 + line * 40, 200 - line * 30, 8);
  context.fillStyle = color;
  const word = text.toUpperCase();
  context.font = "900 48px Fraunces, Georgia, serif";
  const size = Math.min(48, Math.floor((48 * 200) / context.measureText(word).width));
  context.font = `900 ${size}px Fraunces, Georgia, serif`;
  context.fillText(word, 28, 290);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const VAPOR = 18;
const GAP = 0.025;
const WHITE = new THREE.Color("#fdfdfb");
const ALARM = new THREE.Color("#d2492f");
const GLOW = new THREE.Color("#f3c443");
// Read live: turning reduced motion on or off takes effect on the next frame, without a reload.
let reduced = prefersReduced();
onReduced((value) => (reduced = value));

function frostTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  const fade = context.createLinearGradient(0, 0, 0, 128);
  fade.addColorStop(0, "rgba(255,255,255,0.9)");
  fade.addColorStop(0.35, "rgba(255,255,255,0)");
  fade.addColorStop(0.75, "rgba(255,255,255,0)");
  fade.addColorStop(1, "rgba(255,255,255,0.7)");
  context.fillStyle = fade;
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = "rgba(255,255,255,0.8)";
  for (let index = 0; index < 160; index++) {
    const x = hash(index, 1, 2) * 128;
    const edge = hash(index, 3, 4) < 0.5 ? hash(index, 5, 6) * 34 : 128 - hash(index, 7, 8) * 26;
    context.fillRect(x, edge, 1.5, 1.5);
  }
  return new THREE.CanvasTexture(canvas);
}

function puffTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const spring = (k) => 1 - Math.cos(k * Math.PI * 2.5) * Math.exp(-k * 6);

const isIn = (object, root) => {
  for (let node = object; node; node = node.parent) if (node === root) return true;
  return false;
};

// The camera stop for Nevera follows the fridge: in front of its cold section, far enough to see it whole.
function fridgeView(G) {
  const x = G.offset + (G.cold.x0 + G.cold.x1) / 2;
  const y = (G.cold.y0 + G.top) / 2;
  return { position: [x + 0.2, y + 0.2, 0.6 + (G.top - G.cold.y0) * 0.66], target: [x, y, 0] };
}

// With the freezer open the camera frames the freezer section instead, its door swung wide. It stands back far enough for the tall
// freezer of a side by side to fit with every shelf in sight.
function freezerView(G) {
  const { x0, x1, y0, y1 } = G.freezer;
  const x = G.offset + (x0 + x1) / 2;
  const y = (y0 + y1) / 2;
  return { position: [x + 0.15, y + 0.15, 0.25 + Math.max(y1 - y0, (x1 - x0) * 1.2) * 1.35], target: [x, y, 0], door: DOOR_OPEN, freezer: DOOR_OPEN };
}

export function createFridgeScene(canvas, { onPart, onDrop, labels, describe, zoneAt, onDragging, onAnchor, isFull }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 30);
  scene.add(new THREE.HemisphereLight("#ffffff", "#c9c4b4", 0.8));
  const sun = new THREE.DirectionalLight("#ffffff", 1.1);
  sun.position.set(2.5, 4, 3);
  scene.add(sun);
  const inside = new THREE.PointLight("#fff1c8", 0, 1.6, 1.5);

  const floor = mesh(new THREE.CircleGeometry(0.95, 48), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.05 }), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.scale.set(0.9, 0.5, 1);
    m.position.set(0.35, 0.001, 0.15);
  });
  scene.add(floor);

  const shell = paint("#f6f1e6", { roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const liner = paint("#d9ddd0");
  const steel = paint("#c9d0d3", { metalness: 0.9, roughness: 0.25 });
  const glass = paint("#c4d3cc");
  const fridge = new THREE.Group();
  scene.add(fridge);
  fridge.add(inside);
  const parts = new Map();
  const tag = (object, part) => {
    object.traverse((child) => {
      child.userData.part = part;
      if (child.isMesh) {
        const engraved = child.material.onBeforeCompile === engrave;
        child.material = child.material.clone();
        if (engraved) child.material.onBeforeCompile = engrave;
      }
    });
    parts.set(part, [...(parts.get(part) ?? []), object]);
    return object;
  };

  const panel = (w, h, d, x, y, z, material = shell) => mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.012, d / 2 - 0.001)), material, (m) => m.position.set(x, y, z));
  let G = null;
  let body = null;
  let shelfSlots = [];
  let racks = [];
  let door = null;
  let doorPivot = new THREE.Group();
  let freezerPivot = new THREE.Group();
  let doorItems = new THREE.Group();
  let frost = null;
  let knob = null;

  // Builds the fridge's body for a geometry: walls, shelves, drawers, doors with their racks and the settings knob. A new shape replaces the
  // whole body; the food is placed again by placeItems.
  function buildBody(geometry) {
    frost = null;
    if (body) {
      parts.forEach((list, part) => parts.set(part, list.filter((object) => !isIn(object, body))));
      fridge.remove(body);
      body.traverse((child) => {
        if (!child.isMesh && !child.isLineSegments) return;
        child.geometry.dispose();
        if (!child.userData.outline) child.material.dispose();
      });
    }
    G = geometry;
    const { W, H, D, base, cold, freezer, icebox, inner, drawers, shelves, top } = G;
    fridge.position.x = G.offset;
    vapor.position.x = G.offset;
    body = new THREE.Group();
    body.add(panel(W, H, T, 0, H / 2, -D / 2 + T / 2));
    body.add(panel(T, H, D, -W / 2 + T / 2, H / 2, 0));
    body.add(panel(T, H, D, W / 2 - T / 2, H / 2, 0));
    body.add(panel(W, T, D, 0, H - T / 2, 0));
    body.add(panel(W, T, D, 0, T / 2 + base - 0.02, 0));
    if (freezer?.divider === "y") body.add(panel(W, T, D, 0, freezer.at + T / 2, 0));
    if (freezer?.divider === "x") body.add(panel(T, H, D, freezer.at + T / 2, H / 2, 0));
    body.add(panel(inner.x1 - inner.x0, cold.y1 - cold.y0 - 0.06, 0.004, (inner.x0 + inner.x1) / 2, (cold.y0 + cold.y1) / 2, -D / 2 + T + 0.003, liner));
    [-1, 1].forEach((side) => body.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 16), steel, (m) => m.position.set(side * (W / 2 - 0.11), 0.01, 0.2))));
    const shelfWidth = inner.x1 - inner.x0;
    const middle = (inner.x0 + inner.x1) / 2;
    shelfSlots = shelves.map((y, index) => {
      const slab = tag(mesh(new RoundedBoxGeometry(shelfWidth - 0.01, 0.01, D - 0.12, 2, 0.004), glass, (m) => m.position.set(middle, y, -0.03)), "fridge");
      body.add(slab);
      const above = index === 0 ? top : shelves[index - 1];
      return { zone: "SHELF", index, y: y + 0.006, slab, left: inner.x0 + 0.05, room: shelfWidth - 0.1, headroom: above - y - 0.04 };
    });
    drawers.forEach((drawer, index) => {
      const slab = tag(mesh(new RoundedBoxGeometry(drawer.width, drawer.height, D - 0.16, 2, 0.01), paint("#dfeee4", { transparent: true, opacity: 0.55, roughness: 0.1, clearcoat: 1 }), (m) => m.position.set(drawer.x, drawer.y + drawer.height / 2, -0.02)), "fridge");
      body.add(slab);
      shelfSlots.push({ zone: "DRAWER", index, y: drawer.y + 0.012, slab, left: drawer.x - drawer.width / 2 + 0.03, room: drawer.width - 0.06, headroom: drawer.height - 0.03 });
    });
    // The freezer's shelves, the first one at the top as the trays are named; behind its own door, they take food only while it is open.
    const frozen = freezer ? G.shape.freezerShelves : 0;
    if (frozen) {
      const x0 = freezer.x0 + T;
      const x1 = freezer.x1 - T;
      const low = freezer.y0 + 0.012;
      const step = (freezer.y1 - T - 0.01 - low) / frozen;
      for (let index = 0; frozen > index; index++) {
        const y = low + (frozen - 1 - index) * step;
        const slab = tag(mesh(new RoundedBoxGeometry(x1 - x0 - 0.01, 0.01, D - 0.12, 2, 0.004), glass, (m) => m.position.set((x0 + x1) / 2, y, -0.03)), "fridge");
        body.add(slab);
        shelfSlots.push({ zone: "FREEZER", index, y: y + 0.006, slab, left: x0 + 0.04, room: x1 - x0 - 0.08, headroom: step - 0.03, behindDoor: true });
      }
    }
    if (icebox) {
      const box = group(
        mesh(new RoundedBoxGeometry(shelfWidth * 0.72, icebox, D - 0.22, 2, 0.008), liner, (m) => m.position.set(0, 0, -0.04)),
        mesh(new RoundedBoxGeometry(shelfWidth * 0.72, icebox - 0.01, 0.012, 2, 0.004), glass, (m) => m.position.set(0, -0.002, D / 2 - 0.15)),
      );
      box.position.set(middle - shelfWidth * 0.12, cold.y1 - icebox / 2 - 0.01, 0);
      body.add(box);
      frost = mesh(new THREE.PlaneGeometry(shelfWidth * 0.68, icebox - 0.03), new THREE.MeshBasicMaterial({ map: frostTexture(), transparent: true, opacity: 0, depthWrite: false }), (m) => {
        m.position.set(0, -0.002, D / 2 - 0.143);
        m.userData.noOutline = true;
      });
      box.add(frost);
      const width = shelfWidth * 0.72;
      const floor = cold.y1 - icebox - 0.004;
      const slab = tag(mesh(new RoundedBoxGeometry(width - 0.02, 0.006, D - 0.26, 2, 0.002), glass, (m) => m.position.set(middle - shelfWidth * 0.12, floor, -0.04)), "fridge");
      body.add(slab);
      shelfSlots.push({ zone: "FREEZER", index: 0, y: floor + 0.004, slab, left: middle - shelfWidth * 0.12 - width / 2 + 0.03, room: width - 0.06, headroom: icebox - 0.03, icebox: true });
    }

    knob = tag(group(
      mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 32), paint("#121212", { roughness: 0.35, clearcoat: 0.8 }), (m) => (m.rotation.x = Math.PI / 2)),
      mesh(new THREE.BoxGeometry(0.008, 0.03, 0.006), paint(css("--color-arroz")), (m) => m.position.set(0, 0.022, 0.018)),
    ), "settings");
    knob.scale.setScalar(Math.min(1, W / 0.72));
    knob.position.set(inner.x1 - 0.11 * Math.min(1, W / 0.72), top - 0.07 * Math.min(1, W / 0.72), -D / 2 + T + 0.02);
    body.add(knob);

    // A door hangs from its hinge: its panel, handle and racks reach from the pivot toward the other side.
    const hung = (section, side, depth) => {
      const width = section.x1 - section.x0;
      const height = section.height ?? section.y1 - section.y0;
      const pivot = new THREE.Group();
      pivot.position.set(side === 1 ? section.x0 : section.x1, section.y0, D / 2);
      const leaf = tag(group(
        mesh(new RoundedBoxGeometry(width, height, depth, 4, 0.02), shell, (m) => m.position.set((side * width) / 2, height / 2, depth / 2)),
        mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.min(0.24, height * 0.3), 16), steel, (m) => m.position.set(side * (width - 0.06), height - Math.min(0.2, height * 0.3), depth + 0.03)),
      ), "fridge");
      pivot.add(leaf);
      body.add(pivot);
      return { pivot, leaf, width, height };
    };
    const main = hung({ ...G.door, x1: G.door.x1, y1: G.door.y0 + G.door.height }, G.door.side, 0.06);
    door = main.leaf;
    doorPivot = main.pivot;
    const doorWidth = main.width;
    racks = G.racks.map((y) => {
      const rack = mesh(new RoundedBoxGeometry(doorWidth - 0.12, 0.03, 0.09, 2, 0.006), glass, (m) => m.position.set((G.door.side * doorWidth) / 2, y - 0.02, -0.05));
      door.add(rack);
      const left = G.door.side === 1 ? 0.08 : -doorWidth + 0.08;
      return { zone: "DOOR", y, rack, left, room: doorWidth - 0.16, headroom: 0.26 };
    });
    doorItems = new THREE.Group();
    door.add(doorItems);
    if (freezer) {
      const frozen = hung(freezer, G.freezerSide, 0.05);
      freezerPivot = frozen.pivot;
      frost = mesh(new THREE.PlaneGeometry(frozen.width - 0.04, frozen.height - 0.04), new THREE.MeshBasicMaterial({ map: frostTexture(), transparent: true, opacity: 0, depthWrite: false }), (m) => {
        m.position.set((G.freezerSide * frozen.width) / 2, frozen.height / 2, 0.051);
        m.userData.noOutline = true;
      });
      freezerPivot.add(frost);
    } else {
      freezerPivot = new THREE.Group();
    }
    // No freezer and no ice box: the frost has nothing to cover, so it stays an invisible speck.
    frost ??= mesh(new THREE.PlaneGeometry(0.001, 0.001), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), (m) => (m.userData.noOutline = true));
    if (!frost.parent) body.add(frost);
    inside.position.set(middle, top - 0.06, 0.05);
    fridge.add(body);
    outline(body);
    body.traverse((child) => {
      if (child.isMesh && child.material.transparent && !child.userData.outline && child.material.map === null) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry, 30), new THREE.LineBasicMaterial({ color: "#121212" }));
        edges.raycast = () => {};
        child.add(edges);
      }
    });
    VIEWS.fridge = { ...VIEWS.fridge, ...fridgeView(G) };
  }

  const vapor = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(VAPOR * 3), 3)),
    new THREE.PointsMaterial({ map: puffTexture(), size: 0.16, transparent: true, opacity: 0, depthWrite: false, color: "#eef6f8" }),
  );
  const puffs = Array.from({ length: VAPOR }, (_, index) => ({ age: index / VAPOR, x: 0, z: 0 }));
  scene.add(vapor);

  const tagLayer = document.createElement("div");
  tagLayer.className = "stage-tags";
  tagLayer.setAttribute("aria-hidden", "true");
  canvas.after(tagLayer);
  const tags = new Map();

  const kitchen = buildKitchen(labelTexture(labels.market, "#ffffff", css("--color-tomate")));
  addEventListener("hpc:theme", () => {
    kitchen.retheme();
    film?.wake();
  });
  scene.add(kitchen.room, tag(kitchen.counter, "now"), tag(kitchen.stove, "chef"), tag(kitchen.pantry, "market"), tag(kitchen.board, "numbers"));

  const pot = tag(group(
    mesh(lathe([[0, 0], [0.12, 0], [0.13, 0.13], [0.135, 0.14], [0, 0.14]]), paint("#55534e", { metalness: 0.7, roughness: 0.3 })),
    mesh(new THREE.TorusGeometry(0.04, 0.008, 8, 24, Math.PI), steel, (m) => m.position.set(0.15, 0.11, 0)),
  ), "use");
  pot.position.copy(kitchen.useSpot);
  const bin = tag(group(
    mesh(lathe([[0, 0], [0.11, 0], [0.13, 0.32], [0, 0.32]]), paint("#2b2b2b", { roughness: 0.5 })),
    mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.02, 32), paint("#3a3a3a", { roughness: 0.4 }), (m) => (m.position.y = 0.33)),
  ), "discard");
  bin.position.copy(kitchen.binSpot);
  scene.add(pot, bin);
  [pot, bin, kitchen.counter, kitchen.stove, kitchen.pantry, kitchen.board].forEach(outline);

  const extras = {
    now: (() => {
      const plate = group(
        mesh(lathe([[0, 0], [0.16, 0], [0.2, 0.02], [0.21, 0.03], [0, 0.03]], 48), paint("#ffffff", { roughness: 0.25, clearcoat: 1 })),
        ...[["Tomato", -0.07, 0.03], ["Avocado", 0.05, -0.04], ["Cheese", 0.06, 0.07]].map(([name, x, z]) => {
          const food = foodModel(name);
          food.position.set(x, 0.03, z);
          food.scale.setScalar(1.15);
          return food;
        }),
      );
      plate.position.copy(kitchen.plateSpot);
      return tag(plate, "now");
    })(),
    numbers: (() => {
      const rings = new THREE.Group();
      rings.userData.arcs = [0.24, 0.17, 0.1].map((radius, index) => {
        const color = [css("--color-cilantro"), css("--color-papa"), css("--color-tomate")][index];
        rings.add(mesh(new THREE.TorusGeometry(radius, 0.022, 16, 96), paint("#e9e7e0", { roughness: 0.6 })));
        const arc = mesh(ringArc(radius, 0.026), paint(color), (m) => {
          m.rotation.z = Math.PI / 2;
          m.userData.noOutline = true;
          m.userData.share = 0.02;
          m.geometry.setDrawRange(0, arcRange(0.02));
        });
        rings.add(arc);
        return arc;
      });
      // Drawn in chalk on the board: flattened against it, right of centre so the tags fit on the left.
      rings.position.copy(kitchen.board.position).add(new THREE.Vector3(0.14, 0, 0.022));
      rings.scale.set(0.7, 0.7, 0.12);
      return tag(rings, "numbers");
    })(),
  };
  Object.values(extras).forEach((extra) => {
    outline(extra);
    scene.add(extra);
  });

  const items = new THREE.Group();
  fridge.add(items);
  buildBody(fridgeGeometry());
  const state = {
    route: "now",
    door: DOOR_OPEN,
    freezer: 0,
    position: new THREE.Vector3(...VIEWS.now.position),
    target: new THREE.Vector3(...VIEWS.now.target),
    axes: [...VIEWS.now.position, ...VIEWS.now.target].map((value) => ({ value, velocity: 0 })),
    goals: [...VIEWS.now.position, ...VIEWS.now.target],
    doorSpring: { value: DOOR_OPEN, velocity: 0 },
    freezerSpring: { value: 0, velocity: 0 },
    doorGoal: DOOR_OPEN,
    freezerGoal: 0,
    moving: false,
    gaze: new THREE.Vector2(),
    hover: null,
    pointer: new THREE.Vector2(9, 9),
    tilt: new THREE.Vector2(),
    ringShares: [0, 0, 0],
    doorAlarm: false,
    frost: 0,
    lit: false,
    litAt: 0,
    hoverModel: null,
    highlight: new Set(),
  };
  camera.position.copy(state.position);
  camera.lookAt(state.target);
  let film = null;
  const flights = new Map();
  const scratch = new THREE.Vector3();
  const lifted = new THREE.Vector3();

  let arrived = false;
  function goTo(route) {
    if (route === state.route && arrived) return;
    arrived = true;
    const view = VIEWS[route] ?? VIEWS.now;
    state.route = route;
    state.goals = [...view.position, ...view.target];
    state.doorGoal = view.door;
    state.freezerGoal = view.freezer;
    if (route === "fridge" && freezerOpen && G.freezer) {
      const inside = freezerView(G);
      state.goals = [...inside.position, ...inside.target];
      state.freezerGoal = inside.freezer;
    }
    if (reduced) {
      state.axes.forEach((axis, index) => Object.assign(axis, { value: state.goals[index], velocity: 0 }));
      Object.assign(state.doorSpring, { value: view.door, velocity: 0 });
      Object.assign(state.freezerSpring, { value: view.freezer, velocity: 0 });
    }
    film?.wake();
  }

  let freezerOpen = false;
  const freezerShown = () => -0.9 > state.freezer;
  // Opens or closes the freezer door on Nevera; elsewhere it stays shut.
  function showFreezer(on) {
    if (freezerOpen === Boolean(on)) return;
    freezerOpen = Boolean(on);
    arrived = false;
    goTo(state.route);
  }

  let deferred = null;
  let placed = null;
  // A new shape rebuilds the body, then puts the food back on its shelves.
  function setShape(shape) {
    shape ??= DEFAULT_SHAPE;
    if (JSON.stringify(shape) === JSON.stringify(G.shape)) return;
    buildBody(fridgeGeometry(shape));
    if (state.route === "fridge") {
      arrived = false;
      goTo("fridge");
    }
    if (placed) placeItems(...placed);
    film?.wake();
  }

  function placeItems(fridgeTree, inventory) {
    placed = [fridgeTree, inventory];
    if (drag.model) {
      deferred = [fridgeTree, inventory];
      return;
    }
    flights.clear();
    film?.wake();
    const known = new Map([...items.children, ...doorItems.children].map((model) => [model.userData.key, model.userData.item?.trayId]));
    [...items.children, ...doorItems.children].forEach(release);
    items.clear();
    doorItems.clear();
    tags.forEach((tag) => tag.element.remove());
    tags.clear();
    let order = 0;
    slotByTray.clear();
    const zones = fridgeTree?.children ?? [];
    const traysOf = (kind) => zones.filter((zone) => (zone.kind ?? "SHELF") === kind).flatMap((zone) => zone.children);
    const slots = [
      ...shelfSlots.map((slot) => ({ ...slot, tray: traysOf(slot.zone)[slot.index] })),
      ...racks.map((rack, index) => ({ ...rack, tray: traysOf("DOOR")[index] })),
    ];
    slots.forEach((slot) => {
      slot.slab ??= slot.rack;
      slot.slab.userData.trayId = slot.tray?.id ?? null;
      slot.slab.traverse((child) => (child.userData.trayId = slot.tray?.id ?? null));
      if (!slot.tray) return;
      const door = slot.zone === "DOOR";
      const room = slot.room;
      const rows = door ? [-0.05] : slot.icebox ? [-0.02] : slot.zone === "DRAWER" ? [0.05, -0.1] : [0.08, -0.14];
      const models = inventory
        .filter((item) => item.trayId === slot.tray.id)
        .slice(0, 12)
        .map((item) => {
          const model = foodModel(item.name, item.category, item.grams);
          model.traverse((child) => {
            child.userData.item = item;
            child.userData.part = "fridge";
          });
          model.userData.key = item.id;
          model.userData.behindDoor = Boolean(slot.behindDoor);
          model.userData.born = known.get(item.id) === item.trayId ? 0 : performance.now() + order++ * 70;
          sized(model);
          const text = describe?.(item);
          if (text) {
            const element = document.createElement("span");
            element.className = `stage-tag${item.days !== null && item.days !== undefined && 1 >= item.days ? " soon" : ""}`;
            element.textContent = text;
            tagLayer.append(element);
            tags.set(model, { element, soon: element.classList.contains("soon"), width: 0, height: 0 });
          }
          return model;
        });
      const left = slot.left;
      slotByTray.set(slot.tray.id, { group: door ? doorItems : items, left, room, y: door ? slot.y - 0.03 : slot.y, z: rows[0] });
      const headroom = slot.headroom;
      const scaleOf = (model, fit) => Math.min(fit, headroom / Math.max(model.userData.height, 0.001));
      const pack = (fit) => {
        const placed = [];
        let row = 0;
        let x = 0;
        for (const model of models) {
          const scale = scaleOf(model, fit);
          const width = model.userData.width * scale;
          if (x + width > room) {
            if (row === rows.length - 1) return null;
            row += 1;
            x = 0;
          }
          placed.push({ model, scale, x: x + width / 2, row });
          x += width + GAP * scale;
        }
        return placed;
      };
      let fit = 1;
      let layout = pack(fit);
      while (!layout) {
        fit *= 0.9;
        layout = pack(fit);
      }
      layout.forEach(({ model, scale, x, row }) => {
        model.userData.fit = scale;
        model.position.set(left + x, (door ? slot.y - 0.03 : slot.y) + model.userData.rest * scale, rows[row]);
        model.userData.home = model.position.clone();
        (door ? doorItems : items).add(model);
      });
    });
  }

  const ringTags = [0, 1, 2].map((index) => {
    const element = document.createElement("span");
    element.className = `stage-tag ring-tag ring-${index}`;
    tagLayer.append(element);
    return element;
  });

  function release(model) {
    model.traverse((child) => {
      if (!child.isMesh || child.userData.outline) return;
      child.geometry.dispose();
      child.material.dispose();
    });
  }

  const slotByTray = new Map();
  const landing = { trayId: null, local: new THREE.Vector3(), width: 0.08 };

  function land(target, point, width) {
    const slot = target?.kind === "tray" ? slotByTray.get(target.trayId) : null;
    landing.trayId = slot ? target.trayId : null;
    if (!slot) return null;
    const local = slot.group.worldToLocal(point.clone());
    const half = Math.min(width / 2, slot.room / 2);
    landing.local.set(THREE.MathUtils.clamp(local.x, slot.left + half, slot.left + slot.room - half), slot.y, slot.z);
    landing.width = width;
    return slot.group.localToWorld(landing.local.clone());
  }

  function pushFor(model) {
    if (!landing.trayId || model.userData.item?.trayId !== landing.trayId || model.userData.home.z !== landing.local.z) return 0;
    const dx = model.userData.home.x - landing.local.x;
    const overlap = (model.userData.width * (model.userData.fit ?? 1) + landing.width) / 2 + GAP - Math.abs(dx);
    return overlap > 0 ? Math.sign(dx || 1) * overlap : 0;
  }

  function setRings(shares, labels = []) {
    state.ringShares = shares;
    film?.wake();
    ringTags.forEach((element, index) => (element.textContent = labels[index] ?? ""));
  }

  function highlight(names) {
    state.highlight = new Set(names.map((name) => name.toLowerCase()));
    film?.wake();
  }

  function focus(itemId) {
    state.focusId = itemId;
    film?.wake();
  }

  function setStatus(twin) {
    state.doorAlarm = Boolean(twin?.doorOpen);
    const celsius = twin?.celsius;
    state.frost = celsius === null || celsius === undefined ? 0 : THREE.MathUtils.clamp((5 - celsius) / 5, 0, 1) * 0.55;
    film?.wake();
  }

  const raycaster = new THREE.Raycaster();
  const pick = (x, y) => {
    const box = canvas.getBoundingClientRect();
    state.pointer.set(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(state.pointer, camera);
    return raycaster.intersectObjects(scene.children, true).find((hit) => hit.object.userData.part || hit.object.userData.item);
  };

  const drag = { model: null, item: null, origin: new THREE.Vector3(), plane: new THREE.Plane(), target: null, moved: false, start: new THREE.Vector2() };
  const point = new THREE.Vector3();

  const dropTargetAt = (x, y) => {
    const zone = zoneAt?.(x, y);
    if (zone) return { kind: zone, object: zone === "use" ? pot : bin };
    const box = canvas.getBoundingClientRect();
    state.pointer.set(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(state.pointer, camera);
    const candidates = [...shelfSlots.filter((slot) => !slot.behindDoor || freezerShown()).map((slot) => slot.slab), ...racks.map((rack) => rack.rack), pot, bin];
    const hit = raycaster.intersectObjects(candidates, true)[0];
    if (!hit) return null;
    const part = hit.object.userData.part;
    if (part === "use" || part === "discard") return { kind: part, object: part === "use" ? pot : bin };
    let object = hit.object;
    while (object && !object.userData.trayId && object.parent) object = object.parent;
    return object?.userData.trayId ? { kind: "tray", trayId: object.userData.trayId, object, point: hit.point } : null;
  };

  // A part that takes the food glows yellow; one with no room left glows red.
  const glow = (target, on) => {
    if (target) target.object.userData.glowing = on;
    const color = target?.kind === "tray" && isFull?.(target.trayId) ? css("--color-tomate") : css("--color-papa");
    target?.object.traverse((child) => {
      if (child.isMesh && child.material.emissive) child.material.emissive.set(on ? color : "#000000").multiplyScalar(on ? 0.35 : 1);
    });
  };

  canvas.addEventListener("pointerdown", (event) => {
    const hit = pick(event.clientX, event.clientY);
    const item = hit?.object.userData.item;
    if (!item || !item.usable || state.route !== "fridge") return;
    let model = hit.object;
    while (model.parent && model.parent !== items && model.parent !== doorItems) model = model.parent;
    drag.model = model;
    drag.item = item;
    drag.moved = false;
    drag.start.set(event.clientX, event.clientY);
    drag.origin.copy(model.position);
    const world = model.getWorldPosition(new THREE.Vector3());
    drag.plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), world);
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    const box = canvas.getBoundingClientRect();
    state.tilt.set((event.clientX - box.left) / box.width - 0.5, (event.clientY - box.top) / box.height - 0.5);
    if (drag.model) {
      if (!drag.moved && drag.start.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) < 6) return;
      if (!drag.moved) onDragging?.(true);
      drag.moved = true;
      state.tilt.set(0, 0);
      state.pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
      raycaster.setFromCamera(state.pointer, camera);
      const target = dropTargetAt(event.clientX, event.clientY);
      const spot = target ? land(target, target.point, drag.model.userData.width * (drag.model.userData.fit ?? 1)) : (land(null), null);
      if (spot) {
        drag.model.position.copy(drag.model.parent.worldToLocal(spot.add(new THREE.Vector3(0, drag.model.userData.rest * (drag.model.userData.fit ?? 1) + 0.015, 0))));
      } else if (raycaster.ray.intersectPlane(drag.plane, point)) {
        drag.model.parent.worldToLocal(point);
        drag.model.position.copy(point).add(new THREE.Vector3(0, 0.02, 0));
      }
      if (target?.object !== drag.target?.object) {
        glow(drag.target, false);
        glow(target, true);
      }
      drag.target = target;
      canvas.style.cursor = "grabbing";
      return;
    }
    const hit = pick(event.clientX, event.clientY);
    state.hover = hit?.object.userData.item ? null : (hit?.object.userData.part ?? null);
    let hovered = hit?.object.userData.item ? hit.object : null;
    while (hovered && hovered.parent !== items && hovered.parent !== doorItems) hovered = hovered.parent;
    state.hoverModel = hovered;
    const grabbable = hit?.object.userData.item?.usable && state.route === "fridge";
    canvas.style.cursor = grabbable ? "grab" : hit?.object.userData.item || state.hover ? "pointer" : "default";
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!drag.model) return;
    const { model, item, target, moved } = drag;
    glow(target, false);
    if (moved) onDragging?.(false);
    land(null);
    queueMicrotask(() => {
      if (!deferred || drag.model) return;
      const [tree, list] = deferred;
      deferred = null;
      placeItems(tree, list);
    });
    drag.model = null;
    drag.target = null;
    canvas.releasePointerCapture?.(event.pointerId);
    if (!moved) {
      onPart("fridge", { trayId: item.trayId, itemId: item.id });
      return;
    }
    const sameTray = target?.kind === "tray" && target.trayId === item.trayId;
    const home = drag.origin.clone();
    if (target && !sameTray) {
      const into = target.kind !== "tray";
      const destination = into ? target.object.getWorldPosition(new THREE.Vector3()).add(lifted.set(0, 0.08, 0)) : model.getWorldPosition(new THREE.Vector3());
      fly(model, model.parent.worldToLocal(destination), into ? 0.15 : 1);
      // A done move waits where it landed for the refresh to place it; only a model the refresh never replaced goes back.
      const settle = (ok) => {
        if (!ok) fly(model, home, 1);
        else setTimeout(() => model.parent && fly(model, home, 1), 8000);
      };
      Promise.resolve(onDrop(target.kind === "tray" ? { kind: "move", item, trayId: target.trayId } : { kind: target.kind, item })).then(settle, () => settle(false));
    } else {
      fly(model, home, 1);
    }
  });

  // The browser took the pointer back mid drag: the food goes home and nothing changes.
  const cancelDrag = () => {
    if (!drag.model) return;
    const { model, target, moved } = drag;
    glow(target, false);
    if (moved) onDragging?.(false);
    land(null);
    drag.model = null;
    drag.target = null;
    fly(model, drag.origin.clone(), 1);
    if (deferred) {
      const [tree, list] = deferred;
      deferred = null;
      placeItems(tree, list);
    }
  };
  canvas.addEventListener("pointercancel", cancelDrag);
  canvas.addEventListener("lostpointercapture", cancelDrag);

  canvas.addEventListener("pointerleave", () => {
    state.tilt.set(0, 0);
    state.hover = null;
    state.hoverModel = null;
  });
  canvas.addEventListener("click", (event) => {
    if (drag.moved) {
      drag.moved = false;
      return;
    }
    const hit = pick(event.clientX, event.clientY);
    const part = hit?.object.userData.part;
    const item = hit?.object.userData.item;
    if (item) {
      if (state.route !== "fridge") onPart("fridge", { trayId: item.trayId, itemId: item.id });
      return;
    }
    if (part && part !== "use" && part !== "discard") onPart(part, hit.object.userData);
  });

  function trayAt(x, y) {
    const target = dropTargetAt(x, y);
    return target?.kind === "tray" ? target : null;
  }

  let shown = null;
  const previews = new Map();
  function showTarget(x, y, name, grams) {
    const target = x === null ? null : trayAt(x, y);
    if (target?.object !== shown?.object) {
      glow(shown, false);
      glow(target, true);
    }
    shown = target;
    previews.forEach((model) => (model.visible = false));
    if (name && target) {
      if (!previews.has(name)) {
        const model = foodModel(name, undefined, grams);
        sized(model);
        scene.add(model);
        previews.set(name, model);
      }
      const model = previews.get(name);
      const spot = land(target, target.point, model.userData.width);
      if (spot) {
        model.position.copy(spot).add(new THREE.Vector3(0, model.userData.rest, 0));
        model.quaternion.copy(slotByTray.get(target.trayId).group.getWorldQuaternion(new THREE.Quaternion()));
        model.visible = true;
      }
    } else {
      land(null);
    }
    return target?.trayId ?? null;
  }

  // A dropped food flies on the drop spring; a failed or cancelled drop flies it back home, so it is never left hidden.
  function fly(model, to, scale) {
    flights.set(model, { spring: scale === 1 ? RETURN : DROP, from: model.position.clone(), to, scaleFrom: flights.get(model)?.scale ?? 1, scaleTo: scale, scale: flights.get(model)?.scale ?? 1, progress: { value: reduced ? 1 : 0, velocity: 0 } });
    model.visible = true;
    film?.wake();
  }

  function resize() {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    Object.assign(tagLayer.style, { left: `${canvas.offsetLeft}px`, top: `${canvas.offsetTop}px`, width: `${clientWidth}px`, height: `${clientHeight}px` });
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    film?.wake();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const anchors = () => ({ now: extras.now, fridge: (shelfSlots[1] ?? shelfSlots[0])?.slab ?? door, market: kitchen.basket, numbers: extras.numbers, chef: kitchen.pot });
  const lastAnchor = { x: -1, y: -1, inside: null };
  function anchor() {
    if (!onAnchor) return;
    const part = anchors()[state.route];
    if (!part) {
      if (lastAnchor.inside !== false) onAnchor(0, 0, false);
      lastAnchor.inside = false;
      return;
    }
    const spot = part.getWorldPosition(scratch).project(camera);
    const x = Math.round(canvas.offsetLeft + ((spot.x + 1) / 2) * canvas.clientWidth);
    const y = Math.round(canvas.offsetTop + ((1 - spot.y) / 2) * canvas.clientHeight);
    const inside = spot.z < 1 && Math.abs(spot.x) <= 1 && Math.abs(spot.y) <= 1;
    if (x === lastAnchor.x && y === lastAnchor.y && inside === lastAnchor.inside) return;
    Object.assign(lastAnchor, { x, y, inside });
    onAnchor(x, y, inside);
  }

  const STACK = [0, -1, -2];
  function placeTags(show) {
    const placed = [];
    const ordered = [...tags]
      .map(([model, tag]) => {
        const spot = model.parent.localToWorld(scratch.copy(model.position).setY(model.position.y + (model.userData.height ?? 0.1) * (model.userData.fit ?? 1) + 0.012)).project(camera);
        return { model, tag, x: ((spot.x + 1) / 2) * canvas.clientWidth, y: ((1 - spot.y) / 2) * canvas.clientHeight };
      })
      .sort((a, b) => b.tag.soon - a.tag.soon || b.model.position.z - a.model.position.z || a.x - b.x);
    ordered.forEach(({ model, tag, x, y }) => {
      const { element } = tag;
      const wanted = tag.soon || model === state.hoverModel || (state.focusId && model.userData.key === state.focusId);
      if (!show || !wanted || !model.visible || model === drag.model || (model.userData.behindDoor && !freezerShown())) {
        element.style.visibility = "hidden";
        return;
      }
      if (!tag.width) {
        tag.width = element.offsetWidth;
        tag.height = element.offsetHeight;
      }
      const half = tag.width / 2 + 3;
      const step = tag.height + 4;
      const free = (shift) => !placed.some((other) => step > Math.abs(other.y - (y + shift * step)) && half + other.half > Math.abs(other.x - x));
      const level = tag.level !== undefined && free(tag.level) ? tag.level : STACK.find(free);
      tag.level = level;
      if (level === undefined) {
        element.style.visibility = "hidden";
        return;
      }
      const top = y + level * step;
      placed.push({ x, y: top, half });
      element.style.visibility = "";
      element.classList.toggle("lifted", level !== 0);
      element.style.transform = `translate(${x.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, -100%)`;
    });
  }

  const settled = (a, b, epsilon = 1e-3) => epsilon >= Math.abs(a - b);

  // Runs on the shared loop: returns true while anything still moves; otherwise the loop drops to the 8 Hz boil and freezes 5 s after the last interaction.
  function tick(dt, seconds) {
    const now = seconds * 1000;
    const delta = dt;
    let moving = Boolean(drag.model);
    if (!reduced) boil(now);
    let travelling = false;
    state.axes.forEach((axis, index) => (travelling = springStep(axis, state.goals[index], CAMERA, delta) || travelling));
    travelling = springStep(state.doorSpring, state.doorGoal, DOOR, delta) || travelling;
    travelling = springStep(state.freezerSpring, state.freezerGoal, CAMERA, delta) || travelling;
    moving ||= travelling;
    const [px, py, pz, tx, ty, tz] = state.axes.map((axis) => axis.value);
    state.position.set(px, py, pz);
    state.target.set(tx, ty, tz);
    state.door = state.doorSpring.value;
    state.freezer = state.freezerSpring.value;
    state.gaze.x = damp(state.gaze.x, reduced ? 0 : state.tilt.x, 4, delta);
    state.gaze.y = damp(state.gaze.y, reduced ? 0 : state.tilt.y, 4, delta);
    moving ||= !settled(state.gaze.x, reduced ? 0 : state.tilt.x) || !settled(state.gaze.y, reduced ? 0 : state.tilt.y);
    const reach = Math.max(1.32, 1.05 / camera.aspect);
    camera.position.set(
      state.target.x + (state.position.x - state.target.x) * reach + state.gaze.x * 0.12,
      state.target.y + (state.position.y - state.target.y) * reach - state.gaze.y * 0.08,
      state.target.z + (state.position.z - state.target.z) * reach,
    );
    camera.lookAt(state.target);
    // The springs swing like a left-hinged door; a door hung on the right turns the other way.
    doorPivot.rotation.y = state.door * G.door.side;
    freezerPivot.rotation.y = state.freezer * G.freezerSide;
    extras.numbers.userData.arcs.forEach((arc, index) => {
      const wanted = Math.max(0.02, state.ringShares[index] ?? 0);
      if (settled(arc.userData.share, wanted)) return;
      arc.userData.share = damp(arc.userData.share, wanted, 4, delta);
      arc.geometry.setDrawRange(0, arcRange(arc.userData.share));
      moving = true;
    });
    // On Chef the lid sits ajar on the pot; a still pose, so the loop can rest.
    const lidGoal = state.route === "chef" ? 1 : 0;
    const ajar = damp(kitchen.lid.userData.ajar ?? 0, lidGoal, 6, delta);
    moving ||= !settled(ajar, lidGoal);
    kitchen.lid.userData.ajar = ajar;
    kitchen.lid.position.y = 0.155 + ajar * 0.03;
    kitchen.lid.rotation.z = ajar * 0.14;
    const knobGoal = state.route === "settings" ? -2.1 : 0;
    knob.rotation.z = damp(knob.rotation.z, knobGoal, 5, delta);
    moving ||= !settled(knob.rotation.z, knobGoal);
    parts.forEach((objects, part) => {
      const lift = part === state.hover ? 1 : 0;
      objects.forEach((object) => {
        if (object.userData.glowing) return;
        const before = object.userData.lift ?? 0;
        if (settled(before, lift)) return;
        object.userData.lift = damp(before, lift, 10, delta);
        moving = true;
        object.traverse((child) => {
          if (child.isMesh && child.material.emissive) child.material.emissive.setScalar(object.userData.lift * 0.06);
        });
      });
    });
    const open = THREE.MathUtils.clamp(-state.door / 1.2, 0, 1);
    if (open > 0.05 && !state.lit) state.litAt = now;
    state.lit = open > 0.05;
    const flickering = 260 > now - state.litAt && !reduced;
    moving ||= flickering;
    const flicker = flickering ? (Math.sin(now * 0.09) > 0 ? 1 : 0.35) : 1;
    inside.intensity = open * 0.6 * flicker;

    const doorPanel = door.children[0].material;
    doorPanel.color.lerpColors(WHITE, ALARM, state.doorAlarm ? 0.18 + Math.sin(now / 420) * 0.06 : 0);
    frost.material.opacity = damp(frost.material.opacity, state.frost, 2, delta);
    moving ||= !settled(frost.material.opacity, state.frost);

    const positions = vapor.geometry.attributes.position;
    puffs.forEach((puff, index) => {
      puff.age += delta * 0.35;
      if (puff.age > 1) {
        puff.age -= 1;
        puff.x = (G.inner.x0 + G.inner.x1) / 2 + (hash(index, now, 1) - 0.5) * (G.inner.x1 - G.inner.x0 - 0.06);
        puff.z = G.D / 2 + hash(index, now, 2) * 0.06;
      }
      positions.setXYZ(index, puff.x, G.cold.y0 + 0.08 + puff.age * Math.min(0.5, G.top - G.cold.y0), puff.z);
    });
    positions.needsUpdate = true;
    vapor.material.opacity = reduced ? 0 : open * 0.12;

    [...items.children, ...doorItems.children].forEach((model) => {
      const age = (now - model.userData.born) / 520;
      const growing = !(model.userData.born === 0 || age >= 1 || reduced);
      moving ||= growing;
      const base = growing ? (0 >= age ? 0.001 : spring(age)) : 1;
      const hovered = state.hoverModel === model;
      const wobble = damp(model.userData.wobble ?? 0, hovered ? 1 : 0, 8, delta);
      moving ||= !settled(wobble, hovered ? 1 : 0);
      model.userData.wobble = wobble;
      const flight = flights.get(model);
      if (flight) {
        const flying = springStep(flight.progress, 1, flight.spring, delta);
        const k = flight.progress.value;
        model.position.lerpVectors(flight.from, flight.to, k);
        model.position.y += Math.sin(Math.PI * Math.min(1, Math.max(0, k))) * 0.08;
        flight.scale = flight.scaleFrom + (flight.scaleTo - flight.scaleFrom) * Math.min(1, Math.max(0, k));
        if (!flying) {
          model.position.copy(flight.to);
          if (flight.scaleTo === 1) flights.delete(model);
        }
        moving ||= flying;
      } else if (model !== drag.model && model.userData.home) {
        const push = damp(model.userData.push ?? 0, pushFor(model), 12, delta);
        moving ||= !settled(push, pushFor(model));
        model.userData.push = push;
        model.position.x = model.userData.home.x + push;
      }
      model.scale.setScalar(Math.max(0.001, base * (flight?.scale ?? 1) * (model.userData.fit ?? 1) * (1 + wobble * 0.06)));
      const lit = state.highlight.has(String(model.userData.item?.name ?? "").toLowerCase()) || (state.focusId && model.userData.key === state.focusId);
      if (lit || model.userData.lit) {
        const strength = lit ? 0.22 + Math.sin(now / 320) * 0.1 : 0;
        model.traverse((child) => child.isMesh && child.material.emissive?.copy(GLOW).multiplyScalar(strength));
        model.userData.lit = lit;
      }
      model.userData.rz ??= model.rotation.z;
      model.rotation.z = model.userData.rz + (reduced ? 0 : Math.sin(now / 90) * 0.04 * wobble);
    });

    const fridgeTags = state.route === "fridge" && open > 0.8 && !travelling;
    tagLayer.style.opacity = fridgeTags || state.route === "numbers" ? 1 : 0;
    // Each label sits at the height of its ring's top, all lined up left of the outer ring so none covers the chalk.
    const outer = extras.numbers.userData.arcs[0];
    const left = state.route === "numbers" ? outer.localToWorld(scratch.set(0, outer.geometry.parameters.radius, 0)).project(camera).x : 0;
    ringTags.forEach((element, index) => {
      element.style.visibility = state.route === "numbers" && element.textContent ? "" : "hidden";
      if (state.route !== "numbers") return;
      const arc = extras.numbers.userData.arcs[index];
      const spot = arc.localToWorld(scratch.set(arc.geometry.parameters.radius, 0, 0)).project(camera);
      element.style.transform = `translate(${((left + 1) / 2) * canvas.clientWidth - 10}px, ${((1 - spot.y) / 2) * canvas.clientHeight}px) translate(-100%, -50%)`;
    });
    placeTags(fridgeTags);
    anchor();

    renderer.render(scene, camera);
    return moving;
  }
  film = loop(canvas, tick, { gpu: true });
  if (location.search.includes("dev")) window.__hpc = Object.assign(window.__hpc ?? {}, { fridge: { renderer, flights, items, doorItems, camera, canvas, pick, state, setShape: (shape) => setShape(shape), shelves: () => [...shelfSlots.map((slot) => slot.slab)] } });

  return {
    goTo,
    setShape,
    showFreezer,
    placeItems,
    setRings,
    setStatus,
    highlight,
    focus,
    pick,
    camera,
    scene,
    canvas,
    get shelves() {
      return [...shelfSlots.map((slot) => slot.slab), ...racks.map((rack) => rack.rack)];
    },
    showTarget,
    items,
  };
}
