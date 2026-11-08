import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function createAuthFixture(dependencies = {}) {
  const source = fs.readFileSync(new URL('./AuthContext.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'AuthContext.jsx', { jsx: { runtime: 'classic' } });
  const states = [];
  const refs = [];
  const callbacks = [];
  const effects = [];
  let si = 0, ri = 0, ci = 0;
  const listeners = {};

  const scope = {
    React: {
      createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    },
    createContext: () => ({ Provider: 'Provider' }),
    useContext: () => null,
    useState(initial) {
      const i = si++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], val => { states[i] = typeof val === 'function' ? val(states[i]) : val; }];
    },
    useRef(initial) {
      const i = ri++;
      return refs[i] ||= { current: initial };
    },
    useCallback(fn, deps) {
      const i = ci++;
      const prev = callbacks[i];
      if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, idx) => Object.is(d, prev.deps[idx]))) {
        return prev.fn;
      }
      callbacks[i] = { fn, deps };
      return fn;
    },
    useEffect(fn) {
      effects.push(fn);
    },
    setTimeout,
    clearTimeout,
    setInterval: fn => {
      scope._intervalFn = fn;
      return 1;
    },
    clearInterval: () => {},
    window: {
      addEventListener: (event, fn) => {
        (listeners[event] ||= []).push(fn);
      },
      removeEventListener: (event, fn) => {
        listeners[event] = (listeners[event] || []).filter(f => f !== fn);
      },
    },
    ...dependencies,
  };

  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace(/export default function/g, 'function').replace(/export function/g, 'function') + '\nthis.Component=AuthProvider;', scope);

  const render = (props = { children: null }) => {
    si = 0;
    ri = 0;
    ci = 0;
    return scope.Component(props);
  };

  return {
    render,
    effects,
    listeners,
    scope,
    getAuth: () => render().props.value,
    fireFocus: () => {
      (listeners['focus'] || []).forEach(fn => fn());
    },
  };
}

test('LOGIN-02: rapid tab-focus triggers role downgrade from admin to staff while preserving user identity', async () => {
  let profile = { role: 'admin', is_active: true };
  const user = { id: 'office-user-01', email: 'user@mabutol.test' };

  const fixture = await createAuthFixture({
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange() {
          return { data: { subscription: { unsubscribe() {} } } };
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: profile, error: null }),
          }),
        }),
      }),
    },
  });

  fixture.render();
  const cleanup = fixture.effects[0]();
  await new Promise(r => setTimeout(r, 15));

  // Initial state: admin
  assert.equal(fixture.getAuth().role, 'admin');
  assert.equal(fixture.getAuth().user.id, 'office-user-01');

  // Role downgraded to staff in DB
  profile = { role: 'staff', is_active: true };

  // Rapid tab-focus events fired (user switched tabs quickly multiple times)
  fixture.fireFocus();
  fixture.fireFocus();
  fixture.fireFocus();

  await new Promise(r => setTimeout(r, 15));
  await new Promise(r => setTimeout(r, 15));

  // Role is downgraded to staff while maintaining active user session
  assert.equal(fixture.getAuth().role, 'staff', 'Role must downgrade from admin to staff on tab focus');
  assert.equal(fixture.getAuth().user.id, 'office-user-01');
  assert.equal(fixture.getAuth().loading, false);

  cleanup();
});

test('LOGIN-02: out-of-order profile queries on rapid tab focus do not resurrect stale admin role', async () => {
  const user = { id: 'office-user-02' };
  const slowAdminPending = deferred();

  let queryCount = 0;
  const fixture = await createAuthFixture({
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange() {
          return { data: { subscription: { unsubscribe() {} } } };
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              queryCount++;
              if (queryCount === 1) {
                // Initial load: returns admin
                return { data: { role: 'admin', is_active: true }, error: null };
              } else if (queryCount === 2) {
                // First focus event: slow query that takes a long time
                return slowAdminPending.promise;
              } else {
                // Second focus event: fast query that resolves immediately with downgraded staff role
                return { data: { role: 'staff', is_active: true }, error: null };
              }
            },
          }),
        }),
      }),
    },
  });

  fixture.render();
  fixture.effects[0]();
  await new Promise(r => setTimeout(r, 15));
  assert.equal(fixture.getAuth().role, 'admin');

  // Fire first focus (starts slow query #2)
  fixture.fireFocus();
  await new Promise(r => setTimeout(r, 15));

  // Fire second focus (starts fast query #3 and resolves with staff)
  fixture.fireFocus();
  await new Promise(r => setTimeout(r, 15));
  await new Promise(r => setTimeout(r, 15));

  assert.equal(fixture.getAuth().role, 'staff');

  // Now the slow earlier query (#2 with admin) finally resolves late
  slowAdminPending.resolve({ data: { role: 'admin', is_active: true }, error: null });
  await new Promise(r => setTimeout(r, 15));
  await new Promise(r => setTimeout(r, 15));

  // The stale admin query must be discarded by sessionVersion guard; role must stay staff
  assert.equal(fixture.getAuth().role, 'staff', 'Stale admin response must not resurrect admin permissions');
});

