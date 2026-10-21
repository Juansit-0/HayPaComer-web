import * as THREE from "./vendor/three.module.min.js";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";
import { boil, css, engrave, foodModel, group, hash, lathe, mesh, outline, paint, sized } from "./engrave.js";

const W = 0.72;
const H = 1.7;
const D = 0.66;
const T = 0.035;
const FRIDGE_TOP = 1.13;
const SHELVES = [0.89, 0.62, 0.35];
const DRAWER = 0.06;
const DOOR_OPEN = -1.92;

const VIEWS = {
  now: { position: [1.2, 1.35, 2.7], target: [0.2, 0.85, 0], door: DOOR_OPEN, freezer: 0 },
  fridge: { position: [0.2, 0.78, 1.32], target: [0, 0.58, 0], door: DOOR_OPEN, freezer: 0 },
  market: { position: [0.62, 1.52, 1.48], target: [0.08, 1.4, 0.3], door: -0.5, freezer: 0 },
  numbers: { position: [0.72, 1.66, 1.85], target: [0, 1.4, 0.25], door: -0.4, freezer: -1.7 },
  chef: { position: [0.62, 0.92, 1.45], target: [0, 0.62, 0], door: DOOR_OPEN, freezer: 0 },
  settings: { position: [0.32, 1.02, 1.12], target: [0, 0.98, -0.2], door: DOOR_OPEN, freezer: 0 },
};

const ease = (x) => 1 - Math.pow(1 - x, 4);

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
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

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

