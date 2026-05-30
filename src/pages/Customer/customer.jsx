import MainLayout from "../../layouts/MainLayout";
import "./customer.css";

export default function Customer() {
  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <h1>Customers</h1>

        <input
          type="text"
          placeholder="Search customers..."
          id="customerSearch"
          onChange={(e) => console.log("Searching customer:", e.target.value)}
        />

        <div className="topbar-right">
          <button id="notifBtn" onClick={() => alert("No new notifications")}>
            🔔
          </button>
          <div className="avatar"></div>
        </div>
      </header>

      {/* Content */}
      <section className="content">
        <div className="header">
          <span>CUSTOMER MANAGEMENT</span>
          <h2>Customer Directory</h2>
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="stat-card">
            <h4>Total Customers</h4>
            <h2>142</h2>
            <p className="blue">Registered accounts</p>
          </div>
          
          <div className="stat-card">
            <h4>Active This Month</h4>
            <h2>87</h2>
            <p className="green">Returning users</p>
          </div>
          
          <div className="stat-card">
            <h4>New This Week</h4>
            <h2>12</h2>
            <p className="yellow">Recently registered</p>
          </div>
          
          <div className="stat-card">
            <h4>Suspended</h4>
            <h2>3</h2>
            <p className="red">Requires review</p>
          </div>
        </div>

        {/* Customer Table */}
        <div className="customer-table-card">
          <div className="table-header">
            <input
              type="text"
              className="table-search"
              placeholder="Search customer..."
            />
          </div>

          <table className="customer-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Bookings</th>
                <th>Last Booking</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Reyna Pascual</td>
                <td>0918 234 5678</td>
                <td>14 bookings</td>
                <td>Today 09:15 AM</td>
                <td>
                  <span className="status active">
                    ACTIVE
                  </span>
                </td>
              </tr>

              <tr>
                <td>Ernesto Villanueva</td>
                <td>0923 521 1238</td>
                <td>8 bookings</td>
                <td>Yesterday</td>
                <td>
                  <span className="status active">
                    ACTIVE
                  </span>
                </td>
              </tr>

              <tr>
                <td>Maricel Soriano</td>
                <td>0936 623 6734</td>
                <td>1 booking</td>
                <td>Oct 10, 2025</td>
                <td>
                  <span className="status suspended">
                    SUSPENDED
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </MainLayout>
  );
}