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

const PATH = {
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
};

export function createStory(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(PAPER);
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAPER, 18, 46);
  scene.add(new THREE.HemisphereLight("#ffffff", "#b9b19c", 1.0));
  const sun = new THREE.DirectionalLight("#ffffff", 1.4);
  sun.position.set(-10, 4.5, 2);
  scene.add(sun);
  scene.add(market());

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 120);
  const curve = (points) => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, "centripetal");
  const positions = curve(PATH.position);
  const targets = curve(PATH.target);
  const state = { goal: 0, progress: 0, running: true };

  function resize() {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const look = new THREE.Vector3();
  inkBias.value = 0.22;
  function frame(now) {
    if (!state.running) return;
    state.progress += (state.goal - state.progress) * 0.08;
    const k = THREE.MathUtils.clamp(state.progress, 0, 1);
    camera.position.copy(positions.getPointAt(k));
    camera.position.y += Math.sin(now / 1400) * 0.015;
    look.copy(targets.getPointAt(k));
    camera.lookAt(look);
    boil(now);
    renderer.render(scene, camera);
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
