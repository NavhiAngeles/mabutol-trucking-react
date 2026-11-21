import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LUZON_FTL_FIXED_FEES,
  LUZON_FTL_VEHICLE_RATES,
  resolveLuzonFtlRateForVehicle,
  buildLuzonFtlPricingPreset,
} from './luzonFtlRates.js';

test('Luzon FTL standard rates increase monotonically with vehicle capacity', () => {
  for (let i = 1; i < LUZON_FTL_VEHICLE_RATES.length; i++) {
    const prev = LUZON_FTL_VEHICLE_RATES[i - 1];
    const curr = LUZON_FTL_VEHICLE_RATES[i];
    assert.ok(curr.maxCapacityKg > prev.maxCapacityKg, `${curr.label} capacity should exceed ${prev.label}`);
    assert.ok(curr.per_km_rate > prev.per_km_rate, `${curr.label} per_km_rate should exceed ${prev.label}`);
    assert.ok(curr.min_charge > prev.min_charge, `${curr.label} min_charge should exceed ${prev.label}`);
    assert.ok(curr.deadhead_per_km_rate > prev.deadhead_per_km_rate, `${curr.label} deadhead_per_km_rate should exceed ${prev.label}`);
  }
});

test('buildLuzonFtlPricingPreset maps all 7 Mabutol vehicle classes and fixed fees', () => {
  const sampleVehicles = [
    { id: 'v1', name: 'Elf / 4-Wheeler', default_capacity_kg: 2500, pricing: { id: 'r1' } },
    { id: 'v2', name: 'Closed Van', default_capacity_kg: 3000, pricing: { id: 'r2' } },
    { id: 'v3', name: 'Medium Truck (4,000 kg)', default_capacity_kg: 4000, pricing: { id: 'r3' } },
    { id: 'v4', name: '6-Wheeler', default_capacity_kg: 6000, pricing: { id: 'r4' } },
    { id: 'v5', name: 'Dropside', default_capacity_kg: 8000, pricing: { id: 'r5' } },
    { id: 'v6', name: 'Heavy Truck (10,000 kg)', default_capacity_kg: 10000, pricing: { id: 'r6' } },
    { id: 'v7', name: '10-Wheeler Wing Van', default_capacity_kg: 12000, pricing: { id: 'r7' } },
  ];

  const preset = buildLuzonFtlPricingPreset(sampleVehicles);
  assert.equal(preset.fees.minBooking, String(LUZON_FTL_FIXED_FEES.minBooking));
  assert.equal(preset.fees.driver, String(LUZON_FTL_FIXED_FEES.driver));
  assert.deepEqual(preset.rates, {
    v1: '55',
    v2: '65',
    v3: '75',
    v4: '85',
    v5: '95',
    v6: '110',
    v7: '130',
  });
  assert.equal(preset.deadhead.v7.free_deadhead_km, '30');
  assert.equal(preset.deadhead.v7.deadhead_per_km_rate, '65');
  assert.equal(preset.vehicleRules.v7.loading_buffer_minutes, '240');

  // Capacity fallback when name does not match a known keyword
  const fallbackTier = resolveLuzonFtlRateForVehicle({ name: 'Custom Cargo Unit', default_capacity_kg: 5500 });
  assert.equal(fallbackTier.per_km_rate, 85);
});

test('SQL migration aligns with Luzon FTL standard pricing rates', () => {
  const sql = fs.readFileSync(
    new URL('../../supabase/migrations/20261121100000_luzon_standard_ftl_pricing_rates.sql', import.meta.url),
    'utf8'
  );
  for (const token of [
    'per_km_rate = 55',
    'per_km_rate = 65',
    'per_km_rate = 75',
    'per_km_rate = 85',
    'per_km_rate = 95',
    'per_km_rate = 110',
    'per_km_rate = 130',
    'minimum_booking_fee',
    'driver_allowance',
  ]) {
    assert.ok(sql.includes(token), `Migration missing ${token}`);
  }
});
