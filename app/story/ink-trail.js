// Landing only, mouse only: the pointer leaves a short trail of liquid ink in the section colours. The drops are plain circles; an SVG goo
// filter (a blur, then a hard alpha threshold) melts neighbours into one stroke. Every drop is gone within LIFE seconds and the loop stops
// when none are left, so a still pointer costs nothing. After the reference the user chose (a liquid cursor), redrawn in the brand inks.
const LIFE = 0.9;
const SPACING = 7;
const MAX_DROPS = 220;
const BAND = 160;
const INKS = ["--color-tomate", "--color-papa", "--color-cilantro", "--color-cobre", "--color-mora"];
const SVG = "http://www.w3.org/2000/svg";

function gooFilter() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.innerHTML =
    '<filter id="ink-goo" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur"/>' +
    '<feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo"/><feComposite in="SourceGraphic" in2="goo" operator="atop"/></filter>';
  return svg;
}

export function createInkTrail() {
  const filter = gooFilter();
  const canvas = document.createElement("canvas");
  canvas.className = "ink-trail";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(filter, canvas);
  const context = canvas.getContext("2d");
  const root = getComputedStyle(document.documentElement);
  const inks = INKS.map((name) => root.getPropertyValue(name).trim());
  const drops = [];
  let last = null;
  let travelled = 0;
  let frame = 0;
  let previous = 0;

  const resize = () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  };

  // The colour changes with the distance drawn, so one stroke reads as bands of ink rather than confetti.
  const drop = (x, y) => {
    const angle = Math.random() * Math.PI * 2;
    drops.push({ x, y, vx: Math.cos(angle) * 12, vy: Math.sin(angle) * 12 + 10, radius: 4 + Math.random() * 5, life: LIFE, ink: inks[Math.floor(travelled / BAND) % inks.length] });
    if (drops.length > MAX_DROPS) drops.shift();
  };

  const step = (now) => {
    const dt = Math.min(0.05, (now - previous) / 1000 || 0.016);
    previous = now;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let index = drops.length - 1; index >= 0; index--) {
      const ink = drops[index];
      ink.life -= dt;
      if (0 >= ink.life) {
        drops.splice(index, 1);
        continue;
      }
      ink.x += ink.vx * dt;
      ink.y += ink.vy * dt;
      const left = ink.life / LIFE;
      context.globalAlpha = left;
      context.fillStyle = ink.ink;
      context.beginPath();
      context.arc(ink.x, ink.y, ink.radius * (0.35 + 0.65 * left), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    frame = drops.length ? requestAnimationFrame(step) : 0;
  };

  const onMove = (event) => {
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
    filter.remove();
  };
}
