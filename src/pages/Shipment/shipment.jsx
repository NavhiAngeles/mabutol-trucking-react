import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../../layouts/mainLayout";
import CreateShipmentDrawer from "./CreateShipmentDrawer";
import "./shipment.css";

/* =============================================================================
   SHIPMENT DATA SOURCE
   Each shipment carries a `status` flag: "transit" | "loading" | "delayed" |
   "review" | "completed". The four nav tabs are just filters over this list,
   so adding a new shipment here automatically slots it into the right tab.
============================================================================= */
const SHIPMENTS = [
  {
    id: "SHP-NE-8042",
    cargo: "Palletized Goods",
    origin: "Cabanatuan City",
    originSub: "Hub Alpha",
    destination: "Gapan City",
    destinationSub: "Distribution Ctr",
    status: "transit",
    driver: "Ricardo Mendoza",
    fleet: "Fleet: T-402",
    eta: "Today, 14:30",
    etaNote: "On Time",
    etaNoteClass: "text-success-green",
  },
  {
    id: "SHP-NE-8050",
    cargo: "Construction Mat",
    origin: "Cabanatuan City",
    originSub: "Yard 4",
    destination: "Talavera",
    destinationSub: "Site 8A",
    status: "loading",
    driver: "Jose Dizon",
    fleet: "Fleet: F-901",
    eta: "Today, 18:00",
    etaNote: "Est. Depart 14:00",
    etaNoteClass: "text-muted-gray",
  },
  {
    id: "SHP-NE-8031",
    cargo: "Cold Chain Produce",
    origin: "Cabanatuan City",
    originSub: "Cold Storage B",
    destination: "Talavera",
    destinationSub: "Site 2C",
    status: "delayed",
    driver: "Mark Villanueva",
    fleet: "Fleet: T-318",
    eta: "Today, 11:00",
    etaNote: "Delayed 1h 40m",
    etaNoteClass: "text-danger-accent",
  },
  {
    id: "SHP-NE-8037",
    cargo: "Agri Inputs",
    origin: "Cabanatuan City",
    originSub: "Agri-Terminal",
    destination: "Munoz",
    destinationSub: "Site 5",
    status: "delayed",
    driver: "Anton Reyes",
    fleet: "Fleet: T-220",
    eta: "Today, 12:15",
    etaNote: "Delayed 55m",
    etaNoteClass: "text-danger-accent",
  },
  {
    id: "SHP-NE-8044",
    cargo: "Dry Goods",
    origin: "Cabanatuan City",
    originSub: "Hub Alpha",
    destination: "San Jose City",
    destinationSub: "Hub B",
    status: "delayed",
    driver: "Noel Garcia",
    fleet: "Fleet: F-704",
    eta: "Today, 16:00",
    etaNote: "Delayed 30m",
    etaNoteClass: "text-danger-accent",
  },
  {
    id: "SHP-NE-8019",
    cargo: "Mixed Pallet Load",
    origin: "Cabanatuan City",
    originSub: "Hub Alpha",
    destination: "Gapan City",
    destinationSub: "Distribution Ctr",
    status: "review",
    driver: "Ricardo Mendoza",
    fleet: "Fleet: T-402",
    eta: "Yesterday, 17:40",
    etaNote: "Flagged: weight mismatch",
    etaNoteClass: "text-danger-accent",
  },
  {
    id: "SHP-NE-8027",
    cargo: "Construction Mat",
    origin: "Cabanatuan City",
    originSub: "Yard 4",
    destination: "Talavera",
    destinationSub: "Site 8A",
    status: "review",
    driver: "Jose Dizon",
    fleet: "Fleet: F-901",
    eta: "Yesterday, 19:10",
    etaNote: "Flagged: POD missing",
    etaNoteClass: "text-danger-accent",
  },
  {
    id: "SHP-NE-7990",
    cargo: "Cold Chain Produce",
    origin: "Cabanatuan City",
    originSub: "Cold Storage B",
    destination: "Munoz",
    destinationSub: "Site 5",
    status: "review",
    driver: "Mark Villanueva",
    fleet: "Fleet: T-318",
    eta: "2 days ago, 09:20",
    etaNote: "Flagged: customer dispute",
    etaNoteClass: "text-danger-accent",
  },
  {
    id: "SHP-NE-7821",
    cargo: "Palletized Goods",
    customer: "Agri-Logistics Inc.",
    customerInitials: "AL",
    origin: "Cabanatuan",
    destination: "Gapan",
    status: "completed",
    driver: "Ricardo Mendoza",
    fleet: "Fleet: T-402",
    targetDelivery: "Today, 09:30",
    actualDelivery: "Today, 09:45",
    deliveryStatus: "ON TIME",
  },
];