test('USER-01: mid-session account deactivation immediately revokes office access on focus or polling', async () => {
  let profile = { role: 'staff', is_active: true };
  const user = { id: 'office-staff-01' };

  const fixture = await createAuthFixture({
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: profile, error: null }),
          }),
        }),
      }),
    },
  });

  fixture.render();
  fixture.effects[0]();
  await new Promise(r => setTimeout(r, 15));

  assert.equal(fixture.getAuth().user.id, 'office-staff-01');
  assert.equal(fixture.getAuth().role, 'staff');

  // Admin deactivates account mid-session
  profile = { role: 'staff', is_active: false };

  // Trigger tab focus
  fixture.fireFocus();
  await new Promise(r => setTimeout(r, 15));
  await new Promise(r => setTimeout(r, 15));

  assert.equal(fixture.getAuth().user, null, 'Deactivated account user must be cleared to null');
  assert.equal(fixture.getAuth().role, null, 'Deactivated account role must be cleared to null');
  assert.equal(fixture.getAuth().loading, false);
});

test('USER-01: mid-session role change to non-office role revokes office access', async () => {
  let profile = { role: 'admin', is_active: true };
  const user = { id: 'demoted-user-01' };

  const fixture = await createAuthFixture({
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: profile, error: null }),
          }),
        }),
      }),
    },
  });

  fixture.render();
  fixture.effects[0]();
  await new Promise(r => setTimeout(r, 15));
  assert.equal(fixture.getAuth().role, 'admin');

  // Role changed to non-office customer role
  profile = { role: 'customer', is_active: true };
  fixture.fireFocus();
  await new Promise(r => setTimeout(r, 15));
  await new Promise(r => setTimeout(r, 15));

  assert.equal(fixture.getAuth().user, null, 'Non-office role must not be granted office user access');
  assert.equal(fixture.getAuth().role, null);
});

test('LOGIN-02: token expiry returning null session clears credentials and sets loading to false', async () => {
  let session = { user: { id: 'active-session-user' } };

  const fixture = await createAuthFixture({
    supabase: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { role: 'admin', is_active: true }, error: null }),
          }),
        }),
      }),
    },
  });

  fixture.render();
  fixture.effects[0]();
  await new Promise(r => setTimeout(r, 15));

  assert.equal(fixture.getAuth().user.id, 'active-session-user');
  assert.equal(fixture.getAuth().role, 'admin');

  // Token expires: getSession returns null session
  session = null;
  fixture.fireFocus();
  await new Promise(r => setTimeout(r, 15));
  await new Promise(r => setTimeout(r, 15));

  assert.equal(fixture.getAuth().user, null, 'Expired session must clear user');
  assert.equal(fixture.getAuth().role, null, 'Expired session must clear role');
  assert.equal(fixture.getAuth().loading, false);
});

test('LOGIN-02: token expiry throwing or returning JWT error clears credentials safely', async () => {
  let throwError = false;

  const fixture = await createAuthFixture({
    supabase: {
      auth: {
        getSession: async () => {
          if (throwError) {
            return { data: { session: null }, error: new Error('JWT expired: token has expired') };
          }
          return { data: { session: { user: { id: 'token-user' } } }, error: null };
        },
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { role: 'staff', is_active: true }, error: null }),
          }),
        }),
      }),
    },
  });

  fixture.render();
  fixture.effects[0]();
  await new Promise(r => setTimeout(r, 15));

  assert.equal(fixture.getAuth().user.id, 'token-user');
  assert.equal(fixture.getAuth().role, 'staff');

  // Token expires and throws JWT error
  throwError = true;
  fixture.fireFocus();
  await new Promise(r => setTimeout(r, 15));
  await new Promise(r => setTimeout(r, 15));

  assert.equal(fixture.getAuth().user, null, 'JWT error must clear user');
  assert.equal(fixture.getAuth().role, null, 'JWT error must clear role');
  assert.equal(fixture.getAuth().loading, false);
});
