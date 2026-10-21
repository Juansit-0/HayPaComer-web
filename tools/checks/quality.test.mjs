import { test } from "node:test";
import assert from "node:assert/strict";
import { createGovernor, initialTier, pixelRatioFor } from "../../app/quality.js";

const feed = (governor, dt, frames) => {
  for (let frame = 0; frames > frame; frame++) governor.sample(dt);
};

test("a slow device drops one tier at a time, then asks for stills", () => {
  const changes = [];
  const governor = createGovernor({ tier: "high", onChange: (tier) => changes.push(tier) });
  feed(governor, 1 / 60, 130);
  assert.equal(governor.tier, "high");
  feed(governor, 0.05, 400);
  assert.deepEqual(changes.slice(0, 3), ["medium", "low", "stills"]);
});

test("a steady 30 Hz cap is not treated as slow", () => {
  const governor = createGovernor({ tier: "high" });
  feed(governor, 1 / 30, 500);
  assert.equal(governor.tier, "high");
});

test("holding the governor ignores the frames of a build", () => {
  const governor = createGovernor({ tier: "high", warmup: 0 });
  governor.hold(1);
  feed(governor, 0.2, 5);
  feed(governor, 1 / 60, 90);
  assert.equal(governor.tier, "high");
});

test("the query string forces a tier and phones start lower", () => {
  assert.equal(initialTier({ search: "?tier=low", cores: 16, memory: 16, coarse: false }), "low");
  assert.equal(initialTier({ search: "", cores: 4, memory: 2, coarse: true }), "low");
  assert.equal(initialTier({ search: "", cores: 10, memory: 16, coarse: false }), "high");
  assert.equal(pixelRatioFor("medium", 3), 1.5);
});
