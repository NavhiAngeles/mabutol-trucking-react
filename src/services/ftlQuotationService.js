import { supabase } from './supabaseClient.js';

/**
 * @typedef {import('../types/database.d.ts').PricingRate} PricingRate
 * @typedef {import('../types/database.d.ts').QuoteBreakdown} QuoteBreakdown
 * @typedef {import('../types/database.d.ts').RankedTruckCandidate} RankedTruckCandidate
 * @typedef {import('../types/database.d.ts').SubmitOfficeQuotationParams} SubmitOfficeQuotationParams
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const nonNegFinite = (value, fallback = 0) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/**
 * Computes itemized FTL quotation amounts.
 * Customer linehaul depends strictly on pickup -> dropoff distance, cargo weight, and active tariff floor.
 * Truck deadhead repositioning never increases customer linehaul; excess deadhead populates mobilization_fee only.
 *
 * @param {object} params
 * @param {PricingRate} params.rate
 * @param {number} params.distanceKm
 * @param {number|null} [params.weightKg]
 * @param {number} [params.tollAmount]
 * @param {number} [params.deadheadKm]
 * @param {number} [params.overrideMobilizationFee]
 * @param {number|null} [params.overrideTotalAmount]
 * @param {number} [params.minimumBookingFee]
 * @returns {QuoteBreakdown}
 */
export function calculateFtlQuote({
  rate,
  distanceKm,
  weightKg = 0,
  tollAmount = 0,
  deadheadKm = 0,
  overrideMobilizationFee,
  overrideTotalAmount = null,
  minimumBookingFee = 0,
}) {
  if (!rate || typeof rate !== 'object') {
    throw new Error('An active vehicle pricing rate is required.');
  }

  const tripDistanceKm = nonNegFinite(distanceKm, NaN);
  if (tripDistanceKm === null || !Number.isFinite(tripDistanceKm)) {
    throw new Error('A valid pickup-to-dropoff distance is required.');
  }

  const cargoWeightKg = nonNegFinite(weightKg, 0);
  const validatedToll = nonNegFinite(tollAmount, 0);
  const validatedDeadheadKm = nonNegFinite(deadheadKm, 0);
  const minFloor = Math.max(
    nonNegFinite(rate.min_charge, 0) ?? 0,
    nonNegFinite(minimumBookingFee, 0) ?? 0
  );

  if (cargoWeightKg === null || validatedToll === null || validatedDeadheadKm === null) {
    throw new Error('Weight, toll amount, and deadhead distance must be valid non-negative numbers.');
  }

  const baseRate = nonNegFinite(rate.base_rate, 0) ?? 0;
  const perKmRate = nonNegFinite(rate.per_km_rate, 0) ?? 0;
  const perKgRate = nonNegFinite(rate.per_kg_rate, 0) ?? 0;
  const freeDeadheadKm = nonNegFinite(rate.free_deadhead_km, 30) ?? 30;
  const deadheadPerKmRate = nonNegFinite(rate.deadhead_per_km_rate, 0) ?? 0;

  // 1. Linehaul is anchored strictly to Pick-up -> Destination
  const rawLinehaul =
    baseRate +
    tripDistanceKm * perKmRate +
    cargoWeightKg * perKgRate;
  const linehaulAmount = round2(Math.max(rawLinehaul, minFloor));

  // 2. Excess deadhead applies only above free_deadhead_km
  const excessDeadheadKm = round2(Math.max(0, validatedDeadheadKm - freeDeadheadKm));
  const suggestedMobilizationFee = round2(excessDeadheadKm * deadheadPerKmRate);

  let mobilizationFee = suggestedMobilizationFee;
  if (
    overrideMobilizationFee !== undefined &&
    overrideMobilizationFee !== null &&
    String(overrideMobilizationFee).trim() !== ''
  ) {
    const manualMob = nonNegFinite(overrideMobilizationFee, null);
    if (manualMob === null) {
      throw new Error('Mobilization fee must be a valid non-negative amount.');
    }
    mobilizationFee = round2(manualMob);
  }

  const safeTollAmount = round2(validatedToll);
  const safeDeadheadKm = round2(validatedDeadheadKm);
  const quotedAmount = round2(linehaulAmount + safeTollAmount + mobilizationFee);

  let finalAmount = quotedAmount;
  if (
    overrideTotalAmount !== undefined &&
    overrideTotalAmount !== null &&
    String(overrideTotalAmount).trim() !== ''
  ) {
    const manualFinal = nonNegFinite(overrideTotalAmount, null);
    if (manualFinal === null) {
      throw new Error('Override final amount must be a valid non-negative amount.');
    }
    finalAmount = round2(manualFinal);
  }

  return {
    linehaulAmount,
    tollAmount: safeTollAmount,
    deadheadKm: safeDeadheadKm,
    excessDeadheadKm,
    suggestedMobilizationFee,
    mobilizationFee,
    quotedAmount,
    finalAmount,
  };
}

