// People of the story: each look is one vertex-coloured mesh, and a crowd is instances of a few looks, so a street full of people stays a few draw calls.
import * as THREE from "../vendor/three.module.min.js";
import { hash, instance, outline, paint } from "../engrave.js";

const SKIN = ["#e0aa82", "#c99168", "#ecc09c", "#b07a54"];
const RUANA = ["#a8361f", "#3f6f8f", "#6b4a2a", "#4f7a4a", "#b8862f", "#5b2a3a"];
const HATS = ["#1c1712", "#5a3b22", "#e8dcc2"];
const SKIRTS = ["#2f5d4a", "#7a3b26", "#3d3a6b", "#a8361f"];
const random = (seed) => hash(seed, seed * 1.9, seed * 3.7);

function bake(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const color = new THREE.Color();
  parts.forEach(([geometry, hex, place]) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.applyMatrix4(place);
    color.set(hex).convertSRGBToLinear();
    positions.push(...flat.attributes.position.array);
    normals.push(...flat.attributes.normal.array);
    for (let index = 0; flat.attributes.position.count > index; index++) colors.push(color.r, color.g, color.b);
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

// One look: a woman with a full skirt and braids, or a man in trousers; both in a ruana, most in a hat. Faces +z, feet at y 0, about 1.6 tall.
export function look(seed) {
  const woman = random(seed) > 0.45;
  const skin = SKIN[Math.floor(random(seed * 2) * SKIN.length)];
  const ruana = RUANA[Math.floor(random(seed * 3) * RUANA.length)];
  const trim = RUANA[Math.floor(random(seed * 5) * RUANA.length)];
  const hat = random(seed * 7) > 0.2 ? HATS[Math.floor(random(seed * 11) * HATS.length)] : null;
  const parts = [];
  if (woman) {
    parts.push([new THREE.CylinderGeometry(0.17, 0.3, 0.62, 14), SKIRTS[Math.floor(random(seed * 13) * SKIRTS.length)], at(0, 0.35, 0)]);
    parts.push([new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), "#2b1d14", at(-0.08, 0.03, 0.04)]);
    parts.push([new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), "#2b1d14", at(0.08, 0.03, 0.04)]);
  } else {
    parts.push([new THREE.CylinderGeometry(0.065, 0.06, 0.6, 8), "#3b3026", at(-0.08, 0.3, 0)]);
    parts.push([new THREE.CylinderGeometry(0.065, 0.06, 0.6, 8), "#3b3026", at(0.08, 0.3, 0)]);
  }
  parts.push([new THREE.CylinderGeometry(0.13, 0.44, 0.6, 4), ruana, at(0, 0.92, 0, 0, Math.PI / 4)]);
  parts.push([new THREE.CylinderGeometry(0.445, 0.45, 0.05, 4), trim, at(0, 0.66, 0, 0, Math.PI / 4)]);
  parts.push([new THREE.SphereGeometry(0.035, 8, 6), skin, at(-0.16, 0.66, 0.2)]);
  parts.push([new THREE.SphereGeometry(0.035, 8, 6), skin, at(0.16, 0.66, 0.2)]);
  parts.push([new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), skin, at(0, 1.25, 0)]);
  parts.push([new THREE.SphereGeometry(0.11, 14, 10), skin, at(0, 1.37, 0, 0, 0, 0, 1, 1.12, 1)]);
  parts.push([new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#1f1712", at(0, 1.39, -0.015)]);
  if (woman) {
    parts.push([new THREE.CapsuleGeometry(0.025, 0.32, 4, 6), "#1f1712", at(-0.06, 1.12, -0.09, 0.15)]);
    parts.push([new THREE.CapsuleGeometry(0.025, 0.32, 4, 6), "#1f1712", at(0.06, 1.12, -0.09, 0.15)]);
  }
  if (hat) {
    parts.push([new THREE.CylinderGeometry(0.21, 0.21, 0.018, 18), hat, at(0, 1.46, 0)]);
    parts.push([new THREE.CylinderGeometry(0.095, 0.11, 0.13, 14), hat, at(0, 1.53, 0)]);
    parts.push([new THREE.CylinderGeometry(0.112, 0.112, 0.025, 14), trim, at(0, 1.48, 0)]);
  }
  if (random(seed * 17) > 0.6) parts.push([new THREE.CylinderGeometry(0.14, 0.11, 0.16, 12, 1, true), "#b8925a", at(0.2, 0.62, 0.12)]);
  const material = paint("#ffffff");
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
