import Sidebar from "../components/Sidebar/sidebar";
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../context/AuthContext";
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import './mainLayout.css';

export default function MainLayout({ children }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleIdleTimeout = useCallback(() => navigate("/"), [navigate]);
  const idleState = useIdleTimeout(role, handleIdleTimeout);
  const showWarning = idleState?.showWarning ?? false;
  const remainingSeconds = idleState?.remainingSeconds ?? 120;
  const staySignedIn = idleState?.staySignedIn;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedCountdown = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
    // Query DOM instead of useRef so unit test VM harnesses without useRef stay compatible.
    if (typeof document !== 'undefined') {
      document.querySelector('.mobile-menu-trigger')?.focus?.();
    }
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (typeof document !== 'undefined' && document.querySelector?.('.logout-modal-backdrop')) return;
      closeMobileMenu();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [mobileMenuOpen, closeMobileMenu]);

  return (
    <div className={`dashboard ${mobileMenuOpen ? 'mobile-menu-active' : ''}`}>
      <button
        type="button"
        className="mobile-menu-trigger"
        onClick={() => setMobileMenuOpen(prev => !prev)}
        aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileMenuOpen}
        aria-controls="main-sidebar"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6"/>
          <line x1="4" y1="12" x2="20" y2="12"/>
          <line x1="4" y1="18" x2="20" y2="18"/>
        </svg>
      </button>

      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      <Sidebar
        id="main-sidebar"
        mobileOpen={mobileMenuOpen}
        onClose={closeMobileMenu}
      />

      <main className="main">
        {children}
      </main>

      {showWarning && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="idle-warning-title"
          aria-describedby="idle-warning-desc"
          className="idle-timeout-overlay"
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              e.currentTarget.querySelector?.('.btn-stay-signed-in')?.focus?.();
            }
          }}
        >
          <div className="idle-timeout-dialog">
            <div className="idle-timeout-icon" aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h3 id="idle-warning-title" className="idle-timeout-title">
              Session Expiring Soon
            </h3>
            <p id="idle-warning-desc" className="idle-timeout-desc">
              You have been inactive. For security, your session will automatically sign out in:
            </p>
            <div
              className="idle-timeout-countdown"
              data-urgent={remainingSeconds <= 30 ? 'true' : 'false'}
              aria-live="polite"
              aria-atomic="true"
            >
              {formattedCountdown}
            </div>
            <button
              type="button"
              className="btn-stay-signed-in"
              onClick={staySignedIn}
              autoFocus
            >
              Stay signed in
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
