import { test } from "node:test";
import assert from "node:assert/strict";
import { gated, stopAfter, wheelPixels } from "../../app/story/scroller.js";

test("wheel deltas become pixels in every delta mode", () => {
  assert.equal(wheelPixels({ deltaMode: 0, deltaY: 100 }, 900), 100);
  assert.equal(wheelPixels({ deltaMode: 1, deltaY: 3 }, 900), 72);
  assert.equal(wheelPixels({ deltaMode: 2, deltaY: 1 }, 900), 900);
});

test("a closed gate holds the story and an open one lets it pass", () => {
  const gates = [{ at: 0.4, open: false }, { at: 0.8, open: false }];
  assert.equal(gated(0.3, gates), 0.3);
  assert.equal(gated(0.9, gates), 0.4);
  gates[0].open = true;
  assert.equal(gated(0.9, gates), 0.8);
});

test("space jumps to the next caption and shift space to the previous one", () => {
  const stops = [0.02, 0.07, 0.17];
  assert.equal(stopAfter(stops, 0, 1), 0.02);
  assert.equal(stopAfter(stops, 0.02, 1), 0.07);
  assert.equal(stopAfter(stops, 0.17, 1), 1);
  assert.equal(stopAfter(stops, 0.07, -1), 0.02);
  assert.equal(stopAfter(stops, 0.02, -1), 0);
});
