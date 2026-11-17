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

const isClosedShipmentStatus = status => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'cancelled' || normalized === 'completed';
};

export function buildAssignmentOptions(data, today) {
  const closedShipmentIds = new Set(
    (data.shipments || [])
      .filter(row => isClosedShipmentStatus(row?.status))
      .map(row => row.id)
  );
  const isDeliveryFromClosedShipment = row =>
    isClosedShipmentStatus(row?.shipment?.status || row?.shipment_status) ||
    closedShipmentIds.has(row?.shipment_id);

  const current = data.deliveries.find(row =>
    row.shipment_id === data.shipment.id && row.status !== 'cancelled' && !isDeliveryFromClosedShipment(row)
  ) || null;
  const started = current && (current.status !== 'assigned' || current.departed_at || current.route_started_at ||
    current.pickup_arrived_at || current.customer_showed_at || current.grace_ends_at || current.auto_cancel_at);
  const blockedReason = current ? (started ? 'Active or started trips cannot be reassigned.' : null)
    : data.shipment.status !== 'booked' ? 'Only booked shipments without an active delivery can be assigned.' : null;
  const latest = latestDocuments(data.documents);
  const otherActive = data.deliveries.filter(row =>
    ACTIVE.includes(row.status) && row.id !== current?.id && !isDeliveryFromClosedShipment(row)
  );
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

const DELIVERY_COLUMNS = 'id,shipment_id,driver_id,truck_id,status,departed_at,route_started_at,pickup_arrived_at,customer_showed_at,grace_ends_at,auto_cancel_at';

async function readDeliveriesWithShipmentStatus() {
  try {
    return await read('deliveries', `${DELIVERY_COLUMNS},shipment:shipments!shipment_id(status)`);
  } catch {
    return await read('deliveries', DELIVERY_COLUMNS);
  }
}

async function releaseClosedShipmentDeliveries({ shipmentId, driverId, truckId, deliveries: preloadedDeliveries = null, cancelCurrentShipmentAssigned = false }) {
  try {
    if (typeof supabase?.from !== 'function') return [];
    let rows = preloadedDeliveries;
    if (!Array.isArray(rows)) {
      const deliveriesTable = supabase.from('deliveries');
      if (typeof deliveriesTable?.select !== 'function') return [];
      rows = await readDeliveriesWithShipmentStatus();
    }

    const activeRows = rows.filter(row => ACTIVE.includes(row?.status));
    if (!activeRows.length) return [];

    // Resolve shipment statuses for any active delivery missing nested shipment status
    const missingShipmentIds = [...new Set(activeRows.filter(row => !row.shipment?.status && row.shipment_id).map(row => row.shipment_id))];
    const shipmentStatusById = new Map();
    if (missingShipmentIds.length) {
      try {
        const shipmentsTable = supabase.from('shipments');
        if (typeof shipmentsTable?.select === 'function') {
          const query = shipmentsTable.select('id,status');
          const { data: shipRows } = typeof query?.in === 'function'
            ? await query.in('id', missingShipmentIds)
            : await query;
          for (const s of shipRows || []) {
            if (s?.id) shipmentStatusById.set(s.id, s.status);
          }
        }
      } catch {
        // Ignore lookup error and continue with known statuses
      }
    }

    const staleIds = [];
    for (const row of activeRows) {
      const matchesTarget = !driverId && !truckId && !shipmentId
        ? true
        : row.driver_id === driverId || row.truck_id === truckId || row.shipment_id === shipmentId;
      if (!matchesTarget) continue;

      const shipStatus = row.shipment?.status || row.shipment_status || shipmentStatusById.get(row.shipment_id);
      const isClosed = isClosedShipmentStatus(shipStatus);
      const isUnstartedCurrent = cancelCurrentShipmentAssigned
        && shipmentId
        && row.shipment_id === shipmentId
        && row.status === 'assigned'
        && !row.departed_at
        && !row.route_started_at
        && !row.pickup_arrived_at
        && !row.customer_showed_at
        && !row.grace_ends_at
        && !row.auto_cancel_at;

      if (isClosed || isUnstartedCurrent) {
        staleIds.push(row.id);
      }
    }

    for (const staleId of staleIds) {
      try {
        await supabase.from('deliveries').update({ status: 'cancelled' }).eq('id', staleId);
      } catch {
        // Best-effort cleanup
      }
    }
    return staleIds;
  } catch {
    return [];
  }
}

export async function fetchAssignmentOptions(shipmentId) {
  const { data: shipment, error } = await supabase.from('shipments')
    .select('id,status,booking_source,requested_vehicle_type_id,weight_kg').eq('id', shipmentId).single();
  if (error) throw error;
  const [deliveries, drivers, trucks, maintenance, documents, users] = await Promise.all([
    readDeliveriesWithShipmentStatus(),
    read('drivers', 'id,user_id,full_name,status'),
    read('trucks', 'id,plate_number,status,vehicle_type_id,capacity_kg,assigned_driver_id'),
    read('maintenance_records', 'id,truck_id,status'),
    read('compliance_documents', 'id,driver_id,truck_id,doc_type,review_status,expiry_date,created_at'),
    read('users', 'id,role,is_active'),
  ]);

  const releasedIds = await releaseClosedShipmentDeliveries({ deliveries });
  if (releasedIds.length) {
    const releasedSet = new Set(releasedIds);
    const affectedDriverIds = new Set();
    const affectedTruckIds = new Set();
    for (const row of deliveries) {
      if (releasedSet.has(row.id)) {
        row.status = 'cancelled';
        if (row.driver_id) affectedDriverIds.add(row.driver_id);
        if (row.truck_id) affectedTruckIds.add(row.truck_id);
      }
    }
    const stillActiveDrivers = new Set(deliveries.filter(d => ACTIVE.includes(d.status)).map(d => d.driver_id));
    const stillActiveTrucks = new Set(deliveries.filter(d => ACTIVE.includes(d.status)).map(d => d.truck_id));
    const inMaintenanceTrucks = new Set(maintenance.filter(m => m.status === 'in_progress').map(m => m.truck_id));

    for (const driver of drivers) {
      if (affectedDriverIds.has(driver.id) && driver.status === 'on_trip' && !stillActiveDrivers.has(driver.id)) {
        driver.status = 'available';
        try { await supabase.from('drivers').update({ status: 'available' }).eq('id', driver.id); } catch { /* ignore */ }
      }
    }
    for (const truck of trucks) {
      if (affectedTruckIds.has(truck.id) && truck.status === 'on_trip' && !stillActiveTrucks.has(truck.id) && !inMaintenanceTrucks.has(truck.id)) {
        truck.status = 'available';
        try { await supabase.from('trucks').update({ status: 'available' }).eq('id', truck.id); } catch { /* ignore */ }
      }
    }
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return buildAssignmentOptions({ shipment, deliveries, drivers, trucks, maintenance, documents, users }, today);
}

export async function saveManualAssignment({ shipmentId, driverId, truckId, reason, expectedDelivery = null }) {
  const rpcArgs = {
    p_shipment: shipmentId, p_driver: driverId, p_truck: truckId,
    p_reason: reason.trim(), p_expected_delivery: expectedDelivery,
  };
  let { data, error } = await supabase.rpc('office_assign_shipment_resources', rpcArgs);

  if (error) {
    const errMsg = String(error.message || '');
    const isReservationConflict = error.code === '23505'
      || errMsg.includes('deliveries_one_active_per_driver')
      || errMsg.includes('deliveries_one_active_per_truck')
      || errMsg.includes('deliveries_one_active_per_shipment')
      || errMsg.toLowerCase().includes('reserved by another active delivery');

    if (isReservationConflict) {
      const released = await releaseClosedShipmentDeliveries({ shipmentId, driverId, truckId });
      if (released.length) {
        const retryRpc = await supabase.rpc('office_assign_shipment_resources', rpcArgs);
        data = retryRpc.data;
        error = retryRpc.error;
      }
    }
  }

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

      let { data: newDelivery, error: delError } = await supabase
        .from('deliveries')
        .insert(deliveryPayload)
        .select('id, shipment_id, status')
        .single();

      if (delError) {
        const released = await releaseClosedShipmentDeliveries({
          shipmentId,
          driverId,
          truckId,
          cancelCurrentShipmentAssigned: true,
        });
        if (released.length) {
          const retryInsert = await supabase
            .from('deliveries')
            .insert(deliveryPayload)
            .select('id, shipment_id, status')
            .single();
          newDelivery = retryInsert.data;
          delError = retryInsert.error;
        }
      }

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
