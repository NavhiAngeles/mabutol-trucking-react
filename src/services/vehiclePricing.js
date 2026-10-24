export function pricingDate(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function attachVehiclePricing(vehicles, rates, today = pricingDate()) {
  const current = rates.filter(rate => rate.is_active && rate.effective_from <= today &&
    (!rate.effective_to || rate.effective_to >= today))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || a.id.localeCompare(b.id));
  return vehicles.filter(vehicle => vehicle.is_active).map(vehicle => ({
    ...vehicle,
    pricing: current.find(rate => rate.vehicle_type_id === vehicle.id) || null,
  }));
}

const validAmount = value => value != null && String(value).trim() !== "" &&
  Number.isFinite(Number(value)) && Number(value) >= 0;

export function vehicleBaseRate(vehicle, distanceKm, minimumBookingFee = 0) {
  const rate = vehicle?.pricing;
  if (!vehicle?.is_active || !rate?.id || !rate.is_active || rate.vehicle_type_id !== vehicle.id ||
      !validAmount(rate.per_km_rate) || !validAmount(rate.min_charge) || !validAmount(distanceKm) || !validAmount(minimumBookingFee)) return null;
  return Math.round(Math.max(Number(distanceKm) * Number(rate.per_km_rate), Number(rate.min_charge), Number(minimumBookingFee)) * 100) / 100;
}

export function bookingDefaults(settings) {
  if (!validAmount(settings?.minimum_booking_fee) || !validAmount(settings?.driver_allowance)) {
    throw new Error('Minimum booking fee and default driver allowance must be configured with valid non-negative amounts in Pricing.');
  }
  return { minimumBookingFee: Number(settings.minimum_booking_fee), driverAllowance: Number(settings.driver_allowance) };
}

export function vehicleCanCarry(vehicle, weight) {
  const capacity = vehicle?.default_capacity_kg;
  return vehicle?.is_active === true && Number.isFinite(Number(capacity)) && Number(capacity) > 0 &&
    validAmount(weight) && Number(weight) <= Number(capacity);
}


export function vehicleFitsShipmentWeight(vehicle, weight) {
  const cargoWeight = Number(weight);
  const truckCapacity = Number(vehicle?.default_capacity_kg);
  const MAX_EXTRA_CAPACITY_KG = 2000;

  if (
    weight === "" ||
    weight === null ||
    weight === undefined ||
    !Number.isFinite(cargoWeight) ||
    cargoWeight <= 0
  ) {
    return false;
  }

  return (
    vehicleCanCarry(vehicle, cargoWeight) &&
    truckCapacity <= cargoWeight + MAX_EXTRA_CAPACITY_KG
  );
}
