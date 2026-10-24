// Explicit report columns keep internal IDs, cents and raw joined records out of exports.
export class CsvNumber {
  constructor(value, digits) { this.text = Number(value).toFixed(digits); }
}
const num = (value, digits = 0) => value == null || value === '' || !Number.isFinite(Number(value)) ? 'Unavailable' : new CsvNumber(value, digits);
const pct = value => value == null || !Number.isFinite(Number(value)) ? 'Unavailable' : Number(value).toFixed(1) + '%';
const label = value => String(value ?? 'Unavailable').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
export const philippineTimestamp = value => value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 28800000).toISOString().slice(0, 19).replace('T', ' ') + ' +08:00' : 'Unavailable';

export function reportTables(title, range, report) {
  const rows = [];
  const table = (name, headers, records) => rows.push([], [name], headers, ...(records.length ? records : [['No records in this section.']]));
  const summary = records => table('Summary', ['Metric', 'Value', 'Unit'], records);
  const buckets = (records, fields) => (records || []).map((row, i) => [row.date,
    records[i + 1] ? new Date(Date.parse(records[i + 1].date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) : range.end,
    ...fields.map(([key, format]) => format(row[key]))]);
  if (title === 'Overview') {
    rows.push(['Scope', 'Shipments created in the selected dates; current shipment status. Fleet/compliance are current snapshots. Charges are not payments or profit.']);
    summary([
      ['Total shipments', num(report.total), 'Shipments'], ['Completed shipments', num(report.completed), 'Shipments'],
      ['Delayed shipments', num(report.delayed), 'Shipments'], ['On-time rate', pct(report.onTime), 'Percent'],
      ['Completed shipments with valid arrival timestamps', num(report.timed), 'Shipments'],
      ['Completed charges', num(report.revenue, 2), 'PHP'], ['Completed shipments missing valid amounts', num(report.missingAmounts), 'Shipments'],
      ['Compliance entities assessed', num(report.complianceTotal), 'Drivers and vehicles'],
      ['Current compliance rate', report.complianceTotal > 0 ? pct(report.compliance?.verified / report.complianceTotal * 100) : 'Unavailable', 'Percent'],
      ['Overdue service records', num(report.overdueServiceRecords), 'Records'],
    ]);
    table('Shipment volume by creation period', ['Period start', 'Period end (inclusive)', 'Completed shipments', 'Delayed shipments', 'Completed charges (PHP)'], buckets(report.buckets, [['completed', num], ['delayed', num], ['revenue', value => num(value, 2)]]));
    table('Driver on-time performance', ['Driver name', 'Timed completed trips', 'On-time rate'], (report.drivers || []).map(row => [row.full_name, num(row.trips), pct(row.pct)]));
    table('Current compliance', ['Classification', 'Drivers and vehicles'], ['verified', 'expiring', 'attention', 'pending'].map(key => [{ verified: 'Verified', expiring: 'Expiring soon', attention: 'Missing / expired / rejected / critical', pending: 'Pending review' }[key], num(report.compliance?.[key])]));
    table('Current fleet', ['Classification', 'Vehicles'], ['total', 'available', 'inUse', 'maintenance', 'other'].map(key => [{ total: 'Total fleet', available: 'Dispatch ready', inUse: 'In use / reserved', maintenance: 'Maintenance', other: 'Other' }[key], num(report.fleet?.[key])]));
  } else if (title === 'Shipments') {
    rows.push(['Scope', 'Shipments created in the selected dates using current status; supplied search/status filters apply.']);
    summary([['Total shipments', num(report.total), 'Shipments'], ['On-time rate', pct(report.rate), 'Percent'], ['Completed shipments with valid arrival timestamps', num(report.timed), 'Shipments']]);
    table('Shipment status', ['Status', 'Shipments'], Object.entries(report.breakdown || {}).map(([key, count]) => [label(key), num(count)]));
    table('On-time performance by creation period', ['Period start', 'Period end (inclusive)', 'On-time rate', 'Timed completed shipments'], buckets(report.trend, [['rate', pct], ['count', num]]));
    table('Shipment ledger', ['Tracking number', 'Customer', 'Route', 'Driver', 'Current status', 'Created (Philippine time)', 'Scheduled departure (Philippine time)', 'Estimated arrival (Philippine time)', 'Actual delivery (Philippine time)', 'Delivery variance'],
      (report.rows || []).map(row => [row.tracking_number || 'Unavailable', row.customerName, row.route, row.driverName, label(row.status), philippineTimestamp(row.created_at), philippineTimestamp(row.scheduled_departure), philippineTimestamp(row.estimated_arrival), philippineTimestamp(row.actual_delivery_at), row.variance === '—' ? 'Unavailable' : row.variance]));
  } else if (title === 'Drivers') {
    rows.push(['Scope', 'Non-cancelled assignments for shipments created in the selected dates. Incidents use reported dates and the delivery-linked driver. Status is current; kilometres use valid odometer differences.']);
    summary([['Assigned trips', num(report.totalTrips), 'Trips'], ['Drivers with trips', num(report.driversWithTrips), 'Drivers'], ['On-time rate', pct(report.rate), 'Percent'], ['Timed completed trips', num(report.timed), 'Trips'], ['Unattributed incidents', num(report.unattributedIncidents), 'Incidents']]);
    table('Driver performance', ['Driver name', 'Current status', 'Assigned trips', 'Completed trips', 'Timed completed trips', 'On-time trips', 'On-time rate', 'Recorded distance (km)', 'Trips with valid odometer readings', 'Reported incidents'],
      (report.rows || []).map(row => [row.name, label(row.status), num(row.trips), num(row.completed), num(row.timed), num(row.onTime), pct(row.rate), num(row.km, 1), num(row.measuredTrips), num(row.incidents?.length)]));
    table('Reported incidents by category', ['Category', 'Incidents'], (report.incidents || []).map(row => [row.label, num(row.count)]));
    table('Incident details', ['Driver name', 'Reported (Philippine time)', 'Category', 'Reported delay (minutes)'], (report.rows || []).flatMap(row => (row.incidents || []).map(incident => [row.name, philippineTimestamp(incident.created_at), label(incident.category), num(incident.delay_minutes)])));
  } else if (title === 'Revenue') {
    rows.push(['Scope', 'Charges/customer rankings/routes use shipment creation dates and current completed status. Payments use payment dates; approved expenses use creation dates; maintenance uses completion dates. Fuel and repair costs can overlap; totals must not be added as profit calculations.']);
    summary([
      ...[['Completed charges', 'charges'], ['Verified payments', 'payments'], ['Approved trip expenses', 'expenses'], ['Completed maintenance costs', 'maintenance'], ['Recorded fuel costs (may overlap expenses)', 'fuel']].flatMap(([name, key]) => [[name, num(report[key]?.amount, 2), 'PHP'], [name + ' — records', num(report[key]?.count), 'Records'], [name + ' — missing valid amounts', num(report[key]?.missing), 'Records']]),
      ['Average completed charge', num(report.averageCharge, 2), 'PHP'], ['Verified payments without a valid payment date', num(report.undatedPayments), 'Records'],
    ]);
    table('Completed charges by creation period', ['Period start', 'Period end (inclusive)', 'Completed charges (PHP)', 'Priced shipments'], buckets(report.trend, [['amount', value => num(value, 2)], ['count', num]]));
    table('Top customers by completed charges', ['Customer', 'Completed shipments', 'Priced shipments', 'Completed charges (PHP)'], (report.topCustomers || []).map(row => [row.name, num(row.shipments), num(row.priced), num(row.revenue, 2)]));
    table('Charges by route', ['Route', 'Completed shipments', 'Priced shipments', 'Completed charges (PHP)', 'Approved linked trip expenses (PHP)'], (report.routes || []).map(row => [row.route, num(row.shipments), num(row.priced), num(row.revenue, 2), num(row.expenses, 2)]));
    table('Approved trip expenses by category', ['Category', 'Amount (PHP)'], (report.costBreakdown || []).map(row => [row.category, num(row.amount, 2)]));
  } else return null;
  return rows;
}
