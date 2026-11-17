import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load(profile = { role: 'admin', is_active: true }) {
  const store = new Map();
  let signOuts = 0;
  const context = vm.createContext({
    Date,
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
    supabase: {
      auth: {
        signInWithPassword: async () => ({ data: { user: { id: 'u1' } }, error: null }),
        signOut: async () => { signOuts++; },
      },
      from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: profile, error: null }) }),
    },
  });
  const source = fs.readFileSync(new URL('./authService.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.signIn = signIn; this.getLastActivity = getLastActivity;', context);
  return { context, store, signOuts: () => signOuts };
}

test('verified sign-in resets a stale idle clock so the new session is not signed out immediately', async () => {
  const { context, store } = load();
  const stale = Date.now() - 24 * 60 * 60 * 1000; // left over from yesterday's session
  store.set('lastActivityAt', String(stale));

  const before = Date.now();
  const result = await context.signIn('office@example.com', 'secret');

  assert.equal(result.role, 'admin');
  const last = context.getLastActivity();
  assert.ok(last >= before, 'idle clock restarted at sign-in');
  assert.ok(Date.now() - last < 30 * 60 * 1000, 'fresh session is within the 30-minute idle limit');
});

test('rejected sign-in does not refresh the idle clock', async () => {
  const { context, store, signOuts } = load({ role: 'customer', is_active: true });
  store.set('lastActivityAt', '1000');
  await assert.rejects(context.signIn('c@example.com', 'secret'), /Invalid login credentials/);
  assert.equal(store.get('lastActivityAt'), '1000');
  assert.equal(signOuts(), 1);
});

