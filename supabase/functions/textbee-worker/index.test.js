import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(keys = { default: 'fixture-default', secondary: 'fixture-secondary' }) {
  let handler; let calls = 0;
  const context = vm.createContext({ Request, Response, JSON, Object, AbortSignal, encodeURIComponent,
    Deno: { env: { get: name => ({ SUPABASE_SECRET_KEYS: JSON.stringify(keys), SUPABASE_URL: 'https://fixture.invalid',
      TEXTBEE_API_KEY: 'fixture-textbee', TEXTBEE_DEVICE_ID: 'fixture-device' })[name] }, serve: callback => { handler = callback; } },
    createClient: () => ({}),
    fetch: async () => { calls++; return new Response('{}', { status: 200 }); },
  });
  vm.runInContext(fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, ''), context);
  return { call: headers => handler(new Request('https://fixture.invalid', { headers })), calls: () => calls };
}

test('worker rejects missing, publishable, user, legacy and non-default server credentials', async () => {
  for (const headers of [{}, { apikey: 'sb_publishable_fixture' }, { Authorization: 'Bearer fixture-user' },
    { Authorization: 'Bearer fixture-default' }, { apikey: 'fixture-secondary' }]) {
    const worker = setup();
    assert.equal((await worker.call(headers)).status, 401);
    assert.equal(worker.calls(), 0);
  }
});
test('exact default key permits read-only device lookup without exposing provider data', async () => {
  const worker = setup();
  const response = await worker.call({ apikey: 'fixture-default' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { configured: true, deviceAccessible: true, providerStatus: 200 });
  assert.equal(worker.calls(), 1);
});
test('missing default key fails closed even when another server key exists', async () => {
  const worker = setup({ secondary: 'fixture-secondary' });
  assert.equal((await worker.call({ apikey: 'fixture-secondary' })).status, 401);
  assert.equal(worker.calls(), 0);
});
