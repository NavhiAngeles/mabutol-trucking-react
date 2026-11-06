import { supabase } from './supabaseClient.js';

export const OFFICE_NOTIFICATION_TABLES = [
  'notifications',
  'delivery_messages',
  'shipments',
  'delivery_incidents',
  'delivery_expenses',
  'shipment_events',
];

export const dismissedSyntheticIds = new Set();

export function getPersistedReadIds(userId) {
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

export function persistReadId(userId, id) {
  try {
    if (typeof localStorage === 'undefined' || !userId || !id) return;
    const set = getPersistedReadIds(userId);
    set.add(String(id));
    localStorage.setItem(`mabutol_office_read_notifs_${userId}`, JSON.stringify([...set]));
  } catch {
    // Non-blocking
  }
}

export function persistReadIds(userId, ids) {
  try {
    if (typeof localStorage === 'undefined' || !userId || !ids?.length) return;
    const set = getPersistedReadIds(userId);
    for (const id of ids) set.add(String(id));
    localStorage.setItem(`mabutol_office_read_notifs_${userId}`, JSON.stringify([...set]));
  } catch {
    // Non-blocking
  }
}

export async function loadOfficeNotifications(client = supabase) {
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

export async function dismissNotification(notification, userId, client = supabase) {
  persistReadId(userId, notification.id);
  if (notification.message_id) {
    persistReadId(userId, `msg-${notification.message_id}`);
    try {
      const readsTable = client.from('delivery_message_reads');
      if (typeof readsTable?.insert === 'function') {
        await readsTable.insert({
          message_id: notification.message_id,
          user_id: userId,
        });
      }
    } catch {
      // Non-blocking write to read-receipt table
    }
  }

  if (notification.synthetic) {
    dismissedSyntheticIds.add(notification.id);
    return { id: notification.id };
  }
  const { data: updated, error } = await client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notification.id)
    .eq('user_id', userId)
    .select('id')
    .single();
  if (error || !updated) throw error || new Error('Notification was not updated.');
  return updated;
}

export async function markAllOfficeNotificationsRead(notifications, userId, client = supabase) {
  if (!notifications?.length || !userId) return;
  const unreadList = notifications.filter(n => !n.read_at);
  if (!unreadList.length) return;

  const unreadDbIds = unreadList.filter(n => !n.synthetic).map(n => n.id);
  const unreadMsgIds = unreadList.filter(n => n.message_id).map(n => n.message_id);
  const syntheticIds = unreadList.filter(n => n.synthetic).map(n => n.id);

  for (const id of syntheticIds) dismissedSyntheticIds.add(id);
  persistReadIds(userId, unreadList.map(n => n.id));

  if (unreadDbIds.length > 0) {
    try {
      const q = client.from('notifications').update({ read_at: new Date().toISOString() });
      if (typeof q?.in === 'function') {
        await q.in('id', unreadDbIds).eq('user_id', userId);
      } else if (typeof q?.eq === 'function') {
        await q.eq('user_id', userId);
      }
    } catch {
      // Non-blocking
    }
  }

  if (unreadMsgIds.length > 0) {
    try {
      const readsTable = client.from('delivery_message_reads');
      if (typeof readsTable?.insert === 'function') {
        const rows = unreadMsgIds.map(mid => ({ message_id: mid, user_id: userId }));
        await readsTable.insert(rows);
      }
    } catch {
      // Non-blocking
    }
  }

  const now = new Date().toISOString();
  unreadList.forEach(n => { n.read_at = now; });
}
