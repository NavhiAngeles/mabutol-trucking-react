import { useNavigate } from "react-router-dom";
import MainLayout from "../../layouts/mainLayout";
import "./dashboard.css";
import DashboardTrackingMap from "./DashboardTrackingMap";
import { useDashboardViewModel } from "../../viewmodels/DashboardViewModel";

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

const Bell = (props) => (
  <svg {...iconProps} {...props}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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

const MapPin = (props) => (
  <svg {...iconProps} {...props}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const Plus = (props) => (
  <svg {...iconProps} {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const Minus = (props) => (
  <svg {...iconProps} {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const ChevronDown = (props) => (
  <svg {...iconProps} {...props}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ArrowUp = (props) => (
  <svg {...iconProps} {...props}>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const RotateCcw = (props) => (
  <svg {...iconProps} {...props}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
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

const shipmentTrends = [
  { day: "Mon", value: 42 },
  { day: "Tue", value: 30 },
  { day: "Wed", value: 54 },
  { day: "Thu", value: 88 },
  { day: "Fri", value: 64 },
  { day: "Sat", value: 82 },
  { day: "Sun", value: 100 },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const maxTrend = Math.max(...shipmentTrends.map((d) => d.value));

  const {
    stats,
    loading,
    error,
  } = useDashboardViewModel();

  if (loading) {
    return <p>Loading dashboard...</p>;
  }

  if (error) {
    return <p>Error: {error}</p>;
  }

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <div className="search-wrap">
          <Search className="search-icon" />
          <input
            type="text"
            id="search"
            placeholder="Search..."
            onChange={(e) => console.log("Searching:", e.target.value)}
          />
        </div>

        <div className="topbar-right">
          <button
            id="notifBtn"
            className="icon-btn"
            onClick={() => alert("No new notifications")}
            aria-label="Notifications"
          >
            <Bell />
          </button>

          <div className="topbar-divider" />

          <button
            className="avatar"
            onClick={() => navigate("/settings/account")}
            aria-label="Go to Account Settings"
            title="Go to Account Settings"
          >
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60"
              alt="User Profile"
              className="avatar-img"
            />
          </button>
        </div>
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

        {/* Stats */}
        <div className="stats">
          <div className="stat-card green">
            <div className="stat-top">
              <h4>Active Shipments</h4>
              <div className="stat-icon green">
                <Truck />
              </div>
            </div>
            <h2>{stats.activeShipments}</h2>
            <p className="stat-delta green">
              <ArrowUp /> +2 from yesterday
            </p>
          </div>

          <div className="stat-card red">
            <div className="stat-top">
              <h4>Delayed Shipments</h4>
              <div className="stat-icon red">
                <AlertTriangle />
              </div>
            </div>
            <h2>{stats.delayedShipments}</h2>
            <p className="stat-delta red">
              <ArrowUp /> +1 from yesterday
            </p>
          </div>

          <div className="stat-card orange">
            <div className="stat-top">
              <h4>Available Trucks</h4>
              <div className="stat-icon orange">
                <Truck />
              </div>
            </div>
            <h2>{stats.availableTrucks}</h2>
            <p className="stat-delta orange">Ready for dispatch</p>
          </div>

          <div className="stat-card blue">
            <div className="stat-top">
              <h4>Pending Dispatch</h4>
              <div className="stat-icon blue">
                <Clock />
              </div>
            </div>
            <h2>{stats.pendingDispatch}</h2>
            <p className="stat-delta blue">Ready for assignment</p>
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

              <DashboardTrackingMap />
            </div>

            {/* Performance & Analytics */}
            <div className="analytics card">
              <h3>Performance &amp; Analytics</h3>
              <div className="analytics-grid">
                <div className="mini-stat">
                  <span>On-Time Delivery Rate</span>
                  <strong>87.0%</strong>
                </div>
                <div className="mini-stat">
                  <span>Completed Today</span>
                  <strong>18</strong>
                </div>
              </div>

              <div className="trends-header">
                <h4>Shipment Trends</h4>
                <span>Last 7 Days</span>
              </div>

              <div className="trend-chart">
                {shipmentTrends.map((d) => (
                  <div className="trend-col" key={d.day}>
                    <div className="trend-dot" />
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

              <div className="alert-card red">
                <div className="alert-icon red">
                  <AlertTriangle />
                </div>
                <div>
                  <p className="alert-title red">Urgent Delay</p>
                  <p className="alert-body">
                    SHP-NE-8039 is delayed +4hrs on NLEX
                  </p>
                  <button className="alert-link red">VIEW SHIPMENT →</button>
                </div>
              </div>

              <div className="alert-card orange">
                <div className="alert-icon orange">
                  <ClipboardList />
                </div>
                <div>
                  <p className="alert-title orange">Compliance Alert</p>
                  <p className="alert-body">
                    Ricardo Bautista's license expires in 45 days
                  </p>
                  <button className="alert-link orange">VIEW COMPLIANCE →</button>
                </div>
              </div>

              <div className="alert-card blue">
                <div className="alert-icon blue">
                  <ClipboardList />
                </div>
                <div>
                  <p className="alert-title blue">Booking</p>
                  <p className="alert-body">
                    5 customer bookings pending your review
                  </p>
                  <button className="alert-link blue">REVIEW NOW →</button>
                </div>
              </div>
            </div>

            {/* Resource Snapshot */}
            <div className="resources card">
              <h3>Resource Snapshot</h3>
              <p className="resource-label">Fleet Status</p>

              <div className="resource-row">
                <div className="resource-row-top">
                  <span>Available</span>
                  <strong>8</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill green" style={{ width: "22%" }} />
                </div>
              </div>

              <div className="resource-row">
                <div className="resource-row-top">
                  <span>In Use</span>
                  <strong>24</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill navy" style={{ width: "67%" }} />
                </div>
              </div>

              <div className="resource-row">
                <div className="resource-row-top">
                  <span>Maintenance</span>
                  <strong>4</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill orange" style={{ width: "11%" }} />
                </div>
              </div>

              <div className="snapshot-secondary">
                <div>
                  <p className="snapshot-secondary-title">Driver Hours</p>
                  <div className="driver-hours-box">
                    <div className="driver-hours-icon">
                      <Clock />
                    </div>
                    <strong>8.4h</strong>
                    <span>Average shift</span>
                  </div>
                </div>

                <div>
                  <p className="snapshot-secondary-title">Compliance</p>
                  <div className="compliance-list">
                    <div className="compliance-row orange">
                      <span>Expiring</span>
                      <span className="compliance-badge orange">8</span>
                    </div>
                    <div className="compliance-row red">
                      <span>Expired</span>
                      <span className="compliance-badge red">6</span>
                    </div>
                    <div className="compliance-row amber">
                      <span>Review</span>
                      <span className="compliance-badge amber">9</span>
                    </div>
                  </div>
                  <button className="view-all-link">View All →</button>
                </div>
              </div>
            </div>

            {/* Operations Feed */}
            <div className="ops-feed card">
              <div className="ops-feed-header">
                <h3>Operations Feed</h3>
                <button className="ops-feed-refresh" aria-label="Refresh feed">
                  <RotateCcw />
                </button>
              </div>

              <div className="feed-list">
                <div className="feed-item">
                  <span className="feed-dot green" />
                  <div>
                    <p className="feed-title">Delivered: SHP-NE-7021</p>
                    <p className="feed-desc">To: Cabanatuan City Warehouse</p>
                    <p className="feed-time">5min ago</p>
                  </div>
                </div>

                <div className="feed-item">
                  <span className="feed-dot blue" />
                  <div>
                    <p className="feed-title">Dispatched: SHP-NE-9044</p>
                    <p className="feed-desc">Route: Gapan-San Isidro Bypass</p>
                    <p className="feed-time">18min ago</p>
                  </div>
                </div>

                <div className="feed-item">
                  <span className="feed-dot navy" />
                  <div>
                    <p className="feed-title">New Booking: Reyna Pascual</p>
                    <p className="feed-desc">
                      Cabanatuan → Talavera (Auto-route)
                    </p>
                    <p className="feed-time">1hr ago</p>
                  </div>
                </div>
              </div>

              <button className="view-all-link">View All Activity →</button>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}