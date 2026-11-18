import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGeoLocation, getApproxLocation, parseDeviceSnapshot } from './deviceInfo.js';

test('parseDeviceSnapshot detects Windows 11 via UA-CH platformVersion >= 13', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const info = parseDeviceSnapshot(ua, { platform: 'Windows', platformVersion: '15.0.0', model: '' });
  assert.equal(info.os, 'Windows 11');
  assert.equal(info.deviceType, 'desktop');
  assert.equal(info.deviceName, 'Windows 11 PC');
  assert.equal(info.browser, 'Chrome 131');
});

test('parseDeviceSnapshot detects Windows 10 when platformVersion is below 13', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/130.0.0.0 Safari/537.36';
  const info = parseDeviceSnapshot(ua, { platform: 'Windows', platformVersion: '10.0.0', model: '' });
  assert.equal(info.os, 'Windows 10');
  assert.equal(info.deviceType, 'desktop');
  assert.equal(info.browser, 'Edge 130');
});

test('parseDeviceSnapshot detects mobile device model from high-entropy hints', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  const info = parseDeviceSnapshot(ua, { platform: 'Android', platformVersion: '14.0.0', model: 'Pixel 8 Pro', mobile: true });
  assert.equal(info.deviceType, 'mobile');
  assert.equal(info.deviceModel, 'Pixel 8 Pro');
  assert.equal(info.os, 'Android 14');
  assert.equal(info.deviceName, 'Pixel 8 Pro (Android 14)');
});

test('parseDeviceSnapshot detects tablet device type from iPad UA', () => {
  const ua = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const info = parseDeviceSnapshot(ua);
  assert.equal(info.deviceType, 'tablet');
  assert.equal(info.browserName, 'Mobile Safari');
});

test('formatGeoLocation formats city/region and country code concisely', () => {
  assert.equal(formatGeoLocation({ city: 'San Fernando', region: 'Central Luzon', country_code: 'PH' }), 'Central Luzon, PH');
  assert.equal(formatGeoLocation({ city: 'Manila', region: 'Manila', country_code: 'ph' }), 'Manila, PH');
  assert.equal(formatGeoLocation(null), null);
});

test('getApproxLocation falls back gracefully when fetch fails or times out', async () => {
  const result = await getApproxLocation({
    forceRefresh: true,
    fetchImpl: async () => {
      throw new Error('Network offline');
    },
  });
  assert.equal(result, null);
});
