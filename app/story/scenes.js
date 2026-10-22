import * as THREE from "../vendor/three.module.min.js";
import { RoundedBoxGeometry } from "../vendor/RoundedBoxGeometry.js";
import { foodModel, group, hash, instance, lumpy, merged, mesh, outline, paint } from "../engrave.js";
import { crowd } from "./people.js";

export const PAPER = "#f3ecdf";
const random = (seed) => hash(seed, seed * 1.7, seed * 2.3);
let density = 1;

export function setDensity(value) {
  density = value;
}

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
  const variants = [0, 1, 2].map((variant) => outline(group(make(variant))));
  const placements = variants.map(() => []);
  const total = Math.max(3, Math.round(count * density));
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  for (let index = 0; total > index; index++) {
    const angle = random(seed + index) * Math.PI * 2;
    const reach = Math.sqrt(random(seed + index * 3.1)) * radius;
    const place = new THREE.Vector3(Math.cos(angle) * reach, (1 - reach / radius) * radius * 0.55 + random(seed + index * 7.3) * 0.02, Math.sin(angle) * reach);
    rotation.setFromEuler(euler.set(random(index + seed) * 3, random(index * 2 + seed) * 6, random(index * 5 + seed) * 3));
    placements[index % variants.length].push(matrix.compose(place, rotation, one).clone());
  }
  variants.forEach((model, index) => placements[index].length && pile.add(instance(model, placements[index])));
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
  return { props: group(table, cloth, umbrella(seed % 2 ? "#d2492f" : "#f3c443", seed)), goods };
}

const PLINTHS = ["#3f6f8f", "#4f7a4a", "#b8862f", "#a8361f", "#6b5a8e"];
const SHUTTERS = ["#2f5d4a", "#3d5f86", "#7a3b26"];

