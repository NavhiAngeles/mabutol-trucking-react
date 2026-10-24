
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../../layouts/mainLayout";
import CreateShipmentDrawer from "./CreateShipmentDrawer";
import { useShipmentViewModel } from "../../viewmodels/ShipmentViewModel";
import { assignShipmentResources } from "../../services/shipmentService";
import "./shipment.css";

export default function Shipment() {
  const navigate = useNavigate();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [assigningId, setAssigningId] = useState(null);
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const menuRef = useRef(null);

  const {
    visibleShipments,
    pagedShipments,
    page,
    pageCount,
    pageSize,
    setPage,
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
    recordFilter,
  } = useShipmentViewModel();

  useEffect(() => {
    const onOutsideClick = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", onOutsideClick);

    return () =>
      document.removeEventListener(
        "mousedown",
        onOutsideClick
      );
  }, []);

  const toggleMenu = (id) =>
    setOpenMenuId((previous) =>
      previous === id ? null : id
    );

  const handleView = (shipment) => {
    console.log("View shipment:", shipment.dbId);
    window.alert(
      `Shipment ${shipment.id}\nDetails page is not implemented yet.`
    );
  };

  const handleAssign = async (shipment) => {
    if (assigningId) return;
    setAssigningId(shipment.dbId);
    setAssignmentMessage("");
    try {
      const deliveryId = await assignShipmentResources(shipment.dbId);
      setAssignmentMessage(deliveryId
        ? `Driver and truck assigned to ${shipment.id}.`
        : "No available driver and matching truck can carry this load. The booking is still awaiting assignment.");
      await refresh();
    } catch (error) {
      setAssignmentMessage(error.message || "Could not assign this shipment. Please try again.");
    } finally {
      setAssigningId(null);
    }
  };

  const handleEdit = (shipment) => {
    console.log("Edit shipment:", shipment.dbId);
    window.alert("Shipment editing is not implemented yet.");
  };

  const handleCancel = (shipment) => {
    console.log("Cancel shipment:", shipment.dbId);
    window.alert("Shipment cancellation is not implemented yet.");
  };

  const statusLabel = (status) =>
    ({
      transit: "IN TRANSIT",
      loading: "LOADING",
      delayed: "DELAYED",
      review: "REVIEW",
      completed: "COMPLETED",
    })[status] ??
    String(status || "UNKNOWN").toUpperCase();

  const statusClass = (status) =>
    ({
      transit: "transit-pill",
      loading: "loading-pill",
      delayed: "delayed-pill",
      review: "review-pill",
    })[status] ?? "loading-pill";

  const renderMenu = (shipment, completed = false) => (
    <div
      className="action-menu-wrapper"
      ref={openMenuId === shipment.dbId ? menuRef : null}
    >
      <button
        type="button"
        className="action-btn"
        aria-label={`Actions for ${shipment.id}`}
        aria-expanded={openMenuId === shipment.dbId}
        onClick={() => toggleMenu(shipment.dbId)}
      >
        <i className="las la-ellipsis-v" />
      </button>

      {openMenuId === shipment.dbId && (
        <div className="action-dropdown">
          {shipment.rawStatus === "booked" && !shipment.assignmentId && (
            <button type="button" disabled={Boolean(assigningId)}
              onClick={() => { handleAssign(shipment); setOpenMenuId(null); }}>
              {assigningId === shipment.dbId ? "Assigning…" : "Assign available driver & truck"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              handleView(shipment);
              setOpenMenuId(null);
            }}
          >
            <i className="las la-eye" /> View Details
          </button>

          {!completed && (
            <>
              <button
                type="button"
                onClick={() => {
                  handleEdit(shipment);
                  setOpenMenuId(null);
                }}
              >
                <i className="las la-pen" /> Edit
              </button>

              {shipment.status !== "review" && (
                <button
                  type="button"
                  className="action-danger"
                  onClick={() => {
                    handleCancel(shipment);
                    setOpenMenuId(null);
                  }}
                >
                  <i className="las la-times-circle" /> Cancel
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <MainLayout>
      {/* TOPBAR */}
      <header className="topbar">
        <div className="search-container">
          <i className="las la-search topbar-search-icon" />

          <input
            type="text"
            id="shipmentSearch"
            placeholder="Search shipments..."
            value={searchQuery}
            onChange={(event) =>
              setSearchQuery(event.target.value)
            }
          />
        </div>

        <div className="topbar-right">
          <button
            type="button"
            id="notifBtn"
            className="notification-btn"
            onClick={() =>
              window.alert("No new notifications")
            }
          >
            <i className="las la-bell" />
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

      <section className="content">
        {/* HEADER */}
        <div className="header-row">
          <div className="header">
            <h2>Shipments - {activeConfig.title}</h2>
            <p>{activeConfig.description}</p>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsDrawerOpen(true)}
          >
            <i className="las la-plus" /> ADD SHIPMENT
          </button>
        </div>

        {/* DATABASE ERROR */}
        {assignmentMessage && <p role="status">{assignmentMessage}</p>}
        {recordFilter && <p role="status">{!isLoading && !error && !visibleShipments.length ? 'The selected shipment is unavailable or does not match your search.' : 'Showing the shipment selected from Operations Feed.'} <button onClick={() => setCurrentTab('all')}>Show all shipments</button></p>}
        {error && (
          <div
            className="shipment-error-banner"
            role="alert"
          >
            <i className="las la-exclamation-circle" />

            <span>
              Could not load shipments: {error}
            </span>

            <button
              type="button"
              onClick={() => refresh()}
              className="retry-btn"
            >
              Retry
            </button>
          </div>
        )}

        {/* STATISTICS */}
        <div className="stats">
          {currentTab === "active" && (
            <>
              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>In Transit</h4>
                  <i className="las la-truck stat-icon text-transit" />
                </div>
                <h2>{stats.transitCount}</h2>
                <p>Currently on the road</p>
              </div>

              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>Loading / Preparing</h4>
                  <i className="las la-box stat-icon text-loading" />
                </div>
                <h2>{stats.loadingCount}</h2>
                <p>Awaiting dispatch</p>
              </div>

              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Delayed</h4>
                  <i className="las la-exclamation-triangle stat-icon text-delayed" />
                </div>
                <h2>{stats.delayedCount}</h2>
                <p className="text-danger-accent">
                  Requires attention
                </p>
              </div>
            </>
          )}

          {currentTab === "delayed" && (
            <>
              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Delayed Now</h4>
                  <i className="las la-exclamation-triangle stat-icon text-delayed" />
                </div>
                <h2>{stats.delayedCount}</h2>
                <p>Requires attention</p>
              </div>

              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>Avg. Delay</h4>
                  <i className="las la-clock stat-icon" />
                </div>
                <h2>{stats.avgDelayLabel}</h2>
                <p>Across delayed shipments</p>
              </div>

              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>Worst Delay</h4>
                  <i className="las la-hourglass-end stat-icon text-delayed" />
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
                  <i className="las la-check-circle stat-icon" />
                </div>
                <h2>{stats.completedToday}</h2>
                <p>Deliveries finished today</p>
              </div>

              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>On Time Fulfill</h4>
                  <i className="las la-clock stat-icon" />
                </div>
                <h2>{stats.onTimeToday}</h2>
                <p>{stats.onTimePct}% of today's handoffs</p>
              </div>

              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Late Deliveries</h4>
                  <i className="las la-exclamation-triangle stat-icon" />
                </div>
                <h2>{stats.lateToday}</h2>
                <p>Delivered outside window</p>
              </div>
            </>
          )}

          {currentTab === "review" && (
            <>
              <div className="stat-card late">
                <div className="stat-header">
                  <h4>Pending Review</h4>
                  <i className="las la-flag stat-icon text-delayed" />
                </div>
                <h2>{visibleShipments.length}</h2>
                <p>Needs manual review</p>
              </div>

              <div className="stat-card ontime">
                <div className="stat-header">
                  <h4>Avg. Age</h4>
                  <i className="las la-history stat-icon" />
                </div>
                <h2>{stats.avgReviewAgeLabel}</h2>
                <p>Since last update</p>
              </div>

              <div className="stat-card completed">
                <div className="stat-header">
                  <h4>Resolved This Week</h4>
                  <i className="las la-check-circle stat-icon" />
                </div>
                <h2>—</h2>
                <p>Not yet tracked</p>
              </div>
            </>
          )}

          <div className="stat-card trips">
            <div className="stat-header">
              <h4>This Week's Trips</h4>
              <i className="las la-chart-bar stat-icon" />
            </div>
            <h2>{stats.weeklyTrips}</h2>
            <p>Shipments created this week</p>
          </div>
        </div>

        {/* SHIPMENT TABS */}
        <div className="view-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className={`tab ${
                currentTab === tab.key ? "active" : ""
              }`}
              role="button"
              tabIndex={0}
              onClick={() => {
                setCurrentTab(tab.key);
                setOpenMenuId(null);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === " "
                ) {
                  event.preventDefault();
                  setCurrentTab(tab.key);
                  setOpenMenuId(null);
                }
              }}
            >
              {tab.label}

              {tab.badge !== null &&
                tab.badge !== undefined && (
                  <span
                    className={`badge ${
                      tab.badgeClass || ""
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
            </div>
          ))}
        </div>

        {/* SEARCH AND REFRESH */}
        <div className="table-controls">
          <div className="search-wrapper">
            <i className="las la-search table-search-icon" />

            <input
              type="text"
              className="table-search"
              placeholder="Search by ID, route, driver or customer..."
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(event.target.value)
              }
            />
          </div>

          <button
            type="button"
            className="control-btn"
            onClick={() => refresh()}
          >
            REFRESH <i className="las la-sync" />
          </button>
        </div>

        {/* LOADING */}
        {isLoading && (
          <div
            className="shipment-loading"
            role="status"
          >
            <i className="las la-spinner la-spin" />
            <span>Loading shipments…</span>
          </div>
        )}

        {/* SHIPMENT TABLE */}
        {!isLoading && (
          <div className="shipment-table-card">
            <table className="shipment-table">
              {currentTab === "completed" ? (
                <>
                  <thead>
                    <tr>
                      <th>Shipment ID</th>
                      <th>Customer</th>
                      <th>Route</th>
                      <th>Driver &amp; Vehicle</th>
                      <th>Target Delivery</th>
                      <th>Actual Delivery</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pagedShipments.map((s) => (
                      <tr key={s.dbId}>
                        <td>
                          <div className="cell-bold">
                            {s.id}
                          </div>
                          <div className="cell-sub">
                            {s.cargo}
                          </div>
                        </td>

                        <td>
                          <div className="customer-cell">
                            <div className="customer-avatar avatar-blue">
                              {s.customerInitials || "?"}
                            </div>
                            <div className="text-dark-bold">
                              {s.customer}
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="text-dark-bold">
                            {s.origin}{" "}
                            <span className="route-arrow">
                              →
                            </span>{" "}
                            {s.destination}
                          </div>
                        </td>

                        <td>
                          <div className="text-dark-bold">
                            {s.driver}
                          </div>
                          <div className="cell-sub">
                            {s.fleet}
                          </div>
                        </td>

                        <td>{s.targetDelivery}</td>

                        <td className="text-dark-bold">
                          {s.actualDelivery}
                        </td>

                        <td>
                          <span className="status transit">
                            <i className="las la-check-circle" />{" "}
                            {s.deliveryStatus}
                          </span>
                        </td>

                        <td>{renderMenu(s, true)}</td>
                      </tr>
                    ))}

                    {visibleShipments.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            textAlign: "center",
                            padding: "32px",
                          }}
                        >
                          {error
                            ? "Unable to load completed shipments."
                            : "No completed shipments to show."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr>
                      <th>Shipment ID</th>
                      <th>Origin</th>
                      <th>Destination</th>
                      <th>Status</th>
                      <th>Assigned Driver</th>
                      <th>
                        {currentTab === "review"
                          ? "Last Update"
                          : "Estimated Delivery"}
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pagedShipments.map((s) => (
                      <tr key={s.dbId}>
                        <td>
                          <div className="cell-bold">
                            {s.id}
                          </div>
                          <div className="cell-sub">
                            {s.cargo}
                          </div>
                        </td>

                        <td>
                          <div className="text-dark-bold">
                            {s.origin}
                          </div>
                          <div className="cell-sub">
                            {s.originSub}
                          </div>
                        </td>

                        <td>
                          <div className="text-dark-bold">
                            {s.destination}
                          </div>
                          <div className="cell-sub">
                            {s.destinationSub}
                          </div>
                        </td>

                        <td>
                          <span
                            className={`status ${statusClass(
                              s.status
                            )}`}
                          >
                            ● {statusLabel(s.status)}
                          </span>
                        </td>

                        <td>
                          <div className="text-dark-bold">
                            {s.driver}
                          </div>
                          <div className="cell-sub">
                            {s.fleet}
                          </div>
                        </td>

                        <td>
                          <div className="text-dark-bold">
                            {s.eta}
                          </div>
                          <div
                            className={`status-sub-indicator ${
                              s.etaNoteClass || ""
                            }`}
                          >
                            {s.etaNote}
                          </div>
                        </td>

                        <td>{renderMenu(s)}</td>
                      </tr>
                    ))}

                    {visibleShipments.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          style={{
                            textAlign: "center",
                            padding: "32px",
                          }}
                        >
                          {error
                            ? "Unable to load shipments."
                            : `No ${activeConfig.label.toLowerCase()} shipments to show.`}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </>
              )}
            </table>

            {/* TABLE FOOTER */}
            <div className="table-pagination-footer">
              <span className="pagination-summary">
                {visibleShipments.length === 0
                  ? "Showing 0"
                  : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, visibleShipments.length)}`}{" "}
                of {visibleShipments.length}{" "}
                {activeConfig.label} Shipments
              </span>

              <nav className="pagination-controls-group" aria-label="Shipment pages">
                <button type="button" className="page-nav-btn" disabled={page === 1}
                  onClick={() => { setPage(page - 1); setOpenMenuId(null); }}>
                  Previous
                </button>
                <span className="pagination-summary" aria-live="polite">Page {page} of {pageCount}</span>
                <button type="button" className="page-nav-btn" disabled={page === pageCount}
                  onClick={() => { setPage(page + 1); setOpenMenuId(null); }}>
                  Next
                </button>
              </nav>
            </div>
          </div>
        )}
      </section>

      {/* CREATE SHIPMENT DRAWER */}
      <CreateShipmentDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          refresh();
        }}
      />
    </MainLayout>
  );
}
