import { fetchOperationalRows } from './dashboardService';
import { getTruckComplianceRows, getDriverComplianceRows } from './fleetService';
import { calculateDashboardAnalytics } from './dashboardAnalytics.js';

function resolveCohortBounds(range) {
  if (!range || typeof range.start !== 'string' || typeof range.end !== 'string') return null;
  const start = range.start.trim();
  const end = range.end.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  return { start, end, lowerIso: `${start}T00:00:00+08:00`, upperIso: `${end}T23:59:59.999+08:00` };
}

export const philippineCohortBounds = resolveCohortBounds;
export const REPORT_TABLES = ['shipments', 'deliveries', 'drivers', 'trucks', 'maintenance_records', 'compliance_documents', 'system_settings'];

export async function getReportOverview(range = null) {
  const bounds = resolveCohortBounds(range);
  const shipmentFilter = bounds
    ? query => query.gte('created_at', bounds.lowerIso).lte('created_at', bounds.upperIso)
    : query => query;

  const [shipments, deliveries, drivers, trucks, maintenance, truckCompliance, driverCompliance] = await Promise.all([
    fetchOperationalRows('shipments', 'id,status,created_at,estimated_arrival,actual_delivery_at,final_amount', shipmentFilter),
    fetchOperationalRows('deliveries', 'id,shipment_id,driver_id,truck_id,status'),
    fetchOperationalRows('drivers', 'id,full_name'),
    fetchOperationalRows('trucks', 'id,status'),
    fetchOperationalRows('maintenance_records', 'id,truck_id,status,scheduled_date'),
    getTruckComplianceRows(), getDriverComplianceRows(),
  ]);
  return { shipments, deliveries, drivers, compliance: [...truckCompliance, ...driverCompliance],
    resources: calculateDashboardAnalytics([], trucks, deliveries, maintenance, []).resources,
    overdue: maintenance.filter(m => m.status === 'scheduled' && m.scheduled_date < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())).length };
}
