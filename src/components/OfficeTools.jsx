import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { useLiveData } from '../hooks/useLiveData';

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
  async function markRead(notification) {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(notification.id); setSaveError('');
    setFailedNotification(null);
    try {
      const { data: updated, error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notification.id).eq('user_id', user.id).select('id').single();
      if (error || !updated) throw error || new Error('Notification was not updated.');
      refresh();
      if (notification.shipment_id) navigate('/shipment?tab=all&record=' + notification.shipment_id);
    } catch {
      setFailedNotification(notification);
      setSaveError('Unable to mark notification read. Please retry.');
    }
    finally { saveInFlight.current = false; setSaving(null); }
  }
  const unread = data?.notifications.filter(n => !n.read_at).length || 0;
  return <div className="office-tools">
    <button className="icon-btn" aria-expanded={open} onClick={() => setOpen(!open)}>Notifications{unread ? ' (' + unread + ')' : ''}</button>
    <button className="avatar" title={data?.name || 'Account'} onClick={() => navigate('/settings/account')}>{(data?.name || user?.email || 'Account').slice(0, 2).toUpperCase()}</button>
    {open && <section className="office-notifications" aria-label="Notifications">
      <button onClick={() => setOpen(false)}>Close</button>
      {loading && <p role="status">Loading notifications…</p>}
      {(error || saveError) && <p role="alert">{saveError || 'Unable to load notifications.'} <button disabled={!!saving} onClick={() => failedNotification ? markRead(failedNotification) : refresh()}>Retry</button></p>}
      {data && !data.notifications.length && <p>No notifications.</p>}
      {data?.notifications.map(n => <article key={n.id}><strong>{n.title}</strong><p>{n.body}</p><small>{new Date(n.created_at).toLocaleString()}</small><button disabled={!!saving} onClick={() => markRead(n)}>{saving === n.id ? 'Saving…' : n.shipment_id ? 'View shipment' : n.read_at ? 'Read' : 'Mark read'}</button></article>)}
    </section>}
  </div>;
}
