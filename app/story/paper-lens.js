// Landing only, mouse only: a soft raking light that lifts the paper under the pointer. It follows on a damped spring, stretches along the
// direction of travel, shows the paper's fibres where it passes, ripples gently on a click and fades when the pointer rests. Nothing is drawn
// onto the page, so it leaves no marks, and the native cursor stays.
const FOLLOW = 9;
const STRETCH = 7;

export function createPaperLens() {
  const lens = document.createElement("div");
  lens.className = "paper-lens";
  lens.setAttribute("aria-hidden", "true");
  lens.innerHTML = `<span class="paper-lens-light"></span><span class="paper-lens-grain"></span>`;
  document.body.append(lens);
  const light = lens.firstElementChild;
  const grain = lens.lastElementChild;
  const target = { x: innerWidth / 2, y: innerHeight / 2 };
  const shown = { x: target.x, y: target.y, speed: 0, angle: 0, glow: 0 };
  let lastMove = 0;
  let last = 0;
  let frame = 0;

  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const k = 1 - Math.exp(-FOLLOW * dt);
    const dx = (target.x - shown.x) * k;
    const dy = (target.y - shown.y) * k;
    shown.x += dx;
    shown.y += dy;
    const velocity = Math.hypot(dx, dy) / dt;
    shown.speed += (Math.min(1, velocity / 2400) - shown.speed) * (1 - Math.exp(-STRETCH * dt));
    if (velocity > 30) shown.angle = Math.atan2(dy, dx);
    const awake = 1400 > now - lastMove;
    shown.glow += ((awake ? 1 : 0) - shown.glow) * (1 - Math.exp(-(awake ? 6 : 1.8) * dt));
    const place = `translate3d(${shown.x.toFixed(1)}px, ${shown.y.toFixed(1)}px, 0) rotate(${shown.angle.toFixed(3)}rad) scale(${(1 + shown.speed * 0.9).toFixed(3)}, ${(1 - shown.speed * 0.35).toFixed(3)})`;
    light.style.transform = place;
    grain.style.transform = place;
    lens.style.opacity = shown.glow.toFixed(3);
    const settled = Math.abs(target.x - shown.x) + Math.abs(target.y - shown.y) < 0.3 && shown.speed < 0.002 && (awake ? shown.glow > 0.995 : shown.glow < 0.005);
    frame = settled ? 0 : requestAnimationFrame(step);
  };
  const wake = () => {
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  };

  const onMove = (event) => {
    target.x = event.clientX;
    target.y = event.clientY;
    lastMove = performance.now();
    wake();
  };
  const onDown = (event) => {
    const ring = document.createElement("span");
    ring.className = "paper-lens-ripple";
    ring.style.left = `${event.clientX}px`;
    ring.style.top = `${event.clientY}px`;
    lens.append(ring);
    ring.animate([{ scale: 0.2, opacity: 0.55 }, { scale: 2.6, opacity: 0 }], { duration: 900, easing: "cubic-bezier(.16,.84,.3,1)" }).finished.finally(() => ring.remove());
  };
  const onLeave = () => {
    lastMove = 0;
    wake();
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("pointerleave", onLeave);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointerleave", onLeave);
    lens.remove();
  };
}
