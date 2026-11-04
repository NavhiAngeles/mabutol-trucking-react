import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { normalizeOfficePhone } from '../../supabase/functions/_shared/officePhone.js';

const source = fs.readFileSync(new URL('./officeRecoveryService.js', import.meta.url), 'utf8');
const phone = '+639171234567'; // synthetic; no requests leave these mocks
function setup(options = {}) {
  const calls = [];
  const state = { id: 'office', phone, confirmed: true, role: 'admin', active: true, factors: [], level: 'aal1', next: 'aal1', ...options };
  const user = () => ({ id: state.id, phone: state.phone, phone_confirmed_at: state.confirmed ? '2026-01-01' : null });
  const response = (name, data) => { calls.push(name); return { data, error: state.fail === name ? { message: 'private provider message', status: 400 } : null }; };
  const client = {
    from(table) { assert.equal(table, 'users'); return {
      select(columns) { assert.equal(columns, 'role,is_active'); return this; },
      eq(key, value) { assert.equal(key, 'id'); assert.equal(value, 'office'); return this; },
      async single() { return response('profile', { role: state.role, is_active: state.active }); },
    }; },
    auth: {
      async signInWithOtp(args) { calls.push(args); return state.request ? state.request() : response('request', {}); },
      async verifyOtp(args) { calls.push(args); return response('otp', { user: { id: 'office' }, session: state.noSession ? null : {} }); },
      async getUser() { return response('identity', { user: state.id ? user() : null }); },
      async signOut(args) { calls.push(args); return response('signOut', {}); },
      async updateUser(args) { calls.push(args); return state.update ? state.update() : response('update', { user: user() }); },
      mfa: {
        async listFactors() { return response('factors', { all: state.factors }); },
        async getAuthenticatorAssuranceLevel() { return response('assurance', { currentLevel: state.level, nextLevel: state.next }); },
        async challengeAndVerify(args) { calls.push(args); const result = response('challenge', { access_token: state.noToken ? null : 'synthetic-token' }); if (!result.error) state.level = 'aal2'; return result; },
      },
    },
  };
  const scope = vm.createContext({ normalizeOfficePhone, createClient: () => client });
  vm.runInContext(source.replace(/^import .*;$/gm, '').replace(/import.meta.env/g, '{}').replace(/^export /gm, '') + '\nthis.api = officeRecoveryService(createClient());', scope);
  return { api: scope.api, state, calls, async open() { await scope.api.request(phone); return scope.api.verifyPhone(phone, '123456'); } };
}

