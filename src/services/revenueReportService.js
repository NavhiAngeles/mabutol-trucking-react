import { fetchOperationalRows } from './dashboardService';

function resolveCohortBounds(range) {
  if (!range || typeof range.start !== 'string' || typeof range.end !== 'string') return null;
  const start = range.start.trim();
  const end = range.end.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  return { start, end, lowerIso: `${start}T00:00:00+08:00`, upperIso: `${end}T23:59:59.999+08:00` };
}

export const philippineCohortBounds = resolveCohortBounds;
export const REVENUE_REPORT_TABLES = ['shipments', 'customers', 'payments', 'deliveries', 'delivery_expenses', 'fuel_logs', 'maintenance_records'];

export async function getRevenueReportRecords(range = null) {
  const bounds = resolveCohortBounds(range);
  const shipmentFilter = bounds
    ? query => query.gte('created_at', bounds.lowerIso).lte('created_at', bounds.upperIso)
    : query => query;
  const expenseFilter = bounds
    ? query => query.gte('created_at', bounds.lowerIso).lte('created_at', bounds.upperIso)
    : query => query;
  const fuelFilter = bounds
    ? query => query.gte('logged_at', bounds.lowerIso).lte('logged_at', bounds.upperIso)
    : query => query;
  const maintenanceFilter = bounds
    ? query => query.gte('completed_date', bounds.start).lte('completed_date', bounds.end)
    : query => query;

  const [shipments, customers, payments, deliveries, expenses, fuel, maintenance] = await Promise.all([
    fetchOperationalRows('shipments', 'id,tracking_number,status,created_at,final_amount,customer_id,billing_customer_id,pickup_address,dropoff_address', shipmentFilter),
    fetchOperationalRows('customers', 'id,name'),
    fetchOperationalRows('payments', 'id,status,amount,paid_at'),
    fetchOperationalRows('deliveries', 'id,shipment_id'),
    fetchOperationalRows('delivery_expenses', 'id,delivery_id,category,description,amount,status,created_at', expenseFilter),
    fetchOperationalRows('fuel_logs', 'id,delivery_id,liters,price_per_liter,odometer_km,station,total_cost,logged_at', fuelFilter),
    fetchOperationalRows('maintenance_records', 'id,status,cost,completed_date', maintenanceFilter),
  ]);
  return { shipments, customers, payments, deliveries, expenses, fuel, maintenance };
}
