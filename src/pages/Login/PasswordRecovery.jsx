import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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

function PhoneRecovery() {
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
  return <div className="login-page recovery-page"><main className="container">
    <div className="branding"><h1>TANAW</h1></div>
    <section className="card" aria-labelledby="recovery-title">
      <header className="card-header"><h2 id="recovery-title">Reset your password</h2><p>Verify your office recovery phone using an SMS code.</p></header>
      {error && <p className="recovery-error" role="alert">{error}</p>}
      {notice && <p className="recovery-success" role="status">{notice}</p>}
      {phase !== 'done' && <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy}>
          {phase === 'phone' && <>
            <div className="form-group"><label htmlFor="recovery-phone">Registered recovery mobile number</label><input id="recovery-phone" type="tel" autoComplete="tel" required maxLength={40} placeholder="09XXXXXXXXX or +639XXXXXXXXX" value={phone} onChange={event => setPhone(event.target.value)} /></div>
            <p className="recovery-help">Use the number registered by your administrator. A profile contact number alone does not enable recovery.</p>
            <button className="btn-primary" type="submit" disabled={remaining > 0}>{busy ? 'Requesting SMS…' : remaining > 0 ? `Request again in ${remaining}s` : 'Send SMS code'}</button>
          </>}
          {phase === 'code' && <>
            <p className="recovery-help">Enter the latest SMS code for {phone}. SMS receipt is required to continue.</p>
            <div className="form-group"><label htmlFor="recovery-sms-code">Six-digit SMS code</label><input id="recovery-sms-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={smsCode} onChange={event => setSmsCode(event.target.value)} /></div>
            <button className="btn-primary" type="submit">{busy ? 'Verifying SMS…' : 'Verify SMS code'}</button>
            <button className="recovery-secondary" type="button" disabled={remaining > 0} onClick={send}>{remaining > 0 ? `Resend in ${remaining}s` : 'Resend SMS code'}</button>
            <button className="recovery-secondary" type="button" onClick={changeNumber}>Use a different number</button>
          </>}
          {phase === 'ready' && (security.required ? <>
            <p className="recovery-help">Your SMS code is verified. Your account also requires its existing authenticator.</p>
            {security.unsupported || !security.factors.length ? <p role="alert">Contact your administrator for help with your authentication method. Password reset remains locked.</p> : <>
              <div className="form-group"><label htmlFor="recovery-factor">Authenticator</label><select id="recovery-factor" value={factorId} onChange={event => setFactorId(event.target.value)}>{security.factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Authenticator ${index + 1}`}</option>)}</select></div>
              <div className="form-group"><label htmlFor="recovery-code">Six-digit authenticator code</label><input id="recovery-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} /></div>
              <button type="submit" className="btn-primary">{busy ? 'Verifying…' : 'Verify authenticator'}</button>
            </>}
          </> : <>
            <p className="recovery-help" id="recovery-password-help">Use at least 8 characters and meet your office password policy. Password spaces are preserved.</p>
            <div className="form-group"><label htmlFor="recovery-password">New password</label><input id="recovery-password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="recovery-password-help" value={password} onChange={event => setPassword(event.target.value)} /></div>
            <div className="form-group"><label htmlFor="recovery-confirmation">Confirm new password</label><input id="recovery-confirmation" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
            <button type="submit" className="btn-primary">{busy ? 'Resetting password…' : 'Reset password'}</button>
          </>)}
        </fieldset>
      </form>}
      <Link className="recovery-back" aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }} to="/">{phase === 'done' ? 'Return to login' : 'Cancel and return to login'}</Link>
      {phase === 'ready' && <p className="recovery-help">Reloading or leaving this page requires a new SMS verification.</p>}
    </section>
  </main></div>;
}
