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

export function vehicleBaseRate(vehicle, distanceKm) {
  const rate = vehicle?.pricing;
  if (!vehicle?.is_active || !rate?.id || !rate.is_active || rate.vehicle_type_id !== vehicle.id ||
      !validAmount(rate.per_km_rate) || !validAmount(rate.min_charge) || !validAmount(distanceKm)) return null;
  return Math.round(Math.max(Number(distanceKm) * Number(rate.per_km_rate), Number(rate.min_charge)) * 100) / 100;
}

export function vehicleCanCarry(vehicle, weight) {
  const capacity = vehicle?.default_capacity_kg;
  return vehicle?.is_active === true && Number.isFinite(Number(capacity)) && Number(capacity) > 0 &&
    validAmount(weight) && Number(weight) <= Number(capacity);
}
