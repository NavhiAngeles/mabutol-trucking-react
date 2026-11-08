import { useEffect, useRef, useState } from 'react';
import SettingsLayout from '../../../components/SettingsLayout';
import { useAuth } from '../../../context/AuthContext';
import { accountApi } from '../../../services/accountService';
import { securityApi } from '../../../services/securityService';
import './security.css';
import '../../../components/accountSecurityDesign.css';

export default function Security() {
  const { user } = useAuth();
  return <SettingsLayout><SecurityDetails key={user?.id} /></SettingsLayout>;
}

function SecurityDetails() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [modal, setModal] = useState(null);
  const [target, setTarget] = useState(null);
  const [setup, setSetup] = useState(null);
  const [phone, setPhone] = useState('');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const guard = useRef(false);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let disposed = false;
    securityApi.load().then(data => { if (!disposed) { setSnapshot(data); setLoadError(''); } })
      .catch(err => { if (!disposed) setLoadError(err.message); });
    return () => { disposed = true; };
  }, [reload]);

  function refresh() { setSnapshot(null); setLoadError(''); setReload(n => n + 1); }
  function clear() { setModal(null); setTarget(null); setSetup(null); setPhone(''); setCurrent(''); setPassword(''); setConfirm(''); setCode(''); setError(''); }
  function open(kind, factor) {
    if (guard.current) return;
    clear();
    setNotice('');
    setModal(kind);
    setTarget(factor || null);
    if (kind === 'enroll') {
      setPhone(snapshot?.twoFactorPhone || snapshot?.phone || '');
    }
  }

  async function perform(action) {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (err) { if (mounted.current) setError(err.message); }
    finally { guard.current = false; if (mounted.current) setBusy(false); }
  }

  function finish(message) { if (!mounted.current) return; clear(); setNotice(message); refresh(); }

  async function submit(event) {
    event.preventDefault();
    await perform(async () => {
      if (modal === 'password') {
        if (password !== confirm) throw new Error('Passwords do not match.');
        await accountApi.changePassword(current, password);
        finish('Password updated successfully.');
      } else if (modal === 'sessions') {
        await accountApi.revokeOthers();
        finish('Other sessions revoked. Existing access tokens may remain valid until expiry. This session remains signed in.');
      } else if (modal === 'enroll' && !setup) {
        // Step 1: Send SMS verification code via TextBee
        const data = securityApi.sendSms2fa ? await securityApi.sendSms2fa(phone) : await securityApi.enroll(phone);
        if (mounted.current) setSetup(data || { phone });
      } else if (modal === 'enroll') {
        // Step 2: Verify SMS OTP code and enable 2FA
        if (securityApi.verifySms2fa) {
          await securityApi.verifySms2fa(setup?.phone || phone, code);
        } else {
          await securityApi.verify(setup?.id || phone, code);
        }
        finish('2FA verified and enabled via TextBee SMS.');
      } else if (modal === 'remove') {
        if (target?.status === 'verified' && target?.factor_type === 'totp' && code) {
          await securityApi.verify(target.id, code);
        }
        if (securityApi.disable2fa) {
          await securityApi.disable2fa(target?.id);
        } else {
          await securityApi.remove(target?.id);
        }
        finish('2FA disabled.');
      }
    });
  }

  async function cancel() {
    await perform(async () => {
      if (setup?.id && securityApi.remove) await securityApi.remove(setup.id);
      if (mounted.current) { clear(); refresh(); }
    });
  }

  const is2faActive = Boolean(snapshot?.twoFactorEnabled || (snapshot?.factors && snapshot.factors.some(f => f.status === 'verified')));
  const phoneDisplay = snapshot?.twoFactorPhone || snapshot?.phone || '';

  return (
    <>
      <section className="content security-settings">
        <div className="page-header">
          <div>
            <h2>Settings — Security</h2>
            <p>Manage your password, Two-Factor Authentication (2FA), and signed-in sessions.</p>
          </div>
        </div>
        {notice && <p role="status" className="pw-success">{notice}</p>}
        {loadError && <p role="alert" className="pw-error">{loadError} <button onClick={refresh}>Retry</button></p>}
        {!snapshot && !loadError && <p role="status">Loading security settings...</p>}
        {error && !modal && <p role="alert" className="pw-error">{error}</p>}
        {snapshot && (
          <div className="security-card-grid">
            <div className="settings-card">
              <h3>Authentication</h3>
              <div className="security-row">
                <div>
                  <strong>Password</strong>
                  <p>Password change date is unavailable.</p>
                </div>
                <button className="primary-btn" onClick={() => open('password')}>Update Password</button>
              </div>
              <div className="security-row">
                <div>
                  <strong>Two-Factor Authentication (2FA)</strong>
                  <p>{is2faActive ? `TextBee SMS 2FA is active${phoneDisplay ? ` (${phoneDisplay})` : ''}` : 'No verified 2FA phone'}</p>
                  <p>SMS verification codes delivered via TextBee are requested before office pages on future sign-ins.</p>
                </div>
                {is2faActive ? (
                  <button className="danger-btn" disabled={busy} onClick={() => open('remove', snapshot.factors?.[0] || { id: 'sms' })}>Disable 2FA</button>
                ) : (
                  <button className="primary-btn" disabled={busy} onClick={() => open('enroll')}>Set Up 2FA</button>
                )}
              </div>
              {snapshot.unsupported && <p>Another verified authentication method exists. Manage that method with your administrator.</p>}
              {snapshot.factors && snapshot.factors.filter(f => f.status === 'verified' && f.factor_type === 'totp').map(factor => (
                <div className="security-row" key={factor.id}>
                  <div>
                    <strong>{factor.friendly_name || 'Authenticator app'}</strong>
                    <p>Verified</p>
                  </div>
                  <button className="danger-btn" onClick={() => open('remove', factor)}>Remove authenticator</button>
                </div>
              ))}
            </div>
            <div className="settings-card">
              <h3>Sessions</h3>
              <p>Signed in as {snapshot.email}.</p>
              <p>Device, location, IP address, and individual session history are unavailable here.</p>
              <p>Signing out other sessions revokes their refresh tokens. Existing access tokens may remain valid until expiry.</p>
              <button className="danger-btn" onClick={() => open('sessions')}>Sign Out Other Sessions</button>
            </div>
            <div className="settings-card">
              <h3>Login Activity</h3>
              <p>Last sign-in: {snapshot.lastSignIn ? new Date(snapshot.lastSignIn).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unavailable'}</p>
              <p>Failed sign-ins and full login history are unavailable here.</p>
              <button onClick={refresh} disabled={busy}>Refresh security settings</button>
            </div>
          </div>
        )}
        {modal && (
          <div className="pw-backdrop">
            <form className="pw-modal" role="dialog" aria-modal="true" aria-labelledby="security-dialog-title" onSubmit={submit}>
              <fieldset disabled={busy}>
                <div className="pw-modal-header">
                  <h3 id="security-dialog-title">
                    {modal === 'password'
                      ? 'Update Password'
                      : modal === 'sessions'
                      ? 'Sign Out Other Sessions'
                      : modal === 'remove'
                      ? 'Disable 2FA'
                      : 'Set Up 2FA (TextBee SMS)'}
                  </h3>
                </div>
                <div className="pw-modal-body">
                  {modal === 'password' && (
                    <>
                      <label>Current password<input className="pw-input" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} /></label>
                      <label>New password<input className="pw-input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></label>
                      <label>Confirm new password<input className="pw-input" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
                    </>
                  )}
                  {modal === 'sessions' && (
                    <p>Revoke other sessions for your account? This session will remain signed in. Existing access tokens may remain valid until expiry.</p>
                  )}
                  {modal === 'enroll' && !setup && (
                    <>
                      <p>Protect your account with SMS verification codes delivered via TextBee. Enter your Philippine mobile phone number below.</p>
                      <label>
                        Philippine Mobile Number
                        <input
                          className="pw-input"
                          type="tel"
                          autoComplete="tel"
                          required
                          placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                        />
                      </label>
                      <p className="security-subtext">A 6-digit verification code will be sent to this phone via TextBee SMS.</p>
                    </>
                  )}
                  {modal === 'enroll' && setup && (
                    <>
                      <p>We sent a 6-digit verification code via TextBee SMS to <strong>{setup.phone || phone}</strong>. Enter the code below to complete 2FA setup.</p>
                      {setup.qr && (
                        <>
                          <img className="security-qr" src={setup.qr} alt="Authenticator enrollment QR code" />
                          <label>Manual setup key<input className="pw-input" readOnly value={setup.secret || ''} autoComplete="off" /></label>
                        </>
                      )}
                      <label>
                        Verification code
                        <input
                          className="pw-input"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                          placeholder="123456"
                          value={code}
                          onChange={e => setCode(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {modal === 'remove' && (
                    <p>Disable SMS Two-Factor Authentication for <strong>{phoneDisplay || 'your account'}</strong>? Your account will no longer require SMS verification codes when signing in.</p>
                  )}
                  {error && <p role="alert" className="pw-error">{error}</p>}
                </div>
                <div className="pw-modal-footer">
                  <button className="pw-update-btn" type="submit">
                    {busy
                      ? 'Working...'
                      : modal === 'enroll' && !setup
                      ? 'Send Verification SMS'
                      : modal === 'enroll'
                      ? 'Verify & Enable 2FA'
                      : modal === 'remove'
                      ? 'Disable 2FA'
                      : 'Confirm'}
                  </button>
                  <button type="button" className="pw-cancel-btn" onClick={cancel}>Cancel</button>
                </div>
              </fieldset>
            </form>
          </div>
        )}
      </section>
    </>
  );
}
