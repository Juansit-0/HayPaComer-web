import * as THREE from "./vendor/three.module.min.js";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";

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
  market: { position: [0.42, 1.48, 1.02], target: [0.1, 1.42, 0.34], door: -0.5, freezer: 0 },
  numbers: { position: [0.55, 1.62, 1.45], target: [0, 1.42, 0.25], door: -0.4, freezer: -1.7 },
  chef: { position: [0.75, 2.25, 1.05], target: [0, 1.76, 0], door: -0.3, freezer: 0 },
  settings: { position: [0.2, 1.06, 0.82], target: [0, 1.02, -0.2], door: DOOR_OPEN, freezer: 0 },
};

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#cccccc";
const ease = (x) => 1 - Math.pow(1 - x, 4);

function hash(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function lumpy(geometry, amount) {
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const n = hash(Math.round(v.x * 40), Math.round(v.y * 40), Math.round(v.z * 40));
    v.multiplyScalar(1 + (n - 0.5) * amount);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function lathe(profile, segments = 32) {
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

const tones = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1);
tones.minFilter = THREE.NearestFilter;
tones.magFilter = THREE.NearestFilter;
tones.needsUpdate = true;

function paint(color, options = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: tones,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
  });
}

const ink = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.0045 }, color: { value: new THREE.Color("#121212") } },
  vertexShader:
    "uniform float thickness; void main() { float wobble = 0.82 + 0.22 * (sin(position.x * 71.0) + sin(position.y * 83.0 + 1.3) + sin(position.z * 67.0 + 2.1)) / 3.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * thickness * wobble, 1.0); }",
  fragmentShader: "uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }",
  side: THREE.BackSide,
});

function outline(root) {
  const meshes = [];
  root.traverse((child) => {
    if (child.isMesh && !child.userData.outline && !child.userData.noOutline && !child.material.transparent && !child.material.isShaderMaterial) meshes.push(child);
  });
  meshes.forEach((child) => {
    const line = new THREE.Mesh(child.geometry, ink);
    line.userData.outline = true;
    line.raycast = () => {};
    child.add(line);
  });
  return root;
}

function mesh(geometry, material, setup) {
  const result = new THREE.Mesh(geometry, material);
  setup?.(result);
  return result;
}

function group(...children) {
  const result = new THREE.Group();
  children.forEach((child) => result.add(child));
  return result;
}

function carton(color, band) {
  const box = mesh(new RoundedBoxGeometry(0.07, 0.18, 0.07, 2, 0.006), paint(color, { roughness: 0.7 }), (m) => (m.position.y = 0.09));
  const roof = new THREE.Shape([new THREE.Vector2(-0.035, 0), new THREE.Vector2(0.035, 0), new THREE.Vector2(0, 0.03)]);
  const top = mesh(new THREE.ExtrudeGeometry(roof, { depth: 0.07, bevelEnabled: false }), paint(color, { roughness: 0.7 }), (m) => m.position.set(0, 0.18, -0.035));
  const stripe = mesh(new THREE.BoxGeometry(0.072, 0.05, 0.072), paint(band, { roughness: 0.6 }), (m) => (m.position.y = 0.06));
  return group(box, top, stripe);
}

function jar(content) {
  const glass = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 28), paint("#ffffff", { transparent: true, opacity: 0.28, roughness: 0.05, clearcoat: 1 }), (m) => (m.position.y = 0.05));
  const fill = mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.075, 24), paint(content, { roughness: 0.9 }), (m) => (m.position.y = 0.04));
  const lid = mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.018, 28), paint("#1b1b1b", { roughness: 0.4, metalness: 0.3 }), (m) => (m.position.y = 0.105));
  return group(glass, fill, lid);
}

function bottle(color) {
  return group(
    mesh(lathe([[0, 0], [0.024, 0], [0.026, 0.01], [0.026, 0.1], [0.012, 0.14], [0.01, 0.17], [0, 0.17]]), paint(color, { roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.92 })),
    mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 16), paint("#c8432a", { roughness: 0.4 }), (m) => (m.position.y = 0.18)),
  );
}

