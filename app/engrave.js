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
export const boil = (now) => (inkTime.value = Math.floor(now / 125) % 8);
const INK = "vec3(0.11, 0.09, 0.08)";

export function engrave(shader) {
  shader.uniforms.hatchScale = hatchScale;
  shader.uniforms.inkTime = inkTime;
  shader.uniforms.inkBias = inkBias;
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", "uniform float hatchScale;\nuniform float inkTime;\nuniform float inkBias;\nvoid main() {")
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
      gl_FragColor.rgb = mix(base * mix(0.86, 1.0, clamp(lit, 0.0, 1.0)) + glow, ${INK}, ink * 0.88);`,
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

function cluster(make, count, spacing) {
  const result = new THREE.Group();
  for (let index = 0; index < count; index++) {
    const piece = make(index);
    const row = index % 3;
    const layer = Math.floor(index / 3);
    piece.position.x += (row - (Math.min(count, 3) - 1) / 2) * spacing;
    piece.position.z += layer * spacing * 0.8 - 0.01;
    piece.rotation.y += (hash(index, count, spacing) - 0.5) * 1.2;
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
  Tomato: (grams) => cluster(() => FOODS.Tomato(), count(grams, 120, 4), 0.07),
  Potato: (grams) => cluster(() => FOODS.Potato(), count(grams, 180, 3), 0.075),
  Carrot: (grams) => cluster(() => FOODS.Carrot(), count(grams, 70, 3), 0.035),
  Onion: (grams) => cluster(() => FOODS.Onion(), count(grams, 150, 3), 0.07),
  Avocado: (grams) => cluster(() => FOODS.Avocado(), count(grams, 200, 2), 0.07),
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
  Tomato: () => {
    const fruit = mesh(lumpy(new THREE.SphereGeometry(0.036, 32, 24), 0.05), paint("#d0412a", { roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 }), (m) => {
      m.scale.set(1, 0.84, 1);
      m.position.y = 0.03;
    });
    const calyx = mesh(new THREE.ConeGeometry(0.018, 0.01, 5), paint("#2f7a4a"), (m) => m.position.set(0, 0.062, 0));
    return group(fruit, calyx);
  },
  Egg: () => mesh(lathe([[0, 0], [0.018, 0.004], [0.022, 0.018], [0.02, 0.04], [0.012, 0.056], [0, 0.06]]), paint("#f4ead8", { roughness: 0.75 })),
  Milk: () => {
    const box = carton("#ffffff", css("--color-mora"));
    box.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.012, 16), paint(css("--color-papa")), (m) => m.position.set(0.012, 0.2, 0.012)));
    box.add(mesh(new THREE.BoxGeometry(0.073, 0.012, 0.073), paint(css("--color-cilantro")), (m) => (m.position.y = 0.11)));
    return box;
  },
  "Orange juice": () => carton("#f39a33", "#2f7a4a"),
  "Chicken breast": () =>
    group(
      mesh(new THREE.BoxGeometry(0.15, 0.012, 0.1), paint("#ffffff", { roughness: 0.4 }), (m) => (m.position.y = 0.006)),
      mesh(lumpy(new THREE.SphereGeometry(0.05, 24, 16), 0.12), paint("#efbfa0", { roughness: 0.45, clearcoat: 0.3 }), (m) => {
        m.scale.set(1.35, 0.42, 0.85);
        m.position.y = 0.03;
      }),
    ),
  "Ground beef": () =>
    group(
      mesh(new THREE.BoxGeometry(0.14, 0.012, 0.1), paint("#ffffff", { roughness: 0.4 }), (m) => (m.position.y = 0.006)),
      mesh(lumpy(new THREE.SphereGeometry(0.045, 24, 16), 0.2), paint("#9c3b31", { roughness: 0.8 }), (m) => {
        m.scale.set(1.3, 0.45, 0.95);
        m.position.y = 0.03;
      }),
    ),
  Potato: () => mesh(lumpy(new THREE.IcosahedronGeometry(0.034, 3), 0.18), paint("#c99a52", { roughness: 0.95 }), (m) => {
    m.scale.set(1.25, 0.85, 1);
    m.position.y = 0.028;
  }),
  Carrot: () => {
    const root = mesh(new THREE.ConeGeometry(0.016, 0.16, 20), paint("#e8892b", { roughness: 0.6 }), (m) => {
      m.rotation.z = Math.PI / 2;
      m.position.set(0, 0.016, 0);
    });
    const leaves = mesh(new THREE.ConeGeometry(0.012, 0.05, 6), paint("#3d8a4f"), (m) => {
      m.rotation.z = -Math.PI / 2;
      m.position.set(-0.1, 0.018, 0);
    });
    return group(root, leaves);
  },
  Onion: () => mesh(lathe([[0, 0], [0.02, 0.004], [0.034, 0.026], [0.03, 0.048], [0.012, 0.064], [0.004, 0.08], [0, 0.08]]), paint("#d9b49a", { roughness: 0.35, clearcoat: 0.5 })),
  Avocado: () => mesh(lumpy(lathe([[0, 0], [0.026, 0.006], [0.034, 0.03], [0.028, 0.06], [0.016, 0.085], [0, 0.092]]), 0.04), paint("#2e4a1e", { roughness: 0.85 })),
  Banana: () => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.08, 0.02, 0), new THREE.Vector3(0, -0.015, 0.02), new THREE.Vector3(0.08, 0.03, 0));
    return mesh(new THREE.TubeGeometry(curve, 24, 0.016, 10), paint(css("--color-papa"), { roughness: 0.5 }), (m) => (m.position.y = 0.02));
  },
  Plantain: () => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.1, 0.02, 0), new THREE.Vector3(0, -0.012, 0.02), new THREE.Vector3(0.1, 0.03, 0));
    return mesh(new THREE.TubeGeometry(curve, 24, 0.02, 10), paint("#a7a83a", { roughness: 0.6 }), (m) => (m.position.y = 0.024));
  },
  Cheese: () => {
    const wedge = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.1, 0), new THREE.Vector2(0, 0.06)]);
    const block = mesh(new THREE.ExtrudeGeometry(wedge, { depth: 0.05, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 }), paint("#f2d47a"), (m) => {
      m.rotation.x = -Math.PI / 2;
      m.position.set(-0.05, 0, 0.025);
    });
    const holes = [[-0.02, 0.012, 0.027, 0.008], [0.012, 0.02, 0.027, 0.006], [-0.032, 0.03, 0.027, 0.005]].map(([x, y, z, r]) =>
      mesh(new THREE.CircleGeometry(r, 16), paint("#d9ae4a"), (m) => {
        m.position.set(x, y, z);
        m.userData.noOutline = true;
      }),
    );
    return group(block, ...holes);
  },
  Butter: () => mesh(new RoundedBoxGeometry(0.1, 0.035, 0.05, 2, 0.006), paint("#f6e3a0", { roughness: 0.5 }), (m) => (m.position.y = 0.018)),
  Yogurt: () =>
    group(
      mesh(lathe([[0, 0], [0.026, 0], [0.032, 0.07], [0, 0.07]]), paint(css("--color-papa"), { roughness: 0.45 })),
      mesh(new THREE.CylinderGeometry(0.0305, 0.028, 0.02, 28, 1, true), paint("#ffffff"), (m) => (m.position.y = 0.035)),
      mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.004, 28), paint("#d8d8d8", { metalness: 0.8, roughness: 0.3 }), (m) => (m.position.y = 0.072)),
    ),
  Bread: () =>
    group(
      mesh(lumpy(new RoundedBoxGeometry(0.18, 0.07, 0.09, 4, 0.03), 0.04), paint("#c98a46"), (m) => (m.position.y = 0.035)),
      ...[-0.05, 0, 0.05].map((x) => mesh(new THREE.BoxGeometry(0.012, 0.004, 0.06), paint("#8a5526"), (m) => {
        m.position.set(x, 0.071, 0);
        m.rotation.y = 0.5;
        m.userData.noOutline = true;
      })),
    ),
  Rice: () => mesh(lumpy(new RoundedBoxGeometry(0.09, 0.14, 0.05, 3, 0.02), 0.03), paint("#fbfbf8", { roughness: 0.9 }), (m) => (m.position.y = 0.07)),
  Pasta: () => mesh(new RoundedBoxGeometry(0.06, 0.17, 0.04, 2, 0.004), paint(css("--color-cobre"), { roughness: 0.6 }), (m) => (m.position.y = 0.085)),
  "Black beans": () => jar("#241c1a"),
  Lentils: () => jar("#8c5a2e"),
  "Soy sauce": () => bottle("#2b1a12"),
  Tuna: () => mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.035, 32), paint("#b9c2c6", { metalness: 0.85, roughness: 0.25 }), (m) => (m.position.y = 0.018)),
  Soup: () =>
    group(
      mesh(lathe([[0, 0], [0.06, 0], [0.065, 0.07], [0.068, 0.072], [0, 0.072]]), paint("#55534e", { metalness: 0.6, roughness: 0.35 })),
      mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.008, 32), paint("#6b6a64", { metalness: 0.6, roughness: 0.3 }), (m) => (m.position.y = 0.078)),
    ),
  Arepa: () => mesh(lumpy(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 32), 0.03), paint("#efe2b8", { roughness: 0.9 }), (m) => (m.position.y = 0.008)),
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

