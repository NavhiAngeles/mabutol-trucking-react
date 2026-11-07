import OfficeTools from "../../components/OfficeTools";
import { useState } from "react";
import MainLayout from "../../layouts/mainLayout";
import { ComplianceDialog } from "../Fleet/FleetDialogs";
import "./compliance.css";
import { useLiveData } from "../../hooks/useLiveData";
import { getDriverComplianceRows } from "../../services/fleetService";
import { complianceDirectory, complianceCounts, filterCompliance } from "../../services/complianceDirectory";

const TABLES = ['drivers', 'compliance_documents', 'system_settings'];
const badgeClass = state => {
  if (state === 'valid') return 'valid';
  if (['expired', 'rejected'].includes(state)) return 'expired';
  if (['critical', 'expiring_soon'].includes(state)) return 'warning';
  if (state === 'pending_review') return 'review';
  if (state === 'missing') return 'missing';
  return 'review';
};
const formatUpdated = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : 'Unavailable';

export default function Compliance() {
  const [query, setQuery] = useState("");
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const { data, loading, error, refresh } = useLiveData(getDriverComplianceRows, TABLES);
  const rows = complianceDirectory(data || []);
  const filtered = filterCompliance(rows, query);
  const counts = complianceCounts(rows);
  const metrics = [
    ['Fully Compliant', counts.compliant, 'All three documents valid', 'compliant-card'],
    ['Expiring Soon', counts.expiring, 'Includes critical due dates', 'expiring-card'],
    ['Expired', counts.expired, 'At least one expired document', 'expired-card'],
    ['Pending Review', counts.review, 'At least one document awaiting review', 'review-card'],
    ['Missing / Rejected', counts.incomplete, 'Requires document attention', 'missing-card'],
  ];

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <div className="search-container">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            type="text"
            placeholder="Search compliance..."
            id="complianceSearch"
            aria-label="Search driver compliance"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="topbar-right">
          <OfficeTools />
        </div>
      </header>

      {/* Content */}
      <section className="content">
        <div className="header compliance-header">
          <div>
            <span className="compliance-pretitle">DRIVER REGULATIONS</span>
            <h2 className="compliance-title">Driver Compliance</h2>
            <p className="compliance-subtitle">
              Monitor driver regulatory status, license validity, and medical / NBI clearances.
            </p>
          </div>
          <div className="compliance-header-actions">
            <button
              type="button"
              className="btn-compliance-refresh"
              onClick={refresh}
              disabled={loading}
              title="Refresh compliance records"
              aria-label="Refresh compliance records"
            >
              <svg
                className={`refresh-icon ${loading ? 'spinning' : ''}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {loading && (
          <div className="compliance-status-banner" role="status">
            <span aria-hidden="true">⏳</span>
            <span>Loading compliance…</span>
          </div>
        )}
        {error && (
          <div className="compliance-error-banner" role="alert">
            <span>Unable to refresh compliance. {data ? 'Showing previously loaded records.' : 'Counts and records are unavailable.'}</span>
            <button type="button" className="btn-retry" onClick={refresh}>Retry</button>
          </div>
        )}

        <div className="stats stats-container">
          {metrics.map(([label, count, detail, cardClass]) => (
            <div className={`stat-card ${cardClass || ''}`} key={label}>
              <h4>{label}</h4>
              <h2>{data ? count : '—'}</h2>
              <p>{detail}</p>
            </div>
          ))}
        </div>

        {!dismissedBanner && (
          <div className="compliance-info-banner">
            <div className="banner-content">
              <span className="info-icon" aria-hidden="true">ℹ️</span>
              <p>Counts cover all registered drivers. A driver may appear in more than one attention category. Warning dates follow shared compliance thresholds.</p>
            </div>
            <button
              type="button"
              className="compliance-banner-close"
              onClick={() => setDismissedBanner(true)}
              aria-label="Dismiss notice"
            >
              ✕
            </button>
          </div>
        )}

        {/* Compliance Table */}
        <div className="compliance-table-card">
          <div className="table-header">
            <div className="table-search-box">
              <span className="search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                className="table-search"
                aria-label="Filter compliance table"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search compliance..."
              />
            </div>
            <div className="table-records-badge">
              {data ? `${filtered.length} ${filtered.length === 1 ? 'driver' : 'drivers'}` : '—'}
            </div>
          </div>

          <div className="compliance-table-wrapper">
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
                {filtered.map(row => (
                  <tr key={row.driver.id}>
                    <td>
                      <button
                        type="button"
                        className="compliance-driver-link"
                        aria-label={`Open compliance for ${row.driver.full_name || 'Unnamed driver'}`}
                        onClick={() => setSelectedDriver(row.driver)}
                      >
                        <span className="driver-avatar-circle" aria-hidden="true">
                          {(row.driver.full_name || 'D').charAt(0).toUpperCase()}
                        </span>
                        <span className="driver-name-text">
                          {row.driver.full_name || 'Unnamed driver'}
                        </span>
                      </button>
                    </td>
                    {row.docs.map(item => (
                      <td key={item.docType}>
                        <span className={'badge ' + badgeClass(item.badge.state)}>
                          {item.badge.label}
                        </span>
                      </td>
                    ))}
                    <td>
                      <span className={'status ' + (row.state === 'valid' ? 'compliant' : ['expired', 'rejected'].includes(row.state) ? 'expired-status' : 'review-status')}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <span className={`compliance-updated-date ${row.updated ? 'has-date' : 'no-date'}`}>
                        {formatUpdated(row.updated)}
                      </span>
                    </td>
                  </tr>
                ))}
                {data && !filtered.length && (
                  <tr>
                    <td colSpan={6} className="compliance-empty-state">
                      {rows.length ? 'No drivers match your search.' : 'No registered drivers.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      {selectedDriver && (
        <ComplianceDialog
          key={selectedDriver.id}
          kind="driver"
          entity={selectedDriver}
          onClose={() => setSelectedDriver(null)}
          onSaved={refresh}
        />
      )}
    </MainLayout>
  );
}