// A whitewashed Pasto house: painted plinth, gabled tile roof with eaves, barred windows, a wooden door, and on two floors a balcony.
export function house(seed, { floors = 1 + Math.round(random(seed * 5)), width = 1.6 + random(seed) * 1.4 } = {}) {
  const height = floors * 1.15;
  const depth = 1.3;
  const wall = paint(random(seed * 3) > 0.25 ? "#f4efe3" : "#efe0c4");
  const plinthColor = PLINTHS[Math.floor(random(seed * 7) * PLINTHS.length)];
  const shutter = paint(SHUTTERS[Math.floor(random(seed * 11) * SHUTTERS.length)]);
  const dark = paint("#2b1d14");
  const wood = paint("#6b4a2a");
  const parts = [
    mesh(new THREE.BoxGeometry(width, height, depth), wall, (m) => (m.position.y = height / 2)),
    mesh(new THREE.BoxGeometry(width + 0.02, 0.32, depth + 0.02), paint(plinthColor), (m) => (m.position.y = 0.16)),
    mesh(new THREE.CylinderGeometry(depth * 0.62, depth * 0.62, width + 0.36, 3), paint("#a4502f"), (m) => {
      m.rotation.z = Math.PI / 2;
      m.rotation.x = Math.PI;
      m.scale.set(0.42, 1, 1);
      m.position.y = height + 0.14;
    }),
    mesh(new THREE.BoxGeometry(0.34, 0.66, 0.04), wood, (m) => m.position.set((random(seed * 13) - 0.5) * (width - 0.6), 0.33, depth / 2 + 0.02)),
  ];
  const windows = Math.max(1, Math.floor(width / 0.9));
  for (let floor = 0; floors > floor; floor++) {
    for (let index = 0; windows > index; index++) {
      const x = -width / 2 + (width / windows) * (index + 0.5);
      const y = floor * 1.15 + 0.72;
      parts.push(mesh(new THREE.BoxGeometry(0.3, 0.38, 0.03), dark, (m) => m.position.set(x, y, depth / 2 + 0.015)));
      [-0.21, 0.21].forEach((side) => parts.push(mesh(new THREE.BoxGeometry(0.12, 0.38, 0.03), shutter, (m) => m.position.set(x + side, y, depth / 2 + 0.03))));
      for (let bar = 0; 3 > bar; bar++) parts.push(mesh(new THREE.BoxGeometry(0.012, 0.38, 0.02), wood, (m) => m.position.set(x - 0.08 + bar * 0.08, y, depth / 2 + 0.04)));
    }
  }
  if (floors > 1) {
    const span = width * 0.7;
    parts.push(mesh(new THREE.BoxGeometry(span, 0.05, 0.36), wood, (m) => m.position.set(0, 1.15, depth / 2 + 0.18)));
    parts.push(mesh(new THREE.BoxGeometry(span, 0.04, 0.03), wood, (m) => m.position.set(0, 1.5, depth / 2 + 0.35)));
    for (let post = 0; 9 > post; post++) parts.push(mesh(new THREE.BoxGeometry(0.02, 0.34, 0.02), wood, (m) => m.position.set(-span / 2 + (span / 8) * post, 1.33, depth / 2 + 0.35)));
  }
  return group(...parts);
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

export function market() {
  const scene = new THREE.Group();
  const ground = mesh(new THREE.PlaneGeometry(60, 60, 1, 1), paint("#e7dfcd"), (m) => (m.rotation.x = -Math.PI / 2));
  scene.add(ground);
  scene.add(volcano());
  const street = new THREE.Group();
  for (let index = 0; 9 > index; index++) {
    const item = house(index, { floors: 1 + (index % 3 === 1 ? 1 : 0) });
    item.position.set(-9 + index * 2.3 + random(index) * 0.6, 0, -8 - random(index * 4) * 3);
    item.rotation.y = (random(index * 9) - 0.5) * 0.4;
    street.add(item);
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
    const { props, goods } = stall(index + 1, produce);
    [props, goods].forEach((part) => {
      part.position.set(x, y, z);
      part.rotation.y = (random(index * 13) - 0.5) * 0.5;
    });
    street.add(props);
    scene.add(goods);
  });
  scene.add(outline(merged(street)));
  const people = [];
  layout.forEach(([x, , z], index) => {
    const turn = (random(index * 13) - 0.5) * 0.5;
    people.push({ at: [x + Math.sin(turn) * -0.7, z - Math.cos(turn) * 0.7], facing: turn });
    if (index === 0) return;
    people.push({ at: [x - 0.3 + random(index) * 0.6, z + 0.85], facing: Math.PI + (random(index * 5) - 0.5) * 0.6 });
    if (index % 2 === 0) people.push({ at: [x + 0.55, z + 1.1], facing: Math.PI - 0.5 });
  });
  for (let index = 0; 5 > index; index++) people.push({ at: [-6 + index * 2.4, -5.5 - random(index * 3) * 1.5], facing: Math.PI / 2, walk: [1.6, 0] });
  const folk = crowd(people, { seed: 2 });
  scene.add(folk);
  scene.userData.play = (k) => folk.userData.play(k);
  return scene;
}

