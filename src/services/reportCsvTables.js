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
  } else if (title === 'Customers') {
    const customers = report.customers || [];
    const stats = report.stats || {};
    const activeCount = customers.filter(c => (c.status || 'Active') === 'Active').length;
    const suspendedCount = customers.filter(c => c.status === 'Suspended').length;
    rows.push(['Scope', 'Registered customer directory snapshot matching the active search, status, and sort filters.']);
    summary([
      ['Total customers', num(stats.total ?? customers.length), 'Customers'],
      ['Active this month', num(stats.activeThisMonth ?? 0), 'Customers'],
      ['New this week', num(stats.newThisWeek ?? 0), 'Customers'],
      ['Suspended accounts', num(stats.suspended ?? suspendedCount), 'Customers'],
    ]);
    table('Customer status breakdown', ['Status', 'Customers'], [
      ['Active', num(activeCount)],
      ['Suspended', num(suspendedCount)],
    ]);
    table(
      'Customer directory',
      ['Customer ID', 'Name', 'Email', 'Contact Number', 'Total Bookings', 'Last Booking', 'Member Since', 'Status'],
      customers.map(row => [
        row.customer_code || row.id || 'Unavailable',
        row.name || 'Unavailable',
        row.email || 'Unavailable',
        row.phone || 'Unavailable',
        num(row.bookingCount ?? row.bookings ?? 0),
        row.lastBooking || 'Never',
        row.memberSince || 'Unavailable',
        row.status || 'Active',
      ])
    );
  } else return null;
  return rows;
}

export function reportStructuredSections(title, range, report) {
  const rawRows = reportTables(title, range, report);
  if (!rawRows) return null;
  let scope = '';
  const sections = [];
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || !row.length) continue;
    if (row[0] === 'Scope') {
      scope = row[1] || '';
      continue;
    }
    if (row.length === 1 && rawRows[i + 1] && rawRows[i + 1].length > 1) {
      const sectionTitle = row[0];
      const headers = rawRows[i + 1].map(h => String(h ?? ''));
      const records = [];
      i += 1;
      while (i + 1 < rawRows.length && rawRows[i + 1].length > 0 && !(rawRows[i + 1].length === 1 && rawRows[i + 2] && rawRows[i + 2].length > 1)) {
        i++;
        records.push(rawRows[i].map(val => val instanceof CsvNumber ? val.text : String(val ?? '')));
      }
      sections.push({ title: sectionTitle, headers, records });
    }
  }
  return { scope, sections };
}

const KPI_SECTION_TITLES = new Set(['Summary']);
const CHART_SECTION_TITLES = new Set([
  'Shipment volume by creation period',
  'Shipment status',
  'On-time performance by creation period',
  'Reported incidents by category',
  'Completed charges by creation period',
  'Approved trip expenses by category',
  'Customer status breakdown',
]);

export function classifyReportSection(sectionTitle) {
  if (KPI_SECTION_TITLES.has(sectionTitle)) return 'kpi';
  if (CHART_SECTION_TITLES.has(sectionTitle)) return 'charts';
  return 'table';
}

export function filterReportSections(sections, includedSections) {
  if (!includedSections) return sections;
  return sections.filter(section => includedSections[classifyReportSection(section.title)] !== false);
}

const fmtCurrency = value => (value == null || value === '' || !Number.isFinite(Number(value)) ? '0.00' : Number(value).toFixed(2));
const fmtInt = value => (value == null || value === '' || !Number.isFinite(Number(value)) ? '0' : String(Math.round(Number(value))));
const fmtPct = value => (value == null || !Number.isFinite(Number(value)) ? 'N/A' : Number(value).toFixed(1) + '%');

