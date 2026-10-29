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

// 1876 colours came from earth and lime: plinths of ochre and red earth, a little indigo, never paint from a tin.
const PLINTHS = ["#8a6a48", "#9c5a3a", "#b08a52", "#6f5a44", "#4f5f6e"];
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
// Houses and blocks are drawn at a small unit and set at the scale of the people: a storey stands well over a head (a figure is 1.6 tall).
const HOUSE_SCALE = 2.1;
const BLOCK_SCALE = 2.6;
const scaled = (item, scale) => {
  item.scale.setScalar(scale);
  return item;
};

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
  // Where the lime render has fallen away the adobe shows, in a few patches low on the wall.
  for (let patch = 0; 3 > patch; patch++) {
    if (random(seed * 23 + patch) > 0.55) continue;
    const size = 0.12 + random(seed * 29 + patch) * 0.22;
    parts.push(mesh(new THREE.BoxGeometry(size * 1.4, size, 0.012), paint("#b48c62"), (m) => m.position.set((random(seed * 31 + patch) - 0.5) * (width - 0.4), 0.42 + random(seed * 37 + patch) * (height - 0.7), depth / 2 + 0.006)));
  }
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
  const mountain = volcano();
  mountain.position.z = -8;
  scene.add(mountain);
  const street = new THREE.Group();
  let across = -20;
  for (let index = 0; 9 > index; index++) {
    const width = 1.7 + random(index) * 1.1;
    const item = scaled(house(index, { floors: 1 + (index % 3 === 1 ? 1 : 0), width }), HOUSE_SCALE);
    item.position.set(across + (width * HOUSE_SCALE) / 2, 0, -11 - random(index * 4) * 2.5);
    item.rotation.y = (random(index * 9) - 0.5) * 0.3;
    street.add(item);
    across += width * HOUSE_SCALE + 0.2;
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
    [-4.8, 0, 0.4, [[tomatoes, 14, 0.16], [ocas, 18, 0.18], [potato, 16, 0.2]]],
    [4.9, 0, -0.2, [[() => naranjilla(), 16, 0.17], [potato, 22, 0.22], [tomatoes, 12, 0.15]]],
    [-4.2, 0, -4.9, [[potato, 20, 0.21], [tomatoes, 12, 0.15], [ocas, 16, 0.18]]],
    [4.4, 0, -5.4, [[ocas, 20, 0.19], [() => naranjilla(), 12, 0.15], [potato, 16, 0.2]]],
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
  // Sacks of potatoes and baskets set down on the ground between the stalls.
  const ground_goods = new THREE.Group();
  [[-1.3, 1.4], [1.2, 1.1], [-3.3, -2.1], [3.2, -2.6], [-0.2, -6.2], [-6.1, -2], [6.2, -3]].forEach(([x, z], index) => {
    if (index % 2) {
      const item = basket(index * 5 + 3);
      item.position.set(x, 0, z);
      ground_goods.add(item);
      return;
    }
    ground_goods.add(mesh(lumpy(new THREE.SphereGeometry(0.24, 12, 9), 0.18), paint("#c8b089"), (m) => {
      m.position.set(x, 0.24, z);
      m.scale.set(0.9, 1.25, 0.8);
    }));
    ground_goods.add(mesh(lumpy(new THREE.SphereGeometry(0.2, 12, 9), 0.2), paint("#bea47d"), (m) => {
      m.position.set(x + 0.36, 0.2, z + 0.08);
      m.scale.set(0.9, 1.2, 0.8);
    }));
  });
  street.add(ground_goods);
  scene.add(outline(merged(street)));
  const people = [];
  layout.forEach(([x, , z], index) => {
    const turn = (random(index * 13) - 0.5) * 0.5;
    // Behind each stall a seller points out the produce or haggles; across the table a buyer answers.
    people.push({ at: [x + Math.sin(turn) * -0.7, z - Math.cos(turn) * 0.7], facing: turn, act: ["Point", "Argue", "Talk"][index % 3] });
    if (index === 0) return;
    people.push({ at: [x - 0.3 + random(index) * 0.6, z + 0.85], facing: Math.PI + (random(index * 5) - 0.5) * 0.6, act: index % 2 ? "Talk" : "Rest" });
    if (index % 2 === 0) people.push({ at: [x + 0.55, z + 1.1], facing: Math.PI - 0.5, act: "Talk" });
  });
  // Neighbours stopped to talk between the stalls, face to face.
  [[-2.6, 1.8, 0.4], [2.7, 1.5, -0.3], [-0.4, -2.4, 1.1], [6.6, 1.6, 0.8], [-6.8, 1.9, -0.6], [0.6, -7.2, 0.2]].forEach(([x, z, turn], index) => {
    people.push({ at: [x, z], facing: Math.PI / 2 + turn, act: index % 2 ? "Talk" : "Argue" });
    people.push({ at: [x + Math.sin(Math.PI / 2 + turn) * 0.62, z + Math.cos(Math.PI / 2 + turn) * 0.62], facing: -Math.PI / 2 + turn, act: "Talk" });
  });
  // Passers-by in both directions along two paths through the market; an old man takes short steps, some carry baskets to sell.
  for (let index = 0; 10 > index; index++) {
    const old = index === 3 || index === 8;
    const haul = index % 4 === 1;
    const back = index % 2 === 1;
    const path = index % 3 === 0 ? -6.8 : 3.0;
    const distance = (old ? 0.6 : 1.8) * (back ? -1 : 1);
    people.push({ at: [(back ? 7 : -7) + (index % 5) * (back ? -2.6 : 2.6), path - random(index * 3) * 1.2], facing: back ? -Math.PI / 2 : Math.PI / 2, walk: [distance, 0], act: old ? "Old" : haul ? "Haul" : undefined, carry: haul ? load(index) : undefined });
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
  // The acequia: a stone-lined channel of water down the middle of the street, as Pasto's streets had.
  scene.add(mesh(new THREE.PlaneGeometry(0.22, 40), paint("#7f8e8a"), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.018, -8);
  }));
  [-0.13, 0.13].forEach((x) => scene.add(mesh(new THREE.BoxGeometry(0.05, 0.03, 40), paint("#8f857a"), (m) => m.position.set(x, 0.02, -8))));
  // Galeras stands well behind the church, whose front would otherwise sink into its lower slope.
  const mountain = volcano();
  mountain.position.z = -8;
  scene.add(mountain);
  const props = new THREE.Group();
  [-1, 1].forEach((side) => {
    let z = 7;
    for (let index = 0; 5 > index; index++) {
      const width = (1.8 + random(index * 7 + side) * 1.2) * HOUSE_SCALE;
      const item = scaled(house(index * 3 + (side > 0 ? 50 : 0), { floors: (index + (side > 0 ? 1 : 0)) % 3 === 0 ? 2 : 1, width: width / HOUSE_SCALE }), HOUSE_SCALE);
      item.position.set(side * (2.5 + (1.3 * HOUSE_SCALE) / 2), 0, z - width / 2);
      item.rotation.y = -side * Math.PI / 2;
      props.add(item);
      props.add(mesh(new THREE.BoxGeometry(0.9, 0.12, width), paint("#d6ccb4"), (m) => m.position.set(side * 2.05, 0.06, z - width / 2)));
      z -= width + 0.1;
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
  church.position.set(0, 0, -22);
  church.scale.setScalar(1.3);
  props.add(church);
  scene.add(outline(merged(props)));
  const people = [];
  // Fewer walkers, each in a lane of its own and well apart, so nobody walks through anybody: the slow ones walk ahead, the quick ones behind.
  const LANES = [-1.05, -0.35, 0.35, 1.05];
  for (let index = 0; 8 > index; index++) {
    const old = index === 5;
    const haul = index === 2 || index === 6;
    const lane = LANES[index % 4] + (random(index * 3) - 0.5) * 0.15;
    people.push({ at: [lane, 2.5 - index * 2.6], facing: Math.PI, walk: [0, old ? -1.2 : -3.4 - (index % 4) * 0.25], act: old ? "Old" : haul ? "Haul" : undefined, carry: haul ? load(index) : undefined });
  }
  // By the houses: two talking at a door, two more standing alone.
  [[-2.1, 1.2, Math.PI / 2, "Talk"], [-1.5, 1.2, -Math.PI / 2, "Talk"], [2.1, -3.5, -Math.PI / 2], [-2.1, -7.5, Math.PI / 2], [2.1, -11, -Math.PI / 2, "Talk"], [1.5, -11, Math.PI / 2, "Talk"]].forEach(([x, z, facing, act]) => people.push({ at: [x, z], facing, act }));
  const folk = crowd(people, { seed: 5 });
  scene.add(folk);
  scene.userData.play = (k, now) => folk.userData.play(k, now);
  return scene;
}

const FRIDGE = { W: 0.72, H: 1.7, D: 0.66, T: 0.035, SHELVES: [0.89, 0.62, 0.35] };

// A kitchen corner: the floor runs toward the viewer from a back wall at z = back, and a side wall closes it at x = side, so the counter
// and the fridge stand against the walls instead of out in the middle of a room.
function kitchenCorner(back, side) {
  const wall = paint("#efe8d8");
  return group(
    mesh(new THREE.PlaneGeometry(10, 8), paint("#ddd3bd"), (m) => {
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0, back + 4);
    }),
    mesh(new THREE.PlaneGeometry(10, 3.2), wall, (m) => m.position.set(0, 1.6, back)),
    mesh(new THREE.PlaneGeometry(8, 3.2), wall, (m) => {
      m.rotation.y = Math.PI / 2;
      m.position.set(side, 1.6, back + 4);
    }),
  );
}

// Wall cupboards over a counter, with their handles.
function cupboards(props, from, to, z) {
  const doors = Math.max(1, Math.round((to - from) / 0.5));
  const width = (to - from) / doors;
  for (let index = 0; doors > index; index++) {
    const x = from + width * (index + 0.5);
    props.add(mesh(new THREE.BoxGeometry(width - 0.02, 0.6, 0.34), paint("#8e9f86"), (m) => m.position.set(x, 1.95, z + 0.17)));
    props.add(mesh(new THREE.BoxGeometry(0.02, 0.14, 0.02), paint("#5f6b59"), (m) => m.position.set(x + width / 2 - 0.08, 1.75, z + 0.35)));
  }
}

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
  // The corner: the back wall right behind the fridge and the counter, the side wall where the counter ends.
  const BACK = -0.36;
  const SIDE = -1.87;
  const scene = group(kitchenCorner(BACK, SIDE));
  const fridge = fridgeBody();
  scene.add(fridge);
  const top = counter(1.4);
  top.position.set(-1.15, 0, -0.04);
  scene.add(top);
  const tote = bag();
  tote.position.set(-1.0, 0.93, 0);
  scene.add(tote);
  const room = new THREE.Group();
  wallDecor(room, BACK, { windowX: 1.05, shelfX: 1.2, clockX: 0.75, sill: 1.05 });
  cupboards(room, SIDE + 0.02, -0.45, BACK);
  floorTiles(room, 8, 5);
  counterDecor(room, -1.55, 0.93, -0.05);
  scene.add(outline(merged(room)));
  // What is already in the fridge before the market bag goes in: milk and cheese up top, eggs below, carrots in the bottom.
  const { SHELVES } = FRIDGE;
  [
    ["Milk", -0.22, SHELVES[0], -0.12],
    ["Cheese", -0.05, SHELVES[0], -0.14],
    ["Egg", 0.05, SHELVES[2], -0.1],
    ["Carrot", -0.16, SHELVES[2], 0.02],
  ].forEach(([name, x, y, z]) => {
    const food = foodModel(name, undefined, name === "Egg" ? 360 : 300);
    food.position.set(x, y + 0.012, z);
    fridge.add(food);
  });
  // The neighbour home from the market, the same as in the street, stands by the handle and opens the door with her left hand.
  const home = crowd([{ at: [0.62, 0.42], facing: -1.88, kind: "vecina" }], { looks: 1, seed: 9, era: 2026 });
  const neighbour = home.children.find((child) => child.userData.reach);
  neighbour?.userData.pose("Rest", 0);
  scene.add(home);
  // The front of the handle bar, where her palm closes on it, and the point behind the bar her fingers curl round to.
  const grip = new THREE.Vector3(FRIDGE.W - 0.06, 0.9, 0.11);
  const behind = new THREE.Vector3(FRIDGE.W - 0.06, 0.9, 0.065);
  const handle = new THREE.Vector3();
  const wrap = new THREE.Vector3();
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
  scene.userData.door = fridge.userData.door;
  scene.userData.play = (k) => {
    const held = scene.userData.held;
    const opening = THREE.MathUtils.smoothstep(k, 0.2, 0.42);
    // The door follows the dragged handle all the way, then the scroll carries it on: one swing, no jump between the two.
    fridge.userData.door.rotation.y = -1.9 * Math.max(held, opening);
    const burst = k > 0.19 ? 1 - THREE.MathUtils.smoothstep(k, 0.24, 0.4) : 0;
    glow.intensity = Math.max(held * 5, opening * 3);
    mist.userData.play(Math.max(held, burst), held + k * 3);
    // She takes the handle, pulls the door a third of the way, and lets it swing on.
    fridge.userData.door.updateMatrixWorld(true);
    // Her hand lets go of the handle once the door swings past the reach of her arm (a quarter of the swing).
    const swing = Math.max(held, opening);
    const share = THREE.MathUtils.smoothstep(k, 0.04, 0.16) * (1 - THREE.MathUtils.smoothstep(k, 0.27, 0.4)) * (1 - THREE.MathUtils.smoothstep(swing, 0.24, 0.45));
    neighbour?.userData.reach("L", fridge.userData.door.localToWorld(handle.copy(grip)), share, fridge.userData.door.localToWorld(wrap.copy(behind)));
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
  const scene = group(kitchenCorner(-0.32, -1.12));
  const top = counter(2.2);
  top.position.set(0, 0, 0);
  scene.add(top);
  const room = new THREE.Group();
  wallDecor(room, -0.32, { windowX: 0.45, shelfX: -0.55, clockX: 1.25, sill: 1.05 });
  floorTiles(room, 4, 3);
  counterDecor(room, -0.55, 0.93, 0.02);
  scene.add(outline(merged(room)));
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
  // The place set round the plate: a folded napkin with fork and knife, a glass of juice, salt and a sprig of flowers in a little vase.
  const setting = new THREE.Group();
  setting.add(mesh(new THREE.BoxGeometry(0.12, 0.008, 0.2), paint("#efe6c8"), (m) => m.position.set(-0.33, 0.785, 0.02)));
  setting.add(mesh(new THREE.BoxGeometry(0.014, 0.006, 0.18), paint("#9aa0a4"), (m) => m.position.set(-0.32, 0.792, 0.02)));
  setting.add(mesh(new THREE.BoxGeometry(0.016, 0.006, 0.19), paint("#9aa0a4"), (m) => m.position.set(0.3, 0.784, 0.06)));
  setting.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 16), paint("#f0a640"), (m) => m.position.set(0.3, 0.84, -0.2)));
  setting.add(mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.06, 12), paint("#f6f1e6"), (m) => m.position.set(-0.28, 0.81, -0.24)));
  setting.add(mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.09, 14), paint("#3f6f8f"), (m) => m.position.set(-0.5, 0.825, -0.3)));
  [[-0.51, -0.3, "#c8432a"], [-0.48, -0.29, "#f2c94c"], [-0.5, -0.32, "#d98a9b"]].forEach(([x, z, color], index) => {
    setting.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 4), paint("#4f7a4a"), (m) => m.position.set(x, 0.92, z)));
    setting.add(mesh(lumpy(new THREE.SphereGeometry(0.018, 8, 6), 0.3), paint(color), (m) => m.position.set(x, 0.98 + index * 0.012, z)));
  });
  scene.add(outline(merged(setting)));
  scene.userData.play = (k) => {
    food.position.y = (1 - THREE.MathUtils.smoothstep(k, 0.05, 0.3)) * 0.25;
    food.rotation.y = k * 0.6;
  };
  return scene;
}