function cluster(make, count, spacing) {
  const result = new THREE.Group();
  for (let index = 0; index < count; index++) {
    const piece = make(index);
    const row = index % 3;
    const layer = Math.floor(index / 3);
    piece.position.x += (row - (Math.min(count, 3) - 1) / 2) * spacing;
    piece.position.z += layer * spacing * 0.8 - 0.01;
    piece.rotation.y += (hash(index, count, spacing) - 0.5) * 1.2;
    result.add(piece);
  }
  return result;
}

const count = (grams, each, max) => Math.max(1, Math.min(max, Math.round(Number(grams || each) / each)));

function egg() {
  return mesh(lathe([[0, 0], [0.018, 0.004], [0.022, 0.018], [0.02, 0.04], [0.012, 0.056], [0, 0.06]]), paint("#f4ead8"));
}

const DETAILED = {
  Egg: (grams) => {
    const eggs = count(grams, 55, 6);
    const carton = group(
      mesh(new RoundedBoxGeometry(0.17, 0.03, 0.11, 2, 0.006), paint("#d9d2c3"), (m) => (m.position.y = 0.015)),
      ...Array.from({ length: 6 }, (_, index) =>
        mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.012, 16), paint("#c9c1b0"), (m) => m.position.set(((index % 3) - 1) * 0.052, 0.034, (Math.floor(index / 3) - 0.5) * 0.05)),
      ),
    );
    for (let index = 0; eggs > index; index++) {
      const piece = egg();
      piece.position.set(((index % 3) - 1) * 0.052, 0.032, (Math.floor(index / 3) - 0.5) * 0.05);
      carton.add(piece);
    }
    return carton;
  },
  Tomato: (grams) => cluster(() => FOODS.Tomato(), count(grams, 120, 4), 0.07),
  Potato: (grams) => cluster(() => FOODS.Potato(), count(grams, 180, 3), 0.075),
  Carrot: (grams) => cluster(() => FOODS.Carrot(), count(grams, 70, 3), 0.035),
  Onion: (grams) => cluster(() => FOODS.Onion(), count(grams, 150, 3), 0.07),
  Avocado: (grams) => cluster(() => FOODS.Avocado(), count(grams, 200, 2), 0.07),
  Banana: (grams) => {
    const bunch = new THREE.Group();
    const bananas = count(grams, 120, 4);
    for (let index = 0; index < bananas; index++) {
      const piece = FOODS.Banana();
      piece.rotation.y = (index - (bananas - 1) / 2) * 0.28;
      piece.position.y += index * 0.004;
      bunch.add(piece);
    }
    bunch.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.03, 8), paint("#6b5a2a"), (m) => {
      m.rotation.z = Math.PI / 2;
      m.position.set(-0.09, 0.03, 0);
    }));
    return bunch;
  },
  "Chicken breast": (grams) => {
    const tray = group(
      mesh(new RoundedBoxGeometry(0.17, 0.018, 0.11, 2, 0.005), paint("#ffffff"), (m) => (m.position.y = 0.009)),
      mesh(new THREE.BoxGeometry(0.17, 0.002, 0.11), paint("#dfeef2", { transparent: true, opacity: 0.35 }), (m) => (m.position.y = 0.05)),
    );
    const pieces = count(grams, 200, 2);
    for (let index = 0; pieces > index; index++) {
      const breast = mesh(lumpy(new THREE.SphereGeometry(0.045, 24, 16), 0.12), paint("#efbfa0"), (m) => {
        m.scale.set(1.2, 0.42, 0.8);
        m.position.set((index - (pieces - 1) / 2) * 0.07, 0.03, 0);
      });
      tray.add(breast);
    }
    return tray;
  },
};

