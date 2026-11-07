import Sidebar from "../components/Sidebar/sidebar";
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../context/AuthContext";
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import './mainLayout.css';

export default function MainLayout({ children }) {
  const navigate = useNavigate();
  const { role } = useAuth();

  const handleIdleTimeout = useCallback(() => navigate("/"), [navigate]);
  const idleState = useIdleTimeout(role, handleIdleTimeout);
  const showWarning = idleState?.showWarning ?? false;
  const remainingSeconds = idleState?.remainingSeconds ?? 120;
  const staySignedIn = idleState?.staySignedIn;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedCountdown = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="dashboard">
      <Sidebar />

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
