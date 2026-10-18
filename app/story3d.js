import * as THREE from "./vendor/three.module.min.js";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";
import { boil, foodModel, group, hash, inkBias, lumpy, mesh, outline, paint } from "./stage3d.js";

const PAPER = "#f3ecdf";
const random = (seed) => hash(seed, seed * 1.7, seed * 2.3);

function oca(color) {
  return mesh(lumpy(new THREE.CapsuleGeometry(0.035, 0.07, 6, 12), 0.18), paint(color), (m) => {
    m.rotation.z = Math.PI / 2;
    m.position.y = 0.035;
  });
}

function treeTomato() {
  return group(
    mesh(new THREE.SphereGeometry(0.045, 20, 14), paint("#c8432a"), (m) => {
      m.scale.set(1, 1.35, 1);
      m.position.y = 0.06;
    }),
    mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.03, 6), paint("#4b5a2a"), (m) => (m.position.y = 0.13)),
  );
}

function naranjilla() {
  return mesh(lumpy(new THREE.SphereGeometry(0.05, 18, 14), 0.05), paint("#e8a13a"), (m) => (m.position.y = 0.05));
}

function heap(make, count, radius, seed) {
  const pile = new THREE.Group();
  const models = [0, 1, 2].map((variant) => outline(group(make(variant))));
  for (let index = 0; count > index; index++) {
    const angle = random(seed + index) * Math.PI * 2;
    const reach = Math.sqrt(random(seed + index * 3.1)) * radius;
    const piece = models[index % models.length].clone();
    piece.position.set(Math.cos(angle) * reach, (1 - reach / radius) * radius * 0.55 + random(seed + index * 7.3) * 0.02, Math.sin(angle) * reach);
    piece.rotation.set(random(index + seed) * 3, random(index * 2 + seed) * 6, random(index * 5 + seed) * 3);
    pile.add(piece);
  }
  return pile;
}

function umbrella(color, seed) {
  const top = mesh(new THREE.ConeGeometry(1.05, 0.38, 12, 1, true), paint(color, { side: THREE.DoubleSide }), (m) => (m.position.y = 1.95));
  const pole = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 8), paint("#6b4a2a"), (m) => (m.position.y = 0.95));
  const item = group(top, pole);
  item.rotation.z = (random(seed) - 0.5) * 0.12;
  return item;
}

function stall(seed, produce) {
  const table = group(
    mesh(new RoundedBoxGeometry(1.5, 0.06, 0.8, 2, 0.01), paint("#a4743f"), (m) => (m.position.y = 0.62)),
    ...[
      [-0.68, -0.34],
      [0.68, -0.34],
      [-0.68, 0.34],
      [0.68, 0.34],
    ].map(([x, z]) => mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), paint("#7c5530"), (m) => m.position.set(x, 0.3, z))),
  );
  const cloth = mesh(new THREE.BoxGeometry(1.52, 0.012, 0.82), paint(seed % 2 ? "#d2492f" : "#4b1f2e"), (m) => (m.position.y = 0.656));
  const goods = new THREE.Group();
  produce.forEach(([make, count, radius], index) => {
    const pile = heap(make, count, radius, seed * 10 + index);
    pile.position.set(-0.45 + index * 0.45, 0.66, 0);
    goods.add(pile);
  });
  return group(outline(table), cloth, goods, outline(umbrella(seed % 2 ? "#d2492f" : "#f3c443", seed)));
}

function house(seed) {
  const width = 1.4 + random(seed) * 1.2;
  const body = mesh(new THREE.BoxGeometry(width, 1.1, 1.2), paint("#f1ebdd"), (m) => (m.position.y = 0.55));
  const roof = mesh(new THREE.ConeGeometry(Math.max(width, 1.2) * 0.78, 0.6, 4), paint("#a4502f"), (m) => {
    m.position.y = 1.4;
    m.rotation.y = Math.PI / 4;
    m.scale.set(1, 1, 0.75);
  });
  const door = mesh(new THREE.PlaneGeometry(0.28, 0.5), paint("#4b2c1c"), (m) => m.position.set(0, 0.25, 0.601));
  return outline(group(body, roof, door));
}

