import { animate, cancelFrame, frame, hover, inView, MotionGlobalConfig, press, stagger } from "./vendor/motion.js";

export { animate, hover, inView, press, stagger };

export const SPRINGS = {
  snappy: { type: "spring", visualDuration: 0.24, bounce: 0 },
  surface: { type: "spring", visualDuration: 0.42, bounce: 0 },
  camera: { type: "spring", visualDuration: 0.6, bounce: 0 },
  door: { type: "spring", visualDuration: 0.7, bounce: 0.25 },
  drop: { type: "spring", visualDuration: 0.45, bounce: 0.2 },
};

export function springConstants({ visualDuration, bounce }) {
  const stiffness = (2 * Math.PI / (visualDuration * 1.2)) ** 2;
  return { stiffness, damping: 2 * (1 - bounce) * Math.sqrt(stiffness) };
}

export function springStep(state, target, constants, dt) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let step = 0; steps > step; step++) {
    const force = -constants.stiffness * (state.value - target) - constants.damping * state.velocity;
    state.velocity += force * h;
    state.value += state.velocity * h;
  }
  return Math.abs(state.value - target) > 1e-3 || Math.abs(state.velocity) > 1e-2;
}

export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const reducedListeners = new Set();
let reducedNow = Boolean(media?.matches);
MotionGlobalConfig.skipAnimations = reducedNow;
media?.addEventListener("change", (event) => {
  reducedNow = event.matches;
  MotionGlobalConfig.skipAnimations = reducedNow;
  tokens.clear();
  reducedListeners.forEach((listener) => listener(reducedNow));
});

export function reduced() {
  return reducedNow;
}

export function onReduced(listener) {
  reducedListeners.add(listener);
  return () => reducedListeners.delete(listener);
}

const tokens = new Map();

export function easing(name) {
  const key = `ease:${name}`;
  if (!tokens.has(key)) tokens.set(key, getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || "ease");
  return tokens.get(key);
}

export function token(name) {
  if (!tokens.has(name)) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
    tokens.set(name, raw.endsWith("ms") ? parseFloat(raw) : raw.endsWith("s") ? parseFloat(raw) * 1000 : parseFloat(raw) || 0);
  }
  return tokens.get(name);
}

const IDLE_FREEZE = 5;
const loops = new Set();
let lastInteraction = 0;

function wakeAll() {
  lastInteraction = performance.now() / 1000;
  loops.forEach((entry) => entry.wake());
}

if (typeof window !== "undefined") {
  ["pointerdown", "pointermove", "wheel", "keydown", "touchstart", "scroll"].forEach((type) =>
    window.addEventListener(type, wakeAll, { passive: true, capture: true }),
  );
  document.addEventListener("visibilitychange", () => loops.forEach((entry) => entry.sync()));
}

export function loop(element, tick, { idleHz = 8, gpu = false, onFrameTime } = {}) {
  let awake = true;
  let visible = true;
  let running = false;
  let last = 0;
  let lastIdleStep = -1;
  let stopView = null;

  const step = ({ timestamp }) => {
    const now = timestamp / 1000;
    const dt = Math.min(0.05, last ? now - last : 1 / 60);
    last = now;
    if (gpu && dt > 0) onFrameTime?.(dt);
    if (awake) {
      awake = tick(dt, now) === true;
      return;
    }
    if (now - lastInteraction > IDLE_FREEZE || reducedNow) return;
    const idleStep = Math.floor(now * idleHz);
    if (idleStep !== lastIdleStep) {
      lastIdleStep = idleStep;
      awake = tick(dt, now) === true;
    }
  };

  const entry = {
    wake() {
      awake = true;
      entry.sync();
    },
    sync() {
      const should = visible && !document.hidden;
      if (should === running) return;
      running = should;
      last = 0;
      if (running) frame.render(step, true);
      else cancelFrame(step);
    },
    stop() {
      cancelFrame(step);
      running = false;
      stopView?.();
      loops.delete(entry);
    },
  };

  loops.add(entry);
  lastInteraction = performance.now() / 1000;
  if (element) {
    stopView = inView(
      element,
      () => {
        visible = true;
        entry.wake();
        return () => {
          visible = false;
          entry.sync();
        };
      },
      { amount: 0 },
    );
  }
  entry.sync();
  return entry;
}

function scope() {
  const controller = new AbortController();
  const disposers = [];
  return {
    signal: controller.signal,
    defer(fn) {
      disposers.push(fn);
    },
    close() {
      controller.abort();
      while (disposers.length) disposers.pop()();
    },
  };
}

let current = scope();

export const page = {
  get signal() {
    return current.signal;
  },
  defer(fn) {
    current.defer(fn);
  },
};

export function newPage() {
  current.close();
  current = scope();
  return page;
}

export function grow(element, mutate) {
  const before = element.getBoundingClientRect().height;
  mutate();
  const after = element.getBoundingClientRect().height;
  if (reducedNow || 2 > Math.abs(after - before)) return null;
  return animate(element, { height: [`${before}px`, `${after}px`] }, SPRINGS.surface).then(() => element.style.removeProperty("height"));
}
