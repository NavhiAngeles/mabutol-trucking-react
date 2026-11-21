import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearReverseGeocodeCache,
  nudgeCoordinate,
  reverseGeocodeLuzon,
  searchLuzonPlaces,
  toPoint,
} from './geocodingService.js';

test('toPoint treats empty strings, null, undefined, and out-of-range coordinates as null', () => {
  assert.equal(toPoint('', ''), null);
  assert.equal(toPoint('', 120.9), null);
  assert.equal(toPoint(14.6, '   '), null);
  assert.equal(toPoint(null, 120.9), null);
  assert.equal(toPoint(undefined, undefined), null);
  assert.equal(toPoint(91, 120.9), null);
  assert.equal(toPoint(14.6, -181), null);
  assert.equal(toPoint('bad', 120.9), null);
  assert.deepEqual(toPoint('14.6033', '120.9574'), { lat: 14.6033, lng: 120.9574 });
  assert.deepEqual(toPoint(0, 0), { lat: 0, lng: 0 });
});

test('reverseGeocodeLuzon returns null when API key is missing', async () => {
  clearReverseGeocodeCache();
  let called = 0;
  const result = await reverseGeocodeLuzon(14.8233, 120.9017, {
    apiKey: '',
    fetchImpl: async () => {
      called += 1;
      return { ok: true, json: async () => ({}) };
    },
  });
  assert.equal(result, null);
  assert.equal(called, 0);
});

test('reverseGeocodeLuzon deduplicates concurrent and nearby cached lookups and strips trailing Philippines', async () => {
  clearReverseGeocodeCache();
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      ok: true,
      json: async () => ({
        features: [
          {
            place_name: 'MacArthur Hwy, Balagtas, Bulacan, Philippines',
          },
        ],
      }),
    };
  };

  const [first, second] = await Promise.all([
    reverseGeocodeLuzon(14.8231, 120.9011, { apiKey: 'test-key', fetchImpl }),
    reverseGeocodeLuzon(14.8234, 120.9014, { apiKey: 'test-key', fetchImpl }),
  ]);

  assert.equal(fetchCount, 1);
  assert.deepEqual(first, {
    shortLabel: 'MacArthur Hwy, Balagtas',
    fullAddress: 'MacArthur Hwy, Balagtas, Bulacan, Philippines',
  });
  assert.deepEqual(second, first);

  const third = await reverseGeocodeLuzon(14.8232, 120.9012, { apiKey: 'test-key', fetchImpl });
  assert.equal(fetchCount, 1);
  assert.deepEqual(third, first);
});

test('reverseGeocodeLuzon rethrows AbortError when caller aborts', async () => {
  clearReverseGeocodeCache();
  const controller = new AbortController();
  const fetchImpl = () =>
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      }, 20);
    });

  const pending = reverseGeocodeLuzon(15.489, 120.961, {
    apiKey: 'test-key',
    fetchImpl,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('searchLuzonPlaces enforces minimum query length and filters results to LUZON_BOUNDS', async () => {
  let called = 0;
  const empty = await searchLuzonPlaces('ab', {
    apiKey: 'test-key',
    fetchImpl: async () => {
      called += 1;
      return { ok: true, json: async () => ({ features: [] }) };
    },
  });
  assert.deepEqual(empty, []);
  assert.equal(called, 0);

  const results = await searchLuzonPlaces('Cabanatuan', {
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      assert.ok(url.includes('country=ph'));
      assert.ok(url.includes('Cabanatuan'));
      return {
        ok: true,
        json: async () => ({
          features: [
            { id: 'in-1', place_name: 'Cabanatuan City, Nueva Ecija, Philippines', center: [120.9617, 15.4891] },
            { id: 'out-1', place_name: 'Davao City, Davao del Sur, Philippines', center: [125.6128, 7.1907] },
          ],
        }),
      };
    },
  });

  assert.deepEqual(results, [
    {
      id: 'in-1',
      label: 'Cabanatuan City, Nueva Ecija, Philippines',
      lat: 15.4891,
      lng: 120.9617,
    },
  ]);
});

test('nudgeCoordinate adjusts lat/lng accurately by stepMeters in N/S/E/W directions', () => {
  const startLat = 15.0;
  const startLng = 121.0;

  const north = nudgeCoordinate(startLat, startLng, 'north', 25);
  assert.ok(Math.abs(north.lat - (startLat + 25 / 111320)) < 1e-12);
  assert.equal(north.lng, startLng);

  const south = nudgeCoordinate(startLat, startLng, 'south', 100);
  assert.ok(Math.abs(south.lat - (startLat - 100 / 111320)) < 1e-12);
  assert.equal(south.lng, startLng);

  const expectedDLng = 25 / (111320 * Math.cos((startLat * Math.PI) / 180));
  const east = nudgeCoordinate(startLat, startLng, 'east', 25);
  assert.equal(east.lat, startLat);
  assert.ok(Math.abs(east.lng - (startLng + expectedDLng)) < 1e-12);

  const west = nudgeCoordinate(startLat, startLng, 'west', 25);
  assert.equal(west.lat, startLat);
  assert.ok(Math.abs(west.lng - (startLng - expectedDLng)) < 1e-12);
});
