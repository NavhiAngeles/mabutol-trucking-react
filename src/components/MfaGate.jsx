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
    <main className="mfa-challenge">
      <h2>Verify your sign-in</h2>
      {!status && !error && <p role="status">Checking authentication...</p>}
      {error && <p role="alert">{error}</p>}
      {resendNotice && <p role="status" className="mfa-resend-notice">{resendNotice}</p>}
      {status?.required && (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            {status.twoFactorType === 'textbee_sms' || status.phone ? (
              <>
                <p>Enter the six-digit verification code sent via TextBee SMS to your phone{status.phone ? ` (${status.phone})` : ''}.</p>
                <label>
                  Six-digit SMS code
                  <input
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    placeholder="123456"
                  />
                </label>
                <button type="submit">{busy ? 'Verifying...' : 'Verify'}</button>
                <button type="button" onClick={handleResend} disabled={busy}>Resend SMS Code</button>
              </>
            ) : status.factors?.length > 0 ? (
              <>
                <label>
                  Authenticator
                  <select value={factorId} onChange={e => setFactorId(e.target.value)}>
                    {status.factors.map((f, i) => (
                      <option key={f.id} value={f.id}>{f.friendly_name || `Authenticator ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Six-digit authenticator code
                  <input
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </label>
                <button type="submit">{busy ? 'Verifying...' : 'Verify'}</button>
              </>
            ) : (
              <p>Your authentication method requires administrator assistance. Office pages remain locked.</p>
            )}
          </fieldset>
        </form>
      )}
      <button disabled={busy} onClick={() => { setStatus(null); setError(''); setReload(n => n + 1); }}>Retry security check</button>
      <button disabled={busy} onClick={signOut}>Sign Out</button>
    </main>
  );
}
