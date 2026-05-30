import MainLayout from "../../layouts/mainLayout";
import "./dashboard.css";

export default function Dashboard() {

  return (
      <MainLayout>
        {/* Topbar */}
        <header className="topbar">
          <h1>Dashboard</h1>

          <input
            type="text"
            id="search"
            placeholder="Search fleet..."
            onChange={(e) => console.log("Searching:", e.target.value)}
          />

          <div className="topbar-right">
            <button id="notifBtn" onClick={() => alert("No new notifications")}>
              🔔
            </button>
            <div className="avatar"></div>
          </div>
        </header>

        {/* Content */}
        <section className="content">
          <div className="header">
            <span>SERVICING NUEVA ECIJA</span>
            <h2>Fleet Operations Overview</h2>
          </div>

          {/* Stats */}
          <div className="stats">
            <div className="stat-card">
              <h4>Active Shipments</h4>
              <h2>1,482</h2>
              <p className="green">↑ +5% vs last week</p>
            </div>
            <div className="stat-card">
              <h4>Delayed Shipments</h4>
              <h2>12</h2>
              <p className="red">↑ 2 from yesterday</p>
            </div>
            <div className="stat-card">
              <h4>Available Trucks</h4>
              <h2>45</h2>
              <p className="yellow">Low availability warning</p>
            </div>
            <div className="stat-card">
              <h4>Pending Dispatch</h4>
              <h2>86</h2>
              <p className="gray">Ready for assignment</p>
            </div>
          </div>

          {/* Main grid */}
          <div className="grid">
            {/* Map */}
            <div className="map-card">
              <img src="/assets/images/map.png" alt="Map View" />
            </div>

            {/* Right Panel */}
            <div className="right-panel">
              <h3>Priority Alerts</h3>
              <div className="alert red">Route delay detected</div>
              <div className="alert orange">Compliance issue</div>

              <h3>Unassigned Shipments</h3>
              <div className="alert blue">12 shipments pending</div>

              <h3>Operations Feed</h3>
              <div className="feed">
                <p>Truck #21 dispatched</p>
                <p>Shipment #889 delivered</p>
                <p>Driver shift completed</p>
              </div>
            </div>
          </div>

          {/* Bottom */}
          <div className="bottom">
            <div className="analytics card">
              <h3>Performance & Analytics</h3>
              <p>On-time delivery: 96.8%</p>
              <p>Completed today: 342</p>
              <div className="chart">Shipment Trends</div>
            </div>

            <div className="resources card">
              <h3>Resource Snapshot</h3>

              <div>
                <span>Available</span>
                <div className="bar green"></div>
              </div>
              <div>
                <span>In Use</span>
                <div className="bar blue"></div>
              </div>
              <div>
                <span>Maintenance</span>
                <div className="bar orange"></div>
              </div>

              <p>Driver Hours: 8.4h avg</p>
              <p>Pallet Wraps: Low</p>
              <p>Coolant Fluid: Critical</p>
            </div>
          </div>
        </section>
      </MainLayout>
  );
}