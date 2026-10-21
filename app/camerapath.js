const EASES = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - (1 - x) ** 3,
  inOut: (x) => (x >= 0.5 ? 1 - (-2 * x + 2) ** 3 / 2 : 4 * x * x * x),
};

function hermite(p0, p1, p2, p3, t0, t1, t2, t3, u) {
  const span = t2 - t1;
  const m1 = t2 - t0 > 0 ? ((p2 - p0) / (t2 - t0)) * span : p2 - p1;
  const m2 = t3 - t1 > 0 ? ((p3 - p1) / (t3 - t1)) * span : p2 - p1;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
}

export function createTrack(keys) {
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const last = sorted.length - 1;
  const at = (index) => sorted[Math.max(0, Math.min(last, index))];
  return {
    keys: sorted,
    sample(t, position, look) {
      let index = 0;
      while (last > index + 1 && t >= sorted[index + 1].t) index += 1;
      const a = at(index);
      const b = at(index + 1);
      const span = b.t - a.t;
      const raw = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
      const u = (EASES[b.ease] ?? EASES.linear)(raw);
      const before = at(index - 1);
      const after = at(index + 2);
      for (let axis = 0; 3 > axis; axis += 1) {
        const value = (field) => hermite(before[field][axis], a[field][axis], b[field][axis], after[field][axis], before.t, a.t, b.t, after.t, u);
        position.setComponent(axis, value("pos"));
        look.setComponent(axis, value("look"));
      }
      return (a.fov ?? 35) + ((b.fov ?? 35) - (a.fov ?? 35)) * u;
    },
  };
}
