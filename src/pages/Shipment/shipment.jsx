import MainLayout from "../../layouts/mainLayout";
import "./shipment.css";

export default function Shipment() {
  return (
    <MainLayout>
      {/* Global Dashboard Topbar */}
      <header className="topbar">
        <div className="search-container">
          <i className="las la-search" style={{ position: "absolute", left: "14px", top: "12px", color: "#94A3B8", fontSize: "16px" }}></i>
          <input
            type="text"
            id="shipmentSearch"
            placeholder="Search..."
            onChange={(e) => console.log("Searching:", e.target.value)}
          />
        </div>

        <div className="topbar-right">
          <button id="notifBtn" className="notification-btn" onClick={() => alert("No new notifications")}>
            <i className="las la-bell"></i>
          </button>
          <div className="avatar">
            <img 
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60" 
              alt="User Profile" 
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>
      </header>

      {/* Main Operational Container */}
      <section className="content">
        
        {/* ================= FIX: HEADER ROW BLOCK ================= */}
        <div className="header-row">
          <div className="header">
            <h2>Shipments - Completed Operations</h2>
            <p>Monitor and manage regional freight movements across the Nueva Ecija network.</p>
          </div>
          
          <button className="btn-primary" onClick={() => console.log("Create Shipment Clicked")}>
            <i className="las la-plus"></i> ADD SHIPMENT
          </button>
        </div>

        {/* Operational Performance Stat Metrics */}
        <div className="stats">
          <div className="stat-card completed">
            <div className="stat-header">
              <h4>Completed Today</h4>
              <i class="las la-check-circle stat-icon"></i>
            </div>
            <h2>18</h2>
            <p>Deliveries finished today</p>
          </div>
          
          <div className="stat-card ontime">
            <div className="stat-header">
              <h4>On Time</h4>
              <i class="las la-clock stat-icon"></i>
            </div>
            <h2>15</h2>
            <p>83% of today's deliveries</p>
          </div>
          
          <div className="stat-card late">
            <div className="stat-header">
              <h4>Late Deliveries</h4>
              <i class="las la-exclamation-triangle stat-icon"></i>
            </div>
            <h2>3</h2>
            <p>Completed but overdue</p>
          </div>
          
          <div className="stat-card trips">
            <div className="stat-header">
              <h4>This Week's Trips</h4>
              <i class="las la-truck stat-icon"></i>
            </div>
            <h2>74</h2>
            <p>Monday to today</p>
          </div>
        </div>

        {/* View Layout Filter Tabs */}
        <div className="view-tabs">
          <div className="tab">Active <span className="badge">24</span></div>
          <div className="tab">Delayed <span className="badge" style={{ background: "#FEE2E2", color: "#EF4444" }}>3</span></div>
          <div className="tab active">Completed</div>
          <div className="tab">Review <span className="badge" style={{ background: "#FEF3C7", color: "#D97706" }}>3</span></div>
        </div>

        {/* Dynamic Context Filters & Toolbar Controls */}
        <div className="table-controls">
          <div className="search-wrapper">
            <i className="las la-search" style={{ position: "absolute", left: "16px", top: "14px", color: "#94A3B8", fontSize: "16px" }}></i>
            <input
              type="text"
              className="table-search"
              placeholder="Search by ID, Vehicle Type, or Driver..."
            />
          </div>
          <button className="control-btn">SORT BY <i className="las la-bars"></i></button>
          <button className="control-btn">TODAY <i class="las la-calendar"></i></button>
          <button className="control-btn"><i class="las la-sliders-h"></i></button>
        </div>

        {/* Shipment Registry Presentation Table */}
        <div className="shipment-table-card">
          <table className="shipment-table">
            <thead>
              <tr>
                <th>Shipment ID</th>
                <th>Customer</th>
                <th>Route</th>
                <th>Driver & Vehicle</th>
                <th>Target Delivery</th>
                <th>Actual Delivery</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {/* Row 1: On Time Delivery */}
              <tr>
                <td>
                  <div className="cell-bold">SHP-NE-7821</div>
                  <div className="cell-sub">Palletized Goods</div>
                </td>
                <td>
                  <div className="customer-cell">
                    <div className="customer-avatar" style={{ background: "#EFF6FF", color: "#1E40AF" }}>AL</div>
                    <div className="text-dark-bold">Agri-Logistics Inc.</div>
                  </div>
                </td>
                <td>
                  <div className="text-dark-bold">Cabanatuan <span className="route-arrow">→</span> Gapan</div>
                </td>
                <td>
                  <div className="text-dark-bold">Ricardo Mendoza</div>
                  <div className="cell-sub">Fleet: T-402</div>
                </td>
                <td>Today, 09:30</td>
                <td className="text-dark-bold">Today, 09:45</td>
                <td>
                  <span className="status transit"><i class="las la-check-circle"></i> ON TIME</span>
                </td>
                <td><button className="action-btn"><i class="las la-ellipsis-v"></i></button></td>
              </tr>

              {/* Row 2: Overdue Delivery */}
              <tr>
                <td>
                  <div className="cell-bold">SHP-NE-7815</div>
                  <div className="cell-sub">Cold Chain</div>
                </td>
                <td>
                  <div className="customer-cell">
                    <div className="customer-avatar" style={{ background: "#F0FDF4", color: "#166534" }}>SM</div>
                    <div className="text-dark-bold">San Miguel Corp</div>
                  </div>
                </td>
                <td>
                  <div className="text-dark-bold">San Jose <span className="route-arrow">→</span> Muñoz</div>
                </td>
                <td>
                  <div className="text-dark-bold">Eduardo Garcia</div>
                  <div className="cell-sub">Fleet: R-205</div>
                </td>
                <td>Today, 08:00</td>
                <td className="text-danger">Today, 10:15</td>
                <td>
                  <span className="status delayed">LATE <span className="status-time">(+2h 15m)</span></span>
                </td>
                <td><button className="action-btn"><i class="las la-ellipsis-v"></i></button></td>
              </tr>

              {/* Row 3: On Time Delivery */}
              <tr>
                <td>
                  <div className="cell-bold">SHP-NE-7810</div>
                  <div className="cell-sub">Agricultural Bulk</div>
                </td>
                <td>
                  <div className="customer-cell">
                    <div className="customer-avatar" style={{ background: "#F8FAFC", color: "#475569" }}>NFA</div>
                    <div className="text-dark-bold">NFA Branch</div>
                  </div>
                </td>
                <td>
                  <div className="text-dark-bold">Guimba <span className="route-arrow">→</span> Talavera</div>
                </td>
                <td>
                  <div className="text-dark-bold">Mark Santos</div>
                  <div className="cell-sub">Fleet: F-901</div>
                </td>
                <td>Yesterday, 16:00</td>
                <td className="text-dark-bold">Yesterday, 15:40</td>
                <td>
                  <span className="status transit"><i class="las la-check-circle"></i> ON TIME</span>
                </td>
                <td><button className="action-btn"><i class="las la-ellipsis-v"></i></button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </MainLayout>
  );
}