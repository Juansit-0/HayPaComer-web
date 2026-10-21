// Dev only: render the engraved stills used by the landing and dish cards, at double size, as webp data URLs.
// Run from the mock with ?dev=stills; the review tool saves them into app/stills/.
import * as THREE from "../vendor/three.module.min.js";
import { inkBias, setHatchScale } from "../engrave.js";
import { board, doorSensor, PAPER, plateScene, probe, scaleScene, stocked } from "../story/scenes.js";

const STILLS = {
  fridge: { build: stocked, position: [1.35, 1.55, 3.0], target: [-0.12, 0.84, 0], fov: 34, size: [720, 900] },
  door: { build: doorSensor, position: [0.95, 1.18, 0.95], target: [0.33, 0.98, 0.3], fov: 30 },
  probe: { build: probe, position: [0.22, 0.26, 0.34], target: [0, 0.01, 0], fov: 32 },
  board: { build: board, position: [0.07, 0.1, 0.11], target: [0.002, 0, 0], fov: 34 },
  scale: { build: scaleScene, position: [0.5, 1.28, 0.62], target: [0.03, 0.99, 0.05], fov: 34 },
  plate: { build: plateScene, position: [0.48, 1.22, 0.66], target: [0.02, 0.8, 0.02], fov: 34 },
};

export async function renderStills(scale = 2) {
  await document.fonts.load("700 64px 'Hanken Grotesk'").catch(() => null);
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(scale);
  setHatchScale(scale);
  renderer.setClearColor(PAPER);
  renderer.toneMapping = THREE.NoToneMapping;
  inkBias.value = 0.06;
  const pictures = {};
  for (const [kind, view] of Object.entries(STILLS)) {
    const [width, height] = view.size ?? [720, 720];
    renderer.setSize(width, height, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#b9b19c", 1.0));
    const sun = new THREE.DirectionalLight("#ffffff", 1.4);
    sun.position.set(-3, 6, 5);
    scene.add(sun);
    const world = view.build();
    world.userData.play?.(1);
    scene.add(world);
    const camera = new THREE.PerspectiveCamera(view.fov, width / height, 0.005, 60);
    camera.position.set(...view.position);
    camera.lookAt(new THREE.Vector3(...view.target));
    renderer.render(scene, camera);
    pictures[kind] = canvas.toDataURL("image/webp", 0.85);
  }
  inkBias.value = 0;
  renderer.dispose();
  renderer.forceContextLoss();
  return pictures;
}
