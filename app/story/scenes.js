import * as THREE from "../vendor/three.module.min.js";
import { RoundedBoxGeometry } from "../vendor/RoundedBoxGeometry.js";
import { engrave, foodModel, group, hash, instance, lumpy, merged, mesh, outline, paint } from "../engrave.js";
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

function heap(make, count, radius, seed, kinds = 3) {
  const pile = new THREE.Group();
  const variants = Array.from({ length: kinds }, (_, variant) => outline(group(make(variant))));
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

// A striped cloth awning on four poles, sagging between them.
function awning(seed) {
  const colors = [["#f4efe3", "#a8361f"], ["#f4efe3", "#3f6f8f"], ["#e8c35a", "#4f7a4a"]][seed % 3];
  const item = new THREE.Group();
  const strips = 7;
  for (let strip = 0; strips > strip; strip++) {
    const cloth = new THREE.PlaneGeometry(1.8 / strips, 1.2, 1, 8);
    const position = cloth.attributes.position;
    for (let index = 0; position.count > index; index++) {
      const y = position.getY(index);
      position.setZ(index, -(1 - (y / 0.6) ** 2) * 0.12);
    }
    cloth.computeVertexNormals();
    item.add(mesh(cloth, paint(colors[strip % 2], { side: THREE.DoubleSide }), (m) => {
      m.rotation.x = -Math.PI / 2 + 0.12;
      m.position.set(-0.9 + (1.8 / strips) * (strip + 0.5), 1.85, 0);
    }));
  }
  [[-0.86, -0.56], [0.86, -0.56], [-0.86, 0.56], [0.86, 0.56]].forEach(([x, z]) => item.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.9, 8), paint("#6b4a2a"), (m) => m.position.set(x, 0.95 + (z > 0 ? -0.07 : 0.07), z))));
  return item;
}

// A wicker basket, woven in two tones.
function basket(seed) {
  const item = new THREE.Group();
  for (let ring = 0; 5 > ring; ring++) {
    item.add(mesh(new THREE.CylinderGeometry(0.2 + ring * 0.012, 0.19 + ring * 0.012, 0.045, 18, 1, true), paint(ring % 2 ? "#b8925a" : "#8e6a3c", { side: THREE.DoubleSide }), (m) => (m.position.y = 0.025 + ring * 0.045)));
  }
  item.rotation.y = random(seed) * 6;
  return item;
}

// A basket of potatoes carried to market in both arms.
function load(seed) {
  const mound = mesh(lumpy(new THREE.SphereGeometry(0.19, 14, 10), 0.25), paint("#b8925a"), (m) => {
    m.position.y = 0.22;
    m.scale.y = 0.45;
  });
  const item = group(basket(seed), mound);
  item.scale.setScalar(0.85);
  return outline(group(item));
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
  const cover = seed % 2 ? umbrella("#d2492f", seed) : awning(seed);
  const baskets = [0, 1].map((index) => {
    const item = basket(seed * 3 + index);
    item.position.set(-0.45 + index * 0.9, 0, 0.62);
    return item;
  });
  baskets.forEach((item, index) => {
    const pile = heap(produce[index % produce.length][0], 8, 0.15, seed * 20 + index, 1);
    pile.position.set(item.position.x, 0.2, item.position.z);
    goods.add(pile);
  });
  return { props: group(table, cloth, cover, ...baskets), goods };
}

const PLINTHS = ["#3f6f8f", "#4f7a4a", "#b8862f", "#a8361f", "#6b5a8e"];
const SHUTTERS = ["#2f5d4a", "#3d5f86", "#7a3b26"];

