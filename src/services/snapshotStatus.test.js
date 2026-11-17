import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { snapshotStatus } from './snapshotStatus.js';

function harness(file, name) {
  let stateIndex = 0, refIndex = 0, cleanup, now = 1000, fail = false, payload = { count: 1 };
  const states = [], refs = [], timers = new Map(); let timer = 0;
  const loader = async () => { if (fail) throw new Error('Offline'); return payload; };
  const channel = { on() { return this; }, subscribe() {} };
  const scope = vm.createContext({
    useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { return refs[refIndex++] ||= { current: initial }; },
    useCallback: fn => fn, useEffect(fn) { if (!cleanup) cleanup = fn(); },
    Date: { now: () => now }, console: { error() {} },
    setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
    setInterval() { return 99; }, clearInterval() {},
    window: { addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {} },
    supabase: { channel: () => channel, removeChannel() {} },
    getDashboardStats: loader, subscribeToDashboardChanges: () => () => {},
  });
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8').replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g, '').replace(/export /g, '');
  vm.runInContext(source + `\nthis.hook=${name};`, scope);
  return {
    render() { stateIndex = refIndex = 0; return scope.hook(loader, []); },
    async tick() { const work = [...timers.values()]; timers.clear(); await Promise.all(work.map(fn => fn())); },
    async refresh() { await this.render().refresh(); await this.tick(); },
    set(time, failed, data = payload) { now = time; fail = failed; payload = data; },
    close() { cleanup(); },
  };
}

for (const [file, hook, field] of [
  ['../hooks/useLiveData.js', 'useLiveData', 'data'],
  ['../viewmodels/DashboardViewModel.js', 'useDashboardViewModel', 'stats'],
]) test(`${hook}: successful time and retained snapshot survive failures until successful retry`, async () => {
  const h = harness(file, hook);
  assert.equal(h.render().lastUpdated, null);
  h.set(500, true); await h.tick();
  assert.equal(h.render().lastUpdated, null);
  h.set(1000, false); await h.refresh();
  const saved = h.render()[field]; assert.equal(h.render().lastUpdated, 1000);
  h.set(2000, true); await h.refresh();
  assert.equal(h.render()[field], saved); assert.equal(h.render().lastUpdated, 1000); assert.ok(h.render().error);
  h.set(3000, false, { count: 0 }); await h.refresh();
  assert.equal(h.render().lastUpdated, 3000); assert.equal(h.render()[field].count, 0); assert.equal(h.render().error, null);
  h.close();
});

test('independent loaders retain independent successful times', async () => {
  const a = harness('../hooks/useLiveData.js', 'useLiveData'), b = harness('../hooks/useLiveData.js', 'useLiveData');
  a.render(); b.render(); a.set(1000, false); b.set(2000, false); await a.tick(); await b.tick();
  a.set(3000, true); await a.refresh();
  assert.equal(a.render().lastUpdated, 1000); assert.equal(b.render().lastUpdated, 2000);
  a.close(); b.close();
});

test('status distinguishes unavailable, successful and retained data with explicit Philippine seconds', () => {
  assert.match(snapshotStatus('GPS', null, true), /no successful refresh/);
  const time = Date.parse('2026-11-04T16:00:15Z');
  assert.match(snapshotStatus('GPS', time, false), /Nov 5, 2026, 12:00:15 AM PHT/);
  assert.match(snapshotStatus('Details', time, true), /Refresh failed — showing retained snapshot/);
  assert.doesNotMatch(snapshotStatus('Stats', time, false), /Refresh failed/);
});
