import { supabase } from './supabaseClient';

const startedKeys = ['departed_at', 'route_started_at', 'pickup_arrived_at', 'customer_showed_at', 'grace_ends_at', 'auto_cancel_at'];

export function cancellationPolicy(shipment) {
  if (!shipment) return { allowed: false, reason: 'Shipment unavailable.' };
  const deliveries = (shipment.deliveries || []).filter(row => row.status !== 'cancelled');
  if (shipment.status === 'assigned' && deliveries.length === 1 && deliveries[0].status === 'assigned'
    && !startedKeys.some(key => deliveries[0][key])) return { allowed: true };
  if (['pending', 'booked'].includes(shipment.status) && !deliveries.length) return { allowed: true };
  return { allowed: false, reason: 'Only pending, booked or unstarted assigned shipments can be cancelled here. Started trips require operational review; no-show cancellation has its own review.' };
}

export async function fetchShipmentForCancellation(id) {
  const [shipment, deliveries, payments] = await Promise.all([
    supabase.from('shipments').select('id,tracking_number,status,updated_at,cancelled_reason,cancelled_at').eq('id', id).single(),
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
  const delivery = shipment.deliveries?.find(row => row.status !== 'cancelled');
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