test('office phones normalize Philippine forms and reject invalid/non-mobile values', () => {
  for (const value of ['09171234567', '9171234567', '639171234567', '+63 (917) 123-4567']) assert.equal(normalizeOfficePhone(value), phone);
  for (const value of ['', '123', 'office@example.test', '+12025550123', '+63281234567']) assert.throws(() => normalizeOfficePhone(value), /Philippine mobile/);
});
test('SMS request never signs up or queries account existence and normalizes phone', async () => {
  const { api, calls } = setup(); await api.request('09171234567');
  assert.equal(calls[0].phone, phone); assert.equal(calls[0].options.shouldCreateUser, false); assert.equal(calls[0].options.channel, 'sms');
  assert.ok(!calls.includes('profile'));
});
test('invalid phone makes no requests; known/unknown/denied/rate-limited results match', async () => {
  const invalid = setup(); await assert.rejects(invalid.api.request('bad')); assert.equal(invalid.calls.length, 0);
  const results = [];
  for (const status of [null, 400, 422, 429, 500]) results.push(await setup({ request: async () => ({ error: status ? { status, message: 'private detail' } : null }) }).api.request(phone));
  assert.equal(new Set(results).size, 1); assert.match(results[0], /If this number is registered/);
});
test('network failures are actionable without leaking provider details', async () => {
  await assert.rejects(setup({ request: async () => { throw Error('private detail'); } }).api.request(phone), /Check your connection/);
});
test('existing session alone, unrequested phone, wrong number and malformed SMS cannot reset', async () => {
  const { api, calls } = setup(); await assert.rejects(api.reset('password-new', 'password-new'));
  await assert.rejects(api.verifyPhone(phone, '123456')); await api.request(phone);
  await assert.rejects(api.verifyPhone('+639181234567', '123456'));
  await assert.rejects(api.verifyPhone(phone, '12345'), /six-digit SMS/);
  assert.ok(!calls.includes('otp') && !calls.includes('update'));
});
test('SMS verification uses sms type and server-verified confirmed Auth phone', async () => {
  const fixture = setup(); assert.equal((await fixture.open()).required, false);
  const request = fixture.calls.find(call => call?.type === 'sms'); assert.equal(request.phone, phone); assert.equal(request.token, '123456');
  assert.ok(fixture.calls.includes('identity'));
});
test('invalid/expired SMS can retry without creating a recovery owner', async () => {
  const fixture = setup({ fail: 'otp' }); await fixture.api.request(phone);
  await assert.rejects(fixture.api.verifyPhone(phone, '123456'), /invalid or expired/);
  await assert.rejects(fixture.api.reset('password-new', 'password-new'));
  fixture.state.fail = null; await fixture.api.verifyPhone(phone, '654321');
});
test('non-office/inactive/wrong-phone/unconfirmed/missing-session recovery fails closed', async () => {
  for (const options of [{ noSession: true }, { role: 'customer' }, { role: 'driver' }, { active: false }, { id: 'different' }, { phone: '+639181234567' }, { confirmed: false }, { fail: 'profile' }]) {
    const fixture = setup(options); await assert.rejects(fixture.open());
    await assert.rejects(fixture.api.reset('password-new', 'password-new')); assert.ok(!fixture.calls.includes('update'));
  }
});
test('verified MFA remains required even when assurance cache is stale', async () => {
  const fixture = setup({ factors: [{ id: 'totp', status: 'verified', factor_type: 'totp' }] });
  assert.equal((await fixture.open()).required, true); await assert.rejects(fixture.api.reset('password-new', 'password-new'), /authenticator/);
  await assert.rejects(fixture.api.verify('unknown', '123456'), /administrator/);
  await assert.rejects(fixture.api.verify('totp', 'short'), /six-digit/);
  await fixture.api.verify('totp', '012345'); await fixture.api.reset('password-new', 'password-new'); assert.ok(fixture.calls.includes('update'));
});
test('unknown assurance/failed factor reads fail closed and unsupported MFA stays locked', async () => {
  for (const options of [{ level: 'unknown' }, { fail: 'factors' }, { fail: 'assurance' }]) await assert.rejects(setup(options).open());
  const fixture = setup({ factors: [{ id: 'phone', status: 'verified', factor_type: 'phone' }] });
  assert.equal((await fixture.open()).unsupported, true); await assert.rejects(fixture.api.reset('password-new', 'password-new'), /authenticator/);
});
test('ownership/phone/status/new MFA changes are rechecked before update', async () => {
  for (const change of [s => { s.id = 'different'; }, s => { s.phone = '+639181234567'; }, s => { s.active = false; }, s => { s.factors = [{ id: 'new', status: 'verified', factor_type: 'totp' }]; }]) {
    const fixture = setup(); await fixture.open(); change(fixture.state);
    await assert.rejects(fixture.api.reset('password-new', 'password-new')); assert.ok(!fixture.calls.includes('update'));
  }
});
test('password validation, whitespace, confirmed save and one-time replay protections', async () => {
  const fixture = setup(); await fixture.open();
  await assert.rejects(fixture.api.reset('short', 'short'), /at least 8/);
  await assert.rejects(fixture.api.reset('password-new', 'mismatch'), /do not match/);
  assert.match(await fixture.api.reset(' password-new ', ' password-new '), /has been reset/);
  assert.equal(fixture.calls.find(call => call?.password)?.password, ' password-new ');
  await assert.rejects(fixture.api.reset('another-password', 'another-password'), /completed/);
});
test('duplicate in-flight resets are blocked and uncertain response never claims success', async () => {
  let resolve; const fixture = setup({ update: () => new Promise(yes => { resolve = yes; }) }); await fixture.open();
  const work = fixture.api.reset('password-new', 'password-new'); await new Promise(yes => setImmediate(yes));
  await assert.rejects(fixture.api.reset('password-new', 'password-new'), /in progress/);
  resolve({ error: { message: 'private detail' } }); await assert.rejects(work, /not confirmed/);
});
test('cancel revokes only temporary session and rejects late SMS response', async () => {
  const fixture = setup(); await fixture.open(); await fixture.api.dispose(); await assert.rejects(fixture.api.reset('password-new', 'password-new'));
  assert.ok(fixture.calls.filter(call => call?.scope).every(call => call.scope === 'local'));
});
