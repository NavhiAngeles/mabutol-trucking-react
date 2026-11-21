import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithEsbuild } from 'vite';

const find = (node, predicate) =>
  !node || typeof node !== 'object'
    ? []
    : [
        ...(predicate(node) ? [node] : []),
        ...(node.children || []).flat(Infinity).flatMap((child) => find(child, predicate)),
      ];

async function mountPicker({
  props = {},
  apiKey = 'test-maptiler-key',
} = {}) {
  const { code } = await transformWithEsbuild(
    fs.readFileSync(new URL('./VisualRoutePinPicker.jsx', import.meta.url), 'utf8'),
    'VisualRoutePinPicker.jsx',
    { loader: 'jsx', jsx: 'transform' }
  );

  const states = [];
  const refs = [];
  const memos = [];
  let stateIndex = 0;
  let refIndex = 0;
  let memoIndex = 0;

  class MockMap {
    on() {}
    addControl() {}
    resize() {}
    remove() {}
    flyTo() {}
    panTo() {}
    fitBounds() {}
    setStyle() {}
    getZoom() { return 14; }
    getLayer() { return false; }
    getSource() { return false; }
    addSource() {}
    addLayer() {}
    removeLayer() {}
    removeSource() {}
  }

  class MockMarker {
    setLngLat() { return this; }
    addTo() { return this; }
    remove() {}
    on() {}
    setDraggable() {}
    getElement() { return null; }
  }

  const FRAGMENT = Symbol.for('react.fragment');
  const context = vm.createContext({
    React: {
      Fragment: FRAGMENT,
      createElement: (type, elProps, ...children) => {
        const flat = children.flat(Infinity);
        if (type === FRAGMENT) return flat;
        if (typeof type === 'function') {
          return type({ ...(elProps || {}), children: flat });
        }
        return {
          type,
          props: elProps || {},
          children: flat,
        };
      },
    },
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) {
        states[i] = typeof initial === 'function' ? initial() : initial;
      }
      return [
        states[i],
        (value) => {
          states[i] = typeof value === 'function' ? value(states[i]) : value;
        },
      ];
    },
    useRef(initial) {
      const i = refIndex++;
      return (refs[i] ||= { current: initial });
    },
    useId: () => 'vrp-test',
    useMemo(factory, deps) {
      const i = memoIndex++;
      const prev = memos[i];
      if (!prev || !deps || deps.some((d, idx) => d !== prev.deps[idx])) {
        memos[i] = { deps, value: factory() };
      }
      return memos[i].value;
    },
    useEffect() {},
    maplibregl: {
      setWorkerUrl() {},
      Map: MockMap,
      Marker: MockMarker,
      NavigationControl: class {},
      LngLatBounds: class { extend() {} },
    },
    maplibreWorkerUrl: 'mock-worker.mjs',
    LUZON_BOUNDS: [[119.4, 12.1], [124.3, 19.0]],
    LUZON_CENTER: [121.05, 15.35],
    LUZON_MIN_ZOOM: 6.5,
    LUZON_MAX_ZOOM: 17,
    getMapTilerKey: () => apiKey,
    toPoint: (lat, lng) => {
      if (lat == null || lng == null || lat === '' || lng === '') return null;
      const la = Number(lat);
      const ln = Number(lng);
      return Number.isFinite(la) && Number.isFinite(ln) ? { lat: la, lng: ln } : null;
    },
    nudgeCoordinate: (lat, lng, dir, m = 25) => ({
      lat: dir === 'North' ? lat + m / 111320 : lat,
      lng,
    }),
    reverseGeocodeLuzon: async () => null,
    searchLuzonPlaces: async () => [],
    Promise,
    AbortController,
    Math,
    Number,
    String,
    Array,
    Object,
    Boolean,
    setTimeout,
    clearTimeout,
  });

  const compiled =
    code
      .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?$/gm, '')
      .replace(/^import\s+['"][^'"]+['"];?$/gm, '')
      .replace('export default function', 'function') +
    '\nthis.Component = VisualRoutePinPicker;';
  vm.runInContext(compiled, context);

  const render = (nextProps = props) => {
    stateIndex = 0;
    refIndex = 0;
    memoIndex = 0;
    return context.Component(nextProps);
  };

  return { render };
}

test('VisualRoutePinPicker renders badges, labels, status chips, and zero number inputs', async () => {
  const ui = await mountPicker({
    props: {
      origin: { lat: 15.48914, lng: 120.961683, label: 'Pickup (Origin)', badge: 'P', addressHint: 'Cabanatuan City' },
      destination: { lat: '', lng: '', label: 'Destination (Drop-off)', badge: 'D', addressHint: 'Address not specified' },
    },
  });

  const tree = ui.render();
  const text = JSON.stringify(tree);

  assert.ok(text.includes('Pickup (Origin)'));
  assert.ok(text.includes('Destination (Drop-off)'));
  assert.ok(text.includes('Pin placed'));
  assert.ok(text.includes('Pin needed'));
  assert.ok(text.includes('Cabanatuan City'));
  assert.ok(text.includes('Address not specified'));

  const numberInputs = find(tree, (n) => n.type === 'input' && n.props?.type === 'number');
  assert.equal(numberInputs.length, 0, 'Must never render raw numeric coordinate inputs');
});

test('VisualRoutePinPicker exposes keyboard North/South/East/West nudge controls in Adjust mode', async () => {
  const updates = [];
  const props = {
    origin: { lat: 15.0, lng: 121.0, label: 'Pickup', badge: 'P' },
    destination: { lat: 14.6, lng: 120.98, label: 'Destination', badge: 'D' },
    onChangePoint: (slot, point) => updates.push({ slot, point }),
  };

  const ui = await mountPicker({ props });
  let tree = ui.render(props);

  const adjustBtn = find(tree, (n) => n.type === 'button' && n.children?.includes('Adjust pin'))[0];
  assert.ok(adjustBtn, 'Adjust pin button rendered');
  adjustBtn.props.onClick();

  tree = ui.render(props);
  const northBtn = find(tree, (n) => n.type === 'button' && n.children?.includes('North'))[0];
  assert.ok(northBtn, 'North nudge button rendered when adjusting');
  northBtn.props.onClick();

  assert.equal(updates.length, 1);
  assert.equal(updates[0].slot, 'origin');
  assert.ok(updates[0].point.lat > 15.0, 'North nudge increases latitude');
});

test('VisualRoutePinPicker renders role="alert" fallback when API key is missing', async () => {
  const ui = await mountPicker({
    apiKey: '',
    props: {
      origin: { lat: 15.0, lng: 121.0, label: 'Pickup', badge: 'P' },
      destination: { lat: 14.6, lng: 120.98, label: 'Destination', badge: 'D' },
    },
  });

  const tree = ui.render();
  const alerts = find(tree, (n) => n.props?.role === 'alert');
  assert.equal(alerts.length, 1);
  assert.ok(JSON.stringify(alerts[0]).includes('Map preview unavailable. Use place search to set each pin.'));
});
