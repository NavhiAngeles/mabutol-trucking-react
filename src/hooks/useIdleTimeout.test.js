import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness(initial = 1000) {
  const refs = [], effects = [], listeners = new Map(), intervals = new Map(), states = [];
  let ri = 0, ei = 0, si = 0, id = 0, now = 1000, last = initial, marks = 0, signs = 0;
  const scope = vm.createContext({
    useRef(value) { return refs[ri++] ||= { current: value }; },
    useState(value) {
      const index = si++;
      if (!(index in states)) states[index] = value;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useCallback(fn) { return fn; },
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
    IDLE_WARNING_SECONDS: 120,
    supabase: { auth: { async signOut() { signs++; } } },
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    setInterval(fn) { intervals.set(++id, fn); return id; },
    clearInterval: key => intervals.delete(key),
  });
  const source = fs.readFileSync(new URL('./useIdleTimeout.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\nthis.hook = useIdleTimeout;', scope);
  return {
    render(role, callback) { ri = ei = si = 0; return scope.hook(role, callback); },
    async tick() { for (const fn of [...intervals.values()]) await fn(); },
    time: value => { now = value; },
    activity: name => listeners.get(name)?.(),
    storage(key = 'lastActivityAt') { listeners.get('storage')?.({ key }); },
    cleanup() { effects.forEach(effect => effect.cleanup?.()); },
    counts: () => ({ marks, signs, last, timers: intervals.size, listeners: listeners.size }),
  };
}

test('three callback-changing rerenders preserve inactivity and timeout calls latest callback', async () => {
  const h = harness(); let old = 0, latest = 0;
  h.render('admin', () => old++);
  for (let i = 0; i < 3; i++) h.render('admin', () => latest++);
  // 4 activity events + 1 storage event = 5 listeners
  assert.deepEqual(h.counts(), { marks: 0, signs: 0, last: 1000, timers: 1, listeners: 5 });
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

test('shows 2-minute pre-expiry countdown warning and updates remaining seconds', async () => {
  const h = harness();
  let state = h.render('admin');
  assert.equal(state.showWarning, false);

  // 27 minutes elapsed: 3 minutes remaining, outside 2-minute window
  h.time(1000 + 27 * 60000);
  await h.tick();
  state = h.render('admin');
  assert.equal(state.showWarning, false);

  // 28 minutes and 30 seconds elapsed: 1 minute 30 seconds (90s) remaining
  h.time(1000 + 28.5 * 60000);
  await h.tick();
  state = h.render('admin');
  assert.equal(state.showWarning, true);
  assert.equal(state.remainingSeconds, 90);

  // 29 minutes elapsed: 60s remaining
  h.time(1000 + 29 * 60000);
  await h.tick();
  state = h.render('admin');
  assert.equal(state.showWarning, true);
  assert.equal(state.remainingSeconds, 60);

  // 30 minutes and 10 seconds: past limit, signed out
  h.time(1000 + 30.1 * 60000);
  await h.tick();
  state = h.render('admin');
  assert.equal(state.showWarning, false);
  assert.equal(h.counts().signs, 1);
});

test('Stay signed in action records activity, extends session, and hides warning', async () => {
  const h = harness();
  h.render('admin');

  // Enter warning state at 29 minutes
  h.time(1000 + 29 * 60000);
  await h.tick();
  let state = h.render('admin');
  assert.equal(state.showWarning, true);
  assert.equal(state.remainingSeconds, 60);

  // User clicks "Stay signed in"
  const previousMarks = h.counts().marks;
  state.staySignedIn();
  assert.equal(h.counts().marks, previousMarks + 1);
  assert.equal(h.counts().last, 1000 + 29 * 60000);

  state = h.render('admin');
  assert.equal(state.showWarning, false);

  // Check 10 minutes later (39m total, 10m since extension)
  h.time(1000 + 39 * 60000);
  await h.tick();
  state = h.render('admin');
  assert.equal(state.showWarning, false);
  assert.equal(h.counts().signs, 0);
});

test('synchronizes activity across browser tabs via window storage event', async () => {
  const h = harness();
  h.render('admin');

  // Tab A enters warning at 28.5 minutes
  h.time(1000 + 28.5 * 60000);
  await h.tick();
  let state = h.render('admin');
  assert.equal(state.showWarning, true);
  assert.equal(state.remainingSeconds, 90);

  // Tab B registers user activity at 28.8 minutes (updating storage)
  h.time(1000 + 28.8 * 60000);
  h.activity('keydown'); // simulates activity setting lastActivity
  // Tab A receives storage event from Tab B
  h.storage('lastActivityAt');

  state = h.render('admin');
  assert.equal(state.showWarning, false);

  // Irrelevant storage key does not corrupt state
  h.storage('unrelated_theme_key');
  state = h.render('admin');
  assert.equal(state.showWarning, false);
});
