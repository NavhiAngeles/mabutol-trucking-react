import MainLayout from "../../layouts/MainLayout";
import "./fleet.css";

export default function Fleet() {
  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <h1>Fleet Management</h1>

        <input
          type="text"
          placeholder="Search drivers..."
          id="fleetSearch"
          onChange={(e) => console.log("Searching fleet:", e.target.value)}
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
          <span>LOGISTICS / ASSETS</span>
          <h2>Fleet Management Overview</h2>
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="stat-card">
            <h4>Total Assets</h4>
            <h2>145</h2>
            <p className="green">+2% vs last month</p>
          </div>
          
          <div className="stat-card">
            <h4>Ready to Dispatch</h4>
            <h2>98</h2>
            <p className="blue">67% of total fleet</p>
          </div>
          
          <div className="stat-card">
            <h4>Out of Service</h4>
            <h2>12</h2>
            <p className="red">Maintenance required</p>
          </div>
          
          <div className="stat-card">
            <h4>Off Duty</h4>
            <h2>35</h2>
            <p className="yellow">Drivers unavailable</p>
          </div>
        </div>

        {/* Driver Table */}
        <div className="fleet-table-card">
          <div className="table-header">
            <input
              type="text"
              className="table-search"
              placeholder="Search driver..."
            />
          </div>

          <table className="fleet-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>License</th>
                <th>Vehicle</th>
                <th>Shipment</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Jose Dela Cruz</td>
                <td>N01-22-34981</td>
                <td>Isuzu Forward</td>
                <td>SHP-8042</td>
                <td>
                  <span className="status active">
                    ON ROUTE
                  </span>
                </td>
              </tr>

              <tr>
                <td>Ricardo Bautista</td>
                <td>N02-23-11234</td>
                <td>Fuso Canter</td>
                <td>No Active Trip</td>
                <td>
                  <span className="status off">
                    OFF DUTY
                  </span>
                </td>
              </tr>

              <tr>
                <td>Antonio Luna</td>
                <td>N01-19-445566</td>
                <td>Isuzu Giga</td>
                <td>SHP-8045</td>
                <td>
                  <span className="status active">
                    ON ROUTE
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </MainLayout>
  );
}