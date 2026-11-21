/**
 * Standard Luzon, Philippines Full Truckload (FTL) benchmark tariffs for Mabutol Trucking.
 * Rates scale monotonically across vehicle capacity & axle classes (Central Luzon / Metro Manila corridors).
 */

export const LUZON_FTL_FIXED_FEES = {
  minBooking: 3500,
  driver: 800,
};

export const LUZON_FTL_VEHICLE_RATES = [
  {
    key: 'elf_4w',
    label: 'Elf / 4-Wheeler',
    maxCapacityKg: 2500,
    match: /elf|4[\s-]*wheel/i,
    per_km_rate: 55,
    min_charge: 3500,
    free_deadhead_km: 30,
    deadhead_per_km_rate: 30,
    min_lead_time_hours: 12,
    loading_buffer_minutes: 120,
  },
  {
    key: 'closed_van',
    label: 'Closed Van',
    maxCapacityKg: 3000,
    match: /closed\s*van|l300|canter/i,
    per_km_rate: 65,
    min_charge: 4000,
    free_deadhead_km: 30,
    deadhead_per_km_rate: 35,
    min_lead_time_hours: 12,
    loading_buffer_minutes: 120,
  },
  {
    key: 'medium_truck',
    label: 'Medium Truck (4,000 kg)',
    maxCapacityKg: 4000,
    match: /medium\s*truck|4[,\s]*000/i,
    per_km_rate: 75,
    min_charge: 4500,
    free_deadhead_km: 30,
    deadhead_per_km_rate: 40,
    min_lead_time_hours: 24,
    loading_buffer_minutes: 150,
  },
  {
    key: 'six_wheeler',
    label: '6-Wheeler',
    maxCapacityKg: 6000,
    match: /6[\s-]*wheel/i,
    per_km_rate: 85,
    min_charge: 5500,
    free_deadhead_km: 30,
    deadhead_per_km_rate: 45,
    min_lead_time_hours: 24,
    loading_buffer_minutes: 180,
  },
  {
    key: 'dropside',
    label: 'Dropside',
    maxCapacityKg: 8000,
    match: /dropside|flat[\s-]*bed/i,
    per_km_rate: 95,
    min_charge: 6500,
    free_deadhead_km: 30,
    deadhead_per_km_rate: 50,
    min_lead_time_hours: 24,
    loading_buffer_minutes: 180,
  },
  {
    key: 'heavy_truck',
    label: 'Heavy Truck (10,000 kg)',
    maxCapacityKg: 10000,
    match: /heavy\s*truck|10[,\s]*000/i,
    per_km_rate: 110,
    min_charge: 8000,
    free_deadhead_km: 30,
    deadhead_per_km_rate: 55,
    min_lead_time_hours: 24,
    loading_buffer_minutes: 210,
  },
  {
    key: 'ten_wheeler_wing_van',
    label: '10-Wheeler Wing Van',
    maxCapacityKg: 12000,
    match: /10[\s-]*wheel|wing\s*van/i,
    per_km_rate: 130,
    min_charge: 9500,
    free_deadhead_km: 30,
    deadhead_per_km_rate: 65,
    min_lead_time_hours: 24,
    loading_buffer_minutes: 240,
  },
];

/**
 * Resolves the Luzon FTL standard tariff tier for a vehicle type by name first, then by capacity.
 */
export function resolveLuzonFtlRateForVehicle(vehicle) {
  const name = String(vehicle?.name || '');
  const byName = LUZON_FTL_VEHICLE_RATES.find((tier) => tier.match.test(name));
  if (byName) return byName;

  const capacity = Number(vehicle?.default_capacity_kg);
  if (Number.isFinite(capacity) && capacity > 0) {
    const byCapacity = LUZON_FTL_VEHICLE_RATES.find(
      (tier) => capacity <= tier.maxCapacityKg
    );
    return byCapacity || LUZON_FTL_VEHICLE_RATES[LUZON_FTL_VEHICLE_RATES.length - 1];
  }

  return null;
}

/**
 * Builds form-state dictionaries for Settings -> Pricing from the Luzon FTL standard matrix.
 */
export function buildLuzonFtlPricingPreset(vehicles = []) {
  const rates = {};
  const deadhead = {};
  const vehicleRules = {};

  for (const vehicle of vehicles) {
    const tier = resolveLuzonFtlRateForVehicle(vehicle);
    if (!tier) continue;
    if (vehicle.pricing) {
      rates[vehicle.id] = String(tier.per_km_rate);
      deadhead[vehicle.id] = {
        free_deadhead_km: String(tier.free_deadhead_km),
        deadhead_per_km_rate: String(tier.deadhead_per_km_rate),
      };
    }
    vehicleRules[vehicle.id] = {
      min_lead_time_hours: String(tier.min_lead_time_hours),
      loading_buffer_minutes: String(tier.loading_buffer_minutes),
    };
  }

  return {
    fees: {
      minBooking: String(LUZON_FTL_FIXED_FEES.minBooking),
      driver: String(LUZON_FTL_FIXED_FEES.driver),
    },
    rates,
    deadhead,
    vehicleRules,
  };
}