// The way home: dusk on a side street, someone carries the market bag home.
const FACADES = ["#e9e1d0", "#d8c7a6", "#c9d4cf", "#e6cfa8", "#efe9de"];
const SIGNS = ["#c8432a", "#2f6f8f", "#e0a43a", "#4f7a4a", "#6b5a8e"];

// A Pasto block of today, three or four floors of concrete frame: bare brick or painted render, slab edges at each floor, aluminium windows,
// a balcony or two with an iron railing, a shop with a roll-up shutter and its sign on the ground floor, a water tank and the steel bars
// left standing on the roof for the floor still to come.
function block(seed, { floors = 2 + Math.round(random(seed * 5) * 2), width = 2.2 + random(seed) * 1.6, brick = random(seed * 3) > 0.62 } = {}) {
  const ground = 1.05;
  const storey = 0.85;
  const height = ground + (floors - 1) * storey;
  const depth = 1.3;
  const front = depth / 2;
  const wall = paint(brick ? "#b5633d" : FACADES[Math.floor(random(seed * 7) * FACADES.length)]);
  const slab = paint("#bdb6a8");
  const frame = paint("#9aa0a4");
  const glass = paint("#3d4a55");
  const iron = paint("#2b2a28");
  const parts = [mesh(new THREE.BoxGeometry(width, height, depth), wall, (m) => (m.position.y = height / 2))];
  if (brick) for (let row = 1; height / 0.2 > row; row++) parts.push(mesh(new THREE.BoxGeometry(width + 0.004, 0.012, 0.004), paint("#d9c3a8"), (m) => m.position.set(0, row * 0.2, front + 0.002)));
  for (let floor = 1; floors > floor; floor++) parts.push(mesh(new THREE.BoxGeometry(width + 0.04, 0.07, depth + 0.06), slab, (m) => (m.position.y = ground + (floor - 1) * storey)));
  parts.push(mesh(new THREE.BoxGeometry(width + 0.04, 0.16, depth + 0.04), slab, (m) => (m.position.y = height + 0.08)));
  const columns = Math.max(1, Math.floor(width / 0.8));
  for (let floor = 1; floors > floor; floor++) {
    const y = ground + (floor - 1) * storey + 0.43;
    for (let index = 0; columns > index; index++) {
      const x = -width / 2 + (width / columns) * (index + 0.5);
      parts.push(mesh(new THREE.BoxGeometry(0.5, 0.48, 0.03), frame, (m) => m.position.set(x, y, front + 0.012)));
      parts.push(mesh(new THREE.BoxGeometry(0.44, 0.42, 0.03), glass, (m) => m.position.set(x, y, front + 0.022)));
      parts.push(mesh(new THREE.BoxGeometry(0.02, 0.42, 0.034), frame, (m) => m.position.set(x, y, front + 0.024)));
    }
    if (random(seed * 11 + floor) > 0.45) {
      const span = Math.min(width - 0.3, 1.4);
      const base = y - 0.4;
      parts.push(mesh(new THREE.BoxGeometry(span, 0.06, 0.32), slab, (m) => m.position.set(0, base, front + 0.16)));
      parts.push(mesh(new THREE.BoxGeometry(span, 0.025, 0.025), iron, (m) => m.position.set(0, base + 0.32, front + 0.31)));
      const bars = Math.round(span / 0.09);
      for (let bar = 0; bars >= bar; bar++) parts.push(mesh(new THREE.BoxGeometry(0.012, 0.3, 0.012), iron, (m) => m.position.set(-span / 2 + (span / bars) * bar, base + 0.17, front + 0.31)));
    }
  }
  // The shop: a corrugated shutter half up, its sign above, and the door to the flats beside it.
  const shopWidth = Math.min(1.3, width - 0.75);
  const shopX = -width / 2 + 0.12 + shopWidth / 2;
  parts.push(mesh(new THREE.BoxGeometry(shopWidth, 0.8, 0.03), paint("#8d9196"), (m) => m.position.set(shopX, 0.4, front + 0.015)));
  for (let rib = 1; 10 > rib; rib++) parts.push(mesh(new THREE.BoxGeometry(shopWidth, 0.01, 0.036), paint("#6f7378"), (m) => m.position.set(shopX, rib * 0.08, front + 0.018)));
  const sign = SIGNS[Math.floor(random(seed * 13) * SIGNS.length)];
  parts.push(mesh(new THREE.BoxGeometry(shopWidth + 0.1, 0.2, 0.05), paint(sign), (m) => m.position.set(shopX, 0.91, front + 0.03)));
  parts.push(mesh(new THREE.BoxGeometry(shopWidth * 0.6, 0.04, 0.054), paint("#f4efe3"), (m) => m.position.set(shopX, 0.91, front + 0.032)));
  const doorX = shopX + shopWidth / 2 + 0.36;
  parts.push(mesh(new THREE.BoxGeometry(0.42, 0.85, 0.03), paint("#3b3026"), (m) => m.position.set(doorX, 0.425, front + 0.015)));
  parts.push(mesh(new THREE.BoxGeometry(0.36, 0.26, 0.032), glass, (m) => m.position.set(doorX, 0.64, front + 0.017)));
  if (random(seed * 17) > 0.35) parts.push(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 16), iron, (m) => m.position.set(width / 2 - 0.4, height + 0.37, -0.1)));
  if (random(seed * 19) > 0.4) {
    [-1, 1].forEach((side) => [-0.45, 0.45].forEach((z) => parts.push(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 5), iron, (m) => m.position.set(side * (width / 2 - 0.08), height + 0.4, z)))));
  }
  return group(...parts);
}

