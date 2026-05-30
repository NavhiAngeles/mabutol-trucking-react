import MainLayout from "../../../layouts/mainLayout";
import "./pricing.css";

export default function Pricing() {
  return (
    <MainLayout>
      {/* Topbar */}
      <header className="topbar">
        <input
          type="text"
          placeholder="Search..."
        />

        <div className="topbar-right">
          <button>🔔</button>
          <div className="avatar"></div>
        </div>
      </header>

      {/* Content */}
      <section className="content">
        {/* Notice */}
        <div className="notice-box">
          <strong>
            ⚠ Super Admin Notice
          </strong>
          <p>
            Pricing & rates can only be modified
            by Super Admin accounts.
          </p>
        </div>

        {/* Header */}
        <div className="page-header">
          <div>
            <h2>Settings — Pricing & Rates</h2>
            <p>
              Configure base rates,
              weight tiers, surcharges,
              and toll fee presets.
            </p>
          </div>
        </div>

        {/* Grid */}
        <div className="pricing-grid">
          {/* Left */}
          <div className="left-column">
            {/* Fixed Fees */}
            <div className="settings-card">
              <div className="card-header">
                <h3>Fixed Trip Fees</h3>
              </div>

              <p className="card-desc">
                Flat fees automatically applied
                to every shipment.
              </p>

              <div className="form-grid">
                <div className="input-group">
                  <label>
                    MINIMUM BOOKING FEE
                  </label>
                  <input
                    type="text"
                    defaultValue="₱ 2500.00"
                  />
                </div>

                <div className="input-group">
                  <label>
                    DRIVER ALLOWANCE
                  </label>
                  <input
                    type="text"
                    defaultValue="₱ 500.00"
                  />
                </div>
              </div>
            </div>

            {/* Surcharges */}
            <div className="settings-card">
              <div className="card-header">
                <h3>
                  Special Handling Surcharges
                </h3>
              </div>

              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>Handling Type</th>
                    <th>Surcharge</th>
                    <th>Applied As</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>Fragile</td>
                    <td>
                      <input
                        type="text"
                        defaultValue="₱ 500"
                      />
                    </td>
                    <td>Flat Fee</td>
                  </tr>

                  <tr>
                    <td>Keep Dry</td>
                    <td>
                      <input
                        type="text"
                        defaultValue="₱ 300"
                      />
                    </td>
                    <td>Per Trip</td>
                  </tr>

                  <tr>
                    <td>Oversized</td>
                    <td>
                      <input
                        type="text"
                        defaultValue="₱ 1200"
                      />
                    </td>
                    <td>Flat Fee</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Right */}
          <div className="right-column">
            <div className="settings-card">
              <div className="card-header">
                <h3>
                  Base Rate per Vehicle Type
                </h3>
              </div>

              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>Vehicle Type</th>
                    <th>Capacity</th>
                    <th>Rate / KM</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>6-Wheeler Dropside</td>
                    <td>Up to 5,000 kg</td>
                    <td>
                      <input
                        type="text"
                        defaultValue="55.00"
                      />
                    </td>
                  </tr>

                  <tr>
                    <td>6-Wheeler Closed Van</td>
                    <td>Up to 5,000 kg</td>
                    <td>
                      <input
                        type="text"
                        defaultValue="65.00"
                      />
                    </td>
                  </tr>

                  <tr>
                    <td>10-Wheeler Wing Van</td>
                    <td>Up to 15,000 kg</td>
                    <td>
                      <input
                        type="text"
                        defaultValue="85.00"
                      />
                    </td>
                  </tr>

                  <tr>
                    <td>10-Wheeler Flatbed</td>
                    <td>Up to 12,000 kg</td>
                    <td>
                      <input
                        type="text"
                        defaultValue="80.00"
                      />
                    </td>
                  </tr>

                  <tr>
                    <td>Boom Truck</td>
                    <td>Up to 10,000 kg</td>
                    <td>
                      <input
                        type="text"
                        defaultValue="95.00"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}