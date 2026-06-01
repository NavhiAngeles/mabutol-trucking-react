import { useState } from "react";
import MainLayout from "../../layouts/mainLayout";
import CreateShipmentDrawer from "./CreateShipmentDrawer";
import "./shipment.css";

export default function Shipment() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // State to handle which sub-page table dataset is actively visible
  const [currentTab, setCurrentTab] = useState("active");

  return (
    <MainLayout>
      {/* Global Topbar Header Area */}
      <header className="topbar">
        <div className="search-container">
          <i className="las la-search topbar-search-icon"></i>
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
              className="avatar-img"
            />
          </div>
        </div>
      </header>

      {/* Main Content Workspace Layout Canvas */}
      <section className="content">
        
        {/* Dynamic Title and Action Button based on Tab View */}
        <div className="header-row">
          <div className="header">
            <h2>Shipments - {currentTab === "active" ? "Active Operations" : "Completed Operations"}</h2>
            <p>
              {currentTab === "active" 
                ? "Real-time view of all ongoing shipments currently in transit, loading, or preparing for departure."
                : "Historical record of safely fulfilled regional freight movements across the Nueva Ecija network."}
            </p>
          </div>
          
          <button className="btn-primary" onClick={() => setIsDrawerOpen(true)}>
            <i className="las la-plus"></i> ADD SHIPMENT
          </button>
        </div>

        {/* Dynamic Operational Cards Block Row */}
        <div className="stats">
          {currentTab === "active" ? (
            <>
              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>In Transit</h4>
                  <i className="las la-truck stat-icon text-transit"></i>
                </div>
                <h2>18</h2>
                <p>Currently on the road</p>
              </div>
              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>Loading / Preparing</h4>
                  <i className="las la-box stat-icon text-loading"></i>
                </div>
                <h2>4</h2>
                <p>Awaiting dispatch parameters</p>
              </div>
              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Delayed</h4>
                  <i className="las la-exclamation-triangle stat-icon text-delayed"></i>
                </div>
                <h2>3</h2>
                <p className="text-danger-accent">Immediate routing review required</p>
              </div>
            </>
          ) : (
            <>
              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>Completed Today</h4>
                  <i className="las la-check-circle stat-icon"></i>
                </div>
                <h2>18</h2>
                <p>Deliveries finished today</p>
              </div>
              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>On Time Fulfill</h4>
                  <i className="las la-clock stat-icon"></i>
                </div>
                <h2>15</h2>
                <p>83% of today's handoffs</p>
              </div>
              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Late Deliveries</h4>
                  <i className="las la-exclamation-triangle stat-icon"></i>
                </div>
                <h2>3</h2>
                <p>Delivered but outside window</p>
              </div>
            </>
          )}

          <div className="stat-card trips">
            <div className="stat-header">
              <h4>This Week's Trips</h4>
              <i className="las la-chart-bar stat-icon"></i>
            </div>
            <h2>74</h2>
            <p>Aggregated fleet total</p>
          </div>
        </div>

        {/* INTERACTIVE NAVIGATION SUB-TABS OVERHAUL */}
        <div className="view-tabs">
          <div 
            className={`tab ${currentTab === "active" ? "active" : ""}`}
            onClick={() => setCurrentTab("active")}
          >
            Active <span className="badge">24</span>
          </div>
          <div className="tab">
            Delayed <span className="badge badge-danger">3</span>
          </div>
          <div 
            className={`tab ${currentTab === "completed" ? "active" : ""}`}
            onClick={() => setCurrentTab("completed")}
          >
            Completed
          </div>
          <div className="tab">
            Review <span className="badge badge-warning">3</span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="table-controls">
          <div className="search-wrapper">
            <i className="las la-search table-search-icon"></i>
            <input
              type="text"
              className="table-search"
              placeholder="Search by ID, route point, or driver..."
            />
          </div>
          <button className="control-btn">SORT BY <i className="las la-bars"></i></button>
          <button className="control-btn">TODAY <i className="las la-calendar"></i></button>
          <button className="control-btn"><i className="las la-sliders-h"></i></button>
        </div>

        {/* DYNAMIC CONDITION TABLE CONTAINER SWITCH */}
        <div className="shipment-table-card">
          <table className="shipment-table">
            {currentTab === "active" ? (
              /* ACTIVE OPERATIONS DATA VIEW */
              <>
                <thead>
                  <tr>
                    <th>Shipment ID</th>
                    <th>Origin</th>
                    <th>Destination</th>
                    <th>Status</th>
                    <th>Assigned Driver</th>
                    <th>Estimated Delivery</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div className="cell-bold">SHP-NE-8042</div>
                      <div className="cell-sub">Palletized Goods</div>
                    </td>
                    <td>
                      <div className="text-dark-bold">Cabanatuan City</div>
                      <div className="cell-sub">Hub Alpha</div>
                    </td>
                    <td>
                      <div className="text-dark-bold">Gapan City</div>
                      <div className="cell-sub">Distribution Ctr</div>
                    </td>
                    <td>
                      <span className="status transit-pill">● IN TRANSIT</span>
                    </td>
                    <td>
                      <div className="text-dark-bold">Ricardo Mendoza</div>
                      <div className="cell-sub">Fleet: T-402</div>
                    </td>
                    <td>
                      <div className="text-dark-bold">Today, 14:30</div>
                      <div className="status-sub-indicator text-success-green">On Time</div>
                    </td>
                    <td><button className="action-btn"><i className="las la-ellipsis-v"></i></button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="cell-bold">SHP-NE-8050</div>
                      <div className="cell-sub">Construction Mat</div>
                    </td>
                    <td>
                      <div className="text-dark-bold">Cabanatuan City</div>
                      <div className="cell-sub">Yard 4</div>
                    </td>
                    <td>
                      <div className="text-dark-bold">Talavera</div>
                      <div className="cell-sub">Site 8A</div>
                    </td>
                    <td>
                      <span className="status loading-pill">● LOADING</span>
                    </td>
                    <td>
                      <div className="text-dark-bold">Jose Dizon</div>
                      <div className="cell-sub">Fleet: F-901</div>
                    </td>
                    <td>
                      <div className="text-dark-bold">Today, 18:00</div>
                      <div className="status-sub-indicator text-muted-gray">Est. Depart 14:00</div>
                    </td>
                    <td><button className="action-btn"><i className="las la-ellipsis-v"></i></button></td>
                  </tr>
                </tbody>
              </>
            ) : (
              /* COMPLETED OPERATIONS DATA VIEW */
              <>
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
                  <tr>
                    <td>
                      <div className="cell-bold">SHP-NE-7821</div>
                      <div className="cell-sub">Palletized Goods</div>
                    </td>
                    <td>
                      <div className="customer-cell">
                        <div className="customer-avatar avatar-blue">AL</div>
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
                      <span className="status transit"><i className="las la-check-circle"></i> ON TIME</span>
                    </td>
                    <td><button className="action-btn"><i className="las la-ellipsis-v"></i></button></td>
                  </tr>
                </tbody>
              </>
            )}
          </table>
          
          {/* Bottom Table Pagination Control Footer */}
          <div className="table-pagination-footer">
            <span className="pagination-summary">
              Showing 1-{currentTab === "active" ? "2" : "1"} of {currentTab === "active" ? "24 Active" : "18 Completed"} Shipments
            </span>
            <div className="pagination-controls-group">
              <button className="page-nav-btn"><i className="las la-angle-left"></i></button>
              <button className="page-number-btn active">1</button>
              <button className="page-number-btn">2</button>
              <button className="page-nav-btn"><i className="las la-angle-right"></i></button>
            </div>
          </div>
        </div>
      </section>

      {/* Slide-out Overlay Form Component */}
      <CreateShipmentDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </MainLayout>
  );
}