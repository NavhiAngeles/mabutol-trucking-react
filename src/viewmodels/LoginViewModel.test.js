import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

test('rapid submits make one request, failed request unlocks retry, success stays locked until redirect', async () => {
  const states = [], lock = { current: false }, timers = [], routes = [];
  let i = 0, calls = 0, resolve, reject, published;
  const context = vm.createContext({
    useAuth: () => ({ completeSignIn(result) { published = result; } }), useRef: () => lock,
    useState(initial) { const index = i++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useNavigate: () => (path, options) => { assert.equal(published.user.id, 'office'); assert.equal(options.replace, true); routes.push(path); }, setTimeout: fn => timers.push(fn),
    signIn() { calls++; return new Promise((yes, no) => { resolve = yes; reject = no; }); },
  });
  vm.runInContext(fs.readFileSync(new URL('./LoginViewModel.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nthis.render = useLoginViewModel;', context);
  const render = () => { i = 0; return context.render(); };
  const event = { preventDefault() {} };
  await render().handleSubmit(event); assert.equal(calls, 0); assert.equal(lock.current, false);
  render().handleEmailChange('office@example.test'); render().handlePasswordChange('password');
  const submit = render().handleSubmit;
  const first = submit(event); await submit(event); await render().handleSubmit(event);
  assert.equal(calls, 1); assert.equal(render().status, 'loading');
  reject(Error('Try again')); await first;
  assert.equal(render().status, 'error'); assert.equal(render().errors.password, 'Try again');
  const second = render().handleSubmit(event); assert.equal(calls, 2);
  resolve({ user: { id: "office" }, role: "admin" }); await second; assert.equal(render().status, 'success');
  await render().handleSubmit(event); assert.equal(calls, 2); assert.equal(timers.length, 0);
  assert.deepEqual(routes, ['/dashboard']);
});

test('login page disables fields and submit during loading and success and exposes pending status', async () => {
  const source = fs.readFileSync(new URL('../pages/Login/login.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'login.jsx', { jsx: { runtime: 'classic' } });
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
  }
  for (const status of ['idle', 'loading', 'error', 'success']) {
    const context = vm.createContext({
      React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
      useState: value => [value, () => {}], LoginSuccessToast: () => null,
      useLoginViewModel: () => ({ status, errors: {}, email: '', password: '' }),
    });
    vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.render = Login;', context);
    const tree = context.render(), pending = status === 'loading' || status === 'success';
    for (const field of find(tree, n => n.type === 'input' || n.props.type === 'submit')) assert.equal(field.props.disabled, pending);
    assert.equal(find(tree, n => n.type === 'form')[0].props['aria-busy'], status === 'loading');
    assert.equal(find(tree, n => n.props.role === 'status').length, 0);
    assert.equal(find(tree, n => n.props.role === 'alert').length, status === 'error' ? 1 : 0);
  }
});

test('editing invalid email clears its error while preserving password error and validates again on submit', async () => {
  const states = []; let i = 0, signIns = 0;
  const context = vm.createContext({
    useAuth: () => ({ completeSignIn() {} }), useRef: value => ({ current: value }),
    useState(initial) { const index = i++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useNavigate: () => () => {}, setTimeout: () => 1,
    signIn: async () => { signIns++; },
  });
  vm.runInContext(fs.readFileSync(new URL('./LoginViewModel.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nthis.render = useLoginViewModel;', context);
  const render = () => { i = 0; return context.render(); };
  render().handleEmailChange('invalid');
  await render().handleSubmit({ preventDefault() {} });
  let model = render();
  assert.equal(model.errors.email, 'Please enter a valid email address.');
  assert.equal(model.errors.password, 'Password is required.');
  model.handleEmailChange('still-invalid');
  model = render();
  assert.equal(model.email, 'still-invalid');
  assert.equal(model.errors.email, '');
  assert.equal(model.errors.password, 'Password is required.');
  await model.handleSubmit({ preventDefault() {} });
  assert.equal(render().errors.email, 'Please enter a valid email address.');
  render().handleEmailChange('office@example.test');
  assert.equal(render().errors.email, '');
  assert.equal(render().errors.password, 'Password is required.');
  assert.equal(signIns, 0);
});
test('login trims email but preserves password bytes set by account/security settings', async () => {
  const states = []; let i = 0, credentials;
  const context = vm.createContext({
    useAuth: () => ({ completeSignIn() {} }), useRef: value => ({ current: value }),
    useState(initial) { const index = i++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useNavigate: () => () => {}, setTimeout: () => 1,
    signIn: async (...args) => { credentials = args; },
  });
  vm.runInContext(fs.readFileSync(new URL('./LoginViewModel.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nthis.render = useLoginViewModel;', context);
  let model = context.render(); model.handleEmailChange(' fixture@example.test '); model.handlePasswordChange(' pass with spaces ');
  i = 0; model = context.render(); await model.handleSubmit({ preventDefault() {} });
  assert.equal(credentials[0], 'fixture@example.test'); assert.equal(credentials[1], ' pass with spaces ');
});
