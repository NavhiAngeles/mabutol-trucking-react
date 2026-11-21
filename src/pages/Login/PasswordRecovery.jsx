import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../components/TanawLogo.css';
import { createOfficeRecovery } from '../../services/officeRecoveryService';
import './login.css';
import './passwordRecovery.css';

export function ForgotPassword() {
  return <PhoneRecovery />;
}

// Old reset URLs safely start a fresh SMS flow; no URL token grants access.
export function ResetPassword() {
  return <PhoneRecovery />;
}

function BrandBadge() {
  return (
    <span className="tanaw-brand-badge" aria-hidden="true">
      <img
        src="/tanaw-logo.png"
        alt=""
        width="38"
        height="38"
        className="tanaw-brand-img"
      />
    </span>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function formatRecoveryPhoneDisplay(raw) {
  const trimmed = String(raw ?? '').trim();
  const compact = trimmed.replace(/[\s()\-–—.]/g, '');
  let normalized = compact;
  if (/^09\d{9}$/.test(compact)) normalized = `+63${compact.slice(1)}`;
  else if (/^9\d{9}$/.test(compact)) normalized = `+63${compact}`;
  else if (/^639\d{9}$/.test(compact)) normalized = `+${compact}`;
  else if (/^\+?6309\d{9}$/.test(compact)) normalized = `+63${compact.replace(/^\+?630/, '')}`;
  else if (/^00630?9\d{9}$/.test(compact)) normalized = `+63${compact.replace(/^00630?/, '')}`;
  return /^\+639\d{9}$/.test(normalized) && trimmed !== normalized
    ? `${trimmed} (${normalized})`
    : trimmed;
}

function sanitizeOtpInput(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 6);
}

export function PhoneRecovery({ inModal = false, onClose = null, onBusyChange = null } = {}) {
  const [api] = useState(createOfficeRecovery);
  const [phase, setPhase] = useState('phone');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [security, setSecurity] = useState(null);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const until = useRef(0);
  const mounted = useRef(false);
  const started = useRef(false);
  const locked = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((until.current - Date.now()) / 1000))), 1000);
    return () => {
      mounted.current = false; clearInterval(timer);
      if (started.current) void api.dispose();
    };
  }, [api]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  async function run(operation) {
    if (locked.current) return;
    locked.current = true; started.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch (cause) { if (mounted.current) setError(cause.message); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  async function send() {
    if (Date.now() < until.current) return;
    await run(async () => {
      const message = await api.request(phone);
      if (!mounted.current) return;
      until.current = Date.now() + 60000; setRemaining(60);
      setSmsCode(''); setNotice(message); setPhase('code');
    });
  }
  async function submit(event) {
    event.preventDefault();
    if (phase === 'phone') return send();
    await run(async () => {
      if (phase === 'code') {
        const state = await api.verifyPhone(phone, smsCode);
        if (!mounted.current) return;
        setSecurity(state); setFactorId(state.factors[0]?.id || ''); setSmsCode(''); setNotice(''); setPhase('ready');
      } else if (phase === 'ready' && security.required) {
        const state = await api.verify(factorId, code);
        if (!mounted.current) return;
        setSecurity(state); setCode('');
      } else if (phase === 'ready') {
        const current = await api.security();
        if (!mounted.current) return;
        if (current.required) {
          setSecurity(current); setFactorId(current.factors[0]?.id || '');
          setError('Verify your authenticator before changing the password.'); return;
        }
        const message = await api.reset(password, confirmation);
        if (!mounted.current) return;
        setPassword(''); setConfirmation(''); setCode(''); setPhone(''); setNotice(message); setPhase('done');
      }
    });
  }
  function changeNumber() {
    if (locked.current) return;
    // A different number must wait out the same resend cooldown.
    setPhase('phone'); setSmsCode(''); setNotice(''); setError('');
  }

  const cardContent = (
    <section className={inModal ? 'recovery-modal-content' : 'card'} aria-labelledby="recovery-title">
      <header className={inModal ? 'recovery-modal-header' : 'card-header'}>
        <div className="recovery-header-copy">
          <h2 id="recovery-title">Reset your password</h2>
          <p>Verify your office recovery phone using an SMS code.</p>
        </div>
        {inModal && (
          <button
            type="button"
            className="recovery-modal-close"
            disabled={busy}
            onClick={() => { if (!busy) onClose?.(); }}
            aria-label="Close password recovery"
          >
            <CloseIcon />
          </button>
        )}
      </header>
      <div className={inModal ? 'recovery-modal-body' : undefined}>
        {error && <p className="recovery-error" role="alert">{error}</p>}
        {notice && <p className="recovery-success" role="status">{notice}</p>}
        {phase !== 'done' && <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            {phase === 'phone' && <>
              <div className="form-group"><label htmlFor="recovery-phone" className="field-label">Registered recovery mobile number</label><input id="recovery-phone" type="tel" autoComplete="tel" autoFocus={inModal} required maxLength={40} placeholder="09XXXXXXXXX or +639XXXXXXXXX" value={phone} onChange={event => setPhone(event.target.value)} /></div>
              <p className="recovery-help">Enter your Philippine mobile number in <code>09XXXXXXXXX</code> or <code>+639XXXXXXXXX</code> format (<code>09XX</code> numbers are automatically converted to <code>+639XX</code>). Use the number registered by your administrator; a profile contact number alone does not enable recovery.</p>
              <button className="btn-primary" type="submit" disabled={remaining > 0}>{busy ? 'Requesting SMS…' : remaining > 0 ? `Request again in ${remaining}s` : 'Send SMS code'}</button>
            </>}
            {phase === 'code' && <>
              <p className="recovery-help recovery-help-top">Enter the latest SMS code for {formatRecoveryPhoneDisplay(phone)}. SMS receipt is required to continue.</p>
              <div className="form-group"><label htmlFor="recovery-sms-code" className="field-label">Six-digit SMS code</label><input id="recovery-sms-code" inputMode="numeric" autoComplete="one-time-code" autoFocus={inModal} pattern="[0-9]{6}" maxLength={12} required value={smsCode} onChange={event => setSmsCode(sanitizeOtpInput(event.target.value))} /></div>
              <button className="btn-primary" type="submit">{busy ? 'Verifying SMS…' : 'Verify SMS code'}</button>
              <button className="recovery-secondary" type="button" disabled={remaining > 0} onClick={send}>{remaining > 0 ? `Resend in ${remaining}s` : 'Resend SMS code'}</button>
              <button className="recovery-secondary" type="button" onClick={changeNumber}>Use a different number</button>
            </>}
            {phase === 'ready' && (security.required ? <>
              <p className="recovery-help recovery-help-top">Your SMS code is verified. Your account also requires its existing authenticator.</p>
              {security.unsupported || !security.factors.length ? <p className="recovery-error" role="alert">Contact your administrator for help with your authentication method. Password reset remains locked.</p> : <>
                <div className="form-group"><label htmlFor="recovery-factor" className="field-label">Authenticator</label><select id="recovery-factor" value={factorId} onChange={event => setFactorId(event.target.value)}>{security.factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Authenticator ${index + 1}`}</option>)}</select></div>
                <div className="form-group"><label htmlFor="recovery-code" className="field-label">Six-digit authenticator code</label><input id="recovery-code" autoComplete="one-time-code" inputMode="numeric" autoFocus={inModal} pattern="[0-9]{6}" maxLength={12} required value={code} onChange={event => setCode(sanitizeOtpInput(event.target.value))} /></div>
                <button type="submit" className="btn-primary">{busy ? 'Verifying…' : 'Verify authenticator'}</button>
              </>}
            </> : <>
              <p className="recovery-help recovery-help-top" id="recovery-password-help">Use at least 8 characters and meet your office password policy. Password spaces are preserved.</p>
              <div className="form-group"><label htmlFor="recovery-password" className="field-label">New password</label><input id="recovery-password" type="password" autoComplete="new-password" autoFocus={inModal} minLength={8} required aria-describedby="recovery-password-help" value={password} onChange={event => setPassword(event.target.value)} /></div>
              <div className="form-group"><label htmlFor="recovery-confirmation" className="field-label">Confirm new password</label><input id="recovery-confirmation" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
              <button type="submit" className="btn-primary">{busy ? 'Resetting password…' : 'Reset password'}</button>
            </>)}
          </fieldset>
        </form>}
        {inModal ? (
          <>
            {phase === 'done' ? (
              <button type="button" className="btn-primary" autoFocus onClick={() => onClose?.()}>
                Return to sign in
              </button>
            ) : (
              <div className="recovery-modal-footer">
                <button
                  type="button"
                  className="recovery-cancel-link"
                  disabled={busy}
                  onClick={() => { if (!busy) onClose?.(); }}
                >
                  Cancel and return to sign in
                </button>
              </div>
            )}
            {phase === 'ready' && <p className="recovery-help">Closing this dialog or reloading requires a new SMS verification.</p>}
          </>
        ) : (
          <>
            <Link className="recovery-back" aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }} to="/">{phase === 'done' ? 'Return to home' : 'Cancel and return to home'}</Link>
            {phase === 'ready' && <p className="recovery-help">Reloading or leaving this page requires a new SMS verification.</p>}
          </>
        )}
      </div>
    </section>
  );

  if (inModal) return cardContent;

  return <div className="login-page recovery-page"><main className="container">
    <div className="branding"><BrandBadge /><div className="branding-text"><h1>TANAW</h1><p className="branding-subtitle">Mabutol Trucking Operations</p></div></div>
    {cardContent}
  </main></div>;
}
