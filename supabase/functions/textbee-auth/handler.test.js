import test from 'node:test';
import assert from 'node:assert/strict';
import { authSmsHandler } from './handler.js';
const post = () => new Request('https://fixture.invalid', { method: 'POST', body: '{}' });
test('unsigned hook requests never send SMS', async () => {
  const handler = authSmsHandler({ apiKey: 'fixture', deviceId: 'fixture',
    verify: () => { throw Error('bad signature'); }, send: () => assert.fail('must not send') });
  assert.equal((await handler(post())).status, 401);
});
test('missing hook secret fails closed', async () => {
  const handler = authSmsHandler({ apiKey: 'fixture', deviceId: 'fixture', verify: null });
  assert.equal((await handler(post())).status, 503);
});
test('verified hook sends only the Auth-generated code and phone', async () => {
  let sent;
  const handler = authSmsHandler({ apiKey: 'fixture', deviceId: 'fixture',
    verify: () => ({ user: { phone: '+639123456789' }, sms: { otp: '123456' } }),
    send: async payload => { sent = payload; } });
  assert.equal((await handler(post())).status, 200);
  assert.equal(sent.phone, '+639123456789');
  assert.equal(sent.message, 'Tanaw verification code: 123456. Do not share this code.');
});
test('provider errors are redacted', async () => {
  const handler = authSmsHandler({ apiKey: 'fixture', deviceId: 'fixture',
    verify: () => ({ user: { phone: '+639123456789' }, sms: { otp: '123456' } }),
    send: () => { throw Error('private-token-and-code'); } });
  const result = await handler(post());
  assert.equal(result.status, 503);
  assert.ok(!(await result.text()).includes('private-token'));
});
