import { useNavigate } from "react-router-dom";
import { useState } from "react";
import "./Shipment.css";

export default function Shipment() {

  const navigate = useNavigate();

  const [reportsOpen, setReportsOpen] =
    useState(false);

  function createMenuItem(
    name,
    path,
    active = false
  ) {
    return (
      <div
        className={`menu-item ${
          active ? "active" : ""
        }`}
        onClick={() => navigate(path)}
      >
        {name}
      </div>
    );
  }

  function card(
    title,
    value,
    color,
    note
  ) {
    return (
      <div className="stat-card">
        <h4>{title}</h4>
        <h2>{value}</h2>
        <p className={color}>{note}</p>
      </div>
    );
  }

  return (
    <div className="dashboard">

      {/* Sidebar */}
      <aside className="sidebar">

        <div className="sidebar-top">
          <h2>Mabutol Tracking</h2>
          <p>NUEVA ECIJA LOGISTICS</p>
        </div>

        <nav className="menu">

          {createMenuItem(
            "Dashboard",
            "/dashboard"
          )}

          {createMenuItem(
            "Shipments",
            "/shipment",
            true
          )}

          {createMenuItem(
            "Fleet Management",
            "/fleet"
          )}

          {createMenuItem(
            "Customers",
            "/customer"
          )}

          {createMenuItem(
            "Compliance",
            "/compliance"
          )}

          <div className="menu-group">

            <div
              className="menu-item"
              onClick={() =>
                setReportsOpen(!reportsOpen)
              }
            >
              Reports
            </div>

            <div
              className={`submenu ${
                reportsOpen ? "" : "hidden"
              }`}
            >

              <div
                className="submenu-item active"
                onClick={() =>
                  navigate("/report/overview")
                }
              >
                Overview
              </div>

              <div
                className="submenu-item"
                onClick={() =>
                  navigate(
                    "/report/shipmentReport"
                  )
                }
              >
                Shipments
              </div>

              <div
                className="submenu-item"
                onClick={() =>
                  navigate(
                    "/report/driverReport"
                  )
                }
              >
                Drivers
              </div>

              <div
                className="submenu-item"
                onClick={() =>
                  navigate(
                    "/report/revenueReport"
                  )
                }
              >
                Revenue
              </div>

            </div>

          </div>

          {createMenuItem(
            "Settings",
            "/settings/account"
          )}

        </nav>

        <div className="sidebar-bottom">
          <span>Help Center</span>
          <span>Log Out</span>
        </div>

      </aside>

      {/* Main */}
      <main className="main">

        {/* Topbar */}
        <header className="topbar">

          <h1>Shipments</h1>

          <input
            type="text"
            placeholder="Search shipment..."
            onChange={(e) =>
              console.log(
                "Searching shipment:",
                e.target.value
              )
            }
          />

          <div className="topbar-right">

            <button
              onClick={() =>
                alert("No new notifications")
              }
            >
              🔔
            </button>

            <div className="avatar"></div>

          </div>

        </header>

        {/* Content */}
        <section className="content">

          <div className="header">
            <span>ACTIVE OPERATIONS</span>
            <h2>Shipment Monitoring</h2>
          </div>

          {/* Stats */}
          <div className="stats">

            {card(
              "In Transit",
              "18",
              "green",
              "Currently on the road"
            )}

            {card(
              "Loading",
              "4",
              "blue",
              "Preparing departure"
            )}

            {card(
              "Delayed",
              "3",
              "red",
              "Immediate action needed"
            )}

            {card(
              "On-Time Rate",
              "87%",
              "yellow",
              "Today's active shipments"
            )}

          </div>

          {/* Table */}
          <div className="shipment-table-card">

            <div className="table-header">

              <input
                type="text"
                className="table-search"
                placeholder="Search by shipment ID..."
              />

            </div>

            <table className="shipment-table">

              <thead>
                <tr>
                  <th>Shipment ID</th>
                  <th>Origin</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Driver</th>
                </tr>
              </thead>

              <tbody>

                <tr>
                  <td>SHP-8042</td>
                  <td>Cabanatuan</td>
                  <td>Gapan City</td>

                  <td>
                    <span className="status transit">
                      IN TRANSIT
                    </span>
                  </td>

                  <td>Ricardo Mendoza</td>
                </tr>

                <tr>
                  <td>SHP-8039</td>
                  <td>San Jose City</td>
                  <td>Science City</td>

                  <td>
                    <span className="status delayed">
                      DELAYED
                    </span>
                  </td>

                  <td>Eduardo Garcia</td>
                </tr>

                <tr>
                  <td>SHP-8050</td>
                  <td>Talavera</td>
                  <td>Guimba</td>

                  <td>
                    <span className="status loading">
                      LOADING
                    </span>
                  </td>

                  <td>Jose Dizon</td>
                </tr>

              </tbody>

            </table>

          </div>

        </section>

      </main>

    </div>
  );
}