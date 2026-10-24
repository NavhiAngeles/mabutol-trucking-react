import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';
const find = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const tick = () => new Promise(resolve => setImmediate(resolve));
async function screen(kind, security = {}, account = {}) {
  const path = kind === 'gate' ? '../../../components/MfaGate.jsx' : './security.jsx';
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'screen.jsx', { jsx: { runtime: 'classic' } });
  const states = [], refs = [], effects = [];
  let si = 0, ri = 0;
  const scope = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(value) { return refs[ri++] ||= { current: value }; }, useEffect(fn) { effects.push(fn); },
    OfficeTools() {},
    securityApi: { load: async () => ({ email: 'fixture@example.test', factors: [] }), assurance: async () => ({ required: false, factors: [] }), ...security },
    accountApi: account,
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace(/export default function/g, 'function') + `\nthis.component=${kind === 'gate' ? 'MfaGate' : 'SecurityDetails'};`, scope);
  const render = () => { si = ri = 0; return scope.component({ children: 'PROTECTED' }); };
  const first = render(); effects.slice().forEach(fn => fn()); await tick();
  return { render, first, open(label) { find(render(), n => n.type === 'button' && n.children.includes(label))[0].props.onClick(); },
    submit() { return find(render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} }); },
    input(index, value) { find(render(), n => n.type === 'input' && !n.props.readOnly)[index].props.onChange({ target: { value } }); } };
}
test('security loads real account and unknown history without invented devices or enabled status', async () => {
  const ui = await screen('security'); const text = JSON.stringify(ui.render());
  assert.ok(text.includes('fixture@example.test')); assert.ok(text.includes('No verified authenticator'));
  for (const fake of ['Seattle', 'MacBook', '192.168', '45 days', 'Failed login attempt']) assert.ok(!text.includes(fake));
});
test('failed security load remains unknown and offers retry', async () => {
  const ui = await screen('security', { load: async () => { throw Error('Provider unavailable'); } });
  assert.ok(JSON.stringify(ui.render()).includes('Provider unavailable'));
  assert.equal(find(ui.render(), n => n.type === 'button' && n.children.includes('Set Up Authenticator')).length, 0);
});
test('password mismatch prevents request; backend failure leaves modal retryable', async () => {
  let calls = 0;
  const ui = await screen('security', {}, { changePassword: async () => { calls++; throw Error('Password denied'); } });
  ui.open('Update Password'); ui.input(0, 'old'); ui.input(1, 'new-password'); ui.input(2, 'mismatch');
  await ui.submit(); assert.equal(calls, 0);
  ui.input(2, 'new-password'); await ui.submit(); assert.equal(calls, 1);
  assert.ok(JSON.stringify(ui.render()).includes('Password denied'));
  assert.equal(find(ui.render(), n => n.type === 'fieldset')[0].props.disabled, false);
});
test('session revocation deduplicates and reports success only after confirmation', async () => {
  let resolve, calls = 0;
  const ui = await screen('security', {}, { revokeOthers: () => { calls++; return new Promise(yes => { resolve = yes; }); } });
  ui.open('Sign Out Other Sessions'); const work = ui.submit(); await ui.submit(); assert.equal(calls, 1);
  assert.ok(!JSON.stringify(ui.render()).includes('Other sessions revoked.'));
  resolve(); await work; assert.ok(JSON.stringify(ui.render()).includes('Other sessions revoked.'));
});
test('enrollment shows setup QR but enables only after code verification', async () => {
  const calls = [];
  const ui = await screen('security', { enroll: async () => ({ id: 'new', qr: 'fixture-qr', secret: 'fixture-key' }), verify: async (...args) => calls.push(args) });
  ui.open('Set Up Authenticator'); await ui.submit();
  assert.equal(find(ui.render(), n => n.type === 'img')[0].props.src, 'fixture-qr');
  assert.ok(!JSON.stringify(ui.render()).includes('Authenticator verified and enabled.'));
  ui.input(0, '123456'); await ui.submit(); assert.equal(calls[0][0], 'new');
  assert.ok(JSON.stringify(ui.render()).includes('Authenticator verified and enabled.'));
  assert.ok(!JSON.stringify(ui.render()).includes('fixture-key'));
});
test('cancel enrollment removes pending factor; failed cleanup keeps setup for retry', async () => {
  let attempts = 0;
  const ui = await screen('security', { enroll: async () => ({ id: 'new', qr: 'qr' }), remove: async id => { assert.equal(id, 'new'); if (!attempts++) throw Error('Cleanup failed'); } });
  ui.open('Set Up Authenticator'); await ui.submit(); ui.open('Cancel'); await tick();
  assert.ok(JSON.stringify(ui.render()).includes('Cleanup failed'));
  ui.open('Cancel'); await tick(); assert.equal(find(ui.render(), n => n.type === 'form').length, 0);
});
test('verified factor removal verifies first; failure never removes it', async () => {
  let removes = 0;
  const ui = await screen('security', { load: async () => ({ factors: [{ id: 'a', status: 'verified' }] }), verify: async () => { throw Error('Wrong code'); }, remove: async () => removes++ });
  ui.open('Remove authenticator'); ui.input(0, '123456'); await ui.submit();
  assert.equal(removes, 0); assert.ok(JSON.stringify(ui.render()).includes('Wrong code'));
});
test('MFA gate hides content during initial check and only releases after assurance passes', async () => {
  const ui = await screen('gate'); assert.notEqual(ui.first, 'PROTECTED'); assert.equal(ui.render(), 'PROTECTED');
});
test('MFA gate denies on load error and unsupported factors', async () => {
  for (const api of [{ assurance: async () => { throw Error('Offline'); } }, { assurance: async () => ({ required: true, factors: [] }) }]) {
    const ui = await screen('gate', api); assert.notEqual(ui.render(), 'PROTECTED');
  }
});
test('MFA challenge cannot reveal content on wrong code or unconfirmed verification', async () => {
  let reject, calls = 0;
  const ui = await screen('gate', { assurance: async () => ({ required: true, factors: [{ id: 'a' }] }), verify: () => { calls++; return new Promise((_, no) => { reject = no; }); } });
  ui.input(0, '123456'); const work = ui.submit(); await ui.submit(); assert.equal(calls, 1);
  assert.notEqual(ui.render(), 'PROTECTED'); reject(Error('Wrong code')); await work;
  assert.ok(JSON.stringify(ui.render()).includes('Wrong code')); assert.notEqual(ui.render(), 'PROTECTED');
});
