import OfficeTools from "../../components/OfficeTools";
import { useState } from "react";
import MainLayout from "../../layouts/mainLayout";
import { ComplianceDialog } from "../Fleet/FleetDialogs";
import "./compliance.css";
import { useLiveData } from "../../hooks/useLiveData";
import { getDriverComplianceRows, getTruckComplianceRows } from "../../services/fleetService";
import { complianceDirectory, complianceCounts, filterCompliance } from "../../services/complianceDirectory";

const DRIVER_TABLES = ['drivers', 'compliance_documents', 'system_settings'];
const TRUCK_TABLES = ['trucks', 'compliance_documents', 'system_settings'];
const PAGE_SIZE = 10;
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
  const [activeTab, setActiveTab] = useState("driver");
  const [query, setQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [requestedPage, setPage] = useState(1);

  const isVehicle = activeTab === "vehicle";
  const loader = isVehicle ? getTruckComplianceRows : getDriverComplianceRows;
  const tables = isVehicle ? TRUCK_TABLES : DRIVER_TABLES;
  const { data, loading, error, refresh } = useLiveData(loader, tables);

  const rawRows = Array.isArray(data) ? data : [];
  const validRows = rawRows.filter(row => isVehicle ? Boolean(row.truck) : Boolean(row.driver));
  const rows = complianceDirectory(validRows);
  const filtered = filterCompliance(rows, query);
  const counts = complianceCounts(rows);
  const metrics = [
    ['Fully Compliant', counts.compliant, 'All three documents valid', 'compliant-card'],
    ['Expiring Soon', counts.expiring, 'Includes critical due dates', 'expiring-card'],
    ['Expired', counts.expired, 'At least one expired document', 'expired-card'],
    ['Pending Review', counts.review, 'At least one document awaiting review', 'review-card'],
    ['Missing / Rejected', counts.incomplete, 'Requires document attention', 'missing-card'],
  ];

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleTabChange = tab => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setQuery("");
    setPage(1);
    setSelectedEntity(null);
  };

  const handleSearchChange = value => {
    setQuery(value);
    setPage(1);
  };

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-right">
          <OfficeTools />
        </div>
      </header>

      {/* Content */}
      <section className="content compliance-page">
        <div className="header compliance-header">
          <div>
            <span className="compliance-pretitle">{isVehicle ? 'VEHICLE REGULATIONS' : 'DRIVER REGULATIONS'}</span>
            <h2 className="compliance-title">{isVehicle ? 'Vehicle Compliance' : 'Driver Compliance'}</h2>
            <p className="compliance-subtitle">
              {isVehicle
                ? 'Monitor vehicle regulatory status, OR/CR registration, LTFRB permits, and emission testing.'
                : 'Monitor driver regulatory status, license validity, and medical / NBI clearances.'}
            </p>
          </div>
          <div className="compliance-header-actions">
            <div className="tab-pill-box compliance-tabs" role="tablist" aria-label="Compliance section">
              <button
                type="button"
                role="tab"
                id="driverComplianceTab"
                aria-selected={!isVehicle}
                aria-controls="compliance-table-panel"
                className={`tab-pill ${!isVehicle ? 'active' : ''}`}
                onClick={() => handleTabChange('driver')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '4px' }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Driver Compliance
              </button>
              <button
                type="button"
                role="tab"
                id="vehicleComplianceTab"
                aria-selected={isVehicle}
                aria-controls="compliance-table-panel"
                className={`tab-pill ${isVehicle ? 'active' : ''}`}
                onClick={() => handleTabChange('vehicle')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '4px' }}>
                  <rect x="1" y="3" width="15" height="13" />
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
                Vehicle Compliance
              </button>
            </div>
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

        <div className="compliance-stats-grid stats stats-container">
          {metrics.map(([label, count, detail, cardClass]) => (
            <div className={`compliance-stat-card stat-card ${cardClass || ''}`} key={label}>
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
              <p>
                {isVehicle
                  ? 'Counts cover all registered fleet vehicles. A vehicle may appear in more than one attention category. Warning dates follow shared compliance thresholds.'
                  : 'Counts cover all registered drivers. A driver may appear in more than one attention category. Warning dates follow shared compliance thresholds.'}
              </p>
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
        <div className="compliance-table-card" id="compliance-table-panel" role="tabpanel" aria-labelledby={isVehicle ? "vehicleComplianceTab" : "driverComplianceTab"}>
          <div className="table-header">
            <div className="table-search-box">
              <span className="search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                id="complianceSearch"
                className="table-search"
                aria-label="Filter compliance table"
                value={query}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder={isVehicle ? "Search vehicle compliance..." : "Search compliance..."}
              />
              {query && (
                <button
                  type="button"
                  className="table-search-clear-btn"
                  onClick={() => handleSearchChange("")}
                  aria-label="Clear compliance search"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="table-header-meta">
              {query && (
                <span className="table-filtered-badge">
                  Filtered by &ldquo;{query}&rdquo;
                </span>
              )}
              <div className="table-records-badge">
                {data ? `${filtered.length} ${filtered.length === 1 ? (isVehicle ? 'vehicle' : 'driver') : (isVehicle ? 'vehicles' : 'drivers')}` : '—'}
              </div>
            </div>
          </div>

          <div className="compliance-table-wrapper">
            <table className="compliance-table">
              <thead>
                <tr>
                  <th>{isVehicle ? 'Vehicle' : 'Driver'}</th>
                  {isVehicle ? (
                    <>
                      <th>OR/CR</th>
                      <th>LTFRB Permit</th>
                      <th>Emission Test</th>
                    </>
                  ) : (
                    <>
                      <th>License</th>
                      <th>Medical</th>
                      <th>NBI</th>
                    </>
                  )}
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>

              <tbody>
                {paged.map(row => {
                  const entity = isVehicle ? row.truck : row.driver;
                  const entityId = entity?.id || '';
                  const entityName = isVehicle
                    ? (entity?.plate_number || 'Unnamed vehicle')
                    : (entity?.full_name || 'Unnamed driver');
                  const ariaLabel = `Open compliance for ${entityName}`;

                  return (
                    <tr key={entityId}>
                      <td>
                        <button
                          type="button"
                          className="compliance-driver-link"
                          aria-label={ariaLabel}
                          onClick={() => setSelectedEntity(entity)}
                        >
                          <span className={`driver-avatar-circle ${isVehicle ? 'truck-avatar-circle' : ''}`} aria-hidden="true">
                            {isVehicle ? '🚛' : ((entityName || 'D').charAt(0).toUpperCase())}
                          </span>
                          <span className="driver-name-text">
                            {entityName}
                            {isVehicle && entity?.model ? (
                              <small className="truck-model-subtitle">{entity.model}</small>
                            ) : null}
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
                  );
                })}
                {data && !filtered.length && (
                  <tr>
                    <td colSpan={6} className="compliance-empty-state">
                      {rows.length
                        ? (isVehicle ? 'No vehicles match your search.' : 'No drivers match your search.')
                        : (isVehicle ? 'No registered vehicles.' : 'No registered drivers.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Footer */}
          <div className="table-pagination-footer" role="navigation" aria-label="Compliance table pagination">
            <span className="pagination-summary">
              {filtered.length === 0
                ? `Showing 0 of 0 ${isVehicle ? 'vehicles' : 'drivers'}`
                : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} ${isVehicle ? 'vehicles' : 'drivers'}`}
            </span>

            <nav className="pagination-controls-group" aria-label="Compliance pages">
              <button
                type="button"
                className="page-nav-btn page-nav-prev"
                disabled={loading || Boolean(error) || page <= 1}
                onClick={() => setPage(page - 1)}
                aria-label="Previous compliance page"
              >
                Previous
              </button>
              <span className="pagination-page-indicator" aria-live="polite">
                {`Page ${page} of ${pageCount}`}
              </span>
              <button
                type="button"
                className="page-nav-btn page-nav-next"
                disabled={loading || Boolean(error) || page >= pageCount}
                onClick={() => setPage(page + 1)}
                aria-label="Next compliance page"
              >
                Next
              </button>
            </nav>
          </div>
        </div>
      </section>
      {selectedEntity && (
        <ComplianceDialog
          key={selectedEntity.id}
          kind={isVehicle ? 'truck' : 'driver'}
          entity={selectedEntity}
          onClose={() => setSelectedEntity(null)}
          onSaved={refresh}
        />
      )}
    </MainLayout>
  );
}
