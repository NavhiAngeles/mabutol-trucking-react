import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { useLiveData } from '../hooks/useLiveData';
import './OfficeTools.css';

const TABLES = ['notifications'];
async function loadOfficeTools() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Please sign in again.');
  const [profile, notifications] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', user.id).single(),
    supabase.from('notifications').select('id,title,body,shipment_id,read_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
  ]);
  if (profile.error || notifications.error) throw profile.error || notifications.error;
  return { name: profile.data.full_name || user.email, notifications: notifications.data };
}
export default function OfficeTools() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, refresh } = useLiveData(loadOfficeTools, TABLES);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [failedNotification, setFailedNotification] = useState(null);
  const saveInFlight = useRef(false);
  const container = useRef(null);
  const bell = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); bell.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  async function markRead(notification) {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(notification.id); setSaveError('');
    setFailedNotification(null);
    try {
      const { data: updated, error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notification.id).eq('user_id', user.id).select('id').single();
      if (error || !updated) throw error || new Error('Notification was not updated.');
      refresh();
      if (notification.shipment_id) { setOpen(false); navigate('/shipment?tab=all&record=' + notification.shipment_id); }
    } catch {
      setFailedNotification(notification);
      setSaveError('Unable to mark notification read. Please retry.');
    }
    finally { saveInFlight.current = false; setSaving(null); }
  }
  const unread = data?.notifications.filter(n => !n.read_at).length || 0;
  return <div className="office-tools" ref={container}>
    <button type="button" className="icon-btn" ref={bell} title="Notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} aria-controls="office-notifications-panel" onClick={() => setOpen(!open)}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
      {unread > 0 && <span className="office-unread-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    <button type="button" className="avatar" aria-label="Open account settings" title={data?.name || 'Account'} onClick={() => navigate('/settings/account')}>{(data?.name || user?.email || 'Account').slice(0, 2).toUpperCase()}</button>
    {open && <section id="office-notifications-panel" className="office-notifications" aria-label="Notifications">
      <div className="office-notifications-header"><div><h2>Notifications</h2><p>{unread ? `${unread} unread in your latest notifications` : 'Your latest updates'}</p></div><button type="button" className="office-notifications-close" aria-label="Close notifications" onClick={() => { setOpen(false); bell.current?.focus(); }}>✕</button></div>
      <div className="office-notifications-list">
      {loading && <p className="office-notification-state" role="status">Loading notifications…</p>}
      {(error || saveError) && <p className="office-notification-error" role="alert">{saveError || 'Unable to load notifications.'} <button type="button" disabled={!!saving} onClick={() => failedNotification ? markRead(failedNotification) : refresh()}>Retry</button></p>}
      {!loading && !error && data && !data.notifications.length && <div className="office-notification-state"><strong>You’re all caught up</strong><p>No notifications.</p></div>}
      {data?.notifications.map(n => <article key={n.id} className={`office-notification${n.read_at ? '' : ' office-notification-unread'}`}>
        <div className="office-notification-title"><strong>{n.title}</strong>{!n.read_at && <span className="office-notification-dot" aria-label="Unread" />}</div>
        {n.body && <p>{n.body}</p>}
        <div className="office-notification-meta"><time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time><button type="button" className="office-notification-action" disabled={!!saving || (!n.shipment_id && !!n.read_at)} onClick={() => markRead(n)}>{saving === n.id ? 'Saving…' : n.shipment_id ? 'View shipment' : n.read_at ? 'Read' : 'Mark read'}</button></div>
      </article>)}
      </div><div className="office-notifications-footer">Latest 30 notifications · Philippine time</div>
    </section>}
  </div>;
}
