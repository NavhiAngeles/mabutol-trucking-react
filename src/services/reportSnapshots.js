import { summarizeOverview } from './reportOverview.js';
import { buildShipmentReport } from './shipmentReport.js';
import { buildDriverReport } from './driverReport.js';
import { buildRevenueReport } from './revenueReport.js';
import { calculateDashboardAnalytics, complianceState, latestDocuments, manilaDate } from './dashboardAnalytics.js';
import { validateThresholds } from './complianceThresholds.js';

export function snapshotReport(snapshot) {
  if (snapshot.model_version !== 1 || snapshot.status !== 'ready' || !snapshot.data) throw new Error('This saved report is unavailable or uses an unsupported format.');
  const rows = snapshot.data;
  const range = { start: snapshot.period_start, end: snapshot.period_end };
  if (snapshot.report_type === 'Shipments') return buildShipmentReport(rows.shipments, rows.deliveries, range);
  if (snapshot.report_type === 'Drivers') return buildDriverReport(rows, range);
  if (snapshot.report_type === 'Revenue') return buildRevenueReport(rows, range);
  if (snapshot.report_type !== 'Overview') throw new Error('Unknown report type.');
  const now = Date.parse(snapshot.generated_at);
  const setting = rows.settings.find(r => r.key === 'compliance_thresholds');
  const legacy = rows.settings.find(r => r.key === 'compliance_threshold_days');
  const configuration = { thresholds: setting ? validateThresholds(setting.value) : null, legacyDays: legacy ? Number(legacy.value) : 30 };
  const latest = latestDocuments(rows.documents);
  const severity = { rejected: 0, expired: 1, critical: 2, missing: 3, pending_review: 4, expiring_soon: 5, valid: 6 };
  const compliance = [['truck_id', rows.trucks, ['lto_registration', 'franchise_permit', 'emission_test']], ['driver_id', rows.drivers, ['drivers_license', 'medical_certificate', 'nbi_clearance']]]
    .flatMap(([field, entities, types]) => entities.map(entity => ({ docs: types.map(type => {
      const matches = latest.filter(d => d[field] === entity.id && d.doc_type === type);
      const doc = matches.sort((a, b) => severity[complianceState(a, now, configuration)] - severity[complianceState(b, now, configuration)])[0];
      return { badge: { state: complianceState(doc, now, configuration) } };
    }) })));
  return { ...summarizeOverview({ ...rows, compliance }, range),
    fleet: calculateDashboardAnalytics([], rows.trucks, rows.deliveries, rows.maintenance, [], now).resources,
    overdueServiceRecords: rows.maintenance.filter(m => m.status === 'scheduled' && m.scheduled_date < manilaDate(now)).length };
}
