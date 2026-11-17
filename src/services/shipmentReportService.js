import { fetchOperationalRows } from './dashboardService';
import { fetchShipmentAssignments } from './shipmentService';

function resolveCohortBounds(range) {
  if (!range || typeof range.start !== 'string' || typeof range.end !== 'string') return null;
  const start = range.start.trim();
  const end = range.end.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  return { start, end, lowerIso: `${start}T00:00:00+08:00`, upperIso: `${end}T23:59:59.999+08:00` };
}

export const philippineCohortBounds = resolveCohortBounds;
export const SHIPMENT_REPORT_TABLES = ['shipments', 'deliveries', 'customers', 'drivers'];

export async function getShipmentReportRecords(range = null) {
  const bounds = resolveCohortBounds(range);
  const shipmentFilter = bounds
    ? query => query.gte('created_at', bounds.lowerIso).lte('created_at', bounds.upperIso)
    : query => query;

  const [shipments, deliveries] = await Promise.all([
    fetchOperationalRows('shipments', 'id,tracking_number,status,created_at,pickup_address,dropoff_address,estimated_arrival,actual_delivery_at,customer:customers!shipments_customer_id_fkey(name)', shipmentFilter),
    fetchShipmentAssignments(),
  ]);
  return { shipments, deliveries };
}
