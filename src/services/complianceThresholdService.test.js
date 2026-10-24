import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_THRESHOLDS, validateThresholds } from './complianceThresholds.js';

function setup(options = {}) {
  const calls = []; let payload;
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'admin' } } }) },
    from(table) {
      const query = {
        select: () => query,
        in: async () => ({ data: options.rows || [], error: options.loadError }),
        eq: (...args) => { calls.push(['eq', ...args]); return query; },
        insert: row => { payload = row; calls.push(['insert', row]); return query; },
        update: row => { payload = row; calls.push(['update', row]); return query; },
        single: async () => table === 'users' ? ({ data: { role: options.role || 'admin', is_active: options.active !== false }, error: options.profileError }) : ({ data: options.noRow ? null : { key: 'compliance_thresholds', value: payload.value, updated_at: 'new-version' }, error: options.saveError }),
      }; return query;
    },
  };
  const scope = vm.createContext({ supabase: client, validateThresholds });
  vm.runInContext(fs.readFileSync(new URL('./complianceThresholdService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '')+'\nthis.api=complianceThresholdService(supabase);', scope);
  return { api: scope.api, calls };
}
test('missing config stays unconfigured; load never seeds suggested thresholds', async () => {
  const { api, calls } = setup(); const result = await api.load();
  assert.equal(result.thresholds, null); assert.equal(result.legacyDays, 30); assert.equal(calls.length, 0);
});
test('reads saved settings and rejects inaccessible/malformed data', async () => {
  assert.equal((await setup({ rows: [{ key: 'compliance_thresholds', value: DEFAULT_THRESHOLDS, updated_at: 'old' }] }).api.load()).updatedAt, 'old');
  await assert.rejects(setup({ loadError: Error('denied') }).api.load(), /Unable to load/);
  await assert.rejects(setup({ rows: [{ key: 'compliance_thresholds', value: {} }] }).api.load(), /eight/);
});
test('single-key initial insert binds updated_by and preserves other system settings', async () => {
  const { api, calls } = setup(); await api.save(DEFAULT_THRESHOLDS, { thresholds: null, legacyDays: 30 });
  const row = calls.find(call => call[0] === 'insert')[1];
  assert.equal(row.key, 'compliance_thresholds'); assert.equal(row.updated_by, 'admin'); assert.ok(row.updated_at);
  assert.equal(calls.filter(call => ['insert', 'update'].includes(call[0])).length, 1);
});
test('existing row save uses key and expected timestamp; conflicts never return success', async () => {
  const { api, calls } = setup(); await api.save(DEFAULT_THRESHOLDS, { thresholds: DEFAULT_THRESHOLDS, updatedAt: 'old' });
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'key' && call[2] === 'compliance_thresholds'));
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'updated_at' && call[2] === 'old'));
  await assert.rejects(setup({ noRow: true }).api.save(DEFAULT_THRESHOLDS, { thresholds: DEFAULT_THRESHOLDS, updatedAt: 'old' }), /not confirmed/);
});
test('nonadmin, inactive, failed profile and missing auth cannot write', async () => {
  for (const options of [{ role: 'staff' }, { active: false }, { profileError: Error('offline') }, { noUser: true }]) {
    const { api, calls } = setup(options); await assert.rejects(api.save(DEFAULT_THRESHOLDS, {}));
    assert.equal(calls.some(call => ['insert', 'update'].includes(call[0])), false);
  }
});