// One slope of clay tiles: a corrugated surface of half-round tiles laid in overlapping courses.
function tileSlope(width, length) {
  const geometry = new THREE.PlaneGeometry(width, length, Math.max(8, Math.round(width / 0.11) * 6), Math.round(length / 0.16) * 3);
  const position = geometry.attributes.position;
  for (let index = 0; position.count > index; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const course = (((y + length / 2) % 0.16) + 0.16) % 0.16;
    position.setZ(index, Math.abs(Math.sin((x / 0.11) * Math.PI)) * 0.03 + (course / 0.16) * 0.014);
  }
  geometry.computeVertexNormals();
  return geometry;
}

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
  ];
  const run = depth / 2 + 0.2;
  const rise = 0.42;
  const slope = Math.atan2(rise, run);
  const tiles = paint("#a4502f");
  [-1, 1].forEach((side) => {
    parts.push(mesh(tileSlope(width + 0.36, Math.hypot(run, rise)), tiles, (m) => {
      m.rotation.set(-Math.PI / 2 + slope, side > 0 ? 0 : Math.PI, 0, "YXZ");
      m.position.set(0, height + rise / 2, (side * run) / 2);
    }));
  });
  parts.push(mesh(new THREE.CylinderGeometry(0.045, 0.045, width + 0.36, 10), paint("#8e4227"), (m) => {
    m.rotation.z = Math.PI / 2;
    m.position.y = height + rise + 0.01;
  }));
  const gable = new THREE.Shape([new THREE.Vector2(-depth / 2, 0), new THREE.Vector2(depth / 2, 0), new THREE.Vector2(0, rise)]);
  [-1, 1].forEach((side) => parts.push(mesh(new THREE.ShapeGeometry(gable), wall, (m) => {
    m.rotation.y = side * Math.PI / 2;
    m.position.set((side * width) / 2, height, 0);
  })));
  const doorX = (random(seed * 13) - 0.5) * (width - 0.7);
  parts.push(mesh(new THREE.BoxGeometry(0.48, 0.9, 0.03), paint("#e2d6be"), (m) => m.position.set(doorX, 0.45, depth / 2 + 0.012)));
  parts.push(mesh(new THREE.BoxGeometry(0.36, 0.62, 0.04), wood, (m) => m.position.set(doorX, 0.31, depth / 2 + 0.025)));
  parts.push(mesh(new THREE.CircleGeometry(0.18, 18, 0, Math.PI), wood, (m) => m.position.set(doorX, 0.62, depth / 2 + 0.046)));
  if (random(seed * 17) > 0.4) {
    const lampX = doorX + (doorX > 0 ? -0.42 : 0.42);
    parts.push(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), dark, (m) => m.position.set(lampX, 0.98, depth / 2 + 0.08)));
    parts.push(mesh(new THREE.BoxGeometry(0.1, 0.14, 0.1), dark, (m) => m.position.set(lampX, 0.9, depth / 2 + 0.16)));
    parts.push(mesh(new THREE.BoxGeometry(0.075, 0.1, 0.075), paint("#f1d27a"), (m) => m.position.set(lampX, 0.9, depth / 2 + 0.16)));
    parts.push(mesh(new THREE.ConeGeometry(0.08, 0.07, 4), dark, (m) => {
      m.position.set(lampX, 0.995, depth / 2 + 0.16);
      m.rotation.y = Math.PI / 4;
    }));
  }
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

// Colours per triangle, so neighbouring fields keep a crisp edge instead of blending into each other.
function tinted(geometry, colorAt) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = flat.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const centre = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const color = new THREE.Color();
  for (let first = 0; position.count > first; first += 3) {
    centre.set(0, 0, 0);
    for (let index = first; first + 3 > index; index++) centre.add(corner.fromBufferAttribute(position, index));
    color.set(colorAt(centre.divideScalar(3))).convertSRGBToLinear();
    for (let index = first; first + 3 > index; index++) colors.set([color.r, color.g, color.b], index * 3);
  }
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  const material = paint("#ffffff");
  material.vertexColors = true;
  return mesh(flat, material);
}

