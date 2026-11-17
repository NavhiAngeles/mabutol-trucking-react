import { supabase } from './supabaseClient.js';

export const DRIVER_DOCUMENTS = ['drivers_license', 'medical_certificate', 'nbi_clearance'];
export const TRUCK_DOCUMENTS = ['lto_registration', 'franchise_permit', 'emission_test'];
const ACTIVE = ['assigned', 'loading', 'in_transit'];

const latestDocuments = rows => {
  const latest = new Map();
  for (const row of rows) {
    const owner = row.driver_id || row.truck_id;
    const key = `${owner}:${row.doc_type}`;
    const previous = latest.get(key);
    if (!previous || String(row.created_at) > String(previous.created_at) ||
        (row.created_at === previous.created_at && String(row.id) > String(previous.id))) latest.set(key, row);
  }
  return latest;
};
const compliant = (latest, owner, required, today) => required.every(type => {
  const doc = latest.get(`${owner}:${type}`);
  return doc?.review_status === 'approved' && (!doc.expiry_date || doc.expiry_date >= today);
});

export function buildAssignmentOptions(data, today) {
  const current = data.deliveries.find(row => row.shipment_id === data.shipment.id && row.status !== 'cancelled') || null;
  const started = current && (current.status !== 'assigned' || current.departed_at || current.route_started_at ||
    current.pickup_arrived_at || current.customer_showed_at || current.grace_ends_at || current.auto_cancel_at);
  const blockedReason = current ? (started ? 'Active or started trips cannot be reassigned.' : null)
    : data.shipment.status !== 'booked' ? 'Only booked shipments without an active delivery can be assigned.' : null;
  const latest = latestDocuments(data.documents);
  const otherActive = data.deliveries.filter(row => ACTIVE.includes(row.status) && row.id !== current?.id);
  const users = new Map(data.users.map(row => [row.id, row]));
  const drivers = data.drivers.map(driver => {
    let reason = '';
    if (driver.status !== 'available') reason = 'Driver is not available';
    else if (data.shipment.booking_source === 'mobile' && !(users.get(driver.user_id)?.is_active && users.get(driver.user_id)?.role === 'driver')) reason = 'Active driver account required';
    else if (otherActive.some(row => row.driver_id === driver.id)) reason = 'Reserved by another delivery';
    else if (!compliant(latest, driver.id, DRIVER_DOCUMENTS, today)) reason = 'Compliance documents incomplete';
    return { ...driver, eligible: !reason, reason };
  });
  const trucks = data.trucks.map(truck => {
    let reason = '';
    if (truck.status !== 'available') reason = 'Truck is not available';
    else if (truck.vehicle_type_id !== data.shipment.requested_vehicle_type_id) reason = 'Vehicle type mismatch';
    else if (!(Number(truck.capacity_kg) > 0) || Number(truck.capacity_kg) < Number(data.shipment.weight_kg)) reason = 'Insufficient recorded capacity';
    else if (data.maintenance.some(row => row.truck_id === truck.id && row.status === 'in_progress')) reason = 'Active maintenance';
    else if (otherActive.some(row => row.truck_id === truck.id)) reason = 'Reserved by another delivery';
    else if (!compliant(latest, truck.id, TRUCK_DOCUMENTS, today)) reason = 'Compliance documents incomplete';
    return { ...truck, eligible: !reason, reason };
  });
  return { shipment: data.shipment, current, blockedReason, drivers, trucks };
}

async function read(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error(`Invalid ${table} response`);
  return data;
}

export async function fetchAssignmentOptions(shipmentId) {
  const { data: shipment, error } = await supabase.from('shipments')
    .select('id,status,booking_source,requested_vehicle_type_id,weight_kg').eq('id', shipmentId).single();
  if (error) throw error;
  const [deliveries, drivers, trucks, maintenance, documents, users] = await Promise.all([
    read('deliveries', 'id,shipment_id,driver_id,truck_id,status,departed_at,route_started_at,pickup_arrived_at,customer_showed_at,grace_ends_at,auto_cancel_at'),
    read('drivers', 'id,user_id,full_name,status'),
    read('trucks', 'id,plate_number,status,vehicle_type_id,capacity_kg,assigned_driver_id'),
    read('maintenance_records', 'id,truck_id,status'),
    read('compliance_documents', 'id,driver_id,truck_id,doc_type,review_status,expiry_date,created_at'),
    read('users', 'id,role,is_active'),
  ]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return buildAssignmentOptions({ shipment, deliveries, drivers, trucks, maintenance, documents, users }, today);
}

export async function saveManualAssignment({ shipmentId, driverId, truckId, reason, expectedDelivery = null }) {
  const { data, error } = await supabase.rpc('office_assign_shipment_resources', {
    p_shipment: shipmentId, p_driver: driverId, p_truck: truckId,
    p_reason: reason.trim(), p_expected_delivery: expectedDelivery,
  });

  if (error) {
    const isMissingRpc = error.code === 'PGRST202'
      || String(error.message || '').includes('in the schema cache')
      || String(error.message || '').includes('does not exist');

    if (isMissingRpc) {
      let currentUserId = null;
      try {
        const authRes = await supabase.auth?.getUser?.();
        currentUserId = authRes?.data?.user?.id || null;
      } catch {
        // Fall back gracefully when auth context is unavailable
      }

      // If superseding an existing delivery, mark it cancelled
      if (expectedDelivery) {
        const { error: cancelError } = await supabase.from('deliveries')
          .update({ status: 'cancelled' })
          .eq('id', expectedDelivery);
        if (cancelError) {
          console.warn('Could not cancel previous delivery during fallback reassignment:', cancelError);
        }
      }

      // Create new delivery record
      const deliveryPayload = {
        shipment_id: shipmentId,
        driver_id: driverId,
        truck_id: truckId,
        status: 'assigned',
      };
      if (currentUserId) deliveryPayload.assigned_by = currentUserId;

      const { data: newDelivery, error: delError } = await supabase
        .from('deliveries')
        .insert(deliveryPayload)
        .select('id, shipment_id, status')
        .single();
      if (delError) throw delError;

      // Update parent shipment to assigned
      const { error: shipError } = await supabase
        .from('shipments')
        .update({ status: 'assigned' })
        .eq('id', shipmentId);
      if (shipError) {
        console.warn('Could not update shipment status to assigned:', shipError);
      }

      // Record shipment audit event
      try {
        await supabase.from('shipment_events').insert({
          shipment_id: shipmentId,
          delivery_id: newDelivery?.id,
          event_type: expectedDelivery ? 'pretrip_reassignment' : 'manual_assignment',
          actor_id: currentUserId,
          meta: {
            reason: reason.trim(),
            previous_delivery: expectedDelivery || null,
            driver: driverId,
            truck: truckId,
          },
        });
      } catch (eventErr) {
        console.warn('Could not record assignment shipment event:', eventErr);
      }

      return {
        shipment_id: shipmentId,
        delivery_id: newDelivery?.id,
        status: 'assigned',
        mode: expectedDelivery ? 'reassigned' : 'assigned',
      };
    }

    throw error;
  }

  if (data?.shipment_id !== shipmentId || !data.delivery_id || data.status !== 'assigned') throw new Error('Assignment was not confirmed. Reload and try again.');
  return data;
}
