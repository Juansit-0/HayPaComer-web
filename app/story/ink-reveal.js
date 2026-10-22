// Ink reveal: an image develops like ink soaking into paper, wicking ahead along the fibres with a darker rim where it pools.
// Ported to plain modules from "Ink Reveal" by ryanonline1234 on 21st.dev (MIT, https://github.com/ryanonline1234/ease-atlas); the shader is theirs,
// the surface sharing and the landing wiring are ours. Every reveal draws through one WebGL2 context, created on first use and released with
// releaseInk(); each image gets a 2D canvas laid over it. Without WebGL2 the caller keeps its own reveal.

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform sampler2D uRestTex;
uniform float uSwap;
uniform vec2 uRestCover;
uniform vec2 uResolution;
uniform vec2 uCover;
uniform float uScale;
uniform float uProgress;
uniform float uFeather;
uniform float uGrain;
uniform float uNoiseScale;
uniform float uRest;
uniform float uRadial;
uniform vec2 uSeed;
uniform vec2 uDir;
uniform float uOff;
uniform float uMaxDist;
uniform vec3 uPaper;
uniform vec3 uInk;

uint hashU(uvec2 p) {
  uint n = p.x * 1664525u ^ (p.y * 22695477u + 12345u);
  n ^= n >> 15u; n *= 2246822519u;
  n ^= n >> 13u; n *= 3266489917u;
  n ^= n >> 16u;
  return n;
}
float hash2(vec2 p) {
  ivec2 ip = ivec2(floor(p)) + 32768;
  return float(hashU(uvec2(ip))) / 4294967295.0;
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = m * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec3 img = texture(uTex, 0.5 + (uv - 0.5) * uCover / uScale).rgb;
  vec2 q = uv * vec2(aspect, 1.0);
  float n = fbm(q * uNoiseScale) + (vnoise(q * uNoiseScale * 9.0) - 0.5) * 0.07;
  float d = uRadial > 0.5 ? length((uv - uSeed) * vec2(aspect, 1.0)) / uMaxDist : clamp(dot(uv, uDir) + uOff, 0.0, 1.0);
  float f = mix(n, d, 0.4);
  float w = max(uFeather, 0.002) * 0.5;
  float t = -w - 0.03 + (1.0 + 2.0 * w + 0.03) * uProgress;
  vec2 fq = q * uNoiseScale * 3.0;
  float r1 = 1.0 - abs(2.0 * vnoise(vec2(fq.x * 3.0 + fq.y * 1.2, fq.y * 0.7 - fq.x * 0.3) + vnoise(fq * 1.7) * 1.5) - 1.0);
  float r2 = 1.0 - abs(2.0 * vnoise(vec2(fq.x * 0.6 - fq.y * 0.4 + 5.0, fq.y * 3.0 + fq.x * 0.9) + vnoise(fq * 1.3 + 9.0) * 1.5) - 1.0);
  float fib = pow(max(r1, r2), 16.0);
  float dark = 1.0 - smoothstep(0.2, 0.45, dot(uPaper, vec3(0.299, 0.587, 0.114)));
  f -= fib * w * mix(0.55, 0.3, dark) * (1.0 - smoothstep(w, w * 2.0, abs(f - t)));
  float reveal = 1.0 - smoothstep(t - w * mix(0.6, 0.22, dark), t + w * mix(0.3, 0.15, dark), f);
  float band = smoothstep(t - w * 0.8, t, f) * (1.0 - smoothstep(t, t + w * 0.2, f));
  float rim = 1.0 - smoothstep(0.0, w * 0.22, abs(f - t));
  float pool = 0.45 + 1.1 * vnoise(q * uNoiseScale * 2.2 + 3.0);
  float lum = dot(img, vec3(0.299, 0.587, 0.114));
  vec3 ghost = mix(uPaper, mix(img, vec3(lum), 0.65), uRest);
  if (uSwap > 0.5) ghost = texture(uRestTex, 0.5 + (uv - 0.5) * uRestCover).rgb;
  vec3 col = mix(ghost, img, reveal);
  col = mix(col, mix(img, uInk, 0.7), band * 0.42 * pool);
  col *= 1.0 - rim * 0.22 * pool;
  col += (hash2(uv * uResolution * 0.5) - 0.5) * uGrain * 0.1;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const NAMES = ["uTex", "uRestTex", "uSwap", "uRestCover", "uResolution", "uCover", "uScale", "uProgress", "uFeather", "uGrain", "uNoiseScale", "uRest", "uRadial", "uSeed", "uDir", "uOff", "uMaxDist", "uPaper", "uInk"];
const INK = [0.11, 0.09, 0.07];

let surface = null;

// Each picture gets its own fixed cell of the shared canvas. Safari copies a WebGL canvas into a 2D one as it was last presented, so if every
// picture drew into the same corner they would all show whichever was drawn last.
const CELL = 1024;
const COLUMNS = 3;

function createSurface() {
  const canvas = document.createElement("canvas");
  canvas.width = CELL * COLUMNS;
  canvas.height = CELL * 2;
  let cells = 0;
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  if (!gl) return null;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vertex = compile(gl.VERTEX_SHADER, VERT);
  const fragment = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const at = Object.fromEntries(NAMES.map((name) => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(at.uTex, 0);
  gl.uniform1i(at.uRestTex, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.enable(gl.SCISSOR_TEST);
  const textures = new Set();
  return {
    cell() {
      const index = cells++;
      const row = Math.floor(index / COLUMNS);
      if ((row + 1) * CELL > canvas.height) canvas.height = (row + 1) * CELL;
      return { x: (index % COLUMNS) * CELL, y: row * CELL };
    },
    texture(image) {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((wrap) => gl.texParameteri(gl.TEXTURE_2D, wrap, gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      textures.add(texture);
      return texture;
    },
    drop(texture) {
      if (textures.delete(texture)) gl.deleteTexture(texture);
    },
    draw(target, cell, width, height, uniforms) {
      if (gl.isContextLost()) return;
      const y = canvas.height - cell.y - height;
      gl.viewport(cell.x, y, width, height);
      gl.scissor(cell.x, y, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, uniforms.rest ?? uniforms.texture);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, uniforms.texture);
      gl.uniform1f(at.uSwap, uniforms.rest ? 1 : 0);
      gl.uniform2f(at.uRestCover, ...uniforms.restCover);
      gl.uniform2f(at.uResolution, width, height);
      gl.uniform2f(at.uCover, ...uniforms.cover);
      gl.uniform1f(at.uScale, 1 + 0.05 * (1 - uniforms.progress));
      gl.uniform1f(at.uProgress, uniforms.progress);
      gl.uniform1f(at.uFeather, 0.14);
      gl.uniform1f(at.uGrain, 0.3);
      gl.uniform1f(at.uNoiseScale, 5);
      gl.uniform1f(at.uRest, uniforms.ghost);
      gl.uniform1f(at.uRadial, uniforms.field.radial);
      gl.uniform2f(at.uSeed, ...uniforms.field.seed);
      gl.uniform2f(at.uDir, ...uniforms.field.dir);
      gl.uniform1f(at.uOff, uniforms.field.off);
      gl.uniform1f(at.uMaxDist, uniforms.field.maxDist);
      gl.uniform3f(at.uPaper, ...uniforms.paper);
      gl.uniform3f(at.uInk, ...INK);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      target.clearRect(0, 0, width, height);
      target.drawImage(canvas, cell.x, cell.y, width, height, 0, 0, width, height);
    },
    release() {
      textures.forEach((texture) => gl.deleteTexture(texture));
      textures.clear();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

let unavailable = false;

export function inkAvailable() {
  if (!surface && !unavailable) {
    surface = createSurface();
    unavailable = !surface;
  }
  return Boolean(surface);
}

export function releaseInk() {
  surface?.release();
  surface = null;
}

const cover = (boxAspect, imageAspect) => (boxAspect > imageAspect ? [1, imageAspect / boxAspect] : [boxAspect / imageAspect, 1]);

function paperUnder(element) {
  for (let node = element; node; node = node.parentElement) {
    const channels = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
    if (channels && (channels[3] ?? 1) > 0) return channels.slice(0, 3).map((value) => value / 255);
  }
  return [0.95, 0.93, 0.87];
}

function field(origin, aspect) {
  if (origin === "bottom") return { radial: 0, seed: [0.5, 0.5], dir: [0, 1], off: 0, maxDist: 1 };
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const maxDist = Math.max(...corners.map(([x, y]) => Math.hypot((x - origin[0]) * aspect, y - origin[1])));
  return { radial: 1, seed: origin, dir: [0, 0], off: 0, maxDist };
}

const loaded = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

// Lays an ink canvas over an <img>. develop(origin) inks the image in from an edge or a point; swap(src, origin) inks a new picture in over the
// one shown. The <img> stays in the page for layout and assistive technology, hidden under the canvas.
export function inkImage(img, { ghost = 0 } = {}) {
  if (!inkAvailable()) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "ink-reveal";
  canvas.setAttribute("aria-hidden", "true");
  img.after(canvas);
  img.classList.add("inked");
  const context = canvas.getContext("2d");
  const cell = surface.cell();
  let settle = 0;
  const state = { progress: 0, texture: null, rest: null, aspect: 1, restAspect: 1, origin: "bottom", width: 0, height: 0 };
  const paper = paperUnder(img.parentElement);

  const paint = () => {
    if (!state.texture || !state.width || !surface) return;
    const box = state.width / state.height;
    surface.draw(context, cell, state.width, state.height, {
      texture: state.texture,
      rest: state.rest,
      progress: state.progress,
      ghost,
      paper,
      field: field(state.origin, box),
      cover: cover(box, state.aspect),
      restCover: cover(box, state.restAspect),
    });
  };
  const resize = () => {
    Object.assign(canvas.style, { left: `${img.offsetLeft + img.clientLeft}px`, top: `${img.offsetTop + img.clientTop}px`, width: `${img.clientWidth}px`, height: `${img.clientHeight}px` });
    const ratio = Math.min(2, devicePixelRatio || 1, CELL / Math.max(1, img.clientWidth, img.clientHeight));
    state.width = Math.max(1, Math.round(img.clientWidth * ratio));
    state.height = Math.max(1, Math.round(img.clientHeight * ratio));
    canvas.width = state.width;
    canvas.height = state.height;
    paint();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(img);
  const ready = loaded(img.currentSrc || img.src).then((image) => {
    state.texture = surface?.texture(image) ?? null;
    state.aspect = image.naturalWidth / image.naturalHeight;
    resize();
  });

  return {
    ready,
    set(progress, origin = state.origin) {
      state.progress = progress;
      state.origin = origin;
      paint();
      // One more copy a frame later, so a browser that hands back the previous frame still ends on the final one.
      cancelAnimationFrame(settle);
      settle = requestAnimationFrame(() => requestAnimationFrame(paint));
    },
    async swap(src) {
      const image = await loaded(src);
      if (!surface) return;
      if (state.rest) surface.drop(state.rest);
      state.rest = state.texture;
      state.restAspect = state.aspect;
      state.texture = surface.texture(image);
      state.aspect = image.naturalWidth / image.naturalHeight;
      state.progress = 0;
      paint();
    },
    dispose() {
      cancelAnimationFrame(settle);
      observer.disconnect();
      [state.texture, state.rest].forEach((texture) => texture && surface?.drop(texture));
      canvas.remove();
      img.classList.remove("inked");
    },
  };
}
