import MainLayout from "../../../layouts/mainLayout";
import "./overview.css";

export default function Overview() {
  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <h1>Reports — Overview</h1>

        <input
          type="text"
          placeholder="Search..."
        />

        <div className="topbar-right">
          <button id="notifBtn">🔔</button>
          <div className="avatar"></div>
        </div>
      </header>

      {/* Content */}
      <section className="content">
        {/* Header */}
        <div className="header-row">
          <div>
            <h2>Reports Overview</h2>
            <p>
              Track operational performance
              and logistics metrics.
            </p>
          </div>

          <div className="report-actions">
            <button className="secondary-btn">
              Schedule Report
            </button>

            <button className="primary-btn">
              Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="filters">
          <button className="filter active">
            This Month
          </button>

          <button className="filter">
            Last 3 Months
          </button>

          <button className="filter">
            Custom Range
          </button>
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="stat-card">
            <h4>Total Shipments</h4>
            <h2>284</h2>
            <p className="green">+12%</p>
          </div>

          <div className="stat-card">
            <h4>On-Time Rate</h4>
            <h2>87%</h2>
            <p className="red">-3%</p>
          </div>

          <div className="stat-card">
            <h4>Total Revenue</h4>
            <h2>₱1.24M</h2>
            <p className="green">+8%</p>
          </div>

          <div className="stat-card">
            <h4>Fleet Utilization</h4>
            <h2>83%</h2>
            <p className="gray">-0%</p>
          </div>
        </div>

        {/* Analytics Grid */}
        <div className="analytics-grid">
          <div className="chart-card">
            <div className="card-header">
              <h3>Shipment Volume</h3>
            </div>

            <div className="chart-placeholder">
              Chart Area
            </div>
          </div>

          <div className="chart-card">
            <div className="card-header">
              <h3>Revenue vs Target</h3>
            </div>

            <div className="chart-placeholder">
              Chart Area
            </div>
          </div>
        </div>

        {/* Bottom Grid */}
        <div className="bottom-grid">
          <div className="info-card">
            <h3>Top Performing Drivers</h3>
          </div>

          <div className="info-card">
            <h3>Compliance Snapshot</h3>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}