// Galeras and the land round it as the people of Pasto see it: the lower slopes a patchwork of potato, wheat and fallow fields stitched
// by hedges, the páramo above them and bare rock at the crater. The fields are drawn per pixel, so their edges stay clean at any distance.
const LAND = `
varying vec3 vLand;
float landHash(vec2 cell) { return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 landColor(vec3 p) {
  float wild = sin(p.x * 1.7 + sin(p.y * 1.1) * 2.0) * 0.5 + sin(p.y * 2.3 - p.x * 0.7) * 0.5;
  if (p.z > 6.4 + wild * 0.6) return mix(vec3(0.64, 0.6, 0.53), vec3(0.58, 0.54, 0.48), wild * 0.5 + 0.5);
  if (p.z > 3.8 + wild * 0.8) return mix(vec3(0.72, 0.7, 0.57), vec3(0.66, 0.65, 0.52), wild * 0.5 + 0.5);
  float along = p.x * 0.94 + p.y * 0.34 + sin(p.y * 0.8) * 0.5;
  float across = p.y * 0.94 - p.x * 0.34 + sin(p.x * 0.6) * 0.35;
  vec2 uv = vec2(along / 2.1, across / 1.25);
  vec2 edge = min(fract(uv), 1.0 - fract(uv)) * vec2(2.1, 1.25);
  if (0.07 > min(edge.x, edge.y)) return vec3(0.5, 0.56, 0.4);
  float crop = landHash(floor(uv) + 7.0);
  vec3 field = crop > 0.82 ? vec3(0.84, 0.75, 0.52) : crop > 0.66 ? vec3(0.7, 0.58, 0.44) : crop > 0.48 ? vec3(0.74, 0.69, 0.48)
    : crop > 0.3 ? vec3(0.6, 0.66, 0.46) : crop > 0.14 ? vec3(0.66, 0.7, 0.5) : vec3(0.55, 0.62, 0.43);
  return field;
}
`;

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
  const material = paint("#ffffff");
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLand;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLand = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${LAND}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = pow(landColor(vLand), vec3(2.2));");
    engrave(shader);
  };
  return group(mesh(land, material, (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, -0.2, -30);
  }), clouds());
}

// A few clouds snagged on the volcano, drawn like the rest: soft paper lumps with an ink edge.
function clouds() {
  const sky = new THREE.Group();
  [[-13, 7.4, -36, 2.4], [-1, 6.4, -33, 1.6], [11, 7, -37, 2.2]].forEach(([x, y, z, size], index) => {
    const cloud = new THREE.Group();
    for (let puff = 0; 5 > puff; puff++) {
      const spread = (puff - 2) / 2;
      cloud.add(mesh(lumpy(new THREE.SphereGeometry(0.5 + (1 - Math.abs(spread)) * 0.4, 14, 10), 0.2), paint("#f8f3e8"), (m) => {
        m.position.set(spread * 1.1, (1 - Math.abs(spread)) * 0.25 + random(index * 9 + puff) * 0.15, random(index * 5 + puff) * 0.3);
        m.scale.y = 0.55;
      }));
    }
    cloud.position.set(x, y, z);
    cloud.scale.setScalar(size);
    sky.add(cloud);
  });
  return outline(merged(sky));
}

// Trodden earth: patches of darker soil and dust under the cobbles and the stalls.
function earth(width, depth, base, seed) {
  const ground = tinted(new THREE.PlaneGeometry(width, depth, Math.round(width * 1.5), Math.round(depth * 1.5)), ({ x, y }) => {
    const patch = Math.sin(x * 0.7 + seed) * Math.sin(y * 0.9 - seed) + Math.sin(x * 2.1 + y * 1.3) * 0.35 + (hash(Math.floor(x * 1.5), Math.floor(y * 1.5), seed) - 0.5) * 0.5;
    return new THREE.Color(base).offsetHSL(0, 0, patch * 0.035).getStyle();
  });
  ground.rotation.x = -Math.PI / 2;
  return ground;
}

export function market() {
  const scene = new THREE.Group();
  const ground = earth(60, 60, "#e3d9c4", 2);
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
    // Behind each stall a seller points out the produce or haggles; across the table a buyer answers.
    people.push({ at: [x + Math.sin(turn) * -0.7, z - Math.cos(turn) * 0.7], facing: turn, act: ["Point", "Argue", "Talk"][index % 3] });
    if (index === 0) return;
    people.push({ at: [x - 0.3 + random(index) * 0.6, z + 0.85], facing: Math.PI + (random(index * 5) - 0.5) * 0.6, act: index % 2 ? "Talk" : "Rest" });
    if (index % 2 === 0) people.push({ at: [x + 0.55, z + 1.1], facing: Math.PI - 0.5 });
  });
  // Passers-by; an old man takes short steps over less ground, one carries a basket to sell.
  for (let index = 0; 5 > index; index++) {
    const old = index === 3;
    people.push({ at: [-6 + index * 2.4, -5.5 - random(index * 3) * 1.5], facing: Math.PI / 2, walk: [old ? 0.55 : 1.6, 0], act: old ? "Old" : index === 1 ? "Haul" : undefined, carry: index === 1 ? load(index) : undefined });
  }
  const folk = crowd(people, { seed: 2 });
  scene.add(folk);
  scene.userData.play = (k, now) => folk.userData.play(k, now);
  return scene;
}

