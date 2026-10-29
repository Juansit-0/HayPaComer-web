// People modelled in Blender (tools/blender/character.py): each is one skinned mesh, one skeleton and its Mixamo clips, read by a small
// loader that only knows that shape, so three's 4000-line GLTFLoader isn't needed. Folds baked in Blender arrive in COLOR_0.r and darken the
// light the hatching reads, not the colour; COLOR_0.g names each face's garment, painted here, so one model serves many looks.
import * as THREE from "../vendor/three.module.min.js";
import { engrave } from "../engrave.js";

const ARRAYS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 };
const PATHS = { translation: "position", rotation: "quaternion", scale: "scale" };
// Model units are metres; 0.91 matches the procedural people (about 1.6 tall).
const HEIGHT_SCALE = 0.91;

// The garment zone of each face, stored by tools/blender/zones.py in COLOR_0.g as steps of 1/16, in this order.
const ZONES = ["skin", "hair", "hat", "beard", "top", "band", "inner", "belt", "bottom", "shoes", "held"];
const FIGURES = ["campesino", "campesina", "cargador", "vecina", "vecino"];
export const FIGURE_KINDS = FIGURES;

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
  const zone = new Uint8Array(occlusion.length);
  for (let index = 0; occlusion.length > index; index++) {
    occlusion[index] = shade[index * folds.width];
    zone[index] = Math.round(shade[index * folds.width + 1] * 16);
  }
  geometry.setAttribute("occlusion", new THREE.BufferAttribute(occlusion, 1));
  geometry.setAttribute("zone", new THREE.BufferAttribute(zone, 1));
  geometry.setIndex(new THREE.BufferAttribute(read(primitive.indices).array, 1));
  // Blender split every vertex shared by two garments, so each face's corners all carry its zone and the mesh stays indexed.
  const flat = geometry;
  flat.computeBoundingSphere();

  const skin = json.skins[0];
  const names = json.nodes.map((node) => node.name ?? "");
  // The Blender pipeline stores on the rig, per clip, how many frames it loops over and how far one loop carries the feet.
  const extras = json.nodes.find((node) => node.extras?.frames_Walk)?.extras ?? {};
  const clips = Object.fromEntries(
    json.animations.map((animation) => {
      const tracks = animation.channels.map((channel) => {
        const sampler = animation.samplers[channel.sampler];
        const name = `${THREE.PropertyBinding.sanitizeNodeName(names[channel.target.node])}.${PATHS[channel.target.path]}`;
        const Track = channel.target.path === "rotation" ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
        return new Track(name, read(sampler.input).array, unit(read(sampler.output)), sampler.interpolation === "STEP" ? THREE.InterpolateDiscrete : THREE.InterpolateLinear);
      });
      const { name } = animation;
      return [name, { clip: new THREE.AnimationClip(name, -1, tracks), frames: extras[`frames_${name}`], stride: extras[`stride_${name}`] }];
    }),
  );
  const inverses = read(skin.inverseBindMatrices).array;
  return {
    clips,
    json,
    meshNode,
    skin,
    geometry: flat,
    binds: skin.joints.map((_, index) => new THREE.Matrix4().fromArray(inverses, index * 16)),
  };
}

