import { useEffect, useRef, useState } from 'react';
import SettingsLayout from '../../../components/SettingsLayout';
import { useAuth } from '../../../context/AuthContext';
import { accountApi } from '../../../services/accountService';
import './account.css';

const dateLabel = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unavailable';

export default function Account() {
  const { user } = useAuth();
  return <SettingsLayout><AccountDetails key={user?.id} /></SettingsLayout>;
}

function AccountDetails() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ fullName: '', contact: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const operation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let disposed = false;
    const load = () => accountApi.load().then(value => {
      if (!disposed) { setProfile(value); setError(''); }
    }).catch(cause => { if (!disposed) setError(cause.message); });
    load();
    // Refresh signed photo URLs and recover changes made in another tab.
    const timer = setInterval(load, 30 * 60 * 1000);
    window.addEventListener('focus', load);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [reload]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function open(kind) {
    setForm({ fullName: profile.full_name || '', contact: profile.phone || '' });
    setFile(null); setPreview(null); setPasswords({ current: '', next: '', confirm: '' });
    setActionError(''); setSuccess(''); setModal(kind);
  }
  function close() {
    if (operation.current) return;
    setModal(null); setFile(null); setPreview(null);
    setPasswords({ current: '', next: '', confirm: '' }); setActionError('');
  }
  async function submit(event) {
    event.preventDefault();
    if (operation.current) return;
    if (modal === 'password' && passwords.next !== passwords.confirm) { setActionError('Passwords do not match.'); return; }
    operation.current = true; setBusy(true); setActionError('');
    try {
      if (modal === 'profile') {
        const saved = await accountApi.save(form, file, profile.updated_at);
        if (mounted.current) setProfile(saved);
      } else if (modal === 'password') await accountApi.changePassword(passwords.current, passwords.next);
      else await accountApi.revokeOthers();
      if (mounted.current) {
        setSuccess(modal === 'profile' ? 'Profile saved.' : modal === 'password' ? 'Password updated.' : 'Other sessions revoked. Existing access may continue until their access tokens expire.');
        setModal(null); setFile(null); setPreview(null); setPasswords({ current: '', next: '', confirm: '' });
      }
    } catch (cause) { if (mounted.current) setActionError(cause.message); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  if (!profile) return <section className="content"><div className="page-header"><div><h2>Settings — Account</h2><p>Manage your personal details and account security.</p></div></div>{error ? <><p role="alert">{error}</p><button onClick={() => setReload(value => value + 1)}>Retry</button></> : <p role="status">Loading account…</p>}</section>;
  const initials = (profile.full_name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  return <section className="content">
    <div className="page-header"><div><h2>Settings — Account</h2><p>Manage your personal details and account security.</p></div></div>
    {error && <p role="alert" className="pw-error">{error} <button onClick={() => setReload(value => value + 1)}>Retry</button></p>}
    {success && <p role="status" className="pw-success">{success}</p>}
    <div className="settings-grid">
      <div className="left-column">
        <div className="settings-card">
          <div className="card-header ep-card-header"><h3>Profile Information</h3><button className="primary-btn" onClick={() => open('profile')}>Edit Profile</button></div>
          <div className="profile-layout">
            <div className="avatar-box">{profile.photo ? <img src={profile.photo} alt="Your profile" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 18 }} /> : initials}</div>
            <div className="profile-info">
              <div className="info-group"><label>FULL NAME</label><span>{profile.full_name || 'Not set'}</span></div>
              <div className="info-group"><label>EMAIL ADDRESS</label><span>{profile.email}</span><p className="field-hint">Contact support to change your email.</p></div>
              <div className="info-group"><label>ROLE</label><span className="role-badge">{profile.role}</span></div>
            </div>
            <div className="profile-info"><div className="info-group"><label>CONTACT NUMBER</label><span>{profile.phone || 'Not set'}</span></div></div>
          </div><div className="card-bottom-accent" />
        </div>
        <div className="settings-card"><div className="card-header"><h3>Password & Authentication</h3></div>
          <p>Your current password strength and last change date are unavailable. Use a strong, unique password.</p>
          <button className="primary-btn" onClick={() => open('password')}>Change Password</button>
        </div>
      </div>
      <div className="right-column"><div className="settings-card">
        <div className="card-header"><h3>Login & Security</h3></div>
        <div className="section-label">Last Account Sign-in</div><div className="security-box"><strong>{dateLabel(profile.lastSignIn)}</strong><span>Philippine time. Device and location details are unavailable.</span></div>
        <div className="section-label" style={{ marginTop: 20 }}>Other Sessions</div><div className="session-box"><span>Other device sessions cannot be listed here. You can sign out all other sessions below.</span></div>
        <button className="logout-btn" onClick={() => open('sessions')}>Log Out All Other Sessions</button>
        <div className="account-details-box"><div className="section-label">ACCOUNT DETAILS</div>
          <div className="ad-row"><span>Account ID:</span><strong style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{profile.id}</strong></div>
          <div className="ad-row"><span>Member Since:</span><strong>{dateLabel(profile.created_at)}</strong></div>
        </div>
      </div></div>
    </div>
    {modal && <div className="ep-backdrop" onClick={close}><form className="ep-modal" role="dialog" aria-modal="true" aria-label={modal === 'profile' ? 'Edit profile' : modal === 'password' ? 'Change password' : 'Log out other sessions'} onClick={event => event.stopPropagation()} onSubmit={submit}>
      <div className="ep-modal-header"><h3 className="ep-modal-title">{modal === 'profile' ? 'Edit Profile Information' : modal === 'password' ? 'Change Password' : 'Log Out Other Sessions?'}</h3><button type="button" className="ep-close-btn" disabled={busy} onClick={close} aria-label="Close">✕</button></div>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}><div className="ep-modal-body">
        {modal === 'profile' && <>
          <div className="ep-photo-row">{(preview || profile.photo) && <img className="ep-photo-preview" style={{ width: 64, height: 64, objectFit: 'cover' }} src={preview || profile.photo} alt="Profile preview" />}<label className="ep-label">PHOTO (JPG OR PNG, MAX 2MB)<input type="file" accept="image/jpeg,image/png" onChange={event => {
            const selected = event.target.files[0];
            if (selected && (!['image/jpeg', 'image/png'].includes(selected.type) || selected.size <= 0 || selected.size > 2097152)) { setActionError('Choose a JPG or PNG photo under 2MB.'); event.target.value = ''; return; }
            setFile(selected || null); setPreview(selected ? URL.createObjectURL(selected) : null); setActionError('');
          }} /></label></div>
          <label className="ep-field-group"><span className="ep-label">FULL NAME</span><input className="ep-input" required maxLength={200} value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} /></label>
          <label className="ep-field-group"><span className="ep-label">EMAIL ADDRESS</span><input className="ep-input ep-input--muted" value={profile.email || ''} readOnly /></label>
          <label className="ep-field-group"><span className="ep-label">CONTACT NUMBER</span><input className="ep-input" type="tel" maxLength={40} value={form.contact} onChange={event => setForm({ ...form, contact: event.target.value })} /></label>
          <label className="ep-field-group"><span className="ep-label">ROLE</span><input className="ep-input ep-input--role" value={profile.role} readOnly /></label>
        </>}
        {modal === 'password' && <>{[['current', 'CURRENT PASSWORD'], ['next', 'NEW PASSWORD'], ['confirm', 'CONFIRM NEW PASSWORD']].map(([key, label]) => <label key={key} className="ep-field-group"><span className="ep-label">{label}</span><input type="password" className="ep-input" required minLength={key === 'current' ? undefined : 8} autoComplete={key === 'current' ? 'current-password' : 'new-password'} value={passwords[key]} onChange={event => setPasswords({ ...passwords, [key]: event.target.value })} /></label>)}<p className="field-hint">Use at least 8 characters. Your current password is verified before the update.</p></>}
        {modal === 'sessions' && <p>This signs out all devices and browsers except this session. Other devices may retain access until their current access tokens expire.</p>}
        {actionError && <p className="pw-error" role="alert">{actionError}</p>}
      </div><div className="ep-modal-footer"><button type="button" className="ep-cancel-btn" onClick={close}>Cancel</button><button type="submit" className="ep-save-btn">{busy ? 'Saving…' : modal === 'profile' ? 'Save Changes' : modal === 'password' ? 'Update Password' : 'Log Out Other Sessions'}</button></div></fieldset>
    </form></div>}
  </section>;
}
