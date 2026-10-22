// People of the story: each look is one vertex-coloured mesh, and a crowd is instances of a few looks, so a street full of people stays a few draw calls.
import * as THREE from "../vendor/three.module.min.js";
import { hash, instance, outline, paint } from "../engrave.js";

const SKIN = ["#e0aa82", "#c99168", "#ecc09c", "#b07a54"];
const RUANA = ["#a8361f", "#3f6f8f", "#6b4a2a", "#4f7a4a", "#b8862f", "#5b2a3a"];
const HATS = ["#1c1712", "#5a3b22", "#e8dcc2"];
const SKIRTS = ["#2f5d4a", "#7a3b26", "#3d3a6b", "#a8361f"];
const random = (seed) => hash(seed, seed * 1.9, seed * 3.7);

// Bakes parts into one geometry with a colour per vertex; a part's colour can be a function of the vertex position (stripes, folds, weave).
function bake(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const color = new THREE.Color();
  const point = new THREE.Vector3();
  parts.forEach(([geometry, paintWith, place]) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.applyMatrix4(place);
    const position = flat.attributes.position;
    if (typeof paintWith !== "function") color.set(paintWith).convertSRGBToLinear();
    for (let index = 0; position.count > index; index++) {
      if (typeof paintWith === "function") color.set(paintWith(point.fromBufferAttribute(position, index))).convertSRGBToLinear();
      colors.push(color.r, color.g, color.b);
    }
    positions.push(...position.array);
    normals.push(...flat.attributes.normal.array);
    geometry.dispose();
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const UP = new THREE.Vector3(0, 1, 0);

// A capsule from one point to another: arms, legs, braids.
function limb(from, to, radius) {
  const start = new THREE.Vector3(...from);
  const direction = new THREE.Vector3(...to).sub(start);
  const length = direction.length();
  const place = new THREE.Matrix4().compose(start.clone().addScaledVector(direction, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()), new THREE.Vector3(1, 1, 1));
  return [new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 4, 10), place];
}

// A full skirt with soft folds round its hem.
function skirt() {
  const geometry = new THREE.CylinderGeometry(0.16, 0.3, 0.6, 32, 3, true);
  const position = geometry.attributes.position;
  for (let index = 0; position.count > index; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const fold = 1 + Math.sin(Math.atan2(z, x) * 11) * 0.06 * (0.3 - position.getY(index)) * 1.6;
    position.setX(index, x * fold);
    position.setZ(index, z * fold);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const SHIRTS = ["#8a7660", "#6e5a48", "#9c8a6c", "#5d5246"];
const POSES = ["rest", "basket", "point", "carry"];

// One person, built from about thirty parts and baked into a single vertex-coloured mesh: a woman with a folded skirt and ribboned braids or a man
// in trousers and boots, both in a striped, fringed ruana with arms and hands in one of four poses, a face with nose, eyes, brows and ears, and most
// in a hat with a curved brim and a band. Faces +z, feet at y 0, about 1.6 tall.
export function look(seed) {
  const pick = (list, salt) => list[Math.floor(random(seed * salt) * list.length)];
  const woman = random(seed) > 0.45;
  const skin = pick(SKIN, 2);
  const ruana = pick(RUANA, 3);
  const trim = pick(RUANA.filter((color) => color !== ruana), 5);
  const hat = random(seed * 7) > 0.2 ? pick(HATS, 11) : null;
  const shirt = pick(SHIRTS, 19);
  const hair = random(seed * 23) > 0.85 ? "#6b5a4a" : "#1f1712";
  const pose = POSES[Math.floor(random(seed * 29) * POSES.length)];
  const lips = new THREE.Color(skin).multiplyScalar(0.72).getStyle();
  const parts = [];
  const add = (geometry, paintWith, place) => parts.push([geometry, paintWith, place]);
  const addLimb = ([geometry, place], paintWith) => parts.push([geometry, paintWith, place]);

  if (woman) {
    const cloth = pick(SKIRTS, 13);
    const hem = pick(RUANA, 17);
    add(skirt(), (point) => (0.12 > point.y ? hem : cloth), at(0, 0.36, 0));
    [-0.07, 0.07].forEach((x) => add(new THREE.SphereGeometry(0.045, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#2b1d14", at(x, 0.02, 0.05, 0, 0, 0, 1, 0.6, 1.6)));
  } else {
    [-0.075, 0.075].forEach((x) => {
      addLimb(limb([x, 0.08, 0], [x * 1.05, 0.7, 0], 0.062), "#3b3026");
      add(new THREE.BoxGeometry(0.1, 0.07, 0.19), "#2b1d14", at(x, 0.035, 0.035));
    });
  }
  const stripes = (point) => (point.y > 0.69 && 0.75 > point.y) || (point.y > 0.86 && 0.885 > point.y) || (point.y > 1.0 && 1.015 > point.y) ? trim : ruana;
  add(new THREE.CylinderGeometry(0.14, 0.46, 0.56, 4, 6, true), stripes, at(0, 0.94, 0, 0, Math.PI / 4, 0, 1, 1, 0.82));
  add(new THREE.CylinderGeometry(0.11, 0.14, 0.1, 12), ruana, at(0, 1.2, 0));
  for (let strand = 0; 44 > strand; strand++) {
    const side = Math.floor(strand / 11);
    const along = ((strand % 11) / 10 - 0.5) * 0.62;
    const [x, z] = [[along, 0.27], [0.33, along * 0.82], [-along, -0.27], [-0.33, -along * 0.82]][side];
    add(new THREE.CylinderGeometry(0.005, 0.004, 0.07, 4), trim, at(x, 0.63, z));
  }

  const shoulder = [0.19, 1.13, 0];
  const arms = {
    rest: [[0.24, 0.86, 0.05], [0.25, 0.64, 0.08]],
    basket: [[0.22, 0.88, 0.14], [0.1, 0.84, 0.3]],
    point: [[0.26, 1.06, 0.2], [0.32, 1.2, 0.46]],
    carry: [[0.23, 0.86, 0.02], [0.24, 0.62, 0.04]],
  };
  [-1, 1].forEach((side) => {
    const [elbow, hand] = side > 0 || pose === "carry" ? arms[side > 0 ? pose : "rest"] : arms.rest;
    const mirror = (point) => [point[0] * side, point[1], point[2]];
    addLimb(limb(mirror(shoulder), mirror(elbow), 0.048), shirt);
    addLimb(limb(mirror(elbow), mirror(hand), 0.04), shirt);
    add(new THREE.SphereGeometry(0.04, 10, 8), skin, at(...mirror(hand)));
  });
  if (pose === "basket") add(new THREE.CylinderGeometry(0.15, 0.11, 0.15, 16, 4, true), (point) => (Math.floor(point.y * 60 + Math.atan2(point.z, point.x) * 3) % 2 ? "#b8925a" : "#8e6a3c"), at(0, 0.82, 0.36));
  if (pose === "carry") add(new THREE.BoxGeometry(0.22, 0.24, 0.12), "#c79a5b", at(0.25, 0.48, 0.05));

  add(new THREE.CylinderGeometry(0.048, 0.056, 0.09, 10), skin, at(0, 1.26, 0));
  add(new THREE.SphereGeometry(0.105, 18, 14), skin, at(0, 1.37, 0, 0, 0, 0, 1, 1.12, 1));
  add(new THREE.ConeGeometry(0.019, 0.055, 8), skin, at(0, 1.362, 0.108, Math.PI / 2 - 0.2));
  [-0.038, 0.038].forEach((x) => {
    add(new THREE.SphereGeometry(0.012, 8, 6), "#1c1712", at(x, 1.395, 0.094));
    add(new THREE.BoxGeometry(0.034, 0.008, 0.012), hair, at(x, 1.422, 0.096, 0, 0, x * -2));
    add(new THREE.SphereGeometry(0.022, 8, 6), skin, at(x * 2.8, 1.37, -0.005, 0, 0, 0, 0.6, 1, 1));
  });
  add(new THREE.BoxGeometry(0.036, 0.007, 0.008), lips, at(0, 1.322, 0.101));
  add(new THREE.SphereGeometry(0.111, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, at(0, 1.385, -0.018, -0.25));
  if (woman) {
    const ribbon = pick(RUANA, 37);
    [-0.055, 0.055].forEach((x) => {
      addLimb(limb([x, 1.32, -0.085], [x * 1.3, 1.02, -0.07], 0.024), hair);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.03), ribbon, at(x * 1.3, 1.01, -0.07));
    });
  }
  if (hat) {
    add(new THREE.LatheGeometry([[0.1, 0.02], [0.17, 0.008], [0.23, 0.0], [0.245, 0.022]].map(([x, y]) => new THREE.Vector2(x, y)), 28), hat, at(0, 1.455, 0));
    add(new THREE.LatheGeometry([[0, 0.15], [0.07, 0.16], [0.1, 0.12], [0.108, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)), 24), hat, at(0, 1.465, 0));
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.028, 24, 1, true), trim, at(0, 1.48, 0));
  }
  const material = paint("#ffffff", { side: THREE.DoubleSide });
  material.vertexColors = true;
  return outline(new THREE.Group().add(new THREE.Mesh(bake(parts), material)));
}

// A crowd: people placed as [x, z, facing, walk] with walk a [dx, dz] distance travelled over the chapter; play(k) sways and walks them.
export function crowd(people, { looks = 6, seed = 1 } = {}) {
  const root = new THREE.Group();
  const bodies = Array.from({ length: looks }, (_, index) => look(seed * 31 + index));
  const groups = bodies.map(() => []);
  people.forEach((person, index) => groups[index % looks].push({ ...person, phase: random(seed + index) * 6.28, scale: 0.9 + random(seed * 3 + index) * 0.16 }));
  const matrix = new THREE.Matrix4();
  const place = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const size = new THREE.Vector3();
  const pose = (person, k) => {
    const [x, z] = person.at;
    const [dx, dz] = person.walk ?? [0, 0];
    const stride = person.walk ? Math.abs(Math.sin(k * 90 + person.phase)) * 0.035 : 0;
    place.set(x + dx * k, stride, z + dz * k);
    euler.set(0, person.facing ?? 0, Math.sin(k * 25 + person.phase) * (person.walk ? 0.04 : 0.025));
    turn.setFromEuler(euler);
    size.setScalar(person.scale);
    return matrix.compose(place, turn, size);
  };
  const sets = groups.map((members, index) => {
    if (!members.length) return null;
    const instanced = instance(bodies[index], members.map((person) => pose(person, 0).clone()));
    root.add(instanced);
    return { members, meshes: instanced.children.filter((child) => child.isInstancedMesh) };
  });
  root.userData.play = (k) => {
    sets.forEach((set) => {
      if (!set) return;
      set.members.forEach((person, index) => {
        const placed = pose(person, k);
        set.meshes.forEach((meshPart) => meshPart.setMatrixAt(index, placed));
      });
      set.meshes.forEach((meshPart) => {
        meshPart.instanceMatrix.needsUpdate = true;
        meshPart.computeBoundingSphere();
      });
    });
  };
  return root;
}
