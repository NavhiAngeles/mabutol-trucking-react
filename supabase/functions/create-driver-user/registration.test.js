import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

const { code } = await transformWithOxc(await readFile(new URL('./index.ts', import.meta.url), 'utf8'), 'index.ts');
async function invoke({ rpcError = null, upsertError = null, cleanupError = null } = {}) {
  let handler; const calls = { created: 0, deleted: [], rpc: [] };
  const caller = { auth: { getUser: async () => ({ data: { user: { id: 'office' } } }) }, rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: rpcError ? null : 'driver-id', error: rpcError }; } };
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin', is_active: true } }) }) }),
      upsert: async () => ({ error: upsertError }),
    }),
    auth: { admin: {
      createUser: async () => { calls.created++; return { data: { user: { id: 'created-user' } } }; },
      deleteUser: async id => { calls.deleted.push(id); return { error: cleanupError }; },
    } },
  };
  const scope = { Response, Request, Deno: { serve: fn => { handler = fn; }, env: { get: name => name } }, createClient: (url, key, options) => options ? caller : admin };
  vm.createContext(scope); vm.runInContext(code.replace(/^import .*;$/gm, ''), scope);
  const response = await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'fixture@example.test', password: 'test-fixture', registration: { payload: { user_id: 'untrusted-id', full_name: 'Fixture' }, documents: [{ doc_type: 'drivers_license' }] } }) }));
  return { calls, response, body: await response.json() };
}
test('driver account registration uses caller JWT transaction and binds only the created user', async () => {
  const { calls, response, body } = await invoke();
  assert.equal(response.status, 200); assert.equal(body.driverId, 'driver-id');
  assert.equal(calls.rpc[0].name, 'fleet_save'); assert.equal(calls.rpc[0].args.p_data.user_id, 'created-user');
  assert.deepEqual(calls.deleted, []);
});
test('failed roster transaction removes the newly created account', async () => {
  const { calls, response } = await invoke({ rpcError: { message: 'Vehicle already assigned' } });
  assert.equal(response.status, 400); assert.deepEqual(calls.deleted, ['created-user']);
});
test('profile creation failure cleans up the new account before returning failure', async () => {
  const { calls, response } = await invoke({ upsertError: { message: 'Profile insert failed' } });
  assert.equal(response.status, 400); assert.equal(calls.rpc.length, 0); assert.deepEqual(calls.deleted, ['created-user']);
});
test('cleanup failure explicitly prevents claiming success or encouraging another registration', async () => {
  const { response, body } = await invoke({ rpcError: { message: 'Failed' }, cleanupError: { message: 'Cleanup failed' } });
  assert.equal(response.status, 500); assert.match(body.error, /Do not retry/);
});