const FOODS = {
  Tomato: () => {
    const fruit = mesh(lumpy(new THREE.SphereGeometry(0.036, 32, 24), 0.05), paint("#d0412a", { roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 }), (m) => {
      m.scale.set(1, 0.84, 1);
      m.position.y = 0.03;
    });
    const calyx = mesh(new THREE.ConeGeometry(0.018, 0.01, 5), paint("#2f7a4a"), (m) => m.position.set(0, 0.062, 0));
    return group(fruit, calyx);
  },
  Egg: () => mesh(lathe([[0, 0], [0.018, 0.004], [0.022, 0.018], [0.02, 0.04], [0.012, 0.056], [0, 0.06]]), paint("#f4ead8", { roughness: 0.75 })),
  Milk: () => {
    const box = carton("#ffffff", css("--color-mora"));
    box.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.012, 16), paint(css("--color-papa")), (m) => m.position.set(0.012, 0.2, 0.012)));
    box.add(mesh(new THREE.BoxGeometry(0.073, 0.012, 0.073), paint(css("--color-cilantro")), (m) => (m.position.y = 0.11)));
    return box;
  },
  "Orange juice": () => carton("#f39a33", "#2f7a4a"),
  "Chicken breast": () =>
    group(
      mesh(new THREE.BoxGeometry(0.15, 0.012, 0.1), paint("#ffffff", { roughness: 0.4 }), (m) => (m.position.y = 0.006)),
      mesh(lumpy(new THREE.SphereGeometry(0.05, 24, 16), 0.12), paint("#efbfa0", { roughness: 0.45, clearcoat: 0.3 }), (m) => {
        m.scale.set(1.35, 0.42, 0.85);
        m.position.y = 0.03;
      }),
    ),
  "Ground beef": () =>
    group(
      mesh(new THREE.BoxGeometry(0.14, 0.012, 0.1), paint("#ffffff", { roughness: 0.4 }), (m) => (m.position.y = 0.006)),
      mesh(lumpy(new THREE.SphereGeometry(0.045, 24, 16), 0.2), paint("#9c3b31", { roughness: 0.8 }), (m) => {
        m.scale.set(1.3, 0.45, 0.95);
        m.position.y = 0.03;
      }),
    ),
  Potato: () => mesh(lumpy(new THREE.IcosahedronGeometry(0.034, 3), 0.18), paint("#c99a52", { roughness: 0.95 }), (m) => {
    m.scale.set(1.25, 0.85, 1);
    m.position.y = 0.028;
  }),
  Carrot: () => {
    const root = mesh(new THREE.ConeGeometry(0.016, 0.16, 20), paint("#e8892b", { roughness: 0.6 }), (m) => {
      m.rotation.z = Math.PI / 2;
      m.position.set(0, 0.016, 0);
    });
    const leaves = mesh(new THREE.ConeGeometry(0.012, 0.05, 6), paint("#3d8a4f"), (m) => {
      m.rotation.z = -Math.PI / 2;
      m.position.set(-0.1, 0.018, 0);
    });
    return group(root, leaves);
  },
  Onion: () => mesh(lathe([[0, 0], [0.02, 0.004], [0.034, 0.026], [0.03, 0.048], [0.012, 0.064], [0.004, 0.08], [0, 0.08]]), paint("#d9b49a", { roughness: 0.35, clearcoat: 0.5 })),
  Avocado: () => mesh(lumpy(lathe([[0, 0], [0.026, 0.006], [0.034, 0.03], [0.028, 0.06], [0.016, 0.085], [0, 0.092]]), 0.04), paint("#2e4a1e", { roughness: 0.85 })),
  Banana: () => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.08, 0.02, 0), new THREE.Vector3(0, -0.015, 0.02), new THREE.Vector3(0.08, 0.03, 0));
    return mesh(new THREE.TubeGeometry(curve, 24, 0.016, 10), paint(css("--color-papa"), { roughness: 0.5 }), (m) => (m.position.y = 0.02));
  },
  Plantain: () => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.1, 0.02, 0), new THREE.Vector3(0, -0.012, 0.02), new THREE.Vector3(0.1, 0.03, 0));
    return mesh(new THREE.TubeGeometry(curve, 24, 0.02, 10), paint("#a7a83a", { roughness: 0.6 }), (m) => (m.position.y = 0.024));
  },
  Cheese: () => {
    const wedge = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.1, 0), new THREE.Vector2(0, 0.06)]);
    const block = mesh(new THREE.ExtrudeGeometry(wedge, { depth: 0.05, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 }), paint("#f2d47a"), (m) => {
      m.rotation.x = -Math.PI / 2;
      m.position.set(-0.05, 0, 0.025);
    });
    const holes = [[-0.02, 0.012, 0.027, 0.008], [0.012, 0.02, 0.027, 0.006], [-0.032, 0.03, 0.027, 0.005]].map(([x, y, z, r]) =>
      mesh(new THREE.CircleGeometry(r, 16), paint("#d9ae4a"), (m) => {
        m.position.set(x, y, z);
        m.userData.noOutline = true;
      }),
    );
    return group(block, ...holes);
  },
  Butter: () => mesh(new RoundedBoxGeometry(0.1, 0.035, 0.05, 2, 0.006), paint("#f6e3a0", { roughness: 0.5 }), (m) => (m.position.y = 0.018)),
  Yogurt: () =>
    group(
      mesh(lathe([[0, 0], [0.026, 0], [0.032, 0.07], [0, 0.07]]), paint(css("--color-papa"), { roughness: 0.45 })),
      mesh(new THREE.CylinderGeometry(0.0305, 0.028, 0.02, 28, 1, true), paint("#ffffff"), (m) => (m.position.y = 0.035)),
      mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.004, 28), paint("#d8d8d8", { metalness: 0.8, roughness: 0.3 }), (m) => (m.position.y = 0.072)),
    ),
  Bread: () =>
    group(
      mesh(lumpy(new RoundedBoxGeometry(0.18, 0.07, 0.09, 4, 0.03), 0.04), paint("#c98a46"), (m) => (m.position.y = 0.035)),
      ...[-0.05, 0, 0.05].map((x) => mesh(new THREE.BoxGeometry(0.012, 0.004, 0.06), paint("#8a5526"), (m) => {
        m.position.set(x, 0.071, 0);
        m.rotation.y = 0.5;
        m.userData.noOutline = true;
      })),
    ),
  Rice: () => mesh(lumpy(new RoundedBoxGeometry(0.09, 0.14, 0.05, 3, 0.02), 0.03), paint("#fbfbf8", { roughness: 0.9 }), (m) => (m.position.y = 0.07)),
  Pasta: () => mesh(new RoundedBoxGeometry(0.06, 0.17, 0.04, 2, 0.004), paint(css("--color-cobre"), { roughness: 0.6 }), (m) => (m.position.y = 0.085)),
  "Black beans": () => jar("#241c1a"),
  Lentils: () => jar("#8c5a2e"),
  "Soy sauce": () => bottle("#2b1a12"),
  Tuna: () => mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.035, 32), paint("#b9c2c6", { metalness: 0.85, roughness: 0.25 }), (m) => (m.position.y = 0.018)),
  Soup: () =>
    group(
      mesh(lathe([[0, 0], [0.06, 0], [0.065, 0.07], [0.068, 0.072], [0, 0.072]]), paint("#55534e", { metalness: 0.6, roughness: 0.35 })),
      mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.008, 32), paint("#6b6a64", { metalness: 0.6, roughness: 0.3 }), (m) => (m.position.y = 0.078)),
    ),
  Arepa: () => mesh(lumpy(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 32), 0.03), paint("#efe2b8", { roughness: 0.9 }), (m) => (m.position.y = 0.008)),
};

