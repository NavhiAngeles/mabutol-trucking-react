import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';
function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
}
async function screen(overrides = {}) {
  const states = [], refs = [], effects = [];
  let si = 0, ri = 0, ei = 0, clock = 1000, tick;
  const api = { request: async () => 'If this number is registered, an SMS code will be sent.', verifyPhone: async () => ({ required: false, factors: [] }),
    security: async () => ({ required: false, factors: [] }), verify: async () => ({ required: false, factors: [] }), reset: async () => 'Your password has been reset.', dispose: async () => {}, ...overrides };
  const scope = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) }, Link: 'a', Date: { now: () => clock },
    createOfficeRecovery: () => api,
    useState(initial) { const index = si++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef(initial) { return refs[ri++] ||= { current: initial }; }, useEffect(fn) { effects[ei++] ||= fn; },
    setInterval(fn) { tick = fn; return 1; }, clearInterval() {},
  });
  const { code } = await transformWithOxc(fs.readFileSync(new URL('./PasswordRecovery.jsx', import.meta.url), 'utf8'), 'PasswordRecovery.jsx', { jsx: { runtime: 'classic' } });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nthis.component=PhoneRecovery;', scope);
  const render = () => { si = ri = ei = 0; return scope.component(); }; render(); let cleanups = effects.map(fn => fn());
  const input = (id, value) => find(render(), node => node.props.id === id)[0].props.onChange({ target: { value } });
  const submit = () => find(render(), node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  return { render, input, submit, advance(ms) { clock += ms; tick(); }, unmount() { cleanups.forEach(fn => fn?.()); },
    strictProbe() { cleanups.forEach(fn => fn?.()); cleanups = effects.map(fn => fn()); },
    async send() { input('recovery-phone', '09171234567'); await submit(); },
    async ready() { input('recovery-phone', '09171234567'); await submit(); input('recovery-sms-code', '123456'); await submit(); } };
}
test('SMS request deduplicates, shows generic notice, no password before verification', async () => {
  let resolve, calls = 0;
  const ui = await screen({ request: () => { calls++; return new Promise(yes => { resolve = yes; }); } });
  ui.strictProbe(); ui.input('recovery-phone', '09171234567'); const work = ui.submit(); await ui.submit(); assert.equal(calls, 1);
  resolve('If this number is registered, an SMS code will be sent.'); await work;
  assert.match(JSON.stringify(ui.render()), /If this number is registered/);
  assert.equal(find(ui.render(), n => n.props.id === 'recovery-password').length, 0);
  assert.equal(find(ui.render(), n => n.props.id === 'recovery-sms-code').length, 1);
});
test('network failure retains number and allows retry without false success', async () => {
  const ui = await screen({ request: async () => { throw Error('Check your connection'); } }); await ui.send();
  assert.match(JSON.stringify(ui.render()), /Check your connection/); assert.equal(find(ui.render(), n => n.props.id === 'recovery-phone')[0].props.value, '09171234567');
});
test('wrong SMS remains retryable and resend/change-number honor cooldown', async () => {
  let sends = 0;
  const ui = await screen({ request: async () => { sends++; return 'If registered'; }, verifyPhone: async () => { throw Error('Invalid or expired SMS'); } });
  await ui.send(); ui.input('recovery-sms-code', '123456'); await ui.submit(); assert.match(JSON.stringify(ui.render()), /Invalid or expired/);
  const resend = () => find(ui.render(), n => n.type === 'button' && n.children.some(c => typeof c === 'string' && /Resend/.test(c)))[0];
  assert.equal(resend().props.disabled, true); await resend().props.onClick(); assert.equal(sends, 1);
  ui.advance(60001); await resend().props.onClick(); assert.equal(sends, 2);
  find(ui.render(), n => n.type === 'button' && n.children.includes('Use a different number'))[0].props.onClick();
  assert.equal(find(ui.render(), n => n.props.id === 'recovery-phone').length, 1); await ui.submit(); assert.equal(sends, 2);
});
test('SMS confirmation precedes existing authenticator and password fields', async () => {
  const factors = [{ id: 'totp' }]; const ui = await screen({ verifyPhone: async () => ({ required: true, factors }) }); await ui.ready();
  assert.equal(find(ui.render(), n => n.props.id === 'recovery-password').length, 0);
  ui.input('recovery-code', '654321'); await ui.submit(); assert.equal(find(ui.render(), n => n.props.id === 'recovery-password').length, 1);
  assert.ok(!JSON.stringify(ui.render()).includes('654321'));
});
test('new MFA blocks password update and unsupported factors stay locked', async () => {
  let updates = 0;
  const ui = await screen({ security: async () => ({ required: true, factors: [{ id: 'new' }] }), reset: async () => { updates++; } }); await ui.ready();
  ui.input('recovery-password', 'new-password'); ui.input('recovery-confirmation', 'new-password'); await ui.submit(); assert.equal(updates, 0);
  assert.equal(find(ui.render(), n => n.props.id === 'recovery-code').length, 1);
  const blocked = await screen({ verifyPhone: async () => ({ required: true, unsupported: true, factors: [] }) }); await blocked.ready();
  assert.match(JSON.stringify(blocked.render()), /administrator/); assert.equal(find(blocked.render(), n => n.type === 'input').length, 0);
});
test('reset deduplicates, pending navigation blocked, success clears secrets and returns to login', async () => {
  let resolve, updates = 0;
  const ui = await screen({ reset: () => { updates++; return new Promise(yes => { resolve = yes; }); } }); await ui.ready();
  ui.input('recovery-password', 'new-password'); ui.input('recovery-confirmation', 'new-password');
  const work = ui.submit(); await new Promise(yes => setImmediate(yes)); await ui.submit(); assert.equal(updates, 1);
  let prevented = false; find(ui.render(), n => n.props.to === '/')[0].props.onClick({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  resolve('Your password has been reset.'); await work;
  assert.match(JSON.stringify(ui.render()), /has been reset/); assert.equal(find(ui.render(), n => n.type === 'input').length, 0);
  assert.ok(!JSON.stringify(ui.render()).includes('new-password')); assert.ok(!JSON.stringify(ui.render()).includes('09171234567'));
});
test('uncertain password error keeps draft and does not claim success', async () => {
  const ui = await screen({ reset: async () => { throw Error('Password change not confirmed'); } }); await ui.ready();
  ui.input('recovery-password', 'new-password'); ui.input('recovery-confirmation', 'new-password'); await ui.submit();
  assert.match(JSON.stringify(ui.render()), /not confirmed/); assert.equal(find(ui.render(), n => n.props.id === 'recovery-password')[0].props.value, 'new-password');
});
test('unmount during SMS verification disposes temporary session and ignores late result', async () => {
  let resolve, disposals = 0;
  const ui = await screen({ verifyPhone: () => new Promise(yes => { resolve = yes; }), dispose: async () => { disposals++; } }); await ui.send();
  ui.input('recovery-sms-code', '123456'); const work = ui.submit(); ui.unmount(); resolve({ required: false, factors: [] }); await work;
  assert.equal(disposals, 1); assert.equal(find(ui.render(), n => n.props.id === 'recovery-password').length, 0);
});

test('navigating away during TOTP verification disposes isolated recovery client and ignores late result', async () => {
  let resolveTotp, disposals = 0;
  const ui = await screen({
    verifyPhone: async () => ({ required: true, factors: [{ id: 'totp-factor' }] }),
    verify: () => new Promise(yes => { resolveTotp = yes; }),
    dispose: async () => { disposals++; }
  });
  await ui.ready();
  assert.equal(find(ui.render(), n => n.props.id === 'recovery-code').length, 1);

  ui.input('recovery-code', '654321');
  const work = ui.submit();
  ui.unmount();

  assert.equal(disposals, 1, 'Isolated recovery client must be disposed when user navigates away during TOTP verification');
  resolveTotp({ required: false, factors: [] });
  await work;
  assert.equal(find(ui.render(), n => n.props.id === 'recovery-password').length, 0, 'Late TOTP verification result must not transition unmounted component');
});

test('navigating away while on TOTP challenge screen disposes isolated recovery client', async () => {
  let disposals = 0;
  const ui = await screen({
    verifyPhone: async () => ({ required: true, factors: [{ id: 'totp-factor' }] }),
    dispose: async () => { disposals++; }
  });
  await ui.ready();
  assert.equal(find(ui.render(), n => n.props.id === 'recovery-code').length, 1);

  // User navigates away before entering TOTP code
  ui.unmount();
  assert.equal(disposals, 1, 'Isolated recovery client must be disposed when navigating away from TOTP prompt');
});

test('navigating away during password reset submission disposes isolated recovery client and ignores late result', async () => {
  let resolveReset, disposals = 0;
  const ui = await screen({
    security: async () => ({ required: false, factors: [] }),
    reset: () => new Promise(yes => { resolveReset = yes; }),
    dispose: async () => { disposals++; }
  });
  await ui.ready();
  ui.input('recovery-password', 'NewPass123!');
  ui.input('recovery-confirmation', 'NewPass123!');

  const work = ui.submit();
  await new Promise(yes => setImmediate(yes));
  ui.unmount();

  assert.equal(disposals, 1, 'Isolated recovery client must be disposed when navigating away during password reset submission');
  if (resolveReset) resolveReset('Your password has been reset.');
  await work;
  assert.ok(!JSON.stringify(ui.render()).includes('has been reset'), 'Late reset resolution must not update unmounted component state');
});
