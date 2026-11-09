import { useEffect, useRef, useState } from 'react';
import { securityApi } from '../services/securityService';
import './MfaGate.css';

export default function MfaGate({ children }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState('');
  const guard = useRef(false);

  useEffect(() => {
    let disposed = false;
    securityApi.assurance().then(data => {
      if (!disposed) {
        setStatus(data);
        setFactorId(data.factors?.[0]?.id || '');
        setError('');
        if (data.required && data.twoFactorType === 'textbee_sms' && securityApi.sendChallengeSms) {
          securityApi.sendChallengeSms().catch(() => {});
        }
      }
    }).catch(err => {
      if (!disposed) setError(err.message);
    });
    return () => { disposed = true; };
  }, [reload]);

  async function submit(event) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError('');
    setResendNotice('');
    try {
      if (status?.twoFactorType === 'textbee_sms' && securityApi.verifyChallengeSms) {
        await securityApi.verifyChallengeSms(code);
      } else {
        await securityApi.verify(factorId || status?.factors?.[0]?.id || 'sms', code);
      }
      setCode('');
      setStatus(null);
      setReload(n => n + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }

  async function handleResend() {
    if (guard.current || busy) return;
    guard.current = true;
    setBusy(true);
    setError('');
    setResendNotice('');
    try {
      if (securityApi.sendChallengeSms) {
        await securityApi.sendChallengeSms();
      }
      setResendNotice('A new verification code was sent via TextBee SMS.');
    } catch (err) {
      setError(err.message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }

  async function signOut() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    try {
      await securityApi.signOut();
    } catch (err) {
      setError(err.message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }

  if (status && !status.required) return children;

  return (
    <div className="mfa-page">
      <div className="mfa-container">
        {/* Tanaw Branding */}
        <div className="mfa-branding">
          <div className="mfa-logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="mfa-brand-text">
            <h1 className="mfa-brand-title">TANAW</h1>
            <span className="mfa-brand-sub">NUEVA ECIJA LOGISTICS</span>
          </div>
        </div>

        {/* Security Card */}
        <main className="mfa-challenge">
          <div className="mfa-header">
            <div className="mfa-icon-badge" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h2>Verify your sign-in</h2>
            <p className="mfa-header-desc">Multi-factor security verification</p>
          </div>

          {/* Loading / Checking State */}
          {!status && !error && (
            <div className="mfa-status-card" role="status">
              <div className="mfa-spinner" aria-hidden="true" />
              <div className="mfa-status-info">
                <strong>Checking authentication...</strong>
                <p>Verifying session security and access permissions.</p>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mfa-alert-box" role="alert">
              <svg className="mfa-alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div className="mfa-alert-content">
                <strong>Verification issue</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Resend Notice */}
          {resendNotice && (
            <div className="mfa-resend-notice" role="status">
              <svg className="mfa-notice-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{resendNotice}</span>
            </div>
          )}

          {/* MFA Challenge Form */}
          {status?.required && (
            <form onSubmit={submit} className="mfa-form">
              <fieldset disabled={busy} className="mfa-fieldset">
                {status.twoFactorType === 'textbee_sms' || status.phone ? (
                  <>
                    <p className="mfa-instructions">
                      Enter the six-digit verification code sent via TextBee SMS to your phone{status.phone ? ` (${status.phone})` : ''}.
                    </p>
                    <div className="mfa-form-group">
                      <label htmlFor="mfa-sms-input" className="mfa-label">
                        Six-digit SMS code
                      </label>
                      <input
                        id="mfa-sms-input"
                        className="mfa-input mfa-code-input"
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        placeholder="123456"
                        autoFocus
                      />
                    </div>
                    <div className="mfa-form-actions">
                      <button type="submit" className="mfa-btn-primary" disabled={busy}>
                        {busy ? 'Verifying...' : 'Verify'}
                      </button>
                      <button type="button" className="mfa-btn-resend" onClick={handleResend} disabled={busy}>
                        Resend SMS Code
                      </button>
                    </div>
                  </>
                ) : status.factors?.length > 0 ? (
                  <>
                    <div className="mfa-form-group">
                      <label htmlFor="mfa-factor-select" className="mfa-label">
                        Authenticator
                      </label>
                      <select
                        id="mfa-factor-select"
                        className="mfa-select"
                        value={factorId}
                        onChange={e => setFactorId(e.target.value)}
                      >
                        {status.factors.map((f, i) => (
                          <option key={f.id} value={f.id}>{f.friendly_name || `Authenticator ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mfa-form-group">
                      <label htmlFor="mfa-auth-input" className="mfa-label">
                        Six-digit authenticator code
                      </label>
                      <input
                        id="mfa-auth-input"
                        className="mfa-input mfa-code-input"
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        placeholder="123456"
                        autoFocus
                      />
                    </div>
                    <div className="mfa-form-actions">
                      <button type="submit" className="mfa-btn-primary" disabled={busy}>
                        {busy ? 'Verifying...' : 'Verify'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mfa-unsupported-box">
                    <p>Your authentication method requires administrator assistance. Office pages remain locked.</p>
                  </div>
                )}
              </fieldset>
            </form>
          )}

          {/* Footer Utility Actions */}
          <div className="mfa-footer-actions">
            <button
              type="button"
              className="mfa-btn-secondary"
              disabled={busy}
              onClick={() => { setStatus(null); setError(''); setReload(n => n + 1); }}
            >
              <svg className="mfa-action-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              Retry security check
            </button>
            <button
              type="button"
              className="mfa-btn-signout"
              disabled={busy}
              onClick={signOut}
            >
              <svg className="mfa-action-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </main>

        {/* Security Trust Caption */}
        <footer className="mfa-trust-footer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Secured by Tanaw Identity & Access Management</span>
        </footer>
      </div>
    </div>
  );
}
