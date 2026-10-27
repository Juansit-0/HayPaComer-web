import * as THREE from "../vendor/three.module.min.js";
import { RoundedBoxGeometry } from "../vendor/RoundedBoxGeometry.js";
import { css, foodModel, group, lathe, mesh, paint } from "../engrave.js";

// The kitchen around the fridge, one wall read left to right in tab order: the fridge stands at x = 0, then the counter (Ahora),
// the stove (Chef) and a low pantry (Mercado); the chalkboard (Números) hangs over the counter. Units are metres.
export const TOP = 0.9;
const BACK = -0.33;
const FRONT = 0.26;
const COUNTER = [0.42, 1.32];
const STOVE = [1.33, 1.93];
const PANTRY = [1.97, 2.63];
const WALL = [-1.6, 3.6];
const HIGH = 2.6;
const PX = 300;

const box = (w, h, d, material, x, y, z, radius = 0.006) => mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, Math.min(w, h, d) / 2 - 0.001)), material, (m) => m.position.set(x, y, z));

// Wall and floor are only ink lines on transparent planes: the section tint behind the canvas stays the colour of the room. The lines are
// drawn white and tinted by the material, so a theme change recolours them without redrawing.
function lines(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * PX);
  canvas.height = Math.round(height * PX);
  const context = canvas.getContext("2d");
  context.strokeStyle = "#ffffff";
  context.globalAlpha = 0.32;
  context.lineWidth = 2;
  draw(context, (metres) => metres * PX);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: texture, color: css("--color-line"), transparent: true, depthWrite: false });
}

function wall() {
  const width = WALL[1] - WALL[0];
  const material = lines(width, HIGH, (context, px) => {
    const x = (metres) => px(metres - WALL[0]);
    const y = (metres) => px(HIGH - metres);
    context.beginPath();
    for (let row = TOP + 0.15; 1.5 >= row; row += 0.15) {
      context.moveTo(x(COUNTER[0]), y(row));
      context.lineTo(x(STOVE[1]), y(row));
    }
    for (let column = COUNTER[0]; STOVE[1] + 0.001 >= column; column += 0.15) {
      context.moveTo(x(column), y(TOP));
      context.lineTo(x(column), y(1.5));
    }
    context.rect(x(COUNTER[0]), y(1.5), px(STOVE[1] - COUNTER[0]), px(1.5 - TOP));
    context.moveTo(x(WALL[0]), y(0.1));
    context.lineTo(x(WALL[1]), y(0.1));
    context.stroke();
  });
  return mesh(new THREE.PlaneGeometry(width, HIGH), material, (m) => {
    m.position.set((WALL[0] + WALL[1]) / 2, HIGH / 2, BACK - 0.015);
    m.userData.noOutline = true;
  });
}

function floor() {
  const width = WALL[1] - WALL[0];
  const deep = 1.6;
  const material = lines(width, deep, (context, px) => {
    const fade = context.createLinearGradient(0, 0, 0, px(deep));
    fade.addColorStop(0, "#ffffff");
    fade.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.strokeStyle = fade;
    context.beginPath();
    for (let row = 0.2; deep > row; row += 0.2) {
      context.moveTo(0, px(row));
      context.lineTo(px(width), px(row));
    }
    context.stroke();
  });
  return mesh(new THREE.PlaneGeometry(width, deep), material, (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set((WALL[0] + WALL[1]) / 2, 0.001, BACK - 0.015 + deep / 2);
    m.userData.noOutline = true;
  });
}

