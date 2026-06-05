import MainLayout from "../../../layouts/mainLayout";
import "./complianceThreshold.css";

export default function ComplianceThresholds() {
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
          <div className="avatar">
            <img 
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60" 
              alt="User Profile" 
              className="avatar-img" />
          </div>
        </div>
      </header>

      {/* Content */}
      <section className="content">
        {/* Header */}
        <div className="page-header">
          <div>
            <h2>
              Settings — Compliance Thresholds
            </h2>
            <p>
              Configure automated warnings
              for critical operational
              documents.
            </p>
          </div>
        </div>

        {/* Main Card */}
        <div className="settings-card">
          <p className="intro-text">
            Configure warning lead times
            for driver and vehicle
            compliance documents.
          </p>

          {/* Driver Docs */}
          <div className="section-block">
            <div className="section-title">
              DRIVER DOCUMENTATION
            </div>

            <div className="threshold-row">
              <div className="threshold-info">
                <strong>Driver’s License</strong>
              </div>
              <div className="threshold-inputs">
                <div className="input-wrap">
                  <label>First Alert</label>
                  <input type="text" defaultValue="60" />
                  <span>days</span>
                </div>
                <div className="input-wrap">
                  <label>Critical Alert</label>
                  <input type="text" defaultValue="15" />
                  <span>days</span>
                </div>
              </div>
            </div>

            <div className="threshold-row">
              <div className="threshold-info">
                <strong>Medical Certificate</strong>
              </div>
              <div className="threshold-inputs">
                <div className="input-wrap">
                  <label>First Alert</label>
                  <input type="text" defaultValue="45" />
                  <span>days</span>
                </div>
                <div className="input-wrap">
                  <label>Critical Alert</label>
                  <input type="text" defaultValue="10" />
                  <span>days</span>
                </div>
              </div>
            </div>

            <div className="threshold-row">
              <div className="threshold-info">
                <strong>NBI Clearance</strong>
              </div>
              <div className="threshold-inputs">
                <div className="input-wrap">
                  <label>First Alert</label>
                  <input type="text" defaultValue="30" />
                  <span>days</span>
                </div>
                <div className="input-wrap">
                  <label>Critical Alert</label>
                  <input type="text" defaultValue="7" />
                  <span>days</span>
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle Docs */}
          <div className="section-block">
            <div className="section-title">
              VEHICLE DOCUMENTATION
            </div>

            <div className="threshold-row">
              <div className="threshold-info">
                <strong>OR/CR</strong>
              </div>
              <div className="threshold-inputs">
                <div className="input-wrap">
                  <label>First Alert</label>
                  <input type="text" defaultValue="45" />
                  <span>days</span>
                </div>
                <div className="input-wrap">
                  <label>Critical Alert</label>
                  <input type="text" defaultValue="15" />
                  <span>days</span>
                </div>
              </div>
            </div>

            <div className="threshold-row">
              <div className="threshold-info">
                <strong>Insurance</strong>
              </div>
              <div className="threshold-inputs">
                <div className="input-wrap">
                  <label>First Alert</label>
                  <input type="text" defaultValue="60" />
                  <span>days</span>
                </div>
                <div className="input-wrap">
                  <label>Critical Alert</label>
                  <input type="text" defaultValue="15" />
                  <span>days</span>
                </div>
              </div>
            </div>

            <div className="threshold-row">
              <div className="threshold-info">
                <strong>LTFRB Permit</strong>
              </div>
              <div className="threshold-inputs">
                <div className="input-wrap">
                  <label>First Alert</label>
                  <input type="text" defaultValue="60" />
                  <span>days</span>
                </div>
                <div className="input-wrap">
                  <label>Critical Alert</label>
                  <input type="text" defaultValue="15" />
                  <span>days</span>
                </div>
              </div>
            </div>

            <div className="threshold-row">
              <div className="threshold-info">
                <strong>Emission Test</strong>
              </div>
              <div className="threshold-inputs">
                <div className="input-wrap">
                  <label>First Alert</label>
                  <input type="text" defaultValue="21" />
                  <span>days</span>
                </div>
                <div className="input-wrap">
                  <label>Critical Alert</label>
                  <input type="text" defaultValue="7" />
                  <span>days</span>
                </div>
              </div>
            </div>

            <div className="threshold-row">
              <div className="threshold-info">
                <strong>Maintenance Due</strong>
              </div>
              <div className="threshold-inputs">
                <div className="input-wrap">
                  <label>First Alert</label>
                  <input type="text" defaultValue="14" />
                  <span>days</span>
                </div>
                <div className="input-wrap">
                  <label>Critical Alert</label>
                  <input type="text" defaultValue="3" />
                  <span>days</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}