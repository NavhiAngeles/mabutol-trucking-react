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

test('driver account registration with contact number normalizes and binds confirmed phone for login', async () => {
  let handler;
  const calls = { createdPayload: null, upsertedRow: null, rpcData: null };
  const caller = {
    auth: { getUser: async () => ({ data: { user: { id: 'office' } } }) },
    rpc: async (name, args) => {
      calls.rpcData = args.p_data;
      return { data: 'driver-nav-id', error: null };
    },
  };
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin', is_active: true } }) }) }),
      upsert: async row => {
        calls.upsertedRow = row;
        return { error: null };
      },
    }),
    auth: {
      admin: {
        createUser: async payload => {
          calls.createdPayload = payload;
          return { data: { user: { id: 'nav-user-id' } } };
        },
        deleteUser: async () => ({ error: null }),
      },
    },
  };
  const scope = {
    Response, Request,
    Deno: { serve: fn => { handler = fn; }, env: { get: name => name } },
    createClient: (url, key, options) => (options ? caller : admin),
  };
  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, ''), scope);

  const response = await handler(
    new Request('https://example.test', {
      method: 'POST',
      headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nav.angeles@tanawlogistics.com',
        password: 'secure-password',
        fullName: 'Nav Angeles',
        registration: {
          payload: { contact_number: '09675132862', full_name: 'Nav Angeles' },
          documents: [],
        },
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(calls.createdPayload.phone, '+639675132862');
  assert.equal(calls.createdPayload.phone_confirm, true);
  assert.equal(calls.createdPayload.user_metadata.phone, '+639675132862');
  assert.equal(calls.upsertedRow.phone, '+639675132862');
  assert.equal(calls.rpcData.contact_number, '+639675132862');
});

test('existing driver user with same email updates phone login credentials', async () => {
  let handler;
  let updatedPayload = null;
  const caller = {
    auth: { getUser: async () => ({ data: { user: { id: 'office' } } }) },
    rpc: async () => ({ data: 'driver-id', error: null }),
  };
  const admin = {
    from: () => ({
      select: () => ({
        eq: (col, val) => ({
          single: async () => ({
            data: val === 'office'
              ? { role: 'admin', is_active: true }
              : { id: 'existing-nav', role: 'driver', is_active: true },
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    auth: {
      admin: {
        createUser: async () => ({
          data: null,
          error: { message: 'A user with this email address has already been registered', status: 422 },
        }),
        updateUserById: async (id, payload) => {
          assert.equal(id, 'existing-nav');
          updatedPayload = payload;
          return { error: null };
        },
      },
    },
  };
  const scope = {
    Response, Request,
    Deno: { serve: fn => { handler = fn; }, env: { get: name => name } },
    createClient: (url, key, options) => (options ? caller : admin),
  };
  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, ''), scope);

  const response = await handler(
    new Request('https://example.test', {
      method: 'POST',
      headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nav.angeles@tanawlogistics.com',
        password: 'new-password',
        phone: '09675132862',
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(updatedPayload.phone, '+639675132862');
  assert.equal(updatedPayload.phone_confirm, true);
  assert.equal(updatedPayload.password, 'new-password');
});
