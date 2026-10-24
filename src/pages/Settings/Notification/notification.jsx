import { useEffect, useRef, useState } from 'react';
import MainLayout from '../../../layouts/mainLayout';
import OfficeTools from '../../../components/OfficeTools';
import { useAuth } from '../../../context/AuthContext';
import { notificationPreferencesApi } from '../../../services/notificationPreferencesService';
import './notification.css';

const GROUPS = [
  ['Shipment Alerts', [
    ['shipment_status', 'Status Changes', 'Shipment lifecycle updates, including pickup and cancellation notices.'],
    ['delay', 'Delays & Incidents', 'Shipment delays and reported delivery incidents.'],
    ['booking_confirmed', 'Booking Confirmations', 'Confirmation notices for bookings associated with your account.'],
  ]],
  ['Fleet & Compliance', [
    ['assignment', 'Trip Assignments', 'Assignment notices sent to your account.'],
    ['compliance_expiry', 'Document & Permit Expiry', 'Receive compliance notices when generated. Separate warning, expired-document and permit filters are not available.'],
  ]],
  ['Other Notifications', [
    ['payment', 'Payments', 'Payment notices when generated.'],
    ['message', 'Messages', 'Message notices when generated.'],
    ['system', 'System Notices', 'System notices when generated.'],
  ]],
];

export default function Notifications() {
  const { user } = useAuth();
  return <MainLayout><header className="topbar"><h1 style={{ fontSize: 18 }}>Notification Settings</h1><OfficeTools /></header><NotificationPreferences key={user?.id} /></MainLayout>;
}

function NotificationPreferences() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(null);
  const operation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let disposed = false;
    notificationPreferencesApi.load().then(value => {
      if (!disposed) { setSnapshot(value); setLoadError(''); }
    }).catch(error => { if (!disposed) setLoadError(error.message); });
    return () => { disposed = true; };
  }, [reload]);
  function refresh() {
    if (operation.current) return;
    setSnapshot(null); setLoadError(''); setSaveError(''); setFailed(null); setNotice('');
    setReload(value => value + 1);
  }
  async function save(type, enabled) {
    if (operation.current || !snapshot) return;
    operation.current = true; setSaving(type); setSaveError(''); setNotice(''); setFailed(null);
    try {
      const confirmed = await notificationPreferencesApi.save(snapshot.userId, type, enabled);
      if (mounted.current) {
        setSnapshot(previous => ({ ...previous, preferences: { ...previous.preferences, [type]: confirmed } }));
        setNotice('Preference saved. Applies to future in-app notifications.');
      }
    } catch (error) {
      if (mounted.current) { setSaveError(error.message); setFailed({ type, enabled }); }
    } finally { operation.current = false; if (mounted.current) setSaving(null); }
  }
  return <section className="content notification-settings">
    <div className="page-header"><div><h2>Settings — Notifications</h2><p>Choose which future in-app notifications your account receives. Changes save automatically.</p></div></div>
    <p>These preferences do not remove existing notifications or hide operational warnings on the Dashboard and Fleet pages. Enabling a category does not create new alert monitors.</p>
    {notice && <p role="status" className="notification-success">{notice}</p>}
    {saveError && <div role="alert" className="notification-error"><p>{saveError}</p><button disabled={!!saving} onClick={() => save(failed.type, failed.enabled)}>Retry save</button><button disabled={!!saving} onClick={refresh}>Reload preferences</button></div>}
    {loadError ? <div role="alert" className="notification-error"><p>{loadError}</p><button onClick={refresh}>Retry loading</button></div> : !snapshot ? <p role="status">Loading notification preferences…</p> : <>
      <button className="notification-refresh" disabled={!!saving} onClick={refresh}>Reload preferences</button>
      <div className="notification-grid">
        <div className="settings-card"><div className="card-header"><h3>Delivery Channels</h3></div>
          <div className="toggle-row"><div><strong>In-app Notifications</strong><p>Available through the notification bell. Choose categories below.</p></div><span>Available</span></div>
          {['Email Notifications', 'Push Notifications', 'SMS Alerts'].map(label => <div className="toggle-row" key={label}><div><strong>{label}</strong><p>Delivery is not configured.</p></div><button type="button" role="switch" aria-checked={false} aria-label={label} className="toggle inactive" disabled><span className="toggle-circle" /></button></div>)}
        </div>
        {GROUPS.map(([title, items]) => <div className="settings-card" key={title}><div className="card-header"><h3>{title}</h3></div>{items.map(([type, label, description]) => <div className="toggle-row" key={type}><div><strong>{label}</strong><p>{description}</p>{saving === type && <span role="status">Saving…</span>}</div><button type="button" role="switch" aria-label={label} aria-checked={snapshot.preferences[type]} disabled={!!saving} className={`toggle ${snapshot.preferences[type] ? 'active' : 'inactive'}`} onClick={() => save(type, !snapshot.preferences[type])}><span className="toggle-circle" /></button></div>)}</div>)}
        <div className="settings-card"><div className="card-header"><h3>Additional Alerts</h3></div><p>Off-route, cold-chain temperature, maintenance-due and overdue-maintenance alerts are not connected to notification delivery. Their controls are unavailable.</p></div>
      </div>
    </>}
  </section>;
}