// Concrete poles along the kerb with the cables of today sagging between them.
function wires(from, to, z) {
  const poles = new THREE.Group();
  const lines = new THREE.Group();
  const step = 7.5;
  const tops = [];
  for (let x = from; to >= x; x += step) {
    poles.add(mesh(new THREE.CylinderGeometry(0.09, 0.14, 7.4, 8), paint("#b3ada2"), (m) => m.position.set(x, 3.7, z)));
    poles.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 1.1), paint("#8d8880"), (m) => m.position.set(x, 7.0, z)));
    tops.push(x);
  }
  const cable = new THREE.MeshBasicMaterial({ color: "#2b2620" });
  [[7.05, -0.45, 0.7], [7.05, 0.45, 0.6], [6.2, 0, 0.9]].forEach(([height, offset, sag]) => {
    for (let index = 1; tops.length > index; index++) {
      const points = Array.from({ length: 9 }, (_, step) => {
        const share = step / 8;
        return new THREE.Vector3(tops[index - 1] + (tops[index] - tops[index - 1]) * share, height - Math.sin(share * Math.PI) * sag, z + offset);
      });
      lines.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.012, 4), cable, (m) => (m.userData.noOutline = true)));
    }
  });
  return group(outline(merged(poles)), lines);
}

export function homeScene() {
  const scene = new THREE.Group();
  scene.add(mesh(new THREE.PlaneGeometry(40, 40), paint("#ddd3bd"), (m) => (m.rotation.x = -Math.PI / 2)));
  // The same mountains, today, above the roofs of the blocks: a little taller in the frame, so Galeras still shows over three floors.
  const hills = volcano();
  hills.position.set(2, 0, -6);
  hills.scale.set(1.3, 2.6, 1);
  scene.add(hills);
  const props = new THREE.Group();
  // Bare brick on some, painted render on most, as a street of Pasto mixes them; a cross street opens partway along, and through it Galeras
  // shows whole.
  let x = -16;
  [2, 3, 2, 0, 3, 2, 3, 2].forEach((floors, index) => {
    if (!floors) {
      x += 6;
      return;
    }
    const width = (2.0 + random(index * 19) * 1.2) * BLOCK_SCALE;
    const item = scaled(block(index * 7 + 90, { floors, width: width / BLOCK_SCALE, brick: index % 3 === 1 }), BLOCK_SCALE);
    item.position.set(x + width / 2, 0, -1.55 - (1.3 * BLOCK_SCALE) / 2);
    props.add(item);
    x += width + 0.08;
  });
  // A concrete pavement with its kerb, and asphalt where 1876 had cobbles.
  props.add(mesh(new THREE.BoxGeometry(60, 0.14, 0.9), paint("#cfcac0"), (m) => m.position.set(0, 0.07, -1.1)));
  props.add(mesh(new THREE.BoxGeometry(60, 0.15, 0.1), paint("#b9b3a8"), (m) => m.position.set(0, 0.075, -0.62)));
  // The asphalt runs on toward the viewer, so a tall phone frame, which pulls the camera back, still stands on the street.
  scene.add(mesh(new THREE.PlaneGeometry(90, 70), paint("#6f6c68"), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.004, 34.4);
  }));
  for (let dash = -30; 30 > dash; dash += 1.6) scene.add(mesh(new THREE.PlaneGeometry(0.8, 0.07), paint("#e8e2d4"), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set(dash, 0.006, 0.9);
  }));
  scene.add(wires(-15, 16, -0.72));
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
// Where the family sits: two across the table, facing the camera, and one at each end.
const PLACES = [
  { at: [-0.55, -0.95], facing: 0 },
  { at: [0.55, -0.95], facing: 0 },
  { at: [-1.35, 0], facing: Math.PI / 2 },
  { at: [1.35, 0.05], facing: -Math.PI / 2 },
];
const PLATES = [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]];