// Arrival: a cobbled street of whitewashed houses leading to San Juan, Galeras behind, people walking to the market.
export function streetScene() {
  const scene = new THREE.Group();
  scene.add(mesh(new THREE.PlaneGeometry(60, 80), paint("#e7dfcd"), (m) => (m.rotation.x = -Math.PI / 2)));
  scene.add(mesh(new THREE.PlaneGeometry(3.2, 40), paint("#cdbf9f"), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.005, -8);
  }));
  scene.add(volcano());
  const props = new THREE.Group();
  [-1, 1].forEach((side) => {
    let z = 6;
    for (let index = 0; 9 > index; index++) {
      const width = 1.8 + random(index * 7 + side) * 1.2;
      const item = house(index * 3 + (side > 0 ? 50 : 0), { floors: (index + (side > 0 ? 1 : 0)) % 3 === 0 ? 2 : 1, width });
      item.position.set(side * 2.6, 0, z - width / 2);
      item.rotation.y = -side * Math.PI / 2;
      props.add(item);
      props.add(mesh(new THREE.BoxGeometry(0.9, 0.12, width), paint("#d6ccb4"), (m) => m.position.set(side * 1.75, 0.06, z - width / 2)));
      z -= width + 0.05;
    }
  });
  const church = new THREE.Group();
  const white = paint("#f6f1e6");
  church.add(mesh(new THREE.BoxGeometry(4.2, 4.2, 1.6), white, (m) => (m.position.y = 2.1)));
  const gable = new THREE.Shape([new THREE.Vector2(-2.1, 0), new THREE.Vector2(2.1, 0), new THREE.Vector2(0, 1.3)]);
  church.add(mesh(new THREE.ExtrudeGeometry(gable, { depth: 1.6, bevelEnabled: false }), white, (m) => m.position.set(0, 4.2, -0.8)));
  [-1.6, 1.6].forEach((x) => {
    church.add(mesh(new THREE.BoxGeometry(1, 6.4, 1.2), white, (m) => m.position.set(x, 3.2, 0.25)));
    church.add(mesh(new THREE.BoxGeometry(0.5, 0.8, 0.05), paint("#2b1d14"), (m) => m.position.set(x, 5.2, 0.86)));
    church.add(mesh(new THREE.ConeGeometry(0.75, 1, 4), paint("#a4502f"), (m) => {
      m.position.set(x, 6.9, 0.25);
      m.rotation.y = Math.PI / 4;
    }));
  });
  church.add(mesh(new THREE.BoxGeometry(1.1, 1.9, 0.05), paint("#4b2c1c"), (m) => m.position.set(0, 0.95, 0.81)));
  church.add(mesh(new THREE.CircleGeometry(0.55, 16, 0, Math.PI), paint("#4b2c1c"), (m) => m.position.set(0, 1.9, 0.82)));
  church.add(mesh(new THREE.CircleGeometry(0.35, 16), paint("#3f6f8f"), (m) => m.position.set(0, 3.4, 0.81)));
  church.position.set(0, 0, -19);
  props.add(church);
  scene.add(outline(merged(props)));
  const people = [];
  for (let index = 0; 14 > index; index++) {
    const lane = (random(index * 3) - 0.5) * 2.4;
    people.push({ at: [lane, 2 - index * 1.4], facing: Math.PI + (random(index) - 0.5) * 0.3, walk: index % 3 === 2 ? undefined : [0, -3 - random(index * 9) * 2] });
  }
  [[-1.9, 1.2, Math.PI / 2], [1.9, -3.5, -Math.PI / 2], [-1.9, -7.5, Math.PI / 2]].forEach(([x, z, facing]) => people.push({ at: [x, z], facing }));
  const folk = crowd(people, { seed: 5 });
  scene.add(folk);
  scene.userData.play = (k) => folk.userData.play(k);
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
  hinge.add(box(0.022, 0.26, 0.022, W - 0.06, 0.74, 0.085, paint("#b9b4a6")));
  [0.64, 0.84].forEach((y) => hinge.add(box(0.016, 0.016, 0.03, W - 0.06, y, 0.07, paint("#b9b4a6"))));
  body.add(hinge);
  body.userData.door = hinge;
  return outline(body);
}

// A hand in a red ruana sleeve that reaches for the handle, grips it while the visitor holds, and lets go once the door is open.
function hand() {
  const skin = paint("#c98d68");
  const palm = mesh(new RoundedBoxGeometry(0.05, 0.1, 0.035, 2, 0.014), skin, (m) => m.position.set(0.012, 0, 0.012));
  const fingers = [0.033, 0.011, -0.011, -0.033].map((y, index) => {
    const finger = new THREE.Group();
    finger.position.set(-0.012, y, 0.03);
    finger.add(mesh(new THREE.CapsuleGeometry(0.0095, 0.04 - index * 0.003, 4, 8), skin, (m) => {
      m.rotation.z = Math.PI / 2;
      m.position.x = -0.026;
    }));
    return finger;
  });
  const thumb = mesh(new THREE.CapsuleGeometry(0.01, 0.034, 4, 8), skin, (m) => {
    m.position.set(-0.006, 0.058, 0.03);
    m.rotation.set(0, 0, 0.9);
  });
  const cuff = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), paint("#e8c35a"), (m) => {
    m.rotation.z = Math.PI / 2;
    m.position.set(0.05, 0, 0.012);
  });
  const sleeve = mesh(new THREE.CylinderGeometry(0.038, 0.046, 0.42, 12), paint("#a8361f"), (m) => {
    m.rotation.z = Math.PI / 2;
    m.position.set(0.27, 0, 0.012);
  });
  const root = group(palm, ...fingers, thumb, cuff, sleeve);
  root.scale.setScalar(1.35);
  root.userData.fingers = fingers;
  return outline(root);
}

