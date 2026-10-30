import * as THREE from "./vendor/three.module.min.js";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";

export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#cccccc";

export function hash(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

export function lumpy(geometry, amount) {
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

export function lathe(profile, segments = 32) {
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}


const hatchScale = { value: Math.min(devicePixelRatio, 2) };
export const setHatchScale = (pixelRatio) => (hatchScale.value = pixelRatio);
export const inkTime = { value: 0 };
export const inkBias = { value: 0 };
// How far the picture has turned into old footage: sepia over everything engraved, set per frame by the story.
export const filmTone = { value: 0 };
export const boil = (now) => (inkTime.value = Math.floor(now / 125) % 8);
const INK = "vec3(0.11, 0.09, 0.08)";

export function engrave(shader) {
  shader.uniforms.hatchScale = hatchScale;
  shader.uniforms.inkTime = inkTime;
  shader.uniforms.inkBias = inkBias;
  shader.uniforms.filmTone = filmTone;
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", "uniform float hatchScale;\nuniform float inkTime;\nuniform float inkBias;\nuniform float filmTone;\nvoid main() {")
    .replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
      vec3 base = sRGBTransferOETF(vec4(diffuseColor.rgb, 1.0)).rgb;
      vec3 glow = sRGBTransferOETF(vec4(totalEmissiveRadiance, 1.0)).rgb;
      float lit = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)) / max(dot(base, vec3(0.299, 0.587, 0.114)), 0.04);
      float shade = smoothstep(0.8 + inkBias, 0.28 + inkBias * 0.5, lit);
      vec2 p = gl_FragCoord.xy / hatchScale;
      float wave = sin(p.y * 0.07 + p.x * 0.013 + inkTime * 2.1) * 1.4 + fract(sin(inkTime * 12.9898) * 43758.5) * 1.2;
      float a = abs(fract((p.x + p.y + wave) / 7.0) - 0.5);
      float b = abs(fract((p.x - p.y - wave) / 8.0) - 0.5);
      float c = abs(fract((p.y + wave) / 4.5) - 0.5);
      float ink = step(a, 0.3 * smoothstep(0.18, 0.75, shade));
      ink = max(ink, step(b, 0.24 * smoothstep(0.55, 0.95, shade)));
      ink = max(ink, step(c, 0.2 * smoothstep(0.85, 1.0, shade)));
      vec2 cell = floor(p / 3.0) + inkTime;
      float speck = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      ink = max(ink, step(length(fract(p / 3.0) - 0.5), 0.28) * step(speck, 0.009 * smoothstep(0.1, 0.2, shade) * (1.0 - smoothstep(0.2, 0.28, shade))));
      gl_FragColor.rgb = mix(base * mix(0.86, 1.0, clamp(lit, 0.0, 1.0)) + glow, ${INK}, ink * 0.88);
      float grey = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(grey * vec3(1.07, 0.93, 0.72) + vec3(0.04, 0.025, 0.0), gl_FragColor.rgb, 0.14), filmTone);`,
    );
}

export function paint(color, options = {}) {
  const material = new THREE.MeshLambertMaterial({
    color,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  });
  material.onBeforeCompile = engrave;
  return material;
}

function inkNormals(geometry) {
  if (geometry.attributes.inkNormal) return;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const sums = new Map();
  const key = (index) => `${Math.round(position.getX(index) * 1e4)},${Math.round(position.getY(index) * 1e4)},${Math.round(position.getZ(index) * 1e4)}`;
  for (let index = 0; position.count > index; index++) {
    const sum = sums.get(key(index)) ?? new THREE.Vector3();
    sum.x += normal.getX(index);
    sum.y += normal.getY(index);
    sum.z += normal.getZ(index);
    sums.set(key(index), sum);
  }
  const smooth = new Float32Array(position.count * 3);
  for (let index = 0; position.count > index; index++) {
    const sum = sums.get(key(index)).clone().normalize();
    smooth.set([sum.x, sum.y, sum.z], index * 3);
  }
  geometry.setAttribute("inkNormal", new THREE.BufferAttribute(smooth, 3));
}

const ink = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.0045 }, color: { value: new THREE.Color("#121212") } },
  vertexShader:
    "uniform float thickness;\nattribute vec3 inkNormal;\nvoid main() {\n  vec4 local = vec4(position, 1.0);\n  vec3 push = inkNormal;\n  #ifdef USE_INSTANCING\n  local = instanceMatrix * local;\n  push = mat3(instanceMatrix) * inkNormal;\n  #endif\n  float wobble = 0.82 + 0.22 * (sin(position.x * 71.0) + sin(position.y * 83.0 + 1.3) + sin(position.z * 67.0 + 2.1)) / 3.0;\n  float reach = 0.4 + 0.35 * max(0.0, -(modelViewMatrix * local).z);\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(local.xyz + normalize(push) * thickness * wobble * reach, 1.0);\n}",
  fragmentShader: "uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }",
  side: THREE.BackSide,
});

export function instance(model, placements) {
  const parts = [];
  model.updateMatrixWorld(true);
  model.traverse((child) => {
    if (child.isMesh && !child.userData.outline) parts.push(child);
  });
  const root = new THREE.Group();
  const matrix = new THREE.Matrix4();
  for (const part of parts) {
    const local = part.matrixWorld.clone();
    const inked = part.children.some((line) => line.userData.outline);
    const meshes = [new THREE.InstancedMesh(part.geometry, part.material, placements.length)];
    if (inked) {
      inkNormals(part.geometry);
      meshes.push(new THREE.InstancedMesh(part.geometry, ink, placements.length));
    }
    for (const instanced of meshes) {
      placements.forEach((placement, index) => instanced.setMatrixAt(index, matrix.multiplyMatrices(placement, local)));
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      root.add(instanced);
    }
  }
  return root;
}

export function outline(root) {
  const meshes = [];
  root.traverse((child) => {
    const inked = child.children.some((line) => line.userData.outline);
    if (child.isMesh && !inked && !child.userData.outline && !child.userData.noOutline && !child.material.transparent && !child.material.isShaderMaterial) meshes.push(child);
  });
  meshes.forEach((child) => {
    inkNormals(child.geometry);
    const line = new THREE.Mesh(child.geometry, ink);
    line.userData.outline = true;
    line.raycast = () => {};
    child.add(line);
  });
  return root;
}

// One mesh per colour for a whole set of props, so a street of detailed houses costs a handful of draw calls instead of hundreds.
export function merged(root) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const relative = new THREE.Matrix4();
  const buckets = new Map();
  root.traverse((child) => {
    if (!child.isMesh || child.userData.outline) return;
    const key = `${child.material.color.getHexString()}:${child.material.side}`;
    if (!buckets.has(key)) buckets.set(key, { material: child.material, parts: [] });
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.applyMatrix4(relative.multiplyMatrices(inverse, child.matrixWorld));
    buckets.get(key).parts.push(geometry);
  });
  const result = new THREE.Group();
  buckets.forEach(({ material, parts }) => {
    const total = parts.reduce((count, part) => count + part.attributes.position.array.length, 0);
    const geometry = new THREE.BufferGeometry();
    ["position", "normal"].forEach((name) => {
      const array = new Float32Array(total);
      let offset = 0;
      parts.forEach((part) => {
        array.set(part.attributes[name].array, offset);
        offset += part.attributes[name].array.length;
      });
      geometry.setAttribute(name, new THREE.BufferAttribute(array, 3));
    });
    parts.forEach((part) => part.dispose());
    geometry.computeBoundingSphere();
    result.add(new THREE.Mesh(geometry, material));
  });
  return result;
}

export function mesh(geometry, material, setup) {
  const result = new THREE.Mesh(geometry, material);
  setup?.(result);
  return result;
}

export function group(...children) {
  const result = new THREE.Group();
  children.forEach((child) => result.add(child));
  return result;
}

// A tuber or fruit body: a sphere stretched to its size and dented by a few slow waves, so it reads as grown, not chipped like a stone.
export function grown(size, seed, wobble = 0.09) {
  const geometry = new THREE.SphereGeometry(1, 20, 14);
  const position = geometry.attributes.position;
  for (let index = 0; position.count > index; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const dent = 1 + wobble * (Math.sin(x * 2.3 + seed) * Math.sin(y * 1.9 + seed * 1.7) + 0.6 * Math.sin(z * 2.9 + seed * 2.3));
    position.setXYZ(index, x * size[0] * dent, y * size[1] * dent, z * size[2] * dent);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// A lathe profile bent along its length, for fruit that curves: bananas and plantains.
function bentLathe(profile, bend) {
  const geometry = lathe(profile, 18);
  const position = geometry.attributes.position;
  const length = profile[profile.length - 1][1];
  for (let index = 0; position.count > index; index++) {
    const along = position.getY(index) / length - 0.5;
    position.setX(index, position.getX(index) + bend * (along * along - 0.25));
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Eyes on a potato's skin: a few small dark dimples, merged into one mesh with no ink edge.
function eyes(size, seed, color) {
  const dots = [0, 1, 2].map((eye) => {
    const angle = hash(seed, eye, 3) * Math.PI * 2;
    const rise = (hash(seed, eye, 5) - 0.5) * 1.2;
    const point = new THREE.Vector3(Math.cos(angle), rise, Math.sin(angle)).normalize();
    return mesh(new THREE.CircleGeometry(size[0] * 0.09, 8), paint(color), (m) => {
      m.position.set(point.x * size[0] * 1.01, point.y * size[1] * 1.01, point.z * size[2] * 1.01);
      m.lookAt(m.position.clone().multiplyScalar(2));
    });
  });
  const dimples = merged(group(...dots));
  dimples.traverse((child) => (child.userData.noOutline = true));
  return dimples;
}

// Andean potatoes as Pasto's market sells them: the big pale pastusa, the red-skinned parda and the small round yellow criolla.
const POTATOES = [
  { size: [0.045, 0.032, 0.036], color: "#cfa868", eye: "#8a6a3c" },
  { size: [0.04, 0.03, 0.033], color: "#9a5a3c", eye: "#5e3220" },
  { size: [0.024, 0.022, 0.024], color: "#e4bb45", eye: "#9a7a2a" },
];
export function potato(variant = 0) {
  const { size, color, eye } = POTATOES[variant % POTATOES.length];
  const tuber = group(mesh(grown(size, variant * 3.7 + 1), paint(color, { roughness: 0.95 })), eyes(size, variant + 4, eye));
  tuber.position.y = size[1];
  return tuber;
}

// An oca: a short, knobbly tuber ringed with ridges, rose, yellow or ivory.
export function oca(color) {
  const geometry = new THREE.CapsuleGeometry(0.022, 0.055, 6, 14);
  const position = geometry.attributes.position;
  for (let index = 0; position.count > index; index++) {
    const y = position.getY(index);
    const ring = 1 + 0.07 * Math.sin(y * 115);
    const taper = 1 - Math.max(0, y) * 4;
    position.setX(index, position.getX(index) * ring * taper);
    position.setZ(index, position.getZ(index) * ring * taper);
  }
  geometry.computeVertexNormals();
  return mesh(geometry, paint(color), (m) => {
    m.rotation.z = Math.PI / 2;
    m.position.y = 0.024;
  });
}

// A tree tomato (tamarillo): an egg drawn to a point, glossy red, a green star of sepals and a short stalk at the top.
export function treeTomato() {
  const profile = [[0, 0], [0.018, 0.004], [0.036, 0.02], [0.044, 0.048], [0.04, 0.078], [0.026, 0.1], [0.008, 0.112], [0, 0.114]];
  return group(
    mesh(lathe(profile, 24), paint("#c8432a", { roughness: 0.3, clearcoat: 0.6 })),
    mesh(new THREE.ConeGeometry(0.02, 0.01, 5), paint("#4b5a2a"), (m) => (m.position.y = 0.116)),
    mesh(new THREE.CylinderGeometry(0.0018, 0.0028, 0.018, 6), paint("#4b5a2a"), (m) => {
      m.position.set(0.002, 0.126, 0);
      m.rotation.z = -0.25;
    }),
  );
}

// A naranjilla (lulo): a round orange fruit under a fine fuzz, with its dry green calyx on top.
export function naranjilla() {
  const fruit = mesh(grown([0.045, 0.042, 0.045], 2.2, 0.03), paint("#e8a13a"), (m) => (m.position.y = 0.042));
  const calyx = mesh(new THREE.ConeGeometry(0.024, 0.012, 5), paint("#6a7a3a"), (m) => {
    m.position.y = 0.088;
    m.rotation.x = Math.PI;
  });
  return group(fruit, calyx);
}

// A leaf or stem rising from its base and leaning away: the piece is moved up half its length inside a pivot, so it turns about its foot.
function leaning(piece, length, lean, turn = 0) {
  piece.position.y = length / 2;
  const pivot = group(piece);
  pivot.rotation.order = "YXZ";
  pivot.rotation.set(lean, turn, 0);
  return pivot;
}

// A stalk of cebolla larga: a long white stem swelling a little at the root, going pale green, then three hollow green leaves.
function greenOnion(seed) {
  const stem = group(
    mesh(lathe([[0, 0], [0.0075, 0.002], [0.011, 0.014], [0.0095, 0.032], [0.008, 0.07], [0.0078, 0.09], [0, 0.09]], 14), paint("#f1ece0")),
    mesh(new THREE.CylinderGeometry(0.0072, 0.0078, 0.03, 14), paint("#b9cf8a"), (m) => (m.position.y = 0.1)),
    mesh(new THREE.ConeGeometry(0.009, 0.008, 8), paint("#cbbf9a"), (m) => {
      m.rotation.x = Math.PI;
      m.position.y = -0.003;
    }),
  );
  [-0.1, 0.02, 0.13].forEach((lean, index) => {
    const length = 0.12 - index * 0.012 + hash(seed, index, 2) * 0.02;
    const leaf = leaning(mesh(new THREE.CylinderGeometry(0.0016, 0.0045, length, 7), paint("#4f8a3a")), length, lean);
    leaf.position.y = 0.112;
    stem.add(leaf);
  });
  return stem;
}

// A sprig of cilantro: a thin stem with three lobed leaflets at its tip.
function cilantroSprig(seed, length) {
  const stem = mesh(new THREE.CylinderGeometry(0.0011, 0.0016, length, 5), paint("#6a9a45"));
  const leaves = [0, 1, 2, 3, 4].map((leaf) =>
    mesh(lumpy(new THREE.SphereGeometry(0.014, 12, 8), 0.22), paint(leaf % 2 ? "#4f8f3e" : "#3f7f3a"), (m) => {
      const angle = leaf * 2.4 + seed;
      const along = leaf > 2 ? -0.025 * (leaf - 2) : 0;
      m.scale.set(1, 0.22, 0.8);
      m.position.set(Math.cos(angle) * 0.011, length / 2 + 0.004 + along, Math.sin(angle) * 0.011);
      m.rotation.set(hash(seed, leaf, 1) * 0.8 - 0.4, angle, hash(seed, leaf, 2) * 0.6 - 0.3);
    }),
  );
  return { stem, leaves };
}

// A lime, whole, with a nub at each end; or cut in half to show its pale segments.
function lime(cut) {
  const skin = paint("#5f9a2e");
  if (!cut) {
    return group(
      mesh(grown([0.026, 0.023, 0.023], 4.1, 0.03), skin, (m) => (m.position.y = 0.023)),
      mesh(new THREE.SphereGeometry(0.004, 8, 6), skin, (m) => m.position.set(0.027, 0.023, 0)),
    );
  }
  const half = mesh(new THREE.SphereGeometry(0.025, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), skin, (m) => {
    m.rotation.x = Math.PI;
    m.position.y = 0.025;
  });
  const flesh = mesh(new THREE.CircleGeometry(0.023, 24), paint("#d8e6a0"), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.0252;
  });
  const segments = group(...Array.from({ length: 8 }, (_, index) => mesh(new THREE.BoxGeometry(0.021, 0.0008, 0.0012), paint("#a9c26a"), (m) => {
    m.rotation.y = (index * Math.PI) / 8;
    m.position.y = 0.0256;
  })));
  segments.traverse((child) => (child.userData.noOutline = true));
  return group(half, flesh, segments);
}

// A drumstick with its thigh (pernil): plump skin-on meat narrowing to the knob of the bone.
function drumstick(seed) {
  const meat = lumpy(lathe([[0, 0], [0.014, 0.004], [0.027, 0.028], [0.029, 0.05], [0.021, 0.076], [0.009, 0.095], [0.006, 0.106], [0, 0.106]], 18), 0.05);
  return group(
    mesh(meat, paint("#e3b98a"), (m) => {
      m.scale.set(1, 1, 0.7);
      m.rotation.set(0, seed, Math.PI / 2);
      m.position.set(0.053, 0.021, 0);
    }),
    mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.014, 8), paint("#efe6d6"), (m) => {
      m.rotation.z = Math.PI / 2;
      m.position.set(-0.05, 0.021, 0);
    }),
    mesh(new THREE.SphereGeometry(0.0078, 10, 8), paint("#efe6d6"), (m) => m.position.set(-0.059, 0.021, 0)),
  );
}

// A pea pod: a green shell drawn to a point at both ends; open, it lies on its back with the peas in a row.
function peaPod(open, seed) {
  const geometry = new THREE.CapsuleGeometry(0.014, 0.09, 4, 14);
  const position = geometry.attributes.position;
  for (let index = 0; position.count > index; index++) {
    const along = Math.min(1, Math.abs(position.getY(index)) / 0.059);
    const taper = 1 - 0.55 * along ** 3;
    const z = position.getZ(index);
    position.setX(index, position.getX(index) * taper);
    position.setZ(index, (open && z > 0 ? z * 0.12 : z) * taper * 0.8);
  }
  geometry.computeVertexNormals();
  const pod = group(mesh(geometry, paint("#6aa04a")));
  if (open) {
    for (let pea = 0; 5 > pea; pea++) pod.add(mesh(new THREE.SphereGeometry(0.0092, 12, 8), paint("#9ccc5a"), (m) => m.position.set(0, (pea - 2) * 0.018, 0.005)));
  }
  pod.rotation.set(-Math.PI / 2, seed, 0);
  pod.position.y = 0.011;
  return pod;
}

// A corn kernel grid pressed into the ear: rows round it and kernels along it, each a small dome.
function cornEar() {
  // Many rings along the ear, so the kernels have vertices to rise on: the radius swells from the stalk end and closes to the tip.
  const profile = Array.from({ length: 64 }, (_, index) => {
    const along = index / 63;
    return [0.023 * Math.sin((Math.PI / 2) * Math.min(1, along * 4)) ** 0.5 * (1 - 0.8 * along ** 5), along * 0.16];
  });
  const geometry = lathe([...profile, [0, 0.161]], 56);
  const position = geometry.attributes.position;
  for (let index = 0; position.count > index; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const y = position.getY(index);
    const bump = 1 + 0.12 * Math.abs(Math.sin(Math.atan2(z, x) * 7)) ** 0.5 * Math.abs(Math.sin(y * 400)) ** 0.5;
    position.setX(index, x * bump);
    position.setZ(index, z * bump);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// An arracacha root: thick, pale yellow and knobbly, narrowing to a blunt point, with flecks of its brown skin.
function arracacha(seed) {
  const root = lumpy(lathe([[0, 0], [0.006, 0.006], [0.013, 0.03], [0.019, 0.07], [0.02, 0.1], [0.015, 0.118], [0, 0.122]], 18), 0.07);
  return mesh(root, paint("#e6d28a"), (m) => {
    m.rotation.set(seed * 0.4, 0, -Math.PI / 2);
    m.position.set(-0.06, 0.019, 0);
  });
}

// An ulluco: a small glossy tuber, yellow or pink, a little longer than round.
function ulluco(index) {
  const size = [0.02, 0.014, 0.015];
  return mesh(grown(size, index * 2.3 + 0.7, 0.05), paint(index % 3 === 1 ? "#e07a8a" : "#e8c74a"), (m) => (m.position.y = size[1]));
}

// A wedge cut from a ridged squash (ahuyama): green rind round the back, orange flesh on the two cut faces, seeds near the middle.
function squashWedge() {
  const profile = [[0.012, 0], [0.045, 0.004], [0.068, 0.025], [0.072, 0.045], [0.06, 0.068], [0.03, 0.08], [0.012, 0.082]];
  const open = 1.1;
  const wedge = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 16, 0, open);
  const position = wedge.attributes.position;
  for (let index = 0; position.count > index; index++) {
    const rib = 1 + 0.04 * Math.cos(Math.atan2(position.getX(index), position.getZ(index)) * 9);
    position.setX(index, position.getX(index) * rib);
    position.setZ(index, position.getZ(index) * rib);
  }
  wedge.computeVertexNormals();
  const face = () => {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), ...profile.map(([x, y]) => new THREE.Vector2(x * 0.97, y)), new THREE.Vector2(0, 0.082)]);
    return new THREE.ShapeGeometry(shape);
  };
  const flesh = paint("#e88a2a", { side: THREE.DoubleSide });
  const seeds = paint("#f0d79a");
  const piece = group(
    mesh(wedge, paint("#3f5a2e")),
    ...[0, open].map((phi) => {
      const cut = group(
        mesh(face(), flesh),
        mesh(new THREE.CircleGeometry(0.012, 12), seeds, (m) => {
          m.scale.set(1, 2, 1);
          m.position.set(0.02, 0.04, 0.0005 * (phi ? -1 : 1));
          m.userData.noOutline = true;
        }),
      );
      cut.rotation.y = phi - Math.PI / 2;
      return cut;
    }),
  );
  piece.rotation.y = Math.PI - 0.3;
  piece.scale.setScalar(1.35);
  return group(piece);
}

// A papaya cut lengthwise and lying on its back: orange flesh round a hollow full of black seeds.
function papayaHalf() {
  const skin = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI), paint("#c9a23a"), (m) => {
    m.rotation.x = Math.PI / 2;
    m.scale.set(0.09, 0.045, 0.04);
    m.position.y = 0.04;
  });
  const flesh = mesh(new THREE.CircleGeometry(1, 32), paint("#ef7a3a"), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.scale.set(0.088, 0.044, 1);
    m.position.y = 0.0402;
  });
  const hollow = mesh(new THREE.CircleGeometry(1, 24), paint("#c95a2a"), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.scale.set(0.05, 0.017, 1);
    m.position.set(0.006, 0.0405, 0);
    m.userData.noOutline = true;
  });
  const seeds = [];
  for (let seed = 0; 22 > seed; seed++) {
    seeds.push(mesh(new THREE.SphereGeometry(0.0036, 6, 5), paint("#1c1712"), (m) => m.position.set(0.006 + (hash(seed, 1, 7) - 0.5) * 0.085, 0.042, (hash(seed, 2, 7) - 0.5) * 0.026)));
  }
  return group(skin, flesh, hollow, merged(group(...seeds)));
}

// A link of chorizo: a plump sausage tied at both ends.
function chorizoLink() {
  return group(
    mesh(new THREE.CapsuleGeometry(0.014, 0.045, 6, 14), paint("#9a3a2a"), (m) => (m.rotation.z = Math.PI / 2)),
    ...[-1, 1].map((end) => mesh(new THREE.SphereGeometry(0.004, 8, 6), paint("#d8c9a0"), (m) => (m.position.x = end * 0.037))),
  );
}

// A trout lying on its side: a long body tapering to the tail fin, olive back, a pink stripe and dark spots.
function trout() {
  const body = new THREE.SphereGeometry(1, 32, 16);
  const position = body.attributes.position;
  for (let index = 0; position.count > index; index++) {
    const x = position.getX(index);
    const narrow = x > 0 ? 1 - 0.75 * x * x : 1 - 0.25 * x * x;
    position.setXYZ(index, x * 0.085, position.getY(index) * 0.016 * narrow, position.getZ(index) * 0.03 * narrow);
  }
  body.computeVertexNormals();
  const tail = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.04, 0.028), new THREE.Vector2(0.032, 0), new THREE.Vector2(0.04, -0.028)]);
  // The height of the flank at (x, z), so the marks lie on the body rather than cutting through it.
  const flank = (x, z) => {
    const u = x / 0.085;
    const narrow = u > 0 ? 1 - 0.75 * u * u : 1 - 0.25 * u * u;
    return 0.018 + 0.016 * narrow * Math.sqrt(Math.max(0, 1 - u * u - (z / (0.03 * narrow)) ** 2)) + 0.0004;
  };
  const dot = (x, z, radius, color, stretch = 1) => mesh(new THREE.CircleGeometry(radius, 8), paint(color), (m) => {
    m.rotation.x = -Math.PI / 2;
    m.scale.x = stretch;
    m.position.set(x, flank(x, z), z);
  });
  const marks = group(
    ...Array.from({ length: 9 }, (_, step) => dot(-0.05 + step * 0.012, 0.002, 0.0042, "#d98a8a", 1.8)),
    ...Array.from({ length: 16 }, (_, spot) => dot((hash(spot, 1, 9) - 0.55) * 0.12, (hash(spot, 2, 9) - 0.5) * 0.03, 0.0022, "#2b2a22")),
    dot(-0.066, -0.004, 0.0045, "#1c1712"),
  );
  marks.traverse((child) => (child.userData.noOutline = true));
  return group(
    mesh(body, paint("#7f8c6a"), (m) => (m.position.y = 0.018)),
    mesh(new THREE.ShapeGeometry(tail), paint("#6a7458", { side: THREE.DoubleSide }), (m) => {
      m.rotation.x = -Math.PI / 2;
      m.position.set(0.078, 0.018, 0);
    }),
    marks,
  );
}

// A pile of small pieces poured into a container, merged into one mesh: beans in a jar, kernels in a bag.
function poured(make, count, width, depth, height) {
  const pieces = [];
  for (let index = 0; count > index; index++) {
    const piece = make(index);
    const angle = hash(index, 1, 5) * Math.PI * 2;
    const reach = Math.sqrt(hash(index, 3, 5)) * 0.5;
    piece.position.set(Math.cos(angle) * reach * width, 0.01 + (hash(index, 2, 5) ** 0.7) * height, Math.sin(angle) * reach * depth);
    piece.rotation.set(hash(index, 4, 5) * 3, hash(index, 5, 5) * 3, 0);
    pieces.push(piece);
  }
  return merged(group(...pieces));
}

// A leaf cupped round a head of cabbage or lettuce: a piece of a sphere, its edge waved so it reads as a leaf, not a shell.
function cuppedLeaf(radius, width, height, ruffle, color) {
  const geometry = new THREE.SphereGeometry(radius, 14, 10, -width / 2, width, 0.25, height);
  const position = geometry.attributes.position;
  for (let index = 0; position.count > index; index++) {
    const v = new THREE.Vector3().fromBufferAttribute(position, index);
    const wave = 1 + ruffle * Math.sin(Math.atan2(v.x, v.z) * 14) * Math.max(0, -v.y / radius);
    position.setXYZ(index, v.x * wave, v.y, v.z * wave);
  }
  geometry.computeVertexNormals();
  return mesh(geometry, paint(color, { side: THREE.DoubleSide }));
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

// A natural pile: a loose base spiralling out on the golden angle, the rest resting in the hollows between the pieces below, each piece tilted and
// sized a little differently, so a few tomatoes never stand in a row.
function cluster(make, count, spacing) {
  const result = new THREE.Group();
  const base = 3 >= count ? count : Math.ceil(count * 0.62);
  const spots = [];
  for (let index = 0; count > index; index++) {
    const piece = make(index);
    const jitter = (salt) => hash(index, count + salt, spacing) - 0.5;
    if (base > index) {
      const angle = index * 2.39996 + jitter(1) * 0.6;
      const reach = spacing * 0.58 * Math.sqrt(index + 0.35) * (1 + jitter(2) * 0.25);
      spots.push([Math.cos(angle) * reach, Math.sin(angle) * reach * 0.85]);
      piece.position.x += spots[index][0];
      piece.position.z += spots[index][1];
    } else {
      const first = spots[(index - base) % base];
      const second = spots[(index - base + 1) % base];
      piece.position.x += (first[0] + second[0]) / 2 + jitter(3) * spacing * 0.2;
      piece.position.z += (first[1] + second[1]) / 2 + jitter(4) * spacing * 0.2;
      piece.position.y += spacing * 0.5;
    }
    piece.rotation.set(piece.rotation.x + jitter(5) * 0.6, piece.rotation.y + jitter(6) * 6.28, piece.rotation.z + jitter(7) * 0.6);
    piece.scale.multiplyScalar(0.9 + (jitter(8) + 0.5) * 0.18);
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
  Tomato: (grams) => cluster(() => FOODS.Tomato(), count(grams, 100, 6), 0.07),
  Potato: (grams) => cluster(() => FOODS.Potato(), count(grams, 160, 6), 0.075),
  // Carrots lie side by side in a bunch, tops together, as they are tied at the market.
  Carrot: (grams) => {
    const bunch = new THREE.Group();
    const carrots = count(grams, 70, 4);
    for (let index = 0; carrots > index; index++) {
      const piece = FOODS.Carrot();
      piece.position.set((index % 2) * 0.01, 0, (index - (carrots - 1) / 2) * 0.036);
      piece.rotation.y = (index - (carrots - 1) / 2) * 0.08;
      bunch.add(piece);
    }
    return bunch;
  },
  // Rolls of bread (pan de sal), a few to a bag's worth.
  Bread: (grams) => cluster(() => FOODS.Bread(), count(grams, 30, 5), 0.07),
  Onion: (grams) => cluster(() => FOODS.Onion(), count(grams, 130, 5), 0.07),
  Avocado: (grams) => cluster(() => FOODS.Avocado(), count(grams, 180, 4), 0.07),
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
  Apple: (grams) => cluster(() => FOODS.Apple(), count(grams, 180, 5), 0.08),
  Ulluco: (grams) => cluster((index) => ulluco(index), count(grams, 25, 9), 0.042),
  Pepper: (grams) => cluster(() => FOODS.Pepper(), count(grams, 150, 3), 0.085),
  Granadilla: (grams) => cluster(() => FOODS.Granadilla(), count(grams, 90, 5), 0.075),
  Chorizo: (grams) => {
    const links = count(grams, 80, 5);
    const chain = new THREE.Group();
    for (let index = 0; links > index; index++) {
      const link = chorizoLink();
      const angle = (index - (links - 1) / 2) * 0.55;
      link.position.set(Math.sin(angle) * 0.14, 0.014, 0.14 - Math.cos(angle) * 0.14);
      link.rotation.y = -angle;
      chain.add(link);
    }
    return chain;
  },
  "Creole potato": (grams) => cluster(() => potato(2), count(grams, 45, 8), 0.05),
  Lime: (grams) => cluster((index) => lime(index === 1), count(grams, 60, 6), 0.055),
  Orange: (grams) => cluster(() => FOODS.Orange(), count(grams, 200, 5), 0.08),
  "Chicken thighs": (grams) => {
    const pieces = count(grams, 150, 3);
    const tray = group(mesh(new RoundedBoxGeometry(0.17, 0.014, 0.12, 2, 0.004), paint("#ffffff"), (m) => (m.position.y = 0.007)));
    for (let index = 0; pieces > index; index++) {
      const piece = drumstick(index * 0.4);
      piece.position.set((index % 2 ? 0.014 : -0.014), 0.012, (index - (pieces - 1) / 2) * 0.052);
      piece.rotation.y = (index % 2 ? Math.PI : 0) + (index - 1) * 0.08;
      tray.add(piece);
    }
    return tray;
  },
  Mango: (grams) => cluster(() => FOODS.Mango(), count(grams, 300, 3), 0.09),
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
  // A chonto tomato: round, a little flattened, with soft lobes, a star of sepals and a stalk.
  Tomato: () => {
    const body = new THREE.SphereGeometry(0.036, 28, 18);
    const position = body.attributes.position;
    for (let index = 0; position.count > index; index++) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const lobe = 1 + 0.06 * Math.cos(Math.atan2(z, x) * 5);
      position.setXYZ(index, x * lobe, position.getY(index) * 0.82, z * lobe);
    }
    body.computeVertexNormals();
    return group(
      mesh(body, paint("#d0412a", { roughness: 0.25, clearcoat: 0.8 }), (m) => (m.position.y = 0.03)),
      mesh(new THREE.ConeGeometry(0.017, 0.008, 5), paint("#2f7a4a"), (m) => (m.position.y = 0.06)),
      mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.012, 6), paint("#2f7a4a"), (m) => (m.position.y = 0.068)),
    );
  },
  Egg: () => mesh(lathe([[0, 0], [0.018, 0.004], [0.022, 0.018], [0.02, 0.04], [0.012, 0.056], [0, 0.06]]), paint("#f4ead8", { roughness: 0.75 })),
  Milk: () => {
    const box = carton("#ffffff", css("--color-mora"));
    box.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.012, 16), paint(css("--color-papa")), (m) => m.position.set(0.012, 0.2, 0.012)));
    box.add(mesh(new THREE.BoxGeometry(0.073, 0.012, 0.073), paint(css("--color-cilantro")), (m) => (m.position.y = 0.11)));
    return box;
  },
  "Orange juice": () => {
    const box = carton("#f39a33", "#2f7a4a");
    box.add(mesh(grown([0.018, 0.018, 0.004], 1, 0.02), paint("#f6c26a"), (m) => m.position.set(0, 0.1, 0.037)));
    return box;
  },
  "Chicken breast": () =>
    group(
      mesh(new RoundedBoxGeometry(0.15, 0.014, 0.1, 2, 0.004), paint("#ffffff", { roughness: 0.4 }), (m) => (m.position.y = 0.007)),
      mesh(grown([0.06, 0.018, 0.035], 2.1, 0.06), paint("#efbfa0", { roughness: 0.45, clearcoat: 0.3 }), (m) => m.position.set(0, 0.03, 0)),
    ),
  "Ground beef": () =>
    group(
      mesh(new RoundedBoxGeometry(0.14, 0.014, 0.1, 2, 0.004), paint("#ffffff", { roughness: 0.4 }), (m) => (m.position.y = 0.007)),
      mesh(grown([0.055, 0.02, 0.04], 3.3, 0.14), paint("#9c3b31", { roughness: 0.8 }), (m) => (m.position.y = 0.032)),
      mesh(grown([0.03, 0.012, 0.02], 5.1, 0.2), paint("#b8584a", { roughness: 0.8 }), (m) => m.position.set(0.02, 0.045, 0.01)),
    ),
  Potato: () => potato(0),
  // A carrot: a root swelling from its point to a rounded shoulder, faint rings across it, and a feathery top growing from the crown.
  Carrot: () => {
    const profile = Array.from({ length: 28 }, (_, index) => {
      const t = index / 27;
      const shoulder = t > 0.86 ? Math.sqrt(Math.max(0.25, 1 - ((t - 0.86) / 0.14) ** 2)) : 1;
      return [0.017 * t ** 0.6 * shoulder * (1 + 0.035 * Math.sin(t * 70)), t * 0.15];
    });
    const root = mesh(lathe([...profile, [0, 0.15]], 18), paint("#e8892b"), (m) => {
      m.rotation.z = Math.PI / 2;
      m.position.set(0.075, 0.017, 0);
    });
    const sprigs = [];
    for (let sprig = 0; 5 > sprig; sprig++) {
      const length = 0.055 + hash(sprig, 4, 2) * 0.025;
      const { stem, leaves } = cilantroSprig(sprig * 2.1 + 1, length);
      stem.position.y = length / 2;
      leaves.forEach((leaf) => (leaf.position.y += length / 2));
      const pivot = group(stem, ...leaves);
      pivot.rotation.set((sprig - 2) * 0.22, 0, hash(sprig, 6, 2) * 0.3 - 0.15);
      sprigs.push(pivot);
    }
    const top = merged(group(...sprigs));
    top.scale.setScalar(0.8);
    top.rotation.z = Math.PI / 2;
    top.position.set(-0.074, 0.017, 0);
    return group(root, top);
  },
  // A bulb onion: papery golden skin drawn to a dry tip, with a tuft of roots underneath.
  Onion: () =>
    group(
      mesh(lathe([[0, 0], [0.02, 0.004], [0.034, 0.026], [0.03, 0.048], [0.012, 0.064], [0.004, 0.08], [0, 0.082]]), paint("#c98f5a", { roughness: 0.35, clearcoat: 0.5 })),
      mesh(new THREE.CylinderGeometry(0.008, 0.002, 0.008, 8), paint("#8a6a4a"), (m) => (m.position.y = 0.002)),
    ),
  // An avocado: a pear-shaped fruit with pebbled dark skin and the nub of its stalk.
  Avocado: () =>
    group(
      mesh(lumpy(lathe([[0, 0], [0.026, 0.006], [0.035, 0.03], [0.03, 0.058], [0.02, 0.08], [0.009, 0.092], [0, 0.094]]), 0.03), paint("#2e4a1e", { roughness: 0.85 })),
      mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.01, 6), paint("#5a4a2a"), (m) => (m.position.y = 0.098)),
    ),
  // A banana: a ridged finger curving up at both ends, dark at the stalk and the tip.
  Banana: () =>
    group(
      mesh(bentLathe([[0, 0], [0.006, 0.006], [0.015, 0.03], [0.017, 0.09], [0.013, 0.14], [0.006, 0.158], [0, 0.162]], 0.08), paint(css("--color-papa"), { roughness: 0.5 }), (m) => {
        m.rotation.z = Math.PI / 2;
        m.position.set(0.081, 0.02, 0);
      }),
      mesh(new THREE.SphereGeometry(0.005, 8, 6), paint("#3b3026"), (m) => m.position.set(-0.081, 0.04, 0)),
    ),
  // A plantain: longer and straighter than a banana, green going yellow, its stalk end cut square.
  Plantain: () =>
    group(
      mesh(bentLathe([[0, 0], [0.008, 0.008], [0.02, 0.04], [0.022, 0.13], [0.016, 0.19], [0.009, 0.21], [0.007, 0.222]], 0.06), paint("#a7a83a", { roughness: 0.6 }), (m) => {
        m.rotation.z = Math.PI / 2;
        m.position.set(0.11, 0.024, 0);
      }),
      mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.008, 8), paint("#4b4a2a"), (m) => {
        m.rotation.z = Math.PI / 2;
        m.position.set(-0.112, 0.04, 0);
      }),
    ),
  // Queso campesino: a round of fresh white cheese with a slice cut out, its rind a shade warmer.
  Cheese: () => {
    const round = new THREE.Shape();
    round.moveTo(0, 0);
    round.absarc(0, 0, 0.055, 0.55, Math.PI * 2, false);
    round.lineTo(0, 0);
    return mesh(new THREE.ExtrudeGeometry(round, { depth: 0.04, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 28 }), paint("#f4ecd8", { roughness: 0.8 }), (m) => {
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.004;
    });
  },
  // A block of butter, half out of its paper.
  Butter: () =>
    group(
      mesh(new RoundedBoxGeometry(0.1, 0.035, 0.05, 2, 0.006), paint("#f6e3a0", { roughness: 0.5 }), (m) => (m.position.y = 0.018)),
      mesh(new RoundedBoxGeometry(0.055, 0.037, 0.052, 2, 0.004), paint("#ffffff", { roughness: 0.7 }), (m) => m.position.set(0.024, 0.0185, 0)),
      mesh(new THREE.BoxGeometry(0.056, 0.012, 0.053), paint(css("--color-tomate")), (m) => m.position.set(0.024, 0.02, 0)),
    ),
  Yogurt: () =>
    group(
      mesh(lathe([[0, 0], [0.026, 0], [0.032, 0.07], [0, 0.07]]), paint(css("--color-papa"), { roughness: 0.45 })),
      mesh(new THREE.CylinderGeometry(0.0305, 0.028, 0.02, 28, 1, true), paint("#ffffff"), (m) => (m.position.y = 0.035)),
      mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.004, 28), paint("#d8d8d8", { metalness: 0.8, roughness: 0.3 }), (m) => (m.position.y = 0.072)),
    ),
  // A pan de sal: a round roll with a glossy golden crust and a cross scored on top.
  Bread: () =>
    group(
      mesh(grown([0.032, 0.02, 0.03], 1.4, 0.04), paint("#c98a46"), (m) => (m.position.y = 0.018)),
      mesh(new THREE.BoxGeometry(0.03, 0.003, 0.004), paint("#8a5526"), (m) => {
        m.position.y = 0.038;
        m.userData.noOutline = true;
      }),
    ),
  // A bag of rice: a soft plastic sack, its top folded over, with a red band.
  Rice: () =>
    group(
      mesh(lumpy(new RoundedBoxGeometry(0.09, 0.13, 0.055, 3, 0.02), 0.02), paint("#fbfbf8", { roughness: 0.9 }), (m) => (m.position.y = 0.065)),
      mesh(new RoundedBoxGeometry(0.09, 0.02, 0.02, 2, 0.008), paint("#f0efe8"), (m) => m.position.set(0, 0.135, 0.012)),
      mesh(new THREE.BoxGeometry(0.092, 0.03, 0.057), paint(css("--color-tomate")), (m) => (m.position.y = 0.06)),
    ),
  // A packet of spaghetti: a long box with a window onto the pasta inside.
  Pasta: () =>
    group(
      mesh(new RoundedBoxGeometry(0.06, 0.17, 0.035, 2, 0.004), paint(css("--color-cobre"), { roughness: 0.6 }), (m) => (m.position.y = 0.085)),
      mesh(new THREE.BoxGeometry(0.03, 0.09, 0.037), paint("#f0d78a"), (m) => (m.position.y = 0.09)),
    ),
  "Black beans": () => jar("#241c1a"),
  Lentils: () => jar("#8c5a2e"),
  "Soy sauce": () => bottle("#2b1a12"),
  // A tin of tuna: rims top and bottom and a blue label round it.
  Tuna: () =>
    group(
      mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.035, 32), paint("#b9c2c6", { metalness: 0.85, roughness: 0.25 }), (m) => (m.position.y = 0.018)),
      mesh(new THREE.CylinderGeometry(0.0425, 0.0425, 0.022, 32, 1, true), paint("#3f6f8f"), (m) => (m.position.y = 0.018)),
      mesh(new THREE.TorusGeometry(0.04, 0.002, 6, 32), paint("#9aa0a4"), (m) => {
        m.rotation.x = Math.PI / 2;
        m.position.y = 0.035;
      }),
    ),
  Soup: () =>
    group(
      mesh(lathe([[0, 0], [0.06, 0], [0.065, 0.07], [0.068, 0.072], [0, 0.072]]), paint("#55534e", { metalness: 0.6, roughness: 0.35 })),
      mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.008, 32), paint("#6b6a64", { metalness: 0.6, roughness: 0.3 }), (m) => (m.position.y = 0.078)),
      mesh(new THREE.TorusGeometry(0.012, 0.004, 6, 12), paint("#3b3026"), (m) => (m.position.y = 0.086)),
    ),
  // An arepa off the griddle, with its toasted marks.
  Arepa: () =>
    group(
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 32), paint("#efe2b8", { roughness: 0.9 }), (m) => (m.position.y = 0.008)),
      ...[[0.015, 0.01, 0.01], [-0.02, -0.006, 0.008], [0.004, -0.024, 0.007], [-0.01, 0.026, 0.006]].map(([x, z, r]) => mesh(new THREE.CircleGeometry(r, 10), paint("#b98a4c"), (m) => {
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.0165, z);
        m.userData.noOutline = true;
      })),
    ),
  "Creole potato": () => potato(2),
  // Cebolla larga: three stalks tied in a bunch, lying down, the white stems together and the leaves fanning out.
  "Green onion": () => {
    const bunch = group(...[-1, 0, 1].map((place) => {
      const stalk = greenOnion(place + 2);
      stalk.rotation.set(place * 0.08, 0, -Math.PI / 2);
      stalk.position.set(-0.1, 0.011, place * 0.017);
      return stalk;
    }));
    bunch.add(mesh(new RoundedBoxGeometry(0.008, 0.026, 0.056, 2, 0.003), paint(css("--color-tomate")), (m) => m.position.set(-0.04, 0.012, 0)));
    return bunch;
  },
  // A bunch of cilantro: thin stems tied at the root, opening into lacy leaves.
  Cilantro: () => {
    const stems = [];
    const leaves = [];
    for (let sprig = 0; 9 > sprig; sprig++) {
      const length = 0.075 + hash(sprig, 3, 1) * 0.035;
      const { stem, leaves: tips } = cilantroSprig(sprig * 1.7, length);
      const pivot = group(stem, ...tips);
      stem.position.y = length / 2;
      tips.forEach((tip) => (tip.position.y += length / 2));
      pivot.rotation.set((sprig - 4) * 0.16, 0, hash(sprig, 5, 2) * 0.3 - 0.15);
      (sprig % 2 ? leaves : stems).push(pivot);
    }
    const bunch = merged(group(...stems, ...leaves));
    bunch.add(merged(group(...[-0.5, 0, 0.5].map((lean) => leaning(mesh(new THREE.CylinderGeometry(0.0007, 0.0012, 0.014, 4), paint("#d8c9a0")), 0.014, Math.PI + lean)))));
    bunch.add(mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 12), paint(css("--color-tomate")), (m) => (m.position.y = 0.014)));
    bunch.rotation.z = -Math.PI / 2;
    bunch.position.set(-0.07, 0.012, 0);
    return group(bunch);
  },
  Lime: () => lime(false),
  // An orange: round under a dimpled peel, the nub of its stalk and a small leaf.
  Orange: () =>
    group(
      mesh(lumpy(new THREE.SphereGeometry(0.038, 28, 20), 0.025), paint("#ee9a2e"), (m) => (m.position.y = 0.037)),
      mesh(new THREE.CylinderGeometry(0.0025, 0.003, 0.006, 6), paint("#5a6a2a"), (m) => (m.position.y = 0.076)),
      mesh(new THREE.SphereGeometry(0.012, 10, 6), paint("#3d7a3a"), (m) => {
        m.scale.set(1.5, 0.15, 0.6);
        m.position.set(0.012, 0.077, 0.002);
        m.rotation.set(0, 0.4, 0.25);
      }),
    ),
  // Queso doble crema: a yellower block than queso campesino, in clear plastic crimped at the ends, with a blue printed band.
  "Double cream cheese": () =>
    group(
      mesh(new RoundedBoxGeometry(0.11, 0.045, 0.07, 3, 0.008), paint("#f2dc8c"), (m) => (m.position.y = 0.0225)),
      mesh(new THREE.BoxGeometry(0.05, 0.002, 0.072), paint("#3f6f8f"), (m) => (m.position.y = 0.046)),
      mesh(new RoundedBoxGeometry(0.116, 0.049, 0.074, 2, 0.01), paint("#ffffff", { transparent: true, opacity: 0.25 }), (m) => (m.position.y = 0.0235)),
      ...[-1, 1].map((end) => mesh(new THREE.BoxGeometry(0.012, 0.03, 0.05), paint("#ffffff", { transparent: true, opacity: 0.35 }), (m) => m.position.set(end * 0.064, 0.022, 0))),
    ),
  // A beef steak: a flat red cut, marbled, with its edge of white fat, on a tray.
  "Beef steak": () => {
    const cut = new THREE.Shape();
    cut.moveTo(-0.06, -0.01);
    cut.bezierCurveTo(-0.06, 0.04, 0.01, 0.045, 0.05, 0.03);
    cut.bezierCurveTo(0.07, 0.02, 0.065, -0.03, 0.035, -0.038);
    cut.bezierCurveTo(0.0, -0.045, -0.06, -0.04, -0.06, -0.01);
    const fat = new THREE.Shape();
    fat.moveTo(-0.062, -0.01);
    fat.bezierCurveTo(-0.062, -0.043, 0.0, -0.05, 0.037, -0.042);
    fat.bezierCurveTo(0.0, -0.036, -0.054, -0.034, -0.062, -0.01);
    const slab = (shape, color, depth, y) => mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 20 }), paint(color), (m) => {
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
    });
    const marbling = group(...[[-0.02, 0.004, 0.4], [0.015, -0.012, -0.3], [0.01, 0.016, 0.9]].map(([x, z, turn]) => mesh(new THREE.BoxGeometry(0.03, 0.0008, 0.0025), paint("#e8c8bc"), (m) => {
      m.position.set(x, 0.0282, z);
      m.rotation.y = turn;
    })));
    marbling.traverse((child) => (child.userData.noOutline = true));
    return group(
      mesh(new RoundedBoxGeometry(0.16, 0.014, 0.11, 2, 0.004), paint("#ffffff"), (m) => (m.position.y = 0.007)),
      slab(cut, "#a8332c", 0.011, 0.014),
      slab(fat, "#efe2c8", 0.012, 0.014),
      marbling,
    );
  },
  "Chicken thighs": () => drumstick(0),
  // Mora de Castilla: dark berries heaped in a clear tub with a printed sticker.
  Blackberries: () => {
    const berries = [];
    for (let index = 0; 14 > index; index++) {
      const row = Math.floor(index / 5);
      // Each berry is a knot of small drupelets round a core, as a mora is.
      const drupelets = new THREE.IcosahedronGeometry(1, 1).attributes.position;
      const berry = group(mesh(new THREE.SphereGeometry(0.0075, 10, 8), paint("#1d0d1a")));
      for (let seed = 0; drupelets.count > seed; seed += 3) {
        berry.add(mesh(new THREE.SphereGeometry(0.0042, 7, 5), paint(index % 4 ? "#1d0d1a" : "#4a1838"), (m) => m.position.set(drupelets.getX(seed) * 0.0072, drupelets.getY(seed) * 0.0086, drupelets.getZ(seed) * 0.0072)));
      }
      berry.position.set(((index % 5) - 2) * 0.019 + (row % 2) * 0.009, 0.012 + row * 0.011, (hash(index, 1, 3) - 0.5) * 0.04);
      berry.rotation.set(hash(index, 2, 3) * 3, hash(index, 3, 3) * 3, 0);
      berries.push(berry);
    }
    return group(
      merged(group(...berries)),
      mesh(new RoundedBoxGeometry(0.11, 0.05, 0.07, 2, 0.006), paint("#ffffff", { transparent: true, opacity: 0.22 }), (m) => (m.position.y = 0.025)),
      mesh(new THREE.BoxGeometry(0.03, 0.012, 0.002), paint(css("--color-mora")), (m) => m.position.set(0.03, 0.01, 0.036)),
    );
  },
  // A mango lying on its side: a kidney shape, sun-red on top going to yellow-green below.
  Mango: () => {
    const shape = (thetaStart, thetaLength, color) => {
      const geometry = new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, thetaStart, thetaLength);
      const position = geometry.attributes.position;
      for (let index = 0; position.count > index; index++) {
        const x = position.getX(index);
        const taper = 1 - 0.18 * x;
        position.setXYZ(index, x * 0.055, position.getY(index) * 0.036 * taper, position.getZ(index) * 0.04 * taper + 0.012 * (1 - x * x));
      }
      geometry.computeVertexNormals();
      return mesh(geometry, paint(color), (m) => (m.position.y = 0.036));
    };
    return group(
      shape(0, 1.15, "#c8502e"),
      shape(1.15, Math.PI - 1.15, "#c9b03c"),
      mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.008, 6), paint("#5a4a2a"), (m) => {
        m.rotation.z = Math.PI / 2;
        m.position.set(-0.058, 0.04, 0.0);
      }),
    );
  },
  // Arveja: two pods split open to show the peas, and one still closed.
  "Green peas": () => group(...[[true, 0, -0.03, 0.1], [true, 0.014, 0.012, -0.2], [false, -0.01, 0.052, 0.3]].map(([open, x, z, turn], index) => {
    const pod = group(peaPod(open, 0));
    pod.position.set(x, 0, z);
    pod.rotation.y = Math.PI / 2 + turn + index * 0.1;
    return pod;
  })),
  // A mazorca: an ear of yellow corn with its kernels in rows, the husk peeled back from the stalk end and a tuft of silk at the tip.
  Corn: () => {
    const ear = mesh(cornEar(), paint("#f0c84a"));
    const husk = [-0.9, 0, 0.9].map((turn) => {
      const leaf = mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI, 0, Math.PI), paint("#b9b56a", { side: THREE.DoubleSide }), (m) => m.scale.set(0.014, 0.05, 0.006));
      const pivot = group(leaf);
      leaf.position.y = -0.045;
      pivot.position.y = 0.012;
      pivot.rotation.set(0.5, turn, 0);
      return pivot;
    });
    const silk = mesh(new THREE.ConeGeometry(0.006, 0.018, 8), paint("#8a5a3a"), (m) => (m.position.y = 0.168));
    const result = group(ear, ...husk, silk);
    result.rotation.z = -Math.PI / 2;
    result.position.set(-0.07, 0.024, 0);
    return group(result);
  },
  // Arracacha: two pale roots and the knob of the crown they grew from.
  Arracacha: () =>
    group(
      arracacha(0),
      group(arracacha(1)).rotateY(-0.35).translateZ(0.036),
      mesh(lumpy(new THREE.SphereGeometry(0.014, 12, 8), 0.12), paint("#8a6a7a"), (m) => m.position.set(-0.066, 0.018, 0.008)),
    ),
  Ulluco: () => ulluco(0),
  // A yuca root: long, its bark brown and rough, the cut end showing the white flesh and the line of its core.
  Yuca: () =>
    group(
      group(
      mesh(lumpy(lathe([[0, 0], [0.008, 0.004], [0.017, 0.04], [0.024, 0.11], [0.025, 0.17], [0, 0.17]], 18), 0.05), paint("#7a4e2c"), (m) => {
        m.rotation.z = Math.PI / 2;
        m.position.set(0.085, 0.025, 0);
      }),
      mesh(new THREE.CircleGeometry(0.026, 20), paint("#f4efe2"), (m) => {
        m.rotation.y = -Math.PI / 2;
        m.position.set(-0.0885, 0.025, 0);
      }),
      mesh(new THREE.RingGeometry(0.004, 0.006, 16), paint("#d9cfb4"), (m) => {
        m.rotation.y = -Math.PI / 2;
        m.position.set(-0.089, 0.025, 0);
        m.userData.noOutline = true;
      }),
    ).rotateY(0.7),
    ),
  // A head of garlic: a white bulb pinched into cloves, drawn to a dry stalk, and one clove broken off.
  Garlic: () => {
    const bulb = lathe([[0, 0], [0.012, 0.002], [0.026, 0.014], [0.027, 0.028], [0.016, 0.044], [0.004, 0.054], [0.003, 0.064], [0, 0.064]], 32);
    const position = bulb.attributes.position;
    for (let index = 0; position.count > index; index++) {
      const lobe = 1 + 0.08 * Math.cos(Math.atan2(position.getZ(index), position.getX(index)) * 8);
      position.setX(index, position.getX(index) * lobe);
      position.setZ(index, position.getZ(index) * lobe);
    }
    bulb.computeVertexNormals();
    return group(
      mesh(bulb, paint("#f1ebe0"), (m) => m.scale.setScalar(1.25)),
      mesh(lathe([[0, 0], [0.007, 0.004], [0.008, 0.014], [0.003, 0.026], [0, 0.028]], 12), paint("#ece2cf"), (m) => {
        m.rotation.set(0, 0, 1.3);
        m.position.set(0.045, 0.008, 0.01);
      }),
    );
  },
  // A red pepper (pimentón): glossy, taller than wide, four lobes at its foot and a bent green stalk.
  Pepper: () => {
    const body = lathe([[0, 0.006], [0.016, 0.001], [0.03, 0.008], [0.036, 0.03], [0.037, 0.058], [0.031, 0.074], [0.014, 0.08], [0.007, 0.075], [0, 0.074]], 32);
    const position = body.attributes.position;
    for (let index = 0; position.count > index; index++) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const y = position.getY(index);
      const lobe = Math.cos(Math.atan2(z, x) * 4);
      position.setXYZ(index, x * (1 + 0.1 * lobe), y + 0.006 * lobe * Math.max(0, 1 - y / 0.03), z * (1 + 0.1 * lobe));
    }
    body.computeVertexNormals();
    return group(
      mesh(body, paint("#c8322a")),
      mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.006, 10), paint("#3d7a3a"), (m) => (m.position.y = 0.077)),
      mesh(new THREE.CylinderGeometry(0.0028, 0.0034, 0.022, 6), paint("#3d7a3a"), (m) => {
        m.rotation.z = 0.5;
        m.position.set(-0.004, 0.088, 0);
      }),
    );
  },
  Squash: () => squashWedge(),
  Papaya: () => papayaHalf(),
  // A granadilla: a smooth orange shell freckled pale, with its curled stalk and two dry bracts.
  Granadilla: () => {
    const freckles = group(...Array.from({ length: 10 }, (_, spot) => {
      const point = new THREE.Vector3(hash(spot, 1, 4) - 0.5, hash(spot, 2, 4) * 0.8, hash(spot, 3, 4) - 0.5).normalize();
      return mesh(new THREE.CircleGeometry(0.0022, 6), paint("#f6d9a0"), (m) => {
        m.position.copy(point).multiplyScalar(0.0372);
        m.lookAt(m.position.clone().multiplyScalar(2));
        m.position.y += 0.036;
      });
    }));
    freckles.traverse((child) => (child.userData.noOutline = true));
    return group(
      mesh(new THREE.SphereGeometry(0.037, 24, 16), paint("#e8a33a"), (m) => {
        m.scale.set(1, 1.08, 1);
        m.position.y = 0.036;
      }),
      freckles,
      mesh(new THREE.TorusGeometry(0.012, 0.0022, 6, 16, Math.PI * 1.3), paint("#7a6a3a"), (m) => {
        m.rotation.set(0, 0.4, 0.3);
        m.position.set(0.006, 0.086, 0);
      }),
      mesh(new THREE.SphereGeometry(0.012, 8, 6), paint("#c9b98a"), (m) => {
        m.scale.set(1, 0.15, 0.5);
        m.position.set(-0.008, 0.078, 0.004);
        m.rotation.z = 0.6;
      }),
    );
  },
  // Kumis: a white bottle with a red cap and a band of its label.
  Kumis: () =>
    group(
      mesh(lathe([[0, 0], [0.03, 0], [0.032, 0.01], [0.032, 0.11], [0.022, 0.135], [0.016, 0.15], [0, 0.15]], 28), paint("#f6f3ea")),
      mesh(new THREE.CylinderGeometry(0.0325, 0.0325, 0.05, 28, 1, true), paint(css("--color-cilantro")), (m) => (m.position.y = 0.06)),
      mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.018, 20), paint(css("--color-tomate")), (m) => (m.position.y = 0.158)),
    ),
  Chorizo: () => chorizoLink(),
  Trout: () => trout(),
  // Panela: two round cakes of brown cane sugar, half wrapped in dry plantain leaf and tied with a string, as Nariño sells them.
  Panela: () => {
    const cake = (y) =>
      group(
        mesh(new THREE.CylinderGeometry(0.045, 0.047, 0.032, 28), paint("#9a5a26"), (m) => (m.position.y = y + 0.016)),
        mesh(new THREE.CylinderGeometry(0.0485, 0.0485, 0.034, 28, 1, true, 0, Math.PI * 1.1), paint("#b9a46a", { side: THREE.DoubleSide }), (m) => (m.position.y = y + 0.016)),
      );
    return group(
      cake(0),
      cake(0.034),
      mesh(new THREE.TorusGeometry(0.049, 0.0016, 6, 32), paint("#d8c9a0"), (m) => {
        m.rotation.x = Math.PI / 2;
        m.position.y = 0.034;
      }),
    );
  },
  // Red beans (fríjol): a glass jar full of red-brown beans, each one seen through the glass.
  "Red beans": () =>
    group(
      mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 20), paint("#5e221c"), (m) => (m.position.y = 0.04)),
      poured(() => mesh(new THREE.SphereGeometry(0.0055, 8, 6), paint("#7a2e24"), (m) => m.scale.set(1.5, 0.8, 1)), 60, 0.052, 0.052, 0.07),
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 28), paint("#ffffff", { transparent: true, opacity: 0.3 }), (m) => (m.position.y = 0.05)),
      mesh(new THREE.CylinderGeometry(0.0355, 0.0355, 0.03, 28, 1, true, -0.9, 1.8), paint("#efe7d6"), (m) => (m.position.y = 0.04)),
      mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.018, 28), paint("#1b1b1b"), (m) => (m.position.y = 0.105)),
    ),
  // Mote: large white kernels of hulled corn in a clear bag with a yellow band, its neck twisted and tied.
  Mote: () => {
    const kernels = poured(() => mesh(lumpy(new THREE.SphereGeometry(0.0075, 8, 6), 0.15), paint("#ebe1c2"), (m) => m.scale.set(1, 0.7, 0.9)), 55, 0.068, 0.036, 0.075);
    kernels.traverse((child) => (child.userData.noOutline = true));
    return group(
      mesh(new RoundedBoxGeometry(0.05, 0.065, 0.022, 2, 0.008), paint("#e2d6b2"), (m) => (m.position.y = 0.042)),
      kernels,
      mesh(lumpy(new RoundedBoxGeometry(0.085, 0.1, 0.05, 3, 0.02), 0.02), paint("#ffffff", { transparent: true, opacity: 0.3 }), (m) => (m.position.y = 0.05)),
      mesh(new THREE.BoxGeometry(0.087, 0.018, 0.052), paint("#e0b84a"), (m) => (m.position.y = 0.016)),
      mesh(new THREE.ConeGeometry(0.014, 0.022, 10), paint("#ffffff", { transparent: true, opacity: 0.35 }), (m) => (m.position.y = 0.11)),
      mesh(new THREE.TorusGeometry(0.006, 0.0018, 6, 12), paint(css("--color-tomate")), (m) => {
        m.rotation.x = Math.PI / 2;
        m.position.y = 0.104;
      }),
    );
  },
  // Oats (avena): a round cardboard tub with a printed band and a lid.
  Oats: () =>
    group(
      mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.13, 28), paint("#ece0c4"), (m) => (m.position.y = 0.065)),
      mesh(new THREE.CylinderGeometry(0.0425, 0.0425, 0.05, 28, 1, true), paint(css("--color-cobre")), (m) => (m.position.y = 0.065)),
      mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.014, 28), paint(css("--color-papa")), (m) => (m.position.y = 0.135)),
    ),
  // Cooking oil: a tall clear bottle of golden oil with a green label and cap.
  Oil: () =>
    group(
      mesh(lathe([[0, 0], [0.03, 0], [0.032, 0.012], [0.03, 0.06], [0.032, 0.13], [0.02, 0.165], [0.013, 0.18], [0, 0.18]], 28), paint("#e9c24a", { transparent: true, opacity: 0.8 })),
      mesh(new THREE.CylinderGeometry(0.0315, 0.0315, 0.045, 28, 1, true), paint(css("--color-cilantro")), (m) => (m.position.y = 0.09)),
      mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.016, 16), paint("#2f7a4a"), (m) => (m.position.y = 0.188)),
    ),
  // Ground coffee: a dark stand-up pouch, its top folded down, with a pale label and the round valve.
  Coffee: () =>
    group(
      mesh(lumpy(new RoundedBoxGeometry(0.075, 0.12, 0.042, 3, 0.012), 0.015), paint("#3a2618"), (m) => (m.position.y = 0.06)),
      mesh(new RoundedBoxGeometry(0.075, 0.022, 0.03, 2, 0.008), paint("#4a3220"), (m) => m.position.set(0, 0.122, 0.006)),
      mesh(new THREE.BoxGeometry(0.05, 0.04, 0.002), paint("#d8b47a"), (m) => m.position.set(0, 0.06, 0.0215)),
      mesh(new THREE.CircleGeometry(0.006, 12), paint("#1c1712"), (m) => m.position.set(0, 0.095, 0.0222)),
    ),
  // Ají: a small jar of red hot sauce with green herbs in it, under a green band.
  Aji: () =>
    group(
      mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.05, 20), paint("#9a3522"), (m) => (m.position.y = 0.03)),
      poured((index) => mesh(new THREE.SphereGeometry(index % 4 ? 0.006 : 0.004, 6, 5), paint(index % 4 ? "#b8432a" : "#4f8a3a")), 40, 0.042, 0.042, 0.05),
      mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.07, 24), paint("#ffffff", { transparent: true, opacity: 0.25 }), (m) => (m.position.y = 0.035)),
      mesh(new THREE.CylinderGeometry(0.0275, 0.0275, 0.016, 24, 1, true), paint("#4f8a3a"), (m) => (m.position.y = 0.04)),
      mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.014, 24), paint("#2b2a22"), (m) => (m.position.y = 0.075)),
    ),
  // A head of cabbage (repollo): a tight pale head wrapped in a few darker outer leaves that open at the top.
  Cabbage: () =>
    group(
      mesh(lumpy(new THREE.SphereGeometry(0.05, 24, 16), 0.03), paint("#c9dc9a"), (m) => {
        m.scale.set(1, 0.9, 1);
        m.position.y = 0.046;
      }),
      ...[0, 1, 2, 3, 4].map((leaf) => {
        const wrap = cuppedLeaf(0.058, 1.9, 1.75, 0.05, leaf % 2 ? "#8fb56a" : "#6f9a4e");
        wrap.position.y = 0.046;
        const pivot = group(wrap);
        pivot.rotation.order = "YXZ";
        pivot.rotation.set(0.28, leaf * 1.26, 0);
        return pivot;
      }),
    ),
  // A head of lettuce: ruffled leaves opening from the heart in two rings, the inner ones paler and more upright.
  Lettuce: () =>
    group(
      ...Array.from({ length: 12 }, (_, leaf) => {
        const inner = leaf >= 7;
        const blade = mesh(lumpy(new THREE.SphereGeometry(inner ? 0.026 : 0.036, 14, 8), 0.3), paint(inner ? "#a6d26a" : "#6aa04a"), (m) => {
          m.scale.set(0.7, 0.2, 1);
          m.position.z = inner ? 0.018 : 0.03;
        });
        const pivot = group(blade);
        pivot.rotation.order = "YXZ";
        pivot.rotation.set(inner ? -0.95 : -0.55, (leaf * Math.PI * 2) / (inner ? 5 : 7) + (inner ? 0.4 : 0), 0);
        pivot.position.y = 0.012;
        return pivot;
      }),
    ),
  // An apple: round with a dip at the stalk, red over a little lumpy skin, its stalk and one leaf.
  Apple: () =>
    group(
      mesh(lumpy(lathe([[0, 0.006], [0.02, 0], [0.034, 0.014], [0.038, 0.036], [0.033, 0.058], [0.016, 0.066], [0.005, 0.06], [0, 0.057]], 28), 0.02), paint("#b8302a")),
      mesh(new THREE.CylinderGeometry(0.0016, 0.002, 0.016, 6), paint("#5a4a2a"), (m) => {
        m.rotation.z = 0.2;
        m.position.set(0.001, 0.066, 0);
      }),
      mesh(new THREE.SphereGeometry(0.012, 10, 6), paint("#3d7a3a"), (m) => {
        m.scale.set(1.5, 0.15, 0.6);
        m.position.set(0.012, 0.07, 0.002);
        m.rotation.set(0, 0.5, 0.35);
      }),
    ),
  // A pineapple standing up: a body of diamond eyes and a crown of long stiff leaves.
  Pineapple: () => {
    const profile = Array.from({ length: 36 }, (_, index) => {
      const t = index / 35;
      return [0.042 * Math.sin(Math.PI * (0.08 + 0.84 * t)) ** 0.5, t * 0.12];
    });
    const body = lathe([[0, 0], ...profile, [0, 0.12]], 48);
    const position = body.attributes.position;
    for (let index = 0; position.count > index; index++) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const angle = Math.atan2(z, x);
      const eye = 1 + 0.09 * Math.abs(Math.sin(angle * 8 + position.getY(index) * 140) * Math.sin(angle * 8 - position.getY(index) * 140)) ** 0.5;
      position.setX(index, x * eye);
      position.setZ(index, z * eye);
    }
    body.computeVertexNormals();
    return group(
      mesh(body, paint("#c9902e")),
      ...Array.from({ length: 11 }, (_, leaf) => {
        const length = 0.05 + (leaf % 3) * 0.012;
        const blade = leaning(mesh(new THREE.ConeGeometry(0.006, length, 4), paint(leaf % 2 ? "#4f7a3a" : "#3f6a32")), length, 0.25 + (leaf % 3) * 0.2, (leaf * Math.PI * 2) / 11);
        blade.position.y = 0.115;
        return blade;
      }),
    );
  },
  // A pork chop on a tray: pale pink meat round the curve of the bone, its rim of fat.
  "Pork chop": () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.055, 0);
    shape.bezierCurveTo(-0.055, 0.04, 0.02, 0.045, 0.045, 0.02);
    shape.bezierCurveTo(0.06, 0.0, 0.04, -0.035, 0.0, -0.035);
    shape.bezierCurveTo(-0.04, -0.035, -0.055, -0.02, -0.055, 0);
    const slab = (outline, color, depth, scale) => mesh(new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 20 }), paint(color), (m) => {
      m.rotation.x = -Math.PI / 2;
      m.scale.set(scale, scale, 1);
      m.position.y = 0.014;
    });
    return group(
      mesh(new RoundedBoxGeometry(0.15, 0.014, 0.1, 2, 0.004), paint("#ffffff"), (m) => (m.position.y = 0.007)),
      slab(shape, "#f4ead8", 0.012, 1),
      slab(shape, "#e8a8a0", 0.013, 0.86),
      mesh(new RoundedBoxGeometry(0.012, 0.012, 0.055, 2, 0.004), paint("#efe6d6"), (m) => {
        m.position.set(-0.02, 0.026, 0.0);
        m.rotation.y = 0.5;
      }),
    );
  },
  // Cuy, as Nariño roasts it: the whole roasted body golden on a platter, with small yellow potatoes beside it.
  Cuy: () =>
    group(
      mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.008, 36), paint("#f6f2e8"), (m) => {
        m.scale.set(1, 1, 0.7);
        m.position.y = 0.004;
      }),
      mesh(grown([0.055, 0.022, 0.03], 1.7, 0.05), paint("#a8572a"), (m) => m.position.set(-0.01, 0.028, 0)),
      mesh(grown([0.018, 0.015, 0.016], 2.9, 0.04), paint("#9a4a24"), (m) => m.position.set(0.05, 0.028, 0)),
      ...[[-0.04, 0.02], [-0.04, -0.02], [0.02, 0.022], [0.02, -0.022]].map(([x, z]) => mesh(new THREE.CapsuleGeometry(0.004, 0.012, 4, 6), paint("#8a3e1e"), (m) => {
        m.rotation.x = (Math.PI / 2) * Math.sign(z);
        m.position.set(x, 0.014, z * 1.2);
      })),
      ...[[-0.06, 0.04], [0.035, -0.04], [0.066, 0.028]].map(([x, z]) => {
        const side = group(potato(2));
        side.scale.setScalar(0.65);
        side.position.set(x, 0.008, z);
        return side;
      }),
    ),
  // Leftovers (sobras): a glass container with a blue snap lid, rice on one side and stew on the other.
  Leftovers: () =>
    group(
      mesh(new RoundedBoxGeometry(0.055, 0.03, 0.082, 2, 0.008), paint("#f3efe4"), (m) => m.position.set(-0.03, 0.018, 0)),
      mesh(lumpy(new RoundedBoxGeometry(0.055, 0.032, 0.082, 2, 0.008), 0.05), paint("#8a4a2a"), (m) => m.position.set(0.03, 0.019, 0)),
      mesh(new RoundedBoxGeometry(0.125, 0.05, 0.095, 2, 0.01), paint("#ffffff", { transparent: true, opacity: 0.25 }), (m) => (m.position.y = 0.025)),
      mesh(new RoundedBoxGeometry(0.128, 0.01, 0.098, 2, 0.004), paint("#3f6f8f"), (m) => (m.position.y = 0.055)),
      ...[-1, 1].map((side) => mesh(new THREE.BoxGeometry(0.03, 0.014, 0.004), paint("#3f6f8f"), (m) => m.position.set(0, 0.049, side * 0.05))),
    ),
  "Tree tomato": () => treeTomato(),
  Oca: () => oca("#c9677d"),
  Lulo: () => naranjilla(),
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

export const FOOD_NAMES = Object.keys(FOODS);

export function sized(model) {
  const box = new THREE.Box3().setFromObject(model);
  model.userData.width = box.max.x - box.min.x;
  model.userData.rest = -box.min.y;
  model.userData.height = box.max.y - box.min.y;
  return model;
}

export function foodModel(name, category, grams) {
  const model = DETAILED[name] ? DETAILED[name](grams) : (FOODS[name] ?? BY_CATEGORY[category] ?? BY_CATEGORY.VEGETABLE)();
  return outline(group(model));
}

