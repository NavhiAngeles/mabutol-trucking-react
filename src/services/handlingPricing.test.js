import test from "node:test";
import assert from "node:assert/strict";
import { handlingCost, HANDLING_OPTIONS } from "./handlingPricing.js";

const rates = { none: 12, fragile: 123.45, keepdry: 67, temp: 234, perishable: 89, cold: 2.5 };

test("all configured options use their database rates, including None", () => {
  const expected = [12, 123.45, 67, 234, 89, 25];
  HANDLING_OPTIONS.forEach((option, index) => assert.equal(handlingCost(rates, option.label, 10), expected[index]));
  assert.equal(handlingCost({ ...rates, none: 0 }, "None", 10), 0);
});

test("switching selections keeps suggested price, overrides and profit synchronized", () => {
  const base = 1000, operational = 150;
  for (const label of ["Fragile", "Keep Dry", "None", "Temperature Sensitive", "Fragile"]) {
    const charge = handlingCost(rates, label, 10);
    const suggested = base + charge;
    assert.equal(suggested - operational, 850 + rates[HANDLING_OPTIONS.find(option => option.label === label).id]);
    const override = 2000;
    assert.equal(override - operational, 1850);
  }
});

test("cold chain recalculates with distance and rounds the total to cents", () => {
  assert.equal(handlingCost(rates, "Cold Chain (Refrigerated)", 10.13), 25.33);
  assert.equal(handlingCost(rates, "Cold Chain (Refrigerated)", 20), 50);
  assert.equal(handlingCost(rates, "Cold Chain (Refrigerated)", ""), null);
});

test("missing or invalid rates cannot become a silent zero charge", () => {
  for (const value of [undefined, null, "", "bad", -1, Infinity]) {
    assert.equal(handlingCost({ fragile: value }, "Fragile", 10), null);
  }
  assert.equal(handlingCost({}, "None", 10), null);
  assert.equal(handlingCost(rates, "Unknown", 10), null);
});