/**
 * Normalizes and ranks candidate trucks returned by public.get_ranked_trucks_for_shipment.
 *
 * @param {string} shipmentId
 * @param {object} [client]
 * @returns {Promise<RankedTruckCandidate[]>}
 */
export async function fetchRankedTrucksForShipment(shipmentId, client = supabase) {
  if (!shipmentId) {
    throw new Error('Shipment ID is required to rank candidate trucks.');
  }

  const { data, error } = await client.rpc('get_ranked_trucks_for_shipment', {
    p_shipment_id: shipmentId,
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => ({
      truck_id: row.truck_id,
      fleet_code: row.fleet_code || null,
      plate_number: row.plate_number || 'No plate',
      vehicle_type_id: row.vehicle_type_id || null,
      vehicle_type_name: row.vehicle_type_name || null,
      truck_status: String(row.truck_status || 'available'),
      assigned_driver_id: row.assigned_driver_id || null,
      driver_name: row.driver_name || null,
      projected_location_label: row.projected_location_label || 'Home Base',
      projected_lat: row.projected_lat != null ? Number(row.projected_lat) : null,
      projected_lng: row.projected_lng != null ? Number(row.projected_lng) : null,
      available_at: row.available_at || new Date().toISOString(),
      estimated_deadhead_km: round2(row.estimated_deadhead_km ?? 0),
      can_make_pickup: Boolean(row.can_make_pickup),
      schedule_gap_minutes: Math.round(Number(row.schedule_gap_minutes ?? 0)),
    }))
    .sort((a, b) => {
      if (a.can_make_pickup !== b.can_make_pickup) {
        return a.can_make_pickup ? -1 : 1;
      }
      if (a.estimated_deadhead_km !== b.estimated_deadhead_km) {
        return a.estimated_deadhead_km - b.estimated_deadhead_km;
      }
      return Date.parse(a.available_at) - Date.parse(b.available_at);
    });
}

/**
 * Formats projected location & PHT availability for dispatcher comparison cards.
 *
 * @param {RankedTruckCandidate} candidate
 * @param {number} [now]
 * @returns {string}
 */
export function formatProjectedAvailability(candidate, now = Date.now()) {
  const loc = candidate?.projected_location_label || 'Home Base';
  const availMs = Date.parse(candidate?.available_at || '');
  const isActiveTrip = ['on_trip', 'in_transit', 'loading'].includes(
    String(candidate?.truck_status || '').toLowerCase()
  );

  let whenLabel = 'Now';
  if (Number.isFinite(availMs)) {
    if (availMs > now + 60000) {
      const nowDay = new Date(now + MANILA_OFFSET_MS).toISOString().slice(0, 10);
      const availDay = new Date(availMs + MANILA_OFFSET_MS).toISOString().slice(0, 10);
      const timePart = new Date(availMs).toLocaleTimeString('en-PH', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      if (nowDay === availDay) {
        whenLabel = timePart;
      } else {
        const datePart = new Date(availMs).toLocaleDateString('en-PH', {
          timeZone: 'Asia/Manila',
          month: 'short',
          day: 'numeric',
        });
        whenLabel = `${datePart}, ${timePart}`;
      }
    } else if (!isActiveTrip) {
      whenLabel = 'Now';
    } else {
      whenLabel = new Date(availMs).toLocaleTimeString('en-PH', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
  }

  if (isActiveTrip) {
    return `Finishing unload in ${loc} · Available ${whenLabel}`;
  }
  return `${loc} · Available ${whenLabel}`;
}

function formatGapMinutes(absMinutes) {
  const mins = Math.max(0, Math.round(absMinutes));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}

/**
 * Formats pickup schedule feasibility badge metadata.
 *
 * @param {RankedTruckCandidate} candidate
 * @returns {{ canMakePickup: boolean, label: string, detail: string, tone: 'ready'|'tight'|'late' }}
 */
export function formatScheduleFeasibility(candidate) {
  const canMakePickup = Boolean(candidate?.can_make_pickup);
  const gap = Math.round(Number(candidate?.schedule_gap_minutes ?? 0));

  if (canMakePickup) {
    return {
      canMakePickup: true,
      label: 'On-time / Ready',
      detail: gap > 0 ? `+${formatGapMinutes(gap)} buffer` : 'Meets pickup window',
      tone: 'ready',
    };
  }

  if (gap < 0) {
    return {
      canMakePickup: false,
      label: `Tight / Late by ${formatGapMinutes(Math.abs(gap))}`,
      detail: 'Repositioning arrives after target departure',
      tone: 'late',
    };
  }

  return {
    canMakePickup: false,
    label: `Tight (${formatGapMinutes(gap)} margin)`,
    detail: 'Under 30m repositioning staging buffer',
    tone: 'tight',
  };
}

/**
 * Saves an itemized office FTL quotation to public.shipments and records an 'office_quoted' event in public.shipment_events.
 *
 * @param {SubmitOfficeQuotationParams} params
 * @param {object} [client]
 */
export async function submitOfficeQuotation(params, client = supabase) {
  const {
    shipmentId,
    actorUserId,
    pricingRateId,
    quotedStatusEnum = 'quoted',
    breakdown,
    overrideReason = null,
    quoteValidHours = 12,
    routeUpdates = null,
    selectedTruck = null,
  } = params || {};

  if (!shipmentId) {
    throw new Error('Shipment ID is required to submit a quotation.');
  }
  if (!pricingRateId) {
    throw new Error('Pricing rate ID is required to submit a quotation.');
  }
  if (!breakdown || typeof breakdown !== 'object') {
    throw new Error('Quotation breakdown is required.');
  }

  const validHours = Number(quoteValidHours);
  if (!Number.isFinite(validHours) || validHours <= 0 || validHours > 720) {
    throw new Error('Quote validity duration must be between 1 and 720 hours.');
  }

  const hasOverride = round2(breakdown.finalAmount) !== round2(breakdown.quotedAmount);
  const trimmedReason = String(overrideReason ?? '').trim();
  if (hasOverride && trimmedReason.length < 3) {
    throw new Error('Enter an override reason of at least 3 characters when overriding the quoted total.');
  }

  const nowIso = new Date().toISOString();
  const quoteExpiresAt = new Date(Date.now() + validHours * 60 * 60 * 1000).toISOString();

  const updatePayload = {
    ...(routeUpdates || {}),
    status: quotedStatusEnum,
    pricing_rate_id: pricingRateId,
    linehaul_amount: round2(breakdown.linehaulAmount),
    toll_amount: round2(breakdown.tollAmount),
    mobilization_fee: round2(breakdown.mobilizationFee),
    deadhead_km: round2(breakdown.deadheadKm),
    quoted_amount: round2(breakdown.quotedAmount),
    override_amount: hasOverride ? round2(breakdown.finalAmount) : null,
    override_reason: hasOverride ? trimmedReason : null,
    final_amount: round2(breakdown.finalAmount),
    quote_expires_at: quoteExpiresAt,
    updated_at: nowIso,
  };

  let currentPayload = { ...updatePayload };
  let updateError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await client
      .from('shipments')
      .update(currentPayload)
      .eq('id', shipmentId);
    updateError = res?.error || null;
    if (!updateError) break;

    const msg = String(updateError.message || '');
    const missingColMatch =
      msg.match(/Could not find the '([^']+)' column/i) ||
      msg.match(/column "([^"]+)" of relation "shipments" does not exist/i);
    const generatedColMatch =
      updateError.code === '428C9' || /generated column|non-DEFAULT value into column/i.test(msg)
        ? msg.match(/column "([^"]+)"/i) || [null, 'final_amount']
        : null;
    const stripCol = missingColMatch?.[1] || generatedColMatch?.[1];
    if (stripCol && Object.prototype.hasOwnProperty.call(currentPayload, stripCol)) {
      const nextPayload = { ...currentPayload };
      delete nextPayload[stripCol];
      currentPayload = nextPayload;
      continue;
    }
    break;
  }

  if (updateError) throw updateError;

  const { error: eventError } = await client.from('shipment_events').insert({
    shipment_id: shipmentId,
    event_type: 'office_quoted',
    actor_id: actorUserId || null,
    meta: {
      linehaul_amount: round2(breakdown.linehaulAmount),
      toll_amount: round2(breakdown.tollAmount),
      mobilization_fee: round2(breakdown.mobilizationFee),
      suggested_mobilization_fee: round2(breakdown.suggestedMobilizationFee),
      deadhead_km: round2(breakdown.deadheadKm),
      excess_deadhead_km: round2(breakdown.excessDeadheadKm),
      quoted_amount: round2(breakdown.quotedAmount),
      override_amount: hasOverride ? round2(breakdown.finalAmount) : null,
      override_reason: hasOverride ? trimmedReason : null,
      final_amount: round2(breakdown.finalAmount),
      quote_expires_at: quoteExpiresAt,
      quote_valid_hours: validHours,
      candidate_truck_id: selectedTruck?.truck_id || null,
      candidate_fleet_code: selectedTruck?.fleet_code || null,
      candidate_plate_number: selectedTruck?.plate_number || null,
    },
  });

  if (eventError) throw eventError;

  return {
    shipmentId,
    status: quotedStatusEnum,
    quoteExpiresAt,
    breakdown,
  };
}
