// Virtual scroll for the landing story: while the page sits at its top, wheel, touch and keys move the story instead of the page.
// Any native scroll (screen reader, find in page, focus, anchors) releases it; the page never gets overflow hidden.
export const WHEEL = 0.3;
const TOUCH = 0.6;
const GESTURE_GAP = 200;
const JUMP_BLOCK = 200;
const ARROW = 150;
const INERTIA = 0.9;

export function wheelPixels(event, page) {
  if (event.deltaMode === 1) return event.deltaY * 24;
  if (event.deltaMode === 2) return event.deltaY * page;
  return event.deltaY;
}

export function gated(value, gates) {
  const closed = gates.find((gate) => !gate.open && value > gate.at);
  return closed ? closed.at : value;
}

export function stopAfter(stops, value, direction) {
  if (direction > 0) return stops.find((stop) => stop > value + 0.002) ?? 1;
  return [...stops].reverse().find((stop) => value - 0.002 > stop) ?? 0;
}

export function createScroller({ length, stops = [], gates = [], onGoal, onBlocked, onEnd }) {
  let goal = 0;
  let velocity = 0;
  let lastWheel = -Infinity;
  let wheelOwned = false;
  let blockedThisGesture = false;
  let blockUntil = 0;
  let touch = null;
  let glide = 0;

  const atTop = () => 1 >= window.scrollY;
  const wants = (direction) => atTop() && (direction > 0 ? 1 > goal : goal > 0);

  function set(value, { jump = false } = {}) {
    const wanted = Math.min(1, Math.max(0, value));
    const next = gated(wanted, gates);
    if (wanted > next && !blockedThisGesture) {
      blockedThisGesture = true;
      onBlocked?.(gates.find((gate) => gate.at === next));
    }
    if (jump) blockUntil = performance.now() + JUMP_BLOCK;
    if (next === goal) return false;
    goal = next;
    onGoal(goal);
    return true;
  }

  const push = (pixels) => set(goal + pixels / length());

  function onWheel(event) {
    if (event.ctrlKey || !event.deltaY) return;
    const pixels = wheelPixels(event, innerHeight);
    if (event.timeStamp - lastWheel > GESTURE_GAP) {
      wheelOwned = wants(Math.sign(pixels));
      blockedThisGesture = false;
    }
    lastWheel = event.timeStamp;
    if (!wheelOwned) return;
    event.preventDefault();
    stopGlide();
    if (blockUntil > performance.now()) return;
    push(pixels * WHEEL);
  }

  function onTouchStart(event) {
    stopGlide();
    touch = event.touches.length === 1 ? { y: event.touches[0].clientY, owned: null, samples: [] } : null;
    blockedThisGesture = false;
  }

  function onTouchMove(event) {
    if (!touch || event.touches.length !== 1) {
      touch = null;
      return;
    }
    const y = event.touches[0].clientY;
    const pixels = touch.y - y;
    if (touch.owned === null && pixels) touch.owned = wants(Math.sign(pixels));
    touch.y = y;
    if (!touch.owned) return;
    event.preventDefault();
    const now = event.timeStamp;
    touch.samples.push([now, y]);
    while (touch.samples.length > 2 && now - touch.samples[0][0] > 80) touch.samples.shift();
    push(pixels * TOUCH);
  }

  function onTouchEnd() {
    if (!touch?.owned || 2 > touch.samples.length) {
      touch = null;
      return;
    }
    const [[t0, y0], [t1, y1]] = [touch.samples[0], touch.samples.at(-1)];
    touch = null;
    if (t1 - t0 > 0) startGlide(((y0 - y1) / (t1 - t0)) * 1000 * TOUCH);
  }

  function startGlide(pixelsPerSecond) {
    velocity = pixelsPerSecond;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const moved = push(velocity * dt);
      velocity *= INERTIA ** (dt * 60);
      glide = moved && Math.abs(velocity) > 20 ? requestAnimationFrame(step) : 0;
    };
    glide = requestAnimationFrame(step);
  }

  function stopGlide() {
    cancelAnimationFrame(glide);
    glide = 0;
    velocity = 0;
  }

  function onKey(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !atTop()) return;
    if (event.target.closest?.("a, button, input, select, textarea, [contenteditable], [role=slider]")) return;
    const forward = { ArrowDown: ARROW, ArrowRight: ARROW, ArrowUp: -ARROW, ArrowLeft: -ARROW }[event.key];
    blockedThisGesture = false;
    if (forward && wants(Math.sign(forward))) {
      event.preventDefault();
      push(forward);
    } else if ((event.key === "PageDown" || (event.key === " " && !event.shiftKey)) && wants(1)) {
      event.preventDefault();
      set(stopAfter(stops, goal, 1), { jump: true });
    } else if ((event.key === "PageUp" || (event.key === " " && event.shiftKey)) && wants(-1)) {
      event.preventDefault();
      set(stopAfter(stops, goal, -1), { jump: true });
    } else if (event.key === "Home" && goal > 0) {
      event.preventDefault();
      set(0, { jump: true });
    } else if (event.key === "End" && 1 > goal) {
      event.preventDefault();
      onEnd?.();
    }
  }

  const onScroll = () => {
    if (!atTop()) stopGlide();
  };

  const options = { passive: false };
  window.addEventListener("wheel", onWheel, options);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, options);
  window.addEventListener("touchend", onTouchEnd);
  window.addEventListener("touchcancel", onTouchEnd);
  window.addEventListener("keydown", onKey);
  window.addEventListener("scroll", onScroll, { passive: true });

  return {
    get goal() {
      return goal;
    },
    captured: () => atTop() && 1 > goal,
    set,
    dispose() {
      stopGlide();
      window.removeEventListener("wheel", onWheel, options);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove, options);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    },
  };
}
