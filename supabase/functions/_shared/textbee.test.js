import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSmsPhone, sendTextBee, otpMessage, shipmentMessage } from './textbee.js';

const config = { apiKey: 'fixture-secret', deviceId: '0123456789abcdef01234567',
  phone: '09123456789', message: shipmentMessage() };

test('Philippine numbers normalize without accepting malformed destinations', () => {
  for (const phone of ['09123456789', '9123456789', '639123456789', '+63 912-345-6789']) {
    assert.equal(normalizeSmsPhone(phone), '+639123456789');
  }
  for (const phone of ['', '0912345678', '+6391234567890', 'abc09123456789']) {
    assert.throws(() => normalizeSmsPhone(phone), /INVALID_SMS_PHONE/);
  }
});

test('send uses only the configured gateway and reports queued, not delivered', async () => {
  const result = await sendTextBee({ ...config, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.textbee.dev/api/v1/gateway/send-sms');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['x-api-key'], config.apiKey);
    assert.deepEqual(JSON.parse(options.body), { recipients: ['+639123456789'],
      deviceId: config.deviceId, message: config.message });
    return Response.json({ data: { success: true, smsBatchId: 'fixture-batch' } });
  } });
  assert.deepEqual(result, { status: 'queued', batchId: 'fixture-batch' });
});

test('provider responses and request details never leak through errors', async () => {
  for (const status of [400, 401, 429, 500]) {
    await assert.rejects(sendTextBee({ ...config, fetchImpl: async () =>
      new Response('secret private phone or OTP', { status }) }),
    { message: status === 429 ? 'SMS_QUOTA_REACHED' : 'SMS_PROVIDER_REJECTED' });
  }
});

test('ambiguous outcomes are not automatically retried', async () => {
  let calls = 0;
  await assert.rejects(sendTextBee({ ...config, fetchImpl: async () => {
    calls++; throw new Error('private payload');
  } }), { message: 'SMS_OUTCOME_UNKNOWN' });
  assert.equal(calls, 1);
});

test('missing config and invalid templates fail before network access', async () => {
  const fetchImpl = () => assert.fail('must not send');
  await assert.rejects(sendTextBee({ ...config, apiKey: '', fetchImpl }), /SMS_NOT_CONFIGURED/);
  await assert.rejects(sendTextBee({ ...config, message: 'x'.repeat(161), fetchImpl }), /INVALID_SMS_MESSAGE/);
  assert.throws(() => otpMessage('123\nsecret'), /INVALID_SMS_CODE/);
  assert.ok(otpMessage('123456').length <= 160);
  assert.ok(shipmentMessage().length <= 160);
});
