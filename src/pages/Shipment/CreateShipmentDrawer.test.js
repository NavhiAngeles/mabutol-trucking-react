import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { vehicleCanCarry, vehicleFitsShipmentWeight, vehicleBaseRate, bookingDefaults } from "../../services/vehiclePricing.js";

const source = await readFile(new URL("./CreateShipmentDrawer.jsx", import.meta.url), "utf8");
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
    window: { confirm(message) { assert.match(message, /Discard.*draft/); state.prompts++; return discard; } },
    reset() { state.resets++; },
    onClose() { state.closes++; },
  };
  const close = new Function(...Object.keys(scope), `${handler('handleCloseAll')}\nreturn handleCloseAll;`)(...Object.values(scope));
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
function booking({ step = 2, weight = "3000", capacity = 4000, busy = false, routeError = "", baseRate = 500, description = "Cargo", vehicle = true } = {}) {
  const state = { step, error: "previous error" };
  const scope = {
    form: { weight, cargoDescription: description },
    selectedVehicle: vehicle ? { is_active: true, default_capacity_kg: capacity } : null,
    baseRate, vehicleCanCarry, vehicleFitsShipmentWeight,
    currentStep: step, isResolvingAddress: busy, isCalculatingRoute: false,
    validateRoute: () => routeError,
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
for (const weight of ["2000", "3000", "4000"]) {
  test(`valid cargo ${weight}kg advances within capacity and excess-capacity boundary`, () => {
    const flow = booking({ weight });
    assert.equal(flow.validateCargo(), "");
    assert.doesNotThrow(() => flow.handleNext());
    assert.equal(flow.state.step, 3);
    assert.equal(flow.state.error, "");
  });
}
for (const weight of ["1999", "4001", "", "0", "-1", "invalid", "Infinity"]) {
  test(`invalid cargo ${weight} blocks advance and exposes validator error`, () => {
    const flow = booking({ weight });
    const error = flow.validateCargo();
    assert.ok(error);
    flow.handleNext();
    assert.equal(flow.state.step, 2);
    assert.equal(flow.state.error, error);
  });
}
for (const options of [{ vehicle: false }, { baseRate: null }, { description: "" }, { busy: true }, { step: 1, routeError: "Destination required" }]) {
  test(`existing validation blocks advance: ${JSON.stringify(options)}`, () => {
    const flow = booking(options);
    flow.handleNext();
    assert.equal(flow.state.step, options.step ?? 2);
    assert.ok(flow.state.error);
  });
}