// A cobbled lane: rounded stones instanced in staggered rows, one draw call however long the street.
function cobbles(width, length, seed) {
  const stone = mesh(lumpy(new THREE.SphereGeometry(0.11, 8, 5), 0.35), paint("#bfb39a"), (m) => (m.scale.y = 0.28));
  stone.userData.noOutline = true;
  const placements = [];
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const size = new THREE.Vector3();
  const step = 0.23 / Math.sqrt(density);
  for (let row = 0; length / step > row; row++) {
    for (let column = 0; width / step > column; column++) {
      const jitter = (salt) => random(seed + row * 131 + column * 7 + salt) - 0.5;
      turn.setFromAxisAngle(UP_AXIS, jitter(1) * 3);
      size.set(1 + jitter(2) * 0.3, 1 + jitter(3) * 0.4, 1 + jitter(4) * 0.3).multiplyScalar(step / 0.23);
      placements.push(matrix.compose(new THREE.Vector3(-width / 2 + (column + (row % 2) * 0.5) * step + jitter(5) * 0.04, 0.012, -row * step + jitter(6) * 0.04), turn, size).clone());
    }
  }
  return instance(group(stone), placements);
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);

// Arrival: a cobbled street of whitewashed houses leading to San Juan, Galeras behind, people walking to the market.
export function streetScene() {
  const scene = new THREE.Group();
  scene.add(earth(60, 80, "#e3d9c4", 5));
  scene.add(mesh(new THREE.PlaneGeometry(3.2, 40), paint("#9c8f78"), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.005, -8);
  }));
  const lane = cobbles(3.1, 30, 3);
  lane.position.z = 8;
  scene.add(lane);
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
    const old = index === 7;
    const haul = index % 5 === 4;
    const walk = index % 3 === 2 ? undefined : [0, (-3 - random(index * 9) * 2) * (old ? 0.35 : 1)];
    people.push({ at: [lane, 2 - index * 1.4], facing: Math.PI + (random(index) - 0.5) * 0.3, walk, act: walk && (old ? "Old" : haul ? "Haul" : undefined), carry: walk && haul ? load(index) : undefined });
  }
  // By the houses: two talking at a door, two more standing alone.
  [[-1.9, 1.2, Math.PI / 2, "Talk"], [-1.3, 1.2, -Math.PI / 2, "Talk"], [1.9, -3.5, -Math.PI / 2], [-1.9, -7.5, Math.PI / 2]].forEach(([x, z, facing, act]) => people.push({ at: [x, z], facing, act }));
  const folk = crowd(people, { seed: 5 });
  scene.add(folk);
  scene.userData.play = (k, now) => folk.userData.play(k, now);
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
  hinge.add(box(0.022, 0.26, 0.022, W - 0.06, 0.9, 0.085, paint("#b9b4a6")));
  [0.8, 1.0].forEach((y) => hinge.add(box(0.016, 0.016, 0.03, W - 0.06, y, 0.07, paint("#b9b4a6"))));
  body.add(hinge);
  body.userData.door = hinge;
  return outline(body);
}

// Cold air: soft puffs that leak through the door gap while the visitor holds, and burst out when the fridge opens.
function coldMist() {
  const count = 36;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  const fade = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  fade.addColorStop(0, "rgba(255,255,255,0.9)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = fade;
  context.fillRect(0, 0, 64, 64);
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ size: 0.34, map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, opacity: 0, color: "#b9d6dc" });
  const points = new THREE.Points(geometry, material);
  points.userData.play = (amount, drift) => {
    material.opacity = Math.min(1, amount * 1.1);
    for (let index = 0; count > index; index++) {
      const seed = random(index * 3.7);
      const age = (seed + drift * (0.2 + seed * 0.3)) % 1;
      positions[index * 3] = FRIDGE.W / 2 - 0.02 + age * (0.15 + seed * 0.35);
      positions[index * 3 + 1] = 0.15 + random(index * 1.9) * 0.95 - age * 0.25;
      positions[index * 3 + 2] = FRIDGE.D / 2 + 0.03 + age * (0.1 + random(index * 5.1) * 0.3);
    }
    geometry.attributes.position.needsUpdate = true;
  };
  return points;
}

