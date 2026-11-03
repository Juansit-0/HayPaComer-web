import { test } from "node:test";
import assert from "node:assert/strict";
import { closest } from "../../app/fuzzy.js";

const foods = [
  { value: "Tomato", names: ["Tomato", "Tomate"] },
  { value: "Milk", names: ["Milk", "Leche"] },
  { value: "Chicken breast", names: ["Chicken breast", "Pechuga de pollo"] },
  { value: "Potato", names: ["Potato", "Papa"] },
  { value: "Lime", names: ["Lime", "Limón"] },
];

test("a swapped, missing, or wrong letter still finds the food", () => {
  assert.equal(closest("tomtae", foods)[0], "Tomato");
  assert.equal(closest("lehce", foods)[0], "Milk");
  assert.equal(closest("polo", foods)[0], "Chicken breast");
  assert.equal(closest("pechga", foods)[0], "Chicken breast");
});

test("accents and case do not matter", () => {
  assert.equal(closest("LIMOM", foods)[0], "Lime");
});

test("nothing close, or too short to guess, gives nothing", () => {
  assert.deepEqual(closest("xyzwq", foods), []);
  assert.deepEqual(closest("pa", foods), []);
  assert.deepEqual(closest("", foods), []);
});

test("each food appears once and the list is capped", () => {
  const found = closest("papa", [...foods, { value: "Papaya", names: ["Papaya"] }], 2);
  assert.equal(found[0], "Potato");
  assert.equal(new Set(found).size, found.length);
  assert.ok(found.length <= 2);
});
