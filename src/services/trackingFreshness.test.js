import test from 'node:test';
import assert from 'node:assert/strict';
import { isTrackingStale, watchTrackingFreshness, GPS_FRESHNESS_MS } from './trackingFreshness.js';

test('freshness preserves the strictly older than five minutes boundary', () => {
  const stamp = '2026-11-04T16:00:00Z', start = Date.parse(stamp);
  assert.equal(isTrackingStale(stamp, start + GPS_FRESHNESS_MS), false);
  assert.equal(isTrackingStale(stamp, start + GPS_FRESHNESS_MS + 1), true);
  assert.equal(isTrackingStale('invalid', start), true);
});

test('retained rows age without successful loads; resume catches up and cleanup removes clock', t => {
  const start = Date.parse('2026-11-04T16:00:00Z');
  let now = start, tick, cleared = false;
  t.mock.method(Date, 'now', () => now);
  const events = new Map(), visibility = new Map();
  const runtime = {
    setInterval(fn, ms) { tick = fn; assert.equal(ms, 1000); return 1; },
    clearInterval(id) { assert.equal(id, 1); cleared = true; },
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: name => events.delete(name),
    document: { addEventListener: (name, fn) => visibility.set(name, fn), removeEventListener: name => visibility.delete(name) },
  };
  const row = Object.freeze({ recorded_at: new Date(start).toISOString(), stale: false });
  const snapshots = [];
  const stop = watchTrackingFreshness([row], states => snapshots.push(states), runtime);
  now += GPS_FRESHNESS_MS; tick();
  now++; tick();
  assert.deepEqual(snapshots, [[false], [false], [true]]);
  now += 3600000; events.get('focus')(); visibility.get('visibilitychange')();
  assert.deepEqual(snapshots.at(-1), [true]);
  assert.equal(row.recorded_at, '2026-11-04T16:00:00.000Z');
  stop(); assert.equal(cleared, true); assert.equal(events.size + visibility.size, 0);
});