export function getReportKpiCards(title, report) {
  if (!report) return [];
  if (title === 'Overview') {
    const compliancePct = report.complianceTotal > 0
      ? Math.round((report.compliance?.verified || 0) / report.complianceTotal * 100) + '%'
      : 'N/A';
    return [
      { label: 'Total Shipments', value: fmtInt(report.total), sub: `${fmtInt(report.completed)} completed · ${fmtInt(report.delayed)} delayed` },
      { label: 'On-Time Rate', value: fmtPct(report.onTime), sub: `${fmtInt(report.timed)} timed completed` },
      { label: 'Completed Charges', value: `PHP ${fmtCurrency(report.revenue)}`, sub: 'Recorded final amounts' },
      { label: 'Current Compliance', value: compliancePct, sub: `${fmtInt(report.compliance?.verified)} of ${fmtInt(report.complianceTotal)} verified` },
    ];
  }
  if (title === 'Shipments') {
    return [
      { label: 'Total Shipments', value: fmtInt(report.total), sub: 'Created in selected range' },
      { label: 'Completed', value: fmtInt(report.breakdown?.completed), sub: `${fmtInt(report.breakdown?.delayed)} delayed` },
      { label: 'On-Time Rate', value: fmtPct(report.rate), sub: `${fmtInt(report.timed)} timed completed` },
      { label: 'Cancelled', value: fmtInt(report.breakdown?.cancelled), sub: 'Excluded from on-time rate' },
    ];
  }
  if (title === 'Drivers') {
    const incidentCount = (report.rows || []).reduce((sum, r) => sum + (r.incidents?.length || 0), 0);
    return [
      { label: 'Assigned Trips', value: fmtInt(report.totalTrips), sub: 'Non-cancelled assignments' },
      { label: 'Drivers with Trips', value: fmtInt(report.driversWithTrips), sub: 'Active in selected range' },
      { label: 'On-Time Rate', value: fmtPct(report.rate), sub: `${fmtInt(report.timed)} timed trips` },
      { label: 'Reported Incidents', value: fmtInt(incidentCount), sub: `${fmtInt(report.unattributedIncidents)} unattributed` },
    ];
  }
  if (title === 'Revenue') {
    return [
      { label: 'Completed Charges', value: `PHP ${fmtCurrency(report.charges?.amount)}`, sub: `${fmtInt(report.charges?.count)} records` },
      { label: 'Verified Payments', value: `PHP ${fmtCurrency(report.payments?.amount)}`, sub: `${fmtInt(report.payments?.count)} records` },
      { label: 'Approved Expenses', value: `PHP ${fmtCurrency(report.expenses?.amount)}`, sub: `${fmtInt(report.expenses?.count)} records` },
      { label: 'Average Charge', value: report.averageCharge == null ? 'N/A' : `PHP ${fmtCurrency(report.averageCharge)}`, sub: 'Per priced shipment' },
    ];
  }
  if (title === 'Customers') {
    const customers = report.customers || [];
    const stats = report.stats || {};
    return [
      { label: 'Total Customers', value: fmtInt(stats.total ?? customers.length), sub: `${customers.length} in current view` },
      { label: 'Active This Month', value: fmtInt(stats.activeThisMonth), sub: 'With bookings this month' },
      { label: 'New This Week', value: fmtInt(stats.newThisWeek), sub: 'Registered this week' },
      { label: 'Suspended', value: fmtInt(stats.suspended), sub: 'Restricted accounts' },
    ];
  }
  return [];
}

export function getCsvDatasets(title) {
  if (title === 'Overview') {
    return [
      { key: 'volume', label: 'Shipment Volume by Period' },
      { key: 'drivers', label: 'Driver On-Time Performance' },
      { key: 'compliance_fleet', label: 'Compliance & Fleet Summary' },
      { key: 'full', label: 'Full Summary Report' },
    ];
  }
  if (title === 'Shipments') {
    return [
      { key: 'ledger', label: 'Shipment Ledger' },
      { key: 'trend', label: 'On-Time Performance by Period' },
      { key: 'status', label: 'Shipment Status Breakdown' },
      { key: 'full', label: 'Full Summary Report' },
    ];
  }
  if (title === 'Drivers') {
    return [
      { key: 'performance', label: 'Driver Performance' },
      { key: 'incidents', label: 'Incident Details' },
      { key: 'full', label: 'Full Summary Report' },
    ];
  }
  if (title === 'Revenue') {
    return [
      { key: 'routes', label: 'Charges by Route' },
      { key: 'customers', label: 'Top Customers by Charges' },
      { key: 'trend', label: 'Completed Charges by Period' },
      { key: 'costs', label: 'Approved Expenses by Category' },
      { key: 'full', label: 'Full Summary Report' },
    ];
  }
  return [{ key: 'full', label: 'Full Summary Report' }];
}

