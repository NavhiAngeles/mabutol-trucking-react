import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { transformWithOxc } from 'vite';

const row = { id: 'fixture', full_name: 'Fixture User', email: 'fixture@example.test', phone: '', role: 'staff', updated_at: 'version' };
const find = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
async function screen(api = {}) {
  const source = fs.readFileSync(new URL('./account.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'account.jsx', { jsx: { runtime: 'classic' } });
  const states = [], refs = [], effects = [];
  let si = 0, ri = 0;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(value) { return refs[ri++] ||= { current: value }; },
    useEffect(fn) { effects.push(fn); },
    accountApi: { load: async () => row, ...api },
    window: { addEventListener() {}, removeEventListener() {} }, setInterval: () => 1, clearInterval() {},
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace(/export default function/g, 'function') + '\nthis.renderComponent=AccountDetails;', context);
  const render = () => { si = ri = 0; return context.renderComponent(); };
  render(); effects.slice(0, 3).forEach(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  return { render, open: label => find(render(), n => n.type === 'button' && n.children.includes(label))[0].props.onClick(), submit: () => find(render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} }) };
}
test('shows real profile and read-only role/email with no fictional session or strength', async () => {
  const ui = await screen();
  const text = JSON.stringify(ui.render());
  assert.ok(text.includes('Fixture User')); assert.ok(!text.includes('Juan')); assert.ok(!text.includes('Safari')); assert.ok(!text.includes('Strong'));
  ui.open('Edit Profile');
  assert.equal(find(ui.render(), n => n.type === 'input' && n.props.readOnly).length, 2);
});
test('profile submit deduplicates, keeps errors visible and allows retry', async () => {
  let reject, calls = 0;
  const pending = new Promise((_, no) => { reject = no; });
  const ui = await screen({ save: () => { calls++; return pending; } });
  ui.open('Edit Profile'); const work = ui.submit(); await ui.submit();
  assert.equal(calls, 1);
  assert.equal(find(ui.render(), n => n.type === 'fieldset')[0].props.disabled, true);
  reject(Error('Save denied')); await work;
  assert.ok(JSON.stringify(ui.render()).includes('Save denied'));
  assert.equal(find(ui.render(), n => n.type === 'fieldset')[0].props.disabled, false);
});
test('password mismatch never invokes backend and passwords use correct autocomplete', async () => {
  let calls = 0;
  const ui = await screen({ changePassword: () => { calls++; } }); ui.open('Change Password');
  const inputs = find(ui.render(), n => n.type === 'input');
  inputs[0].props.onChange({ target: { value: 'old' } });
  find(ui.render(), n => n.type === 'input')[1].props.onChange({ target: { value: 'NewPassword1!' } });
  await ui.submit(); assert.equal(calls, 0); assert.ok(JSON.stringify(ui.render()).includes('Passwords do not match'));
  assert.equal(inputs[0].props.autoComplete, 'current-password');
});
test('session revocation reports success only after server confirms', async () => {
  let resolve;
  const pending = new Promise(yes => { resolve = yes; });
  const ui = await screen({ revokeOthers: () => pending }); ui.open('Log Out All Other Sessions');
  const work = ui.submit(); assert.equal(find(ui.render(), n => n.props.role === 'status').length, 0);
  resolve(); await work;
  assert.ok(JSON.stringify(ui.render()).includes('Other sessions revoked'));
  assert.equal(find(ui.render(), n => n.type === 'form').length, 0);
});
test('initial load failure offers retry and does not display hardcoded profile', async () => {
  const ui = await screen({ load: async () => { throw Error('Account unavailable'); } });
  assert.ok(JSON.stringify(ui.render()).includes('Account unavailable'));
  assert.ok(find(ui.render(), n => n.type === 'button' && n.children.includes('Retry')).length);
});
