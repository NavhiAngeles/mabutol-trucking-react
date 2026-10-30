import OfficeTools from "../../components/OfficeTools";
import CustomerEditDialog from "./CustomerEditDialog";
import { useAuth } from "../../context/AuthContext";
import { useState, useRef, useEffect, useMemo } from "react";
import MainLayout from "../../layouts/mainLayout";
import "./customer.css";
import { useCustomerDirectory, buildCustomerRows, customerStatistics, filterCustomerRows } from "../../viewmodels/CustomerViewModel";

export default function Customer() {
  const { user, role } = useAuth();
  const canEdit = ["admin", "staff"].includes(role);
  const [editing, setEditing] = useState(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [profileCustomerId, setProfileCustomerId] = useState(null);
  const [historyCustomerId, setHistoryCustomerId] = useState(null);
  const menuRef = useRef(null);
  const { customers: records, bookings, loading, error, refresh } = useCustomerDirectory({ includeBookings: true });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sort, setSort] = useState("newest");
  const [todayOnly, setTodayOnly] = useState(false);
  const [requestedPage, setPage] = useState(1);
  const rows = useMemo(() => buildCustomerRows(records, bookings), [records, bookings]);
  const stats = useMemo(() => customerStatistics(rows), [rows]);
  const filtered = useMemo(() => filterCustomerRows(rows, { query, status: statusFilter, sort, todayOnly }), [rows, query, statusFilter, sort, todayOnly]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 6));
  const page = Math.min(requestedPage, pageCount);
  const customers = filtered.slice((page - 1) * 6, page * 6);
  const profileModal = rows.find(row => row.id === profileCustomerId) || null;
  const bookingHistoryModal = rows.find(row => row.id === historyCustomerId) || null;
  const setProfileModal = customer => setProfileCustomerId(customer?.id || null);
  const setBookingHistoryModal = customer => setHistoryCustomerId(customer?.id || null);
  const changeSearch = value => { setQuery(value); setPage(1); };
  const countLabel = value => loading || error ? "—" : value;
  const exportCustomers = () => {
    const cell = value => {
      const text = String(value ?? "");
      const safe = /^[=+\-@\t\r]/.test(text.trimStart()) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const lines = [ ["Customer ID", "Name", "Email", "Phone", "Bookings", "Last booking", "Member since", "Status"],
      ...filtered.map(row => [row.customer_code || row.id, row.name, row.email, row.phone, row.bookingCount, row.lastBooking, row.memberSince, row.status]),
    ];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.map(line => line.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "mabutol-customers.csv";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };


  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = (profileModal || bookingHistoryModal) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [profileModal, bookingHistoryModal]);


  const handleViewProfile = (cust) => {
    setOpenMenuId(null);
    setProfileModal(cust);
  };

  const handleViewBookingHistory = (cust) => {
    setOpenMenuId(null);
    setBookingHistoryModal(cust);
  };

  const profile = profileModal ? profileModal.profile : null;
  const historyProfile = bookingHistoryModal ? bookingHistoryModal.profile : null;

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <div className="search-container">
          <span className="icon">🔍</span>
          <input type="text" placeholder="Search customers..." id="customerSearch" value={query} onChange={event => changeSearch(event.target.value)} />
        </div>
        <div className="topbar-right">
          <OfficeTools />
        </div>
      </header>

      {/* Main Content */}
      <section className="content">
        <div className="content-header">
          <div>
            <h2 className="page-title">Customers</h2>
            <p className="page-subtitle">View and monitor registered customers.</p>
          </div>
          <button className="btn-export" disabled={loading || Boolean(error) || !filtered.length} onClick={exportCustomers}>📥 Export</button>
        </div>

        <div className="stats-container">
          <div className="stat-card total-cust"><h4>TOTAL CUSTOMERS</h4><h2>{countLabel(stats.total)}</h2></div>
          <div className="stat-card active-cust" title="Active customers with a booking created this month, in Philippine time"><h4>ACTIVE THIS MONTH</h4><h2>{countLabel(stats.activeThisMonth)}</h2></div>
          <div className="stat-card new-cust"><h4>NEW THIS WEEK</h4><h2>{countLabel(stats.newThisWeek)}</h2></div>
          <div className="stat-card suspended-cust"><h4>SUSPENDED</h4><h2>{countLabel(stats.suspended)}</h2></div>
        </div>

        <div className="filter-action-bar">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input type="text" className="table-search" placeholder="Search by customer ID, name, email, or phone..." value={query} onChange={event => changeSearch(event.target.value)} />
          </div>
          <div className="filter-buttons">
            <button className="filter-btn" onClick={() => { setSort(sort === "newest" ? "name" : sort === "name" ? "bookings" : "newest"); setPage(1); }} title="Cycle newest, name, and booking count">SORT: {sort.toUpperCase()} <span className="btn-icon">≡</span></button>
            <button className="filter-btn" aria-pressed={todayOnly} onClick={() => { setTodayOnly(value => !value); setPage(1); }} title="Customers whose latest booking was created today">{todayOnly ? "TODAY ✓" : "TODAY"} <span className="btn-icon">📅</span></button>
            <select className="filter-btn" aria-label="Customer status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="UNKNOWN">Unknown</option>
            </select>
          </div>
        </div>

        {error && <div className="customer-load-error" role="alert">Unable to load customers: {error} <button className="filter-btn" onClick={refresh}>Retry</button></div>}
        {saveMessage && <div className="customer-save-success" role="status">{saveMessage} <button type="button" className="filter-btn" onClick={() => setSaveMessage("")}>Dismiss</button></div>}
        <div className="customer-table-card" aria-busy={loading}>
          <table className="customer-table">
            <thead>
              <tr>
                <th>CUSTOMER</th>
                <th>CONTACT NUMBER</th>
                <th>TOTAL BOOKINGS</th>
                <th>LAST BOOKING</th>
                <th>MEMBER SINCE</th>
                <th>STATUS</th>
                <th className="text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading || error || customers.length === 0 ? (
                <tr><td colSpan={7} className="customer-table-message">{loading ? "Loading customers..." : error ? "Customer data is unavailable." : records.length ? "No customers match your search or filters." : "No registered customers yet."}</td></tr>
              ) : customers.map((cust) => (
                <tr key={cust.id}>
                  <td>
                    <div className="customer-info-cell">
                      <div className="table-avatar"></div>
                      <div>
                        <div className="cust-name">{cust.name}</div>
                        <div className="cust-email">{cust.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="phone-cell">📞 {cust.phone}</span></td>
                  <td>{cust.bookings}</td>
                  <td>{cust.lastBooking}</td>
                  <td>{cust.memberSince}</td>
                  <td>
                    <span className={`status-badge ${cust.status.toLowerCase()}`}>{cust.status}</span>
                  </td>
                  <td className="text-center">
                    <div className="action-menu-wrapper" ref={openMenuId === cust.id ? menuRef : null}>
                      <button
                        className="action-dots-btn"
                        aria-label={`Actions for ${cust.name}`}
                        aria-expanded={openMenuId === cust.id}
                        onClick={() => setOpenMenuId(openMenuId === cust.id ? null : cust.id)}
                      >
                        ⋮
                      </button>
                      {openMenuId === cust.id && (
                        <div className="action-dropdown">
                          {canEdit && <button className="dropdown-item" onClick={() => {
                            const record = records.find(item => item.id === cust.id);
                            if (record) { setEditing({ customer: { ...record }, owner: user.id }); setSaveMessage(""); }
                            setOpenMenuId(null);
                          }}>Edit Customer</button>}
                          <button className="dropdown-item" onClick={() => handleViewProfile(cust)}>
                            View Profile
                          </button>
                          <button className="dropdown-item" onClick={() => handleViewBookingHistory(cust)}>
                            View Booking History
                          </button>
                          <button className="dropdown-item danger" disabled title="Account suspension is not connected yet">
                            Suspend Account
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="table-pagination">
            <span className="pagination-text">Showing {loading || error || !filtered.length ? "0" : `${(page - 1) * 6 + 1}–${Math.min(page * 6, filtered.length)}`} of {loading || error ? "—" : filtered.length} customers</span>
            <div className="pagination-controls">
              <button className="page-arrow" disabled={loading || Boolean(error) || page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous customer page">‹</button>
              {[...new Set([1, page - 1, page, page + 1, pageCount])].filter(number => number >= 1 && number <= pageCount).sort((a, b) => a - b).map(number => (
                <button key={number} className={`page-number ${number === page ? "active" : ""}`} aria-current={number === page ? "page" : undefined} disabled={loading || Boolean(error)} onClick={() => setPage(number)}>{number}</button>
              ))}
              <button className="page-arrow" disabled={loading || Boolean(error) || page >= pageCount} onClick={() => setPage(page + 1)} aria-label="Next customer page">›</button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CUSTOMER PROFILE MODAL ===== */}
      {canEdit && editing?.owner === user?.id && <CustomerEditDialog key={`${editing.owner}:${editing.customer.id}`} customer={editing.customer} onClose={() => setEditing(null)} onSaved={() => {
        setEditing(null); setSaveMessage("Customer details saved successfully."); void refresh();
      }} />}
      {profileModal && profile && (
        <div className="cp-backdrop" onClick={() => setProfileModal(null)}>
          <div className="cp-modal" onClick={(e) => e.stopPropagation()}>

            {/* Modal Header */}
            <div className="cp-modal-header">
              <div className="cp-modal-title-row">
                <h2 className="cp-modal-title">Customer Profile</h2>
                <span className={`cp-status-pill ${profileModal.status.toLowerCase()}`}>
                  {profileModal.status}
                </span>
              </div>
              <button className="cp-close-btn" onClick={() => setProfileModal(null)}>✕</button>
            </div>

            {/* Modal Body */}
            <div className="cp-modal-body">

              {/* LEFT COLUMN */}
              <div className="cp-left">

                {/* Identity Card */}
                <div className="cp-identity-card">
                  <div className="cp-avatar-box">
                    <div className="cp-avatar-placeholder">
                      {profileModal.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                    </div>
                  </div>
                  <h3 className="cp-name">{profileModal.name}</h3>
                  <p className="cp-cust-id">ID: {profile.id}</p>

                  <div className="cp-details-list">
                    <div className="cp-detail-row">
                      <span className="cp-detail-icon">✉</span>
                      <div>
                        <div className="cp-detail-label">EMAIL</div>
                        <div className="cp-detail-value">{profileModal.email}</div>
                      </div>
                    </div>
                    <div className="cp-detail-row">
                      <span className="cp-detail-icon">📞</span>
                      <div>
                        <div className="cp-detail-label">CONTACT</div>
                        <div className="cp-detail-value">{profileModal.phone}</div>
                      </div>
                    </div>
                    <div className="cp-detail-row">
                      <span className="cp-detail-icon">📍</span>
                      <div>
                        <div className="cp-detail-label">ADDRESS</div>
                        <div className="cp-detail-value">{profile.address}</div>
                      </div>
                    </div>
                    <div className="cp-detail-row">
                      <span className="cp-detail-icon">📅</span>
                      <div>
                        <div className="cp-detail-label">MEMBER SINCE</div>
                        <div className="cp-detail-value">{profileModal.memberSince}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Account Status Card */}
                <div className="cp-status-card">
                  <h4 className="cp-section-label">ACCOUNT STATUS</h4>
                  <div className="cp-status-row">
                    <span>Current Status</span>
                    <span className={`cp-status-dot ${profileModal.status.toLowerCase()}`}>
                      ● {profileModal.status === "ACTIVE" ? "Active" : "Suspended"}
                    </span>
                  </div>
                  <button className="cp-suspend-btn" disabled title="Account suspension is not connected yet">
                    🚫 Suspend Account
                  </button>
                  <p className="cp-suspend-hint">Account suspension is not connected yet.</p>
                </div>

              </div>

              {/* RIGHT COLUMN */}
              <div className="cp-right">

                {/* Booking Summary */}
                <div className="cp-section-title-row">
                  <h4 className="cp-section-label">BOOKING SUMMARY</h4>
                </div>
                <div className="cp-summary-grid">
                  <div className="cp-summary-card">
                    <div className="cp-summary-label">TOTAL</div>
                    <div className="cp-summary-value">{profile.bookingSummary.total}</div>
                    <div className="cp-summary-accent neutral"></div>
                  </div>
                  <div className="cp-summary-card">
                    <div className="cp-summary-label">COMPLETED</div>
                    <div className="cp-summary-value">{profile.bookingSummary.completed}</div>
                    <div className="cp-summary-accent green"></div>
                  </div>
                  <div className="cp-summary-card">
                    <div className="cp-summary-label">CANCELLED</div>
                    <div className="cp-summary-value">{profile.bookingSummary.cancelled}</div>
                    <div className="cp-summary-accent red"></div>
                  </div>
                  <div className="cp-summary-card">
                    <div className="cp-summary-label">ACTIVE NOW</div>
                    <div className="cp-summary-value">{profile.bookingSummary.activeNow}</div>
                    <div className="cp-summary-accent blue"></div>
                  </div>
                </div>

                {/* Recent Bookings */}
                <div className="cp-recent-header">
                  <h4 className="cp-section-label">RECENT BOOKINGS</h4>
                  <button className="cp-view-all-btn" onClick={() => { setProfileModal(null); setBookingHistoryModal(profileModal); }}>View All Bookings →</button>
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
                          <td className="cp-shipment-id">{b.id}</td>
                          <td>{b.route}</td>
                          <td>{b.date}</td>
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
        <div className="bh-backdrop" onClick={() => setBookingHistoryModal(null)}>
          <div className="bh-modal" onClick={(e) => e.stopPropagation()}>

            {/* Modal Header */}
            <div className="bh-modal-header">
              <div className="bh-header-left">
                <div className="bh-avatar-placeholder">
                  {bookingHistoryModal.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                </div>
                <div>
                  <h2 className="bh-modal-title">{bookingHistoryModal.name}</h2>
                  <p className="bh-modal-meta">
                    <span className="bh-meta-id">ID: {historyProfile.id}</span>
                    <span className="bh-meta-dot">·</span>
                    <span className={`bh-status-pill ${bookingHistoryModal.status.toLowerCase()}`}>{bookingHistoryModal.status}</span>
                    <span className="bh-meta-dot">·</span>
                    <span className="bh-meta-count">{historyProfile.bookingSummary.total} total bookings</span>
                  </p>
                </div>
              </div>
              <button className="bh-close-btn" onClick={() => setBookingHistoryModal(null)}>✕</button>
            </div>

            {/* Summary Strip */}
            <div className="bh-summary-strip">
              <div className="bh-strip-card">
                <span className="bh-strip-label">TOTAL</span>
                <span className="bh-strip-value neutral">{historyProfile.bookingSummary.total}</span>
              </div>
              <div className="bh-strip-divider" />
              <div className="bh-strip-card">
                <span className="bh-strip-label">COMPLETED</span>
                <span className="bh-strip-value green">{historyProfile.bookingSummary.completed}</span>
              </div>
              <div className="bh-strip-divider" />
              <div className="bh-strip-card">
                <span className="bh-strip-label">CANCELLED</span>
                <span className="bh-strip-value red">{historyProfile.bookingSummary.cancelled}</span>
              </div>
              <div className="bh-strip-divider" />
              <div className="bh-strip-card">
                <span className="bh-strip-label">ACTIVE NOW</span>
                <span className="bh-strip-value blue">{historyProfile.bookingSummary.activeNow}</span>
              </div>
            </div>

            {/* Timeline Body */}
            <div className="bh-body">
              <h4 className="bh-section-label">BOOKING HISTORY</h4>
              <div className="bh-timeline">
                {historyProfile.recentBookings.length === 0 && <p>No bookings recorded.</p>}
                {historyProfile.recentBookings.map((b, idx) => {
                  const isCancelled = b.status.toLowerCase() === "cancelled";
                  const isActive = !["completed", "cancelled"].includes(b.status.toLowerCase());
                  const dotClass = isCancelled ? "red" : isActive ? "blue" : "green";
                  return (
                    <div className="bh-timeline-item" key={b.id}>
                      <div className="bh-timeline-left">
                        <div className={`bh-dot ${dotClass}`}></div>
                        {idx < historyProfile.recentBookings.length - 1 && <div className="bh-line" />}
                      </div>
                      <div className="bh-timeline-card">
                        <div className="bh-card-top">
                          <div className="bh-card-id-route">
                            <span className="bh-card-id">{b.id}</span>
                            <span className="bh-card-route">{b.route}</span>
                          </div>
                          <span className="bh-card-date">{b.date}</span>
                        </div>
                        <div className="bh-card-bottom">
                          <span className="bh-cargo-tag">
                            {b.cargo || "General Cargo"}
                          </span>
                          <span className={`bh-booking-status ${b.status.toLowerCase()}`}>
                            {b.status}
                          </span>
                          {b.deliveredAt && (
                            <span className="bh-delivered-tag">Delivered: {b.deliveredAt}</span>
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
    </MainLayout>
  );
}
