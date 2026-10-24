import { supabase } from "./supabaseClient";
import { attachVehiclePricing, pricingDate } from "./vehiclePricing";

export async function fetchHandlingSurcharges() {
  const { data, error } = await supabase.from("system_settings")
    .select("value").eq("key", "handling_surcharges").single();
  if (error) throw error;
  if (!data?.value || typeof data.value !== "object" || Array.isArray(data.value)) {
    throw new Error("Handling surcharge settings are missing or invalid.");
  }
  return data.value;
}

export async function fetchPricingData() {
  const today = pricingDate();
  const [vehicleResult, rateResult, settingsResult, truckResult] =
    await Promise.all([
      supabase
        .from("vehicle_types")
        .select("id, name, default_capacity_kg, is_active")
        .eq("is_active", true)
        .order("name"),

      supabase
        .from("pricing_rates")
        .select(
          "id, name, vehicle_type_id, base_rate, per_km_rate, per_kg_rate, min_charge, is_active, effective_from, effective_to"
        )
        .eq("is_active", true)
        .lte("effective_from", today),

      supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "minimum_booking_fee",
          "driver_allowance",
          "handling_surcharges",
        ]),
      supabase.from("trucks").select("vehicle_type_id, capacity_kg"),
    ]);

  if (vehicleResult.error) throw vehicleResult.error;
  if (rateResult.error) throw rateResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const vehicles = attachVehiclePricing(vehicleResult.data || [], rateResult.data || [], today)
    .map(vehicle => {
      const capacities = (truckResult.data || [])
        .filter(truck => truck.vehicle_type_id === vehicle.id)
        .map(truck => Number(truck.capacity_kg))
        .filter(capacity => Number.isFinite(capacity) && capacity > 0);
      return {
        ...vehicle,
        fleetCapacityKnown: !truckResult.error,
        registeredMaxCapacityKg: capacities.length ? Math.max(...capacities) : null,
      };
    });

  const settings = Object.fromEntries(
    (settingsResult.data || []).map((setting) => [
      setting.key,
      setting.value,
    ])
  );

  return { vehicles, settings };
}

const amount = (value, label) => {
  if (value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('Invalid amount: ' + label);
  return Number(value);
};

export async function savePricing(vehicles, editedRates, fees, surcharges) {
  const rates = vehicles.filter(vehicle => vehicle.pricing).map(vehicle => ({
    id: vehicle.pricing.id,
    vehicle_type_id: vehicle.id,
    expected_rate: amount(vehicle.pricing.per_km_rate, vehicle.name),
    per_km_rate: amount(editedRates[vehicle.id], vehicle.name),
  })).filter(rate => rate.per_km_rate !== rate.expected_rate);
  const settings = {
    minimum_booking_fee: amount(fees.minBooking, 'Minimum booking fee'),
    driver_allowance: amount(fees.driver, 'Driver allowance'),
    handling_surcharges: Object.fromEntries(Object.entries(surcharges).map(([key, value]) => [key, amount(value, key)])),
  };
  const { data, error } = await supabase.rpc('save_pricing', { p_rates: rates, p_settings: settings });
  if (error) throw error;
  if (data?.saved !== true || data.rates !== rates.length || data.settings !== 3) throw new Error('Save was not confirmed. Reload pricing before retrying.');
  return data;
}
