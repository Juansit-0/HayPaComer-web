// Landing only, mouse only: the pointer stains the page like a wet brush on absorbent paper. The stroke bleeds at its edges, throws drops when it moves
// fast, splashes on a click and dries slowly. Dark ink is multiplied onto light paper; over the ink-dark chapters a pale ink is screened on instead,
// so text always stays readable. The native cursor stays and the canvases never take pointer events.
const DRY = 0.9;
const INKS = { dark: "24, 18, 14", pale: "243, 236, 223" };

function layer(blend) {
  const canvas = document.createElement("canvas");
  canvas.className = "ink-cursor";
  canvas.style.mixBlendMode = blend;
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  return { canvas, context: canvas.getContext("2d") };
}

// Light paper gets dark ink; a dark chapter gets pale ink.
function inkUnder(x, y, memo) {
  let element = document.elementFromPoint(x, y);
  while (element && element !== document.body) {
    if (memo.has(element)) return memo.get(element);
    const channels = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number);
    if (channels && (channels[3] ?? 1) > 0.5) {
      const kind = (0.299 * channels[0] + 0.587 * channels[1] + 0.114 * channels[2]) / 255 > 0.45 ? "dark" : "pale";
      memo.set(element, kind);
      return kind;
    }
    element = element.parentElement;
  }
  return "dark";
}

export function createInkCursor() {
  const layers = { dark: layer("multiply"), pale: layer("screen") };
  const memo = new WeakMap();
  let frame = 0;
  let last = null;
  let lastTime = 0;
  let wet = 0;
  const drops = [];

  const resize = () => {
    const ratio = Math.min(2, devicePixelRatio || 1);
    Object.values(layers).forEach(({ canvas, context }) => {
      canvas.width = innerWidth * ratio;
      canvas.height = innerHeight * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    });
  };
  resize();

  const blot = (context, ink, x, y, radius, alpha) => {
    context.fillStyle = `rgba(${ink}, ${alpha})`;
    context.beginPath();
    for (let step = 0; 11 > step; step++) {
      const angle = (step / 11) * Math.PI * 2;
      const wobble = radius * (0.78 + Math.random() * 0.44);
      context.lineTo(x + Math.cos(angle) * wobble, y + Math.sin(angle) * wobble);
    }
    context.closePath();
    context.fill();
  };

  const throwDrops = (kind, x, y, count, speed) => {
    for (let index = 0; count > index; index++) {
      const angle = Math.random() * Math.PI * 2;
      const push = speed * (0.4 + Math.random());
      drops.push({ kind, x, y, vx: Math.cos(angle) * push, vy: Math.sin(angle) * push, size: 2.5 + Math.random() * 6, life: 1 });
    }
  };

  const tick = (now) => {
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    Object.values(layers).forEach(({ context }) => {
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = `rgba(0, 0, 0, ${1 - Math.exp(-dt * DRY)})`;
      context.fillRect(0, 0, innerWidth, innerHeight);
      context.globalCompositeOperation = "source-over";
    });
    for (let index = drops.length - 1; index >= 0; index--) {
      const drop = drops[index];
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.vx *= Math.exp(-dt * 7);
      drop.vy *= Math.exp(-dt * 7);
      drop.life -= dt * 2.4;
      if (0 >= drop.life) drops.splice(index, 1);
      else blot(layers[drop.kind].context, INKS[drop.kind], drop.x, drop.y, drop.size * (0.6 + drop.life * 0.4), 0.85 * drop.life);
    }
    wet = Math.max(0, wet - dt);
    frame = wet > 0 || drops.length ? requestAnimationFrame(tick) : 0;
    if (!frame) Object.values(layers).forEach(({ context }) => context.clearRect(0, 0, innerWidth, innerHeight));
  };

  const wake = () => {
    wet = 4;
    if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };

  const onMove = (event) => {
    const x = event.clientX;
    const y = event.clientY;
    if (last) {
      const kind = inkUnder(x, y, memo);
      const { context } = layers[kind];
      const ink = INKS[kind];
      const speed = Math.hypot(x - last.x, y - last.y) / Math.max(1, event.timeStamp - last.time);
      const width = Math.max(10, 40 - speed * 9);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(x, y);
      context.shadowColor = `rgba(${ink}, 0.55)`;
      context.shadowBlur = width * 0.9;
      context.strokeStyle = `rgba(${ink}, 0.35)`;
      context.lineWidth = width * 1.25;
      context.stroke();
      context.shadowBlur = 0;
      context.strokeStyle = `rgba(${ink}, 0.8)`;
      context.lineWidth = width * 0.55;
      context.stroke();
      for (let speck = 0; 3 > speck; speck++) {
        const angle = Math.random() * Math.PI * 2;
        const reach = width * (0.6 + Math.random() * 0.5);
        blot(context, ink, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, 1 + Math.random() * 2.5, 0.5);
      }
      if (speed > 1.6 && Math.random() > 0.5) throwDrops(kind, x, y, 1 + Math.floor(Math.random() * 3), speed * 160);
    }
    last = { x, y, time: event.timeStamp };
    wake();
  };

  const onDown = (event) => {
    const kind = inkUnder(event.clientX, event.clientY, memo);
    blot(layers[kind].context, INKS[kind], event.clientX, event.clientY, 18, 0.9);
    throwDrops(kind, event.clientX, event.clientY, 14, 320);
    wake();
  };

  const onLeave = () => (last = null);

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("pointerleave", onLeave);
  window.addEventListener("resize", resize);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("resize", resize);
    Object.values(layers).forEach(({ canvas }) => canvas.remove());
  };
}