// A hand in a red ruana sleeve that reaches for the handle, grips it while the visitor holds, and lets go once the door is open.
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
  // The neighbour home from the market, the same as in the street, stands by the handle and opens the door with her left hand.
  const home = crowd([{ at: [0.62, 0.42], facing: -1.88, kind: "vecina" }], { looks: 1, seed: 9, era: 2026 });
  const neighbour = home.children.find((child) => child.userData.reach);
  neighbour?.userData.pose("Rest", 0);
  scene.add(home);
  const grip = new THREE.Vector3(FRIDGE.W - 0.06 + 0.03, 0.9, 0.1);
  const handle = new THREE.Vector3();
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
  const glow = new THREE.PointLight("#ffd98a", 0, 2.4, 1.2);
  glow.position.set(0, 0.75, 0.05);
  scene.add(glow);
  const mist = coldMist();
  scene.add(mist);
  scene.userData.held = 0;
  scene.userData.play = (k) => {
    const held = scene.userData.held;
    const opening = THREE.MathUtils.smoothstep(k, 0.2, 0.42);
    const tremble = opening > 0 ? 0 : Math.sin(held * 70) * 0.025 * held;
    fridge.userData.door.rotation.y = -1.9 * Math.max(held * 0.22, opening) + tremble;
    const burst = k > 0.19 ? 1 - THREE.MathUtils.smoothstep(k, 0.24, 0.4) : 0;
    glow.intensity = Math.max(held * 5, opening * 3);
    mist.userData.play(Math.max(held, burst), held + k * 3);
    // She takes the handle, pulls the door a third of the way, and lets it swing on.
    fridge.userData.door.updateMatrixWorld(true);
    const share = THREE.MathUtils.smoothstep(k, 0.04, 0.16) * (1 - THREE.MathUtils.smoothstep(k, 0.27, 0.4));
    neighbour?.userData.reach("L", fridge.userData.door.localToWorld(handle.copy(grip)), share);
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
    // A reflective LCD, grey-green glass with ink digits, the kind a kitchen scale has always had.
    const context = canvas.getContext("2d");
    const glass = context.createLinearGradient(0, 0, 0, 96);
    glass.addColorStop(0, "#c9cfb6");
    glass.addColorStop(1, "#b2b99d");
    context.fillStyle = glass;
    context.fillRect(0, 0, 256, 96);
    context.font = "700 64px 'Hanken Grotesk', sans-serif";
    context.textAlign = "right";
    context.fillStyle = "#2a2620";
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
  // An enamelled kitchen scale: a body with a broad, gently sloped front panel that faces whoever stands over it, a steel pan with a rolled
  // lip, a recessed display, two buttons and feet.
  const enamel = paint("#ece4d3");
  const steel = paint("#c7c9c3");
  const dark = paint("#3b3026");
  const profile = new THREE.Shape();
  profile.moveTo(-0.18, 0);
  profile.lineTo(0.15, 0);
  profile.lineTo(0.15, 0.03);
  profile.quadraticCurveTo(0.15, 0.048, 0.13, 0.048);
  profile.lineTo(-0.08, 0.048);
  profile.lineTo(-0.18, 0.03);
  profile.lineTo(-0.18, 0);
  const body = mesh(new THREE.ExtrudeGeometry(profile, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 6 }), enamel, (m) => {
    m.rotation.y = Math.PI / 2;
    m.position.set(-0.16, 0.938, 0);
  });
  const tilt = Math.atan2(0.018, 0.1);
  const normal = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const onPanel = (x, lift) => new THREE.Vector3(x, 0.977, 0.13).addScaledVector(normal, 0.008 + lift);
  const pan = mesh(new THREE.LatheGeometry([[0, 0], [0.11, 0], [0.122, 0.004], [0.128, 0.011], [0.131, 0.015], [0.125, 0.013], [0.117, 0.006], [0, 0.006]].map(([x, y]) => new THREE.Vector2(x, y)), 64), steel, (m) => m.position.set(0, 0.997, -0.035));
  const stem = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.006, 24), dark, (m) => m.position.set(0, 0.996, -0.035));
  const bezel = mesh(new RoundedBoxGeometry(0.16, 0.068, 0.006, 2, 0.003), dark, (m) => {
    m.position.copy(onPanel(0.035, 0.003));
    m.rotation.x = tilt - Math.PI / 2;
  });
  const buttons = [-0.075, -0.11].map((x, index) => mesh(new THREE.CylinderGeometry(0.01, 0.011, 0.006, 20), paint(index ? "#3b3026" : "#c8432a"), (m) => {
    m.position.copy(onPanel(x, 0.003));
    m.rotation.x = tilt;
  }));
  const feet = [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.16], [0.14, 0.16]].map(([x, z]) => mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.01, 12), dark, (m) => m.position.set(x, 0.933, z)));
  const scale = outline(group(body, stem, pan, bezel, ...buttons, ...feet));
  const display = mesh(new THREE.PlaneGeometry(0.144, 0.054), new THREE.MeshBasicMaterial({ map: grams }), (m) => {
    m.position.copy(onPanel(0.035, 0.0065));
    m.rotation.x = tilt - Math.PI / 2;
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
    load.position.set(0, 1.01 + (1 - drop) * 0.45, -0.035);
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
  // The same mountains, today, behind the roofs.
  const hills = volcano();
  hills.position.set(4, 0, -2);
  scene.add(hills);
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
  scene.add(mesh(new THREE.PlaneGeometry(20, 3), paint("#9c8f78"), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.004, 0.9);
  }));
  const road = cobbles(3, 20, 7);
  road.rotation.y = -Math.PI / 2;
  road.position.set(-10, 0, 0.9);
  scene.add(road);
  scene.add(outline(merged(props)));
  const tote = bag();
  tote.scale.setScalar(0.85);
  const walker = crowd([{ at: [-5, -0.4], facing: Math.PI / 2, walk: [6.2, 0], act: "Carry", kind: "vecina", carry: tote }], { looks: 1, seed: 9, era: 2026 });
  scene.add(walker);
  // Two neighbours talking at a door, face to face.
  const neighbours = crowd([{ at: [3.35, -1.2], facing: Math.PI / 2, act: "Talk", kind: "vecino" }, { at: [3.95, -1.2], facing: -Math.PI / 2, act: "Talk", kind: "vecina" }], { looks: 2, seed: 13, era: 2026 });
  scene.add(neighbours);
  scene.userData.play = (k, now) => {
    walker.userData.play(k, now);
    neighbours.userData.play(k, now);
  };
  return scene;
}

