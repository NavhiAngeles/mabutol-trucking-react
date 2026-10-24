import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(options = {}) {
  const calls = [];
  const response = (name, data) => { calls.push(name); return { data, error: options.errorAt === name ? Error('Provider denied') : null }; };
  const client = { auth: {
    getUser: async () => response('identity', { user: options.noUser ? null : { id: 'own', email: 'fixture@example.test' } }),
    signOut: async args => { calls.push(args); return response('signOut', {}); },
    mfa: {
      listFactors: async () => response('list', { all: options.factors || [] }),
      enroll: async args => { calls.push(args); return response('enroll', { id: 'pending', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'fixture-only' } }); },
      challengeAndVerify: async args => { calls.push(args); return response('verify', options.noToken ? {} : { access_token: 'fixture' }); },
      unenroll: async args => { calls.push(args); return response('remove', {}); },
      getAuthenticatorAssuranceLevel: async () => response('assurance', options.aal || { currentLevel: 'aal1', nextLevel: 'aal1' }),
    },
  } };
  const scope = vm.createContext({ supabase: client });
  vm.runInContext(fs.readFileSync(new URL('./securityService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nthis.api = securityService(supabase);', scope);
  return { api: scope.api, calls };
}
test('security uses own identity and real factors, excluding unsupported factor types', async () => {
  const { api } = setup({ factors: [{ id: 'a', factor_type: 'totp', status: 'verified' }, { id: 'b', factor_type: 'phone', status: 'verified' }] });
  const result = await api.load();
  assert.equal(result.factors.length, 1); assert.equal(result.factors[0].id, 'a'); assert.equal(result.unsupported, true);
});
test('unauthenticated security reads and factor mutations fail before provider operations', async () => {
  const { api, calls } = setup({ noUser: true });
  for (const action of [() => api.load(), () => api.enroll(), () => api.verify('a', '123456'), () => api.remove('a'), () => api.assurance()]) await assert.rejects(action(), /sign in/);
  assert.ok(calls.every(c => c === 'identity'));
});
test('enrollment uses TOTP and returns provider setup only', async () => {
  const { api, calls } = setup(); const result = await api.enroll();
  assert.equal(result.id, 'pending'); assert.equal(calls[1].factorType, 'totp'); assert.ok(result.qr.startsWith('data:image/'));
});
test('verification rejects malformed codes before requests and requires a confirmed token', async () => {
  const { api, calls } = setup();
  for (const code of ['', '12345', '1234567', 'abcdef', ' 123456']) await assert.rejects(api.verify('a', code), /six-digit/);
  assert.equal(calls.length, 0);
  await api.verify('a', '012345'); assert.equal(calls[1].code, '012345');
  await assert.rejects(setup({ noToken: true }).api.verify('a', '123456'), /verification failed/);
});
test('provider enrollment, verification, removal and read errors remain failures', async () => {
  for (const [name, action] of [['enroll', a => a.enroll()], ['verify', a => a.verify('a', '123456')], ['remove', a => a.remove('a')], ['list', a => a.load()], ['assurance', a => a.assurance()]]) {
    await assert.rejects(action(setup({ errorAt: name }).api));
  }
});
test('AAL1 with verified authenticator requires a challenge; unverified factors never qualify', async () => {
  const { api } = setup({ aal: { currentLevel: 'aal1', nextLevel: 'aal2' }, factors: [{ id: 'pending', factor_type: 'totp', status: 'unverified' }, { id: 'verified', factor_type: 'totp', status: 'verified' }] });
  const result = await api.assurance(); assert.equal(result.required, true); assert.equal(result.factors.length, 1); assert.equal(result.factors[0].id, 'verified');
});
test('AAL2 and accounts without MFA are allowed, unknown assurance fails closed', async () => {
  assert.equal((await setup().api.assurance()).required, false);
  assert.equal((await setup({ aal: { currentLevel: 'aal2', nextLevel: 'aal2' } }).api.assurance()).required, false);
  await assert.rejects(setup({ aal: {} }).api.assurance(), /Unable to verify/);
});
test('fresh server factors require MFA even when local session factor cache is stale', async () => {
  const { api } = setup({ factors: [{ id: 'new-device', factor_type: 'totp', status: 'verified' }] });
  assert.equal((await api.assurance()).required, true);
});
test('challenge screen signout only targets current session and propagates failure', async () => {
  const { api, calls } = setup(); await api.signOut(); assert.equal(calls[0].scope, 'local');
  await assert.rejects(setup({ errorAt: 'signOut' }).api.signOut());
});
