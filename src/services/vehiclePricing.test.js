import test from "node:test";
import assert from "node:assert/strict";
import { attachVehiclePricing, vehicleBaseRate, vehicleCanCarry, pricingDate, bookingDefaults } from "./vehiclePricing.js";
const vehicle = { id: "vehicle-a", is_active: true, default_capacity_kg: 2500 };
const rate = { id: "rate-a", vehicle_type_id: vehicle.id, is_active: true, effective_from: "2026-10-12", effective_to: null, per_km_rate: "45", min_charge: "2500" };
const priced = { ...vehicle, pricing: rate };

test('global booking minimum combines with vehicle floor and distance; invalid settings never become zero', () => {
  assert.equal(vehicleBaseRate(priced, 10, 3500), 3500);
  assert.equal(vehicleBaseRate(priced, 10, 1000), 2500);
  assert.equal(vehicleBaseRate(priced, 100, 3500), 4500);
  assert.equal(vehicleBaseRate(priced, 10, 0), 2500);
  assert.deepEqual(bookingDefaults({ minimum_booking_fee: '3500', driver_allowance: '125.50' }), { minimumBookingFee: 3500, driverAllowance: 125.5 });
  assert.deepEqual(bookingDefaults({ minimum_booking_fee: 0, driver_allowance: 0 }), { minimumBookingFee: 0, driverAllowance: 0 });
  for (const value of [undefined, null, '', -1, Infinity, 'invalid']) {
    assert.equal(vehicleBaseRate(priced, 10, value === undefined ? null : value), null);
    assert.throws(() => bookingDefaults({ minimum_booking_fee: value, driver_allowance: 100 }), /must be configured/);
    assert.throws(() => bookingDefaults({ minimum_booking_fee: 2500, driver_allowance: value }), /must be configured/);
  }
});

test("enforces database minimum and recalculates with distance or vehicle rate", () => {
  assert.equal(vehicleBaseRate(priced, 10), 2500);
  assert.equal(vehicleBaseRate(priced, 100), 4500);
  assert.equal(vehicleBaseRate({ ...priced, pricing: { ...rate, per_km_rate: 65 } }, 100), 6500);
  assert.equal(vehicleBaseRate({ ...priced, pricing: { ...rate, min_charge: 9999 } }, 100), 9999);
});
test("uses actual capacity, blocks overweight and invalid capacities", () => {
  assert.equal(vehicleCanCarry(priced, 2500), true);
  assert.equal(vehicleCanCarry(priced, 2501), false);
  assert.equal(vehicleCanCarry({ ...priced, default_capacity_kg: null }, 1), false);
});
test("rejects missing/mismatched pricing and invalid distance or rates", () => {
  for (const distance of ["", null, -1, "bad", Infinity]) assert.equal(vehicleBaseRate(priced, distance), null);
  assert.equal(vehicleBaseRate(vehicle, 10), null);
  assert.equal(vehicleBaseRate({ ...priced, pricing: { ...rate, vehicle_type_id: "other" } }, 10), null);
  assert.equal(vehicleBaseRate({ ...priced, pricing: { ...rate, min_charge: null } }, 10), null);
});
test("joins by database ID and chooses latest currently effective active rate", () => {
  const future = { ...rate, id: "future", effective_from: "2026-10-14" };
  const expired = { ...rate, id: "expired", effective_from: "2026-10-13", effective_to: "2026-10-12" };
  const inactive = { ...rate, id: "inactive", is_active: false };
  const old = { ...rate, id: "old", effective_from: "2026-10-01" };
  assert.equal(attachVehiclePricing([vehicle], [future, expired, inactive, old, rate], "2026-10-13")[0].pricing.id, rate.id);
  assert.equal(attachVehiclePricing([{ ...vehicle, id: "unpriced" }], [rate], "2026-10-13")[0].pricing, null);
  assert.equal(attachVehiclePricing([{ ...vehicle, is_active: false }], [rate], "2026-10-13").length, 0);
  assert.equal(pricingDate(Date.parse("2026-10-12T16:01:00Z")), "2026-10-13");
});
