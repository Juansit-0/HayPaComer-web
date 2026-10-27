// Walking people modelled in Blender (tools/blender/character.py): each is one skinned mesh, one skeleton and one walk clip, read by a small
// loader that only knows that shape, so three's 4000-line GLTFLoader isn't needed. Folds baked in Blender arrive as COLOR_0 and darken the light
// the hatching reads, not the colour; garment colours are painted per vertex here, so one model serves many looks.
import * as THREE from "../vendor/three.module.min.js";
import { engrave } from "../engrave.js";

const ARRAYS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 };
const PATHS = { translation: "position", rotation: "quaternion", scale: "scale" };
// Model units are metres; 0.91 matches the procedural people (about 1.6 tall).
const HEIGHT_SCALE = 0.91;

const part = (joint) => joint.split(".")[0];
const ARM = ["hand", "forearm", "upper_arm", "shoulder"];
const HEAD = ["head", "neck"];

// Per figure: one walk cycle (two steps) in model units, about 1.63 times the hip height, and which garment slot each vertex wears,
// from the bone that moves it most and where it sits (y up, facing +z).
const FIGURES = {
  campesino: {
    cycle: 1.4,
    paint(p, joint) {
      if (HEAD.includes(part(joint))) {
        if (p.y > 1.63 || (p.y > 1.57 && Math.hypot(p.x, p.z + 0.02) > 0.105)) return "hat";
        if (p.y < 1.4) return "top";
        return p.z > 0.04 && p.y < 1.53 ? "beard" : "skin";
      }
      if (ARM.includes(part(joint))) return Math.abs(p.x) >= 0.5 ? "skin" : "top";
      // The ruana hangs wider than the trouser legs, so a point far from the leg's axis is cloth even below the hem line.
      const nearLeg = 0.125 > Math.hypot(Math.abs(p.x) - 0.125, p.z + 0.04);
      if (p.y > 0.735 || (!nearLeg && p.y > 0.33)) return p.y > 0.77 && 0.81 > p.y ? "band" : "top";
      if (part(joint) === "foot") return p.y < 0.035 ? "shoes" : "skin";
      return p.y < 0.165 ? "skin" : "bottom";
    },
  },
  campesina: {
    cycle: 1.39,
    paint(p, joint) {
      if (HEAD.includes(part(joint))) {
        if (p.y > 1.6 || (p.y > 1.54 && Math.hypot(p.x, p.z) > 0.1)) return "hat";
        return p.y < 1.43 ? "inner" : "skin";
      }
      if (ARM.includes(part(joint))) return Math.abs(p.x) >= 0.5 ? "skin" : "top";
      if (p.y < 0.09) return "shoes";
      if (p.y < 0.34) return "skin";
      // The ruana hangs over the skirt: its back panel nearly to the knee, its sides to the hips.
      if (p.y < 1.0) return (p.z < -0.08 && p.y > 0.66) || (Math.abs(p.x) > 0.27 && p.y > 0.8) ? "top" : "bottom";
      if (p.y < 1.06) return Math.hypot(p.x, p.z) < 0.24 && p.z > -0.05 ? "belt" : "top";
      return Math.abs(p.x) < 0.1 && p.z > 0.04 ? "inner" : "top";
    },
  },
  cargador: {
    cycle: 1.41,
    paint(p, joint) {
      if (joint === "hand.R" && p.x < -0.22) return "held";
      if (HEAD.includes(part(joint))) {
        if (p.y > 1.62 || (p.y > 1.56 && Math.hypot(p.x, p.z) > 0.1)) return "hat";
        return p.z > 0.04 && p.y < 1.52 && p.y > 1.38 ? "beard" : "skin";
      }
      if (part(joint) === "hand") return "skin";
      if (ARM.includes(part(joint))) return "top";
      if (p.y < 0.22) return "shoes";
      // The coat hangs behind and beside the trousers down to the knee.
      if (p.y < 0.98) return p.y > 0.57 && (p.z < -0.05 || Math.abs(p.x) > 0.2) ? "top" : "bottom";
      if (p.y < 1.06) return Math.hypot(p.x, p.z) < 0.24 && p.z > -0.05 && Math.abs(p.x) < 0.2 ? "belt" : "top";
      return Math.abs(p.x) < 0.07 && p.z > 0.04 ? "inner" : "top";
    },
  },
  vecina: {
    cycle: 1.39,
    paint(p, joint) {
      if (HEAD.includes(part(joint))) return p.z > 0.03 && p.y < 1.62 && p.y > 1.42 ? "skin" : p.y < 1.45 ? "inner" : "hair";
      if (part(joint) === "hand") return "skin";
      if (ARM.includes(part(joint))) return "top";
      if (p.y < 0.12) return "shoes";
      if (p.y < 0.93) return "bottom";
      return Math.abs(p.x) < 0.075 && p.z > 0.03 && p.y < 1.45 ? "inner" : "top";
    },
  },
  vecino: {
    cycle: 1.49,
    paint(p, joint) {
      if (HEAD.includes(part(joint))) return p.z > 0.06 && p.y < 1.74 && p.y > 1.56 ? "skin" : p.y < 1.56 ? "inner" : "hair";
      if (part(joint) === "hand") return "skin";
      if (ARM.includes(part(joint))) return "top";
      if (p.y < 0.1) return "shoes";
      if (p.y < 0.86) return "bottom";
      return Math.abs(p.x) < 0.07 && p.z > 0.03 ? "inner" : "top";
    },
  },
};
export const FIGURE_KINDS = Object.keys(FIGURES);

