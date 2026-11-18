import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import TanawLogo from "./TanawLogo";
import "./PublicLayout.css";

const PUBLIC_NAV_LINKS = [
  { to: "/services", label: "Services & Fleet" },
  { to: "/workflow", label: "Operations Workflow" },
  { to: "/mobile-app", label: "Mobile App" },
];

export function PublicNavbar() {
  const { user, role } = useAuth();
  const isAuthenticated = Boolean(user && ["admin", "staff"].includes(role));
  const authDestination = isAuthenticated ? "/dashboard" : "/login";
  const authLabel = isAuthenticated ? "Go to Dashboard" : "Office Sign In";

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileToggleRef = useRef(null);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  useEffect(() => {
    if (!mobileMenuOpen || typeof document === "undefined") return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        mobileToggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header className="public-header">
      <div className="public-nav-container">
        <Link to="/" className="public-brand" onClick={closeMobileMenu}>
          <TanawLogo subtitle="Mabutol Trucking" priority />
        </Link>

        <nav
          id="public-primary-nav"
          className={`public-nav-links ${mobileMenuOpen ? "open" : ""}`}
          aria-label="Primary Navigation"
        >
          {PUBLIC_NAV_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `public-nav-link ${isActive ? "is-active" : ""}`}
              onClick={closeMobileMenu}
            >
              {item.label}
            </NavLink>
          ))}
          <div className="public-nav-auth-mobile">
            <Link to={authDestination} className="public-signin-btn" onClick={closeMobileMenu}>
              {authLabel}
            </Link>
          </div>
        </nav>

        <div className="public-nav-actions">
          <Link to={authDestination} className="public-signin-btn desktop-only">
            {authLabel}
          </Link>
          <button
            ref={mobileToggleRef}
            type="button"
            className="public-mobile-toggle"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="public-primary-nav"
          >
            {mobileMenuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
            <span className="public-mobile-toggle-text">
              {mobileMenuOpen ? "Close" : "Menu"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const { user, role } = useAuth();
  const isAuthenticated = Boolean(user && ["admin", "staff"].includes(role));
  const authDestination = isAuthenticated ? "/dashboard" : "/login";
  const authLabel = isAuthenticated ? "Operations Dashboard" : "Office Sign In";

  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div className="public-footer-brand">
          <Link to="/" className="public-brand">
            <TanawLogo subtitle="Mabutol Trucking" size="sm" />
          </Link>
          <p className="public-footer-location">
            San Josef, Peñaranda, Nueva Ecija &middot; Est. 2015
          </p>
          <p className="public-footer-desc">
            Centralized freight dispatch, GPS fleet telemetry, and digital Proof of Delivery portal for Mabutol Trucking.
          </p>
        </div>

        <div className="public-footer-links">
          <span className="public-footer-heading">Public Routes</span>
          <div className="public-footer-link-grid">
            <Link to="/">Home</Link>
            <Link to="/services">Services &amp; Fleet</Link>
            <Link to="/workflow">Operations Workflow</Link>
            <Link to="/mobile-app">Mobile App</Link>
            <Link to={authDestination}>{authLabel}</Link>
            <Link to="/forgot-password">Password Recovery</Link>
          </div>
        </div>

        <div className="public-footer-notice">
          <span className="public-footer-heading">Restricted Portal Notice</span>
          <p>
            Office dispatch modules are restricted to authorized Mabutol Trucking managers, dispatchers, and administrators. All session, pricing, and trip ledger actions are logged for audit compliance.
          </p>
        </div>
      </div>

      <div className="public-footer-bottom">
        <span>&copy; {new Date().getFullYear()} Mabutol Trucking. All rights reserved.</span>
        <span>Philippine Standard Time (Asia/Manila, UTC+8)</span>
      </div>
    </footer>
  );
}

export default function PublicLayout({ children, className = "" }) {
  const layoutClass = ["public-shell", className].filter(Boolean).join(" ");

  return (
    <div className={layoutClass}>
      <a href="#main-content" className="public-skip-link">
        Skip to main content
      </a>
      <PublicNavbar />
      <main id="main-content" className="public-main">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
