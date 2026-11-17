import { fetchOperationalRows } from './dashboardService';
import { calculateDashboardAnalytics, latestTracking } from './dashboardAnalytics.js';
import { getComplianceConfiguration } from './complianceThresholdService';

export const DASHBOARD_TABLES = [
  'shipments',
  'deliveries',
  'trucks',
  'drivers',
  'maintenance_records',
  'compliance_documents',
  'tracking_logs',
  'system_settings',
];

export async function getDashboardDetails() {
  const [shipments, trucks, deliveries, maintenance, docs, configuration] = await Promise.all([
    fetchOperationalRows('shipments', 'id,status,created_at,estimated_arrival,actual_delivery_at'),
    fetchOperationalRows('trucks', 'id,status'),
    fetchOperationalRows('deliveries', 'id,shipment_id,truck_id,status,departed_at,arrived_at'),
    fetchOperationalRows('maintenance_records', 'id,truck_id,status,scheduled_date'),
    fetchOperationalRows('compliance_documents', 'id,truck_id,driver_id,doc_type,review_status,expiry_date,created_at,remarks'),
    getComplianceConfiguration(),
  ]);
  return calculateDashboardAnalytics(shipments, trucks, deliveries, maintenance, docs, Date.now(), configuration);
}

export async function getLiveTracking() {
  const [rows, deliveries, trucks, shipments, drivers] = await Promise.all([
    fetchOperationalRows('tracking_logs', 'id,delivery_id,driver_id,truck_id,latitude,longitude,recorded_at'),
    fetchOperationalRows(
      'deliveries',
      'id,shipment_id,truck_id,driver_id,status,route_started_at,pickup_arrived_at,customer_showed_at,departed_at'
    ),
    fetchOperationalRows('trucks', 'id,plate_number,model'),
    fetchOperationalRows(
      'shipments',
      'id,tracking_number,pickup_address,dropoff_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,route_geometry,distance_km,route_duration_minutes,status'
    ).catch(() => []),
    fetchOperationalRows('drivers', 'id,full_name').catch(() => []),
  ]);

  const plates = new Map(trucks.map(t => [t.id, t.plate_number]));
  const models = new Map(trucks.map(t => [t.id, t.model]));
  const shipmentsMap = new Map(shipments.map(s => [s.id, s]));
  const driversMap = new Map(drivers.map(d => [d.id, d.full_name]));
  const deliveriesMap = new Map(deliveries.map(d => [d.id, d]));

  const tracked = latestTracking(rows, deliveries);
  const trackedTruckIds = new Set(tracked.map(t => t.truck_id));

  // Also include active trucks on the way (to pickup or destination) that don't have a GPS log yet
  const activeDeliveries = deliveries.filter(d => ['assigned', 'loading', 'in_transit'].includes(d.status));
  for (const delivery of activeDeliveries) {
    if (delivery.truck_id && !trackedTruckIds.has(delivery.truck_id)) {
      const shipment = shipmentsMap.get(delivery.shipment_id);
      const lat = shipment?.pickup_lat != null
        ? Number(shipment.pickup_lat)
        : (shipment?.dropoff_lat != null ? Number(shipment.dropoff_lat) : null);
      const lng = shipment?.pickup_lng != null
        ? Number(shipment.pickup_lng)
        : (shipment?.dropoff_lng != null ? Number(shipment.dropoff_lng) : null);

      if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        tracked.push({
          id: `initial-${delivery.id}`,
          delivery_id: delivery.id,
          truck_id: delivery.truck_id,
          driver_id: delivery.driver_id,
          latitude: lat,
          longitude: lng,
          recorded_at: delivery.route_started_at || delivery.departed_at || new Date().toISOString(),
          stale: false,
          isInitialLocation: true,
        });
        trackedTruckIds.add(delivery.truck_id);
      }
    }
  }

  return tracked.map(row => {
    const delivery = deliveriesMap.get(row.delivery_id);
    const shipment = delivery ? shipmentsMap.get(delivery.shipment_id) : null;
    const driverName = delivery ? driversMap.get(delivery.driver_id) : null;
    const plate = plates.get(row.truck_id) || 'Vehicle';
    const model = models.get(row.truck_id) || '';
    const status = delivery?.status || 'in_transit';

    let leg = 'pickup';
    let legLabel = 'On the way to pickup location';
    if (status === 'loading') {
      leg = 'loading';
      legLabel = 'At pickup location (Loading cargo)';
    } else if (status === 'in_transit') {
      leg = 'destination';
      legLabel = 'On the way to destination';
    }

    const pickupCoords = (shipment?.pickup_lat != null && shipment?.pickup_lng != null)
      ? [Number(shipment.pickup_lng), Number(shipment.pickup_lat)]
      : null;
    const dropoffCoords = (shipment?.dropoff_lat != null && shipment?.dropoff_lng != null)
      ? [Number(shipment.dropoff_lng), Number(shipment.dropoff_lat)]
      : null;

    return {
      ...row,
      plate,
      model,
      driver_name: driverName || 'Assigned Driver',
      tracking_number: shipment?.tracking_number || '',
      delivery_status: status,
      leg,
      leg_label: legLabel,
      pickup_address: shipment?.pickup_address || '',
      dropoff_address: shipment?.dropoff_address || '',
      pickup_coordinates: pickupCoords,
      dropoff_coordinates: dropoffCoords,
      route_geometry: shipment?.route_geometry || null,
      distance_km: shipment?.distance_km ?? null,
      route_duration_minutes: shipment?.route_duration_minutes ?? null,
    };
  });
}
