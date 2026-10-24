import { fetchOperationalRows } from './dashboardService';

export const REVENUE_REPORT_TABLES = ['shipments', 'customers', 'payments', 'deliveries', 'delivery_expenses', 'fuel_logs', 'maintenance_records'];
export async function getRevenueReportRecords() {
  const [shipments, customers, payments, deliveries, expenses, fuel, maintenance] = await Promise.all([
    fetchOperationalRows('shipments', 'id,status,created_at,final_amount,customer_id,billing_customer_id,pickup_address,dropoff_address'),
    fetchOperationalRows('customers', 'id,name'),
    fetchOperationalRows('payments', 'id,status,amount,paid_at'),
    fetchOperationalRows('deliveries', 'id,shipment_id'),
    fetchOperationalRows('delivery_expenses', 'id,delivery_id,category,amount,status,created_at'),
    fetchOperationalRows('fuel_logs', 'id,total_cost,logged_at'),
    fetchOperationalRows('maintenance_records', 'id,status,cost,completed_date'),
  ]);
  return { shipments, customers, payments, deliveries, expenses, fuel, maintenance };
}
