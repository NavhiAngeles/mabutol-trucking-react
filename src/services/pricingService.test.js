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
