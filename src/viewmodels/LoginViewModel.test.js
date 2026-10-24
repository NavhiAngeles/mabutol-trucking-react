import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('editing invalid email clears its error while preserving password error and validates again on submit', async () => {
  const states = []; let i = 0, signIns = 0;
  const context = vm.createContext({
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
    useState(initial) { const index = i++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useNavigate: () => () => {}, setTimeout: () => 1,
    signIn: async (...args) => { credentials = args; },
  });
  vm.runInContext(fs.readFileSync(new URL('./LoginViewModel.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nthis.render = useLoginViewModel;', context);
  let model = context.render(); model.handleEmailChange(' fixture@example.test '); model.handlePasswordChange(' pass with spaces ');
  i = 0; model = context.render(); await model.handleSubmit({ preventDefault() {} });
  assert.equal(credentials[0], 'fixture@example.test'); assert.equal(credentials[1], ' pass with spaces ');
});