const SEAT = { height: 0.42, back: 0.06 };

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
  // Grandparents from 1876 and parents from today, each on a stool just behind where they sit.
  const seats = [
    { at: [-0.55, -0.95], facing: 0, act: "SitTalk", kind: "campesino" },
    { at: [0.55, -0.95], facing: 0, act: "Sit", kind: "campesina" },
    { at: [-1.35, 0], facing: Math.PI / 2, act: "Sit", kind: "vecino" },
    { at: [1.35, 0.05], facing: -Math.PI / 2, act: "SitTalk", kind: "vecina" },
  ];
  seats.forEach(({ at: [px, pz], facing }) => {
    const back = [px - Math.sin(facing) * SEAT.back, pz - Math.cos(facing) * SEAT.back];
    props.add(mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.05, 20), paint("#a4743f"), (m) => m.position.set(back[0], SEAT.height - 0.025, back[1])));
    [0, 1, 2].forEach((leg) => {
      const angle = facing + (leg * Math.PI * 2) / 3;
      props.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, SEAT.height - 0.05, 8), paint("#7c5530"), (m) => m.position.set(back[0] + Math.sin(angle) * 0.1, (SEAT.height - 0.05) / 2, back[1] + Math.cos(angle) * 0.1)));
    });
  });
  scene.add(outline(merged(props)));
  const family = crowd(seats, { looks: 4, seed: 21 });
  scene.add(family);
  scene.userData.play = (k, now) => family.userData.play(k, now);
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

