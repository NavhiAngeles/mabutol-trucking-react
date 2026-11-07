import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
}

async function mountOfficeQuoteForm({ request, onQuoted = () => {}, disabled = false, serviceMock } = {}) {
  const { code } = await transformWithOxc(
    fs.readFileSync(new URL('./OfficeQuoteForm.jsx', import.meta.url), 'utf8'),
    'OfficeQuoteForm.jsx',
    { jsx: { runtime: 'classic' } }
  );

  const states = [];
  const refs = [];
  let index = 0;
  let refIndex = 0;

  const mockService = serviceMock || {
    calculateRoute: async form => ({
      ...form,
      distance_km: 81.1,
      duration_minutes: 90,
      source: 'provider',
      geometry: { type: 'LineString', coordinates: [[120.961683, 15.48914], [120.901689, 14.823334]] }
    }),
    prepareQuote: async () => ({ ok: true })
  };

  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState(initial) {
      const i = index++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef(initial) {
      const i = refIndex++;
      return refs[i] ||= { current: initial };
    },
    deliveryWorkflowService: () => mockService
  });

  const modified = code
    .replace(/^import .*;$/gm, '')
    .replace('export default function', 'function') + '\nthis.render = OfficeQuoteForm;';

  vm.runInContext(modified, context);

  const render = () => {
    index = 0;
    refIndex = 0;
    return context.render({ request, onQuoted, disabled });
  };

  return { render, states, mockService };
}

test('OfficeQuoteForm displays actual pickup and destination addresses with origin and drop-off badges', async () => {
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
    route_geometry: { type: 'LineString', coordinates: [] }
  };

  const ui = await mountOfficeQuoteForm({ request: sampleRequest });
  const tree = ui.render();

  const text = JSON.stringify(tree);
  assert.ok(text.includes('Pickup (Origin)'), 'Contains Pickup (Origin) badge');
  assert.ok(text.includes('Destination (Drop-off)'), 'Contains Destination (Drop-off) badge');
  assert.ok(text.includes('FXQ6+MMF, Rizal Street, Rizdelis, Cabanatuan City'), 'Contains actual pickup address');
  assert.ok(text.includes('RWF2+697, MacArthur Hwy, Balagtas, Bulacan'), 'Contains actual destination address');

  // Verify inputs are grouped and populated
  const inputs = find(tree, n => n.type === 'input');
  const latInputs = inputs.filter(i => i.props.type === 'number');
  assert.ok(latInputs.length >= 4, 'Has coordinate and metric inputs');

  const pickupLat = latInputs.find(i => i.props.value === 15.48914);
  const pickupLng = latInputs.find(i => i.props.value === 120.961683);
  const dropoffLat = latInputs.find(i => i.props.value === 14.823334);
  const dropoffLng = latInputs.find(i => i.props.value === 120.901689);

  assert.ok(pickupLat, 'Pickup latitude input populated');
  assert.ok(pickupLng, 'Pickup longitude input populated');
  assert.ok(dropoffLat, 'Destination latitude input populated');
  assert.ok(dropoffLng, 'Destination longitude input populated');
});

test('OfficeQuoteForm handles missing address gracefully with fallback text', async () => {
  const emptyRequest = {
    id: 'shp-456'
  };

  const ui = await mountOfficeQuoteForm({ request: emptyRequest });
  const tree = ui.render();
  const text = JSON.stringify(tree);

  assert.ok(text.includes('Address not specified'), 'Falls back to Address not specified');
});

test('OfficeQuoteForm runs calculateRoute and prepareQuote actions', async () => {
  let routeCalculated = false;
  let quotePrepared = false;
  let quotedCallbackCalled = false;

  const mockService = {
    calculateRoute: async form => {
      routeCalculated = true;
      return {
        ...form,
        distance_km: 75.5,
        duration_minutes: 80,
        source: 'provider',
        geometry: { type: 'LineString', coordinates: [[120, 15], [121, 14]] }
      };
    },
    prepareQuote: async () => {
      quotePrepared = true;
      return { ok: true };
    }
  };

  const sampleRequest = {
    id: 'shp-123',
    pickup_address: 'Cabanatuan City',
    dropoff_address: 'Balagtas, Bulacan',
    pickup_lat: 15.48914,
    pickup_lng: 120.961683,
    dropoff_lat: 14.823334,
    dropoff_lng: 120.901689,
    updated_at: '2026-11-07T12:00:00Z'
  };

  const ui = await mountOfficeQuoteForm({
    request: sampleRequest,
    onQuoted: () => { quotedCallbackCalled = true; },
    serviceMock: mockService
  });

  let tree = ui.render();
  const calcBtn = find(tree, n => n.type === 'button' && n.children?.includes('Calculate provider route'))[0];
  assert.ok(calcBtn, 'Found Calculate provider route button');

  await calcBtn.props.onClick();
  assert.equal(routeCalculated, true, 'calculateRoute was called');

  tree = ui.render();
  const saveBtn = find(tree, n => n.type === 'button' && n.props.className === 'btn-primary')[0];
  assert.ok(saveBtn, 'Found Save calculated quotation button');
  assert.equal(saveBtn.props.disabled, false, 'Save button is enabled after route calculation has geometry');

  await saveBtn.props.onClick();
  assert.equal(quotePrepared, true, 'prepareQuote was called');
  assert.equal(quotedCallbackCalled, true, 'onQuoted callback was executed');
});

