import OfficeTools from "../../components/OfficeTools";
import CustomerEditDialog from "./CustomerEditDialog";
import CustomerStatusDialog from "./CustomerStatusDialog";
import CustomerAddDialog from "./CustomerAddDialog";
import AppealReviewDialog from "./AppealReviewDialog";
import CustomerAppealsTab from "./CustomerAppealsTab";
import StrikeStatusIndicator from "../../components/StrikeStatusIndicator/StrikeStatusIndicator";
import { useAuth } from "../../context/AuthContext";
import { useState, useRef, useEffect, useMemo } from "react";
import MainLayout from "../../layouts/mainLayout";
import "./customer.css";
import { useCustomerDirectory, buildCustomerRows, customerStatistics, filterCustomerRows } from "../../viewmodels/CustomerViewModel";
import { formatManilaDateTime } from "../../services/customerStandingService";
import ReportExportModal from "../../components/ReportExportModal";
import { SkeletonStatValue, SkeletonTableRows } from "../../components/Skeleton/Skeleton";

const PAGE_SIZE = 10;

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const PlusIcon = (props) => (
  <svg {...iconProps} {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const DownloadIcon = (props) => (
  <svg {...iconProps} {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ChevronLeftIcon = (props) => (
  <svg {...iconProps} width={14} height={14} {...props}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = (props) => (
  <svg {...iconProps} width={14} height={14} {...props}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const SearchIcon = (props) => (
  <svg {...iconProps} {...props}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const SortIcon = (props) => (
  <svg {...iconProps} width={14} height={14} {...props}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="6" y1="12" x2="18" y2="12" />
    <line x1="10" y1="18" x2="14" y2="18" />
  </svg>
);

const CalendarIcon = (props) => (
  <svg {...iconProps} width={14} height={14} {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const CheckIcon = (props) => (
  <svg {...iconProps} width={14} height={14} {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CheckCircleIcon = (props) => (
  <svg {...iconProps} width={18} height={18} {...props}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const CloseIcon = (props) => (
  <svg {...iconProps} {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PhoneIcon = (props) => (
  <svg {...iconProps} width={14} height={14} {...props}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const MoreVerticalIcon = (props) => (
  <svg {...iconProps} {...props}>
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

const MailIcon = (props) => (
  <svg {...iconProps} width={14} height={14} {...props}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const MapPinIcon = (props) => (
  <svg {...iconProps} width={14} height={14} {...props}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const BanIcon = (props) => (
  <svg {...iconProps} width={14} height={14} {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);

export default function Customer() {
  const { user, role } = useAuth();
  const canEdit = ["admin", "staff"].includes(role);
  const [editing, setEditing] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [appealReview, setAppealReview] = useState(null);
  const [activeTab, setActiveTab] = useState("directory");
  const [showAddModal, setShowAddModal] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = setTimeout(() => {
      setSaveMessage("");
    }, 5000);
    return () => clearTimeout(timer);
  }, [saveMessage]);
  const [profileCustomerId, setProfileCustomerId] = useState(null);
  const [historyCustomerId, setHistoryCustomerId] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const menuRef = useRef(null);
  const cpModalRef = useRef(null);
  const bhModalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const hadModalOpenRef = useRef(false);
  const activeModalKeyRef = useRef(null);
  const { customers: records, bookings, strikes, appeals, loading, error, refresh } = useCustomerDirectory({
    includeBookings: true,
    includeStanding: true,
  });
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [strikeFilter, setStrikeFilter] = useState("ALL");
  const [sort, setSort] = useState("newest");
  const [todayOnly, setTodayOnly] = useState(false);
  const [requestedPage, setPage] = useState(1);
  const rows = useMemo(() => buildCustomerRows(records, bookings, strikes, appeals), [records, bookings, strikes, appeals]);
  const rowMap = useMemo(() => new Map(rows.map(row => [row.id, row])), [rows]);
  const stats = useMemo(() => customerStatistics(rows), [rows]);
  const pendingAppealsCount = useMemo(
    () => appeals.filter(item => String(item?.status || "").toLowerCase() === "pending").length,
    [appeals]
  );
  const strikeFilterCounts = useMemo(() => {
    let hasStrikes = 0;
    let cooldown = 0;
    let suspended = 0;
    let reinstated = 0;
    for (const r of rows) {
      if ((r.noShowStrikeCount ?? 0) > 0) hasStrikes++;
      if (r.standingStatus === "cooldown") cooldown++;
      if (r.standingStatus === "suspended" || r.status === "SUSPENDED") suspended++;
      if (r.standingStatus === "reinstated") reinstated++;
    }
    return { all: rows.length, hasStrikes, cooldown, suspended, reinstated };
  }, [rows]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const activeSearchQuery = query === "" ? "" : debouncedQuery;
  const filtered = useMemo(() => filterCustomerRows(rows, { query: activeSearchQuery, status: statusFilter, strikeFilter, sort, todayOnly }), [rows, activeSearchQuery, statusFilter, strikeFilter, sort, todayOnly]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const customers = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const profileModal = profileCustomerId ? rowMap.get(profileCustomerId) || null : null;
  const bookingHistoryModal = historyCustomerId ? rowMap.get(historyCustomerId) || null : null;
  const setProfileModal = customer => setProfileCustomerId(customer?.id || null);
  const setBookingHistoryModal = customer => setHistoryCustomerId(customer?.id || null);
  const changeSearch = value => {
    setQuery(value);
    setPage(1);
    if (!value) setDebouncedQuery("");
  };
  const countLabel = value => loading ? <SkeletonStatValue width="48px" height={28} /> : error ? "--" : value;
  const exportMatches = useMemo(() => (
    query && query !== activeSearchQuery
      ? filterCustomerRows(rows, { query, status: statusFilter, strikeFilter, sort, todayOnly })
      : filtered
  ), [rows, filtered, query, activeSearchQuery, statusFilter, strikeFilter, sort, todayOnly]);
  const [snapshotDate] = useState(() => new Date(Date.now() + 28800000).toISOString().slice(0, 10));

  // Close dropdowns on outside click, scroll, resize or Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    }
    function handleDismiss() {
      setOpenMenuId(null);
      setMenuPosition(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape" && menuRef.current) {
        const trigger = menuRef.current.querySelector?.(".action-dots-btn");
        setOpenMenuId(null);
        setMenuPosition(null);
        trigger?.focus?.();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window?.addEventListener?.("scroll", handleDismiss, true);
    window?.addEventListener?.("resize", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window?.removeEventListener?.("scroll", handleDismiss, true);
      window?.removeEventListener?.("resize", handleDismiss);
    };
  }, []);

  const handleToggleMenu = (custId, event) => {
    if (openMenuId === custId) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    if (rect) {
      const winHeight = typeof window !== "undefined" ? window.innerHeight : 800;
      const winWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
      const spaceBelow = winHeight - rect.bottom;
      const openUpward = spaceBelow < 190 && rect.top > 190;
      setMenuPosition({
        top: openUpward ? "auto" : `${rect.bottom + 4}px`,
        bottom: openUpward ? `${winHeight - rect.top + 4}px` : "auto",
        right: `${Math.max(12, winWidth - rect.right)}px`,
      });
    } else {
      setMenuPosition(null);
    }
    setOpenMenuId(custId);
  };

  // Manage focus trap and Escape when profile or booking history modal is open
  useEffect(() => {
    if (!profileCustomerId && !historyCustomerId) return;
    function handleModalKeyDown(e) {
      if (statusTarget || editing || showAddModal) return;
      if (e.key === "Escape") {
        if (historyCustomerId) {
          setHistoryCustomerId(null);
        } else if (profileCustomerId) {
          setProfileCustomerId(null);
        }
      } else if (e.key === "Tab") {
        const dialog = historyCustomerId ? bhModalRef.current : cpModalRef.current;
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll?.(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ) || []
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !dialog.contains?.(document.activeElement)) {
            e.preventDefault();
            last.focus?.();
          }
        } else if (document.activeElement === last || !dialog.contains?.(document.activeElement)) {
          e.preventDefault();
          first.focus?.();
        }
      }
    }
    document.addEventListener("keydown", handleModalKeyDown);
    return () => document.removeEventListener("keydown", handleModalKeyDown);
  }, [profileCustomerId, historyCustomerId, statusTarget, editing, showAddModal]);

  const isProfileOpen = Boolean(profileModal);
  const isHistoryOpen = Boolean(bookingHistoryModal);

  useEffect(() => {
    const activeModalKey = isHistoryOpen
      ? `bh:${historyCustomerId}`
      : isProfileOpen
        ? `cp:${profileCustomerId}`
        : null;

    if (activeModalKey && !hadModalOpenRef.current && !previousFocusRef.current) {
      previousFocusRef.current = typeof document !== "undefined" ? document.activeElement : null;
    }

    if (activeModalKey !== activeModalKeyRef.current) {
      if (isHistoryOpen) {
        bhModalRef.current?.focus();
      } else if (isProfileOpen) {
        cpModalRef.current?.focus();
      } else if (hadModalOpenRef.current) {
        previousFocusRef.current?.focus?.();
        previousFocusRef.current = null;
      }
    }

    activeModalKeyRef.current = activeModalKey;
    hadModalOpenRef.current = Boolean(activeModalKey);
  }, [isProfileOpen, isHistoryOpen, profileCustomerId, historyCustomerId]);

  const handleViewProfile = (cust, e) => {
    if (!previousFocusRef.current) {
      const trigger = e?.currentTarget?.closest?.(".action-menu-wrapper")?.querySelector?.(".action-dots-btn");
      previousFocusRef.current = trigger || (typeof document !== "undefined" ? document.activeElement : null);
    }
    setOpenMenuId(null);
    setMenuPosition(null);
    setProfileModal(cust);
  };

  const handleViewBookingHistory = (cust, e) => {
    if (!previousFocusRef.current) {
      const trigger = e?.currentTarget?.closest?.(".action-menu-wrapper")?.querySelector?.(".action-dots-btn");
      previousFocusRef.current = trigger || (typeof document !== "undefined" ? document.activeElement : null);
    }
    setOpenMenuId(null);
    setMenuPosition(null);
    setBookingHistoryModal(cust);
  };

  const profile = profileModal ? profileModal.profile : null;
  const historyProfile = bookingHistoryModal ? bookingHistoryModal.profile : null;

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar customer-topbar">
        <div className="topbar-right">
          <OfficeTools />
        </div>
      </header>

      {/* Main Content */}
      <section className="content customer-page">
        <div className="content-header">
          <div>
            <h1 className="page-title">Customers</h1>
            <p className="page-subtitle">View and monitor registered customers.</p>
          </div>
          <div className="customer-header-actions">
            {canEdit && (
              <button
                type="button"
                className="btn-add-customer"
                onClick={() => setShowAddModal(true)}
                title="Register a new billing customer"
              >
                <PlusIcon />
                <span>Add Customer</span>
              </button>
            )}
            <button
              type="button"
              className="btn-export"
              disabled={loading || Boolean(error) || !filtered.length}
              onClick={() => setShowExportModal(true)}
              title="Preview and export customer directory to PDF or Excel"
            >
              <DownloadIcon />
              <span>Export Report</span>
            </button>
          </div>
        </div>

        <div className="stats-container">
          <div className="stat-card total-cust"><p className="stat-label">TOTAL CUSTOMERS</p><p className="stat-value tabular-nums">{countLabel(stats.total)}</p></div>
          <div className="stat-card active-cust" title="Active customers with a booking created this month, in Philippine time"><p className="stat-label">ACTIVE THIS MONTH</p><p className="stat-value tabular-nums">{countLabel(stats.activeThisMonth)}</p></div>
          <div className="stat-card new-cust"><p className="stat-label">NEW THIS WEEK</p><p className="stat-value tabular-nums">{countLabel(stats.newThisWeek)}</p></div>
          <div className="stat-card suspended-cust"><p className="stat-label">SUSPENDED</p><p className="stat-value tabular-nums">{countLabel(stats.suspended)}</p></div>
        </div>

        <div className="customer-view-tabs" role="tablist" aria-label="Customer views">
          <button
            type="button"
            role="tab"
            id="tab-customer-directory"
            aria-selected={activeTab === "directory"}
            className={`customer-view-tab ${activeTab === "directory" ? "is-active" : ""}`}
            onClick={() => setActiveTab("directory")}
          >
            <span>Customer Directory</span>
            <span className="customer-tab-badge tabular-nums">{rows.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-suspension-appeals"
            aria-selected={activeTab === "appeals"}
            className={`customer-view-tab ${activeTab === "appeals" ? "is-active" : ""}`}
            onClick={() => setActiveTab("appeals")}
          >
            <span>Suspension Appeals</span>
            <span className={`customer-tab-badge tabular-nums ${pendingAppealsCount > 0 ? "is-pending" : ""}`}>
              {pendingAppealsCount}
            </span>
          </button>
        </div>

        <div className="filter-action-bar">
          <div className="search-wrapper">
            <label htmlFor="customerSearch" className="sr-only">Search customers</label>
            <SearchIcon className="search-icon" />
            <input
              type="text"
              id="customerSearch"
              aria-label="Search customers"
              className="table-search"
              placeholder={
                activeTab === "appeals"
                  ? "Search appeals by customer name, ID, contact, or reason..."
                  : "Search by customer ID, name, email, or phone..."
              }
              value={query}
              onChange={event => changeSearch(event.target.value)}
            />
          </div>
          {activeTab === "directory" && (
            <div className="filter-buttons">
              <button
                type="button"
                className="filter-btn"
                onClick={() => {
                  setSort(sort === "newest" ? "name" : sort === "name" ? "bookings" : sort === "bookings" ? "strikes" : "newest");
                  setPage(1);
                }}
                title="Cycle newest, name, booking count, and strikes"
              >
                SORT: {sort.toUpperCase()} <SortIcon className="btn-icon" />
              </button>
              <button type="button" className="filter-btn" aria-pressed={todayOnly} onClick={() => { setTodayOnly(value => !value); setPage(1); }} title="Customers whose latest booking was created today">TODAY {todayOnly ? <CheckIcon className="btn-icon" /> : <CalendarIcon className="btn-icon" />}</button>
              <label htmlFor="customerStatusFilter" className="sr-only">Customer status</label>
              <select id="customerStatusFilter" className="filter-btn" aria-label="Customer status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="COOLDOWN">Cooldown</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="REINSTATED">Reinstated</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
          )}
        </div>

        {activeTab === "directory" && (
          <div className="strike-filter-bar" role="group" aria-label="Filter customers by no-show strike standing">
            <button
              type="button"
              className={`strike-chip ${strikeFilter === "ALL" ? "is-active" : ""}`}
              aria-pressed={strikeFilter === "ALL"}
              onClick={() => { setStrikeFilter("ALL"); setPage(1); }}
            >
              <span>All Standing</span>
              <span className="strike-chip-count tabular-nums">{strikeFilterCounts.all}</span>
            </button>
            <button
              type="button"
              className={`strike-chip ${strikeFilter === "HAS_STRIKES" ? "is-active" : ""}`}
              aria-pressed={strikeFilter === "HAS_STRIKES"}
              onClick={() => { setStrikeFilter("HAS_STRIKES"); setPage(1); }}
            >
              <span>Has Strikes (1+)</span>
              <span className="strike-chip-count tabular-nums">{strikeFilterCounts.hasStrikes}</span>
            </button>
            <button
              type="button"
              className={`strike-chip ${strikeFilter === "COOLDOWN" ? "is-active" : ""}`}
              aria-pressed={strikeFilter === "COOLDOWN"}
              onClick={() => { setStrikeFilter("COOLDOWN"); setPage(1); }}
            >
              <span>Cooldown</span>
              <span className="strike-chip-count tabular-nums">{strikeFilterCounts.cooldown}</span>
            </button>
            <button
              type="button"
              className={`strike-chip ${strikeFilter === "SUSPENDED" ? "is-active" : ""}`}
              aria-pressed={strikeFilter === "SUSPENDED"}
              onClick={() => { setStrikeFilter("SUSPENDED"); setPage(1); }}
            >
              <span>Suspended</span>
              <span className="strike-chip-count tabular-nums">{strikeFilterCounts.suspended}</span>
            </button>
            <button
              type="button"
              className={`strike-chip ${strikeFilter === "REINSTATED" ? "is-active" : ""}`}
              aria-pressed={strikeFilter === "REINSTATED"}
              onClick={() => { setStrikeFilter("REINSTATED"); setPage(1); }}
            >
              <span>Reinstated</span>
              <span className="strike-chip-count tabular-nums">{strikeFilterCounts.reinstated}</span>
            </button>
          </div>
        )}

        {error && <div className="customer-load-error" role="alert">Unable to load customers: {error} <button type="button" className="filter-btn" onClick={refresh}>Retry</button></div>}
        {saveMessage && (
          <div className="customer-feedback-banner is-success" role="status" aria-live="polite">
            <div className="customer-feedback-content">
              <CheckCircleIcon className="customer-feedback-icon" />
              <span>{saveMessage}</span>
            </div>
            <button
              type="button"
              className="customer-feedback-close"
              aria-label="Dismiss notification"
              onClick={() => setSaveMessage("")}
            >
              <CloseIcon />
            </button>
          </div>
        )}
        {activeTab === "appeals" ? (
          <CustomerAppealsTab
            appeals={appeals}
            customersById={rowMap}
            loading={loading}
            error={error}
            query={activeSearchQuery}
            canEdit={canEdit}
            onRefresh={refresh}
            onOpenProfile={(cust) => setProfileModal(cust)}
            onSelectReview={(appeal, customer, mode) => {
              setSaveMessage("");
              setAppealReview({ appeal, customer, mode });
            }}
          />
        ) : (
          <div className="customer-table-card" aria-busy={loading}>
            {loading && <p className="sr-only" role="status">Loading customers...</p>}
            <div className="customer-table-scroll" tabIndex={0} role="region" aria-label="Customer directory table">
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>CUSTOMER</th>
                    <th>CONTACT NUMBER</th>
                    <th>TOTAL BOOKINGS</th>
                    <th>LAST BOOKING</th>
                    <th>MEMBER SINCE</th>
                    <th className="text-center">STRIKE STATUS</th>
                    <th>STATUS</th>
                    <th className="text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonTableRows
                      rows={6}
                      columns={[
                        "avatar-stack",
                        "text",
                        "short",
                        "short",
                        "short",
                        "short",
                        "badge",
                        "action",
                      ]}
                    />
                  ) : error || customers.length === 0 ? (
                    <tr><td colSpan={8} className="customer-table-message">{error ? "Customer data is unavailable." : records.length ? "No customers match your search or filters." : "No registered customers yet."}</td></tr>
                  ) : customers.map((cust) => {
                    const standingBadgeClass = cust.status === "SUSPENDED" || cust.standingStatus === "suspended"
                      ? "suspended"
                      : cust.standingStatus === "cooldown"
                        ? "cooldown"
                        : cust.standingStatus === "reinstated"
                          ? "reinstated"
                          : cust.status === "ACTIVE"
                            ? "active"
                            : "unknown";
                    const standingBadgeText = cust.status === "SUSPENDED" || cust.standingStatus === "suspended"
                      ? "SUSPENDED"
                      : cust.standingStatus === "cooldown"
                        ? "COOLDOWN"
                        : cust.standingStatus === "reinstated"
                          ? "REINSTATED"
                          : cust.status;

                    return (
                      <tr key={cust.id}>
                        <td>
                          <div className="customer-info-cell">
                            <div className="table-avatar" aria-hidden="true"></div>
                            <div>
                              <div className="cust-name">{cust.name}</div>
                              <div className="cust-email">{cust.email}</div>
                            </div>
                          </div>
                        </td>
                        <td><span className="phone-cell tabular-nums"><PhoneIcon /> {cust.phone}</span></td>
                        <td className="tabular-nums">{cust.bookings}</td>
                        <td className="tabular-nums">{cust.lastBooking}</td>
                        <td className="tabular-nums">{cust.memberSince}</td>
                        <td className="text-center strike-status-cell">
                          <StrikeStatusIndicator
                            customer={cust}
                            strikeCount={cust.noShowStrikeCount}
                            onClick={() => setProfileModal(cust)}
                          />
                        </td>
                        <td>
                          <div className="standing-status-cell">
                            <span className={`status-badge ${standingBadgeClass}`}>{standingBadgeText}</span>
                            {cust.isCooldownActive && (
                              <span className="standing-subtext tabular-nums">{cust.cooldownRemainingLabel}</span>
                            )}
                          </div>
                        </td>
                        <td className="text-center">
                          <div
                            className="action-menu-wrapper"
                            ref={openMenuId === cust.id ? menuRef : null}
                            onKeyDown={(e) => {
                              if (openMenuId !== cust.id) return;
                              const items = Array.from(e.currentTarget.querySelectorAll?.('[role="menuitem"]:not([disabled])') || []);
                              if (items.length === 0) return;
                              const idx = items.indexOf(document.activeElement);
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                items[(idx + 1) % items.length]?.focus();
                              } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                items[(idx - 1 + items.length) % items.length]?.focus();
                              } else if (e.key === "Home") {
                                e.preventDefault();
                                items[0]?.focus();
                              } else if (e.key === "End") {
                                e.preventDefault();
                                items[items.length - 1]?.focus();
                              }
                            }}
                          >
                            <button
                              type="button"
                              className="action-dots-btn"
                              aria-label={`Actions for ${cust.name}`}
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === cust.id}
                              onClick={(e) => handleToggleMenu(cust.id, e)}
                            >
                              <MoreVerticalIcon />
                            </button>
                            {openMenuId === cust.id && (
                              <div
                                className="action-dropdown"
                                role="menu"
                                style={menuPosition ? {
                                  position: "fixed",
                                  top: menuPosition.top,
                                  bottom: menuPosition.bottom,
                                  right: menuPosition.right,
                                  left: "auto",
                                  zIndex: 9999,
                                } : undefined}
                              >
                                {canEdit && <button type="button" role="menuitem" className="dropdown-item" onClick={() => {
                                  const record = records.find(item => item.id === cust.id);
                                  if (record) { setEditing({ customer: { ...record }, owner: user.id }); setSaveMessage(""); }
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}>Edit Customer</button>}
                                <button type="button" role="menuitem" className="dropdown-item" onClick={(e) => handleViewProfile(cust, e)}>
                                  View Profile
                                </button>
                                <button type="button" role="menuitem" className="dropdown-item" onClick={(e) => handleViewBookingHistory(cust, e)}>
                                  View Booking History
                                </button>
                                {canEdit && cust.pendingAppeal && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="dropdown-item"
                                    onClick={() => {
                                      setSaveMessage("");
                                      setAppealReview({ appeal: cust.pendingAppeal, customer: cust, mode: "approve" });
                                      setOpenMenuId(null);
                                      setMenuPosition(null);
                                    }}
                                  >
                                    Review Pending Appeal
                                  </button>
                                )}
                                {canEdit && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className={`dropdown-item ${cust.is_active ? "danger" : ""}`}
                                    onClick={() => {
                                      const record = records.find(item => item.id === cust.id);
                                      if (record) { setStatusTarget(record); setSaveMessage(""); }
                                      setOpenMenuId(null);
                                      setMenuPosition(null);
                                    }}
                                  >
                                    {cust.is_active ? "Suspend Account" : "Reactivate Account"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="table-pagination">
              <span className="pagination-text">Showing {loading || error || !filtered.length ? "0" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)}`} of {loading || error ? "--" : filtered.length} customers</span>
              <div className="pagination-controls">
                <button type="button" className="page-arrow" disabled={loading || Boolean(error) || page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous customer page"><ChevronLeftIcon /></button>
                {[...new Set([1, page - 1, page, page + 1, pageCount])].filter(number => number >= 1 && number <= pageCount).sort((a, b) => a - b).map(number => (
                  <button type="button" key={number} className={`page-number tabular-nums ${number === page ? "active" : ""}`} aria-current={number === page ? "page" : undefined} disabled={loading || Boolean(error)} onClick={() => setPage(number)}>{number}</button>
                ))}
                <button type="button" className="page-arrow" disabled={loading || Boolean(error) || page >= pageCount} onClick={() => setPage(page + 1)} aria-label="Next customer page"><ChevronRightIcon /></button>
              </div>
            </div>
          </div>
        )}
        {/* ===== CUSTOMER PROFILE MODAL ===== */}
        {canEdit && editing?.owner === user?.id && <CustomerEditDialog key={`${editing.owner}:${editing.customer.id}`} customer={editing.customer} existingCustomers={records} onClose={() => setEditing(null)} onSaved={() => {
          setEditing(null); setSaveMessage("Customer details saved successfully."); void refresh();
        }} />}
        {canEdit && statusTarget && (
          <CustomerStatusDialog
            key={`status:${statusTarget.id}:${statusTarget.updated_at}`}
            customer={statusTarget}
            callerRole={role}
            onClose={() => setStatusTarget(null)}
            onConfirmed={(updated) => {
              setStatusTarget(null);
              const actionName = updated.is_active ? "reactivated" : "suspended";
              setSaveMessage(`Customer account ${actionName} successfully.`);
              void refresh();
            }}
          />
        )}
        {canEdit && showAddModal && (
          <CustomerAddDialog
            callerRole={role}
            existingCustomers={records}
            onClose={() => setShowAddModal(false)}
            onSaved={(newCustomer) => {
              setShowAddModal(false);
              setSaveMessage(`Customer "${newCustomer.name}" (${newCustomer.customer_code || 'new'}) registered successfully.`);
              void refresh();
            }}
          />
        )}
        {canEdit && appealReview?.appeal && (
          <AppealReviewDialog
            key={`appeal:${appealReview.appeal.id}:${appealReview.mode}`}
            appeal={appealReview.appeal}
            customer={appealReview.customer}
            mode={appealReview.mode}
            strikeHistory={appealReview.customer?.strikeHistory || []}
            onClose={() => setAppealReview(null)}
            onReviewed={({ decision }) => {
              setAppealReview(null);
              setSaveMessage(
                decision === "approved"
                  ? "Suspension appeal approved. Customer standing is now Reinstated (existing strikes kept on record)."
                  : "Suspension appeal rejected. Customer account remains suspended."
              );
              void refresh();
            }}
          />
        )}
        {profileModal && profile && (
          <div className="cp-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setProfileModal(null); }}>
            <div
              ref={cpModalRef}
              className="cp-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cp-modal-title"
              tabIndex={-1}
            >

              {/* Modal Header */}
              <div className="cp-modal-header">
                <div className="cp-modal-title-row">
                  <h2 id="cp-modal-title" className="cp-modal-title">Customer Profile</h2>
                  <span className={`cp-status-pill ${profileModal.status.toLowerCase()}`}>
                    {profileModal.status}
                  </span>
                  {profileModal.standingStatus !== "good" && (
                    <span className={`status-badge ${profileModal.standingStatus}`}>
                      Standing: {profileModal.standingLabel}
                    </span>
                  )}
                </div>
                <button type="button" className="cp-close-btn" aria-label="Close customer profile" onClick={() => setProfileModal(null)}><CloseIcon /></button>
              </div>

              {/* Modal Body */}
              <div className="cp-modal-body">

                {/* LEFT COLUMN */}
                <div className="cp-left">

                  {/* Identity Card */}
                  <div className="cp-identity-card">
                    <div className="cp-avatar-box">
                      <div className="cp-avatar-placeholder">
                        {profileModal.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                    </div>
                    <h3 className="cp-name">{profileModal.name}</h3>
                    <p className="cp-cust-id tabular-nums">ID: {profile.id}</p>

                    <div className="cp-details-list">
                      <div className="cp-detail-row">
                        <span className="cp-detail-icon" aria-hidden="true"><MailIcon /></span>
                        <div>
                          <div className="cp-detail-label">EMAIL</div>
                          <div className="cp-detail-value">{profileModal.email}</div>
                        </div>
                      </div>
                      <div className="cp-detail-row">
                        <span className="cp-detail-icon" aria-hidden="true"><PhoneIcon /></span>
                        <div>
                          <div className="cp-detail-label">CONTACT</div>
                          <div className="cp-detail-value tabular-nums">{profileModal.phone}</div>
                        </div>
                      </div>
                      <div className="cp-detail-row">
                        <span className="cp-detail-icon" aria-hidden="true"><MapPinIcon /></span>
                        <div>
                          <div className="cp-detail-label">ADDRESS</div>
                          <div className="cp-detail-value">{profile.address}</div>
                        </div>
                      </div>
                      <div className="cp-detail-row">
                        <span className="cp-detail-icon" aria-hidden="true"><CalendarIcon /></span>
                        <div>
                          <div className="cp-detail-label">MEMBER SINCE</div>
                          <div className="cp-detail-value tabular-nums">{profileModal.memberSince}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Account Status Card */}
                  <div className="cp-status-card">
                    <h3 className="cp-section-label">ACCOUNT STATUS</h3>
                    <div className="cp-status-row">
                      <span>Current Status</span>
                      <span className={`cp-status-dot ${profileModal.status.toLowerCase()}`}>
                        <span className="cp-status-indicator" aria-hidden="true" />
                        <span>{profileModal.status === "ACTIVE" ? "Active" : profileModal.status === "SUSPENDED" ? "Suspended" : "Unknown"}</span>
                      </span>
                    </div>
                    {canEdit ? (
                      <>
                        <button
                          type="button"
                          className={`cp-suspend-btn ${profileModal.status === "ACTIVE" ? "" : "reactivate"}`}
                          onClick={() => {
                            const record = records.find(item => item.id === profileModal.id);
                            if (record) { setStatusTarget(record); setSaveMessage(""); }
                          }}
                        >
                          {profileModal.status === "ACTIVE" ? (
                            <><BanIcon /><span>Suspend Account</span></>
                          ) : (
                            <><CheckIcon /><span>Reactivate Account</span></>
                          )}
                        </button>
                        <p className="cp-suspend-hint">
                          {profileModal.status === "ACTIVE"
                            ? "Deactivates customer access while preserving history."
                            : "Restores customer access and booking privileges."}
                        </p>
                      </>
                    ) : (
                      <p className="cp-suspend-hint">Only office staff can manage customer account status.</p>
                    )}
                  </div>

                  {/* No-Show Standing & Appeals Card */}
                  <div className="cp-status-card cp-standing-card">
                    <div className="cp-standing-header">
                      <h3 className="cp-section-label">NO-SHOW STANDING</h3>
                      <span className={`status-badge ${profileModal.standingStatus === "good" ? "active" : profileModal.standingStatus}`}>
                        {profileModal.standingLabel}
                      </span>
                    </div>

                    <div className="cp-standing-indicator-row">
                      <StrikeStatusIndicator
                        customer={profileModal}
                        strikeCount={profileModal.noShowStrikeCount}
                        showCountText
                      />
                    </div>

                    <dl className="cp-standing-meta">
                      <div>
                        <dt>Standing Policy</dt>
                        <dd>
                          {profileModal.isSuspended || profileModal.isStandingSuspended
                            ? "Permanent booking suspension (mobile appeals allowed)."
                            : profileModal.isCooldownActive
                              ? `Cooldown active until ${formatManilaDateTime(profileModal.booking_cooldown_until)}.`
                              : profileModal.isReinstated
                                ? "Reinstated via approved appeal (strikes retained)."
                                : "In good standing (3-strike no-show threshold)."}
                        </dd>
                      </div>
                      {profileModal.suspended_at && (
                        <div>
                          <dt>Suspended At</dt>
                          <dd className="tabular-nums">{formatManilaDateTime(profileModal.suspended_at)}</dd>
                        </div>
                      )}
                      {profileModal.suspension_reason && (
                        <div>
                          <dt>Suspension Reason</dt>
                          <dd>{profileModal.suspension_reason}</dd>
                        </div>
                      )}
                      {profileModal.reinstated_at && (
                        <div>
                          <dt>Reinstated At</dt>
                          <dd className="tabular-nums">{formatManilaDateTime(profileModal.reinstated_at)}</dd>
                        </div>
                      )}
                    </dl>

                    {profileModal.pendingAppeal && (
                      <div className="cp-pending-appeal-box">
                        <div className="cp-pending-appeal-title">Pending Appeal Submitted</div>
                        <p className="cp-pending-appeal-reason">{profileModal.pendingAppeal.reason}</p>
                        <div className="cp-pending-appeal-meta tabular-nums">
                          Submitted {formatManilaDateTime(profileModal.pendingAppeal.created_at)}
                          {profileModal.pendingAppeal.contact_number ? ` | Contact: ${profileModal.pendingAppeal.contact_number}` : ""}
                        </div>
                        {canEdit && (
                          <div className="cp-pending-appeal-actions">
                            <button
                              type="button"
                              className="btn-appeal-approve"
                              onClick={() => {
                                setSaveMessage("");
                                setAppealReview({ appeal: profileModal.pendingAppeal, customer: profileModal, mode: "approve" });
                              }}
                            >
                              Approve & Reinstate
                            </button>
                            <button
                              type="button"
                              className="btn-appeal-reject"
                              onClick={() => {
                                setSaveMessage("");
                                setAppealReview({ appeal: profileModal.pendingAppeal, customer: profileModal, mode: "reject" });
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>

                {/* RIGHT COLUMN */}
                <div className="cp-right">

                  {/* No-Show Strike History */}
                  <div className="cp-strike-history-section">
                    <div className="cp-section-title-row cp-strike-history-header">
                      <h3 className="cp-section-label">NO-SHOW STRIKE HISTORY</h3>
                      <span className="cp-strike-cumulative-note tabular-nums">
                        {profileModal.noShowStrikeCount} {profileModal.noShowStrikeCount === 1 ? "strike" : "strikes"} (cumulative, never resets)
                      </span>
                    </div>
                    {(!profileModal.strikeHistory || profileModal.strikeHistory.length === 0) ? (
                      <p className="cp-strike-empty">No confirmed no-show strikes recorded for this customer.</p>
                    ) : (
                      <ul className="cp-strike-list">
                        {profileModal.strikeHistory.map((strike) => (
                          <li key={strike.id} className="cp-strike-item">
                            <div className="cp-strike-item-top">
                              <span className="cp-strike-num tabular-nums">Strike #{strike.strike_number}</span>
                              {strike.trackingNumber && (
                                <span className="cp-strike-tracking tabular-nums">{strike.trackingNumber}</span>
                              )}
                              <span className="cp-strike-role">{strike.confirmedByRole}</span>
                              <span className="cp-strike-date tabular-nums">{formatManilaDateTime(strike.confirmed_at)}</span>
                            </div>
                            <div className="cp-strike-reason">{strike.reason || "Confirmed no-show"}</div>
                            {strike.attempt_notes && (
                              <div className="cp-strike-notes">Notes: {strike.attempt_notes}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Booking Summary */}
                  <div className="cp-section-title-row">
                    <h3 className="cp-section-label">BOOKING SUMMARY</h3>
                  </div>
                  <div className="cp-summary-grid">
                    <div className="cp-summary-card">
                      <div className="cp-summary-label">TOTAL</div>
                      <div className="cp-summary-value tabular-nums">{profile.bookingSummary.total}</div>
                      <div className="cp-summary-accent neutral"></div>
                    </div>
                    <div className="cp-summary-card">
                      <div className="cp-summary-label">COMPLETED</div>
                      <div className="cp-summary-value tabular-nums">{profile.bookingSummary.completed}</div>
                      <div className="cp-summary-accent green"></div>
                    </div>
                    <div className="cp-summary-card">
                      <div className="cp-summary-label">CANCELLED</div>
                      <div className="cp-summary-value tabular-nums">{profile.bookingSummary.cancelled}</div>
                      <div className="cp-summary-accent red"></div>
                    </div>
                    <div className="cp-summary-card">
                      <div className="cp-summary-label">ACTIVE NOW</div>
                      <div className="cp-summary-value tabular-nums">{profile.bookingSummary.activeNow}</div>
                      <div className="cp-summary-accent blue"></div>
                    </div>
                  </div>

                  {/* Recent Bookings */}
                  <div className="cp-recent-header">
                    <h3 className="cp-section-label">RECENT BOOKINGS</h3>
                    <button type="button" className="cp-view-all-btn" onClick={() => { setProfileModal(null); setBookingHistoryModal(profileModal); }}>View All Bookings <span aria-hidden="true">→</span></button>
                  </div>
                  <div className="cp-bookings-table-wrap">
                    <table className="cp-bookings-table">
                      <thead>
                        <tr>
                          <th>SHIPMENT ID</th>
                          <th>ROUTE</th>
                          <th>DATE</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.recentBookings.length === 0 && <tr><td colSpan={4}>No bookings recorded.</td></tr>}
                        {profile.recentBookings.slice(0, 5).map((b) => (
                          <tr key={b.id}>
                            <td className="cp-shipment-id tabular-nums">{b.id}</td>
                            <td>{b.route}</td>
                            <td className="tabular-nums">{b.date}</td>
                            <td>
                              <span className={`cp-booking-status ${b.status.toLowerCase()}`}>
                                {b.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>
              </div>
            </div>
          </div>
        )}
        {/* ===== BOOKING HISTORY MODAL ===== */}
        {bookingHistoryModal && historyProfile && (
          <div className="bh-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setBookingHistoryModal(null); }}>
            <div
              ref={bhModalRef}
              className="bh-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bh-modal-title"
              tabIndex={-1}
            >

              {/* Modal Header */}
              <div className="bh-modal-header">
                <div className="bh-header-left">
                  <div className="bh-avatar-placeholder">
                    {bookingHistoryModal.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <h2 id="bh-modal-title" className="bh-modal-title">{bookingHistoryModal.name}</h2>
                    <p className="bh-modal-meta">
                      <span className="bh-meta-id tabular-nums">ID: {historyProfile.id}</span>
                      <span className="bh-meta-dot" aria-hidden="true">·</span>
                      <span className={`bh-status-pill ${bookingHistoryModal.status.toLowerCase()}`}>{bookingHistoryModal.status}</span>
                      <span className="bh-meta-dot" aria-hidden="true">·</span>
                      <span className="bh-meta-count tabular-nums">{historyProfile.bookingSummary.total} total bookings</span>
                    </p>
                  </div>
                </div>
                <button type="button" className="bh-close-btn" aria-label="Close booking history" onClick={() => setBookingHistoryModal(null)}><CloseIcon /></button>
              </div>

              {/* Summary Strip */}
              <div className="bh-summary-strip">
                <div className="bh-strip-card">
                  <span className="bh-strip-label">TOTAL</span>
                  <span className="bh-strip-value neutral tabular-nums">{historyProfile.bookingSummary.total}</span>
                </div>
                <div className="bh-strip-divider" />
                <div className="bh-strip-card">
                  <span className="bh-strip-label">COMPLETED</span>
                  <span className="bh-strip-value green tabular-nums">{historyProfile.bookingSummary.completed}</span>
                </div>
                <div className="bh-strip-divider" />
                <div className="bh-strip-card">
                  <span className="bh-strip-label">CANCELLED</span>
                  <span className="bh-strip-value red tabular-nums">{historyProfile.bookingSummary.cancelled}</span>
                </div>
                <div className="bh-strip-divider" />
                <div className="bh-strip-card">
                  <span className="bh-strip-label">ACTIVE NOW</span>
                  <span className="bh-strip-value blue tabular-nums">{historyProfile.bookingSummary.activeNow}</span>
                </div>
              </div>

              {/* Timeline Body */}
              <div className="bh-body">
                <h3 className="bh-section-label">BOOKING HISTORY</h3>
                <div className="bh-timeline">
                  {historyProfile.recentBookings.length === 0 && <p>No bookings recorded.</p>}
                  {historyProfile.recentBookings.map((b, idx) => {
                    const isCancelled = b.status.toLowerCase() === "cancelled";
                    const isActive = !["completed", "cancelled"].includes(b.status.toLowerCase());
                    const dotClass = isCancelled ? "red" : isActive ? "blue" : "green";
                    return (
                      <div className="bh-timeline-item" key={b.id}>
                        <div className="bh-timeline-left">
                          <div className={`bh-dot ${dotClass}`} aria-hidden="true"></div>
                          {idx < historyProfile.recentBookings.length - 1 && <div className="bh-line" />}
                        </div>
                        <div className="bh-timeline-card">
                          <div className="bh-card-top">
                            <div className="bh-card-id-route">
                              <span className="bh-card-id tabular-nums">{b.id}</span>
                              <span className="bh-card-route">{b.route}</span>
                            </div>
                            <span className="bh-card-date tabular-nums">{b.date}</span>
                          </div>
                          <div className="bh-card-bottom">
                            <span className="bh-cargo-tag">
                              {b.cargo || "General Cargo"}
                            </span>
                            <span className={`bh-booking-status ${b.status.toLowerCase()}`}>
                              {b.status}
                            </span>
                            {b.deliveredAt && (
                              <span className="bh-delivered-tag tabular-nums">Delivered: {b.deliveredAt}</span>
                            )}
                            {b.late && (
                              <span className="bh-late-tag">{b.late}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        )}
      </section>
      <ReportExportModal
        open={showExportModal && !loading && !error && exportMatches.length > 0}
        onClose={() => setShowExportModal(false)}
        reportType="Customers"
        range={{ start: snapshotDate, end: snapshotDate }}
        activeRangeLabel="Directory Snapshot"
        reportData={{ customers: exportMatches, stats }}
        filters={{
          query: activeSearchQuery,
          status: statusFilter !== "ALL" ? statusFilter : "",
          sort: sort !== "newest" ? sort : "",
          todayOnly: todayOnly ? "Today only" : "",
        }}
      />
    </MainLayout>
  );
}
