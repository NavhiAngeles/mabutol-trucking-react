import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { vehicleCanCarry, vehicleFitsShipmentWeight, classifyVehicleWeightFit, vehicleBaseRate, bookingDefaults } from "../../services/vehiclePricing.js";
import { shipmentRouteFields } from "../../services/shipmentRoute.js";
import { withBookingPricing } from '../../services/tollPricing.js';

const source = await readFile(new URL("./CreateShipmentDrawer.jsx", import.meta.url), "utf8");

test('submission rechecks customer role eligibility before pricing or inserting a shipment', async () => {
  const start = source.indexOf('const billingCustomers = await fetchBillingCustomers();');
  const end = source.indexOf('const currentPricing = await fetchPricingData();', start);
  const run = new Function('fetchBillingCustomers', 'selectedCustomer', `return async () => {${source.slice(start, end)}};`);
  await run(async () => [{ id: 'customer' }], { id: 'customer' })();
  await assert.rejects(run(async () => [], { id: 'converted-driver' })(), /no longer eligible for billing/);
  await assert.rejects(run(async () => { throw Error('Role lookup failed'); }, { id: 'customer' })(), /Role lookup failed/);
});

test('actual booking payload persists driver instructions, preserves multiline text and normalizes blank notes', async () => {
  const start = source.indexOf('const shipmentData = {');
  const end = source.indexOf('setCreatedShipment(data);', start);
  assert.ok(start > 0 && end > start);
  const notes = ['  Call before arrival.\nUse the rear loading gate.  ', '', '   \n  ', '<script>plain text only</script>'];
  for (const driverNotes of notes) {
    let payload;
    const scope = {
      form: { driverNotes, cargoDescription: 'Boxes', weight: '500', specialHandling: 'None', distanceKm: '10', estimatedMinutes: '30', overrideAmount: '' },
      shipmentRouteFields, withBookingPricing, tollEstimate: { total: 0, rates: [] }, confirmedPickup: { lat: 14.6, lng: 120.96 }, confirmedDestination: { lat: 14.8, lng: 121.1 },
      routeGeoJSON: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[120.96, 14.6], [121.1, 14.8]] } }] },
      selectedCustomer: { id: 'customer' }, currentVehicle: { id: 'vehicle', pricing: { id: 'rate' } },
      detailedAddress: () => 'Test address', departure: new Date('2026-10-25T00:00:00Z'), suggestedCharge: 2500,
      createShipment: async value => { payload = value; return { id: 'shipment', ...value }; },
    };
    const run = new Function(...Object.keys(scope), `return async () => {${source.slice(start, end)}};`)(...Object.values(scope));
    await run();
    assert.equal(payload.driver_notes, driverNotes.trim() || null);
    assert.equal(payload.status, 'booked');
    assert.equal(payload.pickup_lat, 14.6);
    assert.equal(payload.pickup_lng, 120.96);
    assert.equal(payload.dropoff_lat, 14.8);
    assert.equal(payload.dropoff_lng, 121.1);
    assert.equal(payload.route_duration_minutes, 30);
    assert.equal(payload.route_source, 'provider');
    assert.equal(payload.route_geometry.type, 'FeatureCollection');
  }
});

test('actual booking payload persists confirmed route geometry, toll fees, driver allowance, and creator actor', async () => {
  const start = source.indexOf('const shipmentData = {');
  const end = source.indexOf('setCreatedShipment(data);', start);
  assert.ok(start > 0 && end > start);

  let payload;
  const scope = {
    form: {
      driverNotes: 'Call client', cargoDescription: 'Electronics', weight: '2500',
      specialHandling: 'Fragile', distanceKm: '45', estimatedMinutes: '60',
      overrideAmount: '', driverAllowance: '650', usesTollRoad: true,
    },
    shipmentRouteFields, withBookingPricing,
    tollEstimate: { total: 211, rates: [{ id: 'r1', highway: 'NLEX', fee: 211 }], vehicleClass: 'Class 2' },
    confirmedPickup: { lat: 14.6, lng: 120.96 },
    confirmedDestination: { lat: 14.8, lng: 121.1 },
    routeGeoJSON: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[120.96, 14.6], [121.1, 14.8]] } }] },
    selectedCustomer: { id: 'cust-123' },
    currentVehicle: { id: 'veh-456', pricing: { id: 'rate-789' } },
    detailedAddress: () => 'Bulacan to Manila',
    departure: new Date('2026-11-08T00:00:00Z'),
    suggestedCharge: 5200,
    user: { id: 'office-user-uuid' },
    createShipment: async value => { payload = value; return { id: 'shp-1', ...value }; },
  };

  const run = new Function(...Object.keys(scope), `return async () => {${source.slice(start, end)}};`)(...Object.values(scope));
  await run();

  assert.equal(payload.driver_allowance, 650);
  assert.equal(payload.toll_fees, 211);
  assert.equal(payload.created_by, 'office-user-uuid');
  assert.equal(payload.route_duration_minutes, 60);
  assert.equal(payload.route_source, 'provider');
  assert.equal(payload.route_geometry.booking_pricing.toll_amount, 211);
  assert.equal(payload.route_geometry.booking_pricing.toll_preference, 'expressway');
});
function handler(name) {
  const match = source.match(new RegExp(`const ${name} = \\(\\) => \\{([\\s\\S]*?)\\n  \\};`));
  assert.ok(match, `Actual ${name} handler found`);
  return `const ${name} = () => {${match[1]}\n};`;
}

