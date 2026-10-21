export const TIERS = {
  high: { name: "high", pixelRatio: 2, instances: 1, windLines: 48, antialias: true },
  medium: { name: "medium", pixelRatio: 1.5, instances: 0.6, windLines: 24, antialias: false },
  low: { name: "low", pixelRatio: 1, instances: 0.35, windLines: 10, antialias: false },
};

const ORDER = ["high", "medium", "low"];

let webgl2Cache = null;

export function webgl2() {
  if (webgl2Cache !== null) return webgl2Cache;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  webgl2Cache = Boolean(gl);
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return webgl2Cache;
}

export function initialTier({ search = location.search, cores = navigator.hardwareConcurrency, memory = navigator.deviceMemory, coarse = matchMedia("(pointer: coarse)").matches, saveData = navigator.connection?.saveData } = {}) {
  const forced = new URLSearchParams(search).get("tier");
  if (TIERS[forced]) return forced;
  if (saveData) return "low";
  if (coarse) return cores >= 6 && (memory ?? 4) >= 4 ? "medium" : "low";
  return cores >= 8 ? "high" : "medium";
}

export function pixelRatioFor(tier, devicePixelRatio = globalThis.devicePixelRatio ?? 1) {
  return Math.min(devicePixelRatio, TIERS[tier].pixelRatio);
}

export function createGovernor({ tier, interval = 1 / 60, warmup = 2, frames = 90, onChange }) {
  let current = tier;
  let elapsed = 0;
  let samples = [];
  let paused = 0;

  const p75 = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.75)];
  };

  return {
    get tier() {
      return current;
    },
    hold(seconds) {
      paused = Math.max(paused, seconds);
      samples = [];
    },
    sample(dt) {
      elapsed += dt;
      if (paused > 0) {
        paused -= dt;
        return current;
      }
      if (warmup > elapsed) return current;
      samples.push(dt);
      if (frames > samples.length) return current;
      const slow = p75(samples);
      const spread = Math.max(...samples) - Math.min(...samples);
      samples = [];
      const capped = 0.002 >= Math.abs(slow - 1 / 30) && 0.004 > spread;
      if (slow > interval * 1.25 && !capped) {
        const next = ORDER[ORDER.indexOf(current) + 1];
        if (next) {
          current = next;
          onChange?.(current);
        } else if (slow > 0.04) {
          onChange?.("stills");
        }
      }
      return current;
    },
  };
}