const models = new Map();

export async function loadFigures() {
  await Promise.all(
    FIGURE_KINDS.map(async (kind) => {
      if (models.has(kind)) return;
      const response = await fetch(`/app/story/models/${kind}.glb`);
      if (!response.ok) throw new Error(`${kind} ${response.status}`);
      models.set(kind, parse(await response.arrayBuffer()));
    }),
  );
}

export const figureReady = (kind) => models.has(kind);

function parse(buffer) {
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binary = 20 + jsonLength + 8;
  const read = (index) => {
    const accessor = json.accessors[index];
    const slice = json.bufferViews[accessor.bufferView];
    const Kind = ARRAYS[accessor.componentType];
    const width = WIDTH[accessor.type];
    if (slice.byteStride && slice.byteStride !== width * Kind.BYTES_PER_ELEMENT) throw new Error("interleaved glTF data is not supported");
    const start = binary + (slice.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const array = new Kind(buffer.slice(start, start + accessor.count * width * Kind.BYTES_PER_ELEMENT));
    return { array, width, normalized: Boolean(accessor.normalized) };
  };
  const unit = ({ array, normalized }) => (normalized ? Float32Array.from(array, (value) => value / (array instanceof Uint8Array ? 255 : 65535)) : array);

  const meshNode = json.nodes.findIndex((node) => node.mesh !== undefined);
  const primitive = json.meshes[json.nodes[meshNode].mesh].primitives[0];
  const geometry = new THREE.BufferGeometry();
  const attribute = (name) => read(primitive.attributes[name]);
  geometry.setAttribute("position", new THREE.BufferAttribute(attribute("POSITION").array, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(attribute("NORMAL").array, 3));
  geometry.setAttribute("skinIndex", new THREE.BufferAttribute(attribute("JOINTS_0").array, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(unit(attribute("WEIGHTS_0")), 4));
  const folds = attribute("COLOR_0");
  const shade = unit(folds);
  const occlusion = new Float32Array(geometry.attributes.position.count);
  for (let index = 0; occlusion.length > index; index++) occlusion[index] = shade[index * folds.width];
  geometry.setAttribute("occlusion", new THREE.BufferAttribute(occlusion, 1));
  geometry.setIndex(new THREE.BufferAttribute(read(primitive.indices).array, 1));
  // Unindexed so each triangle takes one garment colour: shared vertices would blend neighbouring garments into each other.
  const flat = geometry.toNonIndexed();
  flat.computeBoundingSphere();

  const skin = json.skins[0];
  const names = json.nodes.map((node) => node.name ?? "");
  const animation = json.animations[0];
  const tracks = animation.channels.map((channel) => {
    const sampler = animation.samplers[channel.sampler];
    const name = `${THREE.PropertyBinding.sanitizeNodeName(names[channel.target.node])}.${PATHS[channel.target.path]}`;
    const Track = channel.target.path === "rotation" ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    return new Track(name, read(sampler.input).array, unit(read(sampler.output)), sampler.interpolation === "STEP" ? THREE.InterpolateDiscrete : THREE.InterpolateLinear);
  });
  const inverses = read(skin.inverseBindMatrices).array;
  return {
    json,
    meshNode,
    skin,
    geometry: flat,
    clip: new THREE.AnimationClip("walk", -1, tracks),
    binds: skin.joints.map((_, index) => new THREE.Matrix4().fromArray(inverses, index * 16)),
    dominant: dominantJoints(flat, skin.joints.map((node) => names[node])),
  };
}

function dominantJoints(geometry, jointNames) {
  const index = geometry.attributes.skinIndex;
  const weight = geometry.attributes.skinWeight;
  return Array.from({ length: index.count }, (_, vertex) => {
    let best = 0;
    for (let slot = 1; 4 > slot; slot++) if (weight.getComponent(vertex, slot) > weight.getComponent(vertex, best)) best = slot;
    return jointNames[index.getComponent(vertex, best)];
  });
}

// A look recolours a figure's shared shape: one geometry per combination of garment colours, so walkers in the same clothes share it.
// colors maps garment slots (skin, hat, hair, beard, top, band, inner, belt, bottom, shoes, held) to hex; band defaults to a darker top.
export function figureLook(kind, colors) {
  const { geometry, dominant } = models.get(kind);
  const tones = Object.fromEntries(Object.entries(colors).map(([slot, value]) => [slot, new THREE.Color(value).convertSRGBToLinear()]));
  tones.band ??= tones.top.clone().multiplyScalar(0.55);
  const paint = FIGURES[kind].paint;
  const position = geometry.attributes.position;
  const values = new Float32Array(position.count * 3);
  const corner = new THREE.Vector3();
  const centre = new THREE.Vector3();
  for (let first = 0; position.count > first; first += 3) {
    centre.set(0, 0, 0);
    for (let index = first; first + 3 > index; index++) centre.add(corner.fromBufferAttribute(position, index));
    centre.divideScalar(3);
    const [a, b, c] = [dominant[first], dominant[first + 1], dominant[first + 2]];
    const joint = b === c ? b : a;
    const color = tones[paint(centre, joint)] ?? tones.top;
    for (let index = first; first + 3 > index; index++) values.set([color.r, color.g, color.b], index * 3);
  }
  const look = geometry.clone();
  look.setAttribute("color", new THREE.BufferAttribute(values, 3));
  return look;
}

const body = new THREE.MeshLambertMaterial({ vertexColors: true });
body.onBeforeCompile = (shader) => {
  engrave(shader);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute float occlusion;\nvarying float vOcclusion;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvOcclusion = occlusion;");
  shader.fragmentShader = shader.fragmentShader
    .replace("uniform float hatchScale;", "uniform float hatchScale;\nvarying float vOcclusion;")
    .replace("float shade = smoothstep(", "lit *= mix(0.45, 1.0, vOcclusion);\n      float shade = smoothstep(");
};

// The ink edge: an inverted hull pushed out along the skinned normal. Built on MeshBasicMaterial, whose vertex shader already skins normals.
const outline = new THREE.MeshBasicMaterial({ color: "#121212", side: THREE.BackSide });
outline.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    "#include <project_vertex>",
    `float wobble = 0.82 + 0.22 * (sin(position.x * 71.0) + sin(position.y * 83.0 + 1.3) + sin(position.z * 67.0 + 2.1)) / 3.0;
    float reach = 0.4 + 0.35 * max(0.0, -(modelViewMatrix * vec4(transformed, 1.0)).z);
    transformed += normalize(objectNormal) * 0.0045 * wobble * reach;
    #include <project_vertex>`,
  );
};

// One walker: its own skeleton and mixer over a shared look; walk(distance) poses the stride for the ground covered, so feet don't slide.
export function figure(kind, look) {
  const { json, meshNode, skin, clip, binds } = models.get(kind);
  const nodes = json.nodes.map((node, index) => {
    const object = skin.joints.includes(index) ? new THREE.Bone() : new THREE.Object3D();
    object.name = THREE.PropertyBinding.sanitizeNodeName(node.name ?? "");
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  json.nodes.forEach((node, index) => (node.children ?? []).forEach((child) => child !== meshNode && nodes[index].add(nodes[child])));
  const root = new THREE.Group();
  json.scenes[json.scene ?? 0].nodes.forEach((index) => index !== meshNode && root.add(nodes[index]));
  const shape = new THREE.SkinnedMesh(look, body);
  const line = new THREE.SkinnedMesh(look, outline);
  root.add(shape, line);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(skin.joints.map((index) => nodes[index]), binds);
  shape.bind(skeleton, shape.matrixWorld);
  line.bind(skeleton, shape.matrixWorld);
  // Scaled after binding: the bind matrix must match the unscaled inverse bind matrices from Blender.
  root.scale.setScalar(HEIGHT_SCALE);
  [shape, line].forEach((mesh) => (mesh.frustumCulled = false));
  line.raycast = () => {};
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const cycle = FIGURES[kind].cycle;
  const bones = skeleton.bones;
  const head = root.getObjectByName("head");
  const spine = root.getObjectByName("spine");
  // Blender keyed frames 1 to 27 of a 26-frame loop at 24 fps: the cycle starts at 1/24 s and frame 27 repeats frame 1.
  const at = (cycles) => (1 + (cycles - Math.floor(cycles)) * 26) / 24;
  const capture = (cycles) => {
    mixer.setTime(at(cycles));
    return bones.map((bone) => [bone.quaternion.clone(), bone.position.clone()]);
  };
  // Half a cycle apart the two steps mirror each other, so between them every swing cancels: legs under the hips, arms at the sides.
  const left = capture(0);
  const right = capture(0.5);
  const turn = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const nudge = (bone, x, y) => {
    if (!bone) return;
    bone.quaternion.multiply(turn.setFromAxisAngle(axis.set(1, 0, 0), x));
    bone.quaternion.multiply(turn.setFromAxisAngle(axis.set(0, 1, 0), y));
  };
  // Each walker keeps its own pace. Nothing is added on top of the clip: the mixer only rewrites a bone when its value changes, so a
  // rotation multiplied in here would pile up every frame while the scroll stands still.
  root.userData.walk = (distance, offset = 0) => {
    const pace = 0.92 + offset * 0.16;
    mixer.setTime(at(distance / (cycle * root.scale.y * pace) + offset));
  };
  // Standing: the still pose, a slow shift of weight from one leg to the other, breath in the chest and a glance around.
  root.userData.stand = (time, offset = 0) => {
    const weight = 0.5 + Math.sin(time * 0.8 + offset * 6.3) * 0.07;
    bones.forEach((bone, index) => {
      bone.quaternion.copy(left[index][0]).slerp(right[index][0], weight);
      bone.position.copy(left[index][1]).lerp(right[index][1], weight);
    });
    nudge(spine, Math.sin(time * 2.6 + offset * 9) * 0.012, 0);
    nudge(head, Math.sin(time * 0.7 + offset * 4) * 0.05, Math.sin(time * 0.45 + offset * 8) ** 3 * 0.45);
  };
  root.userData.walk(0);
  return root;
}
