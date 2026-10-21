import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const { SPRINGS, damp, springConstants, springStep } = await import("../../app/motion.js");

const SETTLES = { snappy: 0.425, surface: 0.745, camera: 1.06, door: 1.07, drop: 0.73 };

test("every spring settles within the time DESIGN.md documents", () => {
  for (const [name, spring] of Object.entries(SPRINGS)) {
    const constants = springConstants(spring);
    const state = { value: 0, velocity: 0 };
    let time = 0;
    while (springStep(state, 1, constants, 1 / 60)) time += 1 / 60;
    assert.ok(SETTLES[name] * 1.2 >= time, `${name} took ${time.toFixed(3)} s`);
    assert.ok(Number.isFinite(state.value), name);
  }
});

test("a spring survives a large time step", () => {
  const state = { value: 0, velocity: 0 };
  springStep(state, 1, springConstants(SPRINGS.door), 0.1);
  assert.ok(Number.isFinite(state.value) && Number.isFinite(state.velocity));
});

test("a retargeted spring keeps its velocity", () => {
  const constants = springConstants(SPRINGS.camera);
  const state = { value: 0, velocity: 0 };
  for (let frame = 0; 10 > frame; frame++) springStep(state, 1, constants, 1 / 60);
  const velocity = state.velocity;
  springStep(state, 0, constants, 1 / 1000);
  assert.ok(Math.abs(state.velocity - velocity) / Math.abs(velocity) > 0.1 === false);
});

test("damp gives the same result at 30, 60 and 120 Hz", () => {
  const run = (hz) => {
    let value = 0;
    for (let frame = 0; hz > frame; frame++) value = damp(value, 1, 6, 1 / hz);
    return value;
  };
  const reference = run(60);
  for (const hz of [30, 120]) assert.ok(0.01 >= Math.abs(run(hz) - reference), `${hz} Hz`);
});
