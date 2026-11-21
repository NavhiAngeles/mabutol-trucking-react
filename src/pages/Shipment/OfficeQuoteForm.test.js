import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithEsbuild } from 'vite';

function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...(node.children || []).flat(Infinity).flatMap((child) => find(child, predicate)),
  ];
}

const stripImports = (code) =>
  code
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];?$/gm, '');

async function mountOfficeQuoteForm({
  request,
  onQuoted = () => {},
  onRouteCalculated = () => {},
  disabled = false,
  serviceMock,
  quotationSubmitMock,
} = {}) {
  const { code } = await transformWithEsbuild(
    fs.readFileSync(new URL('./OfficeQuoteForm.jsx', import.meta.url), 'utf8'),
    'OfficeQuoteForm.jsx',
    { loader: 'jsx', jsx: 'transform' }
  );

  const states = [];
  const refs = [];
  const memos = [];
  const effects = [];
  let index = 0;
  let refIndex = 0;
  let memoIndex = 0;
  let effectIndex = 0;
  let pendingEffects = [];

  const mockService = serviceMock || {
    calculateRoute: async (form) => ({
      ...form,
      distance_km: 81.1,
      duration_minutes: 90,
      source: 'provider',
      geometry: {
        type: 'LineString',
        coordinates: [
          [120.961683, 15.48914],
          [120.901689, 14.823334],
        ],
      },
    }),
    routeData: (form) => ({
      pickup_lat: Number(form.pickup_lat),
      pickup_lng: Number(form.pickup_lng),
      dropoff_lat: Number(form.dropoff_lat),
      dropoff_lng: Number(form.dropoff_lng),
      distance_km: Number(form.distance_km),
      duration_minutes: Number(form.duration_minutes),
      source: form.source,
      reason: form.source === 'manual' ? form.reason : null,
      geometry: form.geometry,
    }),
    prepareQuote: async () => ({ ok: true }),
  };

  const FRAGMENT = Symbol.for('react.fragment');
  const context = vm.createContext({
    React: {
      Fragment: FRAGMENT,
      createElement: (type, props, ...children) => {
        const flat = children.flat(Infinity);
        if (type === FRAGMENT) return flat;
        if (typeof type === 'function') {
          return type({ ...(props || {}), children: flat });
        }
        return {
          type,
          props: props || {},
          children: flat,
        };
      },
    },
    useState(initial) {
      const i = index++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
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
    useCallback(fn) {
      return fn;
    },
    useMemo(factory, deps) {
      const i = memoIndex++;
      const prev = memos[i];
      if (!prev || !deps || deps.some((d, j) => d !== prev.deps[j])) {
        memos[i] = { deps, value: factory() };
      }
      return memos[i].value;
    },
    useEffect(effect, deps) {
      const i = effectIndex++;
      const prev = effects[i];
      if (!prev || !deps || deps.some((d, j) => d !== prev.deps[j])) {
        pendingEffects.push(() => {
          prev?.cleanup?.();
          effects[i] = { deps, cleanup: effect() };
        });
      }
    },
    useAuth: () => ({ user: { id: 'office-user-1' } }),
    deliveryWorkflowService: () => mockService,
    calculateFtlQuote: ({ distanceKm, tollAmount, deadheadKm, overrideTotalAmount }) => ({
      linehaulAmount: distanceKm * 50,
      tollAmount,
      deadheadKm,
      excessDeadheadKm: 0,
      suggestedMobilizationFee: 0,
      mobilizationFee: 0,
      quotedAmount: distanceKm * 50 + tollAmount,
      finalAmount: overrideTotalAmount != null ? overrideTotalAmount : distanceKm * 50 + tollAmount,
    }),
    fetchRankedTrucksForShipment: async () => [],
    formatProjectedAvailability: () => '',
    formatScheduleFeasibility: () => ({ tone: 'ready', label: 'Ready', detail: '' }),
    submitOfficeQuotation: quotationSubmitMock || (async () => ({ ok: true })),
    getTollGates: async () => [],
    automaticTollQuote: () => null,
    calculateEstimatedArrival: () => null,
    resolveVehicleLoadingBufferMinutes: () => 0,
    VisualRoutePinPicker: (props) => ({ type: 'VisualRoutePinPicker', props, children: [] }),
    setInterval: () => 1,
    clearInterval: () => {},
    Intl,
    Date,
    Number,
    Math,
    String,
    Array,
    Object,
    Boolean,
    Promise,
    Set,
  });

  const modified =
    stripImports(code).replace('export default function', 'function') +
    '\nthis.render = OfficeQuoteForm;';

  vm.runInContext(modified, context);

  const render = () => {
    index = 0;
    refIndex = 0;
    memoIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    const tree = context.render({ request, onQuoted, onRouteCalculated, disabled });
    pendingEffects.forEach((run) => run());
    return tree;
  };

  return { render, states, mockService };
}

test('OfficeQuoteForm passes pickup and destination pins and addresses to VisualRoutePinPicker without raw coordinate inputs', async () => {
  const sampleRequest = {
    id: 'shp-123',
    pickup_address: 'FXQ6+MMF, Rizal Street, Rizdelis, Cabanatuan City, Nueva Ecija, Philippines',
    dropoff_address: 'RWF2+697, MacArthur Hwy, Balagtas, Bulacan, Philippines',
    pickup_lat: 15.48914,
    pickup_lng: 120.961683,
    dropoff_lat: 14.823334,
    dropoff_lng: 120.901689,
    distance_km: 81.1,
    route_duration_minutes: 90,
    route_source: 'provider',
    route_geometry: { type: 'LineString', coordinates: [] },
  };

  const ui = await mountOfficeQuoteForm({ request: sampleRequest });
  const tree = ui.render();

  const pickers = find(tree, (n) => n.type === 'VisualRoutePinPicker');
  assert.equal(pickers.length, 1, 'Renders VisualRoutePinPicker');
  const picker = pickers[0];

  assert.equal(picker.props.origin.label, 'Pickup (Origin)');
  assert.equal(picker.props.destination.label, 'Destination (Drop-off)');
  assert.ok(picker.props.origin.addressHint.includes('FXQ6+MMF, Rizal Street, Rizdelis, Cabanatuan City'));
  assert.ok(picker.props.destination.addressHint.includes('RWF2+697, MacArthur Hwy, Balagtas, Bulacan'));
  assert.equal(picker.props.origin.lat, 15.48914);
  assert.equal(picker.props.origin.lng, 120.961683);
  assert.equal(picker.props.destination.lat, 14.823334);
  assert.equal(picker.props.destination.lng, 120.901689);

  const numberInputs = find(tree, (n) => n.type === 'input' && n.props.type === 'number');
  for (const val of [15.48914, 120.961683, 14.823334, 120.901689]) {
    assert.equal(
      numberInputs.some((i) => Number(i.props.value) === val),
      false,
      `No number input should expose coordinate ${val}`
    );
  }
});

test('OfficeQuoteForm handles missing address gracefully with fallback text', async () => {
  const emptyRequest = {
    id: 'shp-456',
  };

  const ui = await mountOfficeQuoteForm({ request: emptyRequest });
  const tree = ui.render();
  const picker = find(tree, (n) => n.type === 'VisualRoutePinPicker')[0];

  assert.equal(picker.props.origin.addressHint, 'Address not specified');
  assert.equal(picker.props.destination.addressHint, 'Address not specified');
});

test('OfficeQuoteForm calculates provider route, updates VisualRoutePinPicker geometry, and submits quotation', async () => {
  let routeCalculated = false;
  let submittedPayload = null;
  let quotedCallbackCalled = false;

  const calculatedGeometry = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[120, 15], [121, 14]] } }],
  };

  const mockService = {
    calculateRoute: async (form) => {
      routeCalculated = true;
      return {
        ...form,
        distance_km: 75.5,
        duration_minutes: 80,
        source: 'provider',
        geometry: calculatedGeometry,
      };
    },
    routeData: (form) => ({
      pickup_lat: Number(form.pickup_lat),
      pickup_lng: Number(form.pickup_lng),
      dropoff_lat: Number(form.dropoff_lat),
      dropoff_lng: Number(form.dropoff_lng),
      distance_km: Number(form.distance_km),
      duration_minutes: Number(form.duration_minutes),
      source: form.source,
      reason: null,
      geometry: form.geometry,
    }),
  };

  const sampleRequest = {
    id: 'shp-123',
    pickup_address: 'Cabanatuan City',
    dropoff_address: 'Balagtas, Bulacan',
    pickup_lat: 15.48914,
    pickup_lng: 120.961683,
    dropoff_lat: 14.823334,
    dropoff_lng: 120.901689,
    weight_kg: 3000,
    scheduled_departure: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    pricing_rate: {
      id: 'rate-1',
      base_rate: 1000,
      per_km_rate: 45,
      per_kg_rate: 0,
      min_charge: 2000,
      free_deadhead_km: 30,
      deadhead_per_km_rate: 25,
    },
    updated_at: '2026-11-07T12:00:00Z',
  };

  const ui = await mountOfficeQuoteForm({
    request: sampleRequest,
    onQuoted: () => {
      quotedCallbackCalled = true;
    },
    serviceMock: mockService,
    quotationSubmitMock: async (payload) => {
      submittedPayload = payload;
      return { ok: true };
    },
  });

  let tree = ui.render();
  const calcBtn = find(tree, (n) => n.type === 'button' && n.children?.includes('Calculate provider route'))[0];
  assert.ok(calcBtn, 'Found Calculate provider route button');

  await calcBtn.props.onClick();
  assert.equal(routeCalculated, true, 'calculateRoute was called');

  tree = ui.render();
  const pickerAfterCalc = find(tree, (n) => n.type === 'VisualRoutePinPicker')[0];
  assert.deepEqual(pickerAfterCalc.props.routeGeometry, calculatedGeometry, 'Picker receives calculated routeGeometry');

  const saveBtn = find(tree, (n) => n.type === 'button' && n.props.className === 'btn-primary')[0];
  assert.ok(saveBtn, 'Found Submit official quote button');
  assert.equal(saveBtn.props.disabled, false, 'Submit button is enabled after route calculation');

  await saveBtn.props.onClick();
  assert.ok(submittedPayload, 'submitOfficeQuotation was called');
  assert.equal(submittedPayload.routeUpdates.pickup_lat, 15.48914);
  assert.equal(submittedPayload.routeUpdates.dropoff_lng, 120.901689);
  assert.equal(quotedCallbackCalled, true, 'onQuoted callback was executed');
});
