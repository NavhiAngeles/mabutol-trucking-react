import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const scope = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('./tollGateService.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nthis.validate=validateTollGate;', scope);
const rate = { gate_name: 'Entry to Exit', highway: 'NLEX', vehicle_class: 'Class 2', fee: '250' };
test('unmapped reference fares remain explicitly unmapped; complete gate points retain confirmed direction', () => {
  const reference = scope.validate(rate);
  assert.equal(reference.entry_lat, null); assert.equal(reference.exit_lng, null); assert.equal(reference.bidirectional, false);
  const configured = scope.validate({ ...rate, entry_lat: '14.8', entry_lng: '120.9', exit_lat: '14.7', exit_lng: '121', bidirectional: true });
  assert.equal(configured.entry_lat, 14.8); assert.equal(configured.exit_lng, 121); assert.equal(configured.bidirectional, true);
});
test('invalid or partial gate configuration cannot be saved as an automatically matched fare', () => {
  for (const values of [{ entry_lat: 14.8 }, { entry_lat: 91, entry_lng: 120.9, exit_lat: 14.7, exit_lng: 121 },
    { entry_lat: 14.8, entry_lng: 'bad', exit_lat: 14.7, exit_lng: 121 }]) {
    assert.throws(() => scope.validate({ ...rate, ...values }), /both toll entry and exit/);
  }
});
