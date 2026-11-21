import { supabase } from "./supabaseClient";
import { attachVehiclePricing, pricingDate } from "./vehiclePricing";

const isMissingSchemaColumnError = (error) =>
  Boolean(
    error &&
      (error.code === "42703" ||
        error.code === "PGRST204" ||
        /does not exist|schema cache/i.test(String(error.message || "")))
  );

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
  const [initialVehicleResult, initialRateResult, settingsResult, truckResult, deliveriesResult, maintenanceResult] =
    await Promise.all([
      supabase
        .from("vehicle_types")
        .select("id, name, default_capacity_kg, is_active, toll_class, min_lead_time_hours, loading_buffer_minutes")
        .eq("is_active", true)
        .order("name"),

      supabase
        .from("pricing_rates")
        .select(
          "id, name, vehicle_type_id, base_rate, per_km_rate, per_kg_rate, min_charge, free_deadhead_km, deadhead_per_km_rate, is_active, effective_from, effective_to"
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
      supabase.from("trucks").select("id, vehicle_type_id, capacity_kg, status"),
      Promise.resolve(
        supabase.from("deliveries")?.select?.("truck_id, status")
      ).catch(() => ({ data: null, error: true })),
      Promise.resolve(
        supabase.from("maintenance_records")?.select?.("truck_id, status")
      ).catch(() => ({ data: null, error: true })),
    ]);

  let vehicleResult = initialVehicleResult;
  if (isMissingSchemaColumnError(vehicleResult.error)) {
    vehicleResult = await supabase
      .from("vehicle_types")
      .select("id, name, default_capacity_kg, is_active, toll_class")
      .eq("is_active", true)
      .order("name");
  }

  let rateResult = initialRateResult;
  if (isMissingSchemaColumnError(rateResult.error)) {
    rateResult = await supabase
      .from("pricing_rates")
      .select(
        "id, name, vehicle_type_id, base_rate, per_km_rate, per_kg_rate, min_charge, is_active, effective_from, effective_to"
      )
      .eq("is_active", true)
      .lte("effective_from", today);
  }

  if (vehicleResult.error) throw vehicleResult.error;
  if (rateResult.error) throw rateResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const normalizedVehicles = (vehicleResult.data || []).map((vehicle) => ({
    ...vehicle,
    min_lead_time_hours: Number.isFinite(Number(vehicle.min_lead_time_hours))
      ? Number(vehicle.min_lead_time_hours)
      : /refrigerated|flat/i.test(String(vehicle.name || ""))
        ? 48
        : 24,
    loading_buffer_minutes: Number.isFinite(Number(vehicle.loading_buffer_minutes))
      ? Number(vehicle.loading_buffer_minutes)
      : 180,
  }));

  const normalizedRates = (rateResult.data || []).map((rate) => ({
    ...rate,
    free_deadhead_km: Number.isFinite(Number(rate.free_deadhead_km))
      ? Number(rate.free_deadhead_km)
      : 30,
    deadhead_per_km_rate: Number.isFinite(Number(rate.deadhead_per_km_rate))
      ? Number(rate.deadhead_per_km_rate)
      : 0,
  }));

  const reservedTruckIds = new Set(
    Array.isArray(deliveriesResult?.data)
      ? deliveriesResult.data
          .filter((d) => ["assigned", "loading", "in_transit"].includes(d?.status))
          .map((d) => d.truck_id)
          .filter(Boolean)
      : []
  );
  const maintenanceTruckIds = new Set(
    Array.isArray(maintenanceResult?.data)
      ? maintenanceResult.data
          .filter((m) => m?.status === "in_progress")
          .map((m) => m.truck_id)
          .filter(Boolean)
      : []
  );

  const vehicles = attachVehiclePricing(normalizedVehicles, normalizedRates, today)
    .map(vehicle => {
      const matchingTrucks = (truckResult.data || [])
        .filter(truck => truck.vehicle_type_id === vehicle.id);
      const capacities = matchingTrucks
        .map(truck => Number(truck.capacity_kg))
        .filter(capacity => Number.isFinite(capacity) && capacity > 0);
      return {
        ...vehicle,
        fleetCapacityKnown: !truckResult.error,
        registeredMaxCapacityKg: capacities.length ? Math.max(...capacities) : null,
        registeredTruckCount: !truckResult.error ? matchingTrucks.length : null,
        availableTruckCount: !truckResult.error
          ? matchingTrucks.filter(
              truck =>
                truck.status === "available" &&
                (!truck.id || (!reservedTruckIds.has(truck.id) && !maintenanceTruckIds.has(truck.id)))
            ).length
          : null,
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

const wholeNumber = (value, label) => {
  if (value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || !Number.isInteger(Number(value))) {
    throw new Error('Invalid whole number: ' + label);
  }
  return Number(value);
};

export async function savePricing(
  vehicles,
  editedRates,
  fees,
  surcharges,
  editedDeadhead = null,
  editedVehicleRules = null
) {
  const hasDeadheadEdits = editedDeadhead != null;
  const rates = vehicles
    .filter((vehicle) => vehicle.pricing)
    .map((vehicle) => {
      const expectedRate = amount(vehicle.pricing.per_km_rate, vehicle.name);
      const nextRate = amount(editedRates[vehicle.id], vehicle.name);

      if (!hasDeadheadEdits) {
        return {
          id: vehicle.pricing.id,
          vehicle_type_id: vehicle.id,
          expected_rate: expectedRate,
          per_km_rate: nextRate,
        };
      }

      const deadheadEntry = editedDeadhead[vehicle.id] || {};
      const expectedFreeDeadheadKm = amount(
        vehicle.pricing.free_deadhead_km ?? 30,
        `${vehicle.name} free deadhead km`
      );
      const nextFreeDeadheadKm = amount(
        deadheadEntry.free_deadhead_km ?? expectedFreeDeadheadKm,
        `${vehicle.name} free deadhead km`
      );
      const expectedDeadheadRate = amount(
        vehicle.pricing.deadhead_per_km_rate ?? 0,
        `${vehicle.name} mobilization rate`
      );
      const nextDeadheadRate = amount(
        deadheadEntry.deadhead_per_km_rate ?? expectedDeadheadRate,
        `${vehicle.name} mobilization rate`
      );

      return {
        id: vehicle.pricing.id,
        vehicle_type_id: vehicle.id,
        expected_rate: expectedRate,
        per_km_rate: nextRate,
        expected_free_deadhead_km: expectedFreeDeadheadKm,
        free_deadhead_km: nextFreeDeadheadKm,
        expected_deadhead_per_km_rate: expectedDeadheadRate,
        deadhead_per_km_rate: nextDeadheadRate,
      };
    })
    .filter((rate) => {
      if (rate.per_km_rate !== rate.expected_rate) return true;
      if (
        hasDeadheadEdits &&
        (rate.free_deadhead_km !== rate.expected_free_deadhead_km ||
          rate.deadhead_per_km_rate !== rate.expected_deadhead_per_km_rate)
      ) {
        return true;
      }
      return false;
    });

  const vehicleTypesPayload = editedVehicleRules
    ? vehicles
        .map((vehicle) => {
          const entry = editedVehicleRules[vehicle.id];
          if (!entry) return null;
          const expectedLeadTime = wholeNumber(
            vehicle.min_lead_time_hours ?? 24,
            `${vehicle.name} min lead time hours`
          );
          const nextLeadTime = wholeNumber(
            entry.min_lead_time_hours ?? expectedLeadTime,
            `${vehicle.name} min lead time hours`
          );
          const expectedBuffer = wholeNumber(
            vehicle.loading_buffer_minutes ?? 180,
            `${vehicle.name} loading buffer minutes`
          );
          const nextBuffer = wholeNumber(
            entry.loading_buffer_minutes ?? expectedBuffer,
            `${vehicle.name} loading buffer minutes`
          );

          if (nextLeadTime === expectedLeadTime && nextBuffer === expectedBuffer) {
            return null;
          }

          return {
            id: vehicle.id,
            expected_min_lead_time_hours: expectedLeadTime,
            min_lead_time_hours: nextLeadTime,
            expected_loading_buffer_minutes: expectedBuffer,
            loading_buffer_minutes: nextBuffer,
          };
        })
        .filter(Boolean)
    : [];

  const settings = {
    minimum_booking_fee: amount(fees.minBooking, 'Minimum booking fee'),
    driver_allowance: amount(fees.driver, 'Driver allowance'),
    handling_surcharges: Object.fromEntries(
      Object.entries(surcharges).map(([key, value]) => [key, amount(value, key)])
    ),
  };

  const hasDeadheadChanges =
    hasDeadheadEdits &&
    rates.some(
      (rate) =>
        rate.free_deadhead_km !== rate.expected_free_deadhead_km ||
        rate.deadhead_per_km_rate !== rate.expected_deadhead_per_km_rate
    );
  const requiresFtlRpc = hasDeadheadChanges || vehicleTypesPayload.length > 0;

  const rpcArgs = requiresFtlRpc
    ? { p_rates: rates, p_settings: settings, p_vehicle_types: vehicleTypesPayload }
    : { p_rates: rates, p_settings: settings };

  const { data, error } = await supabase.rpc('save_pricing', rpcArgs);
  if (error) {
    if (
      requiresFtlRpc &&
      (error.code === 'PGRST202' ||
        error.code === '42883' ||
        /Could not find the function.*save_pricing|function public\.save_pricing.*does not exist/i.test(
          String(error.message || '')
        ))
    ) {
      throw new Error(
        'Database migration required: apply supabase/migrations/20261120120000_ftl_alignment_chained_dispatch.sql in Supabase before saving deadhead rates or vehicle lead times.'
      );
    }
    throw error;
  }
  if (
    data?.saved !== true ||
    data.rates !== rates.length ||
    data.settings !== 3 ||
    (requiresFtlRpc && data.vehicle_types !== vehicleTypesPayload.length)
  ) {
    throw new Error('Save was not confirmed. Reload pricing before retrying.');
  }
  return data;
}
