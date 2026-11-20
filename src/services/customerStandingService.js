import { supabase } from './supabaseClient';

const MANILA_TIME_ZONE = 'Asia/Manila';
const MISSING_SCHEMA_RE = /does not exist|42703|42P01|PGRST204|PGRST205|schema cache/i;
const MISSING_FUNCTION_RE = /PGRST202|Could not find the function|function .* does not exist/i;
const APPEAL_DECISION_RE = /INVALID_APPEAL_DECISION|invalid.*decision|check constraint/i;

let cachedNoShowArgMode = null;

function isMissingSchemaError(error) {
  const haystack = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return MISSING_SCHEMA_RE.test(haystack);
}

export function formatManilaDateTime(value, fallback = 'Not recorded') {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  const formatted = new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed);
  return `${formatted} PHT`;
}

export function formatManilaDate(value, fallback = 'Not recorded') {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function formatRemainingDuration(targetIso, now = Date.now()) {
  if (!targetIso) return { active: false, remainingMs: 0, label: '' };
  const targetMs = Date.parse(targetIso);
  if (!Number.isFinite(targetMs)) return { active: false, remainingMs: 0, label: '' };

  const remainingMs = targetMs - now;
  if (remainingMs <= 0) {
    return { active: false, remainingMs: 0, label: 'Expired' };
  }

  const totalMinutes = Math.floor(remainingMs / 60000);
  if (totalMinutes < 1) {
    return { active: true, remainingMs, label: 'Under 1m left' };
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return {
      active: true,
      remainingMs,
      label: hours > 0 ? `${days}d ${hours}h left` : `${days}d left`,
    };
  }

  if (totalHours >= 1) {
    return {
      active: true,
      remainingMs,
      label: minutes > 0 ? `${totalHours}h ${minutes}m left` : `${totalHours}h left`,
    };
  }

  return { active: true, remainingMs, label: `${totalMinutes}m left` };
}

export function normalizeCustomerStanding(customer, now = Date.now()) {
  const strikeCount = Math.max(0, Number(customer?.no_show_strike_count ?? 0) || 0);
  const displayStrikes = Math.min(3, strikeCount);
  const extraStrikes = Math.max(0, strikeCount - 3);
  const rawStatus = String(customer?.standing_status || 'good').trim().toLowerCase();
  const normalizedRaw = rawStatus === 'active' ? 'good' : rawStatus;
  const cooldownUntil = customer?.booking_cooldown_until || null;
  const cooldownMs = cooldownUntil ? Date.parse(cooldownUntil) : NaN;
  const cooldownRemaining = formatRemainingDuration(cooldownUntil, now);
  const cooldownActive = Boolean(Number.isFinite(cooldownMs) && cooldownMs > now);
  const isSuspended = normalizedRaw === 'suspended' || (normalizedRaw !== 'reinstated' && strikeCount >= 3);
  const isReinstated = !isSuspended && normalizedRaw === 'reinstated';

  let status = 'good';
  let label = 'Good';
  let tone = 'good';
  let bookingBlocked = false;
  let blockReason = null;

  if (isSuspended) {
    status = 'suspended';
    label = 'Suspended';
    tone = 'danger';
    bookingBlocked = true;
    blockReason = customer?.suspension_reason || (strikeCount >= 4
      ? `${strikeCount} confirmed no-shows (post-reinstatement review)`
      : '3 confirmed no-shows');
  } else if (cooldownActive) {
    status = 'cooldown';
    label = `Cooldown (${cooldownRemaining.label})`;
    tone = 'warning';
    bookingBlocked = true;
    blockReason = `Booking cooldown active until ${formatManilaDateTime(cooldownUntil)}`;
  } else if (isReinstated) {
    status = 'reinstated';
    label = 'Reinstated';
    tone = 'info';
  } else if (strikeCount > 0) {
    status = 'good';
    label = 'Good standing';
    tone = 'neutral';
  }

  const strikeSummary = extraStrikes > 0
    ? `${strikeCount} strikes (3/3 + ${extraStrikes})`
    : `${strikeCount} of 3 strikes`;

  const tooltipSummary = isSuspended
    ? `${strikeSummary}, Standing: Suspended${customer?.suspended_at ? ` since ${formatManilaDate(customer.suspended_at)}` : ''}`
    : cooldownActive
      ? `${strikeSummary}, Cooldown until ${formatManilaDateTime(cooldownUntil)}`
      : isReinstated
        ? `${strikeSummary}, Reinstated (cumulative strikes retained)`
        : `${strikeSummary}, Standing: Good`;

  return {
    strikeCount,
    displayStrikes,
    extraStrikes,
    rawStatus,
    status,
    label,
    tone,
    isSuspended,
    isCooldownActive: cooldownActive,
    isReinstated,
    bookingBlocked,
    blockReason,
    cooldownUntil,
    cooldownRemainingLabel: cooldownActive ? cooldownRemaining.label : '',
    suspendedAt: customer?.suspended_at || null,
    suspensionReason: customer?.suspension_reason || null,
    reinstatedAt: customer?.reinstated_at || null,
    strikeSummary,
    tooltipSummary,
  };
}

export function previewNextNoShowStrike(customer) {
  const currentStrikes = Math.max(0, Number(customer?.no_show_strike_count ?? 0) || 0);
  const nextStrikeNumber = currentStrikes + 1;
  const resultingStanding = nextStrikeNumber >= 3 ? 'suspended' : 'cooldown';
  const cooldownHours = nextStrikeNumber === 1 ? 48 : nextStrikeNumber === 2 ? 72 : null;

  let impactText;
  if (nextStrikeNumber === 1) {
    impactText = 'Records Strike 1 of 3 and starts a 48-hour booking cooldown.';
  } else if (nextStrikeNumber === 2) {
    impactText = 'Records Strike 2 of 3 and starts a 72-hour booking cooldown.';
  } else if (nextStrikeNumber === 3) {
    impactText = 'Records Strike 3 of 3 and permanently suspends new mobile bookings until an appeal is approved.';
  } else {
    impactText = `Records Strike ${nextStrikeNumber} (post-reinstatement) and suspends the customer account for admin review.`;
  }

  return {
    currentStrikes,
    nextStrikeNumber,
    resultingStanding,
    cooldownHours,
    impactText,
  };
}

export function getPickupWaitState(delivery, now = Date.now()) {
  const status = String(delivery?.status || '').trim().toLowerCase();
  if (!delivery || !delivery.pickup_arrived_at) {
    return {
      active: false,
      phase: 'pre_arrival',
      badgeLabel: null,
      subBadgeLabel: null,
      detailLabel: null,
      tone: 'neutral',
      customerOnWay: Boolean(delivery?.customer_on_way_at),
      customerOnWayAt: delivery?.customer_on_way_at || null,
      graceEnded: false,
      waitThresholdReached: false,
      canOfficeConfirmNoShow: false,
      graceEndsAt: delivery?.grace_ends_at || null,
      autoCancelAt: delivery?.auto_cancel_at || null,
    };
  }

  if (delivery.no_show_confirmed_at) {
    return {
      active: false,
      phase: 'no_show_confirmed',
      badgeLabel: 'No-show confirmed',
      subBadgeLabel: null,
      detailLabel: `Confirmed ${formatManilaDateTime(delivery.no_show_confirmed_at)}`,
      tone: 'danger',
      customerOnWay: Boolean(delivery.customer_on_way_at),
      customerOnWayAt: delivery.customer_on_way_at || null,
      graceEnded: true,
      waitThresholdReached: true,
      canOfficeConfirmNoShow: false,
      graceEndsAt: delivery.grace_ends_at || null,
      autoCancelAt: delivery.auto_cancel_at || null,
    };
  }

  if (delivery.customer_showed_at || ['loading', 'in_transit', 'delivered'].includes(status)) {
    return {
      active: false,
      phase: 'customer_showed',
      badgeLabel: 'Customer showed at pickup',
      subBadgeLabel: null,
      detailLabel: delivery.customer_showed_at
        ? `Confirmed at pickup ${formatManilaDateTime(delivery.customer_showed_at)}`
        : 'Trip loading or in transit',
      tone: 'good',
      customerOnWay: Boolean(delivery.customer_on_way_at),
      customerOnWayAt: delivery.customer_on_way_at || null,
      graceEnded: false,
      waitThresholdReached: false,
      canOfficeConfirmNoShow: false,
      graceEndsAt: delivery.grace_ends_at || null,
      autoCancelAt: delivery.auto_cancel_at || null,
    };
  }

  if (status !== 'assigned') {
    return {
      active: false,
      phase: status || 'inactive',
      badgeLabel: null,
      subBadgeLabel: null,
      detailLabel: null,
      tone: 'neutral',
      customerOnWay: Boolean(delivery.customer_on_way_at),
      customerOnWayAt: delivery.customer_on_way_at || null,
      graceEnded: false,
      waitThresholdReached: false,
      canOfficeConfirmNoShow: false,
      graceEndsAt: delivery.grace_ends_at || null,
      autoCancelAt: delivery.auto_cancel_at || null,
    };
  }

  const arrivedMs = Date.parse(delivery.pickup_arrived_at);
  const graceIso = delivery.grace_ends_at
    || (Number.isFinite(arrivedMs) ? new Date(arrivedMs + 15 * 60 * 1000).toISOString() : null);
  const autoCancelIso = delivery.auto_cancel_at
    || (Number.isFinite(arrivedMs) ? new Date(arrivedMs + 30 * 60 * 1000).toISOString() : null);

  const graceMs = graceIso ? Date.parse(graceIso) : NaN;
  const autoCancelMs = autoCancelIso ? Date.parse(autoCancelIso) : NaN;
  const graceEnded = Number.isFinite(graceMs) && now >= graceMs;
  const waitThresholdReached = Number.isFinite(autoCancelMs) && now >= autoCancelMs;
  const customerOnWay = Boolean(delivery.customer_on_way_at);

  const graceRemaining = formatRemainingDuration(graceIso, now);
  const waitRemaining = formatRemainingDuration(autoCancelIso, now);

  if (waitThresholdReached) {
    return {
      active: true,
      phase: 'threshold_reached',
      badgeLabel: 'Wait threshold reached',
      subBadgeLabel: '30m window elapsed',
      detailLabel: `Threshold reached at ${formatManilaDateTime(autoCancelIso)}. Driver or office can confirm no-show.`,
      tone: 'danger',
      customerOnWay,
      customerOnWayAt: delivery.customer_on_way_at || null,
      graceEnded: true,
      waitThresholdReached: true,
      canOfficeConfirmNoShow: true,
      graceEndsAt: graceIso,
      autoCancelAt: autoCancelIso,
    };
  }

  if (graceEnded) {
    return {
      active: true,
      phase: 'grace_ended',
      badgeLabel: 'Grace period ended',
      subBadgeLabel: 'Booking at risk',
      detailLabel: `30-min wait ends at ${formatManilaDateTime(autoCancelIso)} (${waitRemaining.label}).`,
      tone: 'warning',
      customerOnWay,
      customerOnWayAt: delivery.customer_on_way_at || null,
      graceEnded: true,
      waitThresholdReached: false,
      canOfficeConfirmNoShow: true,
      graceEndsAt: graceIso,
      autoCancelAt: autoCancelIso,
    };
  }

  return {
    active: true,
    phase: 'in_grace',
    badgeLabel: 'Waiting at pickup',
    subBadgeLabel: '15m grace active',
    detailLabel: `Grace ends at ${formatManilaDateTime(graceIso)} (${graceRemaining.label}).`,
    tone: 'info',
    customerOnWay,
    customerOnWayAt: delivery.customer_on_way_at || null,
    graceEnded: false,
    waitThresholdReached: false,
    canOfficeConfirmNoShow: true,
    graceEndsAt: graceIso,
    autoCancelAt: autoCancelIso,
  };
}

export function normalizeStrikeRow(row, shipmentMap = null) {
  if (!row) return null;
  const shipmentInfo = (shipmentMap && row.shipment_id ? shipmentMap.get(row.shipment_id) : null) || row.shipment || null;
  const role = String(row.confirmed_by_role || row.confirmed_source || 'admin').trim().toLowerCase() || 'admin';

  return {
    ...row,
    confirmedByRole: role,
    confirmed_by_role: row.confirmed_by_role || role,
    confirmed_source: row.confirmed_source || role,
    trackingNumber: shipmentInfo?.tracking_number || null,
    pickupAddress: shipmentInfo?.pickup_address || null,
    dropoffAddress: shipmentInfo?.dropoff_address || null,
    scheduledDeparture: shipmentInfo?.scheduled_departure || null,
  };
}

export function formatStandingError(error) {
  const msg = String(error?.message || error || '').trim();
  if (/ACCOUNT_SUSPENDED/i.test(msg)) {
    return 'Customer account is permanently suspended from mobile bookings until an appeal is approved.';
  }
  if (/BOOKING_COOLDOWN_ACTIVE/i.test(msg)) {
    return 'Customer is currently in a booking cooldown window after a recent no-show strike.';
  }
  if (/NOT_IN_GRACE_WINDOW/i.test(msg)) {
    return 'Delivery is no longer in the pickup wait window.';
  }
  if (/APPEAL_REASON_REQUIRED/i.test(msg)) {
    return 'Appeal reason must be between 10 and 1500 characters.';
  }
  if (/APPEAL_ALREADY_PENDING/i.test(msg)) {
    return 'This customer already has a pending appeal under review.';
  }
  if (/ACCOUNT_NOT_SUSPENDED/i.test(msg)) {
    return 'Only suspended accounts can submit or be reinstated via an appeal.';
  }
  if (/permission denied|unauthorized|42501/i.test(msg)) {
    return 'Only authorized office or admin staff can perform this action.';
  }
  return msg || 'Unable to complete customer standing action.';
}

async function fetchShipmentSummariesByIds(shipmentIds = []) {
  const ids = Array.from(new Set(shipmentIds.filter(Boolean)));
  const map = new Map();
  if (!ids.length) return map;

  const { data, error } = await supabase
    .from('shipments')
    .select('id, tracking_number, pickup_address, dropoff_address, scheduled_departure')
    .in('id', ids);

  if (!error && Array.isArray(data)) {
    for (const row of data) {
      map.set(row.id, row);
    }
  }
  return map;
}

export async function fetchCustomerNoShowStrikes({ customerId = null, includeShipments = true } = {}) {
  let query = supabase
    .from('customer_no_show_strikes')
    .select('*')
    .order('confirmed_at', { ascending: Boolean(customerId) });

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return [];

  const shipmentMap = includeShipments
    ? await fetchShipmentSummariesByIds(rows.map((r) => r.shipment_id))
    : null;

  return rows.map((row) => normalizeStrikeRow(row, shipmentMap));
}

export async function fetchCustomerAppeals({ customerId = null, status = null } = {}) {
  let query = supabase
    .from('customer_appeals')
    .select('*')
    .order('created_at', { ascending: false });

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  const normalizedStatus = status ? String(status).trim().toLowerCase() : null;
  if (normalizedStatus && normalizedStatus !== 'all') {
    query = query.eq('status', normalizedStatus);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function confirmNoShowCancellation({ deliveryId, reason = '', attemptNotes = '' }) {
  if (!deliveryId) throw new Error('Delivery reference is required to confirm a no-show.');

  const cleanReason = String(reason || '').trim() || null;
  const cleanNotes = String(attemptNotes || '').trim() || null;
  const combinedNotes = [cleanReason, cleanNotes].filter(Boolean).join(': ') || null;

  const invokeTwoArg = () => supabase.rpc('confirm_no_show_cancellation', {
    p_delivery_id: deliveryId,
    p_attempt_notes: combinedNotes,
  });

  if (cleanReason && cachedNoShowArgMode !== '2arg') {
    const threeArgResult = await supabase.rpc('confirm_no_show_cancellation', {
      p_delivery_id: deliveryId,
      p_attempt_notes: cleanNotes,
      p_reason: cleanReason,
    });

    if (!threeArgResult.error) {
      cachedNoShowArgMode = '3arg';
      return threeArgResult.data;
    }

    if (MISSING_FUNCTION_RE.test(`${threeArgResult.error.code || ''} ${threeArgResult.error.message || ''}`)) {
      cachedNoShowArgMode = '2arg';
      const fallbackResult = await invokeTwoArg();
      if (fallbackResult.error) throw fallbackResult.error;
      return fallbackResult.data;
    }

    throw threeArgResult.error;
  }

  const { data, error } = await invokeTwoArg();
  if (error) throw error;
  return data;
}

export async function reviewCustomerAppeal({ appealId, decision, adminNotes = '' }) {
  if (!appealId) throw new Error('Appeal reference is required.');

  const rawDecision = String(decision || '').trim().toLowerCase();
  const canonicalDecision = ['approved', 'approve'].includes(rawDecision)
    ? 'approved'
    : ['rejected', 'reject'].includes(rawDecision)
      ? 'rejected'
      : '';

  if (!canonicalDecision) {
    throw new Error('Decision must be approved or rejected.');
  }

  const trimmedNotes = String(adminNotes || '').trim() || null;

  const primary = await supabase.rpc('office_review_customer_appeal', {
    p_appeal_id: appealId,
    p_decision: canonicalDecision,
    p_admin_notes: trimmedNotes,
  });

  if (!primary.error) return primary.data;

  const errText = `${primary.error.code || ''} ${primary.error.message || ''} ${primary.error.details || ''}`;
  if (APPEAL_DECISION_RE.test(errText)) {
    const verbDecision = canonicalDecision === 'approved' ? 'approve' : 'reject';
    const retry = await supabase.rpc('office_review_customer_appeal', {
      p_appeal_id: appealId,
      p_decision: verbDecision,
      p_admin_notes: trimmedNotes,
    });
    if (retry.error) throw retry.error;
    return retry.data;
  }

  throw primary.error;
}

export function subscribeCustomerStanding(onChange) {
  if (typeof onChange !== 'function') return () => {};
  const channel = supabase
    .channel('customer-standing-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
      onChange({ table: 'customers', payload });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_no_show_strikes' }, (payload) => {
      onChange({ table: 'customer_no_show_strikes', payload });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_appeals' }, (payload) => {
      onChange({ table: 'customer_appeals', payload });
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function fetchShipmentStandingAndWaitOverlays(shipments = []) {
  const shipmentIds = Array.from(new Set(
    (shipments || []).map((row) => row?.dbId || row?.id).filter(Boolean)
  ));
  if (!shipmentIds.length) {
    return { waitByShipmentId: new Map(), cancellationTypeByShipmentId: new Map(), customerStandingByShipmentId: new Map() };
  }

  const [waitRes, cancelRes] = await Promise.all([
    supabase
      .from('deliveries')
      .select('id, shipment_id, status, pickup_arrived_at, grace_ends_at, auto_cancel_at, customer_showed_at, customer_on_way_at, no_show_confirmed_at, updated_at')
      .in('shipment_id', shipmentIds)
      .neq('status', 'cancelled'),
    supabase
      .from('shipments')
      .select('id, customer_id, cancellation_type, customer:customers!customer_id(id, name, no_show_strike_count, standing_status, booking_cooldown_until, suspended_at, suspension_reason, reinstated_at)')
      .in('id', shipmentIds),
  ]);

  const waitByShipmentId = new Map();
  if (!waitRes.error && Array.isArray(waitRes.data)) {
    for (const row of waitRes.data) {
      if (row?.shipment_id && !waitByShipmentId.has(row.shipment_id)) {
        waitByShipmentId.set(row.shipment_id, row);
      }
    }
  }

  const cancellationTypeByShipmentId = new Map();
  const customerStandingByShipmentId = new Map();
  if (!cancelRes.error && Array.isArray(cancelRes.data)) {
    for (const row of cancelRes.data) {
      if (!row?.id) continue;
      if (row.cancellation_type) cancellationTypeByShipmentId.set(row.id, row.cancellation_type);
      if (row.customer) customerStandingByShipmentId.set(row.id, row.customer);
    }
  }

  return { waitByShipmentId, cancellationTypeByShipmentId, customerStandingByShipmentId };
}
