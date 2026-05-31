import MainLayout from "../../layouts/mainLayout";
import "./customer.css";

export default function Customer() {
  // Matching dataset directly from image_96bae9.png
  const customers = [
    { id: 1, name: "Reyna Pascual", email: "reyna.pascual@gmail.com", phone: "0918 234 5678", bookings: "14 bookings", lastBooking: "Today 09:15 AM", memberSince: "Jan 2025", status: "ACTIVE" },
    { id: 2, name: "Ernesto Villanueva", email: "ernesto.v@gmail.com", phone: "0923 521 1238", bookings: "8 bookings", lastBooking: "Yesterday", memberSince: "Feb 2025", status: "ACTIVE" },
    { id: 3, name: "Joanna Dela Rosa", email: "joanna.dr@yahoo.com", phone: "0918 754 5858", bookings: "22 bookings", lastBooking: "Oct 28, 2025", memberSince: "Nov 2024", status: "ACTIVE" },
    { id: 4, name: "Noel Castillo", email: "noel.castillo@gmail.com", phone: "0967 234 1246", bookings: "3 bookings", lastBooking: "Oct 15, 2025", memberSince: "Sep 2025", status: "ACTIVE" },
    { id: 5, name: "Maricel Soriano", email: "maricel.s@gmail.com", phone: "0936 623 6734", bookings: "1 booking", lastBooking: "Oct 10, 2025", memberSince: "Oct 2025", status: "SUSPENDED" },
    { id: 6, name: "Benito Aquino", email: "benito.aq@gmail.com", phone: "0962 085 7812", bookings: "6 bookings", lastBooking: "Sep 30, 2025", memberSince: "Aug 2025", status: "ACTIVE" }
  ];

  return (
    <MainLayout>
      {/* Topbar matching search/profile header alignment */}
      <header className="topbar">
        <div className="search-container">
          <span className="icon">🔍</span>
          <input type="text" placeholder="Search..." id="customerSearch" />
        </div>
        <div className="topbar-right">
          <button id="notifBtn">🔔</button>
          <div className="avatar"></div>
        </div>
      </header>

      {/* Main Layout Container */}
      <section className="content">
        <div className="content-header">
          <div>
            <h2 className="page-title">Customers</h2>
            <p className="page-subtitle">View and monitor registered customers from the mobile app.</p>
          </div>
          <button className="btn-export">📥 Export</button>
        </div>

        {/* Stats Section with Colored Accent Borders */}
        <div className="stats-container">
          <div className="stat-card total-cust">
            <h4>TOTAL CUSTOMERS</h4>
            <h2>142</h2>
          </div>
          
          <div className="stat-card active-cust">
            <h4>ACTIVE THIS MONTH</h4>
            <h2>87</h2>
          </div>
          
          <div className="stat-card new-cust">
            <h4>NEW THIS WEEK</h4>
            <h2>12</h2>
          </div>
          
          <div className="stat-card suspended-cust">
            <h4>SUSPENDED</h4>
            <h2>3</h2>
          </div>
        </div>

        {/* Dynamic Action Filter Bar */}
        <div className="filter-action-bar">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="table-search"
              placeholder="Search by ID, Vehicle Type, or Driver..."
            />
          </div>
          
          <div className="filter-buttons">
            <button className="filter-btn">
              SORT BY <span className="btn-icon">≡</span>
            </button>
            <button className="filter-btn">
              TODAY <span className="btn-icon">📅</span>
            </button>
            <button className="icon-only-btn">🎛️</button>
          </div>
        </div>

        {/* Main Clean Customer Table Wrapper */}
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
                  <td>
                    <span className="phone-cell">📞 {cust.phone}</span>
                  </td>
                  <td>{cust.bookings}</td>
                  <td>{cust.lastBooking}</td>
                  <td>{cust.memberSince}</td>
                  <td>
                    <span className={`status-badge ${cust.status.toLowerCase()}`}>
                      {cust.status}
                    </span>
                  </td>
                  <td className="text-center">
                    <button className="action-dots-btn">⋮</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Footer */}
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
    </MainLayout>
  );
}