/* Tab configuration: filter rule + display copy + stat cards.
   Keeping this in one place means the header, stats, and table headers
   all stay in sync whenever a tab is added or its data changes. */
const TAB_CONFIG = {
  active: {
    label: "Active",
    title: "Active Operations",
    description:
      "Real-time view of all ongoing shipments currently in transit, loading, or preparing for departure.",
    filter: (s) => s.status === "transit" || s.status === "loading",
    badge: 24,
  },
  delayed: {
    label: "Delayed",
    title: "Delayed Shipments",
    description: "Shipments currently behind schedule and requiring routing review.",
    filter: (s) => s.status === "delayed",
    badge: 3,
    badgeClass: "badge-danger",
  },
  completed: {
    label: "Completed",
    title: "Completed Operations",
    description:
      "Historical record of safely fulfilled regional freight movements across the Nueva Ecija network.",
    filter: (s) => s.status === "completed",
    badge: null,
  },
  review: {
    label: "Review",
    title: "Shipments Needing Review",
    description: "Completed or in-progress shipments flagged for manual review before closing out.",
    filter: (s) => s.status === "review",
    badge: 3,
    badgeClass: "badge-warning",
  },
};

export default function Shipment() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState("active");
  const navigate = useNavigate();

  const activeConfig = TAB_CONFIG[currentTab];
  const visibleShipments = SHIPMENTS.filter(activeConfig.filter);

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
          <div
              className="avatar"
              onClick={() => navigate("/settings/account")}
              style={{ cursor: "pointer" }}
              title="Go to Account Settings"
            >
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
            <h2>Shipments - {activeConfig.title}</h2>
            <p>{activeConfig.description}</p>
          </div>
          
          <button className="btn-primary" onClick={() => setIsDrawerOpen(true)}>
            <i className="las la-plus"></i> ADD SHIPMENT
          </button>
        </div>

        {/* Dynamic Operational Cards Block Row */}
        <div className="stats">
          {currentTab === "active" && (
            <>
              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>In Transit</h4>
                  <i className="las la-truck stat-icon text-transit"></i>
                </div>
                <h2>{SHIPMENTS.filter((s) => s.status === "transit").length}</h2>
                <p>Currently on the road</p>
              </div>
              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>Loading / Preparing</h4>
                  <i className="las la-box stat-icon text-loading"></i>
                </div>
                <h2>{SHIPMENTS.filter((s) => s.status === "loading").length}</h2>
                <p>Awaiting dispatch parameters</p>
              </div>
              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Delayed</h4>
                  <i className="las la-exclamation-triangle stat-icon text-delayed"></i>
                </div>
                <h2>{SHIPMENTS.filter((s) => s.status === "delayed").length}</h2>
                <p className="text-danger-accent">Immediate routing review required</p>
              </div>
            </>
          )}

          {currentTab === "delayed" && (
            <>
              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Delayed Now</h4>
                  <i className="las la-exclamation-triangle stat-icon text-delayed"></i>
                </div>
                <h2>{visibleShipments.length}</h2>
                <p className="text-danger-accent">Immediate routing review required</p>
              </div>
              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>Avg. Delay</h4>
                  <i className="las la-clock stat-icon"></i>
                </div>
                <h2>1h 8m</h2>
                <p>Across all delayed shipments</p>
              </div>
              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>Worst Delay</h4>
                  <i className="las la-hourglass-end stat-icon text-delayed"></i>
                </div>
                <h2>1h 40m</h2>
                <p>SHP-NE-8031</p>
              </div>
            </>
          )}

          {currentTab === "completed" && (
            <>
              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>Completed Today</h4>
                  <i className="las la-check-circle stat-icon"></i>
                </div>
                <h2>{SHIPMENTS.filter((s) => s.status === "completed").length}</h2>
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

          {currentTab === "review" && (
            <>
              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Pending Review</h4>
                  <i className="las la-flag stat-icon text-delayed"></i>
                </div>
                <h2>{visibleShipments.length}</h2>
                <p className="text-danger-accent">Needs manual sign-off</p>
              </div>
              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>Avg. Age</h4>
                  <i className="las la-history stat-icon"></i>
                </div>
                <h2>1.3 days</h2>
                <p>Since flagged for review</p>
              </div>
              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>Resolved This Week</h4>
                  <i className="las la-check-circle stat-icon"></i>
                </div>
                <h2>11</h2>
                <p>Cleared after review</p>
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
          {Object.entries(TAB_CONFIG).map(([key, cfg]) => (
            <div
              key={key}
              className={`tab ${currentTab === key ? "active" : ""}`}
              onClick={() => setCurrentTab(key)}
            >
              {cfg.label}
              {cfg.badge !== null && (
                <span className={`badge ${cfg.badgeClass || ""}`}>{cfg.badge}</span>
              )}
            </div>
          ))}
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
            {currentTab === "completed" ? (
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
                  {visibleShipments.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="cell-bold">{s.id}</div>
                        <div className="cell-sub">{s.cargo}</div>
                      </td>
                      <td>
                        <div className="customer-cell">
                          <div className="customer-avatar avatar-blue">{s.customerInitials}</div>
                          <div className="text-dark-bold">{s.customer}</div>
                        </div>
                      </td>
                      <td>
                        <div className="text-dark-bold">
                          {s.origin} <span className="route-arrow">→</span> {s.destination}
                        </div>
                      </td>
                      <td>
                        <div className="text-dark-bold">{s.driver}</div>
                        <div className="cell-sub">{s.fleet}</div>
                      </td>
                      <td>{s.targetDelivery}</td>
                      <td className="text-dark-bold">{s.actualDelivery}</td>
                      <td>
                        <span className="status transit">
                          <i className="las la-check-circle"></i> {s.deliveryStatus}
                        </span>
                      </td>
                      <td><button className="action-btn"><i className="las la-ellipsis-v"></i></button></td>
                    </tr>
                  ))}
                  {visibleShipments.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", padding: "32px" }}>
                        No completed shipments to show.
                      </td>
                    </tr>
                  )}
                </tbody>
              </>
            ) : (
              /* ACTIVE / DELAYED / REVIEW DATA VIEW (shared shape) */
              /* header */
              <>
                <thead>
                  <tr>
                    <th>Shipment ID</th>
                    <th>Origin</th>
                    <th>Destination</th>
                    <th>Status</th>
                    <th>Assigned Driver</th>
                    <th>{currentTab === "review" ? "Last Update" : "Estimated Delivery"}</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleShipments.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="cell-bold">{s.id}</div>
                        <div className="cell-sub">{s.cargo}</div>
                      </td>
                      <td>
                        <div className="text-dark-bold">{s.origin}</div>
                        <div className="cell-sub">{s.originSub}</div>
                      </td>
                      <td>
                        <div className="text-dark-bold">{s.destination}</div>
                        <div className="cell-sub">{s.destinationSub}</div>
                      </td>
                      <td>
                        <span
                          className={`status ${s.status === "transit" ? "transit-pill" : "loading-pill"}`}
                        >
                          ● {s.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div className="text-dark-bold">{s.driver}</div>
                        <div className="cell-sub">{s.fleet}</div>
                      </td>
                      <td>
                        <div className="text-dark-bold">{s.eta}</div>
                        <div className={`status-sub-indicator ${s.etaNoteClass || ""}`}>{s.etaNote}</div>
                      </td>
                      <td><button className="action-btn"><i className="las la-ellipsis-v"></i></button></td>
                    </tr>
                  ))}
                  {visibleShipments.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "32px" }}>
                        No {activeConfig.label.toLowerCase()} shipments to show.
                      </td>
                    </tr>
                  )}
                </tbody>
              </>
            )}
          </table>
          
          {/* Bottom Table Pagination Control Footer */}
          <div className="table-pagination-footer">
            <span className="pagination-summary">
              Showing 1-{visibleShipments.length} of {visibleShipments.length} {activeConfig.label} Shipments
            </span>
            <div className="pagination-controls-group">
              <button className="page-nav-btn"><i className="las la-angle-left"></i></button>
              <button className="page-number-btn active">1</button>
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