import OfficeTools from "../../components/OfficeTools";
import ReturnLoadPlanner from "./ReturnLoadPlanner";

import { useEffect, useRef, useState } from "react";
import MainLayout from "../../layouts/mainLayout";
import CreateShipmentDrawer from "./CreateShipmentDrawer";
import BookingReview from "./BookingReview";
import ShipmentDetails from "./ShipmentDetails";
import ShipmentEditDialog from "./ShipmentEditDialog";
import ShipmentCancellationDialog from "./ShipmentCancellationDialog";
import { useShipmentViewModel } from "../../viewmodels/ShipmentViewModel";
import { assignShipmentResources } from "../../services/shipmentService";
import { SkeletonStatValue, SkeletonTableRows } from "../../components/Skeleton/Skeleton";
import "./shipment.css";

const svgProps = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const BoxesIcon = ({ className }) => (
  <svg {...svgProps} width="18" height="18" className={className}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const TruckIcon = ({ className }) => (
  <svg {...svgProps} width="18" height="18" className={className}>
    <rect x="1" y="3" width="15" height="13" rx="2" />
    <path d="M16 8h4l3 3v5h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

const AlertTriangleIcon = ({ className }) => (
  <svg {...svgProps} width="18" height="18" className={className}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const AlertCircleIcon = ({ className }) => (
  <svg {...svgProps} width="18" height="18" className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const CheckCircleIcon = ({ className, size = 18 }) => (
  <svg {...svgProps} width={size} height={size} className={className}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const ClockIcon = ({ className }) => (
  <svg {...svgProps} width="18" height="18" className={className}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const FlagIcon = ({ className }) => (
  <svg {...svgProps} width="18" height="18" className={className}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);

const BarChartIcon = ({ className }) => (
  <svg {...svgProps} width="18" height="18" className={className}>
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
);

const HourglassIcon = ({ className }) => (
  <svg {...svgProps} width="18" height="18" className={className}>
    <path d="M5 22h14" />
    <path d="M5 2h14" />
    <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
    <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
  </svg>
);

export default function Shipment() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [reviewShipment, setReviewShipment] = useState(null);
  const [detailsShipment, setDetailsShipment] = useState(null);
  const [editShipment, setEditShipment] = useState(null);
  const [cancelShipment, setCancelShipment] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [assigningId, setAssigningId] = useState(null);
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const menuRef = useRef(null);
  const reviewLauncher = useRef(null);

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
        setMenuPosition(null);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" && menuRef.current) {
        const trigger = menuRef.current.querySelector(".action-btn");
        setOpenMenuId(null);
        setMenuPosition(null);
        trigger?.focus();
      }
    };

    const onDismiss = () => {
      setOpenMenuId(null);
      setMenuPosition(null);
    };

    document.addEventListener("mousedown", onOutsideClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);

    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, []);

  const toggleMenu = (id, event) => {
    if (openMenuId === id) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }

    const rect = event?.currentTarget?.getBoundingClientRect?.();
    if (rect) {
      const winHeight = typeof window !== "undefined" ? window.innerHeight : 800;
      const winWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
      const spaceBelow = winHeight - rect.bottom;
      const openUpward = spaceBelow < 210 && rect.top > 210;

      setMenuPosition({
        top: openUpward ? "auto" : `${rect.bottom + 4}px`,
        bottom: openUpward ? `${winHeight - rect.top + 4}px` : "auto",
        right: `${Math.max(12, winWidth - rect.right)}px`,
      });
    } else {
      setMenuPosition(null);
    }

    setOpenMenuId(id);
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

  const statusLabel = (status) =>
    ({
      transit: "IN TRANSIT",
      loading: "LOADING",
      delayed: "DELAYED",
      review: "REVIEW",
      completed: "COMPLETED",
      pending: "PENDING REVIEW",
      booked: "BOOKED",
      assigned: "ASSIGNED",
      cancelled: "CANCELLED",
    })[status] ??
    String(status || "UNKNOWN").toUpperCase();

  const statusClass = (status) =>
    ({
      transit: "transit-pill",
      loading: "loading-pill",
      delayed: "delayed-pill",
      review: "review-pill",
      pending: "review-pill",
      booked: "loading-pill",
      assigned: "loading-pill",
      cancelled: "cancelled-pill",
    })[status] ?? "loading-pill";

  const renderMenu = (shipment, completed = false) => (
    <div
      className={`action-menu-wrapper${openMenuId === shipment.dbId ? " menu-open" : ""}`}
      ref={openMenuId === shipment.dbId ? menuRef : null}
      onKeyDown={(event) => {
        if (openMenuId !== shipment.dbId) return;
        const items = Array.from(
          event.currentTarget.querySelectorAll?.('[role="menuitem"]:not([disabled])') || []
        );
        if (items.length === 0) return;
        const currentIndex = items.indexOf(document.activeElement);
        if (event.key === "ArrowDown") {
          event.preventDefault();
          items[(currentIndex + 1) % items.length]?.focus();
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          items[(currentIndex - 1 + items.length) % items.length]?.focus();
        } else if (event.key === "Home") {
          event.preventDefault();
          items[0]?.focus();
        } else if (event.key === "End") {
          event.preventDefault();
          items[items.length - 1]?.focus();
        }
      }}
    >
      {shipment.rawStatus === "booked" && !shipment.assignmentId && (
        <button
          type="button"
          className="action-pill-btn assign-pill-btn"
          disabled={Boolean(assigningId)}
          aria-label={`Assign driver and truck to ${shipment.id}`}
          onClick={() => {
            handleAssign(shipment);
            setOpenMenuId(null);
          }}
        >
          {assigningId === shipment.dbId ? "Assigning…" : "Assign"}
        </button>
      )}

      <button
        type="button"
        className="action-btn"
        aria-label={`Actions for ${shipment.id}`}
        aria-haspopup="menu"
        aria-expanded={openMenuId === shipment.dbId}
        onClick={(event) => toggleMenu(shipment.dbId, event)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {openMenuId === shipment.dbId && (
        <div
          className="action-dropdown"
          role="menu"
          style={
            menuPosition
              ? {
                position: "fixed",
                top: menuPosition.top,
                bottom: menuPosition.bottom,
                right: menuPosition.right,
                left: "auto",
                zIndex: 1000,
              }
              : undefined
          }
        >
          {shipment.rawStatus === 'pending' && (
            <button type="button" role="menuitem" onClick={event => {
              reviewLauncher.current = event?.currentTarget?.closest?.('.action-menu-wrapper')?.querySelector?.('.action-btn');
              setReviewShipment(shipment); setOpenMenuId(null);
            }}>
              <svg {...svgProps}>
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              {' Review booking request'}
            </button>
          )}
          {shipment.rawStatus === "booked" && !shipment.assignmentId && (
            <button type="button" role="menuitem" disabled={Boolean(assigningId)}
              onClick={() => { handleAssign(shipment); setOpenMenuId(null); }}>
              {assigningId === shipment.dbId ? "Assigning…" : "Assign available driver & truck"}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={event => {
              reviewLauncher.current = event?.currentTarget?.closest?.('.action-menu-wrapper')?.querySelector?.('.action-btn');
              setDetailsShipment(shipment);
              setOpenMenuId(null);
            }}
          >
            <svg {...svgProps}>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            {' Edit Details'}
          </button>

          {!completed && shipment.status !== "cancelled" && (
            <>
              <button type="button" role="menuitem" onClick={event => {
                reviewLauncher.current = event?.currentTarget?.closest?.('.action-menu-wrapper')?.querySelector?.('.action-btn');
                setEditShipment(shipment);
                setOpenMenuId(null);
              }}>
                <svg {...svgProps}>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {' View shipment'}
              </button>

              {shipment.status !== "review" && (
                <button
                  type="button"
                  role="menuitem"
                  className="action-danger"
                  onClick={event => {
                    reviewLauncher.current = event?.currentTarget?.closest?.('.action-menu-wrapper')?.querySelector?.('.action-btn');
                    setCancelShipment(shipment); setOpenMenuId(null);
                  }}
                >
                  <svg {...svgProps}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  {' Cancel shipment'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  const initialLoading = isLoading && visibleShipments.length === 0 && stats.weeklyTrips === "\u2014";
  const statValueOrSkeleton = (value, width = "56px") =>
    initialLoading ? <SkeletonStatValue width={width} height={28} /> : value;

  return (
    <MainLayout>
      {/* TOPBAR */}
      <header className="topbar shipment-topbar">
        <div className="topbar-right">
          <OfficeTools />
        </div>
      </header>

      <section className="content shipment-page">
        {/* HEADER */}
        <div className="header-row">
          <div className="header">
            <h1>Shipments: {activeConfig.title}</h1>
            <p>{activeConfig.description}</p>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsDrawerOpen(true)}
          >
            <svg {...svgProps} width="16" height="16">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {' ADD SHIPMENT'}
          </button>
        </div>

        <ReturnLoadPlanner onInspect={setDetailsShipment} />
        {/* STATUS & FEEDBACK NOTIFICATIONS */}
        {assignmentMessage && (
          <div
            className={`shipment-feedback-banner ${assignmentMessage.toLowerCase().includes("could not") ||
              assignmentMessage.toLowerCase().includes("error") ||
              assignmentMessage.toLowerCase().includes("denied")
              ? "is-error"
              : assignmentMessage.toLowerCase().includes("no available") ||
                assignmentMessage.toLowerCase().includes("awaiting")
                ? "is-warning"
                : "is-success"
              }`}
            role="status"
          >
            <div className="feedback-content">
              {assignmentMessage.toLowerCase().includes("could not") ||
                assignmentMessage.toLowerCase().includes("error") ||
                assignmentMessage.toLowerCase().includes("denied") ? (
                <AlertCircleIcon className="feedback-icon" />
              ) : assignmentMessage.toLowerCase().includes("no available") ||
                assignmentMessage.toLowerCase().includes("awaiting") ? (
                <AlertTriangleIcon className="feedback-icon" />
              ) : (
                <CheckCircleIcon className="feedback-icon" />
              )}
              <span>{assignmentMessage}</span>
            </div>
            <button
              type="button"
              className="feedback-close"
              aria-label="Dismiss message"
              onClick={() => setAssignmentMessage("")}
            >
              &times;
            </button>
          </div>
        )}
        {recordFilter && (
          <div className="shipment-feedback-banner is-info" role="status">
            <div className="feedback-content">
              <svg {...svgProps} width="18" height="18" className="feedback-icon">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>
                {!isLoading && !error && !visibleShipments.length
                  ? "The selected shipment is unavailable or does not match your search."
                  : "Showing the shipment selected from Operations Feed."}
              </span>
              <button
                type="button"
                className="banner-action-btn"
                onClick={() => setCurrentTab("all")}
              >
                Show all shipments
              </button>
            </div>
          </div>
        )}
        {error && (
          <div
            className="shipment-error-banner"
            role="alert"
          >
            <AlertCircleIcon />

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
          {(currentTab === "all" || !["active", "delayed", "completed", "review"].includes(currentTab)) && (
            <>
              <div className="stat-card">
                <div className="stat-header">
                  <p className="stat-label">Total Shipments</p>
                  <BoxesIcon className="stat-icon" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(visibleShipments.length)}</strong>
                <p>Recorded in system</p>
              </div>

              <div className="stat-card completed">
                <div className="stat-header">
                  <p className="stat-label">In Transit</p>
                  <TruckIcon className="stat-icon text-transit" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.transitCount ?? 0)}</strong>
                <p>Currently on the road</p>
              </div>

              <div className="stat-card late">
                <div className="stat-header">
                  <p className="stat-label">Delayed</p>
                  <AlertTriangleIcon className="stat-icon text-delayed" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.delayedCount ?? 0)}</strong>
                <p className="text-danger-accent">
                  Requires attention
                </p>
              </div>
            </>
          )}

          {currentTab === "active" && (
            <>
              <div className="stat-card completed">
                <div className="stat-header">
                  <p className="stat-label">In Transit</p>
                  <TruckIcon className="stat-icon text-transit" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.transitCount)}</strong>
                <p>Currently on the road</p>
              </div>

              <div className="stat-card ontime">
                <div className="stat-header">
                  <p className="stat-label">Loading / Preparing</p>
                  <BoxesIcon className="stat-icon text-loading" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.loadingCount)}</strong>
                <p>Awaiting dispatch</p>
              </div>

              <div className="stat-card late">
                <div className="stat-header">
                  <p className="stat-label">Delayed</p>
                  <AlertTriangleIcon className="stat-icon text-delayed" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.delayedCount)}</strong>
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
                  <p className="stat-label">Delayed Now</p>
                  <AlertTriangleIcon className="stat-icon text-delayed" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.delayedCount)}</strong>
                <p>Requires attention</p>
              </div>

              <div className="stat-card ontime">
                <div className="stat-header">
                  <p className="stat-label">Avg. Delay</p>
                  <ClockIcon className="stat-icon" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.avgDelayLabel, "72px")}</strong>
                <p>Across delayed shipments</p>
              </div>

              <div className="stat-card completed">
                <div className="stat-header">
                  <p className="stat-label">Worst Delay</p>
                  <HourglassIcon className="stat-icon text-delayed" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.worstDelay.label, "72px")}</strong>
                <p>{initialLoading ? "Checking delays…" : stats.worstDelay.id}</p>
              </div>
            </>
          )}

          {currentTab === "completed" && (
            <>
              <div className="stat-card completed">
                <div className="stat-header">
                  <p className="stat-label">Completed Today</p>
                  <CheckCircleIcon className="stat-icon" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.completedToday)}</strong>
                <p>Deliveries finished today</p>
              </div>

              <div className="stat-card ontime">
                <div className="stat-header">
                  <p className="stat-label">On Time Fulfill</p>
                  <ClockIcon className="stat-icon" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.onTimeToday)}</strong>
                <p>{initialLoading ? "Checking delivery timing…" : stats.onTimePct == null ? 'Timing unavailable' : `${stats.onTimePct}% of today's handoffs with known timing`}</p>
              </div>

              <div className="stat-card late">
                <div className="stat-header">
                  <p className="stat-label">Late Deliveries</p>
                  <AlertTriangleIcon className="stat-icon" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.lateToday)}</strong>
                <p>Delivered outside window</p>
              </div>
            </>
          )}

          {currentTab === "review" && (
            <>
              <div className="stat-card late">
                <div className="stat-header">
                  <p className="stat-label">Pending Review</p>
                  <FlagIcon className="stat-icon text-delayed" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(visibleShipments.length)}</strong>
                <p>Needs manual review</p>
              </div>

              <div className="stat-card ontime">
                <div className="stat-header">
                  <p className="stat-label">Avg. Age</p>
                  <ClockIcon className="stat-icon" />
                </div>
                <strong className="stat-value">{statValueOrSkeleton(stats.avgReviewAgeLabel, "72px")}</strong>
                <p>Since last update</p>
              </div>

              <div className="stat-card completed">
                <div className="stat-header">
                  <p className="stat-label">Resolved This Week</p>
                  <CheckCircleIcon className="stat-icon" />
                </div>
                <strong className="stat-value">N/A</strong>
                <p>Not yet tracked</p>
              </div>
            </>
          )}

          <div className="stat-card trips">
            <div className="stat-header">
              <p className="stat-label">This Week's Trips</p>
              <BarChartIcon className="stat-icon" />
            </div>
            <strong className="stat-value">{isLoading && stats.weeklyTrips === "\u2014" ? <SkeletonStatValue width="56px" height={28} /> : String(stats.weeklyTrips ?? "").replace(/\u2014/g, "N/A")}</strong>
            <p>{stats.weeklyTrips === "\u2014" ? (isLoading ? "Loading count…" : "Count unavailable") : "Shipments created this week"}</p>
          </div>
        </div>

        {/* SHIPMENT TABS */}
        <div
          className="view-tabs"
          role="tablist"
          aria-label="Shipment views"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const currentIndex = Math.max(0, tabs.findIndex((t) => t.key === currentTab));
            const nextIndex =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : event.key === "ArrowRight"
                    ? (currentIndex + 1) % tabs.length
                    : (currentIndex - 1 + tabs.length) % tabs.length;
            const nextTab = tabs[nextIndex];
            if (!nextTab) return;
            setCurrentTab(nextTab.key);
            setOpenMenuId(null);
            event.currentTarget.querySelector?.(`#shipment-tab-${nextTab.key}`)?.focus?.();
          }}
        >
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.key}
              id={`shipment-tab-${tab.key}`}
              className={`tab ${currentTab === tab.key ? "active" : ""
                }`}
              role="tab"
              aria-selected={currentTab === tab.key}
              aria-controls="shipment-table-panel"
              onClick={() => {
                setCurrentTab(tab.key);
                setOpenMenuId(null);
              }}
            >
              {tab.label}

              {tab.badge !== null &&
                tab.badge !== undefined && (
                  <span
                    className={`badge ${tab.badgeClass || ""
                      }`}
                  >
                    {tab.badge}
                  </span>
                )}
            </button>
          ))}
        </div>

        {/* SEARCH AND REFRESH */}
        <div className="table-controls">
          <div className="search-wrapper">
            <label htmlFor="shipmentSearch" className="sr-only">
              Search shipments
            </label>
            <svg {...svgProps} className="table-search-icon">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              type="text"
              id="shipmentSearch"
              aria-label="Search shipments"
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
            REFRESH{" "}
            <svg {...svgProps} width="14" height="14">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>

        {/* LOADING */}
        {isLoading && (
          <div
            className="shipment-loading"
            role="status"
          >
            <svg {...svgProps} width="22" height="22" className="shipment-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>Loading shipments…</span>
          </div>
        )}

        {/* SHIPMENT TABLE */}
        <div
          id="shipment-table-panel"
          className="shipment-table-card"
          role="tabpanel"
          aria-labelledby={`shipment-tab-${currentTab}`}
          aria-busy={isLoading}
        >
          <div className="shipment-table-scroll">
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
                    {isLoading && pagedShipments.length === 0 ? (
                      <SkeletonTableRows
                        rows={6}
                        columns={[
                          "stack",
                          "avatar-stack",
                          "text",
                          "stack",
                          "short",
                          "short",
                          "badge",
                          "action",
                        ]}
                      />
                    ) : (
                      <>
                        {pagedShipments.map((s) => (
                          <tr key={s.dbId} className={openMenuId === s.dbId ? "row-menu-open" : ""}>
                            <td>
                              <div className="cell-bold">
                                {s.id}
                              </div>
                              <div className="cell-sub">
                                {s.cargo}
                              </div>
                              <details className="shipment-driver-instructions">
                                <summary>Driver instructions</summary>
                                <p>{s.driverNotes || 'None recorded'}</p>
                              </details>
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

                            <td className="location-cell" title={`${s.origin} → ${s.destination}`}>
                              <div className="location-text">
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
                              <span className={`status ${s.deliveryStatus === 'UNKNOWN' ? 'unknown-timing' : 'transit'}`}>
                                {s.deliveryStatus === 'UNKNOWN' ? (
                                  <svg {...svgProps} width="13" height="13">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                  </svg>
                                ) : (
                                  <CheckCircleIcon size={13} />
                                )}{" "}
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
                      </>
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
                    {isLoading && pagedShipments.length === 0 ? (
                      <SkeletonTableRows
                        rows={6}
                        columns={[
                          "stack",
                          "stack",
                          "stack",
                          "badge",
                          "stack",
                          "stack",
                          "action",
                        ]}
                      />
                    ) : (
                      <>
                        {pagedShipments.map((s) => (
                          <tr key={s.dbId} className={openMenuId === s.dbId ? "row-menu-open" : ""}>
                            <td>
                              <div className="cell-bold">
                                {s.id}
                              </div>
                              <div className="cell-sub">
                                {s.cargo}
                              </div>
                              <details className="shipment-driver-instructions">
                                <summary>Driver instructions</summary>
                                <p>{s.driverNotes || 'None recorded'}</p>
                              </details>
                            </td>

                            <td className="location-cell" title={s.origin}>
                              <div className="location-text">
                                {s.origin}
                              </div>
                              {s.originSub ? <div className="cell-sub">{s.originSub}</div> : null}
                            </td>

                            <td className="location-cell" title={s.destination}>
                              <div className="location-text">
                                {s.destination}
                              </div>
                              {s.destinationSub ? <div className="cell-sub">{s.destinationSub}</div> : null}
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
                                className={`status-sub-indicator ${s.etaNoteClass || ""
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
                      </>
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>

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
              <button type="button" className="page-nav-btn" disabled={isLoading || page === 1}
                onClick={() => { setPage(page - 1); setOpenMenuId(null); }}>
                Previous
              </button>
              <span className="pagination-summary" aria-live="polite">Page {page} of {pageCount}</span>
              <button type="button" className="page-nav-btn" disabled={isLoading || page === pageCount}
                onClick={() => { setPage(page + 1); setOpenMenuId(null); }}>
                Next
              </button>
            </nav>
          </div>
        </div>

        {/* CREATE SHIPMENT DRAWER */}
        {cancelShipment && <ShipmentCancellationDialog key={cancelShipment.dbId} shipment={cancelShipment}
          onClose={() => { setCancelShipment(null); reviewLauncher.current?.focus(); }}
          onCancelled={result => {
            setAssignmentMessage(`Shipment cancelled. Reservations released.${result.financial_review_required ? ' Existing payments require separate financial review.' : ' Recorded charges and payments are unchanged.'}`);
            setCancelShipment(null); reviewLauncher.current?.focus(); refresh();
          }} />}
        {detailsShipment && <ShipmentDetails key={detailsShipment.dbId} shipment={detailsShipment}
          onClose={() => { setDetailsShipment(null); reviewLauncher.current?.focus(); }} />}
        {editShipment && <ShipmentEditDialog key={editShipment.dbId} shipment={editShipment}
          onClose={() => { setEditShipment(null); reviewLauncher.current?.focus(); }}
          onSaved={async () => { await refresh(); }} />}
        {reviewShipment && <BookingReview key={reviewShipment.dbId} shipment={reviewShipment}
          onClose={() => { setReviewShipment(null); reviewLauncher.current?.focus(); }}
          onReviewed={result => {
            setAssignmentMessage(result.status === 'cancelled' ? 'Booking request rejected and cancelled.'
              : result.delivery_id ? 'Booking approved. Driver and truck assigned.' : 'Booking approved. Awaiting an available driver and matching truck.');
            setReviewShipment(null);
            reviewLauncher.current?.focus();
            refresh();
          }} />}
        <CreateShipmentDrawer
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            refresh();
          }}
        />
      </section>
    </MainLayout>
  );
}
