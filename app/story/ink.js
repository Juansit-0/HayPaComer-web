import * as THREE from "../vendor/three.module.min.js";

const FRAGMENT = `
uniform float uSweep;
uniform float uScroll;
uniform float uTime;
uniform float uAspect;
uniform float uCover;
varying vec2 vUv;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float lines(vec2 p, float pitch, float width) {
  return step(abs(fract(p.y / pitch) - 0.5), width);
}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 drift = vec2(0.0, uScroll * 0.6 + uTime * 0.1);
  float edge = noise((p + drift) * vec2(7.0, 2.5)) * 0.12 + noise((p - drift) * vec2(36.0, 5.0)) * 0.04;
  float drip = step(0.74, noise(vec2(p.x * 60.0, 3.0))) * noise(vec2(p.x * 60.0, uTime)) * 0.12;
  float travel = uSweep * (1.0 + uCover) - uCover * 0.5;
  float top = travel + uCover * 0.5 + edge;
  float bottom = travel - uCover * 0.5 - edge - drip;
  float inside = step(bottom, vUv.y) * step(vUv.y, top);
  if (inside == 0.0) discard;
  float depth = min(vUv.y - bottom, top - vUv.y) / max(0.001, uCover * 0.5);
  vec2 hatch = vec2(p.x + p.y, p.y - p.x) * 220.0 + drift.y * 40.0;
  float paper = (1.0 - lines(vec2(0.0, hatch.x), 1.0, 0.32)) * (1.0 - lines(vec2(0.0, hatch.y), 1.0, 0.24));
  float shade = smoothstep(0.0, 0.4, depth);
  float ink = mix(1.0 - paper * 0.85, 1.0, shade);
  if (ink == 0.0) discard;
  gl_FragColor = vec4(mix(vec3(0.953, 0.925, 0.875), vec3(0.11, 0.09, 0.08), ink), 1.0);
}`;

export function createInkPass({ cover = 2 } = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uSweep: { value: 0 }, uScroll: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uCover: { value: cover } },
    vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);\n}",
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
  const camera = new THREE.Camera();
  return {
    scene,
    camera,
    uniforms: material.uniforms,
    dispose() {
      material.dispose();
      scene.children[0].geometry.dispose();
    },
  };
}
