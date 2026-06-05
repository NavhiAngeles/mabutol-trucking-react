import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../../layouts/mainLayout";
import "./customer.css";

// Per-customer profile data
const customerProfiles = {
  1: {
    id: "CUST-0001",
    address: "Cabanatuan City, Nueva Ecija",
    bookingSummary: { total: 14, completed: 11, cancelled: 2, activeNow: 1 },
    recentBookings: [
      { id: "SHP-NE-7821", route: "Cabanatuan → Talavera",  date: "Oct 29", status: "Completed", cargo: "Palletized Goods", deliveredAt: "Oct 29, 10:45 AM" },
      { id: "SHP-NE-7654", route: "Cabanatuan → Gapan",     date: "Oct 21", status: "Completed", cargo: "Rice Sacks", deliveredAt: "Oct 21", late: "Late +1hr" },
      { id: "SHP-NE-7203", route: "Palayan → Cabanatuan",   date: "Oct 10", status: "Cancelled", cargo: "Construction Materials" },
      { id: "SHP-NE-7155", route: "San Jose → Cabanatuan",  date: "Oct 05", status: "Completed", cargo: "General Cargo", deliveredAt: "Oct 05, 2:00 PM" },
      { id: "SHP-NE-6982", route: "Cabanatuan → Rizal",     date: "Sep 28", status: "Completed", cargo: "General Cargo", deliveredAt: "Sep 28" },
      { id: "SHP-NE-6891", route: "Cabanatuan → San Jose",  date: "Sep 28", status: "Completed", cargo: "Electronics" },
      { id: "SHP-NE-6840", route: "Muñoz → Talavera",       date: "Sep 20", status: "Completed", cargo: "Dry Goods" },
      { id: "SHP-NE-6501", route: "Guimba → Cabanatuan",    date: "Sep 08", status: "Completed", cargo: "General Cargo" },
    ],
  },
  2: {
    id: "CUST-0002",
    address: "Gapan City, Nueva Ecija",
    bookingSummary: { total: 8, completed: 7, cancelled: 1, activeNow: 0 },
    recentBookings: [
      { id: "SHP-NE-7900", route: "Gapan → Cabanatuan",    date: "Yesterday",    status: "Completed" },
      { id: "SHP-NE-7710", route: "Cabanatuan → San Jose", date: "Oct 18, 2025", status: "Completed" },
      { id: "SHP-NE-7530", route: "Gapan → Talavera",      date: "Oct 05, 2025", status: "Cancelled" },
    ],
  },
  3: {
    id: "CUST-0003",
    address: "Palayan City, Nueva Ecija",
    bookingSummary: { total: 22, completed: 19, cancelled: 3, activeNow: 0 },
    recentBookings: [
      { id: "SHP-NE-7800", route: "Palayan → Cabanatuan",  date: "Oct 28, 2025", status: "Completed" },
      { id: "SHP-NE-7600", route: "Cabanatuan → Palayan",  date: "Oct 14, 2025", status: "Completed" },
      { id: "SHP-NE-7400", route: "Palayan → Gapan",       date: "Sep 30, 2025", status: "Completed" },
    ],
  },
  4: {
    id: "CUST-0004",
    address: "Talavera, Nueva Ecija",
    bookingSummary: { total: 3, completed: 2, cancelled: 1, activeNow: 0 },
    recentBookings: [
      { id: "SHP-NE-7450", route: "Talavera → Cabanatuan", date: "Oct 15, 2025", status: "Completed" },
      { id: "SHP-NE-7200", route: "Cabanatuan → Talavera", date: "Sep 22, 2025", status: "Cancelled" },
      { id: "SHP-NE-6950", route: "Talavera → San Jose",   date: "Sep 10, 2025", status: "Completed" },
    ],
  },
  5: {
    id: "CUST-0005",
    address: "Muñoz City, Nueva Ecija",
    bookingSummary: { total: 1, completed: 0, cancelled: 1, activeNow: 0 },
    recentBookings: [
      { id: "SHP-NE-7100", route: "Muñoz → Cabanatuan",    date: "Oct 10, 2025", status: "Cancelled" },
    ],
  },
  6: {
    id: "CUST-0006",
    address: "San Jose City, Nueva Ecija",
    bookingSummary: { total: 6, completed: 5, cancelled: 1, activeNow: 0 },
    recentBookings: [
      { id: "SHP-NE-7350", route: "San Jose → Cabanatuan", date: "Sep 30, 2025", status: "Completed" },
      { id: "SHP-NE-7180", route: "Cabanatuan → San Jose", date: "Sep 18, 2025", status: "Completed" },
      { id: "SHP-NE-6990", route: "San Jose → Gapan",      date: "Sep 05, 2025", status: "Cancelled" },
    ],
  },
};