export function getCsvDataset(title, range, report, datasetKey) {
  const structured = reportStructuredSections(title, range, report);
  if (!structured) return { label: 'Report Data', headers: ['Field', 'Value'], rows: [] };

  const sectionByTitle = name => structured.sections.find(s => s.title === name);

  if (datasetKey && datasetKey !== 'full') {
    if (title === 'Overview') {
      if (datasetKey === 'volume') {
        const sec = sectionByTitle('Shipment volume by creation period');
        return { label: 'Shipment Volume by Period', headers: sec?.headers || [], rows: sec?.records || [] };
      }
      if (datasetKey === 'drivers') {
        const sec = sectionByTitle('Driver on-time performance');
        return { label: 'Driver On-Time Performance', headers: sec?.headers || [], rows: sec?.records || [] };
      }
      if (datasetKey === 'compliance_fleet') {
        const comp = sectionByTitle('Current compliance');
        const fleet = sectionByTitle('Current fleet');
        const rows = [
          ...(comp?.records || []).map(r => ['Compliance', r[0], r[1]]),
          ...(fleet?.records || []).map(r => ['Fleet', r[0], r[1]]),
        ];
        return { label: 'Compliance & Fleet Summary', headers: ['Category', 'Classification', 'Count'], rows };
      }
    }
    if (title === 'Shipments') {
      if (datasetKey === 'ledger') {
        const sec = sectionByTitle('Shipment ledger');
        return { label: 'Shipment Ledger', headers: sec?.headers || [], rows: sec?.records || [] };
      }
      if (datasetKey === 'trend') {
        const sec = sectionByTitle('On-time performance by creation period');
        return { label: 'On-Time Performance by Period', headers: sec?.headers || [], rows: sec?.records || [] };
      }
      if (datasetKey === 'status') {
        const sec = sectionByTitle('Shipment status');
        return { label: 'Shipment Status Breakdown', headers: sec?.headers || [], rows: sec?.records || [] };
      }
    }
    if (title === 'Drivers') {
      if (datasetKey === 'performance') {
        const sec = sectionByTitle('Driver performance');
        return { label: 'Driver Performance', headers: sec?.headers || [], rows: sec?.records || [] };
      }
      if (datasetKey === 'incidents') {
        const sec = sectionByTitle('Incident details');
        return { label: 'Incident Details', headers: sec?.headers || [], rows: sec?.records || [] };
      }
    }
    if (title === 'Revenue') {
      if (datasetKey === 'routes') {
        const sec = sectionByTitle('Charges by route');
        return { label: 'Charges by Route', headers: sec?.headers || [], rows: sec?.records || [] };
      }
      if (datasetKey === 'customers') {
        const sec = sectionByTitle('Top customers by completed charges');
        return { label: 'Top Customers by Charges', headers: sec?.headers || [], rows: sec?.records || [] };
      }
      if (datasetKey === 'trend') {
        const sec = sectionByTitle('Completed charges by creation period');
        return { label: 'Completed Charges by Period', headers: sec?.headers || [], rows: sec?.records || [] };
      }
      if (datasetKey === 'costs') {
        const sec = sectionByTitle('Approved trip expenses by category');
        return { label: 'Approved Expenses by Category', headers: sec?.headers || [], rows: sec?.records || [] };
      }
    }
  }

  // Full Summary Report: flattened clean table with Section, Item, Value, Details
  const fullRows = [];
  for (const sec of structured.sections) {
    for (const rec of sec.records) {
      fullRows.push([
        sec.title,
        rec[0] ?? '',
        rec[1] ?? '',
        rec.slice(2).filter(Boolean).join(' | '),
      ]);
    }
  }
  return {
    label: 'Full Summary Report',
    headers: ['Section', 'Item / Period', 'Primary Value', 'Additional Details'],
    rows: fullRows,
  };
}

const toNumericOrRaw = val => {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return val;
};

