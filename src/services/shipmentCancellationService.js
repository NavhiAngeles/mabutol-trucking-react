import { supabase } from './supabaseClient';

const startedKeys = ['departed_at', 'route_started_at', 'pickup_arrived_at', 'customer_showed_at', 'grace_ends_at', 'auto_cancel_at'];
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function cancellationPolicy(shipment, now = Date.now()) {
  if (!shipment) return { allowed: false, reason: 'Shipment unavailable.' };
  const rawStatus = String(shipment.status || '').trim().toLowerCase();
  const deliveries = (shipment.deliveries || []).filter(row => String(row?.status || '').trim().toLowerCase() !== 'cancelled');

  if (['pending', 'booked', 'assigned'].includes(rawStatus) && !deliveries.length) {
    return { allowed: true };
  }

  // 12 hours after the scheduled departure time and the driver still has not arrived at pickup
  const departureMs = Date.parse(shipment.scheduled_departure);
  const isPast12Hours = Number.isFinite(departureMs) && (now >= departureMs + TWELVE_HOURS_MS);
  const driverArrivedAtPickup = deliveries.some(d => {
    const dStatus = String(d?.status || '').trim().toLowerCase();
    return Boolean(d.pickup_arrived_at) || Boolean(d.departed_at) || ['loading', 'in_transit', 'delivered'].includes(dStatus);
  });

  if (isPast12Hours && !driverArrivedAtPickup && ['pending', 'booked', 'assigned', 'delayed'].includes(rawStatus) && deliveries.length <= 1) {
    return {
      allowed: true,
      overdue12h: true,
      reason: 'More than 12 hours past scheduled departure time without pickup arrival.',
    };
  }

  if (['booked', 'assigned'].includes(rawStatus) && deliveries.length === 1) {
    const d = deliveries[0];
    const dStatus = String(d?.status || '').trim().toLowerCase();
    const hasMilestone = startedKeys.some(key => Boolean(d[key]));

    if (dStatus === 'assigned' && !hasMilestone) {
      return { allowed: true };
    }

    const reasons = [];
    if (dStatus !== 'assigned') reasons.push(`delivery status is ${dStatus}`);
    for (const k of startedKeys) {
      if (d[k]) reasons.push(`${k.replace(/_/g, ' ')} recorded`);
    }
    const detail = reasons.length ? ` (${reasons.join(', ')})` : '';
    return {
      allowed: false,
      reason: `Started trips cannot be cancelled here${detail}. Started trips require operational review; no-show cancellation has its own review.`,
    };
  }

  return {
    allowed: false,
    reason: `Only pending, booked, unstarted assigned shipments, or shipments 12+ hours past scheduled departure without pickup arrival can be cancelled here.`,
  };
}

export async function fetchShipmentForCancellation(id) {
  const [shipment, deliveries, payments] = await Promise.all([
    supabase.from('shipments').select('id,tracking_number,status,scheduled_departure,updated_at,cancelled_reason,cancelled_at').eq('id', id).single(),
    supabase.from('deliveries').select('id,status,departed_at,route_started_at,pickup_arrived_at,customer_showed_at,grace_ends_at,auto_cancel_at').eq('shipment_id', id).neq('status', 'cancelled'),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('shipment_id', id),
  ]);
  for (const result of [shipment, deliveries, payments]) if (result.error) throw result.error;
  if (!shipment.data?.id) throw new Error('Shipment not found or access denied.');
  if (!Number.isInteger(payments.count) || payments.count < 0) throw new Error('Payment information unavailable. Reload before cancelling.');
  return { ...shipment.data, deliveries: deliveries.data || [], paymentCount: payments.count };
}

export async function cancelShipment(shipment, reason, financialAcknowledged) {
  if (!shipment?.id || !shipment.updated_at || !cancellationPolicy(shipment).allowed) throw new Error('Reload and review the shipment before cancelling.');
  const trimmed = reason.trim();
  if (trimmed.length < 5 || trimmed.length > 1000) throw new Error('Enter a cancellation reason of 5 to 1000 characters.');
  if (financialAcknowledged !== true) throw new Error('Acknowledge the financial effects before cancelling.');
  const delivery = shipment.deliveries?.find(row => String(row?.status || '').trim().toLowerCase() !== 'cancelled');
  const { data, error } = await supabase.rpc('office_cancel_shipment', {
    p_shipment: shipment.id, p_expected: shipment.updated_at, p_expected_delivery: delivery?.id || null,
    p_reason: trimmed, p_financial_ack: true,
  });
  if (error) throw error;
  if (data?.id !== shipment.id || data.status !== 'cancelled' || !data.cancelled_at || !data.updated_at) {
    throw new Error('Cancellation was not confirmed. Reload before retrying.');
  }
  return data;
}
