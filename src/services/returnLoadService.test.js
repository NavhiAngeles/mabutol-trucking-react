import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function service() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('./returnLoadService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace('export async function', 'async function') + '\nthis.load=loadReturnLoadData;', context);
  return context.load;
}
test('planner reads minimal existing tables with no mutation and retains every returned row', async () => {
  const calls = [], rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const result = await service()(async (table, columns) => { calls.push({ table, columns }); return table === 'shipments' ? rows : []; });
  assert.equal(result.shipments.length, 1201);
  assert.deepEqual(calls.map(row => row.table), ['shipments', 'deliveries', 'trucks', 'maintenance_records']);
  assert.ok(calls.every(row => !row.columns.includes('*')));
});
test('partial read failures reject the whole plan instead of showing unsafe suggestions', async () => {
  for (const failed of ['shipments', 'deliveries', 'trucks', 'maintenance_records']) {
    await assert.rejects(service()(async table => { if (table === failed) throw Error('denied'); return []; }), /denied/);
  }
});