function seatsAt(props, seat) {
  PLACES.forEach(({ at: [px, pz], facing }) => {
    const back = [px - Math.sin(facing) * SEAT.back, pz - Math.cos(facing) * SEAT.back];
    props.add(seat(back, facing));
  });
}

// Today's kitchen walls: a window with curtains and a plant on the sill, a shelf of jars and a clock, placed along a wall at z = wall.
function wallDecor(props, wall, { windowX, shelfX, clockX, sill = 1.33 }) {
  const lift = sill - 1.33;
  props.add(mesh(new THREE.BoxGeometry(0.95, 0.8, 0.04), paint("#f6f1e6"), (m) => m.position.set(windowX, 1.75 + lift, wall)));
  props.add(mesh(new THREE.BoxGeometry(0.83, 0.68, 0.03), paint("#bcd3d6"), (m) => m.position.set(windowX, 1.75 + lift, wall + 0.012)));
  props.add(mesh(new THREE.BoxGeometry(0.03, 0.68, 0.035), paint("#f6f1e6"), (m) => m.position.set(windowX, 1.75 + lift, wall + 0.016)));
  [-1, 1].forEach((side) => props.add(mesh(new THREE.BoxGeometry(0.26, 0.92, 0.04), paint("#c8432a"), (m) => m.position.set(windowX + side * 0.5, 1.72 + lift, wall + 0.05))));
  props.add(mesh(new THREE.BoxGeometry(1.0, 0.04, 0.16), paint("#f6f1e6"), (m) => m.position.set(windowX, sill, wall + 0.07)));
  props.add(mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.12, 14), paint("#b5633d"), (m) => m.position.set(windowX + 0.25, sill + 0.08, wall + 0.07)));
  props.add(mesh(lumpy(new THREE.SphereGeometry(0.11, 12, 9), 0.35), paint("#5f8a4a"), (m) => m.position.set(windowX + 0.25, sill + 0.22, wall + 0.07)));
  props.add(mesh(new THREE.BoxGeometry(0.8, 0.03, 0.2), paint("#a4743f"), (m) => m.position.set(shelfX, 2.15, wall + 0.1)));
  [-0.3, -0.12, 0.06, 0.26].forEach((x, index) => props.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14 + (index % 2) * 0.04, 14), paint(["#e0a43a", "#c8432a", "#efe6c8", "#4f7a4a"][index]), (m) => m.position.set(shelfX + x, 2.24 + (index % 2) * 0.02, wall + 0.1))));
  props.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 24), paint("#f6f1e6"), (m) => {
    m.position.set(clockX, 2.3, wall + 0.02);
    m.rotation.x = Math.PI / 2;
  }));
  props.add(mesh(new THREE.BoxGeometry(0.012, 0.1, 0.01), paint("#2b2a28"), (m) => m.position.set(clockX, 2.34, wall + 0.04)));
  props.add(mesh(new THREE.BoxGeometry(0.07, 0.012, 0.01), paint("#2b2a28"), (m) => m.position.set(clockX + 0.03, 2.3, wall + 0.04)));
}