export function kitchen() {
  const scene = group(kitchenFloor(8, 5));
  const fridge = fridgeBody();
  scene.add(fridge);
  const top = counter(1.4);
  top.position.set(-1.15, 0, -0.04);
  scene.add(top);
  const tote = bag();
  tote.position.set(-1.0, 0.93, 0);
  scene.add(tote);
  const reach = hand();
  fridge.userData.door.add(reach);
  const grip = new THREE.Vector3(FRIDGE.W - 0.06 + 0.045, 0.74, 0.085);
  const away = new THREE.Vector3();
  const travellers = [
    ["Potato", [-1.05, 1.18, 0], [-0.2, FRIDGE.SHELVES[1] + 0.012, 0.05]],
    ["Potato", [-0.98, 1.2, 0.02], [-0.08, FRIDGE.SHELVES[1] + 0.012, 0.06]],
    ["tree", [-1.02, 1.22, -0.02], [0.08, FRIDGE.SHELVES[0] + 0.012, 0.04]],
    ["oca", [-0.95, 1.2, 0.03], [0.2, FRIDGE.SHELVES[1] + 0.012, 0.05]],
    ["tree", [-1.06, 1.21, 0.02], [0.2, FRIDGE.SHELVES[0] + 0.012, 0.04]],
  ].map(([name, from, to]) => {
    const model = outline(group(name === "tree" ? treeTomato() : name === "oca" ? oca("#d98a9b") : foodModel(name)));
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    // Up over the open door, round to the front of the fridge, then straight in between the shelves: never through a wall.
    model.userData.path = new THREE.CatmullRomCurve3([start, new THREE.Vector3(-0.62, 1.42, 0.55), new THREE.Vector3(end.x, end.y + 0.06, FRIDGE.D / 2 + 0.32), new THREE.Vector3(end.x, end.y + 0.02, FRIDGE.D / 2 - 0.02), end], false, "centripetal");
    scene.add(model);
    return model;
  });
  scene.userData.held = 0;
  scene.userData.play = (k) => {
    const held = scene.userData.held;
    fridge.userData.door.rotation.y = -1.9 * Math.max(held * 0.3, THREE.MathUtils.smoothstep(k, 0.2, 0.42));
    const out = 1 - THREE.MathUtils.smoothstep(k, 0.06, 0.16) + THREE.MathUtils.smoothstep(k, 0.42, 0.56);
    reach.visible = 1 > out;
    reach.position.copy(grip).add(away.set(0.5, -0.1, 0.25).multiplyScalar(Math.min(1, out)));
    reach.userData.fingers.forEach((finger, index) => (finger.rotation.y = -(0.5 + held * 0.6) - index * 0.06));
    travellers.forEach((model, index) => {
      const t = THREE.MathUtils.smoothstep(k, 0.36 + index * 0.07, 0.62 + index * 0.07);
      model.position.copy(model.userData.path.getPoint(t));
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

export function scaleScene() {
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

export function plateScene() {
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

// The way home: dusk on a side street, someone carries the market bag home.
export function homeScene() {
  const scene = new THREE.Group();
  scene.add(mesh(new THREE.PlaneGeometry(40, 40), paint("#ddd3bd"), (m) => (m.rotation.x = -Math.PI / 2)));
  const props = new THREE.Group();
  let x = -9;
  for (let index = 0; 8 > index; index++) {
    const width = 1.7 + random(index * 19) * 1.1;
    const item = house(index * 7 + 90, { floors: index % 3 === 1 ? 2 : 1, width });
    item.position.set(x + width / 2, 0, -2.2);
    props.add(item);
    x += width + 0.04;
  }
  props.add(mesh(new THREE.BoxGeometry(20, 0.12, 0.9), paint("#d6ccb4"), (m) => m.position.set(0, 0.06, -1.1)));
  scene.add(outline(merged(props)));
  const walker = crowd([{ at: [-5, -0.4], facing: Math.PI / 2, walk: [6.2, 0] }], { looks: 1, seed: 9 });
  const tote = bag();
  tote.scale.setScalar(0.85);
  scene.add(walker, tote);
  const neighbours = crowd([{ at: [3.4, -1.3], facing: -Math.PI / 2 }, { at: [3.9, -1.4], facing: Math.PI }], { looks: 2, seed: 13 });
  scene.add(neighbours);
  scene.userData.play = (k) => {
    walker.userData.play(k);
    neighbours.userData.play(k);
    tote.position.set(-5 + 6.2 * k + 0.12, 0.3 + Math.abs(Math.sin(k * 90)) * 0.03, -0.2);
  };
  return scene;
}

// The table: the family round the plates and the pot, the food that went into the fridge eaten instead of thrown away.
export function tableScene() {
  const scene = group(kitchenFloor(6, 4));
  const props = new THREE.Group();
  props.add(mesh(new RoundedBoxGeometry(1.9, 0.06, 1.1, 2, 0.01), paint("#a4743f"), (m) => (m.position.y = 0.75)));
  props.add(mesh(new THREE.BoxGeometry(1.92, 0.006, 1.12), paint("#d2492f"), (m) => (m.position.y = 0.782)));
  [[-0.85, -0.45], [0.85, -0.45], [-0.85, 0.45], [0.85, 0.45]].forEach(([px, pz]) => props.add(mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), paint("#7c5530"), (m) => m.position.set(px, 0.36, pz))));
  const plates = [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]];
  plates.forEach(([px, pz]) => {
    props.add(mesh(new THREE.LatheGeometry([[0, 0], [0.13, 0], [0.17, 0.02], [0.18, 0.03], [0, 0.03]].map(([a, b]) => new THREE.Vector2(a, b)), 32), paint("#ffffff"), (m) => m.position.set(px, 0.786, pz)));
    props.add(mesh(lumpy(new THREE.SphereGeometry(0.07, 14, 10), 0.3), paint("#f2c94c"), (m) => {
      m.position.set(px - 0.02, 0.81, pz);
      m.scale.y = 0.45;
    }));
    props.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.022, 24), paint("#e9d3a0"), (m) => m.position.set(px + 0.07, 0.81, pz + 0.03)));
  });
  props.add(mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.18, 24), paint("#3b3026"), (m) => m.position.set(0, 0.87, 0)));
  props.add(mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 24), paint("#3b3026"), (m) => {
    m.position.set(0, 0.96, 0);
    m.rotation.x = Math.PI / 2;
  }));
  scene.add(outline(merged(props)));
  const family = crowd(
    [
      { at: [-0.55, -0.85], facing: 0 },
      { at: [0.55, -0.85], facing: 0 },
      { at: [-1.25, 0], facing: Math.PI / 2 },
      { at: [1.25, 0.05], facing: -Math.PI / 2 },
    ],
    { looks: 4, seed: 21 },
  );
  scene.add(family);
  scene.userData.play = (k) => family.userData.play(k);
  return scene;
}

