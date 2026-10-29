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
      piece.position.set(0, (index % 2) * 0.012, (index - (carrots - 1) / 2) * 0.026);
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
  // A carrot: a long root tapering to a point, faint rings across it, and a feathery top of three fronds.
  Carrot: () => {
    const root = mesh(lathe([[0, 0], [0.004, 0.01], [0.009, 0.05], [0.014, 0.11], [0.016, 0.15], [0.012, 0.158], [0, 0.16]], 16), paint("#e8892b", { roughness: 0.6 }), (m) => {
      m.rotation.z = -Math.PI / 2;
      m.position.set(-0.08, 0.016, 0);
    });
    const top = group(...[-0.35, 0, 0.35].map((spread) => mesh(new THREE.ConeGeometry(0.006, 0.06, 5), paint("#3d8a4f"), (m) => {
      m.rotation.z = Math.PI / 2;
      m.rotation.y = spread;
      m.position.set(-0.11, 0.018, Math.sin(spread) * 0.012);
    })));
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

