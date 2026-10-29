import OfficeTools from "../../components/OfficeTools";
import { useState } from "react";
import MainLayout from "../../layouts/mainLayout";
import { ComplianceDialog } from "../Fleet/FleetDialogs";
import "./compliance.css";
import { useLiveData } from "../../hooks/useLiveData";
import { getDriverComplianceRows } from "../../services/fleetService";
import { complianceDirectory, complianceCounts, filterCompliance } from "../../services/complianceDirectory";

const TABLES = ['drivers', 'compliance_documents', 'system_settings'];
const badgeClass = state => state === 'valid' ? 'valid' : ['expired', 'rejected'].includes(state) ? 'expired' : 'review';
const formatUpdated = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : 'Unavailable';

export default function Compliance() {

  const [query, setQuery] = useState("");
  const [selectedDriver, setSelectedDriver] = useState(null);
  const { data, loading, error, refresh } = useLiveData(getDriverComplianceRows, TABLES);
  const rows = complianceDirectory(data || []);
  const filtered = filterCompliance(rows, query);
  const counts = complianceCounts(rows);
  const metrics = [
    ['Fully Compliant', counts.compliant, 'All three documents valid'],
    ['Expiring Soon', counts.expiring, 'Includes critical due dates'],
    ['Expired', counts.expired, 'At least one expired document'],
    ['Pending Review', counts.review, 'At least one document awaiting review'],
    ['Missing / Rejected', counts.incomplete, 'Requires document attention'],
  ];

  return (
    <MainLayout>
        {/* Topbar */}
        <header className="topbar">
          <h1>Compliance</h1>

          <input
            type="text"
            placeholder="Search compliance..."
            id="complianceSearch"
            aria-label="Search driver compliance"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />

          <div className="topbar-right">
            <OfficeTools />
          </div>
        </header>

        {/* Content */}
        <section className="content">
          <div className="header">
            <span>DRIVER REGULATIONS</span>
            <h2>Driver Compliance</h2>
          </div>

          {loading && <p role="status">Loading compliance…</p>}
          {error && <p role="alert">Unable to refresh compliance. {data ? 'Showing previously loaded records.' : 'Counts and records are unavailable.'} <button type="button" onClick={refresh}>Retry</button></p>}
          <div className="stats">
            {metrics.map(([label, count, detail]) => <div className="stat-card" key={label}>
              <h4>{label}</h4><h2>{data ? count : '—'}</h2><p>{detail}</p>
            </div>)}
          </div>
          <p>Counts cover all registered drivers. A driver may appear in more than one attention category. Warning dates follow shared compliance thresholds.</p>

          {/* Compliance Table */}
          <div className="compliance-table-card">
            <div className="table-header">
              <input
                type="text"
                className="table-search"
                aria-label="Filter compliance table"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search compliance..."
              />
            </div>

            <table className="compliance-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>License</th>
                  <th>Medical</th>
                  <th>NBI</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(row => <tr key={row.driver.id}>
                  <td><button type="button" className="compliance-driver-link" aria-label={`Open compliance for ${row.driver.full_name || 'Unnamed driver'}`} onClick={() => setSelectedDriver(row.driver)}>{row.driver.full_name || 'Unnamed driver'}</button></td>
                  {row.docs.map(item => <td key={item.docType}><span className={'badge ' + badgeClass(item.badge.state)}>{item.badge.label}</span></td>)}
                  <td><span className={'status ' + (row.state === 'valid' ? 'compliant' : ['expired', 'rejected'].includes(row.state) ? 'expired-status' : 'review-status')}>{row.status}</span></td>
                  <td>{formatUpdated(row.updated)}</td>
                </tr>)}
                {data && !filtered.length && <tr><td colSpan={6}>{rows.length ? 'No drivers match your search.' : 'No registered drivers.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        {selectedDriver && <ComplianceDialog key={selectedDriver.id} kind="driver" entity={selectedDriver} onClose={() => setSelectedDriver(null)} onSaved={refresh} />}
    </MainLayout>
  );
}