const BY_CATEGORY = {
  FRUIT: () => mesh(lumpy(new THREE.SphereGeometry(0.035, 24, 18), 0.06), paint("#e0a33a", { roughness: 0.4, clearcoat: 0.4 }), (m) => (m.position.y = 0.035)),
  VEGETABLE: () => mesh(lumpy(new THREE.SphereGeometry(0.035, 24, 18), 0.12), paint("#4e8a3e", { roughness: 0.7 }), (m) => (m.position.y = 0.035)),
  DAIRY: () => FOODS.Yogurt(),
  MEAT: () => FOODS["Ground beef"](),
  POULTRY: () => FOODS["Chicken breast"](),
  FISH: () => FOODS.Tuna(),
  EGGS: () => FOODS.Egg(),
  GRAIN: () => FOODS.Rice(),
  LEGUME: () => jar("#5a3b22"),
  BEVERAGE: () => bottle("#2f7a4a"),
  CONDIMENT: () => bottle("#7a3b22"),
  PREPARED: () => FOODS.Soup(),
};

export function foodModel(name, category, grams) {
  const model = DETAILED[name] ? DETAILED[name](grams) : (FOODS[name] ?? BY_CATEGORY[category] ?? BY_CATEGORY.VEGETABLE)();
  return outline(model);
}

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
  context.font = "64px Anton, Impact, sans-serif";
  context.fillText(text.toUpperCase(), 28, 290);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const VAPOR = 18;