test('actual pricing load initializes allowance and draft baseline without overwriting edited allowance', () => {
  const start = source.indexOf('const defaults = bookingDefaults(data.settings);');
  const end = source.indexOf('setHandlingRates(data.settings.handling_surcharges', start);
  const body = source.slice(start, end);
  for (const edited of [false, true]) {
    const state = { form: { cargoDescription: 'Draft', driverAllowance: '0' } };
    const draftInitial = { current: { driverAllowance: '0' } };
    const run = new Function('data', 'bookingDefaults', 'setPricingDefaults', 'allowanceEdited', 'draftInitial', 'INITIAL_FORM', 'setForm', body);
    run({ settings: { minimum_booking_fee: 3000, driver_allowance: 250 } }, bookingDefaults,
      defaults => { state.defaults = defaults; }, { current: edited }, draftInitial, { driverAllowance: '0' }, update => { state.form = update(state.form); });
    assert.equal(state.defaults.minimumBookingFee, 3000);
    assert.equal(state.form.cargoDescription, 'Draft');
    assert.equal(state.form.driverAllowance, edited ? '0' : '250');
    assert.equal(draftInitial.current.driverAllowance, edited ? '0' : '250');
  }
});

test('submit rechecks global minimum/default allowance and retains explicit allowance override', async () => {
  const start = source.indexOf('const currentPricing = await fetchPricingData();');
  const end = source.indexOf('const departureError = validateDeparture', start);
  const body = source.slice(start, end);
  for (const edited of [false, true]) {
    const vehicle = { id: 'v', is_active: true, default_capacity_kg: 2500, pricing: { id: 'r', vehicle_type_id: 'v', is_active: true, min_charge: 2500, per_km_rate: 45 } };
    const state = { form: { selectedVehicle: 'v', distanceKm: '10', weight: '2000', driverAllowance: edited ? '999' : '100' } };
    const scope = {
      fetchPricingData: async () => ({ vehicles: [vehicle], settings: { minimum_booking_fee: edited ? 3000 : 4000, driver_allowance: 200, handling_surcharges: {} } }),
      bookingDefaults, vehicleBaseRate, vehicleCanCarry,
      form: state.form, selectedVehicle: vehicle, baseRate: 3000, handlingCharge: 0, handlingCost: () => 0,
      pricingDefaults: { minimumBookingFee: 3000, driverAllowance: 100 }, allowanceEdited: { current: edited },
      INITIAL_FORM: {}, draftInitial: { current: {} }, setVehicles() {}, setHandlingRates() {},
      setPricingDefaults: value => { state.defaults = value; }, setForm: update => { state.form = update(state.form); },
    };
    const run = new Function(...Object.keys(scope), `return async () => {${body}};`)(...Object.values(scope));
    if (edited) { await run(); assert.equal(state.form.driverAllowance, '999'); }
    else { await assert.rejects(run(), /pricing has changed/); assert.equal(state.form.driverAllowance, '200'); assert.equal(state.defaults.minimumBookingFee, 4000); }
  }
});

test('automatic allowance baseline does not make pristine draft dirty', () => {
  const scope = {
    isSaving: false, createdShipment: null, INITIAL_FORM: { driverAllowance: '0' },
    form: { driverAllowance: '250' }, draftInitial: { current: { driverAllowance: '250' } },
    confirmedPickup: null, confirmedDestination: null,
    window: { confirm() { assert.fail('Automatic default must not prompt discard'); } },
    reset() {}, onClose() {},
  };
  new Function(...Object.keys(scope), `${handler('handleCloseAll')}\nhandleCloseAll();`)(...Object.values(scope));
});

