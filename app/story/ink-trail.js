// Landing only, mouse only: the pointer leaves a short trail of liquid ink in the section colours that is gone within LIFE seconds.
// The drops melt into one stroke as metaballs computed on the GPU: each pixel sums r²/d² over the drops and the stroke is where that field
// passes 1, with its colour weighted by the nearest drops. No SVG filter (Safari ran the old blur-and-threshold on the CPU at about 10 fps),
// only the box around the trail is shaded, and the loop stops when no drops are left. After the liquid cursor the user chose as reference.
const LIFE = 0.9;
const SPACING = 9;
const MAX_DROPS = 80;
const BAND = 160;
const INKS = ["--color-tomate", "--color-papa", "--color-cilantro", "--color-cobre", "--color-mora"];

const VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 drops[${MAX_DROPS}];
uniform vec3 inks[${MAX_DROPS}];
uniform int count;
out vec4 color;
void main() {
  float field = 0.0;
  vec3 tint = vec3(0.0);
  for (int index = 0; index < count; index++) {
    vec2 away = gl_FragCoord.xy - drops[index].xy;
    float share = drops[index].z * drops[index].z / (dot(away, away) + 1.0);
    field += share;
    tint += inks[index] * share;
  }
  float edge = max(fwidth(field), 1e-3);
  float ink = smoothstep(1.0 - edge, 1.0 + edge, field);
  color = vec4(tint / max(field, 1e-4) * ink, ink);
}`;

function program(gl) {
  const result = gl.createProgram();
  [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]].forEach(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(result, shader);
  });
  gl.linkProgram(result);
  return gl.getProgramParameter(result, gl.LINK_STATUS) ? result : null;
}

const rgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.trim().slice(start, start + 2), 16) / 255);

export function createInkTrail() {
  const canvas = document.createElement("canvas");
  canvas.className = "ink-trail";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  const shader = gl && program(gl);
  if (!shader) return () => {};
  document.body.append(canvas);
  gl.useProgram(shader);
  const where = { drops: gl.getUniformLocation(shader, "drops"), inks: gl.getUniformLocation(shader, "inks"), count: gl.getUniformLocation(shader, "count") };
  const root = getComputedStyle(document.documentElement);
  const inks = INKS.map((name) => rgb(root.getPropertyValue(name)));
  const dropData = new Float32Array(MAX_DROPS * 3);
  const inkData = new Float32Array(MAX_DROPS * 3);
  const drops = [];
  let scale = 1;
  let last = null;
  let travelled = 0;
  let frame = 0;
  let previous = 0;

  const resize = () => {
    scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * scale);
    canvas.height = Math.round(innerHeight * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  // The colour changes with the distance drawn, so one stroke reads as bands of ink rather than confetti.
  const drop = (x, y) => {
    const angle = Math.random() * Math.PI * 2;
    drops.push({ x, y, vx: Math.cos(angle) * 12, vy: Math.sin(angle) * 12 + 10, radius: 5 + Math.random() * 4, life: LIFE, ink: inks[Math.floor(travelled / BAND) % inks.length] });
    if (drops.length > MAX_DROPS) drops.shift();
  };

  const step = (now) => {
    const dt = Math.min(0.05, (now - previous) / 1000 || 0.016);
    previous = now;
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (let index = drops.length - 1; index >= 0; index--) {
      const ink = drops[index];
      ink.life -= dt;
      if (0 >= ink.life) drops.splice(index, 1);
    }
    if (!drops.length) {
      frame = 0;
      return;
    }
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    drops.forEach((ink, index) => {
      ink.x += ink.vx * dt;
      ink.y += ink.vy * dt;
      const radius = ink.radius * (0.35 + (0.65 * ink.life) / LIFE) * scale;
      const x = ink.x * scale;
      const y = canvas.height - ink.y * scale;
      dropData.set([x, y, radius], index * 3);
      inkData.set(ink.ink, index * 3);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    });
    // The field of a drop fades within a few radii, so shading the trail's box plus a margin covers every visible pixel.
    const margin = 40 * scale;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.floor(left - margin), Math.floor(top - margin), Math.ceil(right - left + margin * 2), Math.ceil(bottom - top + margin * 2));
    gl.uniform3fv(where.drops, dropData);
    gl.uniform3fv(where.inks, inkData);
    gl.uniform1i(where.count, drops.length);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frame = requestAnimationFrame(step);
  };

  const onMove = (event) => {
    if (document.documentElement.hasAttribute("data-quiet-pointer")) {
      last = null;
      return;
    }
    const x = event.clientX;
    const y = event.clientY;
    if (last) {
      const distance = Math.hypot(x - last.x, y - last.y);
      for (let along = SPACING; distance > along; along += SPACING) drop(last.x + ((x - last.x) * along) / distance, last.y + ((y - last.y) * along) / distance);
      travelled += distance;
    }
    drop(x, y);
    last = { x, y };
    if (!frame) {
      previous = performance.now();
      frame = requestAnimationFrame(step);
    }
  };
  const onLeave = () => (last = null);

  resize();
  addEventListener("resize", resize);
  addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave);
  return () => {
    cancelAnimationFrame(frame);
    removeEventListener("resize", resize);
    removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", onLeave);
    canvas.remove();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}
