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

function hookModuleHarness() {
  let now = 1000, timer = 0, interval = 0, channelCount = 0;
  const timers = new Map(), intervals = new Map();
  const channel = { on() { return this; }, subscribe() {} };
  const scope = vm.createContext({
    useState(initial) {
      const slot = currentMount.stateIndex++;
      if (!(slot in currentMount.states)) currentMount.states[slot] = initial;
      return [currentMount.states[slot], value => {
        currentMount.states[slot] = typeof value === 'function' ? value(currentMount.states[slot]) : value;
      }];
    },
    useRef(initial) {
      const slot = currentMount.refIndex++;
      return (currentMount.refs[slot] ||= { current: initial });
    },
    useCallback: fn => fn,
    useEffect(fn, deps) {
      const changed = !currentMount.deps || deps.some((d, idx) => d !== currentMount.deps[idx]);
      if (changed) {
        if (currentMount.cleanup) currentMount.cleanup();
        currentMount.cleanup = fn();
        currentMount.deps = deps;
      }
    },
    Date: { now: () => now },
    console: { error() {} },
    setTimeout(fn) { timers.set(++timer, fn); return timer; },
    clearTimeout: id => timers.delete(id),
    setInterval(fn) { const id = ++interval; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id),
    window: { addEventListener() {}, removeEventListener() {} },
    supabase: { channel: () => { channelCount++; return channel; }, removeChannel() {} },
  });
  let currentMount = null;
  const source = fs.readFileSync(new URL('../hooks/useLiveData.js', import.meta.url), 'utf8')
    .replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g, '')
    .replace(/export /g, '');
  vm.runInContext(source + '\nthis.useLiveData = useLiveData;\nthis.clearLiveDataCache = clearLiveDataCache;', scope);

  function mount() {
    const inst = { stateIndex: 0, refIndex: 0, states: [], refs: [], cleanup: null, deps: null };
    return {
      render(loader, tables, options) {
        inst.stateIndex = inst.refIndex = 0;
        currentMount = inst;
        return scope.useLiveData(loader, tables, options);
      },
      unmount() {
        if (inst.cleanup) { inst.cleanup(); inst.cleanup = null; }
      },
    };
  }

  return {
    mount,
    clearCache: key => scope.clearLiveDataCache(key),
    setNow: time => { now = time; },
    getStats: () => ({ channels: channelCount, activeIntervals: intervals.size }),
    async tick() {
      const work = [...timers.values()];
      timers.clear();
      await Promise.all(work.map(fn => fn()));
    },
  };
}

test('useLiveData serves cached SWR data within staleTime and resets via clearLiveDataCache', async () => {
  const mod = hookModuleHarness();
  let calls = 0;
  let nextValue = { version: 1 };
  const loader = async () => { calls++; return nextValue; };
  const tables = ['shipments'];

  const first = mod.mount();
  const r1 = first.render(loader, tables, { cacheKey: 'swr:test', staleTime: 5000 });
  assert.equal(r1.loading, true);
  assert.equal(r1.data, null);
  await mod.tick();
  assert.equal(calls, 1);
  assert.deepEqual(first.render(loader, tables, { cacheKey: 'swr:test', staleTime: 5000 }).data, { version: 1 });
  first.unmount();

  mod.setNow(3000);
  const second = mod.mount();
  const r2 = second.render(loader, tables, { cacheKey: 'swr:test', staleTime: 5000 });
  assert.equal(r2.loading, false);
  assert.deepEqual(r2.data, { version: 1 });
  assert.equal(r2.lastUpdated, 1000);
  await mod.tick();
  assert.equal(calls, 1);
  second.unmount();

  mod.setNow(7000);
  nextValue = { version: 2 };
  const third = mod.mount();
  const r3 = third.render(loader, tables, { cacheKey: 'swr:test', staleTime: 5000 });
  assert.equal(r3.loading, false);
  assert.deepEqual(r3.data, { version: 1 });
  await mod.tick();
  assert.equal(calls, 2);
  assert.deepEqual(third.render(loader, tables, { cacheKey: 'swr:test', staleTime: 5000 }).data, { version: 2 });
  third.unmount();

  mod.clearCache('swr:test');
  const fourth = mod.mount();
  const r4 = fourth.render(loader, tables, { cacheKey: 'swr:test', staleTime: 5000 });
  assert.equal(r4.loading, true);
  assert.equal(r4.data, null);
  await mod.tick();
  assert.equal(calls, 3);
  fourth.unmount();
});

test('useLiveData skips fetching and subscriptions when enabled is false until re-enabled', async () => {
  const mod = hookModuleHarness();
  let calls = 0;
  const loader = async () => { calls++; return { ok: true }; };
  const tables = ['tracking_logs'];

  const view = mod.mount();
  view.render(loader, tables, { cacheKey: 'map:test', enabled: false });
  await mod.tick();
  assert.equal(calls, 0);
  assert.deepEqual(mod.getStats(), { channels: 0, activeIntervals: 0 });

  view.render(loader, tables, { cacheKey: 'map:test', enabled: true });
  assert.deepEqual(mod.getStats(), { channels: 1, activeIntervals: 1 });
  await mod.tick();
  assert.equal(calls, 1);
  view.unmount();
  assert.equal(mod.getStats().activeIntervals, 0);
});