function closeFlow({ dirty = false, coordinates = false, saving = false, booked = false, discard = false } = {}) {
  const state = { resets: 0, closes: 0, prompts: 0 };
  const scope = {
    INITIAL_FORM: { cargoDescription: '', driverNotes: '', usesTollRoad: false },
    draftInitial: { current: { cargoDescription: '', driverNotes: '', usesTollRoad: false } },
    form: { cargoDescription: dirty ? 'Keep my cargo' : '', driverNotes: '', usesTollRoad: false },
    confirmedPickup: coordinates ? { lat: 15, lng: 120 } : null,
    confirmedDestination: null,
    isSaving: saving,
    createdShipment: booked ? { id: 'saved' } : null,
    setShowDiscardDialog(open) { if (open) state.prompts++; },
    reset() { state.resets++; },
    onClose() { state.closes++; },
  };
  const close = new Function(...Object.keys(scope), `${handler('handleDiscard')}\n${handler('handleCloseAll')}\nreturn () => { handleCloseAll(); ${discard ? 'handleDiscard();' : ''} };`)(...Object.values(scope));
  return { state, close };
}

test('Back preserves dirty draft when discard is canceled and closes only after confirmation', () => {
  const canceled = closeFlow({ dirty: true }); canceled.close();
  assert.deepEqual(canceled.state, { resets: 0, closes: 0, prompts: 1 });
  const discarded = closeFlow({ dirty: true, discard: true }); discarded.close();
  assert.deepEqual(discarded.state, { resets: 1, closes: 1, prompts: 1 });
});

test('confirmed coordinates also trigger discard protection', () => {
  const flow = closeFlow({ coordinates: true }); flow.close();
  assert.deepEqual(flow.state, { resets: 0, closes: 0, prompts: 1 });
});

test('pristine and successfully booked forms close without discard prompt; saving blocks close', () => {
  for (const options of [{}, { dirty: true, booked: true }]) {
    const flow = closeFlow(options); flow.close();
    assert.deepEqual(flow.state, { resets: 1, closes: 1, prompts: 0 });
  }
  const saving = closeFlow({ dirty: true, saving: true }); saving.close();
  assert.deepEqual(saving.state, { resets: 0, closes: 0, prompts: 0 });
});
// Execute actual validator/Next bodies with real capacity helpers and isolated UI state.
function booking({ step = 2, weight = "3000", capacity = 4000, busy = false, routeError = "", scheduleError = "", baseRate = 500, description = "Cargo", vehicle = true } = {}) {
  const state = { step, error: "previous error" };
  const scope = {
    form: { weight, cargoDescription: description },
    selectedVehicle: vehicle ? { is_active: true, default_capacity_kg: capacity } : null,
    baseRate, vehicleCanCarry, vehicleFitsShipmentWeight,
    currentStep: step, isResolvingAddress: busy, isCalculatingRoute: false,
    validateRoute: () => routeError,
    validateSchedule: () => scheduleError,
    setStepSubmitted: () => {},
    focusFirstInvalidField: () => {},
    setSaveError: value => { state.error = value; },
    setCurrentStep: update => { state.step = update(state.step); },
  };
  const api = new Function(...Object.keys(scope), `${handler("validateCargo")}\n${handler("handleNext")}\nreturn { validateCargo, handleNext };`)(...Object.values(scope));
  return { state, ...api };
}

test("valid route advances before cargo/vehicle selection without throwing", () => {
  const flow = booking({ step: 1, weight: "", vehicle: false });
  assert.doesNotThrow(() => flow.handleNext());
  assert.equal(flow.state.step, 2);
  assert.equal(flow.state.error, "");
});
for (const weight of ["1500", "1999", "2000", "3000", "4000"]) {
  test(`valid cargo ${weight}kg advances within truck capacity including light bulky FTL loads`, () => {
    const flow = booking({ weight });
    assert.equal(flow.validateCargo(), "");
    assert.doesNotThrow(() => flow.handleNext());
    assert.equal(flow.state.step, 3);
    assert.equal(flow.state.error, "");
  });
}
for (const weight of ["4001", "", "0", "-1", "invalid", "Infinity"]) {
  test(`invalid cargo ${weight} blocks advance and exposes validator error`, () => {
    const flow = booking({ weight });
    const error = flow.validateCargo();
    assert.ok(error);
    flow.handleNext();
    assert.equal(flow.state.step, 2);
    assert.equal(flow.state.error, error);
  });
}
for (const options of [
  { vehicle: false },
  { baseRate: null },
  { description: "" },
  { busy: true },
  { step: 1, routeError: "Destination required" },
  { step: 2, scheduleError: "Scheduled departure must be at least 48 hours in advance (Philippine time)." },
]) {
  test(`existing validation blocks advance: ${JSON.stringify(options)}`, () => {
    const flow = booking(options);
    flow.handleNext();
    assert.equal(flow.state.step, options.step ?? 2);
    assert.ok(flow.state.error);
  });
}

