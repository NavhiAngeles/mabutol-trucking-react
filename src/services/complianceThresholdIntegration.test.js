import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { complianceState, latestDocuments, manilaDate } from './dashboardAnalytics.js';
import { DEFAULT_THRESHOLDS, thresholdState } from './complianceThresholds.js';
import { reportRange, summarizeOverview } from './reportOverview.js';

function fleet(configuration) {
  const due = manilaDate(Date.now() + 2 * 86400000);
  const tables = { trucks: [{ id: 'truck', plate_number: 'FIXTURE' }], drivers: [{ id: 'driver', full_name: 'Fixture' }],
    compliance_documents: [
      { id: 'or', truck_id: 'truck', doc_type: 'lto_registration', review_status: 'approved', remarks: 'OR copy', expiry_date: due, created_at: '2026-01-01' },
      { id: 'cr', truck_id: 'truck', doc_type: 'lto_registration', review_status: 'approved', remarks: 'CR copy', expiry_date: '2099-01-01', created_at: '2026-01-01' },
      { id: 'license', driver_id: 'driver', doc_type: 'drivers_license', review_status: 'approved', expiry_date: due, created_at: '2026-01-01' },
    ], maintenance_records: [{ id: 'service', status: 'scheduled', scheduled_date: due }] };
  const scope = vm.createContext({ complianceState, latestDocuments, thresholdState, getComplianceConfiguration: async () => configuration,
    supabase: { from(table) {
      let rows = tables[table] || [];
      const q = { select: () => q, order: () => q, not: key => { rows = rows.filter(row => row[key] != null); return q; },
        in: (key, values) => { rows = rows.filter(row => values.includes(row[key])); return q; }, range: async (start, end) => ({ data: rows.slice(start, end + 1) }) };
      return q;
    } },
  });
  vm.runInContext(fs.readFileSync(new URL('./fleetService.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'').replace(/import\.meta\.env\.\w+/g, '"fixture"')+'\nthis.api={getTruckComplianceRows,getDriverComplianceRows,getMaintenanceRecords};',scope);
  return scope.api;
}
test('actual Fleet loaders use saved rules, retain worst OR/CR state and annotate scheduled maintenance',async()=>{
  const api=fleet({thresholds:DEFAULT_THRESHOLDS,legacyDays:30});
  const trucks=await api.getTruckComplianceRows(),drivers=await api.getDriverComplianceRows(),maintenance=await api.getMaintenanceRecords();
  assert.equal(trucks[0].docs[0].badge.state,'critical');
  assert.equal(drivers[0].docs[0].badge.state,'critical');
  assert.equal(maintenance[0].warningState,'critical');
  assert.equal((await fleet({thresholds:null,legacyDays:30}).getMaintenanceRecords())[0].warningState,null);
});
test('Report Overview puts critical compliance in attention rather than ordinary expiring',()=>{
  const rows={shipments:[],deliveries:[],drivers:[],compliance:[{docs:[{badge:{state:'critical'}}]}]};
  assert.equal(summarizeOverview(rows,reportRange('today')).compliance.attention,1);
  assert.equal(summarizeOverview(rows,reportRange('today')).compliance.expiring,0);
});
