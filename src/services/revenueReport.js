import { manilaDate } from './dashboardAnalytics.js';

const DAY = 86400000;
const instant = date => Date.parse(date + 'T00:00:00+08:00');
const dateInRange = (date, range) => date && date >= range.start && date <= range.end;
const inRange = (value, range) => value && Number.isFinite(Date.parse(value)) && dateInRange(manilaDate(value), range);
const unique = rows => [...new Map(rows.map(row => [row.id, row])).values()];
function cents(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
  const result = Math.round((Number(value) + Number.EPSILON) * 100);
  return Number.isSafeInteger(result) ? result : null;
}
function sumAmounts(rows, field) {
  let total = 0, missing = 0;
  for (const row of rows) {
    const value = cents(row[field]);
    if (value == null) missing++;
    else total += value;
  }
  return { amount: total / 100, missing, count: rows.length };
}
export function buildRevenueReport(records, range) {
  const shipments = unique(records.shipments).filter(s => s.status === 'completed' && inRange(s.created_at, range));
  const customers = new Map(records.customers.map(c => [c.id, c.name]));
  const deliveries = new Map(records.deliveries.map(d => [d.id, d]));
  const expenses = unique(records.expenses).filter(e => e.status === 'approved' && inRange(e.created_at, range));
  const payments = unique(records.payments).filter(p => p.status === 'verified' && inRange(p.paid_at, range));
  const maintenance = unique(records.maintenance).filter(m => m.status === 'completed' && /^\d{4}-\d{2}-\d{2}$/.test(m.completed_date || '') && dateInRange(m.completed_date, range));
  const fuel = unique(records.fuel).filter(f => inRange(f.logged_at, range));
  const expensesByShipment = new Map();
  for (const expense of expenses) {
    const shipmentId = deliveries.get(expense.delivery_id)?.shipment_id;
    const amount = cents(expense.amount);
    if (shipmentId && amount != null) expensesByShipment.set(shipmentId, (expensesByShipment.get(shipmentId) || 0) + amount);
  }
  const customerTotals = new Map(), routes = new Map();
  const length = Math.round((instant(range.end) - instant(range.start)) / DAY) + 1;
  const step = Math.max(1, Math.ceil(length / 12));
  const trend = Array.from({ length: Math.ceil(length / step) }, (_, i) => ({ date: manilaDate(instant(range.start) + i * step * DAY), cents: 0, count: 0 }));
  for (const shipment of shipments) {
    const value = cents(shipment.final_amount);
    const customerId = shipment.billing_customer_id || shipment.customer_id || 'unlinked';
    if (!customerTotals.has(customerId)) customerTotals.set(customerId, { id: customerId, name: customers.get(customerId) || 'Unavailable customer', cents: 0, shipments: 0, priced: 0 });
    const customer = customerTotals.get(customerId);
    const origin = shipment.pickup_address?.trim() || 'Unknown pickup';
    const destination = shipment.dropoff_address?.trim() || 'Unknown destination';
    const key = JSON.stringify([origin, destination]);
    if (!routes.has(key)) routes.set(key, { id: key, route: origin + ' → ' + destination, shipments: 0, priced: 0, cents: 0, expenseCents: 0 });
    const route = routes.get(key);
    customer.shipments++; route.shipments++;
    route.expenseCents += expensesByShipment.get(shipment.id) || 0;
    if (value != null) {
      customer.cents += value; customer.priced++;
      route.cents += value; route.priced++;
      const bucket = trend[Math.floor((instant(manilaDate(shipment.created_at)) - instant(range.start)) / DAY / step)];
      bucket.cents += value; bucket.count++;
    }
  }
  const costs = new Map();
  for (const expense of expenses) {
    const value = cents(expense.amount);
    if (value == null) continue;
    const category = String(expense.category || 'other').replaceAll('_', ' ');
    costs.set(category, (costs.get(category) || 0) + value);
  }
  const charges = sumAmounts(shipments, 'final_amount');
  const ranked = [...customerTotals.values()].filter(c => c.priced).sort((a, b) => b.cents - a.cents || String(a.id).localeCompare(String(b.id)));
  return { charges, payments: sumAmounts(payments, 'amount'), expenses: sumAmounts(expenses, 'amount'),
    maintenance: sumAmounts(maintenance, 'cost'), fuel: sumAmounts(fuel, 'total_cost'),
    averageCharge: charges.count > charges.missing ? charges.amount / (charges.count - charges.missing) : null,
    undatedPayments: unique(records.payments).filter(p => p.status === 'verified' && (!p.paid_at || !Number.isFinite(Date.parse(p.paid_at)))).length,
    topCustomers: ranked.slice(0, 5).map(c => ({ ...c, revenue: c.cents / 100 })),
    routes: [...routes.values()].sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id)).map(r => ({ ...r, revenue: r.cents / 100, expenses: r.expenseCents / 100 })),
    trend: trend.map(b => ({ date: b.date, amount: b.cents / 100, count: b.count })),
    costBreakdown: [...costs].map(([category, value]) => ({ category, amount: value / 100 })).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category)) };
}