function volcano() {
  const land = new THREE.PlaneGeometry(70, 34, 140, 68);
  const position = land.attributes.position;
  for (let index = 0; position.count > index; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const r = Math.hypot(x + 6, y * 1.6) / 22;
    const cone = Math.max(0, 1 - r) ** 1.6 * 9;
    const crater = Math.max(0, 0.6 - Math.hypot(x + 6, y * 1.6)) * 2;
    const ridges = (Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) * 0.5 + Math.sin(x * 2.3 + y * 1.7) * 0.25) * Math.max(0, 1 - r) * 0.9;
    const hills = Math.sin(x * 0.18) * 0.8 + Math.sin(x * 0.37 + 1) * 0.5;
    position.setZ(index, Math.max(0, cone - crater + ridges + hills * (r > 0.85 ? 1 : 0.4)));
  }
  land.computeVertexNormals();
  return mesh(land, paint("#cfc7ae"), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, -0.2, -30);
  });
}

function market() {
  const scene = new THREE.Group();
  const ground = mesh(new THREE.PlaneGeometry(60, 60, 1, 1), paint("#e7dfcd"), (m) => (m.rotation.x = -Math.PI / 2));
  scene.add(ground);
  scene.add(volcano());
  for (let index = 0; 9 > index; index++) {
    const item = house(index);
    item.position.set(-9 + index * 2.3 + random(index) * 0.6, 0, -8 - random(index * 4) * 3);
    item.rotation.y = (random(index * 9) - 0.5) * 0.4;
    scene.add(item);
  }
  const potato = () => foodModel("Potato");
  const tomatoes = () => treeTomato();
  const ocas = (variant) => oca(["#d98a9b", "#f0d27a", "#f4ece0"][variant]);
  const stalls = [
    [potato, 26, 0.24],
    [ocas, 30, 0.2],
    [tomatoes, 16, 0.18],
  ];
  const layout = [
    [0, 0, 0, stalls],
    [-2.4, 0, -1.2, [[potato, 22, 0.22], [() => naranjilla(), 18, 0.18], [ocas, 22, 0.18]]],
    [2.5, 0, -1.6, [[tomatoes, 14, 0.16], [potato, 20, 0.2], [() => naranjilla(), 14, 0.16]]],
    [-1.2, 0, -3.6, [[ocas, 18, 0.18], [potato, 18, 0.2], [tomatoes, 12, 0.15]]],
    [1.6, 0, -4.2, [[potato, 18, 0.2], [ocas, 16, 0.18], [() => naranjilla(), 12, 0.15]]],
  ];
  layout.forEach(([x, y, z, produce], index) => {
    const item = stall(index + 1, produce);
    item.position.set(x, y, z);
    item.rotation.y = (random(index * 13) - 0.5) * 0.5;
    scene.add(item);
  });
  return scene;
}

const FRIDGE = { W: 0.72, H: 1.7, D: 0.66, T: 0.035, SHELVES: [0.89, 0.62, 0.35] };

function kitchenFloor(width, depth) {
  return group(
    mesh(new THREE.PlaneGeometry(width, depth), paint("#ddd3bd"), (m) => (m.rotation.x = -Math.PI / 2)),
    mesh(new THREE.PlaneGeometry(width, 3.2), paint("#efe8d8"), (m) => m.position.set(0, 1.6, -depth / 2)),
  );
}

function counter(width) {
  return outline(
    group(
      mesh(new RoundedBoxGeometry(width, 0.06, 0.62, 2, 0.01), paint("#cdb38a"), (m) => (m.position.y = 0.9)),
      mesh(new THREE.BoxGeometry(width - 0.04, 0.87, 0.58), paint("#8e9f86"), (m) => (m.position.y = 0.435)),
    ),
  );
}

function bag() {
  return outline(
    group(
      mesh(new RoundedBoxGeometry(0.34, 0.36, 0.2, 2, 0.02), paint("#c79a5b"), (m) => (m.position.y = 0.18)),
      mesh(new THREE.TorusGeometry(0.09, 0.008, 8, 24, Math.PI), paint("#6b4a2a"), (m) => (m.position.y = 0.36)),
    ),
  );
}

