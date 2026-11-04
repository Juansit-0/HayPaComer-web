import { test } from "node:test";
import assert from "node:assert/strict";
import { moneyValue, typingDecimals } from "../../app/money.js";

test("decimals survive in either convention", () => {
  assert.equal(moneyValue("12.50"), 12.5);
  assert.equal(moneyValue("12,5"), 12.5);
  assert.equal(moneyValue("150000,50"), 150000.5);
  assert.equal(moneyValue("4.500,50"), 4500.5);
  assert.equal(moneyValue("10000.50"), 10000.5);
  assert.equal(moneyValue("1,250.75"), 1250.75);
});

test("thousands separators only group", () => {
  assert.equal(moneyValue("10.000"), 10000);
  assert.equal(moneyValue("1,250"), 1250);
  assert.equal(moneyValue("1.234.567"), 1234567);
  assert.equal(moneyValue("$ 4500"), 4500);
});

test("a negative amount is not a positive one", () => {
  assert.equal(moneyValue("-500"), 0);
});

test("nothing typed is zero", () => {
  assert.equal(moneyValue(""), 0);
  assert.equal(moneyValue("abc"), 0);
  assert.equal(moneyValue(null), 0);
});

test("the field waits while decimals are being typed", () => {
  assert.ok(typingDecimals("12."));
  assert.ok(typingDecimals("12,5"));
  assert.ok(!typingDecimals("10.000"));
  assert.ok(!typingDecimals("500"));
});