// Floor tiles, 0.8 a side, drawn as their joints.
function floorTiles(props, width, depth) {
  for (let line = -Math.floor(depth / 1.6); depth / 1.6 >= line; line++) props.add(mesh(new THREE.BoxGeometry(width, 0.004, 0.012), paint("#c8bfa9"), (m) => m.position.set(0, 0.003, line * 0.8)));
  for (let line = -Math.floor(width / 1.6); width / 1.6 >= line; line++) props.add(mesh(new THREE.BoxGeometry(0.012, 0.004, depth), paint("#c8bfa9"), (m) => m.position.set(line * 0.8, 0.003, 0)));
}

// What sits on a counter while someone cooks: a cutting board with a knife and a halved tree tomato, a bowl of fruit, salt and a towel.
function counterDecor(props, x, top, z) {
  props.add(mesh(new RoundedBoxGeometry(0.32, 0.02, 0.22, 2, 0.008), paint("#b8925a"), (m) => m.position.set(x, top + 0.01, z)));
  props.add(mesh(new THREE.BoxGeometry(0.16, 0.004, 0.025), paint("#b9bec2"), (m) => {
    m.position.set(x + 0.03, top + 0.024, z + 0.05);
    m.rotation.y = 0.3;
  }));
  props.add(mesh(new THREE.BoxGeometry(0.07, 0.012, 0.02), paint("#3b3026"), (m) => {
    m.position.set(x - 0.08, top + 0.026, z + 0.075);
    m.rotation.y = 0.3;
  }));
  props.add(mesh(new THREE.SphereGeometry(0.035, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint("#c8432a"), (m) => m.position.set(x - 0.05, top + 0.02, z - 0.04)));
  props.add(mesh(new THREE.CircleGeometry(0.034, 14), paint("#f0a640"), (m) => {
    m.position.set(x - 0.05, top + 0.021, z - 0.04);
    m.rotation.x = -Math.PI / 2;
  }));
  props.add(mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.07, 18), paint("#e9e2d2"), (m) => m.position.set(x - 0.32, top + 0.035, z - 0.05)));
  [[-0.35, -0.04, "#e98a2c"], [-0.29, -0.07, "#e98a2c"], [-0.31, 0.0, "#f2c94c"]].forEach(([dx, dz, color]) => props.add(mesh(lumpy(new THREE.SphereGeometry(0.036, 10, 8), 0.1), paint(color), (m) => m.position.set(x + dx, top + 0.09, z + dz))));
  props.add(mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.07, 12), paint("#f6f1e6"), (m) => m.position.set(x + 0.24, top + 0.035, z - 0.06)));
  props.add(mesh(new THREE.BoxGeometry(0.16, 0.012, 0.12), paint("#e0a43a"), (m) => {
    m.position.set(x + 0.3, top + 0.006, z + 0.06);
    m.rotation.y = -0.4;
  }));
}

