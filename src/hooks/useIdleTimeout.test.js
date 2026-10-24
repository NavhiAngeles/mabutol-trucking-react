import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness(initial = 1000) {
  const refs = [], effects = [], listeners = new Map(), intervals = new Map();
  let ri = 0, ei = 0, id = 0, now = 1000, last = initial, marks = 0, signs = 0;
  const scope = vm.createContext({
    useRef(value) { return refs[ri++] ||= { current: value }; },
    useEffect(fn, deps) {
      const index = ei++, old = effects[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        old?.cleanup?.(); effects[index] = { deps, cleanup: fn() };
      }
    },
    Date: { now: () => now },
    getLastActivity: () => last,
    markActivity() { marks++; last = now; },
    getIdleLimitMinutes: () => 30,
    supabase: { auth: { async signOut() { signs++; } } },
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    setInterval(fn) { intervals.set(++id, fn); return id; },
    clearInterval: key => intervals.delete(key),
  });
  const source = fs.readFileSync(new URL('./useIdleTimeout.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.hook = useIdleTimeout;', scope);
  return {
    render(role, callback) { ri = ei = 0; scope.hook(role, callback); },
    async tick() { for (const fn of [...intervals.values()]) await fn(); },
    time: value => { now = value; }, activity: name => listeners.get(name)(),
    cleanup() { effects.forEach(effect => effect.cleanup?.()); },
    counts: () => ({ marks, signs, last, timers: intervals.size, listeners: listeners.size }),
  };
}

test('three callback-changing rerenders preserve inactivity and timeout calls latest callback', async () => {
  const h = harness(); let old = 0, latest = 0;
  h.render('admin', () => old++);
  for (let i = 0; i < 3; i++) h.render('admin', () => latest++);
  assert.deepEqual(h.counts(), { marks: 0, signs: 0, last: 1000, timers: 1, listeners: 4 });
  h.time(31 * 60000); await h.tick();
  assert.equal(h.counts().signs, 1); assert.equal(old, 0); assert.equal(latest, 1);
  h.cleanup(); assert.equal(h.counts().timers + h.counts().listeners, 0);
});

test('missing clock initializes once; real input postpones logout; role changes do not reset it', async () => {
  const h = harness(null); h.render('admin');
  assert.equal(h.counts().marks, 1);
  h.time(20 * 60000);
  for (const name of ['mousedown', 'keydown', 'scroll', 'touchstart']) h.activity(name);
  h.render('staff'); assert.equal(h.counts().marks, 5);
  h.time(40 * 60000); await h.tick(); assert.equal(h.counts().signs, 0);
  h.time(51 * 60000); await h.tick(); assert.equal(h.counts().signs, 1);
  h.render(null); assert.equal(h.counts().timers + h.counts().listeners, 0);
});

test('signed-out hook does not initialize clock and remount preserves existing inactivity', async () => {
  const h = harness(); h.render(null); assert.equal(h.counts().marks, 0);
  h.time(31 * 60000); h.render('admin'); await h.tick();
  assert.equal(h.counts().marks, 0); assert.equal(h.counts().signs, 1);
});
