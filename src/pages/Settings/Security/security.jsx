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
  function clear() { setModal(null); setTarget(null); setSetup(null); setCurrent(''); setPassword(''); setConfirm(''); setCode(''); setError(''); }
  function open(kind, factor) { if (guard.current) return; clear(); setNotice(''); setModal(kind); setTarget(factor || null); }
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
        const data = await securityApi.enroll();
        if (mounted.current) setSetup(data);
      } else if (modal === 'enroll') {
        await securityApi.verify(setup.id, code);
        finish('Authenticator verified and enabled.');
      } else if (modal === 'remove') {
        if (target.status === 'verified') await securityApi.verify(target.id, code);
        await securityApi.remove(target.id);
        finish('Authenticator removed.');
      }
    });
  }
  async function cancel() {
    await perform(async () => {
      if (setup) await securityApi.remove(setup.id);
      if (mounted.current) { clear(); refresh(); }
    });
  }
  const verified = snapshot?.factors.filter(f => f.status === 'verified') || [];
  return <><section className="content security-settings">
    <div className="page-header"><div><h2>Settings — Security</h2><p>Manage your password, authenticator, and signed-in sessions.</p></div></div>
    {notice && <p role="status" className="pw-success">{notice}</p>}
    {loadError && <p role="alert" className="pw-error">{loadError} <button onClick={refresh}>Retry</button></p>}
    {!snapshot && !loadError && <p role="status">Loading security settings...</p>}
    {error && !modal && <p role="alert" className="pw-error">{error}</p>}
    {snapshot && <div className="security-card-grid">
      <div className="settings-card"><h3>Authentication</h3>
        <div className="security-row"><div><strong>Password</strong><p>Password change date is unavailable.</p></div><button className="primary-btn" onClick={() => open('password')}>Update Password</button></div>
        <div className="security-row"><div><strong>Two-Factor Authentication (2FA)</strong><p>{verified.length ? 'Authenticator enabled' : 'No verified authenticator'}</p><p>Authenticator codes are requested before office pages on future sign-ins. Keep access to your authenticator; self-service recovery is unavailable.</p></div>
          <button className="primary-btn" disabled={busy || verified.length > 0 || snapshot.factors.some(f => f.status !== 'verified')} onClick={() => open('enroll')}>Set Up Authenticator</button></div>
        {snapshot.unsupported && <p>Another verified authentication method exists. Manage that method with your administrator.</p>}
        {snapshot.factors.map(factor => <div className="security-row" key={factor.id}><div><strong>{factor.friendly_name || 'Authenticator app'}</strong><p>{factor.status === 'verified' ? 'Verified' : 'Setup incomplete - remove this entry before starting again'}</p></div><button className="danger-btn" onClick={() => open('remove', factor)}>Remove authenticator</button></div>)}
      </div>
      <div className="settings-card"><h3>Sessions</h3><p>Signed in as {snapshot.email}.</p><p>Device, location, IP address, and individual session history are unavailable here.</p><p>Signing out other sessions revokes their refresh tokens. Existing access tokens may remain valid until expiry.</p><button className="danger-btn" onClick={() => open('sessions')}>Sign Out Other Sessions</button></div>
      <div className="settings-card"><h3>Login Activity</h3><p>Last sign-in: {snapshot.lastSignIn ? new Date(snapshot.lastSignIn).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unavailable'}</p><p>Failed sign-ins and full login history are unavailable here.</p><button onClick={refresh} disabled={busy}>Refresh security settings</button></div>
    </div>}
    {modal && <div className="pw-backdrop"><form className="pw-modal" role="dialog" aria-modal="true" aria-labelledby="security-dialog-title" onSubmit={submit}>
      <fieldset disabled={busy}><div className="pw-modal-header"><h3 id="security-dialog-title">{modal === 'password' ? 'Update Password' : modal === 'sessions' ? 'Sign Out Other Sessions' : modal === 'remove' ? 'Remove Authenticator' : 'Set Up Authenticator'}</h3></div>
      <div className="pw-modal-body">
        {modal === 'password' && <><label>Current password<input className="pw-input" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} /></label><label>New password<input className="pw-input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></label><label>Confirm new password<input className="pw-input" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label></>}
        {modal === 'sessions' && <p>Revoke other sessions for your account? This session will remain signed in. Existing access tokens may remain valid until expiry.</p>}
        {modal === 'enroll' && !setup && <p>Use an authenticator app to scan the QR code, then enter its six-digit code to finish setup. Enabling requires a verified code.</p>}
        {modal === 'enroll' && setup && <><p>Scan this QR code in your authenticator app. Keep this setup key private.</p><img className="security-qr" src={setup.qr} alt="Authenticator enrollment QR code" /><label>Manual setup key<input className="pw-input" readOnly value={setup.secret || ''} autoComplete="off" /></label></>}
        {modal === 'remove' && <p>Remove this authenticator from your account? {target.status === 'verified' ? 'Verify a fresh code to confirm removal.' : 'This setup was never verified.'}</p>}
        {((modal === 'enroll' && setup) || (modal === 'remove' && target.status === 'verified')) && <label>Authenticator code<input className="pw-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} /></label>}
        {error && <p role="alert" className="pw-error">{error}</p>}
      </div><div className="pw-modal-footer"><button className="pw-update-btn" type="submit">{busy ? 'Working...' : modal === 'enroll' && !setup ? 'Generate Setup Code' : 'Confirm'}</button><button type="button" className="pw-cancel-btn" onClick={cancel}>Cancel</button></div></fieldset>
    </form></div>}
  </section></>;
}
