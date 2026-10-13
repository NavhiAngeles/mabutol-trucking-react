import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';

function harness(fetch) {
  const state = [], refs = [], timeouts = new Map(), intervals = new Map(), listeners = new Set();
  let stateIndex = 0, refIndex = 0, cleanup, timerId = 0, subscribed = 0, removed = 0, change;
  const scope = {
    useState(initial) { const i = stateIndex++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { return refs[refIndex++] ||= { current: initial }; }, useCallback: fn => fn,
    useEffect(fn) { if (!cleanup) cleanup = fn(); }, fetchOperationsPage: fetch,
    subscribeOperationsFeed(callback) { subscribed++; change = callback; return () => removed++; },
    setTimeout(fn) { timeouts.set(++timerId, fn); return timerId; }, clearTimeout: id => timeouts.delete(id),
    setInterval(fn) { intervals.set(++timerId, fn); return timerId; }, clearInterval: id => intervals.delete(id),
    window: { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) },
    document: { visibilityState: 'visible', addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) },
  };
  vm.createContext(scope);
  const source = fs.readFileSync(new URL('./OperationsFeedViewModel.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.hook=useOperationsFeed;', scope);
  return {
    render() { stateIndex = refIndex = 0; return scope.hook(); },
    tick() { const tasks = [...timeouts.values()]; timeouts.clear(); tasks.forEach(fn => fn()); },
    flush: () => new Promise(resolve => setImmediate(resolve)), change: () => change(),
    cleanup: () => cleanup(), timeouts, intervals, listeners,
    counts: () => ({ subscribed, removed }),
  };
}
test('feed coalesces changes, retains stale events on failure, retries, and cleans up subscriptions and clocks', async () => {
  let resolve, fail = false, calls = 0;
  const h = harness(async () => { calls++; if (calls === 1) return new Promise(done => resolve = done);
    if (fail) throw new Error('Permission denied'); return { events: [] }; });
  assert.equal(h.render().feed.loading, true); h.tick();
  h.change(); h.change(); assert.equal(h.timeouts.size, 1); h.tick(); assert.equal(calls, 1);
  resolve({ events: [{ key: 'real' }] }); await h.flush(); assert.equal(h.render().feed.events.length, 1);
  fail = true; h.tick(); await h.flush();
  assert.equal(h.render().feed.error, 'Permission denied'); assert.equal(h.render().feed.events[0].key, 'real');
  fail = false; h.render().refresh(); h.tick(); await h.flush(); assert.equal(h.render().feed.events.length, 0);
  assert.equal(h.render().feed.error, ''); assert.equal(h.counts().subscribed, 1);
  h.cleanup(); assert.equal(h.counts().removed, 1);
  assert.equal(h.timeouts.size + h.intervals.size + h.listeners.size, 0);
});
test('history paginates a fixed snapshot, caches previous pages and resets on explicit refresh', async () => {
  const requests = [];
  const h = harness(async request => {
    requests.push(request);
    if (request.size === 3) return { events: [] };
    return request.cursor ? { events: [{ key: 'older' }], snapshot: request.snapshot, nextCursor: null }
      : { events: [{ key: 'latest' }], snapshot: 'fixed', nextCursor: { id: '2' } };
  });
  h.render().openHistory(); await h.flush(); assert.equal(h.render().history.open, true);
  h.render().nextPage(); await h.flush(); assert.equal(h.render().history.page, 2);
  assert.equal(requests.at(-1).snapshot, 'fixed');
  const count = requests.length;
  h.render().previousPage(); assert.equal(h.render().history.page, 1);
  h.render().nextPage(); assert.equal(requests.length, count);
  h.render().refreshHistory(); await h.flush(); assert.equal(h.render().history.page, 1);
  h.render().closeHistory(); assert.equal(h.render().history.open, false); h.cleanup();
});
test('closed history and unmounted feed ignore pending responses', async () => {
  let resolve;
  const h = harness(() => new Promise(done => resolve = done));
  h.render().openHistory(); h.render().closeHistory();
  resolve({ events: [{ key: 'stale' }] }); await h.flush(); assert.equal(h.render().history.open, false);
  h.tick(); h.cleanup(); resolve({ events: [{ key: 'stale' }] }); await h.flush();
  assert.equal(h.render().feed.events.length, 0);
});
