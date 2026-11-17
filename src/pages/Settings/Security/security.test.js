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
    securityApi: { load: async () => ({ email: 'fixture@example.test', twoFactorEnabled: false, twoFactorPhone: '', factors: [] }), assurance: async () => ({ required: false, factors: [] }), ...security },
    accountApi: account,
  });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace(/export default function/g, 'function') + `\nthis.component=${kind === 'gate' ? 'MfaGate' : 'SecurityDetails'};`, scope);
  const render = () => { si = ri = 0; return scope.component({ children: 'PROTECTED' }); };
  const first = render(); effects.slice().forEach(fn => fn()); await tick();
  return {
    render,
    first,
    open(label) {
      const btn = find(render(), n => n.type === 'button' && (n.children.includes(label) || (n.children || []).some(c => typeof c === 'string' && c.includes(label))))[0];
      if (btn) btn.props.onClick();
    },
    submit() { return find(render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} }); },
    input(index, value) { find(render(), n => n.type === 'input' && !n.props.readOnly)[index].props.onChange({ target: { value } }); },
  };
}

test('security loads real account and unknown history without invented devices or enabled status', async () => {
  const ui = await screen('security');
  const text = JSON.stringify(ui.render());
  assert.ok(text.includes('fixture@example.test'));
  assert.ok(text.includes('No verified 2FA phone'));
  for (const fake of ['Seattle', 'MacBook', '192.168', '45 days', 'Failed login attempt']) assert.ok(!text.includes(fake));
});

test('failed security load remains unknown and offers retry', async () => {
  const ui = await screen('security', { load: async () => { throw Error('Provider unavailable'); } });
  assert.ok(JSON.stringify(ui.render()).includes('Provider unavailable'));
  assert.equal(find(ui.render(), n => n.type === 'button' && n.children.includes('Set Up 2FA')).length, 0);
});

test('password mismatch prevents request; backend failure leaves modal retryable', async () => {
  let calls = 0;
  const ui = await screen('security', {}, { changePassword: async () => { calls++; throw Error('Password denied'); } });
  ui.open('Update Password');
  ui.input(0, 'old');
  ui.input(1, 'new-password');
  ui.input(2, 'mismatch');
  await ui.submit();
  assert.equal(calls, 0);
  ui.input(2, 'new-password');
  await ui.submit();
  assert.equal(calls, 1);
  assert.ok(JSON.stringify(ui.render()).includes('Password denied'));
  assert.equal(find(ui.render(), n => n.type === 'fieldset')[0].props.disabled, false);
});

test('session revocation deduplicates and reports success only after confirmation', async () => {
  let resolve, calls = 0;
  const ui = await screen('security', {}, { revokeOthers: () => { calls++; return new Promise(yes => { resolve = yes; }); } });
  ui.open('Sign Out Other Sessions');
  const work = ui.submit();
  await ui.submit();
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(ui.render()).includes('Other sessions revoked.'));
  resolve();
  await work;
  assert.ok(JSON.stringify(ui.render()).includes('Other sessions revoked.'));
});

test('TextBee 2FA enrollment sends verification SMS and enables only after code verification', async () => {
  const smsCalls = [];
  const verifyCalls = [];
  const ui = await screen('security', {
    sendSms2fa: async phone => {
      smsCalls.push(phone);
      return { phone };
    },
    verifySms2fa: async (phone, code) => {
      verifyCalls.push({ phone, code });
      return { success: true };
    },
  });

  ui.open('Set Up 2FA');
  assert.ok(JSON.stringify(ui.render()).includes('Philippine Mobile Number'));

  // Enter mobile number and submit
  ui.input(0, '09171234567');
  await ui.submit();

  assert.equal(smsCalls.length, 1);
  assert.equal(smsCalls[0], '09171234567');

  let text = JSON.stringify(ui.render());
  assert.ok(text.includes('09171234567'));
  assert.ok(text.includes('Verification code'));
  assert.ok(!text.includes('2FA verified and enabled via TextBee SMS.'));

  // Enter 6-digit SMS OTP and submit
  ui.input(0, '123456');
  await ui.submit();

  assert.equal(verifyCalls.length, 1);
  assert.equal(verifyCalls[0].phone, '09171234567');
  assert.equal(verifyCalls[0].code, '123456');

  text = JSON.stringify(ui.render());
  assert.ok(text.includes('2FA verified and enabled via TextBee SMS.'));
});

test('cancel enrollment clears modal dialog and closes cleanly', async () => {
  const ui = await screen('security', {
    sendSms2fa: async phone => ({ phone }),
  });
  ui.open('Set Up 2FA');
  assert.equal(find(ui.render(), n => n.type === 'form').length, 1);
  ui.open('Cancel');
  await tick();
  assert.equal(find(ui.render(), n => n.type === 'form').length, 0);
});

test('Disable 2FA confirms and disables SMS 2FA with success notice', async () => {
  let disables = 0;
  const ui = await screen('security', {
    load: async () => ({
      email: 'fixture@example.test',
      twoFactorEnabled: true,
      twoFactorPhone: '+639171234567',
      factors: [],
    }),
    disable2fa: async () => {
      disables++;
      return { success: true };
    },
  });

  ui.open('Disable 2FA');
  const text = JSON.stringify(ui.render());
  assert.ok(text.includes('+639171234567'));
  assert.ok(text.includes('Disable SMS Two-Factor Authentication'));

  await ui.submit();
  assert.equal(disables, 1);
  assert.ok(JSON.stringify(ui.render()).includes('2FA disabled.'));
});

test('MFA gate hides content during initial check and only releases after assurance passes', async () => {
  const ui = await screen('gate');
  assert.notEqual(ui.first, 'PROTECTED');
  assert.equal(ui.render(), 'PROTECTED');
});

test('MFA gate denies on load error and unsupported factors', async () => {
  for (const api of [{ assurance: async () => { throw Error('Offline'); } }, { assurance: async () => ({ required: true, factors: [] }) }]) {
    const ui = await screen('gate', api);
    assert.notEqual(ui.render(), 'PROTECTED');
  }
});

test('MFA challenge with TextBee SMS verifies code and unlocks protected content', async () => {
  let verifyCalls = 0;
  let challengeCalls = 0;
  const ui = await screen('gate', {
    assurance: async () => ({
      required: true,
      phone: '+639171234567',
      twoFactorType: 'textbee_sms',
      factors: [],
    }),
    sendChallengeSms: async () => {
      challengeCalls++;
      return { phone: '+639171234567' };
    },
    verifyChallengeSms: async code => {
      verifyCalls++;
      if (code !== '123456') throw Error('Wrong code');
      return { success: true };
    },
  });

  const text = JSON.stringify(ui.render());
  assert.ok(text.includes('+639171234567'));
  assert.ok(text.includes('Six-digit SMS code'));

  // Test resend button
  ui.open('Resend SMS Code');
  await tick();
  assert.ok(challengeCalls >= 1);

  // Submit wrong code
  ui.input(0, '000000');
  await ui.submit();
  assert.ok(JSON.stringify(ui.render()).includes('Wrong code'));
  assert.notEqual(ui.render(), 'PROTECTED');

  // Submit correct code
  ui.input(0, '123456');
  await ui.submit();
  assert.equal(verifyCalls, 2);
});
