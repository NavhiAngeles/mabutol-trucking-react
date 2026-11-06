import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  setAttribute(k, v) {
    this.attributes[k] = v;
  }

  getAttribute(k) {
    return this.attributes[k];
  }
}

class MockMap {
  constructor(options) {
    this.options = options;
    this.container = options.container;
    this.center = options.center || [121, 15];
    this.zoom = options.zoom || 7;
    this.bearing = options.bearing || 0;
    this.pitch = options.pitch || 0;
    this.isRemoved = false;
    this.resizeCount = 0;
    this.handlers = {};
  }

  on(event, handler) {
    this.handlers[event] = this.handlers[event] || [];
    this.handlers[event].push(handler);
  }

  emit(event, data) {
    (this.handlers[event] || []).forEach(h => h(data));
  }

  getCenter() {
    return this.center;
  }

  setCenter(center) {
    this.center = center;
  }

  getZoom() {
    return this.zoom;
  }

  setZoom(zoom) {
    this.zoom = zoom;
  }

  getBearing() {
    return this.bearing;
  }

  setBearing(bearing) {
    this.bearing = bearing;
  }

  getPitch() {
    return this.pitch;
  }

  setPitch(pitch) {
    this.pitch = pitch;
  }

  resize() {
    this.resizeCount++;
  }

  remove() {
    this.isRemoved = true;
  }
}

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = [];
    this.isDisconnected = false;
  }

  observe(target) {
    this.observed.push(target);
  }

  disconnect() {
    this.isDisconnected = true;
    this.observed = [];
  }
}

