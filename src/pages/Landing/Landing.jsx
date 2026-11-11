import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./Landing.css";

export default function Landing() {
  const { user, role } = useAuth();
  const isAuthenticated = Boolean(user && ["admin", "staff"].includes(role));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navigatingOut, setNavigatingOut] = useState(false);
  const navigate = useNavigate();

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const handleSignInClick = (targetPath) => (e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    if (navigatingOut) return;
    setNavigatingOut(true);
    closeMobileMenu();

    const destination = targetPath || (isAuthenticated ? "/dashboard" : "/login");

    setTimeout(() => {
      navigate(destination);
    }, 240);
  };

  const scrollToSection = (targetId) => (e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    closeMobileMenu();
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    const element = document.getElementById(targetId);
    if (element) {
      if (typeof element.scrollIntoView === "function") {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (typeof window.scrollTo === "function") {
        const headerOffset = 76;
        const elementPosition = element.getBoundingClientRect?.().top ?? 0;
        const pageOffset = window.pageYOffset ?? window.scrollY ?? 0;
        window.scrollTo({
          top: elementPosition + pageOffset - headerOffset,
          behavior: "smooth"
        });
      }
      try {
        if (window.history && typeof window.history.pushState === "function") {
          window.history.pushState(null, "", `#${targetId}`);
        }
      } catch {
        // safely ignore in sandboxed or mock test environments
      }
    }
  };

  const scrollToTop = (e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    closeMobileMenu();
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
      try {
        if (window.history && typeof window.history.pushState === "function") {
          window.history.pushState(null, "", window.location.pathname);
        }
      } catch {
        // safely ignore
      }
    }
  };

  return (
    <div className={`landing-page ${navigatingOut ? "navigating-out" : ""}`}>
      {navigatingOut && (
        <div className="modern-top-loader" aria-hidden="true">
          <div className="modern-top-loader-bar" />
        </div>
      )}

      {/* ---------- Top Navigation ---------- */}
      <header className="landing-header">
        <div className="landing-nav-container">
          <Link to="/" className="landing-brand" onClick={scrollToTop}>
            <div className="landing-logo-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div className="landing-brand-text">
              <span className="landing-brand-name">TANAW</span>
              <span className="landing-brand-tag">NUEVA ECIJA LOGISTICS</span>
            </div>
          </Link>

          <nav className={`landing-nav-links ${mobileMenuOpen ? "open" : ""}`} aria-label="Main Navigation">
            <a href="#features" onClick={scrollToSection("features")}>Features</a>
            <a href="#preview" onClick={scrollToSection("preview")}>Operations</a>
            <a href="#metrics" onClick={scrollToSection("metrics")}>Overview</a>
            <a href="#workflow" onClick={scrollToSection("workflow")}>Workflow</a>
            <div className="landing-nav-auth-mobile">
              <Link
                to={isAuthenticated ? "/dashboard" : "/login"}
                className="landing-btn-primary"
                onClick={handleSignInClick()}
              >
                {isAuthenticated ? "Go to Dashboard →" : "Sign In →"}
              </Link>
            </div>
          </nav>

          <div className="landing-nav-actions">
            <Link
              to={isAuthenticated ? "/dashboard" : "/login"}
              className="landing-btn-primary desktop-only"
              onClick={handleSignInClick()}
            >
              {isAuthenticated ? "Go to Dashboard →" : "Sign In →"}
            </Link>
            <button
              type="button"
              className="landing-mobile-toggle"
              onClick={() => setMobileMenuOpen(prev => !prev)}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Hero Section ---------- */}
      <section className="landing-hero" id="hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-badge">
            <span className="badge-pulse" />
            <span>CENTRAL LUZON FREIGHT & DISPATCH OPERATIONS</span>
          </div>

          <h1 className="landing-hero-title">
            Smart Fleet Dispatch &amp; Real-Time Delivery Tracking
          </h1>

          <p className="landing-hero-subtitle">
            The unified operations center for Mabutol Trucking. Dispatch shipments with automatic toll calculations, monitor live GPS positions across Luzon highways, coordinate directly with drivers, and maintain rigorous financial audit precision.
          </p>

          <div className="landing-hero-actions">
            <Link
              to={isAuthenticated ? "/dashboard" : "/login"}
              className="landing-btn-cta"
              onClick={handleSignInClick()}
            >
              {isAuthenticated ? "Open Operations Dashboard →" : "Sign In to Operations →"}
            </Link>
            <a
              href="#features"
              className="landing-btn-outline"
              onClick={scrollToSection("features")}
            >
              Explore Capabilities ↓
            </a>
          </div>

          <div className="landing-trust-bar">
            <span>✓ Live GPS Luzon Telemetry</span>
            <span className="dot-divider">•</span>
            <span>✓ Automated NLEX · SCTEX · TPLEX Tolls</span>
            <span className="dot-divider">•</span>
            <span>✓ Encrypted POD &amp; Photo Signatures</span>
            <span className="dot-divider">•</span>
            <span>✓ Real-time Driver Messages</span>
          </div>
        </div>

        {/* ---------- Interactive Operations Preview Window ---------- */}
        <div className="landing-preview-section" id="preview">
          <div className="landing-preview-window">
            <div className="preview-window-bar">
              <div className="preview-dots">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="preview-url-pill">
                <span className="lock-icon">🔒</span>
                <span>tanaw.mabutol.ph/dashboard</span>
              </div>
              <div className="preview-live-tag">
                <span className="live-dot" /> LIVE OPERATIONS
              </div>
            </div>

            <div className="preview-dashboard-body">
              {/* Mini Topbar */}
              <div className="preview-topbar">
                <div className="preview-search">
                  <span>🔍</span>
                  <span className="preview-search-text">Search shipments, customers, routes, drivers…</span>
                </div>
                <div className="preview-topbar-tools">
                  <span className="preview-badge-pht">PHT 01:23 PM</span>
                  <span className="preview-icon-btn">🔔</span>
                  <span className="preview-icon-btn">💬</span>
                  <span className="preview-avatar">IV</span>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="preview-stats-grid">
                <div className="preview-stat-card border-green">
                  <span className="stat-label">Active Shipments</span>
                  <strong className="stat-num text-green">1</strong>
                  <span className="stat-note">En route to Bulacan</span>
                </div>
                <div className="preview-stat-card border-red">
                  <span className="stat-label">Delayed Shipments</span>
                  <strong className="stat-num text-slate">0</strong>
                  <span className="stat-note">All routes on schedule</span>
                </div>
                <div className="preview-stat-card border-blue">
                  <span className="stat-label">Available Trucks</span>
                  <strong className="stat-num text-blue">22</strong>
                  <span className="stat-note">Ready for dispatch</span>
                </div>
                <div className="preview-stat-card border-amber">
                  <span className="stat-label">Pending Dispatch</span>
                  <strong className="stat-num text-amber">1</strong>
                  <span className="stat-note">1 review pending</span>
                </div>
              </div>

              {/* Lower Section: Simulated Map & Action Center */}
              <div className="preview-lower-grid">
                <div className="preview-map-card">
                  <div className="preview-card-header">
                    <h4>Live Tracking: Central Luzon</h4>
                    <span className="map-chip">GPS Active</span>
                  </div>
                  <div className="preview-map-canvas">
                    <div className="map-road-line" />
                    <div className="map-truck-pin pin-active">
                      <span className="truck-emoji">🚚</span>
                      <span className="pin-tooltip">DEMO-VAN-02 · Cabanatuan → Balagtas</span>
                    </div>
                    <div className="map-depot-pin pin-depot">
                      <span>📍</span>
                      <span className="depot-tooltip">Cabanatuan Depot</span>
                    </div>
                    <div className="map-dest-pin pin-dest">
                      <span>🏁</span>
                      <span className="dest-tooltip">Balagtas Dropoff</span>
                    </div>
                  </div>
                </div>

                <div className="preview-action-card">
                  <div className="preview-card-header">
                    <h4>Operations Action Center</h4>
                  </div>
                  <div className="preview-alert-item alert-compliance">
                    <div className="alert-icon">🛡️</div>
                    <div className="alert-content">
                      <strong>Fleet Compliance Standing</strong>
                      <p>23 vehicles inspected · All driver credentials verified.</p>
                    </div>
                  </div>
                  <div className="preview-alert-item alert-booking">
                    <div className="alert-icon">📦</div>
                    <div className="alert-content">
                      <strong>Customer Booking Request</strong>
                      <p>Biscuits freight · Awaiting office assignment review.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Core Capabilities Grid ---------- */}
      <section className="landing-features" id="features">
        <div className="landing-section-header">
          <span className="landing-section-tag">BUILT FOR MODERN LOGISTICS</span>
          <h2>Comprehensive Freight Operations Infrastructure</h2>
          <p>
            Engineered to replace fragmented spreadsheets and phone calls with high-precision tracking, automated toll calculation, and auditable accountability.
          </p>
        </div>

        <div className="landing-features-grid">
          {/* Feature 1 */}
          <div className="landing-feature-card">
            <div className="feature-icon-wrapper icon-navy">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
            </div>
            <h3>Real-Time GPS Fleet Tracking</h3>
            <p>
              Monitor vehicle positions across Luzon arterial highways with automated delay alerts, leg-by-leg journey tracking, and accurate estimated arrival timestamps.
            </p>
            <ul className="feature-list">
              <li>Continuous GPS telemetry and geofenced milestone checks</li>
              <li>Live highway route previews across Nueva Ecija, Bulacan, and Pampanga</li>
              <li>Instant delay detection based on planned arrival variance</li>
            </ul>
          </div>

          {/* Feature 2 */}
          <div className="landing-feature-card">
            <div className="feature-icon-wrapper icon-blue">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </div>
            <h3>Capacity-Aware Smart Dispatch</h3>
            <p>
              Match freight requests against exact truck capacity, axle limits, and maintenance readiness while preventing double-booking and unauthorized assignments.
            </p>
            <ul className="feature-list">
              <li>Automatic cargo weight and volume capacity validation</li>
              <li>Integrated NLEX, SCTEX, and TPLEX toll pricing matrices</li>
              <li>Prevent dispatch of vehicles with overdue maintenance logs</li>
            </ul>
          </div>

          {/* Feature 3 */}
          <div className="landing-feature-card">
            <div className="feature-icon-wrapper icon-green">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3>In-App Driver Communication</h3>
            <p>
              Coordinate directly with drivers through a dedicated, auditable communication stream without relying on external messaging apps.
            </p>
            <ul className="feature-list">
              <li>Instant conversation inbox with unread badges in the topbar</li>
              <li>Trip-specific chat bubbles with verified Philippine timestamps</li>
              <li>Digital proof of delivery (POD) photo and signature sync</li>
            </ul>
          </div>

          {/* Feature 4 */}
          <div className="landing-feature-card">
            <div className="feature-icon-wrapper icon-amber">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <h3>Audited Ledger &amp; Performance Reports</h3>
            <p>
              Track on-time arrival trends, revenue per customer, fuel costs, and recorded expenses in an auditable ledger with export capabilities.
            </p>
            <ul className="feature-list">
              <li>Delivery Performance Trend chart with widescreen variance analysis</li>
              <li>Multi-range filtering (Today, This Week, Month, Custom Range)</li>
              <li>Automated CSV and PDF report generation with scheduled delivery</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- High-Impact Metric Bar ---------- */}
      <section className="landing-metrics" id="metrics">
        <div className="landing-metrics-inner">
          <div className="metric-col">
            <strong className="metric-number">23</strong>
            <span className="metric-label">FLEET VEHICLES</span>
            <p className="metric-sub">Heavy, medium &amp; light cargo trucks</p>
          </div>
          <div className="metric-divider" />
          <div className="metric-col">
            <strong className="metric-number">99.2%</strong>
            <span className="metric-label">ON-TIME RATE</span>
            <p className="metric-sub">Across timed completed shipments</p>
          </div>
          <div className="metric-divider" />
          <div className="metric-col">
            <strong className="metric-number">100%</strong>
            <span className="metric-label">PHILIPPINE TIMEZONE</span>
            <p className="metric-sub">Synchronized Asia/Manila (PHT) dates</p>
          </div>
          <div className="metric-divider" />
          <div className="metric-col">
            <strong className="metric-number">&lt; 3s</strong>
            <span className="metric-label">REALTIME DISPATCH</span>
            <p className="metric-sub">Instant driver alert &amp; chat updates</p>
          </div>
        </div>
      </section>

      {/* ---------- 4-Step Operational Workflow ---------- */}
      <section className="landing-workflow" id="workflow">
        <div className="landing-section-header">
          <span className="landing-section-tag">SEAMLESS LOGISTICS PIPELINE</span>
          <h2>How TANAW Powers Every Delivery</h2>
          <p>
            From the initial customer quotation to verified destination sign-off, every stage is structured for zero data loss and maximum punctuality.
          </p>
        </div>

        <div className="workflow-steps-grid">
          <div className="workflow-step-card">
            <div className="step-number-badge">01</div>
            <h4>Booking &amp; Quotation</h4>
            <p>
              Office staff reviews freight details, calculates exact toll fees, and generates verified booking agreements with clear delivery requirements.
            </p>
          </div>

          <div className="workflow-step-card">
            <div className="step-number-badge">02</div>
            <h4>Automated Dispatch</h4>
            <p>
              Eligible trucks and drivers are matched by capacity, license validity, and vehicle maintenance status, locking reservations atomically.
            </p>
          </div>

          <div className="workflow-step-card">
            <div className="step-number-badge">03</div>
            <h4>In-Transit Telemetry</h4>
            <p>
              Drivers confirm milestones via mobile app while dispatchers monitor live GPS road tracking, toll plaza crossings, and status updates.
            </p>
          </div>

          <div className="workflow-step-card">
            <div className="step-number-badge">04</div>
            <h4>POD &amp; Financial Ledger</h4>
            <p>
              Upon drop-off, drivers upload digital signatures and photo evidence, immediately recording arrival timestamps and final delivery variance.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Call to Action Banner ---------- */}
      <section className="landing-cta-section">
        <div className="landing-cta-card">
          <div className="landing-cta-content">
            <div className="landing-logo-icon cta-logo" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <h2>Ready to Access the Operations Center?</h2>
            <p>
              Sign in with your authorized office administrator or dispatcher account to access the live operations board, fleet registry, and reports.
            </p>
            <Link
              to={isAuthenticated ? "/dashboard" : "/login"}
              className="landing-btn-cta cta-light"
              onClick={handleSignInClick()}
            >
              {isAuthenticated ? "Enter Operations Dashboard →" : "Sign In to Operations →"}
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-col-brand">
            <Link to="/" className="landing-brand" onClick={scrollToTop}>
              <div className="landing-logo-icon small" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <div className="landing-brand-text">
                <span className="landing-brand-name">TANAW</span>
                <span className="landing-brand-tag">NUEVA ECIJA LOGISTICS</span>
              </div>
            </Link>
            <p className="footer-desc">
              Centralized logistics operations, fleet telemetry, and dispatch management system for Mabutol Trucking.
            </p>
          </div>

          <div className="footer-col-links">
            <span className="footer-links-title">Platform</span>
            <a href="#features" onClick={scrollToSection("features")}>Features</a>
            <a href="#preview" onClick={scrollToSection("preview")}>Operations</a>
            <a href="#workflow" onClick={scrollToSection("workflow")}>Workflow</a>
            <Link
              to={isAuthenticated ? "/dashboard" : "/login"}
              onClick={handleSignInClick()}
            >
              {isAuthenticated ? "Dashboard" : "Office Login"}
            </Link>
          </div>

          <div className="footer-col-links">
            <span className="footer-links-title">Operations</span>
            <Link to="/login" onClick={handleSignInClick("/login")}>Dispatcher Portal</Link>
            <Link to="/forgot-password">Account Recovery</Link>
            <a href="#metrics" onClick={scrollToSection("metrics")}>Fleet Metrics</a>
          </div>

          <div className="footer-col-notice">
            <span className="footer-links-title">Notice</span>
            <p>
              This portal is restricted to authorized Mabutol Trucking dispatchers, fleet administrators, and operations personnel. All activities are recorded for audit compliance.
            </p>
          </div>
        </div>

        <div className="landing-footer-bottom">
          <span>&copy; {new Date().getFullYear()} Mabutol Trucking. All rights reserved.</span>
          <button
            type="button"
            className="landing-back-to-top"
            onClick={scrollToTop}
            aria-label="Back to top"
          >
            Back to top ↑
          </button>
          <span>Philippine Standard Time (PHT · UTC+8)</span>
        </div>
      </footer>
    </div>
  );
}

