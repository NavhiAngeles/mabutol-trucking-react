import { fetchOperationalRows } from './dashboardService';

export const DRIVER_REPORT_TABLES = ['drivers', 'shipments', 'deliveries', 'delivery_incidents'];
export async function getDriverReportRecords() {
  const [drivers, shipments, deliveries, incidents] = await Promise.all([
    fetchOperationalRows('drivers', 'id,full_name,status'),
    fetchOperationalRows('shipments', 'id,created_at,estimated_arrival'),
    fetchOperationalRows('deliveries', 'id,shipment_id,driver_id,status,arrived_at,odometer_start,odometer_end'),
    fetchOperationalRows('delivery_incidents', 'id,delivery_id,shipment_id,category,delay_minutes,created_at'),
  ]);
  return { drivers, shipments, deliveries, incidents };
}
