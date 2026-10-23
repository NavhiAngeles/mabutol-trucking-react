import { useState } from "react";
import OfficeTools from "../../components/OfficeTools";
import { useLiveData } from "../../hooks/useLiveData";
import { getDashboardDetails, DASHBOARD_TABLES } from "../../services/dashboardDetailService";
import { useNavigate } from "react-router-dom";
import MainLayout from "../../layouts/mainLayout";
import "./dashboard.css";
import { DashboardMapSlot } from './DashboardMapProvider';
import OperationsFeed from "./OperationsFeed";
import { useDashboardViewModel } from "../../viewmodels/DashboardViewModel";
import { comparisonLabel } from '../../services/operationalStats';

/* ---- Inline icons (no external icon package required) ---- */
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const Search = (props) => (
  <svg {...iconProps} {...props}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const Truck = (props) => (
  <svg {...iconProps} {...props}>
    <path d="M1 3h13v13H1z" />
    <path d="M14 8h4l3 3v5h-7V8z" />
    <circle cx="5.5" cy="18.5" r="1.5" />
    <circle cx="17.5" cy="18.5" r="1.5" />
  </svg>
);

const AlertTriangle = (props) => (
  <svg {...iconProps} {...props}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const Clock = (props) => (
  <svg {...iconProps} {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const ClipboardList = (props) => (
  <svg {...iconProps} {...props}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <line x1="9" y1="12" x2="15" y2="12" />
    <line x1="9" y1="16" x2="15" y2="16" />
  </svg>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const details = useLiveData(getDashboardDetails, DASHBOARD_TABLES);
  const shipmentTrends = details.data?.trends || [];
  const maxTrend = Math.max(1, ...shipmentTrends.map(d => d.value));
  const resources = details.data?.resources;
  const compliance = details.data?.compliance;
  const percent = count => resources?.total ? (count / resources.total * 100) + '%' : '0%';

  const {
    stats,
    loading,
    error,
    refresh,
  } = useDashboardViewModel();

  const cardProps = (path) => ({ role: 'link', tabIndex: 0, onClick: () => navigate(path),
    onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(path); } } });

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <form className="search-wrap" onSubmit={event => { event.preventDefault(); navigate("/shipment?tab=all&q=" + encodeURIComponent(search.trim())); }}>
          <Search className="search-icon" />
          <input
            type="text"
            id="search"
            placeholder="Search shipments…" aria-label="Search shipments" value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </form>
        <div className="topbar-right"><OfficeTools /></div>
      </header>

      {/* Content */}
      <section className="content">
        <div className="header">
          <h2>Dashboard - Fleet Operations Overview</h2>
          <p>
            Track live shipments, monitor driver activity, and manage
            compliance — all in one place.
          </p>
        </div>

        {details.loading && <p role="status">Loading dashboard details…</p>}
        {details.error && <p role="alert">Dashboard details could not refresh. {details.data ? 'Showing the last loaded data.' : ''} <button onClick={details.refresh}>Retry</button></p>}
        {/* Stats */}
        {loading && <p role="status">Loading operational statistics…</p>}
        {error && <p role="alert">Could not load statistics: {error} <button onClick={refresh}>Retry</button></p>}
        <div className="stats">
          <div className="stat-card green" {...cardProps('/shipment?tab=active')}>
            <div className="stat-top">
              <h4>Active Shipments</h4>
              <div className="stat-icon green">
                <Truck />
              </div>
            </div>
            <h2>{stats?.activeShipments ?? '—'}</h2>
            <p className="stat-delta green">
              {comparisonLabel(stats?.activeDelta ?? null)}
            </p>
          </div>

          <div className="stat-card red" {...cardProps('/shipment?tab=delayed')}>
            <div className="stat-top">
              <h4>Delayed Shipments</h4>
              <div className="stat-icon red">
                <AlertTriangle />
              </div>
            </div>
            <h2>{stats?.delayedShipments ?? '—'}</h2>
            <p className="stat-delta red">
              {comparisonLabel(stats?.delayedDelta ?? null)}
            </p>
          </div>

          <div className="stat-card orange" {...cardProps('/fleet?availability=dispatch-ready')}>
            <div className="stat-top">
              <h4>Available Trucks</h4>
              <div className="stat-icon orange">
                <Truck />
              </div>
            </div>
            <h2>{stats?.availableTrucks ?? '—'}</h2>
            <p className="stat-delta orange">Ready for dispatch</p>
          </div>

          <div className="stat-card blue" {...cardProps('/shipment?tab=dispatch')}>
            <div className="stat-top">
              <h4>Pending Dispatch</h4>
              <div className="stat-icon blue">
                <Clock />
              </div>
            </div>
            <h2>{stats?.pendingDispatch ?? '—'}</h2>
            <p className="stat-delta blue">{stats ? `${stats.awaitingAssignment} awaiting assignment · ${stats.awaitingDispatch} awaiting dispatch` : 'Booked or assigned, not departed'}</p>
          </div>
        </div>

        {/* Main columns */}
        <div className="dashboard-columns">
          {/* Left column */}
          <div className="col-left">
            {/* Map */}
            {/* Map */}
            <div className="map-card">
              <div className="map-card-header">
                <h3>Live Tracking: Luzon</h3>
              </div>

              <DashboardMapSlot />
            </div>

            {/* Performance & Analytics */}
            <div className="analytics card">
              <h3>Performance &amp; Analytics</h3>
              <div className="analytics-grid">
                <div className="mini-stat">
                  <span>On-Time Delivery Rate</span>
                  <strong>{details.data?.onTimeRate == null ? "—" : details.data.onTimeRate + "%"}</strong><small>Completed shipments with both arrival timestamps ({details.data?.timedDeliveries ?? 0})</small>
                </div>
                <div className="mini-stat">
                  <span>Completed Today</span>
                  <strong>{details.data?.completedToday ?? "—"}</strong>
                </div>
              </div>

              <div className="trends-header">
                <h4>Shipment Trends</h4>
                <span>Last 7 Days</span>
              </div>

              <div className="trend-chart">
                {shipmentTrends.map((d) => (
                  <div className="trend-col" key={d.date} title={d.date + ": " + d.value + " shipments created"}>
                    <span>{d.value}</span><div className="trend-dot" />
                    <div
                      className="trend-stem"
                      style={{ height: `${(d.value / maxTrend) * 120}px` }}
                    />
                  </div>
                ))}
              </div>
              <div className="trend-labels">
                {shipmentTrends.map((d) => (
                  <span key={d.day}>{d.day}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="col-right">
            {/* Action Center */}
            <div className="right-panel">
              <div className="right-panel-header">
                <h3>Action Center</h3>
                <p>Critical alerts &amp; items requiring attention</p>
              </div>

              {details.data?.alerts.length === 0 && <p>No operational alerts.</p>}
              {details.data?.alerts.map(alert => (
                <div className={"alert-card " + alert.color} key={alert.id}>
                  <div className={"alert-icon " + alert.color}><ClipboardList /></div>
                  <div><p className={"alert-title " + alert.color}>{alert.title}</p>
                    <p className="alert-body">{alert.body}</p>
                    <button className={"alert-link " + alert.color} onClick={() => navigate(alert.path)}>{alert.action} →</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Resource Snapshot */}
            <div className="resources card">
              <h3>Resource Snapshot</h3>
              <p className="resource-label">Fleet Status</p>

              <div className="resource-row">
                <div className="resource-row-top">
                  <span>Available</span>
                  <strong>{resources?.available ?? "—"}</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill green" style={{ width: percent(resources?.available) }} />
                </div>
              </div>

              <div className="resource-row">
                <div className="resource-row-top">
                  <span>In Use</span>
                  <strong>{resources?.inUse ?? "—"}</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill navy" style={{ width: percent(resources?.inUse) }} />
                </div>
              </div>

              <div className="resource-row">
                <div className="resource-row-top">
                  <span>Maintenance</span>
                  <strong>{resources?.maintenance ?? "—"}</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill orange" style={{ width: percent(resources?.maintenance) }} />
                </div>
              </div>

              <p>Other / inactive: {resources?.other ?? "—"} · Total fleet: {resources?.total ?? "—"}</p>
              <div className="snapshot-secondary">
                <div>
                  <p className="snapshot-secondary-title">Completed Trip Duration</p>
                  <div className="driver-hours-box">
                    <div className="driver-hours-icon">
                      <Clock />
                    </div>
                    <strong>{details.data?.averageTripHours == null ? "—" : details.data.averageTripHours.toFixed(1) + "h"}</strong>
                    <span>Average departure to arrival</span>
                  </div>
                </div>

                <div>
                  <p className="snapshot-secondary-title">Compliance</p>
                  <div className="compliance-list">
                    <div className="compliance-row orange">
                      <span>Expiring</span>
                      <span className="compliance-badge orange">{compliance?.expiring ?? "—"}</span>
                    </div>
                    <div className="compliance-row red">
                      <span>Expired</span>
                      <span className="compliance-badge red">{compliance?.expired ?? "—"}</span>
                    </div>
                    <div className="compliance-row amber">
                      <span>Review</span>
                      <span className="compliance-badge amber">{compliance?.review ?? "—"}</span>
                    </div>
                  </div>
                  <button className="view-all-link" onClick={() => navigate("/fleet?view=compliance")}>View All →</button>
                </div>
              </div>
            </div>

            <OperationsFeed />
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