function fridgeBody() {
  const { W, H, D, T, SHELVES } = FRIDGE;
  const shell = paint("#f6f1e6");
  const box = (w, h, d, x, y, z, material = shell) => mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.01, d / 2 - 0.001)), material, (m) => m.position.set(x, y, z));
  const body = group(
    box(W, H, T, 0, H / 2, -D / 2 + T / 2),
    box(T, H, D, -W / 2 + T / 2, H / 2, 0),
    box(T, H, D, W / 2 - T / 2, H / 2, 0),
    box(W, T, D, 0, H - T / 2, 0),
    box(W, T, D, 0, T / 2 + 0.02, 0),
    box(W, T, D, 0, 1.13 + T / 2, 0),
    box(W - 2 * T, 1.07, 0.004, 0, 0.585, -D / 2 + T + 0.003, paint("#d9ddd0")),
    ...SHELVES.map((y) => box(W - 2 * T - 0.01, 0.012, D - 0.12, 0, y, -0.03, paint("#c4d3cc"))),
    box(W, H - 1.13 - T, 0.05, 0, 1.13 + T + (H - 1.13 - T) / 2, D / 2 + 0.025),
  );
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, 0.04, D / 2);
  hinge.add(box(W, 1.09, 0.06, W / 2, 0.545, 0.03));
  body.add(hinge);
  body.userData.door = hinge;
  return outline(body);
}

function kitchen() {
  const scene = group(kitchenFloor(8, 5));
  const fridge = fridgeBody();
  scene.add(fridge);
  const top = counter(1.4);
  top.position.set(-1.15, 0, -0.04);
  scene.add(top);
  const tote = bag();
  tote.position.set(-1.0, 0.93, 0);
  scene.add(tote);
  const travellers = [
    ["Potato", [-1.05, 1.18, 0], [-0.2, FRIDGE.SHELVES[1] + 0.012, 0.05]],
    ["Potato", [-0.98, 1.2, 0.02], [-0.08, FRIDGE.SHELVES[1] + 0.012, 0.06]],
    ["tree", [-1.02, 1.22, -0.02], [0.08, FRIDGE.SHELVES[0] + 0.012, 0.04]],
    ["oca", [-0.95, 1.2, 0.03], [0.2, FRIDGE.SHELVES[1] + 0.012, 0.05]],
    ["tree", [-1.06, 1.21, 0.02], [0.2, FRIDGE.SHELVES[0] + 0.012, 0.04]],
  ].map(([name, from, to]) => {
    const model = outline(group(name === "tree" ? treeTomato() : name === "oca" ? oca("#d98a9b") : foodModel(name)));
    model.userData.from = new THREE.Vector3(...from);
    model.userData.to = new THREE.Vector3(...to);
    scene.add(model);
    return model;
  });
  scene.userData.play = (k) => {
    fridge.userData.door.rotation.y = -1.9 * THREE.MathUtils.smoothstep(k, 0.08, 0.35);
    travellers.forEach((model, index) => {
      const t = THREE.MathUtils.smoothstep(k, 0.36 + index * 0.07, 0.62 + index * 0.07);
      model.position.lerpVectors(model.userData.from, model.userData.to, t);
      model.position.y += Math.sin(Math.PI * t) * 0.32;
      model.rotation.y = t * 4;
    });
  };
  return scene;
}

function gramsTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  let shown = null;
  texture.userData.show = (value) => {
    if (value === shown) return;
    shown = value;
    const context = canvas.getContext("2d");
    context.fillStyle = "#1c1712";
    context.fillRect(0, 0, 256, 96);
    context.fillStyle = "#f3c443";
    context.font = "700 64px 'Hanken Grotesk', sans-serif";
    context.textAlign = "right";
    context.fillText(`${value} g`, 236, 72);
    texture.needsUpdate = true;
  };
  texture.userData.show(0);
  return texture;
}

function scaleScene() {
  const scene = group(kitchenFloor(4, 3));
  const top = counter(2.2);
  top.position.set(0, 0, 0);
  scene.add(top);
  const grams = gramsTexture();
  const scale = outline(
    group(
      mesh(new RoundedBoxGeometry(0.36, 0.05, 0.3, 2, 0.012), paint("#e9e3d6"), (m) => (m.position.y = 0.955)),
      mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 48), paint("#c9d0d3"), (m) => (m.position.y = 0.987)),
    ),
  );
  const display = mesh(new THREE.PlaneGeometry(0.12, 0.045), new THREE.MeshBasicMaterial({ map: grams }), (m) => {
    m.position.set(0.09, 0.955, 0.151);
    m.userData.noOutline = true;
  });
  scale.add(display);
  scene.add(scale);
  const load = new THREE.Group();
  [
    [-0.04, 0, -0.02],
    [0.05, 0, 0.03],
    [0.0, 0.07, 0.0],
    [-0.05, 0, 0.06],
  ].forEach(([x, y, z], index) => {
    const tomato = outline(group(treeTomato()));
    tomato.position.set(x, y, z);
    tomato.rotation.z = (index - 1.5) * 0.4;
    load.add(tomato);
  });
  scene.add(load);
  scene.userData.play = (k) => {
    const drop = THREE.MathUtils.smoothstep(k, 0.05, 0.4);
    load.position.set(0, 0.993 + (1 - drop) * 0.45, 0);
    grams.userData.show(Math.round(842 * THREE.MathUtils.smoothstep(k, 0.35, 0.65)));
  };
  return scene;
}

