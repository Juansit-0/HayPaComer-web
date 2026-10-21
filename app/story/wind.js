import * as THREE from "../vendor/three.module.min.js";
import { hash } from "../engrave.js";

const VERTEX = `
attribute float along;
uniform float uTime;
uniform float uJitter;
varying float vAlong;
void main() {
  vAlong = along;
  vec3 jitter = vec3(
    sin(along * 31.0 + uTime * 1.7),
    sin(along * 23.0 + uTime * 2.3),
    sin(along * 17.0 + uTime * 1.1)
  ) * uJitter;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + jitter, 1.0);
}`;

const FRAGMENT = `
uniform float uDraw;
uniform float uFade;
varying float vAlong;
void main() {
  if (vAlong > uDraw) discard;
  float tail = smoothstep(uDraw - 0.25, uDraw, vAlong);
  gl_FragColor = vec4(vec3(0.11, 0.09, 0.08), uFade * (0.35 + 0.65 * tail));
}`;

function ribbon(points, width) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const samples = 64;
  const positions = [];
  const along = [];
  const index = [];
  const facing = new THREE.Vector3(0, 0, 1);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  for (let step = 0; samples >= step; step++) {
    const t = step / samples;
    const point = curve.getPointAt(t);
    curve.getTangentAt(t, tangent);
    side.crossVectors(tangent, facing).normalize().multiplyScalar(width * (1 - t * 0.6));
    positions.push(point.x + side.x, point.y + side.y, point.z + side.z, point.x - side.x, point.y - side.y, point.z - side.z);
    along.push(t, t);
    if (samples > step) {
      const a = step * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
  geometry.setIndex(index);
  return geometry;
}

export function createWind({ count, origin, spread, length, rise = 0.2, width = 0.006, jitter = 0.004, seed = 1 }) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uDraw: { value: 0 }, uFade: { value: 1 }, uTime: { value: 0 }, uJitter: { value: jitter } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  const random = (n) => hash(seed + n, seed * 1.3 + n * 0.7, n * 2.1);
  const wiggle = Math.max(length, rise) * 0.12;
  for (let line = 0; count > line; line++) {
    const start = new THREE.Vector3(origin[0] + (random(line) - 0.5) * spread[0], origin[1] + (random(line + 9) - 0.5) * spread[1], origin[2] + (random(line + 17) - 0.5) * spread[2]);
    const points = [0, 1, 2, 3].map((knot) =>
      new THREE.Vector3(
        start.x + (knot / 3) * length * (0.7 + random(line + knot * 5) * 0.6),
        start.y + Math.sin(knot * 1.7 + line) * wiggle + (knot / 3) * rise * (0.6 + random(line + 3) * 0.4),
        start.z + Math.cos(knot * 1.3 + line) * wiggle,
      ),
    );
    group.add(new THREE.Mesh(ribbon(points, width), material));
  }
  return {
    group,
    uniforms: material.uniforms,
    dispose() {
      material.dispose();
      group.children.forEach((child) => child.geometry.dispose());
    },
  };
}
