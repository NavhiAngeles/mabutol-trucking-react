import { fetchOperationalRows } from './dashboardService';
import { fetchShipmentAssignments } from './shipmentService';

export const SHIPMENT_REPORT_TABLES = ['shipments', 'deliveries', 'customers', 'drivers'];
export async function getShipmentReportRecords() {
  const [shipments, deliveries] = await Promise.all([
    fetchOperationalRows('shipments', 'id,tracking_number,status,created_at,pickup_address,dropoff_address,estimated_arrival,actual_delivery_at,customer:customers!shipments_customer_id_fkey(name)'),
    fetchShipmentAssignments(),
  ]);
  return { shipments, deliveries };
}