export function createFridgeScene(canvas, { onPart, onDrop, labels, describe, zoneAt, onDragging, onAnchor }) {
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
  inside.position.set(0, FRIDGE_TOP - 0.06, 0.05);
  scene.add(inside);

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
  fridge.add(panel(W, H, T, 0, H / 2, -D / 2 + T / 2));
  fridge.add(panel(T, H, D, -W / 2 + T / 2, H / 2, 0));
  fridge.add(panel(T, H, D, W / 2 - T / 2, H / 2, 0));
  fridge.add(panel(W, T, D, 0, H - T / 2, 0));
  fridge.add(panel(W, T, D, 0, T / 2 + 0.02, 0));
  fridge.add(panel(W, T, D, 0, FRIDGE_TOP + T / 2, 0));
  fridge.add(panel(W - 2 * T, FRIDGE_TOP - 0.06, 0.004, 0, FRIDGE_TOP / 2 + 0.02, -D / 2 + T + 0.003, liner));
  [-0.25, 0.25].forEach((x) => fridge.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 16), steel, (m) => m.position.set(x, 0.01, 0.2))));

  const shelfSlots = SHELVES.map((y, index) => {
    const slab = tag(mesh(new RoundedBoxGeometry(W - 2 * T - 0.01, 0.01, D - 0.12, 2, 0.004), glass, (m) => m.position.set(0, y, -0.03)), "fridge");
    fridge.add(slab);
    return { zone: "SHELF", index, y: y + 0.006, slab };
  });
  const drawer = tag(mesh(new RoundedBoxGeometry(W - 2 * T - 0.02, 0.2, D - 0.16, 2, 0.01), paint("#dfeee4", { transparent: true, opacity: 0.55, roughness: 0.1, clearcoat: 1 }), (m) => m.position.set(0, DRAWER + 0.1, -0.02)), "fridge");
  fridge.add(drawer);
  shelfSlots.push({ zone: "DRAWER", index: 0, y: DRAWER + 0.012, slab: drawer });

  const knob = tag(group(
    mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 32), paint("#121212", { roughness: 0.35, clearcoat: 0.8 }), (m) => (m.rotation.x = Math.PI / 2)),
    mesh(new THREE.BoxGeometry(0.008, 0.03, 0.006), paint(css("--color-arroz")), (m) => m.position.set(0, 0.022, 0.018)),
  ), "settings");
  knob.position.set(0.18, FRIDGE_TOP - 0.07, -D / 2 + T + 0.02);
  fridge.add(knob);

  const freezerPivot = new THREE.Group();
  freezerPivot.position.set(-W / 2, FRIDGE_TOP + T, D / 2);
  const freezerHeight = H - FRIDGE_TOP - T;
  const freezerDoor = tag(group(
    mesh(new RoundedBoxGeometry(W, freezerHeight, 0.05, 4, 0.02), shell, (m) => m.position.set(W / 2, freezerHeight / 2, 0.025)),
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 16), steel, (m) => m.position.set(W - 0.06, 0.12, 0.08)),
  ), "numbers");
  freezerPivot.add(freezerDoor);
  const note = tag(mesh(new THREE.PlaneGeometry(0.15, 0.19), new THREE.MeshStandardMaterial({ map: labelTexture(labels.market, "#ffffff", css("--color-tomate")), roughness: 0.9 }), (m) => {
    m.position.set(W - 0.2, freezerHeight / 2 + 0.03, 0.052);
    m.rotation.z = 0.06;
  }), "market");
  const magnet = tag(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 20), paint(css("--color-tomate"), { clearcoat: 1 }), (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.set(W - 0.2, freezerHeight / 2 + 0.12, 0.058);
  }), "market");
  freezerPivot.add(note, magnet);
  fridge.add(freezerPivot);

  const doorPivot = new THREE.Group();
  doorPivot.position.set(-W / 2, 0.04, D / 2);
  const doorHeight = FRIDGE_TOP - 0.04;
  const door = tag(group(
    mesh(new RoundedBoxGeometry(W, doorHeight, 0.06, 4, 0.02), shell, (m) => m.position.set(W / 2, doorHeight / 2, 0.03)),
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 16), steel, (m) => m.position.set(W - 0.06, doorHeight - 0.2, 0.09)),
  ), "now");
  const racks = [0.22, 0.52, 0.82].map((y) => {
    const rack = mesh(new RoundedBoxGeometry(W - 0.12, 0.03, 0.09, 2, 0.006), glass, (m) => m.position.set(W / 2, y - 0.02, -0.05));
    door.add(rack);
    return { zone: "DOOR", y, rack };
  });
  const doorItems = new THREE.Group();
  door.add(doorItems);
  doorPivot.add(door);
  fridge.add(doorPivot);

  const frost = mesh(new THREE.PlaneGeometry(W - 0.04, freezerHeight - 0.04), new THREE.MeshBasicMaterial({ map: frostTexture(), transparent: true, opacity: 0, depthWrite: false }), (m) => {
    m.position.set(W / 2, freezerHeight / 2, 0.051);
    m.userData.noOutline = true;
  });
  freezerPivot.add(frost);

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

  const book = tag(group(
    mesh(new RoundedBoxGeometry(0.26, 0.045, 0.32, 2, 0.006), paint(css("--color-cobre"), { roughness: 0.55 }), (m) => (m.position.y = 0.022)),
    mesh(new THREE.BoxGeometry(0.245, 0.035, 0.305), paint("#f6f1e4", { roughness: 0.9 }), (m) => m.position.set(0.006, 0.022, 0)),
  ), "chef");
  book.position.set(-0.1, H, 0.02);
  book.rotation.y = 0.18;
  fridge.add(book);

  const pot = tag(group(
    mesh(lathe([[0, 0], [0.12, 0], [0.13, 0.13], [0.135, 0.14], [0, 0.14]]), paint("#55534e", { metalness: 0.7, roughness: 0.3 })),
    mesh(new THREE.TorusGeometry(0.04, 0.008, 8, 24, Math.PI), steel, (m) => m.position.set(0.15, 0.11, 0)),
  ), "use");
  pot.position.set(W / 2 + 0.42, 0, 0.35);
  const bin = tag(group(
    mesh(lathe([[0, 0], [0.11, 0], [0.13, 0.32], [0, 0.32]]), paint("#2b2b2b", { roughness: 0.5 })),
    mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.02, 32), paint("#3a3a3a", { roughness: 0.4 }), (m) => (m.position.y = 0.33)),
  ), "discard");
  bin.position.set(W / 2 + 0.78, 0, 0.1);
  scene.add(pot, bin);
  note.userData.noOutline = true;
  [fridge, pot, bin].forEach(outline);
  fridge.traverse((child) => {
    if (child.isMesh && child.material.transparent && !child.userData.outline) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry, 30), new THREE.LineBasicMaterial({ color: "#121212" }));
      edges.raycast = () => {};
      child.add(edges);
    }
  });

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
      plate.position.set(W / 2 + 0.45, 0.95, 0.5);
      return plate;
    })(),
    market: (() => {
      const bag = group(
        mesh(new RoundedBoxGeometry(0.28, 0.3, 0.14, 3, 0.02), paint(css("--color-tomate"), { roughness: 0.85 }), (m) => (m.position.y = 0.15)),
        mesh(new THREE.TorusGeometry(0.07, 0.008, 8, 24, Math.PI), paint("#121212"), (m) => m.position.set(0, 0.3, 0)),
        ...["Carrot", "Banana"].map((name, index) => {
          const food = foodModel(name);
          food.position.set(-0.04 + index * 0.08, 0.3, 0);
          food.rotation.z = 0.9 - index * 1.6;
          food.scale.setScalar(1.3);
          return food;
        }),
      );
      bag.position.set(W / 2 + 0.38, 1.18, 0.45);
      return bag;
    })(),
    numbers: (() => {
      const rings = new THREE.Group();
      rings.userData.arcs = [0.24, 0.17, 0.1].map((radius, index) => {
        const color = [css("--color-cilantro"), css("--color-papa"), css("--color-tomate")][index];
        rings.add(mesh(new THREE.TorusGeometry(radius, 0.022, 16, 96), paint("#e9e7e0", { roughness: 0.6 })));
        const arc = mesh(new THREE.TorusGeometry(radius, 0.026, 16, 96, Math.PI * 1.2), paint(color), (m) => {
          m.rotation.z = Math.PI / 2;
          m.userData.noOutline = true;
        });
        rings.add(arc);
        return arc;
      });
      rings.position.set(0.05, 1.42, 0.42);
      return rings;
    })(),
  };
  Object.values(extras).forEach((extra) => {
    outline(extra);
    extra.scale.setScalar(0.001);
    extra.visible = false;
    scene.add(extra);
  });

  const items = new THREE.Group();
  fridge.add(items);
  const state = {
    route: "now",
    door: DOOR_OPEN,
    freezer: 0,
    position: new THREE.Vector3(...VIEWS.now.position),
    target: new THREE.Vector3(...VIEWS.now.target),
    tween: null,
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

  let arrived = false;
  function goTo(route) {
    if (route === state.route && arrived) return;
    arrived = true;
    const view = VIEWS[route] ?? VIEWS.now;
    state.route = route;
    state.tween = {
      start: performance.now(),
      duration: 1300,
      from: { position: state.position.clone(), target: state.target.clone(), door: state.door, freezer: state.freezer },
      to: { position: new THREE.Vector3(...view.position), target: new THREE.Vector3(...view.target), door: view.door, freezer: view.freezer },
    };
    Object.entries(extras).forEach(([key, extra]) => {
      extra.userData.goal = key === route ? 1 : 0;
      if (key === route) extra.visible = true;
    });
  }

  let deferred = null;
  function placeItems(fridgeTree, inventory) {
    if (drag.model) {
      deferred = [fridgeTree, inventory];
      return;
    }
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
      const room = door ? W - 0.16 : W - 2 * T - 0.1;
      const rows = door ? [-0.05] : slot.zone === "DRAWER" ? [0.05, -0.1] : [0.08, -0.14];
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
      const left = door ? 0.08 : -W / 2 + T + 0.05;
      slotByTray.set(slot.tray.id, { group: door ? doorItems : items, left, room, y: door ? slot.y - 0.03 : slot.y, z: rows[0] });
      const headroom = door ? 0.26 : slot.zone === "DRAWER" ? 0.17 : (slot.index === 0 ? FRIDGE_TOP : SHELVES[slot.index - 1]) - SHELVES[slot.index] - 0.04;
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
    ringTags.forEach((element, index) => (element.textContent = labels[index] ?? ""));
  }

  function highlight(names) {
    state.highlight = new Set(names.map((name) => name.toLowerCase()));
  }

  function focus(itemId) {
    state.focusId = itemId;
  }

  function setStatus(twin) {
    state.doorAlarm = Boolean(twin?.doorOpen);
    const celsius = twin?.celsius;
    state.frost = celsius === null || celsius === undefined ? 0 : THREE.MathUtils.clamp((5 - celsius) / 5, 0, 1) * 0.55;
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
    const candidates = [...shelfSlots.map((slot) => slot.slab), ...racks.map((rack) => rack.rack), pot, bin];
    const hit = raycaster.intersectObjects(candidates, true)[0];
    if (!hit) return null;
    const part = hit.object.userData.part;
    if (part === "use" || part === "discard") return { kind: part, object: part === "use" ? pot : bin };
    let object = hit.object;
    while (object && !object.userData.trayId && object.parent) object = object.parent;
    return object?.userData.trayId ? { kind: "tray", trayId: object.userData.trayId, object, point: hit.point } : null;
  };

  const glow = (target, on) => {
    if (target) target.object.userData.glowing = on;
    target?.object.traverse((child) => {
      if (child.isMesh && child.material.emissive) child.material.emissive.set(on ? css("--color-papa") : "#000000").multiplyScalar(on ? 0.35 : 1);
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
    if (target && !sameTray) {
      model.visible = false;
      onDrop(target.kind === "tray" ? { kind: "move", item, trayId: target.trayId } : { kind: target.kind, item });
    } else {
      model.position.copy(drag.origin);
    }
  });

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

  function resize() {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    Object.assign(tagLayer.style, { left: `${canvas.offsetLeft}px`, top: `${canvas.offsetTop}px`, width: `${clientWidth}px`, height: `${clientHeight}px` });
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const anchors = () => ({ now: extras.now, fridge: shelfSlots[1].slab, market: note, numbers: extras.numbers, chef: shelfSlots[0].slab, settings: knob });
  const lastAnchor = { x: -1, y: -1, inside: null };
  function anchor() {
    const part = anchors()[state.route];
    if (!part || !onAnchor) return;
    const spot = part.getWorldPosition(new THREE.Vector3()).project(camera);
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
        const anchor = model.parent.localToWorld(model.position.clone().add(new THREE.Vector3(0, (model.userData.height ?? 0.1) * (model.userData.fit ?? 1) + 0.012, 0)));
        const spot = anchor.project(camera);
        return { model, tag, x: ((spot.x + 1) / 2) * canvas.clientWidth, y: ((1 - spot.y) / 2) * canvas.clientHeight };
      })
      .sort((a, b) => b.tag.soon - a.tag.soon || b.model.position.z - a.model.position.z || a.x - b.x);
    ordered.forEach(({ model, tag, x, y }) => {
      const { element } = tag;
      const wanted = tag.soon || model === state.hoverModel || (state.focusId && model.userData.key === state.focusId);
      if (!show || !wanted || !model.visible || model === drag.model) {
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

  const clock = new THREE.Clock();
  function frame(now) {
    if (!reduced) boil(now);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (state.tween) {
      const progress = Math.min(1, (now - state.tween.start) / state.tween.duration);
      const k = ease(progress);
      state.position.lerpVectors(state.tween.from.position, state.tween.to.position, k);
      state.target.lerpVectors(state.tween.from.target, state.tween.to.target, k);
      state.door = THREE.MathUtils.lerp(state.tween.from.door, state.tween.to.door, reduced ? k : spring(Math.min(1, progress * 1.15)));
      state.freezer = THREE.MathUtils.lerp(state.tween.from.freezer, state.tween.to.freezer, k);
      if (progress === 1) state.tween = null;
    }
    const reach = Math.max(1.32, 1.05 / camera.aspect);
    camera.position.set(
      state.target.x + (state.position.x - state.target.x) * reach + state.tilt.x * 0.12,
      state.target.y + (state.position.y - state.target.y) * reach - state.tilt.y * 0.08,
      state.target.z + (state.position.z - state.target.z) * reach,
    );
    camera.lookAt(state.target);
    doorPivot.rotation.y = state.door;
    freezerPivot.rotation.y = state.freezer;
    Object.entries(extras).forEach(([key, extra]) => {
      const goal = extra.userData.goal ?? 0;
      const scale = THREE.MathUtils.damp(extra.scale.x, goal || 0.001, 6, delta);
      extra.scale.setScalar(scale);
      if (goal === 0 && scale < 0.01) extra.visible = false;
      if (key === "now" || key === "market") extra.rotation.y += delta * 0.35;
      if (key === "numbers") {
        extra.userData.arcs.forEach((arc, index) => {
          const share = Math.max(0.02, state.ringShares[index] ?? 0);
          const geometry = arc.geometry;
          const wanted = Math.PI * 2 * share;
          if (Math.abs((geometry.parameters.arc ?? 0) - wanted) > 0.01) {
            const next = THREE.MathUtils.damp(geometry.parameters.arc, wanted, 4, delta);
            arc.geometry.dispose();
            arc.geometry = new THREE.TorusGeometry(geometry.parameters.radius, geometry.parameters.tube, 16, 96, next);
          }
        });
      }
    });
    book.position.y = H + (state.route === "chef" ? 0.08 + Math.sin(now / 600) * 0.01 : 0);
    knob.rotation.z = THREE.MathUtils.damp(knob.rotation.z, state.route === "settings" ? -2.1 : 0, 5, delta);
    parts.forEach((objects, part) => {
      const lift = part === state.hover ? 1 : 0;
      objects.forEach((object) => {
        if (object.userData.glowing) return;
        object.userData.lift = THREE.MathUtils.damp(object.userData.lift ?? 0, lift, 10, delta);
        object.traverse((child) => {
          if (child.isMesh && child.material.emissive) child.material.emissive.setScalar(object.userData.lift * 0.06);
        });
      });
    });
    const open = THREE.MathUtils.clamp(-state.door / 1.2, 0, 1);
    if (open > 0.05 && !state.lit) state.litAt = now;
    state.lit = open > 0.05;
    const flicker = 260 > now - state.litAt && !reduced ? (Math.sin(now * 0.09) > 0 ? 1 : 0.35) : 1;
    inside.intensity = open * 0.6 * flicker;

    const doorPanel = door.children[0].material;
    doorPanel.color.lerpColors(WHITE, ALARM, state.doorAlarm ? 0.18 + Math.sin(now / 420) * 0.06 : 0);
    frost.material.opacity = THREE.MathUtils.damp(frost.material.opacity, state.frost, 2, delta);

    const positions = vapor.geometry.attributes.position;
    puffs.forEach((puff, index) => {
      puff.age += delta * 0.35;
      if (puff.age > 1) {
        puff.age -= 1;
        puff.x = (hash(index, now, 1) - 0.5) * (W - 0.1);
        puff.z = D / 2 + hash(index, now, 2) * 0.06;
      }
      positions.setXYZ(index, puff.x, 0.12 + puff.age * 0.5, puff.z);
    });
    positions.needsUpdate = true;
    vapor.material.opacity = reduced ? 0 : open * 0.12;

    [...items.children, ...doorItems.children].forEach((model) => {
      const age = (now - model.userData.born) / 520;
      const base = model.userData.born === 0 || age >= 1 || reduced ? 1 : 0 >= age ? 0.001 : spring(age);
      const hovered = state.hoverModel === model;
      model.userData.wobble = THREE.MathUtils.damp(model.userData.wobble ?? 0, hovered ? 1 : 0, 8, delta);
      model.scale.setScalar(Math.max(0.001, base * (model.userData.fit ?? 1) * (1 + model.userData.wobble * 0.06)));
      if (model !== drag.model && model.userData.home) {
        model.userData.push = THREE.MathUtils.damp(model.userData.push ?? 0, pushFor(model), 12, delta);
        model.position.x = model.userData.home.x + model.userData.push;
      }
      const lit = state.highlight.has(String(model.userData.item?.name ?? "").toLowerCase()) || (state.focusId && model.userData.key === state.focusId);
      if (lit || model.userData.lit) {
        const strength = lit ? 0.22 + Math.sin(now / 320) * 0.1 : 0;
        model.traverse((child) => child.isMesh && child.material.emissive?.copy(GLOW).multiplyScalar(strength));
        model.userData.lit = lit;
      }
      model.userData.rz ??= model.rotation.z;
      model.rotation.z = model.userData.rz + (reduced ? 0 : Math.sin(now / 90) * 0.04 * model.userData.wobble);
    });

    const fridgeTags = state.route === "fridge" && open > 0.8 && !state.tween;
    tagLayer.style.opacity = fridgeTags || state.route === "numbers" ? 1 : 0;
    ringTags.forEach((element, index) => {
      element.style.visibility = state.route === "numbers" && element.textContent ? "" : "hidden";
      if (state.route !== "numbers") return;
      const arc = extras.numbers.userData.arcs[index];
      const spot = arc.localToWorld(new THREE.Vector3(arc.geometry.parameters.radius, 0, 0)).project(camera);
      element.style.transform = `translate(${((spot.x + 1) / 2) * canvas.clientWidth - 14}px, ${((1 - spot.y) / 2) * canvas.clientHeight}px) translate(-100%, -50%)`;
    });
    placeTags(fridgeTags);
    anchor();

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    goTo,
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
