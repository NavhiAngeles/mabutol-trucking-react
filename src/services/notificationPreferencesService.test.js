import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(options = {}) {
  const calls = [];
  let payload;
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: options.userId || 'own' } }, error: options.authError }) },
    from(table) {
      assert.equal(table, 'notification_preferences');
      const query = {
        select(columns) { calls.push(['select', columns]); return query; },
        eq(...args) { calls.push(['eq', ...args]); return query; },
        then(resolve, reject) { return Promise.resolve({ data: options.rows === undefined ? [] : options.rows, error: options.loadError }).then(resolve, reject); },
        upsert(row, config) { payload = row; calls.push(['upsert', row, config]); return query; },
        single: async () => ({ data: options.noConfirmation ? null : options.confirmation || payload, error: options.saveError }),
      };
      return query;
    },
  };
  const context = vm.createContext({ supabase: client });
  const source = fs.readFileSync(new URL('./notificationPreferencesService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.api=notificationPreferencesService(supabase);', context);
  return { api: context.api, calls };
}

test('missing preference rows match backend enabled-by-default without inserting anything', async () => {
  const { api, calls } = setup(); const result = await api.load();
  assert.equal(result.userId, 'own'); assert.equal(Object.keys(result.preferences).length, 8);
  assert.ok(Object.values(result.preferences).every(value => value === true));
  assert.equal(calls.some(call => call[0] === 'upsert'), false);
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'own'));
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'channel' && call[2] === 'in_app'));
});
test('saved false values persist and do not disable unrelated categories', async () => {
  const { api } = setup({ rows: [{ type: 'delay', channel: 'in_app', enabled: false }] });
  const { preferences } = await api.load(); assert.equal(preferences.delay, false); assert.equal(preferences.shipment_status, true);
});
test('load fails closed for auth, query failures and malformed preference records', async () => {
  await assert.rejects(setup({ noUser: true }).api.load(), /sign in again/);
  await assert.rejects(setup({ loadError: Error('denied') }).api.load(), /Unable to load/);
  for (const row of [{ type: 'delay', channel: 'in_app', enabled: 'false' }, { type: 'off_route', channel: 'in_app', enabled: false }, { type: 'delay', channel: 'email', enabled: false }]) {
    await assert.rejects(setup({ rows: [row] }).api.load(), /Invalid notification/);
  }
});
test('save writes only current-user category/in_app row with exact composite conflict key', async () => {
  const { api, calls } = setup(); assert.equal(await api.save('own', 'delay', false), false);
  const request = calls.find(call => call[0] === 'upsert');
  assert.equal(JSON.stringify(request[1]), JSON.stringify({ user_id: 'own', type: 'delay', channel: 'in_app', enabled: false }));
  assert.equal(request[2].onConflict, 'user_id,type,channel');
});
test('account switch and unsupported category/value prevent writes', async () => {
  const { api, calls } = setup();
  await assert.rejects(api.save('another', 'delay', false), /account changed/);
  await assert.rejects(api.save('own', 'off_route', false), /Invalid/);
  await assert.rejects(api.save('own', 'delay', 'false'), /Invalid/);
  assert.equal(calls.some(call => call[0] === 'upsert'), false);
});
test('failure, missing confirmation and mismatched confirmation never report saved', async () => {
  for (const options of [{ saveError: Error('denied') }, { noConfirmation: true }, { confirmation: { user_id: 'other', type: 'delay', channel: 'in_app', enabled: false } }, { confirmation: { user_id: 'own', type: 'delay', channel: 'in_app', enabled: true } }]) {
    await assert.rejects(setup(options).api.save('own', 'delay', false), /not confirmed/);
  }
});
