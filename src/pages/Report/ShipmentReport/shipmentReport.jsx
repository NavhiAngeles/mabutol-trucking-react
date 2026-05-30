import MainLayout from "../../../layouts/mainLayout";
import "./shipmentReport.css";

export default function ShipmentReport() {
  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
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
            <h2>Reports — Shipments</h2>
            <p>
              Comprehensive analysis of delivery
              performance and volume.
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
          <button className="filter">
            Today
          </button>

          <button className="filter">
            This Week
          </button>

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
            <h4>Cancelled Shipments</h4>
            <h2>8</h2>
            <p className="gray">-0%</p>
          </div>
        </div>

        {/* Analytics */}
        <div className="analytics-grid">
          {/* Shipment Status */}
          <div className="chart-card">
            <div className="card-header">
              <h3>Shipment Status</h3>
            </div>

            <div className="diamond-chart">
              <div className="diamond-inner">
                <h2>284</h2>
                <span>TOTAL</span>
              </div>
            </div>

            <div className="legend">
              <div>
                <span className="dot blue"></span>
                Completed (180)
              </div>

              <div>
                <span className="dot gray"></span>
                Active (70)
              </div>

              <div>
                <span className="dot yellow"></span>
                Delayed (26)
              </div>

              <div>
                <span className="dot red"></span>
                Cancelled (8)
              </div>
            </div>
          </div>

          {/* Trend */}
          <div className="chart-card">
            <div className="card-header">
              <h3>Delivery Performance Trend</h3>
            </div>

            <div className="trend-chart">
              <div className="trend-line"></div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          <div className="table-header">
            <h3>Shipment Ledger</h3>
            <div className="table-actions">
              ⋮
            </div>
          </div>

          <table className="report-table">
            <thead>
              <tr>
                <th>Shipment ID</th>
                <th>Customer</th>
                <th>Route</th>
                <th>Status</th>
                <th>Planned ETA</th>
                <th>Actual Delivery</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>SHP-8042</td>
                <td>Reyna Pascual</td>
                <td>Cabanatuan → Gapan</td>
                <td>
                  <span className="status completed">
                    Completed
                  </span>
                </td>
                <td>Oct 12, 2:30 PM</td>
                <td>Oct 12, 2:18 PM</td>
              </tr>

              <tr>
                <td>SHP-8050</td>
                <td>Benito Aquino</td>
                <td>Talavera → Guimba</td>
                <td>
                  <span className="status delayed">
                    Delayed
                  </span>
                </td>
                <td>Oct 15, 4:00 PM</td>
                <td>Pending</td>
              </tr>

              <tr>
                <td>SHP-8039</td>
                <td>Noel Castillo</td>
                <td>San Jose → Science City</td>
                <td>
                  <span className="status active">
                    Active
                  </span>
                </td>
                <td>Oct 18, 10:00 AM</td>
                <td>In Transit</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </MainLayout>
  );
}