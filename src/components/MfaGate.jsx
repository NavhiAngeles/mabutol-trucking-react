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
  const guard = useRef(false);
  useEffect(() => {
    let disposed = false;
    securityApi.assurance().then(data => { if (!disposed) { setStatus(data); setFactorId(data.factors[0]?.id || ''); setError(''); } })
      .catch(err => { if (!disposed) setError(err.message); });
    return () => { disposed = true; };
  }, [reload]);
  async function submit(event) {
    event.preventDefault(); if (guard.current) return;
    guard.current = true; setBusy(true); setError('');
    try { await securityApi.verify(factorId, code); setCode(''); setStatus(null); setReload(n => n + 1); }
    catch (err) { setError(err.message); }
    finally { guard.current = false; setBusy(false); }
  }
  async function signOut() {
    if (guard.current) return;
    guard.current = true; setBusy(true);
    try { await securityApi.signOut(); }
    catch (err) { setError(err.message); }
    finally { guard.current = false; setBusy(false); }
  }
  if (status && !status.required) return children;
  return <main className="mfa-challenge"><h2>Verify your sign-in</h2>
    {!status && !error && <p role="status">Checking authentication...</p>}
    {error && <p role="alert">{error}</p>}
    {status?.required && <form onSubmit={submit}><fieldset disabled={busy}>
      {status.factors.length > 0 ? <><label>Authenticator<select value={factorId} onChange={e => setFactorId(e.target.value)}>{status.factors.map((f, i) => <option key={f.id} value={f.id}>{f.friendly_name || `Authenticator ${i + 1}`}</option>)}</select></label><label>Six-digit authenticator code<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label><button type="submit">{busy ? 'Verifying...' : 'Verify'}</button></> : <p>Your authentication method requires administrator assistance. Office pages remain locked.</p>}
    </fieldset></form>}
    <button disabled={busy} onClick={() => { setStatus(null); setError(''); setReload(n => n + 1); }}>Retry security check</button>
    <button disabled={busy} onClick={signOut}>Sign Out</button>
  </main>;
}
