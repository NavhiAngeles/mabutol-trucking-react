import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { useLiveData } from '../hooks/useLiveData';
import './OfficeTools.css';

const TABLES = [
  'notifications',
  'delivery_messages',
  'shipments',
  'delivery_incidents',
  'delivery_expenses',
  'shipment_events',
];

const dismissedSyntheticIds = new Set();

function getPersistedReadIds(userId) {
  try {
    if (typeof localStorage === 'undefined' || !userId) return new Set();
    const raw = localStorage.getItem(`mabutol_office_read_notifs_${userId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistReadId(userId, id) {
  try {
    if (typeof localStorage === 'undefined' || !userId || !id) return;
    const set = getPersistedReadIds(userId);
    set.add(String(id));
    localStorage.setItem(`mabutol_office_read_notifs_${userId}`, JSON.stringify([...set]));
  } catch {
    // Non-blocking
  }
}

function persistReadIds(userId, ids) {
  try {
    if (typeof localStorage === 'undefined' || !userId || !ids?.length) return;
    const set = getPersistedReadIds(userId);
    for (const id of ids) set.add(String(id));
    localStorage.setItem(`mabutol_office_read_notifs_${userId}`, JSON.stringify([...set]));
  } catch {
    // Non-blocking
  }
}

async function loadOfficeTools(client = supabase) {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error('Please sign in again.');

  const [
    profileResult,
    notificationsResult,
    driverMessagesResult,
    messageReadsResult,
    unreadThreadsResult,
    mobileBookingsResult,
    incidentsResult,
    expensesResult,
  ] = await Promise.allSettled([
    client.from('users').select('full_name').eq('id', user.id).single(),
    client
      .from('notifications')
      .select('id,title,body,shipment_id,read_at,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
    client
      .from('delivery_messages')
      .select('id,delivery_id,driver_id,sender_role,body,created_at')
      .eq('sender_role', 'driver')
      .order('created_at', { ascending: false })
      .limit(20),
    client
      .from('delivery_message_reads')
      .select('message_id')
      .eq('user_id', user.id),
    client.rpc('delivery_conversation_unread'),
    client
      .from('shipments')
      .select('id,tracking_number,cargo_description,created_at')
      .eq('booking_source', 'mobile')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10),
    client
      .from('delivery_incidents')
      .select('id,shipment_id,category,description,created_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
    client
      .from('delivery_expenses')
      .select('id,amount,category,created_at,delivery_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (profileResult.status === 'rejected' && notificationsResult.status === 'rejected') {
    throw new Error('Please sign in again.');
  }

  const profile = profileResult.status === 'fulfilled' && !profileResult.value.error ? profileResult.value.data : null;
  const dbNotifications = notificationsResult.status === 'fulfilled' && !notificationsResult.value.error && Array.isArray(notificationsResult.value.data)
    ? notificationsResult.value.data
    : [];

  const combined = [...dbNotifications];
  const knownKeys = new Set(dbNotifications.map(n => `${n.shipment_id || ''}:${n.title}`));
  const persistedReads = getPersistedReadIds(user.id);

  // Track read receipts for delivery messages
  const readMessageIds = new Set();
  if (messageReadsResult.status === 'fulfilled' && !messageReadsResult.value.error && Array.isArray(messageReadsResult.value.data)) {
    for (const r of messageReadsResult.value.data) {
      if (r.message_id != null) readMessageIds.add(String(r.message_id));
    }
  }

  // 1. Driver messages from mobile
  let processedDriverMessages = false;
  if (driverMessagesResult.status === 'fulfilled' && !driverMessagesResult.value.error && Array.isArray(driverMessagesResult.value.data) && driverMessagesResult.value.data.length > 0) {
    const rawMessages = driverMessagesResult.value.data;
    const deliveryIds = [...new Set(rawMessages.map(m => m.delivery_id).filter(Boolean))];
    let deliveryShipments = {};
    let shipmentTrackings = {};

    if (deliveryIds.length > 0) {
      try {
        const { data: dels } = await client.from('deliveries').select('id,shipment_id').in('id', deliveryIds);
        if (Array.isArray(dels)) {
          deliveryShipments = Object.fromEntries(dels.map(d => [d.id, d.shipment_id]));
          const shipmentIds = [...new Set(dels.map(d => d.shipment_id).filter(Boolean))];
          if (shipmentIds.length > 0) {
            const { data: ships } = await client.from('shipments').select('id,tracking_number').in('id', shipmentIds);
            if (Array.isArray(ships)) {
              shipmentTrackings = Object.fromEntries(ships.map(s => [s.id, s.tracking_number]));
            }
          }
        }
      } catch {
        // Non-blocking metadata lookup
      }
    }

    for (const m of rawMessages) {
      const key = `msg-${m.id}`;
      const isRead = readMessageIds.has(String(m.id)) ||
                     persistedReads.has(key) ||
                     persistedReads.has(`msg-${m.id}`) ||
                     dismissedSyntheticIds.has(key);

      const shipmentId = deliveryShipments[m.delivery_id] || null;
      const tracking = (shipmentId && shipmentTrackings[shipmentId]) || null;
      const title = tracking ? `Driver message · ${tracking}` : 'Driver message';
      const msgKey = `${shipmentId || ''}:${title}:${m.id}`;
      const alreadyInDb = knownKeys.has(`${shipmentId || ''}:${title}`) || knownKeys.has(`${shipmentId || ''}:Driver message`);

      if (!alreadyInDb && !knownKeys.has(msgKey)) {
        knownKeys.add(msgKey);
        combined.push({
          id: key,
          synthetic: true,
          type: 'message',
          title,
          body: m.body ? (m.body.length > 140 ? `${m.body.slice(0, 137)}…` : m.body) : 'Driver sent a message.',
          shipment_id: shipmentId,
          delivery_id: m.delivery_id,
          message_id: m.id,
          read_at: isRead ? m.created_at : null,
          created_at: m.created_at,
        });
      }
    }
    processedDriverMessages = true;
  }

  // Fallback to conversation threads if direct delivery_messages table returned no messages
  if (!processedDriverMessages && unreadThreadsResult.status === 'fulfilled' && !unreadThreadsResult.value.error && Array.isArray(unreadThreadsResult.value.data)) {
    const unreadThreads = unreadThreadsResult.value.data.filter(t => Number(t.unread) > 0);
    if (unreadThreads.length) {
      const deliveryIds = unreadThreads.map(t => t.delivery_id).filter(Boolean);
      let deliveryShipments = {};
      if (deliveryIds.length) {
        try {
          const { data: dels } = await client.from('deliveries').select('id,shipment_id').in('id', deliveryIds);
          if (Array.isArray(dels)) {
            deliveryShipments = Object.fromEntries(dels.map(d => [d.id, d.shipment_id]));
          }
        } catch {
          // Non-blocking
        }
      }
      for (const thread of unreadThreads) {
        const shipmentId = deliveryShipments[thread.delivery_id] || null;
        const key = `msg-${thread.delivery_id}`;
        const isRead = persistedReads.has(key) || dismissedSyntheticIds.has(key);
        const title = `Driver message · ${thread.tracking_number || 'Shipment'}`;
        if (!knownKeys.has(`${shipmentId || ''}:${title}`)) {
          combined.push({
            id: key,
            synthetic: true,
            type: 'message',
            title,
            body: `${thread.unread} unread message${Number(thread.unread) > 1 ? 's' : ''} from driver.`,
            shipment_id: shipmentId,
            delivery_id: thread.delivery_id,
            read_at: isRead ? new Date().toISOString() : null,
            created_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  // 2. Pending customer mobile bookings
  if (mobileBookingsResult.status === 'fulfilled' && Array.isArray(mobileBookingsResult.value.data)) {
    for (const b of mobileBookingsResult.value.data) {
      const key = `booking-${b.id}`;
      const isRead = persistedReads.has(key) || dismissedSyntheticIds.has(key);
      const title = `New customer booking · ${b.tracking_number || 'Pending'}`;
      if (!knownKeys.has(`${b.id}:${title}`)) {
        combined.push({
          id: key,
          synthetic: true,
          type: 'booking_confirmed',
          title,
          body: `Customer requested booking for ${b.cargo_description || 'General Cargo'}. Awaiting office review.`,
          shipment_id: b.id,
          read_at: isRead ? b.created_at : null,
          created_at: b.created_at,
        });
      }
    }
  }

  // 3. Unresolved delivery incidents from drivers
  if (incidentsResult.status === 'fulfilled' && Array.isArray(incidentsResult.value.data)) {
    for (const inc of incidentsResult.value.data) {
      const key = `incident-${inc.id}`;
      const isRead = persistedReads.has(key) || dismissedSyntheticIds.has(key);
      const title = `Delivery incident · ${inc.category ? inc.category.replace('_', ' ') : 'Reported'}`;
      if (!knownKeys.has(`${inc.shipment_id}:${title}`)) {
        combined.push({
          id: key,
          synthetic: true,
          type: 'delay',
          title,
          body: inc.description || 'Driver reported an incident on this delivery.',
          shipment_id: inc.shipment_id,
          read_at: isRead ? inc.created_at : null,
          created_at: inc.created_at,
        });
      }
    }
  }

  // 4. Pending delivery expenses from drivers
  if (expensesResult.status === 'fulfilled' && Array.isArray(expensesResult.value.data)) {
    const expenses = expensesResult.value.data;
    const deliveryIds = expenses.map(e => e.delivery_id).filter(Boolean);
    let deliveryShipments = {};
    if (deliveryIds.length) {
      try {
        const { data: dels } = await client.from('deliveries').select('id,shipment_id').in('id', deliveryIds);
        if (Array.isArray(dels)) {
          deliveryShipments = Object.fromEntries(dels.map(d => [d.id, d.shipment_id]));
        }
      } catch {
        // Non-blocking
      }
    }
    for (const exp of expenses) {
      const key = `expense-${exp.id}`;
      const shipmentId = deliveryShipments[exp.delivery_id] || null;
      const isRead = persistedReads.has(key) || dismissedSyntheticIds.has(key);
      const title = `Delivery expense review · ${exp.category ? exp.category.replace('_', ' ') : 'Expense'}`;
      if (!knownKeys.has(`${shipmentId || ''}:${title}`)) {
        combined.push({
          id: key,
          synthetic: true,
          type: 'payment',
          title,
          body: `Driver submitted expense of ₱${Number(exp.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`,
          shipment_id: shipmentId,
          read_at: isRead ? exp.created_at : null,
          created_at: exp.created_at,
        });
      }
    }
  }

  combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return {
    name: profile?.full_name || user.email,
    notifications: combined.slice(0, 30),
  };
}

export default function OfficeTools() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, refresh } = useLiveData(loadOfficeTools, TABLES);
  const [open, setOpen] = useState(false);
  const [locallyReadIds, setLocallyReadIds] = useState(new Set());
  const [saving, setSaving] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [failedNotification, setFailedNotification] = useState(null);
  const [failedAction, setFailedAction] = useState(null);
  const saveInFlight = useRef(false);
  const container = useRef(null);
  const bell = useRef(null);

  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); bell.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function markRead(notification) {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(notification.id);
    setSaveError('');
    setFailedNotification(null);
    setFailedAction(null);
    try {
      persistReadId(user.id, notification.id);
      if (notification.message_id) {
        persistReadId(user.id, `msg-${notification.message_id}`);
        try {
          const readsTable = supabase.from('delivery_message_reads');
          if (typeof readsTable?.insert === 'function') {
            await readsTable.insert({
              message_id: notification.message_id,
              user_id: user.id,
            });
          }
        } catch {
          // Non-blocking write to read-receipt table
        }
      }
      if (notification.synthetic) {
        dismissedSyntheticIds.add(notification.id);
      } else {
        const { data: updated, error } = await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', notification.id)
          .eq('user_id', user.id)
          .select('id')
          .single();
        if (error || !updated) throw error || new Error('Notification was not updated.');
      }
      notification.read_at = new Date().toISOString();
      setLocallyReadIds(new Set([...(locallyReadIds?.values ? locallyReadIds.values() : []), notification.id]));
      refresh();
      if (notification.shipment_id) {
        setOpen(false);
        navigate('/shipment?tab=all&record=' + notification.shipment_id);
      }
    } catch {
      setFailedNotification(notification);
      setFailedAction('single');
      setSaveError('Unable to mark notification read. Please retry.');
    } finally {
      saveInFlight.current = false;
      setSaving(null);
    }
  }

  async function markAllAsRead() {
    if (saveInFlight.current || !data?.notifications?.length) return;
    const unreadList = data.notifications.filter(n => !n.read_at && !(locallyReadIds?.has && locallyReadIds.has(n.id)));
    if (!unreadList.length) return;

    saveInFlight.current = true;
    setSaving('all');
    setSaveError('');
    setFailedNotification(null);
    setFailedAction(null);
    try {
      const unreadDbIds = unreadList.filter(n => !n.synthetic).map(n => n.id);
      const unreadMsgIds = unreadList.filter(n => n.message_id).map(n => n.message_id);
      const syntheticIds = unreadList.filter(n => n.synthetic).map(n => n.id);

      for (const id of syntheticIds) dismissedSyntheticIds.add(id);
      persistReadIds(user.id, unreadList.map(n => n.id));
      for (const mid of unreadMsgIds) persistReadId(user.id, `msg-${mid}`);

      if (unreadDbIds.length > 0) {
        let q = supabase.from('notifications').update({ read_at: new Date().toISOString() });
        if (typeof q?.in === 'function') {
          q = q.in('id', unreadDbIds);
        }
        if (typeof q?.eq === 'function') {
          q = q.eq('user_id', user.id);
        }
        const res = await q;
        if (res && res.error) throw res.error;
      }

      if (unreadMsgIds.length > 0) {
        try {
          const readsTable = supabase.from('delivery_message_reads');
          if (typeof readsTable?.insert === 'function') {
            const rows = unreadMsgIds.map(mid => ({ message_id: mid, user_id: user.id }));
            await readsTable.insert(rows);
          }
        } catch {
          // Non-blocking
        }
      }

      const now = new Date().toISOString();
      unreadList.forEach(n => { n.read_at = now; });
      setLocallyReadIds(new Set([...(locallyReadIds?.values ? locallyReadIds.values() : []), ...unreadList.map(n => n.id)]));
      refresh();
    } catch {
      setFailedAction('all');
      setSaveError('Unable to mark all notifications read. Please retry.');
    } finally {
      saveInFlight.current = false;
      setSaving(null);
    }
  }

  const unread = data?.notifications.filter(n => !n.read_at && !(locallyReadIds?.has && locallyReadIds.has(n.id))).length || 0;

  return (
    <div className="office-tools" ref={container}>
      <button
        type="button"
        className="icon-btn"
        ref={bell}
        title="Notifications"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-controls="office-notifications-panel"
        onClick={() => setOpen(!open)}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unread > 0 && <span className="office-unread-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <button
        type="button"
        className="avatar"
        aria-label="Open account settings"
        title={data?.name || 'Account'}
        onClick={() => navigate('/settings/account')}
      >
        {(data?.name || user?.email || 'Account').slice(0, 2).toUpperCase()}
      </button>
      {open && (
        <section id="office-notifications-panel" className="office-notifications" aria-label="Notifications">
          <div className="office-notifications-header">
            <div className="office-notifications-header-main">
              <h2>Notifications</h2>
              <p>{unread ? `${unread} unread in your latest notifications` : 'Your latest updates'}</p>
            </div>
            <div className="office-notifications-header-actions">
              <button
                type="button"
                className="office-notifications-tool-btn"
                title="Refresh notifications"
                aria-label="Refresh notifications"
                disabled={loading || !!saving}
                onClick={() => refresh()}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
                <span>Refresh</span>
              </button>
              {unread > 0 && (
                <button
                  type="button"
                  className="office-notifications-tool-btn office-notifications-mark-read"
                  title="Mark all notifications as read"
                  aria-label="Mark all read"
                  disabled={loading || !!saving}
                  onClick={markAllAsRead}
                >
                  {saving === 'all' ? 'Saving…' : 'Mark all read'}
                </button>
              )}
              <button
                type="button"
                className="office-notifications-close"
                aria-label="Close notifications"
                onClick={() => { setOpen(false); bell.current?.focus(); }}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="office-notifications-list">
            {loading && <p className="office-notification-state" role="status">Loading notifications…</p>}
            {(error || saveError) && (
              <p className="office-notification-error" role="alert">
                {saveError || 'Unable to load notifications.'}{' '}
                <button
                  type="button"
                  disabled={!!saving}
                  onClick={() => (
                    failedAction === 'all'
                      ? markAllAsRead()
                      : failedNotification
                        ? markRead(failedNotification)
                        : refresh()
                  )}
                >
                  Retry
                </button>
              </p>
            )}
            {!loading && !error && data && !data.notifications.length && (
              <div className="office-notification-state">
                <strong>You’re all caught up</strong>
                <p>No notifications.</p>
              </div>
            )}
            {data?.notifications.map(n => {
              const isRead = !!n.read_at || Boolean(locallyReadIds?.has && locallyReadIds.has(n.id));
              return (
                <article key={n.id} className={`office-notification${isRead ? '' : ' office-notification-unread'}`}>
                  <div className="office-notification-title">
                    <strong>{n.title}</strong>
                    {!isRead && <span className="office-notification-dot" aria-label="Unread" />}
                  </div>
                  {n.body && <p>{n.body}</p>}
                  <div className="office-notification-meta">
                    <time dateTime={n.created_at}>
                      {new Date(n.created_at).toLocaleString('en-PH', {
                        timeZone: 'Asia/Manila',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </time>
                    <button
                      type="button"
                      className="office-notification-action"
                      disabled={!!saving || (!n.shipment_id && isRead)}
                      onClick={() => markRead(n)}
                    >
                      {saving === n.id ? 'Saving…' : n.shipment_id ? 'View shipment' : isRead ? 'Read' : 'Mark read'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="office-notifications-footer">Latest 30 notifications · Philippine time</div>
        </section>
      )}
    </div>
  );
}