async function setupMapProviderHarness() {
  const providerPath = new URL('./DashboardMapProvider.jsx', import.meta.url).pathname;
  const mapPath = new URL('./DashboardTrackingMap.jsx', import.meta.url).pathname;

  const providerSource = await readFile(new URL('./DashboardMapProvider.jsx', import.meta.url), 'utf8');
  const mapSource = await readFile(new URL('./DashboardTrackingMap.jsx', import.meta.url), 'utf8');

  const providerTransformed = await transformWithOxc(providerSource, providerPath, { jsx: { runtime: 'classic' } });
  const mapTransformed = await transformWithOxc(mapSource, mapPath, { jsx: { runtime: 'classic' } });

  const mapInstances = [];
  const resizeObservers = [];
  let currentAuth = { user: null, role: null };

  const React = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children };
    }
  };

  const createPortal = (element, container) => ({
    type: 'portal',
    element,
    container
  });

  const MockMapLibre = {
    setWorkerUrl() {},
    Map: class extends MockMap {
      constructor(options) {
        super(options);
        mapInstances.push(this);
      }
    },
    Marker: class {
      setLngLat() { return this; }
      setPopup() { return this; }
      addTo() { return this; }
      remove() {}
    },
    Popup: class {
      setDOMContent() { return this; }
      isOpen() { return false; }
    }
  };

  let activeContextValue = null;
  const layoutEffects = [];
  const scope = {
    React,
    createPortal,
    document: {
      createElement: tag => new MockElement(tag)
    },
    useAuth: () => currentAuth,
    useContext: () => activeContextValue,
    useRef: initial => ({ current: initial }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useLayoutEffect: fn => layoutEffects.push(fn),
    useEffect: () => {},
    useLiveData: () => ({ data: [], loading: false, error: null }),
    getLiveTracking: () => {},
    DASHBOARD_TABLES: [],
    absoluteEventTime: () => '',
    snapshotStatus: () => '',
    watchTrackingFreshness: () => () => {},
    maplibregl: MockMapLibre,
    maplibreWorkerUrl: 'mock-worker.mjs',
    LUZON_CENTER: [121, 15],
    LUZON_BOUNDS: [[119, 12], [124, 19]],
    LUZON_MIN_ZOOM: 5,
    LUZON_MAX_ZOOM: 18,
    ResizeObserver: class extends MockResizeObserver {
      constructor(cb) {
        super(cb);
        resizeObservers.push(this);
      }
    },
    setTimeout,
    clearTimeout,
    console: { ...console, error: () => {} }
  };

  vm.createContext(scope);

  const cleanMapCode = mapTransformed.code
    .replace(/^import .*;$/gm, '')
    .replace(/export\s+default\s+function/g, 'function')
    .replace(/export\s+function/g, 'function')
    .replaceAll('import.meta.env.VITE_MAPTILER_API_KEY', '"test-maptiler-key"');

  const cleanProviderCode = providerTransformed.code
    .replace(/^import .*;$/gm, '')
    .replace('export default function DashboardMapProvider', 'function DashboardMapProvider')
    .replace('export function DashboardMapSlot', 'function DashboardMapSlot');

  const combinedCode = `
    const DashboardMapContext = {
      Provider: function({ value, children }) {
        return { type: 'Provider', value, children };
      }
    };
    ${cleanMapCode}
    ${cleanProviderCode}
    this.DashboardTrackingMap = DashboardTrackingMap;
    this.DashboardMapProvider = DashboardMapProvider;
    this.DashboardMapSlot = DashboardMapSlot;
    this.MapSession = MapSession;
    this.DashboardMapContext = DashboardMapContext;
  `;

  vm.runInContext(combinedCode, scope);

  /**
   * Simulates the React component lifecycle for DashboardMapProvider, MapSession,
   * DashboardMapSlot, and DashboardTrackingMap.
   */
  class RuntimeSession {
    constructor(sessionKey) {
      this.sessionKey = sessionKey;
      this.host = new MockElement('div');
      this.visited = false;
      this.trackingMapMounted = false;
      this.trackingCleanups = [];
      this.activeSlot = null;
      this.currentMap = null;
      this.currentObserver = null;
    }

    activate() {
      if (!this.visited) {
        this.visited = true;
        this.mountTrackingMap();
      }
    }

    mountTrackingMap() {
      if (this.trackingMapMounted) return;
      this.trackingMapMounted = true;

      // Simulate DashboardTrackingMap render & useEffect
      const containerRef = { current: new MockElement('div') };
      this.host.appendChild(containerRef.current);

      let mapInstance = null;
      try {
        mapInstance = new MockMapLibre.Map({
          container: containerRef.current,
          style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=test-maptiler-key',
          center: [121, 15],
          zoom: 7,
          minZoom: 5,
          maxZoom: 18,
          maxBounds: [[119, 12], [124, 19]],
          renderWorldCopies: false,
          attributionControl: true
        });
      } catch {
        // error handling
      }

      const observer = new scope.ResizeObserver(() => {
        mapInstance?.resize();
      });
      observer.observe(containerRef.current);

      this.currentMap = mapInstance;
      this.currentObserver = observer;

      this.trackingCleanups.push(() => {
        observer.disconnect();
        mapInstance?.remove();
        this.currentMap = null;
        this.currentObserver = null;
      });
    }

    unmountTrackingMap() {
      if (!this.trackingMapMounted) return;
      while (this.trackingCleanups.length > 0) {
        const cleanup = this.trackingCleanups.pop();
        cleanup();
      }
      this.trackingMapMounted = false;
    }

    mountSlot(slotElement) {
      if (this.activeSlot) {
        this.unmountSlot();
      }
      this.activeSlot = {
        slotElement,
        cleanup: () => {
          this.host.remove();
        }
      };
      slotElement.appendChild(this.host);
      this.activate();
      return this.activeSlot;
    }

    unmountSlot() {
      if (this.activeSlot) {
        this.activeSlot.cleanup();
        this.activeSlot = null;
      }
    }

    dispose() {
      this.unmountSlot();
      this.unmountTrackingMap();
    }
  }

  let activeSession = null;

  return {
    scope,
    mapInstances,
    resizeObservers,
    layoutEffects,
    setAuth: (user, role) => {
      currentAuth = { user, role };
    },
    setActiveContextValue: val => {
      activeContextValue = val;
    },
    getSessionKey: () => {
      const { user, role } = currentAuth;
      return user && ['admin', 'staff'].includes(role) ? user.id : 'signed-out';
    },
    syncSession: () => {
      const { user, role } = currentAuth;
      const key = user && ['admin', 'staff'].includes(role) ? user.id : 'signed-out';
      if (!activeSession || activeSession.sessionKey !== key) {
        if (activeSession) {
          activeSession.dispose();
        }
        activeSession = new RuntimeSession(key);
      }
      return activeSession;
    },
    getCurrentSession: () => activeSession
  };
}

