import { useNavigate } from "react-router-dom";
import MainLayout from "../../layouts/mainLayout";
import "./dashboard.css";

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
            <h2>24</h2>
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
            <h2>3</h2>
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
            <h2>8</h2>
            <p className="stat-delta orange">Ready for dispatch</p>
          </div>

          <div className="stat-card blue">
            <div className="stat-top">
              <h4>Pending Dispatch</h4>
              <div className="stat-icon blue">
                <Clock />
              </div>
            </div>
            <h2>5</h2>
            <p className="stat-delta blue">Ready for assignment</p>
          </div>
        </div>

        {/* Main columns */}
        <div className="dashboard-columns">
          {/* Left column */}
          <div className="col-left">
            {/* Map */}
            <div className="map-card">
              <div className="map-card-header">
                <h3>Live Tracking: Luzon</h3>
                <div className="map-controls">
                  <button className="map-pill-btn">
                    Satellite <ChevronDown />
                  </button>
                  <div className="zoom-group">
                    <button aria-label="Zoom in">
                      <Plus />
                    </button>
                    <button aria-label="Zoom out">
                      <Minus />
                    </button>
                  </div>
                </div>
              </div>

              <div className="map-canvas">
                <svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg">
                  <rect width="640" height="400" fill="#CBD9E8" />

                  {/* Landmass */}
                  <path
                    d="M300 20
                       C 330 15, 355 35, 350 60
                       C 380 70, 390 100, 375 125
                       C 400 140, 405 170, 385 190
                       C 410 210, 405 245, 375 260
                       C 390 285, 380 315, 355 330
                       C 365 355, 345 380, 315 370
                       C 300 390, 270 385, 260 365
                       C 230 370, 205 350, 210 325
                       C 185 315, 175 290, 190 270
                       C 165 255, 160 225, 180 205
                       C 160 190, 158 165, 178 148
                       C 165 125, 175 100, 200 90
                       C 195 65, 215 40, 245 40
                       C 255 20, 285 10, 300 20 Z"
                    fill="#E8E4DA"
                    stroke="#D5CFC0"
                    strokeWidth="1.5"
                  />

                  {/* Local route (green) */}
                  <path
                    d="M255 110 C 265 140, 250 170, 265 200"
                    stroke="#16A34A"
                    strokeWidth="2.5"
                    fill="none"
                    strokeDasharray="5 4"
                  />

                  {/* Delayed route (red) - Baguio down to NLEX midpoint */}
                  <path
                    d="M245 55 C 260 85, 250 120, 290 190"
                    stroke="#DC2626"
                    strokeWidth="3"
                    fill="none"
                  />

                  {/* In-transit route (blue) - continues down to Manila */}
                  <path
                    d="M290 190 C 300 230, 285 270, 300 340"
                    stroke="#2563EB"
                    strokeWidth="3"
                    fill="none"
                  />

                  {/* Baguio City marker */}
                  <circle cx="245" cy="55" r="6" fill="#DC2626" stroke="white" strokeWidth="2" />
                  <text x="256" y="52" fontSize="11" fontWeight="600" fill="#1F2937">
                    Baguio City
                  </text>

                  {/* San Jose City marker */}
                  <circle cx="205" cy="195" r="4" fill="#4B5563" />
                  <text x="150" y="199" fontSize="10" fill="#4B5563">
                    San Jose City
                  </text>

                  {/* Gapan City marker */}
                  <circle cx="285" cy="255" r="4" fill="#4B5563" />
                  <text x="296" y="259" fontSize="10" fill="#4B5563">
                    Gapan City
                  </text>

                  {/* In-transit truck marker */}
                  <circle cx="290" cy="190" r="7" fill="#2563EB" stroke="white" strokeWidth="2" />

                  {/* Manila marker */}
                  <circle cx="300" cy="340" r="6" fill="#1F2937" stroke="white" strokeWidth="2" />
                  <text x="311" y="344" fontSize="11" fontWeight="600" fill="#1F2937">
                    Manila
                  </text>
                </svg>

                {/* Truck popup */}
                <div className="map-popup">
                  <div className="map-popup-badges">
                    <span className="map-popup-id">SHP-NE-8042</span>
                    <span className="map-popup-status">IN TRANSIT</span>
                  </div>
                  <p className="map-popup-name">Ramon Cruz - Isuzu Forward</p>
                  <div className="map-popup-row">
                    <MapPin /> NLEX km 42
                  </div>
                  <div className="map-popup-row">
                    <Clock /> ETA: 2h 15min
                  </div>
                </div>

                {/* Legend */}
                <div className="map-legend">
                  <div className="map-legend-title">Legend</div>
                  <div className="map-legend-row">
                    <span className="map-legend-dot" style={{ background: "#2563EB" }} />
                    In Transit
                  </div>
                  <div className="map-legend-row">
                    <span className="map-legend-dot" style={{ background: "#DC2626" }} />
                    Delayed
                  </div>
                  <div className="map-legend-row">
                    <span className="map-legend-dot" style={{ background: "#16A34A" }} />
                    Local Route
                  </div>
                </div>
              </div>
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
                  <div className="bar-fill green" style={{ width: "25%" }} />
                </div>
              </div>

              <div className="resource-row">
                <div className="resource-row-top">
                  <span>In Use</span>
                  <strong>24</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill navy" style={{ width: "75%" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}