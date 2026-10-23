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

export async function saveVehicleRates(vehicles, editedRates) {
  for (const vehicle of vehicles) {
    if (!vehicle.pricing) continue;

    const newRate = Number(editedRates[vehicle.id]);

    if (!Number.isFinite(newRate) || newRate < 0) {
      throw new Error(`Invalid rate for ${vehicle.name}`);
    }

    if (newRate === Number(vehicle.pricing.per_km_rate)) {
      continue;
    }

    const { data, error } = await supabase
      .from("pricing_rates")
      .update({ per_km_rate: newRate })
      .eq("id", vehicle.pricing.id)
      .select("id");

    if (error) throw error;

    if (!data?.length) {
      throw new Error(
        `Unable to update ${vehicle.name}. Check pricing permissions.`
      );
    }
  }
}

export async function savePricingSettings(fees, surcharges) {
  const settings = [
    {
      key: "minimum_booking_fee",
      value: Number(fees.minBooking),
      description: "Minimum booking fee for every shipment",
    },
    {
      key: "driver_allowance",
      value: Number(fees.driver),
      description: "Default driver allowance per trip",
    },
    {
      key: "handling_surcharges",
      value: Object.fromEntries(
        Object.entries(surcharges).map(([key, value]) => [
          key,
          Number(value),
        ])
      ),
      description: "Special handling surcharge configuration",
    },
  ];

  const { data, error } = await supabase
    .from("system_settings")
    .upsert(settings, { onConflict: "key" })
    .select("key");

  if (error) throw error;

  if (data?.length !== settings.length) {
    throw new Error(
      "Some settings were not saved. Check Supabase permissions."
    );
  }
}