test('sessionKey resolution: office roles vs customer/driver/unauthenticated', async () => {
  const harness = await setupMapProviderHarness();

  harness.setAuth({ id: 'usr-admin-1' }, 'admin');
  assert.equal(harness.getSessionKey(), 'usr-admin-1');

  // Verify direct invocation of DashboardMapProvider component inside the VM
  const adminVNode = harness.scope.DashboardMapProvider({ children: 'child' });
  assert.equal(adminVNode.props.key, 'usr-admin-1');

  harness.setAuth({ id: 'usr-staff-1' }, 'staff');
  assert.equal(harness.getSessionKey(), 'usr-staff-1');
  const staffVNode = harness.scope.DashboardMapProvider({ children: 'child' });
  assert.equal(staffVNode.props.key, 'usr-staff-1');

  harness.setAuth({ id: 'usr-driver-1' }, 'driver');
  assert.equal(harness.getSessionKey(), 'signed-out');
  const driverVNode = harness.scope.DashboardMapProvider({ children: 'child' });
  assert.equal(driverVNode.props.key, 'signed-out');

  harness.setAuth({ id: 'usr-cust-1' }, 'customer');
  assert.equal(harness.getSessionKey(), 'signed-out');
  const custVNode = harness.scope.DashboardMapProvider({ children: 'child' });
  assert.equal(custVNode.props.key, 'signed-out');

  harness.setAuth(null, null);
  assert.equal(harness.getSessionKey(), 'signed-out');
  const anonVNode = harness.scope.DashboardMapProvider({ children: 'child' });
  assert.equal(anonVNode.props.key, 'signed-out');
});

test('DashboardMapSlot renders slot div and attaches host on layout effect', async () => {
  const harness = await setupMapProviderHarness();
  const host = new MockElement('div');
  let activated = false;

  harness.setActiveContextValue({
    host,
    activate: val => { activated = val; }
  });

  const slotNode = harness.scope.DashboardMapSlot();
  assert.equal(slotNode.type, 'div');
  assert.ok(slotNode.props.ref);

  // Provide the mounted DOM container to ref and execute the layout effect
  const container = new MockElement('div');
  slotNode.props.ref.current = container;
  assert.equal(harness.layoutEffects.length, 1);
  const cleanup = harness.layoutEffects[0]();

  assert.equal(activated, true);
  assert.equal(host.parentElement, container);

  // Unmounting the slot invokes cleanup, detaching host
  cleanup();
  assert.equal(host.parentElement, null);
});

test('navigating away from /dashboard and back preserves mounted MapLibre instance and camera state for same office user', async () => {
  const harness = await setupMapProviderHarness();

  // 1. Office user signs in
  harness.setAuth({ id: 'office-user-01' }, 'admin');
  const session = harness.syncSession();
  const initialHost = session.host;
  assert.ok(initialHost instanceof MockElement);
  assert.equal(session.visited, false);
  assert.equal(harness.mapInstances.length, 0);

  // 2. Navigates to /dashboard: DashboardMapSlot mounts
  const dashboardSlotElement1 = new MockElement('div');
  session.mountSlot(dashboardSlotElement1);

  assert.equal(session.visited, true);
  assert.equal(initialHost.parentElement, dashboardSlotElement1);
  assert.equal(harness.mapInstances.length, 1);

  const mapInstance = harness.mapInstances[0];
  assert.equal(mapInstance.isRemoved, false);
  assert.deepEqual(mapInstance.getCenter(), [121, 15]);
  assert.equal(mapInstance.getZoom(), 7);
  assert.equal(mapInstance.getBearing(), 0);
  assert.equal(mapInstance.getPitch(), 0);

  // 3. User alters camera state on the map (panning & zooming)
  const modifiedCenter = [120.5960, 16.4023];
  const modifiedZoom = 12.5;
  const modifiedBearing = 45;
  const modifiedPitch = 30;

  mapInstance.setCenter(modifiedCenter);
  mapInstance.setZoom(modifiedZoom);
  mapInstance.setBearing(modifiedBearing);
  mapInstance.setPitch(modifiedPitch);

  // 4. Navigates away from /dashboard (e.g. to /shipment)
  // DashboardMapSlot unmounts, running its cleanup: host.remove()
  session.unmountSlot();

  // Verify host is detached from the DOM, but session and map remain alive
  assert.equal(initialHost.parentElement, null);
  assert.equal(mapInstance.isRemoved, false);
  assert.equal(harness.mapInstances.length, 1);
  assert.deepEqual(mapInstance.getCenter(), modifiedCenter);
  assert.equal(mapInstance.getZoom(), modifiedZoom);
  assert.equal(mapInstance.getBearing(), modifiedBearing);
  assert.equal(mapInstance.getPitch(), modifiedPitch);

  // 5. Navigates back to /dashboard
  // A new DashboardMapSlot mounts with its own DOM node
  const dashboardSlotElement2 = new MockElement('div');
  session.mountSlot(dashboardSlotElement2);

  // Verify host is re-attached to the new slot
  assert.equal(initialHost.parentElement, dashboardSlotElement2);

  // Verify no new MapLibre instance was constructed (same instance preserved)
  assert.equal(harness.mapInstances.length, 1);
  assert.equal(session.currentMap, mapInstance);
  assert.equal(mapInstance.isRemoved, false);

  // Verify camera state was completely preserved across navigations
  assert.deepEqual(mapInstance.getCenter(), modifiedCenter);
  assert.equal(mapInstance.getZoom(), modifiedZoom);
  assert.equal(mapInstance.getBearing(), modifiedBearing);
  assert.equal(mapInstance.getPitch(), modifiedPitch);
});