// The family's table today: a kitchen with the fridge of the story, a red cloth, white plates and the pot.
function tableToday() {
  const scene = group(kitchenFloor(6, 4));
  const props = new THREE.Group();
  props.add(mesh(new RoundedBoxGeometry(1.9, 0.06, 1.1, 2, 0.01), paint("#a4743f"), (m) => (m.position.y = 0.75)));
  props.add(mesh(new THREE.BoxGeometry(1.92, 0.006, 1.12), paint("#d2492f"), (m) => (m.position.y = 0.782)));
  [[-0.85, -0.45], [0.85, -0.45], [-0.85, 0.45], [0.85, 0.45]].forEach(([px, pz]) => props.add(mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), paint("#7c5530"), (m) => m.position.set(px, 0.36, pz))));
  // Lunch today: rice, a piece of chicken, papa criolla, avocado and tomato on each plate, a glass of juice, fork and knife; the pot of locro
  // and a basket of bread in the middle.
  PLATES.forEach(([px, pz], index) => {
    const side = pz > 0 ? 1 : -1;
    props.add(mesh(new THREE.LatheGeometry([[0, 0], [0.13, 0], [0.17, 0.02], [0.18, 0.03], [0, 0.03]].map(([a, b]) => new THREE.Vector2(a, b)), 32), paint("#ffffff"), (m) => m.position.set(px, 0.786, pz)));
    props.add(mesh(lumpy(new THREE.SphereGeometry(0.055, 14, 10), 0.18), paint("#f4f0e6"), (m) => {
      m.position.set(px - 0.05, 0.815, pz - 0.02);
      m.scale.set(1.1, 0.5, 1);
    }));
    props.add(mesh(lumpy(new THREE.SphereGeometry(0.045, 10, 8), 0.35), paint("#a8642e"), (m) => {
      m.position.set(px + 0.05, 0.82, pz - 0.03);
      m.scale.set(1.3, 0.55, 0.9);
      m.rotation.y = index;
    }));
    [[-0.02, 0.06], [0.02, 0.075], [0.05, 0.05]].forEach(([dx, dz]) => props.add(mesh(lumpy(new THREE.SphereGeometry(0.019, 8, 6), 0.2), paint("#f0c23a"), (m) => m.position.set(px + dx, 0.812, pz + dz))));
    props.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 16, 1, false, 0, Math.PI), paint("#8fb04a"), (m) => {
      m.position.set(px - 0.07, 0.808, pz + 0.05);
      m.rotation.y = 0.6;
    }));
    [0, 1].forEach((slice) => props.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 14), paint("#d2492f"), (m) => m.position.set(px + 0.09 + slice * 0.02, 0.807, pz + 0.03 + slice * 0.025))));
    props.add(mesh(new THREE.BoxGeometry(0.012, 0.005, 0.16), paint("#9aa0a4"), (m) => m.position.set(px - 0.21, 0.788, pz)));
    props.add(mesh(new THREE.BoxGeometry(0.014, 0.005, 0.17), paint("#9aa0a4"), (m) => m.position.set(px + 0.21, 0.788, pz)));
    props.add(mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.1, 14), paint("#f0a640"), (m) => m.position.set(px + 0.2, 0.835, pz - side * 0.17)));
  });
  // An open pot, the locro filling it a little below the rim.
  props.add(mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.18, 24, 1, true), paint("#3b3026", { side: THREE.DoubleSide }), (m) => m.position.set(-0.12, 0.87, 0)));
  props.add(mesh(new THREE.CircleGeometry(0.13, 24), paint("#3b3026"), (m) => {
    m.position.set(-0.12, 0.781, 0);
    m.rotation.x = -Math.PI / 2;
  }));
  props.add(mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 24), paint("#3b3026"), (m) => {
    m.position.set(-0.12, 0.96, 0);
    m.rotation.x = Math.PI / 2;
  }));
  props.add(mesh(new THREE.CircleGeometry(0.152, 24), paint("#e8cf7a"), (m) => {
    m.position.set(-0.12, 0.935, 0);
    m.rotation.x = -Math.PI / 2;
  }));
  props.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 6), paint("#9aa0a4"), (m) => {
    m.position.set(-0.05, 1.04, 0.02);
    m.rotation.z = -0.6;
  }));
  props.add(mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.07, 18, 1, true), paint("#b8925a", { side: THREE.DoubleSide }), (m) => m.position.set(0.22, 0.82, 0.02)));
  [[0.19, 0.0], [0.25, 0.04], [0.22, -0.04]].forEach(([x, z]) => props.add(mesh(lumpy(new THREE.SphereGeometry(0.04, 10, 8), 0.15), paint("#d9a35a"), (m) => {
    m.position.set(x, 0.86, z);
    m.scale.y = 0.7;
  })));
  seatsAt(props, ([bx, bz], facing) => {
    const stool = group(mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.05, 20), paint("#a4743f"), (m) => m.position.set(bx, SEAT.height - 0.025, bz)));
    [0, 1, 2].forEach((leg) => {
      const angle = facing + (leg * Math.PI * 2) / 3;
      stool.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, SEAT.height - 0.05, 8), paint("#7c5530"), (m) => m.position.set(bx + Math.sin(angle) * 0.1, (SEAT.height - 0.05) / 2, bz + Math.cos(angle) * 0.1)));
    });
    return stool;
  });
  const top = counter(1.6);
  top.position.set(-1.7, 0, -1.65);
  props.add(top);
  // The kitchen round the table: tiles behind the counter with a hob, a pan and the sink under the wall cupboards, a window with a curtain
  // and a plant, a shelf of jars, a clock, notes on the fridge, a lamp over the table and a tiled floor.
  const wall = -1.99;
  const tile = paint("#f1efe8");
  props.add(mesh(new THREE.BoxGeometry(1.7, 0.7, 0.01), tile, (m) => m.position.set(-1.7, 1.27, wall)));
  for (let line = 0; 5 > line; line++) props.add(mesh(new THREE.BoxGeometry(1.7, 0.008, 0.012), paint("#c9c4b8"), (m) => m.position.set(-1.7, 0.92 + line * 0.15, wall + 0.002)));
  for (let line = 0; 12 > line; line++) props.add(mesh(new THREE.BoxGeometry(0.008, 0.7, 0.012), paint("#c9c4b8"), (m) => m.position.set(-2.55 + line * 0.15, 1.27, wall + 0.002)));
  [[-2.15, -1.55], [-1.95, -1.55], [-2.15, -1.75], [-1.95, -1.75]].forEach(([x, z]) => props.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 18), paint("#2b2a28"), (m) => m.position.set(x, 0.937, z))));
  props.add(mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.12, 20), paint("#9aa0a4"), (m) => m.position.set(-2.15, 1.0, -1.55)));
  props.add(mesh(new THREE.BoxGeometry(0.5, 0.02, 0.36), paint("#7d8287"), (m) => m.position.set(-1.25, 0.935, -1.62)));
  // The tap: a pillar behind the sink, a neck curving over toward the bowl and a short spout pointing down into it.
  const chrome = paint("#b9bec2");
  props.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.03, 12), chrome, (m) => m.position.set(-1.25, 0.95, -1.86)));
  props.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 10), chrome, (m) => m.position.set(-1.25, 1.07, -1.86)));
  // The neck turns a little toward the room, so from the table it reads as a curve and not end on.
  const spout = new THREE.Vector3(Math.sin(-0.7), 0, Math.cos(-0.7));
  props.add(mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 16, Math.PI), chrome, (m) => {
    m.position.set(-1.25 + spout.x * 0.07, 1.19, -1.86 + spout.z * 0.07);
    m.rotation.y = Math.atan2(-spout.z, spout.x);
  }));
  props.add(mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.05, 10), chrome, (m) => m.position.set(-1.25 + spout.x * 0.14, 1.165, -1.86 + spout.z * 0.14)));
  props.add(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.016), chrome, (m) => m.position.set(-1.25, 1.03, -1.85)));
  props.add(mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.1, 18), paint("#e9e2d2"), (m) => m.position.set(-1.65, 0.98, -1.55)));
  [[-1.69, -1.55], [-1.62, -1.5], [-1.63, -1.6]].forEach(([x, z]) => props.add(mesh(lumpy(new THREE.SphereGeometry(0.038, 10, 8), 0.1), paint("#e98a2c"), (m) => m.position.set(x, 1.05, z))));
  [-2.2, -1.65, -1.1].forEach((x) => {
    props.add(mesh(new THREE.BoxGeometry(0.53, 0.6, 0.34), paint("#8e9f86"), (m) => m.position.set(x, 2.0, -1.82)));
    props.add(mesh(new THREE.BoxGeometry(0.02, 0.14, 0.02), paint("#5f6b59"), (m) => m.position.set(x + 0.2, 1.8, -1.64)));
  });
  wallDecor(props, wall, { windowX: 0.15, shelfX: 1.1, clockX: -0.9 });
  floorTiles(props, 6, 4);
  props.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.9, 5), paint("#2b2a28"), (m) => m.position.set(0, 2.75, 0)));
  props.add(mesh(new THREE.ConeGeometry(0.22, 0.2, 20, 1, true), paint("#c8432a", { side: THREE.DoubleSide }), (m) => m.position.set(0, 2.22, 0)));
  scene.add(outline(merged(props)));
  const fridge = fridgeBody();
  fridge.position.set(1.75, 0, -1.6);
  [[-0.12, 0.98, "#e0a43a"], [0.1, 0.9, "#4f7a4a"], [-0.05, 0.76, "#efe6c8"]].forEach(([x, y, color]) => fridge.userData.door.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 0.006), paint(color), (m) => m.position.set(FRIDGE.W / 2 + x, y - 0.04, 0.064))));
  scene.add(fridge);
  const bulb = new THREE.PointLight("#ffd98a", 1.4, 3.2, 1.6);
  bulb.position.set(0, 2.05, 0);
  scene.add(bulb);
  const family = crowd(
    PLACES.map((place, index) => ({ ...place, act: index % 3 ? "Sit" : "SitTalk", kind: ["vecino", "vecina", "vecina", "vecino"][index] })),
    { looks: 4, seed: 21, era: 2026 },
  );
  scene.add(family);
  scene.userData.play = (k, now) => family.userData.play(k, now);
  return scene;
}