// A look recolours a figure's shared shape: one geometry per combination of garment colours, so walkers in the same clothes share it.
// colors maps garment slots (skin, hat, hair, beard, top, band, inner, belt, bottom, shoes, held) to hex; band defaults to a darker top.
export function figureLook(kind, colors) {
  const { geometry } = models.get(kind);
  const tones = Object.fromEntries(Object.entries(colors).map(([slot, value]) => [slot, new THREE.Color(value).convertSRGBToLinear()]));
  tones.band ??= tones.top.clone().multiplyScalar(0.55);
  const zone = geometry.attributes.zone;
  const values = new Float32Array(zone.count * 3);
  for (let index = 0; zone.count > index; index++) {
    const color = tones[ZONES[zone.getX(index)]] ?? tones.top;
    values.set([color.r, color.g, color.b], index * 3);
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
    // People carry less ink than the buildings: the light is lifted toward paper, the folds darken it gently and a chapter's extra ink (the
    // market's low sun) is left to the setting, so the hatching keeps to the shadowed side instead of covering the whole figure.
    .replace("float shade = smoothstep(", "lit = mix(lit, 1.0, 0.55) * mix(0.88, 1.0, vOcclusion) + inkBias;\n      float shade = smoothstep(");
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

export const figureHas = (kind, act) => Boolean(models.get(kind)?.clips[act]);

// What a clip's hands hold: the bones that grip, how far up the object they grip it (0 its base, 1 its top) and its turn about the body's
// up axis (a bag at the side hangs with its broad face along the way the figure walks).
const HOLDS = { Carry: { hands: ["handR"], grip: 1, turn: Math.PI / 2 }, Haul: { hands: ["handL", "handR"], grip: 0.6, turn: 0 } };

// One person: its own skeleton and mixer over a shared look. pose() shows a clip, or two crossfading, each at a count of loops: walks count
// the ground covered over their stride, so feet don't slide, and everything else counts time.
export function figure(kind, look) {
  const { json, meshNode, skin, clips, binds } = models.get(kind);
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
  // Every clip plays at weight 0 until shown: the mixer skips evaluating an action whose weight is 0, so idle clips cost nothing.
  const mixer = new THREE.AnimationMixer(root);
  const actions = Object.fromEntries(Object.entries(clips).map(([name, { clip }]) => [name, mixer.clipAction(clip).play().setEffectiveWeight(0)]));
  let shown = [];
  const held = [];
  const upright = new THREE.Quaternion();
  // The motion capture is keyed from frame 1 at 30 fps and its last frame repeats the first.
  const at = (name, loops) => (1 + (loops - Math.floor(loops)) * clips[name].frames) / 30;

  root.userData.has = (name) => Boolean(clips[name]);
  root.userData.loops = (name, amount, clock = false) => (clock ? (amount * 30) / clips[name].frames : amount / (clips[name].stride * root.scale.y));
  root.userData.pose = (name, loops, other, otherLoops = 0, share = 0) => {
    shown.forEach((action) => action.setEffectiveWeight(0));
    shown = [actions[name]];
    actions[name].time = at(name, loops);
    actions[name].setEffectiveWeight(1 - share);
    if (other && share > 0.001) {
      shown.push(actions[other]);
      actions[other].time = at(other, otherLoops);
      actions[other].setEffectiveWeight(share);
    }
    mixer.update(0);
    // A held load hangs plumb from the hand whatever angle the wrist takes.
    held.forEach(({ object, hand, turn }) => {
      hand.updateWorldMatrix(true, false);
      root.getWorldQuaternion(upright).multiply(turn);
      object.quaternion.copy(hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(upright));
    });
  };
  // An object held for the length of a clip: gripped at the hands in the clip's first pose, then carried by the first hand.
  root.userData.hold = (object, name) => {
    if (!HOLDS[name]) return;
    const { hands, grip, turn } = HOLDS[name];
    root.userData.pose(name, 0);
    root.updateMatrixWorld(true);
    const bones = hands.map((hand) => root.getObjectByName(hand));
    const grasp = bones.reduce((sum, bone) => sum.add(bone.localToWorld(new THREE.Vector3(0, 0.07, 0))), new THREE.Vector3()).divideScalar(bones.length);
    const twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn);
    // Hung from a pivot at the grip, so keeping it plumb turns it about the hand, not about its base.
    object.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(object);
    object.position.set(-(box.min.x + box.max.x) / 2, -(box.min.y + (box.max.y - box.min.y) * grip), -(box.min.z + box.max.z) / 2);
    const pivot = new THREE.Group().add(object);
    pivot.position.copy(grasp);
    pivot.quaternion.copy(root.quaternion).multiply(twist);
    bones[0].attach(pivot);
    held.push({ object: pivot, hand: bones[0], turn: twist });
  };
  // Reaching: the arm bends at the elbow so the wrist lands on a point, share easing between the arm as last posed and the reach. The elbow
  // drops below the line from shoulder to wrist, as it does when someone pulls a door.
  const still = new Map();
  const aim = (bone, from, to) => {
    const origin = bone.getWorldPosition(new THREE.Vector3());
    const turn = new THREE.Quaternion().setFromUnitVectors(from.clone().sub(origin).normalize(), to.clone().sub(origin).normalize());
    const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.premultiply(parent.clone().invert().multiply(turn).multiply(parent));
    bone.updateMatrixWorld(true);
  };
  // The palm, a little way along the hand bone from the wrist: this is the point laid on what she reaches for.
  const PALM = new THREE.Vector3(0, 0.06, 0);
  const solve = (upper, fore, hand, goal) => {
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const elbowAt = fore.getWorldPosition(new THREE.Vector3());
    const wristAt = hand.getWorldPosition(new THREE.Vector3());
    const upperLength = shoulder.distanceTo(elbowAt);
    const foreLength = elbowAt.distanceTo(wristAt);
    const toward = goal.clone().sub(shoulder);
    const span = Math.min(toward.length(), (upperLength + foreLength) * 0.999);
    toward.normalize();
    const along = (upperLength ** 2 - foreLength ** 2 + span ** 2) / (2 * span);
    const lift = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    const bend = new THREE.Vector3(0, -1, 0).addScaledVector(toward, toward.y).normalize();
    const elbow = shoulder.clone().addScaledVector(toward, along).addScaledVector(bend, lift);
    aim(upper, elbowAt, elbow);
    aim(fore, hand.getWorldPosition(new THREE.Vector3()), shoulder.clone().addScaledVector(toward, span));
  };
  // The wrist is aimed, then moved by however far the palm landed from the target, a few times over, so the palm itself rests on it. With
  // a wrap point (behind a bar the palm lies on) the fingers and the thumb then close toward it, as a hand takes a handle.
  root.userData.reach = (side, target, share, wrap) => {
    const [upper, fore, hand, fingers, thumb] = ["upper_arm", "forearm", "hand", "fingers", "thumb"].map((part) => root.getObjectByName(part + side));
    if (!still.size) [upper, fore, fingers, thumb].filter(Boolean).forEach((bone) => still.set(bone, bone.quaternion.clone()));
    const rest = () => {
      still.forEach((turn, bone) => bone.quaternion.copy(turn));
      root.updateMatrixWorld(true);
    };
    rest();
    if (!(share > 0)) return;
    const start = hand.localToWorld(PALM.clone());
    const goal = start.clone().lerp(target, share);
    const wrist = goal.clone();
    for (let pass = 0; 4 > pass; pass++) {
      rest();
      solve(upper, fore, hand, wrist);
      wrist.add(goal.clone().sub(hand.localToWorld(PALM.clone())));
    }
    rest();
    solve(upper, fore, hand, wrist);
    if (!wrap) return;
    // The fingers curl behind the bar; the thumb lies across its front.
    [[fingers, wrap], [thumb, target]].forEach(([bone, toward]) => {
      if (!bone) return;
      const base = bone.getWorldPosition(new THREE.Vector3());
      const tip = bone.localToWorld(new THREE.Vector3(0, 0.05, 0));
      const closed = base.clone().add(toward.clone().sub(base).normalize().multiplyScalar(tip.distanceTo(base)));
      aim(bone, tip, tip.clone().lerp(closed, share));
    });
  };
  root.userData.pose(clips.Walk ? "Walk" : Object.keys(clips)[0], 0);
  return root;
}
