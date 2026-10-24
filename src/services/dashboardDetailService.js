import { fetchOperationalRows } from './dashboardService';
import { calculateDashboardAnalytics, latestTracking } from './dashboardAnalytics.js';
import { getComplianceConfiguration } from './complianceThresholdService';

export const DASHBOARD_TABLES = ['shipments', 'deliveries', 'trucks', 'maintenance_records', 'compliance_documents', 'tracking_logs', 'system_settings'];
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
  const [rows, deliveries, trucks] = await Promise.all([
    fetchOperationalRows('tracking_logs', 'id,delivery_id,driver_id,truck_id,latitude,longitude,recorded_at'),
    fetchOperationalRows('deliveries', 'id,truck_id,status'),
    fetchOperationalRows('trucks', 'id,plate_number'),
  ]);
  const plates = new Map(trucks.map(t => [t.id, t.plate_number]));
  return latestTracking(rows, deliveries).map(row => ({ ...row, plate: plates.get(row.truck_id) || 'Vehicle' }));
}