test('classifyVehicleWeightFit classifies best_fit, oversized bulky FTL, and overweight accurately', () => {
  const truck6w = { is_active: true, default_capacity_kg: 6000 };
  assert.equal(classifyVehicleWeightFit(truck6w, ''), 'missing_weight');
  assert.equal(classifyVehicleWeightFit(truck6w, '5000'), 'best_fit');
  assert.equal(classifyVehicleWeightFit(truck6w, '1500'), 'oversized');
  assert.equal(classifyVehicleWeightFit(truck6w, '6001'), 'overweight');
});

test('HUBS presets define instant Luzon road coordinates without live geocode latency', () => {
  assert.match(source, /MICT Manila[\s\S]*?coords:\s*\{\s*lat:\s*14\.\d+,\s*lng:\s*120\.\d+\s*\}/);
  assert.match(source, /Subic Port[\s\S]*?coords:\s*\{\s*lat:\s*14\.\d+,\s*lng:\s*120\.\d+\s*\}/);
});

test('Add shipment drawer uses native modal dialog for success without ARIA redundancy and contains zero em dashes', async () => {
  assert.match(source, /<dialog\s+ref=\{successDialogRef\}\s+className="shipment-success-dialog"/);
  assert.doesNotMatch(source, /<dialog[^>]*role="dialog"/);
  assert.doesNotMatch(source, /<dialog[^>]*aria-modal=/);
  const files = [
    new URL('./CreateShipmentDrawer.jsx', import.meta.url),
    new URL('./CustomerCombobox.jsx', import.meta.url),
    new URL('./AddressAutocomplete.jsx', import.meta.url),
    new URL('./TollPricingPanel.jsx', import.meta.url),
  ];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    assert.equal(content.includes('—'), false, `Unexpected em dash in ${file.pathname}`);
  }
});

test('Step 2 vehicle selection and Step 3 review render vehicle silhouette with category mapping', () => {
  assert.ok(source.includes('<SafeVehicleSilhouette category={truck.name} size="md" />'));
  assert.ok(source.includes('<SafeVehicleSilhouette category={selectedVehicle?.name} size="md" />'));
});

test('createShipment.css defines min(420px, 100vw) responsiveness on narrow viewports', async () => {
  const css = await readFile(new URL("./createShipment.css", import.meta.url), "utf8");
  assert.ok(css.includes('width: min(420px, 100vw);'));
  assert.ok(css.includes('@media (max-width: 420px)'));
  assert.ok(css.includes('max-width: 100vw;'));
});

