import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const scope = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('./tollGateService.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nthis.validate=validateTollGate;\nthis.sync=syncLuzonStandardTollGates;', scope);
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
    assert.throws(() => scope.validate({ ...rate, ...values }), /both the entry and exit plazas/);
  }
});

test('explicit fixed-system tariffs are preserved on edit and distance-based highways cannot bypass plaza matching', () => {
  const fixed = scope.validate({ ...rate, highway: 'NLEX_CONNECTOR', pricing_scope: 'flat', fee: 299 });
  assert.equal(fixed.pricing_scope, 'flat'); assert.equal(fixed.entry_lat, null);
  for (const highway of ['NLEX', 'SKYWAY', 'SLEX']) assert.throws(() => scope.validate({ ...rate, highway, pricing_scope: 'flat' }), /Flat toll pricing/);
});

test('syncLuzonStandardTollGates updates changed rows, skips identical rows, and inserts missing corridors', async () => {
  const added = [];
  const updated = [];
  const standard = [
    { gate_name: 'Pulilan to Balintawak', highway: 'NLEX', vehicle_class: 'Class 2', fee: 436, pricing_scope: 'entry_exit', entry_lat: 14.86245, entry_lng: 120.858766, exit_lat: 14.66056, exit_lng: 121.00011, bidirectional: true },
    { gate_name: 'Pulilan to Balintawak', highway: 'NLEX', vehicle_class: 'Class 3', fee: 523, pricing_scope: 'entry_exit', entry_lat: 14.86245, entry_lng: 120.858766, exit_lat: 14.66056, exit_lng: 121.00011, bidirectional: true },
    { gate_name: 'Sta. Rita to Balintawak', highway: 'NLEX', vehicle_class: 'Class 2', fee: 394, pricing_scope: 'entry_exit', entry_lat: 14.8492, entry_lng: 120.8805, exit_lat: 14.66056, exit_lng: 121.00011, bidirectional: true },
  ];
  const existing = [
    { id: 'r1', gate_name: 'Pulilan to Balintawak', highway: 'NLEX', vehicle_class: 'Class 2', fee: 436, pricing_scope: 'entry_exit', entry_lat: 14.86245, entry_lng: 120.858766, exit_lat: 14.66056, exit_lng: 121.00011, bidirectional: true },
    { id: 'r2', gate_name: 'Pulilan to Balintawak [2025 matrix]', highway: 'NLEX', vehicle_class: 'Class 3', fee: 500, pricing_scope: 'entry_exit', entry_lat: 14.86245, entry_lng: 120.858766, exit_lat: 14.66056, exit_lng: 121.00011, bidirectional: true },
  ];
  const summary = await scope.sync(standard, existing, {
    addTollGate: async (row) => { added.push(row); },
    updateTollGate: async (id, row) => { updated.push({ id, row }); },
  });
  assert.deepEqual({ ...summary }, { inserted: 1, updated: 1, unchanged: 1, total: 3 });
  assert.equal(updated[0].id, 'r2');
  assert.equal(updated[0].row.fee, 523);
  assert.equal(added[0].gate_name, 'Sta. Rita to Balintawak');
});