function counter() {
  const [left, right] = COUNTER;
  const width = right - left;
  const middle = (left + right) / 2;
  const front = paint("#efe6d2");
  const steel = paint("#c9d0d3");
  const result = group(
    box(width, TOP - 0.12, FRONT - BACK, front, middle, 0.08 + (TOP - 0.12) / 2, (BACK + FRONT) / 2),
    box(width - 0.04, 0.08, FRONT - BACK - 0.06, paint("#3a332b"), middle, 0.04, (BACK + FRONT) / 2 - 0.03),
    box(width + 0.02, 0.04, FRONT - BACK + 0.04, paint("#c99a6a"), middle, TOP - 0.02, (BACK + FRONT) / 2 + 0.01),
  );
  [-1, 1].forEach((side) => {
    const x = middle + side * width / 4;
    result.add(box(width / 2 - 0.02, TOP - 0.2, 0.02, front, x, 0.12 + (TOP - 0.2) / 2, FRONT + 0.01));
    result.add(box(0.012, 0.12, 0.02, steel, x - side * (width / 4 - 0.05), TOP - 0.2, FRONT + 0.03));
  });
  return result;
}

function stove() {
  const [left, right] = STOVE;
  const width = right - left;
  const middle = (left + right) / 2;
  const enamel = paint("#f6f1e6");
  const dark = paint("#2b2b2b");
  const steel = paint("#c9d0d3");
  const result = group(
    box(width, TOP - 0.02, FRONT - BACK, enamel, middle, (TOP - 0.02) / 2 + 0.01, (BACK + FRONT) / 2, 0.012),
    box(width - 0.01, 0.02, FRONT - BACK - 0.01, dark, middle, TOP, (BACK + FRONT) / 2),
    box(width, 0.14, 0.03, enamel, middle, TOP + 0.07, BACK + 0.015),
    box(width - 0.08, 0.48, 0.02, enamel, middle, 0.38, FRONT + 0.01),
    box(width - 0.2, 0.26, 0.01, paint("#3a3a3a"), middle, 0.4, FRONT + 0.022),
    box(width - 0.12, 0.016, 0.016, steel, middle, 0.66, FRONT + 0.05),
  );
  [-0.21, -0.07, 0.07, 0.21].forEach((offset) => {
    result.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 20), dark, (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(middle + offset, TOP - 0.1, FRONT + 0.015);
    }));
  });
  const burners = [[-0.14, 0.08], [0.14, 0.08], [-0.14, -0.16], [0.14, -0.16]].map(([dx, dz]) => new THREE.Vector3(middle + dx, TOP + 0.012, dz));
  burners.forEach((spot) => result.add(mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 32), steel, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.copy(spot);
  })));
  return { stove: result, burners };
}

function olla(spot) {
  const steel = paint("#55534e");
  const body = mesh(lathe([[0, 0], [0.11, 0], [0.115, 0.15], [0.12, 0.155], [0, 0.155]], 40), steel);
  const lid = group(
    mesh(lathe([[0, 0], [0.122, 0], [0.11, 0.02], [0.04, 0.035], [0, 0.036]], 40), steel),
    mesh(new THREE.SphereGeometry(0.016, 16, 10), paint("#2b2b2b"), (m) => (m.position.y = 0.045)),
  );
  lid.position.y = 0.155;
  const handles = [-1, 1].map((side) => mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16, Math.PI), paint("#2b2b2b"), (m) => {
    m.position.set(side * 0.125, 0.12, 0);
    m.rotation.z = side * Math.PI / 2;
  }));
  const pot = group(body, lid, ...handles);
  pot.position.copy(spot);
  return { pot, lid };
}

function pantry() {
  const [left, right] = PANTRY;
  const width = right - left;
  const middle = (left + right) / 2;
  const wood = paint("#d8b48a");
  const result = group(
    box(0.025, TOP, FRONT - BACK, wood, left + 0.0125, TOP / 2, (BACK + FRONT) / 2),
    box(0.025, TOP, FRONT - BACK, wood, right - 0.0125, TOP / 2, (BACK + FRONT) / 2),
    box(width, TOP - 0.02, 0.012, paint("#c99a6a"), middle, TOP / 2, BACK + 0.006),
  );
  [0.04, 0.45, TOP - 0.0125].forEach((y) => result.add(box(width, 0.025, FRONT - BACK, wood, middle, y, (BACK + FRONT) / 2)));
  const stock = [["Lentils", 0.47], ["Rice", 0.47], ["Pasta", 0.47], ["Tuna", 0.06], ["Tuna", 0.06], ["Soup", 0.06]];
  stock.forEach(([name, y], index) => {
    const food = foodModel(name);
    food.position.set(left + 0.12 + (index % 3) * 0.2, y + 0.0125, -0.02);
    result.add(food);
  });
  return result;
}