test('CreateShipmentDrawer manages launcher focus restoration and Tab focus containment', () => {
  assert.ok(source.includes('const launcherRef = useRef(null);'));
  assert.ok(source.includes('const drawerRef = useRef(null);'));
  assert.ok(source.includes('launcherRef.current = document.activeElement;'));
  assert.ok(source.includes('launcherRef.current.focus();'));
  assert.ok(source.includes('role="dialog"'));
  assert.ok(source.includes('aria-modal="true"'));
  assert.ok(source.includes('onKeyDown={handleKeyDown}'));

  const match = source.match(/const handleKeyDown = \(event\) => \{([\s\S]*?)\n {2}\};/);
  assert.ok(match, 'handleKeyDown found');
  let closed = false, prevented, focusedElement = null;
  const btnFirst = { offsetWidth: 10, offsetHeight: 10, focus() { focusedElement = btnFirst; } };
  const btnLast = { offsetWidth: 10, offsetHeight: 10, focus() { focusedElement = btnLast; } };
  const controls = [btnFirst, btnLast];
  const container = {
    contains(el) { return controls.includes(el); },
    querySelectorAll() { return controls; },
    querySelector() { return null; },
    focus() { focusedElement = container; }
  };
  const scope = {
    showDiscardDialog: false,
    handleCloseAll: () => { closed = true; },
    drawerRef: { current: container }
  };
  const handleKeyDown = new Function(...Object.keys(scope), `return function handleKeyDown(event) { ${match[1]} };`)(...Object.values(scope));

  // Escape triggers close
  prevented = false;
  handleKeyDown({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.ok(closed);

  // Tab from last wraps to first
  prevented = false;
  globalThis.document = { activeElement: btnLast };
  handleKeyDown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(focusedElement, btnFirst);

  // Shift+Tab from first wraps to last
  prevented = false;
  globalThis.document = { activeElement: btnFirst };
  handleKeyDown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(focusedElement, btnLast);
});

test('calculateRoute falls back to ordinary road routing when corridor lacks substantial toll expressways', async () => {
  const start = source.indexOf('const calculateRoute = async () => {');
  const end = source.indexOf('Promise.resolve().then(() => {', start);
  assert.ok(start > 0 && end > start);

  let formState = { usesTollRoad: true, distanceKm: '', estimatedMinutes: '' };
  let routeGeo = null;
  let errorMsg = '';
  let noticeMsg = '';
  let isCalculating = false;

  const validGeometry = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[120.9, 14.8], [121.7, 17.6]] }
    }]
  };

  const scope = {
    setIsCalculatingRoute: val => { isCalculating = val; },
    setRouteError: err => { errorMsg = err; },
    setRouteNotice: n => { noticeMsg = n; },
    setRouteGeoJSON: geo => { routeGeo = geo; },
    setForm: updater => { formState = updater(formState); },
    confirmedPickup: { lat: 14.823, lng: 120.901 },
    confirmedDestination: { lat: 17.621, lng: 121.723 },
    form: formState,
    requestId: 1,
    routeIdRef: { current: 1 },
    controller: new AbortController(),
    routeControllerRef: { current: null },
    validCoordinate: ({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng),
    supabase: {
      functions: {
        invoke: async (fn, { body }) => {
          if (body.usesTollRoad === true) {
            return {
              error: {
                message: 'The provider returned no route with substantial toll expressway travel. Short ramps or toll links are not accepted. Adjust the entrances or uncheck Toll Road for ordinary roads.'
              }
            };
          }
          if (body.usesTollRoad === false) {
            // Suppose strict avoidance fails on minor access link
            return {
              error: {
                message: 'The provider could not verify a route avoiding toll roads. Adjust the entrances or enable Toll Road.'
              }
            };
          }
          // Standard road route succeeds
          return {
            data: {
              roadOnlyVerified: true,
              distanceKm: 425.4,
              estimatedMinutes: 520,
              geojson: validGeometry,
            }
          };
        }
      }
    }
  };

  const run = new Function(...Object.keys(scope), `return async () => { ${source.slice(start, end)}; await calculateRoute(); };`)(...Object.values(scope));
  await run();

  assert.equal(errorMsg, '');
  assert.equal(formState.usesTollRoad, false);
  assert.equal(formState.distanceKm, '425.4');
  assert.equal(formState.estimatedMinutes, '520');
  assert.equal(routeGeo, validGeometry);
  assert.equal(isCalculating, false);
  assert.match(noticeMsg, /No toll expressway available for this corridor/i);
});

test('calculateRoute succeeds on ordinary road journeys when strict avoidance fails on minor access links', async () => {
  const start = source.indexOf('const calculateRoute = async () => {');
  const end = source.indexOf('Promise.resolve().then(() => {', start);
  assert.ok(start > 0 && end > start);

  let formState = { usesTollRoad: false, distanceKm: '', estimatedMinutes: '' };
  let routeGeo = null;
  let errorMsg = '';

  const validGeometry = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[120.9, 14.8], [121.7, 17.6]] }
    }]
  };

  const scope = {
    setIsCalculatingRoute: () => {},
    setRouteError: err => { errorMsg = err; },
    setRouteNotice: () => {},
    setRouteGeoJSON: geo => { routeGeo = geo; },
    setForm: updater => { formState = updater(formState); },
    confirmedPickup: { lat: 14.823, lng: 120.901 },
    confirmedDestination: { lat: 17.621, lng: 121.723 },
    form: formState,
    requestId: 1,
    routeIdRef: { current: 1 },
    controller: new AbortController(),
    routeControllerRef: { current: null },
    validCoordinate: ({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng),
    supabase: {
      functions: {
        invoke: async (fn, { body }) => {
          if (body.usesTollRoad === false) {
            return {
              error: {
                message: 'The provider could not verify a route avoiding toll roads. Adjust the entrances or enable Toll Road.'
              }
            };
          }
          // Standard road query fallback
          return {
            data: {
              roadOnlyVerified: true,
              distanceKm: 425.4,
              estimatedMinutes: 520,
              geojson: validGeometry,
            }
          };
        }
      }
    }
  };

  const run = new Function(...Object.keys(scope), `return async () => { ${source.slice(start, end)}; await calculateRoute(); };`)(...Object.values(scope));
  await run();

  assert.equal(errorMsg, '');
  assert.equal(formState.usesTollRoad, false);
  assert.equal(formState.distanceKm, '425.4');
  assert.equal(formState.estimatedMinutes, '520');
  assert.equal(routeGeo, validGeometry);
});