function plateScene() {
  const scene = group(kitchenFloor(4, 3));
  const table = outline(
    group(
      mesh(new RoundedBoxGeometry(1.6, 0.05, 1.0, 2, 0.01), paint("#a4743f"), (m) => (m.position.y = 0.75)),
      mesh(new THREE.BoxGeometry(1.62, 0.006, 1.02), paint("#d2492f"), (m) => (m.position.y = 0.778)),
    ),
  );
  scene.add(table);
  const plate = outline(mesh(new THREE.LatheGeometry([[0, 0], [0.17, 0], [0.22, 0.025], [0.23, 0.035], [0, 0.035]].map(([x, y]) => new THREE.Vector2(x, y)), 48), paint("#ffffff"), (m) => (m.position.y = 0.781)));
  scene.add(plate);
  const food = new THREE.Group();
  for (let index = 0; 16 > index; index++) {
    const angle = random(index * 1.3) * Math.PI * 2;
    const reach = Math.sqrt(random(index * 2.9)) * 0.1;
    const egg = outline(mesh(lumpy(new THREE.SphereGeometry(0.022 + random(index) * 0.012, 14, 10), 0.35), paint(index % 4 ? "#f2c94c" : "#f7e6a6")));
    egg.position.set(-0.05 + Math.cos(angle) * reach, 0.81 + random(index * 5) * 0.012, Math.sin(angle) * reach * 0.8);
    egg.scale.y = 0.6;
    food.add(egg);
  }
  for (let index = 0; 10 > index; index++) {
    const angle = random(index * 4.1) * Math.PI * 2;
    const reach = Math.sqrt(random(index * 6.7)) * 0.09;
    const bit = outline(mesh(lumpy(new THREE.SphereGeometry(0.011, 10, 8), 0.3), paint(index % 3 ? "#c8432a" : "#3f7a3a")));
    bit.position.set(-0.05 + Math.cos(angle) * reach, 0.832, Math.sin(angle) * reach * 0.8);
    food.add(bit);
  }
  const arepa = outline(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 32), paint("#e9d3a0"), (m) => m.position.set(0.12, 0.83, 0.07)));
  food.add(arepa);
  scene.add(food);
  const cup = outline(
    group(
      mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 24), paint("#ffffff"), (m) => (m.position.y = 0.83)),
      mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 16), paint("#ffffff"), (m) => m.position.set(0.06, 0.83, 0)),
    ),
  );
  cup.position.set(0.42, 0, -0.18);
  scene.add(cup);
  scene.userData.play = (k) => {
    food.position.y = (1 - THREE.MathUtils.smoothstep(k, 0.05, 0.3)) * 0.25;
    food.rotation.y = k * 0.6;
  };
  return scene;
}

const SCENES = [
  {
    build: market,
    share: 0.34,
    light: [[-10, 4.5, 2], 0.22],
    position: [
      [0.4, 6.5, 13],
      [0.2, 3.2, 7.5],
      [0.1, 1.8, 3.4],
      [0.05, 1.25, 1.35],
      [0.25, 1.05, 0.75],
    ],
    target: [
      [-1, 2.6, -10],
      [0, 1.2, -3],
      [0, 0.8, -0.6],
      [0, 0.7, 0],
      [-0.1, 0.68, 0],
    ],
  },
  {
    build: kitchen,
    share: 0.3,
    light: [[3, 7, 6], 0.02],
    position: [
      [-1.5, 1.45, 1.25],
      [-0.9, 1.4, 1.75],
      [-0.2, 1.25, 1.9],
      [0.15, 1.05, 1.45],
    ],
    target: [
      [-1.0, 1.05, 0],
      [-0.6, 1.0, 0],
      [-0.1, 0.85, 0],
      [0, 0.75, 0],
    ],
  },
  {
    build: scaleScene,
    share: 0.18,
    light: [[-2, 6, 5], 0.04],
    position: [
      [0.75, 1.45, 0.85],
      [0.4, 1.25, 0.6],
      [0.25, 1.15, 0.45],
    ],
    target: [
      [0, 1.0, 0],
      [0.03, 0.99, 0.04],
      [0.06, 0.97, 0.08],
    ],
  },
  {
    build: plateScene,
    share: 0.18,
    light: [[-3, 8, 4], 0.0],
    position: [
      [0.0, 1.9, 0.45],
      [0.35, 1.45, 0.65],
      [0.55, 1.15, 0.7],
    ],
    target: [
      [0, 0.8, 0],
      [0.02, 0.8, 0],
      [0.04, 0.8, 0.02],
    ],
  },
];