export default function Customer() {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState(null);
  const [profileModal, setProfileModal] = useState(null); // holds the full customer object
  const [bookingHistoryModal, setBookingHistoryModal] = useState(null); // holds customer for full booking history
  const menuRef = useRef(null);

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

  const customers = [
    { id: 1, name: "Reyna Pascual",     email: "reyna.pascual@gmail.com", phone: "0918 234 5678", bookings: "14 bookings", lastBooking: "Today 09:15 AM", memberSince: "Jan 2025", status: "ACTIVE" },
    { id: 2, name: "Ernesto Villanueva",email: "ernesto.v@gmail.com",     phone: "0923 521 1238", bookings: "8 bookings",  lastBooking: "Yesterday",       memberSince: "Feb 2025", status: "ACTIVE" },
    { id: 3, name: "Joanna Dela Rosa",  email: "joanna.dr@yahoo.com",     phone: "0918 754 5858", bookings: "22 bookings", lastBooking: "Oct 28, 2025",    memberSince: "Nov 2024", status: "ACTIVE" },
    { id: 4, name: "Noel Castillo",     email: "noel.castillo@gmail.com", phone: "0967 234 1246", bookings: "3 bookings",  lastBooking: "Oct 15, 2025",    memberSince: "Sep 2025", status: "ACTIVE" },
    { id: 5, name: "Maricel Soriano",   email: "maricel.s@gmail.com",     phone: "0936 623 6734", bookings: "1 booking",   lastBooking: "Oct 10, 2025",    memberSince: "Oct 2025", status: "SUSPENDED" },
    { id: 6, name: "Benito Aquino",     email: "benito.aq@gmail.com",     phone: "0962 085 7812", bookings: "6 bookings",  lastBooking: "Sep 30, 2025",    memberSince: "Aug 2025", status: "ACTIVE" },
  ];

  const handleViewProfile = (cust) => {
    setOpenMenuId(null);
    setProfileModal(cust);
  };

  const handleViewBookingHistory = (cust) => {
    setOpenMenuId(null);
    setBookingHistoryModal(cust);
  };

  const profile = profileModal ? customerProfiles[profileModal.id] : null;
  const historyProfile = bookingHistoryModal ? customerProfiles[bookingHistoryModal.id] : null;

  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <div className="search-container">
          <span className="icon">🔍</span>
          <input type="text" placeholder="Search..." id="customerSearch" />
        </div>
        <div className="topbar-right">
          <button id="notifBtn">🔔</button>
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

      {/* Main Content */}
      <section className="content">
        <div className="content-header">
          <div>
            <h2 className="page-title">Customers</h2>
            <p className="page-subtitle">View and monitor registered customers from the mobile app.</p>
          </div>
          <button className="btn-export">📥 Export</button>
        </div>

        <div className="stats-container">
          <div className="stat-card total-cust"><h4>TOTAL CUSTOMERS</h4><h2>142</h2></div>
          <div className="stat-card active-cust"><h4>ACTIVE THIS MONTH</h4><h2>87</h2></div>
          <div className="stat-card new-cust"><h4>NEW THIS WEEK</h4><h2>12</h2></div>
          <div className="stat-card suspended-cust"><h4>SUSPENDED</h4><h2>3</h2></div>
        </div>

        <div className="filter-action-bar">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input type="text" className="table-search" placeholder="Search by ID, Vehicle Type, or Driver..." />
          </div>
          <div className="filter-buttons">
            <button className="filter-btn">SORT BY <span className="btn-icon">≡</span></button>
            <button className="filter-btn">TODAY <span className="btn-icon">📅</span></button>
            <button className="icon-only-btn">🎛️</button>
          </div>
        </div>

        <div className="customer-table-card">
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
              {customers.map((cust) => (
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
                        onClick={() => setOpenMenuId(openMenuId === cust.id ? null : cust.id)}
                      >
                        ⋮
                      </button>
                      {openMenuId === cust.id && (
                        <div className="action-dropdown">
                          <button className="dropdown-item" onClick={() => handleViewProfile(cust)}>
                            View Profile
                          </button>
                          <button className="dropdown-item" onClick={() => handleViewBookingHistory(cust)}>
                            View Booking History
                          </button>
                          <button className="dropdown-item danger" onClick={() => setOpenMenuId(null)}>
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
            <span className="pagination-text">Showing 1-6 of 142 customers</span>
            <div className="pagination-controls">
              <button className="page-arrow">‹</button>
              <button className="page-number active">1</button>
              <button className="page-number">2</button>
              <button className="page-number">3</button>
              <span className="page-dots">...</span>
              <button className="page-arrow">›</button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CUSTOMER PROFILE MODAL ===== */}
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
                  <button className="cp-suspend-btn">
                    🚫 Suspend Account
                  </button>
                  <p className="cp-suspend-hint">Suspending this account will prevent new bookings.</p>
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
                      {profile.recentBookings.map((b) => (
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
                {historyProfile.recentBookings.map((b, idx) => {
                  const isCancelled = b.status.toLowerCase() === "cancelled";
                  const isActive = b.status.toLowerCase() === "active";
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