test('formatRouteErrorMessage sanitizes transient ORS TCP connect errors and wires retry controls', () => {
  const start = source.indexOf('const formatRouteErrorMessage =');
  const end = source.indexOf('const customerName =', start);
  assert.ok(start > 0 && end > start);

  const fn = new Function(`${source.slice(start, end)}; return formatRouteErrorMessage;`)();

  const rawError = 'error sending request for url (https://api.heigit.org/openrouteservice/v2/directions/driving-hgv): client error (Connect): tcp connect error: Connection refused (os error 111)';
  const friendly = fn(rawError);
  assert.match(friendly, /temporarily unreachable/i);
  assert.doesNotMatch(friendly, /api\.heigit\.org|os error 111|tcp connect/i);

  const domainError = 'Select the port entrance road before routing.';
  assert.equal(fn(domainError), domainError);
  assert.equal(fn(''), '');

  assert.match(source, /handleRetryRoute/);
  assert.match(source, /className="route-retry-btn"/);
  assert.match(source, /calculateFallbackTruckRoute/);
});

test('Step 1 defers empty address validation until submit or outside group blur and suppresses errors during pin mode', () => {
  const start = source.indexOf('const handleFieldBlur = (key, event) => {');
  const end = source.indexOf('const focusFirstInvalidField = () => {', start);
  assert.ok(start > 0 && end > start);

  let touchedState = {};
  let announced = '';

  const runBlur = ({
    key,
    relatedTarget = null,
    pickerMode = null,
    pickupContains = false,
    destinationContains = false,
    form = { billingCustomer: '', pickupLocation: '', destination: '', cargoDescription: '', weight: '' },
    stepSubmitted = { 1: false, 2: false, 3: false },
    rawFieldErrors = { destination: 'Enter a delivery address or choose a port hub.' },
  }) => {
    touchedState = {};
    announced = '';
    const scope = {
      pickerMode,
      pickupGroupRef: { current: { contains: () => pickupContains } },
      destinationGroupRef: { current: { contains: () => destinationContains } },
      form,
      stepSubmitted,
      rawFieldErrors,
      FIELD_LABELS: { destination: 'Destination', pickupLocation: 'Pick-up location' },
      announceTimerRef: { current: null },
      setTouched: updater => { touchedState = updater(touchedState); },
      setLiveErrorAnnouncement: msg => { announced = msg; },
      clearTimeout,
      setTimeout: (fn) => { fn(); return 1; },
    };
    const fn = new Function(...Object.keys(scope), `${source.slice(start, end)}; return handleFieldBlur;`)(...Object.values(scope));
    fn(key, { relatedTarget });
  };

  // Focus moving from destination input to Pin destination / hub button within group must not touch field
  runBlur({ key: 'destination', destinationContains: true });
  assert.equal(touchedState.destination, undefined);

  // Blur on an empty untouched destination before clicking Continue must defer validation
  runBlur({ key: 'destination' });
  assert.equal(touchedState.destination, undefined);

  // Active picker mode suppresses error state
  runBlur({ key: 'destination', pickerMode: 'destination', stepSubmitted: { 1: true, 2: false, 3: false } });
  assert.equal(touchedState.destination, undefined);

  // Non-empty unpinned destination outside group marks touched cleanly
  runBlur({ key: 'destination', form: { billingCustomer: '', pickupLocation: '', destination: 'Capas', cargoDescription: '', weight: '' } });
  assert.equal(touchedState.destination, true);
  assert.match(announced, /Destination:/);

  assert.match(source, /const pickupHasErr =\s*pickerMode !== "pickup" && showFieldError\("pickupLocation", 1\);/);
  assert.match(source, /const destHasErr =\s*pickerMode !== "destination" && showFieldError\("destination", 1\);/);
});
