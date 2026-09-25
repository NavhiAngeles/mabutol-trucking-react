import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../../layouts/mainLayout";
import CreateShipmentDrawer from "./CreateShipmentDrawer";
import { useShipmentViewModel } from "../../viewmodels/ShipmentViewModel";
import "./shipment.css";

export default function Shipment() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const navigate = useNavigate();

  const {
    visibleShipments,
    tabs,
    stats,
    activeConfig,
    currentTab,
    setCurrentTab,
    searchQuery,
    setSearchQuery,
    isLoading,
    error,
    refresh,
  } = useShipmentViewModel();

  /* --------------------- actions dropdown state --------------------- */
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleMenu = (id) =>
    setOpenMenuId((prev) => (prev === id ? null : id));

  /* ----------------------- action handlers ------------------------- */
  const handleView = (shipment) => {
    console.log("View shipment:", shipment.id);
    // TODO: navigate to shipment detail page
  };

  const handleEdit = (shipment) => {
    console.log("Edit shipment:", shipment.id);
    // TODO: open edit drawer / navigate to edit page
  };

  const handleCancel = (shipment) => {
    console.log("Cancel shipment:", shipment.id);
    // TODO: confirmation modal + call cancelShipment service
  };

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

        {/* Error Banner */}
        {error && (
          <div className="shipment-error-banner">
            <i className="las la-exclamation-circle"></i>
            <span>{error}</span>
            <button onClick={refresh} className="retry-btn">Retry</button>
          </div>
        )}

        {/* Dynamic Operational Cards Block Row */}
        <div className="stats">
          {currentTab === "active" && (
            <>
              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>In Transit</h4>
                  <i className="las la-truck stat-icon text-transit"></i>
                </div>
                <h2>{stats.transitCount}</h2>
                <p>Currently on the road</p>
              </div>
              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>Loading / Preparing</h4>
                  <i className="las la-box stat-icon text-loading"></i>
                </div>
                <h2>{stats.loadingCount}</h2>
                <p>Awaiting dispatch parameters</p>
              </div>
              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Delayed</h4>
                  <i className="las la-exclamation-triangle stat-icon text-delayed"></i>
                </div>
                <h2>{stats.delayedCount}</h2>
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
                <h2>{stats.delayedCount}</h2>
                <p className="text-danger-accent">Immediate routing review required</p>
              </div>
              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>Avg. Delay</h4>
                  <i className="las la-clock stat-icon"></i>
                </div>
                <h2>{stats.avgDelayLabel}</h2>
                <p>Across all delayed shipments</p>
              </div>
              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>Worst Delay</h4>
                  <i className="las la-hourglass-end stat-icon text-delayed"></i>
                </div>
                <h2>{stats.worstDelay.label}</h2>
                <p>{stats.worstDelay.id}</p>
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
                <h2>{stats.completedToday}</h2>
                <p>Deliveries finished today</p>
              </div>
              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>On Time Fulfill</h4>
                  <i className="las la-clock stat-icon"></i>
                </div>
                <h2>{stats.onTimeToday}</h2>
                <p>{stats.onTimePct}% of today's handoffs</p>
              </div>
              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Late Deliveries</h4>
                  <i className="las la-exclamation-triangle stat-icon"></i>
                </div>
                <h2>{stats.lateToday}</h2>
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
                <h2>{stats.avgReviewAgeLabel}</h2>
                <p>Since flagged for review</p>
              </div>
              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>Resolved This Week</h4>
                  <i className="las la-check-circle stat-icon"></i>
                </div>
                <h2>—</h2>
                <p>Cleared after review</p>
              </div>
            </>
          )}

          <div className="stat-card trips">
            <div className="stat-header">
              <h4>This Week's Trips</h4>
              <i className="las la-chart-bar stat-icon"></i>
            </div>
            <h2>{stats.weeklyTrips}</h2>
            <p>Aggregated fleet total</p>
          </div>
        </div>

        {/* INTERACTIVE NAVIGATION SUB-TABS OVERHAUL */}
        <div className="view-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className={`tab ${currentTab === tab.key ? "active" : ""}`}
              onClick={() => setCurrentTab(tab.key)}
            >
              {tab.label}
              {tab.badge !== null && tab.badge !== undefined && (
                <span className={`badge ${tab.badgeClass || ""}`}>{tab.badge}</span>
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="control-btn">SORT BY <i className="las la-bars"></i></button>
          <button className="control-btn">TODAY <i className="las la-calendar"></i></button>
          <button className="control-btn"><i className="las la-sliders-h"></i></button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="shipment-loading">
            <i className="las la-spinner la-spin"></i>
            <span>Loading shipments…</span>
          </div>
        )}

        {/* DYNAMIC CONDITION TABLE CONTAINER SWITCH */}
        {!isLoading && (
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
                      <tr key={s.dbId}>
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
                        <td>
                          <div className="action-menu-wrapper" ref={openMenuId === s.dbId ? menuRef : null}>
                            <button className="action-btn" onClick={() => toggleMenu(s.dbId)}>
                              <i className="las la-ellipsis-v"></i>
                            </button>
                            {openMenuId === s.dbId && (
                              <div className="action-dropdown">
                                <button onClick={() => { handleView(s); setOpenMenuId(null); }}>
                                  <i className="las la-eye"></i> View Details
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
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
                      <tr key={s.dbId}>
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
                            className={`status ${s.status === "transit" ? "transit-pill" : s.status === "delayed" ? "delayed-pill" : s.status === "review" ? "review-pill" : "loading-pill"}`}
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
                        <td>
                          <div className="action-menu-wrapper" ref={openMenuId === s.dbId ? menuRef : null}>
                            <button className="action-btn" onClick={() => toggleMenu(s.dbId)}>
                              <i className="las la-ellipsis-v"></i>
                            </button>
                            {openMenuId === s.dbId && (
                              <div className="action-dropdown">
                                <button onClick={() => { handleView(s); setOpenMenuId(null); }}>
                                  <i className="las la-eye"></i> View Details
                                </button>
                                <button onClick={() => { handleEdit(s); setOpenMenuId(null); }}>
                                  <i className="las la-pen"></i> Edit
                                </button>
                                {s.status !== "review" && (
                                  <button className="action-danger" onClick={() => { handleCancel(s); setOpenMenuId(null); }}>
                                    <i className="las la-times-circle"></i> Cancel
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {visibleShipments.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "32px" }}>
                          No {activeConfig.label?.toLowerCase() ?? ""} shipments to show.
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
        )}
      </section>

      {/* Slide-out Overlay Form Component */}
      <CreateShipmentDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </MainLayout>
  );
}