export function getExcelWorkbookSheets(title, range, report, filters = {}, options = {}) {
  const included = options.includedSections || { kpi: true, charts: true, table: true };
  const includeHeader = options.includeHeader !== false;
  const customTitle = options.customTitle?.trim() || `Reports: ${title}`;
  const structured = reportStructuredSections(title, range, report);
  const sheets = [];

  if (included.kpi !== false) {
    const kpiCards = getReportKpiCards(title, report);
    const metaRows = includeHeader
      ? [
          ['Company', 'TANAW · Mabutol Trucking Logistics', ''],
          ['Report Title', customTitle, ''],
          ['Date Range (Asia/Manila)', `${range.start} to ${range.end}`, ''],
          ['Generated At (PHT)', philippineTimestamp(new Date().toISOString()), ''],
          ...Object.entries(filters)
            .filter(([, v]) => v !== undefined && v !== '' && v !== 'all')
            .map(([k, v]) => [`Filter (${k})`, String(v), '']),
        ]
      : [];

    const kpiRows = kpiCards.map(card => [
      card.label,
      card.value.startsWith('PHP ') ? Number(card.value.slice(4)) : toNumericOrRaw(card.value),
      card.sub,
    ]);

    sheets.push({
      name: 'Executive Summary',
      headers: ['Metric / Metadata', 'Value', 'Notes'],
      rows: [...metaRows, ...kpiRows],
      currencyCols: [],
      numericCols: [1],
      colWidths: [28, 34, 42],
    });
  }

  const sectionToSheet = (sec, sheetName) => {
    const currencyCols = [];
    const numericCols = [];
    sec.headers.forEach((h, idx) => {
      const lower = h.toLowerCase();
      if (lower.includes('(php)') || lower.includes('charges') || lower.includes('amount') || lower.includes('expenses')) {
        currencyCols.push(idx);
        numericCols.push(idx);
      } else if (
        lower.includes('shipments') ||
        lower.includes('trips') ||
        lower.includes('rate') ||
        lower.includes('count') ||
        lower.includes('incidents') ||
        lower.includes('distance') ||
        lower.includes('delay') ||
        lower.includes('drivers and vehicles') ||
        lower.includes('vehicles')
      ) {
        numericCols.push(idx);
      }
    });

    const rows = sec.records.map(rec =>
      rec.map((cell, idx) => (numericCols.includes(idx) ? toNumericOrRaw(cell) : cell))
    );

    const colWidths = sec.headers.map((h, idx) => {
      const maxLen = Math.max(h.length, ...rows.map(r => String(r[idx] ?? '').length));
      return Math.min(44, Math.max(14, maxLen + 4));
    });

    return {
      name: sheetName.slice(0, 31),
      headers: sec.headers,
      rows,
      currencyCols,
      numericCols,
      colWidths,
    };
  };

  if (structured) {
    if (title === 'Overview') {
      if (included.charts !== false) {
        const vol = structured.sections.find(s => s.title === 'Shipment volume by creation period');
        if (vol) sheets.push(sectionToSheet(vol, 'Shipment Volume'));
      }
      if (included.table !== false) {
        const drv = structured.sections.find(s => s.title === 'Driver on-time performance');
        if (drv) sheets.push(sectionToSheet(drv, 'Driver Performance'));

        const comp = structured.sections.find(s => s.title === 'Current compliance');
        const fleet = structured.sections.find(s => s.title === 'Current fleet');
        if (comp || fleet) {
          const rows = [
            ...(comp?.records || []).map(r => ['Compliance', r[0], toNumericOrRaw(r[1])]),
            ...(fleet?.records || []).map(r => ['Fleet', r[0], toNumericOrRaw(r[1])]),
          ];
          sheets.push({
            name: 'Fleet & Compliance',
            headers: ['Category', 'Classification', 'Count'],
            rows,
            currencyCols: [],
            numericCols: [2],
            colWidths: [18, 42, 14],
          });
        }
      }
    } else {
      const sheetNameMap = {
        'Shipment status': 'Status Breakdown',
        'On-time performance by creation period': 'On-Time Trend',
        'Shipment ledger': 'Shipment Ledger',
        'Driver performance': 'Driver Performance',
        'Reported incidents by category': 'Incident Categories',
        'Incident details': 'Incident Details',
        'Completed charges by creation period': 'Charges Trend',
        'Top customers by completed charges': 'Top Customers',
        'Charges by route': 'Charges by Route',
        'Approved trip expenses by category': 'Expense Categories',
        'Customer status breakdown': 'Status Breakdown',
        'Customer directory': 'Customer Directory',
      };
      for (const sec of structured.sections) {
        const kind = classifyReportSection(sec.title);
        if (kind === 'kpi') continue;
        if (included[kind] === false) continue;
        sheets.push(sectionToSheet(sec, sheetNameMap[sec.title] || sec.title));
      }
    }
  }

  return sheets;
}