const WHITE = new THREE.Color("#fdfdfb");
const ALARM = new THREE.Color("#d2492f");
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

export function createFridgeScene(canvas, { onPart, onDrop, labels, describe }) {
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

  const shell = paint("#fdfdfb", { roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const liner = paint("#bcd6df");
  const steel = paint("#c9d0d3", { metalness: 0.9, roughness: 0.25 });
  const glass = paint("#9fc3cf");
  const fridge = new THREE.Group();
  scene.add(fridge);
  const parts = new Map();
  const tag = (object, part) => {
    object.traverse((child) => {
      child.userData.part = part;
      if (child.isMesh) child.material = child.material.clone();
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
        ...[["Tomato", -0.06, 0.02], ["Egg", 0.04, -0.05], ["Avocado", 0.05, 0.06]].map(([name, x, z]) => {
          const food = foodModel(name);
          food.position.set(x, 0.03, z);
          food.scale.setScalar(1.4);
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
    chef: (() => {
      const page = group(
        mesh(new THREE.BoxGeometry(0.24, 0.004, 0.3), paint("#fffdf6", { roughness: 0.9 })),
        mesh(new THREE.BoxGeometry(0.16, 0.002, 0.012), paint("#121212"), (m) => m.position.set(-0.02, 0.004, -0.08)),
        mesh(new THREE.BoxGeometry(0.12, 0.002, 0.012), paint("#121212"), (m) => m.position.set(-0.04, 0.004, -0.04)),
        mesh(new THREE.BoxGeometry(0.14, 0.002, 0.012), paint("#121212"), (m) => m.position.set(-0.03, 0.004, 0)),
      );
      page.position.set(0.18, H + 0.12, 0.08);
      page.rotation.set(-0.5, -0.3, 0);
      return page;
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
  };
  camera.position.copy(state.position);
  camera.lookAt(state.target);

  function goTo(route) {
    const view = VIEWS[route] ?? VIEWS.now;
    state.route = route;
    state.tween = {
      start: performance.now(),
      duration: 1300,
      from: { position: camera.position.clone(), target: state.target.clone(), door: state.door, freezer: state.freezer },
      to: { position: new THREE.Vector3(...view.position), target: new THREE.Vector3(...view.target), door: view.door, freezer: view.freezer },
    };
    Object.entries(extras).forEach(([key, extra]) => {
      extra.userData.goal = key === route ? 1 : 0;
      if (key === route) extra.visible = true;
    });
  }

  function placeItems(fridgeTree, inventory) {
    const known = new Set([...items.children, ...doorItems.children].map((model) => model.userData.key));
    items.clear();
    doorItems.clear();
    tags.forEach((element) => element.remove());
    tags.clear();
    let order = 0;
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
      let x = slot.zone === "DOOR" ? 0.08 : -W / 2 + T + 0.06;
      inventory
        .filter((item) => item.trayId === slot.tray.id)
        .slice(0, 8)
        .forEach((item) => {
          const model = foodModel(item.name, item.category, item.grams);
          const width = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x;
          model.traverse((child) => {
            child.userData.item = item;
            child.userData.part = "fridge";
          });
          model.userData.key = item.id;
          model.userData.born = known.has(item.id) ? 0 : performance.now() + order++ * 70;
          const text = describe?.(item);
          if (text) {
            const element = document.createElement("span");
            element.className = `stage-tag${item.days !== null && item.days !== undefined && item.days <= 1 ? " soon" : ""}`;
            element.textContent = text;
            tagLayer.append(element);
            tags.set(model, element);
          }
          if (slot.zone === "DOOR") {
            model.position.set(x + width / 2, slot.y - 0.03, -0.05);
            doorItems.add(model);
          } else {
            model.position.set(x + width / 2, slot.y, slot.zone === "DRAWER" ? 0 : -0.02);
            items.add(model);
          }
          x += width + 0.03;
        });
    });
  }

  function setRings(shares) {
    state.ringShares = shares;
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
    return object?.userData.trayId ? { kind: "tray", trayId: object.userData.trayId, object } : null;
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
    if (!item || !item.usable) return;
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
      drag.moved = true;
      state.tilt.set(0, 0);
      state.pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
      raycaster.setFromCamera(state.pointer, camera);
      if (raycaster.ray.intersectPlane(drag.plane, point)) {
        drag.model.parent.worldToLocal(point);
        drag.model.position.copy(point).add(new THREE.Vector3(0, 0.02, 0));
      }
      const target = dropTargetAt(event.clientX, event.clientY);
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
    canvas.style.cursor = hit?.object.userData.item?.usable ? "grab" : state.hover ? "pointer" : "default";
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!drag.model) return;
    const { model, item, target, moved } = drag;
    glow(target, false);
    drag.model = null;
    drag.target = null;
    canvas.releasePointerCapture?.(event.pointerId);
    if (!moved) {
      onPart("fridge", { trayId: item.trayId });
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
    if (hit?.object.userData.item) return;
    if (part && part !== "use" && part !== "discard") onPart(part, hit.object.userData);
  });

  function trayAt(x, y) {
    const target = dropTargetAt(x, y);
    return target?.kind === "tray" ? target : null;
  }

  let shown = null;
  function showTarget(x, y) {
    const target = x === null ? null : trayAt(x, y);
    if (target?.object !== shown?.object) {
      glow(shown, false);
      glow(target, true);
    }
    shown = target;
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

  const clock = new THREE.Clock();
  function frame(now) {
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
    const reach = Math.max(1, 1.05 / camera.aspect);
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
      model.scale.setScalar(Math.max(0.001, base * (1 + model.userData.wobble * 0.06)));
      model.userData.rz ??= model.rotation.z;
      model.rotation.z = model.userData.rz + (reduced ? 0 : Math.sin(now / 90) * 0.04 * model.userData.wobble);
    });

    const showTags = state.route === "fridge" && open > 0.8;
    tagLayer.style.opacity = showTags ? 1 : 0;
    if (showTags) {
      const placed = [];
      [...tags].sort(([, a], [, b]) => b.classList.contains("soon") - a.classList.contains("soon")).forEach(([model, element]) => {
        const top = new THREE.Box3().setFromObject(model);
        const spot = new THREE.Vector3((top.min.x + top.max.x) / 2, top.max.y + 0.012, (top.min.z + top.max.z) / 2).project(camera);
        const x = ((spot.x + 1) / 2) * canvas.clientWidth;
        const y = ((1 - spot.y) / 2) * canvas.clientHeight;
        const half = element.offsetWidth / 2 + 4;
        const clash = placed.some((other) => 24 > Math.abs(other.y - y) && half + other.half > Math.abs(other.x - x));
        element.hidden = clash;
        if (!clash) placed.push({ x, y, half });
        element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      });
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    goTo,
    placeItems,
    setRings,
    setStatus,
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
