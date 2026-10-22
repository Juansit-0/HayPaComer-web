// Landing only, fine pointers only: the pointer leaves a wet ink stroke that dries away, throws drops when it moves fast, and splashes on a click.
// The native cursor stays; the canvas never takes pointer events and stops drawing once the ink has dried.
// Printer's ink, multiplied onto the page like ink on paper.
const INK = "24, 18, 14";
const DRY = 2.4;

export function createInkCursor() {
  const canvas = document.createElement("canvas");
  canvas.className = "ink-cursor";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const context = canvas.getContext("2d");
  let ratio = 1;
  let frame = 0;
  let last = null;
  let lastTime = 0;
  let wet = 0;
  const drops = [];

  const resize = () => {
    ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();

  const blot = (x, y, radius, alpha) => {
    context.fillStyle = `rgba(${INK}, ${alpha})`;
    context.beginPath();
    for (let step = 0; 9 > step; step++) {
      const angle = (step / 9) * Math.PI * 2;
      const wobble = radius * (0.82 + Math.random() * 0.36);
      context.lineTo(x + Math.cos(angle) * wobble, y + Math.sin(angle) * wobble);
    }
    context.closePath();
    context.fill();
  };

  const throwDrops = (x, y, count, speed) => {
    for (let index = 0; count > index; index++) {
      const angle = Math.random() * Math.PI * 2;
      const push = speed * (0.4 + Math.random());
      drops.push({ x, y, vx: Math.cos(angle) * push, vy: Math.sin(angle) * push, size: 2 + Math.random() * 4.5, life: 1 });
    }
  };

  const tick = (now) => {
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = `rgba(0, 0, 0, ${1 - Math.exp(-dt * DRY)})`;
    context.fillRect(0, 0, innerWidth, innerHeight);
    context.globalCompositeOperation = "source-over";
    for (let index = drops.length - 1; index >= 0; index--) {
      const drop = drops[index];
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.vx *= Math.exp(-dt * 7);
      drop.vy *= Math.exp(-dt * 7);
      drop.life -= dt * 2.2;
      if (0 >= drop.life) drops.splice(index, 1);
      else blot(drop.x, drop.y, drop.size * (0.6 + drop.life * 0.4), 0.9 * drop.life);
    }
    wet = Math.max(0, wet - dt);
    frame = wet > 0 || drops.length ? requestAnimationFrame(tick) : 0;
    if (!frame) context.clearRect(0, 0, innerWidth, innerHeight);
  };

  const wake = () => {
    wet = 2.5;
    if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };

  const onMove = (event) => {
    const x = event.clientX;
    const y = event.clientY;
    if (last) {
      const distance = Math.hypot(x - last.x, y - last.y);
      const elapsed = Math.max(1, event.timeStamp - last.time);
      const speed = distance / elapsed;
      context.strokeStyle = `rgba(${INK}, 0.92)`;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = Math.max(2.5, 14 - speed * 4);
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.quadraticCurveTo(last.x, last.y, (last.x + x) / 2, (last.y + y) / 2);
      context.lineTo(x, y);
      context.stroke();
      if (speed > 1.8 && Math.random() > 0.55) throwDrops(x, y, 1 + Math.floor(Math.random() * 2), speed * 140);
    }
    last = { x, y, time: event.timeStamp };
    wake();
  };

  const onDown = (event) => {
    blot(event.clientX, event.clientY, 11, 0.95);
    throwDrops(event.clientX, event.clientY, 9, 260);
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
    canvas.remove();
  };
}
