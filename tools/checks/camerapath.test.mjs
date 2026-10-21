import { test } from "node:test";
import assert from "node:assert/strict";
import { createTrack } from "../../app/camerapath.js";

const vector = () => ({ v: [0, 0, 0], setComponent(axis, value) { this.v[axis] = value; } });
const keys = [
  { t: 0, pos: [0, 0, 10], look: [0, 0, 0], fov: 35 },
  { t: 0.4, pos: [2, 1, 6], look: [0, 1, 0], fov: 38, ease: "inOut" },
  { t: 1, pos: [3, 1, 2], look: [1, 1, 0], fov: 30 },
];

test("the camera sits exactly on every key", () => {
  const track = createTrack(keys);
  for (const key of keys) {
    const position = vector();
    const look = vector();
    const fov = track.sample(key.t, position, look);
    assert.deepEqual(position.v.map((x) => Number(x.toFixed(6))), key.pos);
    assert.deepEqual(look.v.map((x) => Number(x.toFixed(6))), key.look);
    assert.equal(Number(fov.toFixed(6)), key.fov);
  }
});

test("the path has no jump where two segments meet", () => {
  const track = createTrack(keys.map((key) => ({ ...key, ease: undefined })));
  const at = (t) => {
    const position = vector();
    track.sample(t, position, vector());
    return position.v;
  };
  const h = 1e-4;
  const before = at(0.4 - h).map((x, axis) => (at(0.4)[axis] - x) / h);
  const after = at(0.4 + h).map((x, axis) => (x - at(0.4)[axis]) / h);
  before.forEach((slope, axis) => assert.ok(0.05 >= Math.abs(slope - after[axis]), `axis ${axis}: ${slope} vs ${after[axis]}`));
});

test("times outside the keys clamp to the ends", () => {
  const track = createTrack(keys);
  const position = vector();
  track.sample(-1, position, vector());
  assert.deepEqual(position.v, [0, 0, 10]);
  track.sample(2, position, vector());
  assert.deepEqual(position.v.map((x) => Number(x.toFixed(6))), [3, 1, 2]);
});
