import { fetchOperationalRows } from './dashboardService';

function resolveCohortBounds(range) {
  if (!range || typeof range.start !== 'string' || typeof range.end !== 'string') return null;
  const start = range.start.trim();
  const end = range.end.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  return { start, end, lowerIso: `${start}T00:00:00+08:00`, upperIso: `${end}T23:59:59.999+08:00` };
}

export const philippineCohortBounds = resolveCohortBounds;
export const DRIVER_REPORT_TABLES = ['drivers', 'shipments', 'deliveries', 'delivery_incidents'];

export async function getDriverReportRecords(range = null) {
  const bounds = resolveCohortBounds(range);
  const shipmentFilter = bounds
    ? query => query.gte('created_at', bounds.lowerIso).lte('created_at', bounds.upperIso)
    : query => query;
  const incidentFilter = bounds
    ? query => query.gte('created_at', bounds.lowerIso).lte('created_at', bounds.upperIso)
    : query => query;

  const [drivers, shipments, deliveries, incidents] = await Promise.all([
    fetchOperationalRows('drivers', 'id,full_name,status'),
    fetchOperationalRows('shipments', 'id,created_at,estimated_arrival', shipmentFilter),
    fetchOperationalRows('deliveries', 'id,shipment_id,driver_id,status,arrived_at,odometer_start,odometer_end'),
    fetchOperationalRows('delivery_incidents', 'id,delivery_id,shipment_id,category,delay_minutes,created_at', incidentFilter),
  ]);
  return { drivers, shipments, deliveries, incidents };
}