export function stocked() {
  const fridge = fridgeBody();
  fridge.userData.door.rotation.y = -1.95;
  const { SHELVES } = FRIDGE;
  [
    ["Milk", -0.2, SHELVES[0], -0.08],
    ["Cheese", 0.12, SHELVES[0], -0.02],
    ["Egg", -0.1, SHELVES[1], 0],
    ["Potato", 0.18, SHELVES[1], 0.05],
    ["Carrot", -0.12, SHELVES[2], 0.04],
    ["Avocado", 0.16, SHELVES[2], 0.02],
  ].forEach(([name, x, y, z]) => {
    const food = foodModel(name, undefined, name === "Egg" ? 360 : name === "Potato" ? 540 : 300);
    food.position.set(x, y + 0.012, z);
    fridge.add(food);
  });
  [
    [0.02, SHELVES[0], 0.05],
    [0.08, SHELVES[0], 0.08],
  ].forEach(([x, y, z]) => {
    const tomato = outline(group(treeTomato()));
    tomato.position.set(x, y + 0.012, z);
    fridge.add(tomato);
  });
  return fridge;
}

export function doorSensor() {
  const fridge = fridgeBody();
  fridge.userData.door.rotation.y = -0.32;
  const reed = outline(mesh(new RoundedBoxGeometry(0.018, 0.07, 0.014, 2, 0.003), paint("#ffffff"), (m) => m.position.set(FRIDGE.W / 2 - 0.012, 0.98, FRIDGE.D / 2 + 0.008)));
  const magnet = outline(mesh(new RoundedBoxGeometry(0.016, 0.05, 0.012, 2, 0.003), paint("#d2492f"), (m) => m.position.set(FRIDGE.W - 0.014, 0.94, 0.07)));
  fridge.userData.door.add(magnet);
  const wire = new THREE.CatmullRomCurve3([
    new THREE.Vector3(FRIDGE.W / 2 - 0.012, 1.015, FRIDGE.D / 2 + 0.01),
    new THREE.Vector3(FRIDGE.W / 2 + 0.02, 1.2, FRIDGE.D / 2 + 0.01),
    new THREE.Vector3(FRIDGE.W / 2 + 0.01, 1.6, FRIDGE.D / 2 - 0.1),
  ]);
  const cable = outline(mesh(new THREE.TubeGeometry(wire, 24, 0.003, 6), paint("#1c1712")));
  return group(fridge, reed, cable);
}

