import { fetchOperationalRows } from './dashboardService';
import { getTruckComplianceRows, getDriverComplianceRows } from './fleetService';
import { calculateDashboardAnalytics } from './dashboardAnalytics.js';

export const REPORT_TABLES = ['shipments', 'deliveries', 'drivers', 'trucks', 'maintenance_records', 'compliance_documents', 'system_settings'];
export async function getReportOverview() {
  const [shipments, deliveries, drivers, trucks, maintenance, truckCompliance, driverCompliance] = await Promise.all([
    fetchOperationalRows('shipments', 'id,status,created_at,estimated_arrival,actual_delivery_at,final_amount'),
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
