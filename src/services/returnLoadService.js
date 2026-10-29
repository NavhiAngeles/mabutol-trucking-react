import { fetchOperationalRows } from './dashboardService';

// Existing authenticated reads and RLS; never a privileged client or a new write path.
export async function loadReturnLoadData(read = fetchOperationalRows) {
  const [shipments, deliveries, trucks, maintenance] = await Promise.all([
    read('shipments', 'id,tracking_number,status,pickup_address,dropoff_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,requested_vehicle_type_id,weight_kg,scheduled_departure,estimated_arrival,actual_delivery_at,special_handling'),
    read('deliveries', 'id,shipment_id,truck_id,driver_id,status'),
    read('trucks', 'id,plate_number,status,vehicle_type_id,capacity_kg'),
    read('maintenance_records', 'id,truck_id,status'),
  ]);
  return { shipments, deliveries, trucks, maintenance };
}