export function probe() {
  const shelf = outline(mesh(new RoundedBoxGeometry(0.5, 0.012, 0.3, 2, 0.004), paint("#c4d3cc"), (m) => (m.position.y = -0.006)));
  const steel = paint("#c9d0d3");
  const stick = outline(
    group(
      mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 16), steel, (m) => {
        m.rotation.z = Math.PI / 2;
        m.position.set(0.0, 0.008, 0);
      }),
      mesh(new THREE.ConeGeometry(0.007, 0.02, 16), steel, (m) => {
        m.rotation.z = -Math.PI / 2;
        m.position.set(0.075, 0.008, 0);
      }),
      mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.025, 16), paint("#1c1712"), (m) => {
        m.rotation.z = Math.PI / 2;
        m.position.set(-0.075, 0.008, 0);
      }),
    ),
  );
  stick.rotation.y = 0.5;
  const wire = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.075, 0.008, 0.04),
    new THREE.Vector3(-0.14, 0.006, 0.08),
    new THREE.Vector3(-0.19, 0.01, -0.02),
    new THREE.Vector3(-0.23, 0.05, -0.12),
  ]);
  const cable = outline(mesh(new THREE.TubeGeometry(wire, 32, 0.0035, 6), paint("#1c1712")));
  const tomato = outline(group(treeTomato()));
  tomato.position.set(0.1, 0, -0.07);
  const potato = foodModel("Potato");
  potato.position.set(-0.05, 0, -0.09);
  return group(shelf, stick, cable, tomato, potato);
}

export function board() {
  const pcb = mesh(new RoundedBoxGeometry(0.11, 0.004, 0.05, 2, 0.0015), paint("#1d4a2c"));
  const shield = mesh(new RoundedBoxGeometry(0.03, 0.004, 0.034, 2, 0.001), paint("#c9d0d3"), (m) => m.position.set(-0.015, 0.004, 0));
  const antenna = group(
    ...[0, 1, 2, 3].map((index) => mesh(new THREE.BoxGeometry(0.0012, 0.0006, 0.028), paint("#e2c56b"), (m) => m.position.set(-0.045 + index * 0.004, 0.0025, 0))),
  );
  const usb = mesh(new RoundedBoxGeometry(0.009, 0.004, 0.012, 2, 0.001), paint("#c9d0d3"), (m) => m.position.set(0.054, 0.004, 0));
  const pins = group(
    ...[-1, 1].flatMap((side) =>
      Array.from({ length: 12 }, (_, index) =>
        mesh(new THREE.BoxGeometry(0.0035, 0.004, 0.0035), paint("#1c1712"), (m) => m.position.set(-0.035 + index * 0.0068, 0.004, side * 0.021)),
      ),
    ),
  );
  const led = mesh(new THREE.BoxGeometry(0.003, 0.002, 0.002), paint("#d2492f"), (m) => m.position.set(0.035, 0.003, 0.01));
  const chip = mesh(new THREE.BoxGeometry(0.008, 0.002, 0.008), paint("#1c1712"), (m) => m.position.set(0.02, 0.003, -0.005));
  return outline(group(pcb, shield, antenna, usb, pins, led, chip));
}

