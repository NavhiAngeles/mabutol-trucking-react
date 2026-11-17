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

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [mobileMenuOpen]);

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
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        id="main-sidebar"
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
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
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            className="idle-timeout-dialog"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '28px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              textAlign: 'center',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }} aria-hidden="true">
              ⏳
            </div>
            <h3
              id="idle-warning-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '8px',
              }}
            >
              Session Expiring Soon
            </h3>
            <p
              id="idle-warning-desc"
              style={{
                fontSize: '0.925rem',
                color: '#475569',
                marginBottom: '16px',
                lineHeight: 1.5,
              }}
            >
              You have been inactive. For security, your session will automatically sign out in:
            </p>
            <div
              className="idle-timeout-countdown"
              aria-live="polite"
              aria-atomic="true"
              style={{
                fontSize: '2.25rem',
                fontWeight: 800,
                color: remainingSeconds <= 30 ? '#dc2626' : '#0b2a4a',
                marginBottom: '24px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formattedCountdown}
            </div>
            <button
              type="button"
              className="btn-stay-signed-in"
              onClick={staySignedIn}
              autoFocus
              style={{
                width: '100%',
                padding: '12px 24px',
                backgroundColor: '#0b2a4a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Stay signed in
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