test('signing out disposes MapLibre instance and resets portal host', async () => {
  const harness = await setupMapProviderHarness();

  // 1. Office user active on /dashboard
  harness.setAuth({ id: 'office-user-02' }, 'staff');
  const session1 = harness.syncSession();
  const host1 = session1.host;

  const slot1 = new MockElement('div');
  session1.mountSlot(slot1);

  assert.equal(harness.mapInstances.length, 1);
  const map1 = harness.mapInstances[0];
  const observer1 = session1.currentObserver;
  assert.equal(map1.isRemoved, false);
  assert.equal(observer1.isDisconnected, false);
  assert.equal(host1.parentElement, slot1);

  // 2. User signs out
  harness.setAuth(null, null);
  const sessionSignedOut = harness.syncSession();

  // Verify previous session's map instance is disposed and observer disconnected
  assert.equal(map1.isRemoved, true);
  assert.equal(observer1.isDisconnected, true);
  assert.equal(host1.parentElement, null);

  // Verify new session has a fresh portal host and visited is reset
  assert.notEqual(sessionSignedOut.host, host1);
  assert.equal(sessionSignedOut.visited, false);
  assert.equal(sessionSignedOut.currentMap, null);
  assert.equal(sessionSignedOut.sessionKey, 'signed-out');
});

test('switching user IDs disposes previous user MapLibre instance and resets portal host', async () => {
  const harness = await setupMapProviderHarness();

  // 1. First office user (admin-alpha) visits /dashboard
  harness.setAuth({ id: 'admin-alpha' }, 'admin');
  const sessionA = harness.syncSession();
  const hostA = sessionA.host;

  const slotA = new MockElement('div');
  sessionA.mountSlot(slotA);

  assert.equal(harness.mapInstances.length, 1);
  const mapA = harness.mapInstances[0];
  mapA.setCenter([120.9842, 14.5995]); // Manila
  mapA.setZoom(14);

  // 2. Switch to second office user (staff-bravo)
  harness.setAuth({ id: 'staff-bravo' }, 'staff');
  const sessionB = harness.syncSession();

  // Verify User A's map was disposed and host was reset
  assert.equal(mapA.isRemoved, true);
  assert.notEqual(sessionB.host, hostA);
  assert.equal(sessionB.visited, false);
  assert.equal(sessionB.sessionKey, 'staff-bravo');

  // 3. User B visits /dashboard
  const slotB = new MockElement('div');
  sessionB.mountSlot(slotB);

  // Verify a new MapLibre instance is created for User B with default Luzon camera state
  assert.equal(harness.mapInstances.length, 2);
  const mapB = harness.mapInstances[1];
  assert.notEqual(mapB, mapA);
  assert.equal(mapB.isRemoved, false);
  assert.deepEqual(mapB.getCenter(), [121, 15]); // Initial default, not User A's Manila
  assert.equal(mapB.getZoom(), 7);
  assert.equal(sessionB.host.parentElement, slotB);
});
