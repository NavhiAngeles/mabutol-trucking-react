import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const vehicles = [{ id: 'v', name: 'Van', pricing: { id: 'r', per_km_rate: '45' } }];
const fees = { minBooking: '2500', driver: '100' };
const surcharges = { none: '0', fragile: '1', keepdry: '2', temp: '3', perishable: '4', cold: '5' };
function service(rpc) {
  const context = vm.createContext({ supabase: { rpc, from() { throw Error('Separate writes forbidden'); } } });
  vm.runInContext(fs.readFileSync(new URL('./pricingService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nthis.save=savePricing;', context);
  return context.save;
}
test('one RPC contains changed vehicle rate and all three settings; unchanged rates skipped', async () => {
  const calls = [];
  const save = service(async (name, payload) => { calls.push([name, JSON.parse(JSON.stringify(payload))]); return { data: { saved: true, rates: payload.p_rates.length, settings: 3 } }; });
  await save(vehicles, { v: '46' }, fees, surcharges);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'save_pricing');
  assert.deepEqual(calls[0][1].p_rates, [{ id: 'r', vehicle_type_id: 'v', expected_rate: 45, per_km_rate: 46 }]);
  assert.deepEqual(calls[0][1].p_settings, { minimum_booking_fee: 2500, driver_allowance: 100, handling_surcharges: { none: 0, fragile: 1, keepdry: 2, temp: 3, perishable: 4, cold: 5 } });
  await save(vehicles, { v: '45' }, fees, surcharges); assert.deepEqual(calls[1][1].p_rates, []);
});
test('invalid inputs fail before RPC; server denial and unconfirmed saves never report success', async () => {
  let calls = 0;
  const save = service(async () => { calls++; return {}; });
  for (const value of ['', '-1', 'Infinity', null]) {
    await assert.rejects(save(vehicles, { v: value }, fees, surcharges), /Invalid amount/);
    await assert.rejects(save(vehicles, { v: '46' }, { ...fees, driver: value }, surcharges), /Invalid amount/);
  }
  assert.equal(calls, 0);
  await assert.rejects(service(async () => ({ error: Error('Denied') }))(vehicles, { v: 46 }, fees, surcharges), /Denied/);
  await assert.rejects(save(vehicles, { v: 46 }, fees, surcharges), /not confirmed/);
});

test('Pricing Save calls only atomic service, reloads after success and retains error on failure', async () => {
  const source = fs.readFileSync(new URL('../pages/Settings/Pricing/pricing.jsx', import.meta.url), 'utf8');
  const match = source.match(/const handleSave = async \(\) => \{([\s\S]*?)\n {2}\};/);
  assert.ok(match);
  for (const fail of [false, true]) {
    const events = [], state = {};
    const scope = { isAdmin: true, saving: false, fees, surcharges, vehicles, rates: { v: 46 }, isValidAmount: () => true,
      setError: value => { state.error = value; }, setSuccess: value => { state.success = value; }, setSaving: value => { state.saving = value; },
      console: { error() {} }, savePricing: async () => { events.push('atomic'); if (fail) throw Error('Rollback'); }, loadPricing: async () => events.push('reload'),
    };
    const run = new Function(...Object.keys(scope), `return async () => {${match[1]}};`)(...Object.values(scope));
    await run(); assert.deepEqual(events, fail ? ['atomic'] : ['atomic', 'reload']);
    assert.equal(state.saving, false);
    assert.equal(Boolean(state.success), !fail); assert.equal(Boolean(state.error), fail);
  }
});


test('savePricing persists deadhead thresholds and vehicle lead-time/buffer rules atomically when provided', async () => {
  const calls = [];
  const extendedVehicles = [
    {
      id: 'v',
      name: 'Refrigerated Van',
      min_lead_time_hours: 48,
      loading_buffer_minutes: 180,
      pricing: {
        id: 'r',
        per_km_rate: '45',
        free_deadhead_km: '30',
        deadhead_per_km_rate: '25',
      },
    },
  ];
  const save = service(async (name, payload) => {
    calls.push([name, JSON.parse(JSON.stringify(payload))]);
    return {
      data: {
        saved: true,
        rates: payload.p_rates.length,
        settings: 3,
        ...(payload.p_vehicle_types
          ? { vehicle_types: payload.p_vehicle_types.length }
          : {}),
      },
    };
  });

  await save(
    extendedVehicles,
    { v: '45' },
    fees,
    surcharges,
    { v: { free_deadhead_km: '40', deadhead_per_km_rate: '35' } },
    { v: { min_lead_time_hours: '48', loading_buffer_minutes: '240' } }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'save_pricing');
  assert.deepEqual(calls[0][1].p_rates, [
    {
      id: 'r',
      vehicle_type_id: 'v',
      expected_rate: 45,
      per_km_rate: 45,
      expected_free_deadhead_km: 30,
      free_deadhead_km: 40,
      expected_deadhead_per_km_rate: 25,
      deadhead_per_km_rate: 35,
    },
  ]);
  assert.deepEqual(calls[0][1].p_vehicle_types, [
    {
      id: 'v',
      expected_min_lead_time_hours: 48,
      min_lead_time_hours: 48,
      expected_loading_buffer_minutes: 180,
      loading_buffer_minutes: 240,
    },
  ]);

  await assert.rejects(
    save(
      extendedVehicles,
      { v: '45' },
      fees,
      surcharges,
      { v: { free_deadhead_km: '40', deadhead_per_km_rate: '35' } },
      { v: { min_lead_time_hours: '12.5', loading_buffer_minutes: '240' } }
    ),
    /Invalid whole number/
  );
});


test('savePricing requires 3-arg RPC and vehicle_types confirmation when deadhead fields change', async () => {
  const deadheadVehicles = [
    {
      id: 'v',
      name: 'Van',
      capacity: '3000',
      min_lead_time_hours: 24,
      loading_buffer_minutes: 180,
      pricing: { id: 'p', per_km_rate: 45, free_deadhead_km: 30, deadhead_per_km_rate: 0 },
    },
  ];
  const calls = [];
  const saveOk = service(async (fn, args) => {
    calls.push({ fn, args });
    return { data: { saved: true, rates: 1, settings: 3, vehicle_types: 0 }, error: null };
  });

  await saveOk(
    deadheadVehicles,
    { v: '45' },
    fees,
    surcharges,
    { v: { free_deadhead_km: '40', deadhead_per_km_rate: '35' } },
    { v: { min_lead_time_hours: '24', loading_buffer_minutes: '180' } }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, 'save_pricing');
  assert.deepEqual(calls[0].args.p_vehicle_types, []);

  const saveMissingRpc = service(async () => ({
    data: null,
    error: {
      code: 'PGRST202',
      message: 'Could not find the function public.save_pricing(p_rates, p_settings, p_vehicle_types) in the schema cache',
    },
  }));

  await assert.rejects(
    saveMissingRpc(
      deadheadVehicles,
      { v: '45' },
      fees,
      surcharges,
      { v: { free_deadhead_km: '40', deadhead_per_km_rate: '35' } },
      null
    ),
    /Database migration required/
  );

  const saveLegacyResponse = service(async () => ({
    data: { saved: true, rates: 1, settings: 3 },
    error: null,
  }));

  await assert.rejects(
    saveLegacyResponse(
      deadheadVehicles,
      { v: '45' },
      fees,
      surcharges,
      { v: { free_deadhead_km: '40', deadhead_per_km_rate: '35' } },
      null
    ),
    /not confirmed/
  );
});