const INK_FRAGMENT = `
uniform float uSweep;
uniform float uTime;
uniform float uAspect;
varying vec2 vUv;
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float ragged = noise(p * vec2(9.0, 3.0) + uTime) * 0.09 + noise(p * vec2(40.0, 6.0) - uTime) * 0.035;
  float streaks = step(0.72, noise(vec2(p.x * 90.0, p.y * 2.0 + uTime))) * 0.05;
  float y = vUv.y + ragged + streaks;
  float upper = uSweep * 2.6 - 0.15;
  float lower = (uSweep - 0.5) * 2.6 - 0.15;
  float ink = step(y, upper) * step(lower, y);
  if (ink < 0.5) discard;
  gl_FragColor = vec4(0.11, 0.09, 0.08, 1.0);
}`;

export function createStory(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(PAPER);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAPER, 18, 46);
  scene.add(new THREE.HemisphereLight("#ffffff", "#b9b19c", 1.0));
  const sun = new THREE.DirectionalLight("#ffffff", 1.4);
  sun.position.set(-10, 4.5, 2);
  scene.add(sun);

  const curve = (points, offset) => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point).add(offset)), false, "centripetal");
  let start = 0;
  const chapters = SCENES.map((chapter, index) => {
    const offset = new THREE.Vector3(index * 100, 0, 0);
    const world = chapter.build();
    world.position.copy(offset);
    scene.add(world);
    const entry = { world, light: chapter.light, from: start, to: start + chapter.share, positions: curve(chapter.position, offset), targets: curve(chapter.target, offset) };
    start += chapter.share;
    return entry;
  });

  const overlay = new THREE.Scene();
  const flat = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  const ink = new THREE.ShaderMaterial({
    uniforms: { uSweep: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: INK_FRAGMENT,
    depthTest: false,
  });
  overlay.add(mesh(new THREE.PlaneGeometry(1, 1), ink, (m) => m.position.set(0.5, 0.5, 0)));

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 120);
  const state = { goal: 0, progress: 0, running: true };

  function resize() {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    ink.uniforms.uAspect.value = camera.aspect;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const SWEEP = 0.045;
  const look = new THREE.Vector3();
  inkBias.value = 0.22;
  function frame(now) {
    if (!state.running) return;
    state.progress += (state.goal - state.progress) * 0.08;
    const share = THREE.MathUtils.clamp(state.progress, 0, 0.9999);
    const chapter = chapters.find((entry) => entry.to > share) ?? chapters[chapters.length - 1];
    const k = (share - chapter.from) / (chapter.to - chapter.from);
    look.copy(chapter.targets.getPointAt(k));
    camera.position.copy(chapter.positions.getPointAt(k)).sub(look).multiplyScalar(Math.max(1, 0.95 / camera.aspect)).add(look);
    camera.position.y += Math.sin(now / 1400) * 0.01;
    camera.lookAt(look);
    chapter.world.userData.play?.(k);
    sun.position.set(...chapter.light[0]);
    inkBias.value = chapter.light[1];
    let sweep = 0;
    chapters.slice(1).forEach((entry) => {
      const distance = (share - entry.from) / SWEEP;
      if (1 > Math.abs(distance)) sweep = (distance + 1) / 2;
    });
    ink.uniforms.uSweep.value = sweep;
    boil(now);
    ink.uniforms.uTime.value = Math.floor(now / 125) * 0.37;
    renderer.clear();
    renderer.render(scene, camera);
    if (sweep > 0) renderer.render(overlay, flat);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    seek(progress) {
      state.goal = progress;
    },
    stop() {
      state.running = false;
      inkBias.value = 0;
      renderer.dispose();
    },
  };
}