// The same table in 1876: a rammed-earth kitchen with the hearth, a plank table, clay bowls of potatoes and mote, a clay pot and benches.
function tableThen() {
  const scene = new THREE.Group();
  scene.add(earth(6, 4, "#b89f7a", 21));
  const props = new THREE.Group();
  const clay = paint("#9a5634");
  const darkClay = paint("#6e3a22");
  const wood = paint("#7a5530");
  props.add(mesh(new THREE.BoxGeometry(6, 3.2, 0.2), paint("#c9ad86"), (m) => m.position.set(0, 1.6, -2.1)));
  // Rammed earth is built in courses; each leaves a line along the wall.
  for (let course = 1; 6 > course; course++) props.add(mesh(new THREE.BoxGeometry(6, 0.025, 0.02), paint("#a88b66"), (m) => m.position.set(0, course * 0.55, -1.99)));
  props.add(mesh(new THREE.BoxGeometry(6, 0.14, 0.14), wood, (m) => m.position.set(0, 2.7, -1.92)));
  // The hearth: a stone bench with a clay pot over embers and firewood beside it.
  props.add(mesh(lumpy(new RoundedBoxGeometry(1.3, 0.55, 0.7, 2, 0.06), 0.06), paint("#8f857a"), (m) => m.position.set(-1.75, 0.275, -1.6)));
  props.add(mesh(new THREE.LatheGeometry([[0, 0], [0.16, 0.02], [0.2, 0.12], [0.18, 0.24], [0.13, 0.28], [0.14, 0.3], [0, 0.3]].map(([a, b]) => new THREE.Vector2(a, b)), 24), darkClay, (m) => m.position.set(-1.75, 0.55, -1.6)));
  [[-1.2, -1.45, 0.2], [-1.15, -1.62, -0.3], [-1.25, -1.3, 0.6]].forEach(([x, z, turn]) => props.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.6, 8), paint("#5a3b22"), (m) => {
    m.position.set(x, 0.05, z);
    m.rotation.set(0, turn, Math.PI / 2);
  })));
  // A shelf of clay jars on the wall.
  props.add(mesh(new THREE.BoxGeometry(1.2, 0.04, 0.3), wood, (m) => m.position.set(1.6, 1.35, -1.85)));
  [1.15, 1.45, 1.8, 2.05].forEach((x, index) => props.add(mesh(new THREE.LatheGeometry([[0, 0], [0.08, 0.01], [0.11, 0.1], [0.07, 0.2], [0.05, 0.24], [0.06, 0.26], [0, 0.26]].map(([a, b]) => new THREE.Vector2(a * (index % 2 ? 0.8 : 1), b * (index % 2 ? 0.8 : 1))), 18), index % 2 ? clay : darkClay, (m) => m.position.set(x, 1.37, -1.85))));
  // The plank table and its trestles.
  [-0.36, 0, 0.36].forEach((z) => props.add(mesh(new THREE.BoxGeometry(1.95, 0.06, 0.34), paint(z ? "#8a6236" : "#7f5a31"), (m) => m.position.set(0, 0.75, z))));
  [-0.8, 0.8].forEach((x) => {
    props.add(mesh(new THREE.BoxGeometry(0.08, 0.72, 0.9), wood, (m) => m.position.set(x, 0.36, 0)));
  });
  // Lunch in 1876: potatoes in their skins, a heap of mote, a slice of fresh cheese and ocas in each clay bowl, a gourd cup of chicha; ají
  // in a little dish, a round of bread and the jug in the middle.
  PLATES.forEach(([px, pz], index) => {
    const side = pz > 0 ? 1 : -1;
    props.add(mesh(new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.14, 0.05], [0.15, 0.07], [0.13, 0.065], [0, 0.02]].map(([a, b]) => new THREE.Vector2(a, b)), 24), clay, (m) => m.position.set(px, 0.78, pz)));
    for (let potato = 0; 3 > potato; potato++) {
      props.add(mesh(lumpy(new THREE.SphereGeometry(0.035, 10, 8), 0.3), paint(potato % 2 ? "#a77a48" : "#c9a25e"), (m) => {
        m.position.set(px - 0.05 + potato * 0.04, 0.83, pz + (potato % 2 ? 0.035 : -0.02));
        m.scale.y = 0.75;
      }));
    }
    for (let grain = 0; 7 > grain; grain++) props.add(mesh(new THREE.SphereGeometry(0.014, 7, 5), paint("#efe6c8"), (m) => m.position.set(px + 0.04 + (grain % 3) * 0.018, 0.825 + Math.floor(grain / 3) * 0.012, pz - 0.045 + (grain % 2) * 0.02)));
    props.add(mesh(new THREE.BoxGeometry(0.05, 0.022, 0.035), paint("#f3ead2"), (m) => {
      m.position.set(px + 0.02, 0.83, pz + 0.05);
      m.rotation.y = index * 0.7;
    }));
    [0, 1].forEach((oca) => props.add(mesh(new THREE.CapsuleGeometry(0.012, 0.03, 4, 8), paint("#d98a9b"), (m) => {
      m.position.set(px - 0.08 + oca * 0.025, 0.83, pz + 0.04);
      m.rotation.z = Math.PI / 2;
    })));
    props.add(mesh(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), paint("#b8925a", { side: THREE.DoubleSide }), (m) => m.position.set(px + 0.2, 0.83, pz - side * 0.16)));
    props.add(mesh(new THREE.CircleGeometry(0.045, 14), paint("#e4c98f"), (m) => {
      m.position.set(px + 0.2, 0.822, pz - side * 0.16);
      m.rotation.x = -Math.PI / 2;
    }));
  });
  props.add(mesh(new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.07, 0.03], [0, 0.03]].map(([a, b]) => new THREE.Vector2(a, b)), 16), clay, (m) => m.position.set(0.28, 0.78, 0.12)));
  props.add(mesh(lumpy(new THREE.SphereGeometry(0.04, 10, 8), 0.3), paint("#c8432a"), (m) => {
    m.position.set(0.28, 0.81, 0.12);
    m.scale.y = 0.4;
  }));
  props.add(mesh(lumpy(new THREE.SphereGeometry(0.09, 14, 10), 0.08), paint("#c08a4c"), (m) => {
    m.position.set(-0.3, 0.81, 0.1);
    m.scale.y = 0.45;
  }));
  props.add(mesh(new THREE.LatheGeometry([[0, 0], [0.07, 0.01], [0.1, 0.09], [0.08, 0.2], [0.04, 0.26], [0.05, 0.3], [0, 0.3]].map(([a, b]) => new THREE.Vector2(a, b)), 18), darkClay, (m) => m.position.set(0.7, 0.78, -0.05)));
  props.add(mesh(new THREE.LatheGeometry([[0, 0], [0.12, 0.01], [0.18, 0.1], [0.17, 0.18], [0.12, 0.22], [0.13, 0.25], [0, 0.25]].map(([a, b]) => new THREE.Vector2(a, b)), 24), darkClay, (m) => m.position.set(0, 0.78, 0)));
  [-1, 1].forEach((side) => props.add(mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12, Math.PI), darkClay, (m) => m.position.set(side * 0.18, 0.95, 0))));
  // A bench behind the table for the two facing out, and a stool cut from a log at each end.
  props.add(mesh(new THREE.BoxGeometry(1.7, 0.06, 0.3), paint("#8a6236"), (m) => m.position.set(0, SEAT.height - 0.03, -1.01)));
  [-0.75, 0.75].forEach((x) => props.add(mesh(new THREE.BoxGeometry(0.06, SEAT.height - 0.06, 0.26), wood, (m) => m.position.set(x, (SEAT.height - 0.06) / 2, -1.01))));
  PLACES.slice(2).forEach(({ at: [px, pz], facing }) => {
    const back = [px - Math.sin(facing) * SEAT.back, pz - Math.cos(facing) * SEAT.back];
    props.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, SEAT.height, 14), paint("#7f5a31"), (m) => m.position.set(back[0], SEAT.height / 2, back[1])));
  });
  scene.add(outline(merged(props)));
  const family = crowd(
    PLACES.map((place, index) => ({ ...place, act: index % 3 ? "SitTalk" : "Sit", kind: ["campesino", "campesina", "campesina", "campesino"][index] })),
    { looks: 4, seed: 23 },
  );
  scene.add(family);
  scene.userData.play = (k, now) => family.userData.play(k, now);
  return scene;
}

// The table: the family round the plates and the pot, the food that went into the fridge eaten instead of thrown away. The same table in
// two times: the story renders 1876 and today side by side, split where a torn edge of paper crosses the screen (userData.split), today
// coming in from the right until it has the whole table.
export function tableScene() {
  const then = tableThen();
  const today = tableToday();
  const scene = group(then, today);
  scene.userData.split = { then, today };
  scene.userData.play = (k, now) => {
    then.userData.play(k, now);
    today.userData.play(k, now);
  };
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

