// Landing only, mouse only: the pointer presses into the paper like a blind stamp. Where it passes the sheet sinks, with shadow on the upper
// left wall and light on the lower right (light from the top left), no ink and no colour, and the paper springs back within about three seconds.
// A height field is stamped along the path and decays; the relief is the field minus itself shifted, so only the edges of the dent show.
const SCALE = 0.5;
const RADIUS = 15;
const HALF_LIFE = 0.7;
const FORGET = 3;
const OFFSET = 2;

export function createPaperPress() {
  const canvas = document.createElement("canvas");
  canvas.className = "paper-press";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const view = canvas.getContext("2d");
  const make = () => document.createElement("canvas");
  const height = make();
  const shade = make();
  const light = make();
  const field = height.getContext("2d");
  const shadeContext = shade.getContext("2d");
  const lightContext = light.getContext("2d");
  const grain = fibre(shadeContext);
  let width = 0;
  let tall = 0;
  let last = null;
  let lastStamp = -Infinity;
  let previous = 0;
  let frame = 0;

  const resize = () => {
    width = Math.ceil(innerWidth * SCALE);
    tall = Math.ceil(innerHeight * SCALE);
    for (const surface of [canvas, height, shade, light]) {
      surface.width = width;
      surface.height = tall;
    }
  };

  const dab = (x, y, depth) => {
    const radius = RADIUS * SCALE;
    const gradient = field.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${depth})`);
    gradient.addColorStop(0.8, `rgba(255,255,255,${depth})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    field.globalCompositeOperation = "source-over";
    field.fillStyle = gradient;
    field.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };

  // Shadow where the dent begins (field present, shifted field absent) and light where it ends, each tinted and laid on the paper.
  const edge = (context, first, second, tint) => {
    context.globalCompositeOperation = "copy";
    context.drawImage(height, first, first);
    context.globalCompositeOperation = "destination-out";
    context.drawImage(height, second, second);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = tint;
    context.fillRect(0, 0, width, tall);
  };

  const step = (now) => {
    const dt = Math.min(0.05, (now - previous) / 1000 || 0.016);
    previous = now;
    view.clearRect(0, 0, width, tall);
    if (now / 1000 - lastStamp > FORGET) {
      field.clearRect(0, 0, width, tall);
      frame = 0;
      return;
    }
    field.globalCompositeOperation = "destination-out";
    field.fillStyle = `rgba(0,0,0,${1 - Math.pow(0.5, dt / HALF_LIFE)})`;
    field.fillRect(0, 0, width, tall);
    edge(shadeContext, 0, OFFSET, "rgba(52, 38, 24, 0.42)");
    edge(lightContext, OFFSET, 0, "rgba(255, 251, 238, 0.6)");
    view.globalCompositeOperation = "source-over";
    view.drawImage(shade, 0, 0);
    view.drawImage(light, 0, 0);
    // The fibre of the sheet shows a little more inside the dent.
    shadeContext.globalCompositeOperation = "copy";
    shadeContext.drawImage(height, 0, 0);
    shadeContext.globalCompositeOperation = "source-in";
    shadeContext.fillStyle = grain;
    shadeContext.fillRect(0, 0, width, tall);
    view.globalAlpha = 0.18;
    view.drawImage(shade, 0, 0);
    view.globalAlpha = 1;
    frame = requestAnimationFrame(step);
  };

  const wake = () => {
    if (frame) return;
    previous = performance.now();
    frame = requestAnimationFrame(step);
  };

  const press = (x, y, depth) => {
    x *= SCALE;
    y *= SCALE;
    if (last) {
      const distance = Math.hypot(x - last.x, y - last.y);
      const spacing = RADIUS * SCALE * 0.3;
      for (let travelled = spacing; distance > travelled; travelled += spacing) {
        const t = travelled / distance;
        dab(last.x + (x - last.x) * t, last.y + (y - last.y) * t, depth);
      }
    }
    dab(x, y, depth);
    last = { x, y };
    lastStamp = performance.now() / 1000;
    wake();
  };

  let lastMove = 0;
  const onMove = (event) => {
    const now = performance.now();
    const speed = last ? Math.hypot(event.clientX * SCALE - last.x, event.clientY * SCALE - last.y) / Math.max(8, now - lastMove) : 0;
    lastMove = now;
    // A slow hand presses deeper than a fast one.
    press(event.clientX, event.clientY, 0.38 - Math.min(0.16, speed * 0.15));
  };
  const onDown = (event) => press(event.clientX, event.clientY, 0.55);
  const onLeave = () => (last = null);

  resize();
  addEventListener("resize", resize);
  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("pointerleave", onLeave);
  return () => {
    cancelAnimationFrame(frame);
    removeEventListener("resize", resize);
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointerleave", onLeave);
    canvas.remove();
  };
}

// Long paper fibres: short dark strokes, mostly horizontal, as a repeating pattern.
function fibre(target) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 96;
  const context = tile.getContext("2d");
  context.strokeStyle = "rgba(40, 30, 20, 0.7)";
  context.lineWidth = 0.6;
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let index = 0; 70 > index; index++) {
    const x = random() * 96;
    const y = random() * 96;
    const length = 4 + random() * 10;
    const angle = (random() - 0.5) * 0.5;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }
  return target.createPattern(tile, "repeat");
}