// The market basket on the pantry: what is already bought sits in it, and its gaps are what the list still asks for.
function basket() {
  const weave = paint("#b98a4e");
  const result = group(
    mesh(lathe([[0, 0], [0.15, 0], [0.18, 0.13], [0.172, 0.13], [0.142, 0.012], [0, 0.012]], 36), weave, (m) => m.scale.set(1, 1, 0.7)),
    mesh(new THREE.TorusGeometry(0.15, 0.008, 8, 32, Math.PI), weave, (m) => (m.position.y = 0.13)),
  );
  [["Carrot", -0.07, 0.6], ["Onion", 0.06, 0]].forEach(([name, x, rz]) => {
    const food = foodModel(name);
    food.position.set(x, 0.03, 0);
    food.rotation.z = rz;
    result.add(food);
  });
  result.position.set((PANTRY[0] + PANTRY[1]) / 2, TOP, 0);
  return result;
}

function chalkboard() {
  const frame = paint("#8a5a34");
  const width = 0.8;
  const height = 0.54;
  const result = group(
    box(width + 0.05, height + 0.05, 0.02, frame, 0, 0, 0),
    box(width, height, 0.01, paint("#2f3a33"), 0, 0, 0.012, 0.002),
    box(width * 0.9, 0.02, 0.04, frame, 0, -height / 2 - 0.02, 0.02),
  );
  result.position.set((COUNTER[0] + COUNTER[1]) / 2, 1.68, BACK + 0.01);
  return result;
}

function list(texture) {
  const sheet = mesh(new THREE.PlaneGeometry(0.17, 0.22), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }), (m) => {
    m.rotation.z = -0.05;
    m.userData.noOutline = true;
  });
  const pin = mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 20), paint(css("--color-tomate")), (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.set(0, 0.09, 0.008);
  });
  const result = group(sheet, pin);
  result.position.set((PANTRY[0] + PANTRY[1]) / 2, 1.3, BACK + 0.004);
  return result;
}

function book() {
  const result = group(
    mesh(new RoundedBoxGeometry(0.22, 0.04, 0.28, 2, 0.006), paint(css("--color-cobre")), (m) => (m.position.y = 0.02)),
    mesh(new THREE.BoxGeometry(0.205, 0.03, 0.265), paint("#f6f1e4"), (m) => m.position.set(0.006, 0.02, 0)),
  );
  result.position.set(COUNTER[1] - 0.13, TOP, -0.16);
  result.rotation.y = -0.25;
  return result;
}

export function buildKitchen(marketLabel) {
  const { stove: range, burners } = stove();
  const { pot, lid } = olla(burners[0]);
  const market = basket();
  const room = group(wall(), floor());
  return {
    room,
    retheme: () => room.children.forEach((plane) => plane.material.color.set(css("--color-line"))),
    counter: counter(),
    stove: group(range, pot, book()),
    lid,
    pantry: group(pantry(), market, list(marketLabel)),
    basket: market,
    pot,
    board: chalkboard(),
    plateSpot: new THREE.Vector3(0.92, TOP, 0.06),
    useSpot: new THREE.Vector3(0.57, TOP, -0.04),
    binSpot: new THREE.Vector3(0.82, 0, 0.62),
    steamSpot: burners[0].clone().setY(TOP + 0.2),
  };
}
