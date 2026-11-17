function unwrapRelation(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function compareThreadOrder(a, b) {
  const aUnread = Number(a.unread) > 0 ? 1 : 0;
  const bUnread = Number(b.unread) > 0 ? 1 : 0;
  if (aUnread !== bUnread) return bUnread - aUnread;

  const aTime = a.last_message_at ? Date.parse(a.last_message_at) : NaN;
  const bTime = b.last_message_at ? Date.parse(b.last_message_at) : NaN;
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return bTime - aTime;
  }
  if (Number.isFinite(bTime) && !Number.isFinite(aTime)) return 1;
  if (Number.isFinite(aTime) && !Number.isFinite(bTime)) return -1;

  if (a.last_message_id && b.last_message_id && a.last_message_id !== b.last_message_id) {
    try {
      const diff = BigInt(b.last_message_id) - BigInt(a.last_message_id);
      if (diff !== 0n) return diff > 0n ? 1 : -1;
    } catch {
      return String(b.last_message_id).localeCompare(String(a.last_message_id));
    }
  }

  return String(a.tracking_number || '').localeCompare(String(b.tracking_number || ''));
}

async function fetchThreadsFromDeliveries(client) {
  const { data, error } = await client
    .from('deliveries')
    .select(
      'id,driver_id,status,shipment:shipments(tracking_number,status),driver:drivers(full_name),delivery_messages!inner(id,driver_id,sender_role,body,created_at)'
    )
    .order('updated_at', { ascending: false })
    .order('id', { referencedTable: 'delivery_messages', ascending: false })
    .limit(1, { referencedTable: 'delivery_messages' })
    .limit(200);

  if (error || !Array.isArray(data)) return null;

  const threads = [];
  for (const row of data) {
    if (!row?.id || !row?.driver_id) continue;
    const messages = Array.isArray(row.delivery_messages)
      ? row.delivery_messages.filter(m => !m?.driver_id || m.driver_id === row.driver_id)
      : [];
    if (!messages.length) continue;

    const latest = messages[0];
    const shipment = unwrapRelation(row.shipment);
    const driver = unwrapRelation(row.driver);

    threads.push({
      delivery_id: row.id,
      driver_id: row.driver_id,
      tracking_number: shipment?.tracking_number || null,
      driver_name: driver?.full_name || null,
      last_message_id: latest.id != null ? String(latest.id) : null,
      last_message_body: latest.body || '',
      last_message_at: latest.created_at || null,
      last_sender_role: latest.sender_role || null,
    });
  }
  return threads;
}

async function fetchThreadsFromMessagesFallback(client) {
  const { data: rawMessages, error } = await client
    .from('delivery_messages')
    .select('id,delivery_id,driver_id,sender_role,body,created_at')
    .order('id', { ascending: false })
    .limit(250);

  if (error) {
    throw Error('Conversation unavailable. Check your connection and delivery access, then retry.');
  }
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) return [];

  const latestByThread = new Map();
  for (const msg of rawMessages) {
    if (!msg?.delivery_id || !msg?.driver_id) continue;
    const key = `${msg.delivery_id}:${msg.driver_id}`;
    if (!latestByThread.has(key)) latestByThread.set(key, msg);
  }

  const deliveryIds = [...new Set([...latestByThread.values()].map(m => m.delivery_id))];
  const driverIds = [...new Set([...latestByThread.values()].map(m => m.driver_id))];

  const [deliveriesRes, driversRes] = await Promise.all([
    deliveryIds.length
      ? client.from('deliveries').select('id,shipment_id,driver_id,status').in('id', deliveryIds)
      : Promise.resolve({ data: [], error: null }),
    driverIds.length
      ? client.from('drivers').select('id,full_name').in('id', driverIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const deliveriesById = new Map(
    (Array.isArray(deliveriesRes.data) ? deliveriesRes.data : []).map(d => [d.id, d])
  );
  const driversById = new Map(
    (Array.isArray(driversRes.data) ? driversRes.data : []).map(d => [d.id, d])
  );

  const shipmentIds = [
    ...new Set(
      [...deliveriesById.values()].map(d => d.shipment_id).filter(Boolean)
    ),
  ];
  const shipmentsRes = shipmentIds.length
    ? await client.from('shipments').select('id,tracking_number,status').in('id', shipmentIds)
    : { data: [], error: null };
  const shipmentsById = new Map(
    (Array.isArray(shipmentsRes.data) ? shipmentsRes.data : []).map(s => [s.id, s])
  );

  const threads = [];
  for (const msg of latestByThread.values()) {
    const delivery = deliveriesById.get(msg.delivery_id);
    if (delivery && delivery.driver_id && delivery.driver_id !== msg.driver_id) continue;
    const shipment = delivery?.shipment_id ? shipmentsById.get(delivery.shipment_id) : null;
    const driver = driversById.get(msg.driver_id);

    threads.push({
      delivery_id: msg.delivery_id,
      driver_id: msg.driver_id,
      tracking_number: shipment?.tracking_number || null,
      driver_name: driver?.full_name || null,
      last_message_id: msg.id != null ? String(msg.id) : null,
      last_message_body: msg.body || '',
      last_message_at: msg.created_at || null,
      last_sender_role: msg.sender_role || null,
    });
  }
  return threads;
}

export function deliveryConversationService(client) {
  const rpc = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw Error('Conversation unavailable. Check your connection and delivery access, then retry.');
    return data;
  };
  return {
    load: (delivery, before = null) => rpc('delivery_conversation', { p_delivery: delivery, p_before: before }),
    unread: () => rpc('delivery_conversation_unread'),
    async threads() {
      const unreadPromise = rpc('delivery_conversation_unread');
      if (typeof client?.from !== 'function') {
        const unreadOnly = await unreadPromise;
        return Array.isArray(unreadOnly) ? unreadOnly : [];
      }

      const [unreadRows, primaryThreads] = await Promise.all([
        unreadPromise,
        fetchThreadsFromDeliveries(client),
      ]);
      const discoveredThreads = primaryThreads ?? (await fetchThreadsFromMessagesFallback(client));
      const safeUnread = Array.isArray(unreadRows) ? unreadRows : [];

      const unreadByKey = new Map();
      for (const row of safeUnread) {
        if (!row?.delivery_id || !row?.driver_id) continue;
        unreadByKey.set(`${row.delivery_id}:${row.driver_id}`, row);
      }

      const mergedByKey = new Map();
      for (const thread of discoveredThreads) {
        const key = `${thread.delivery_id}:${thread.driver_id}`;
        const unreadMatch = unreadByKey.get(key);
        mergedByKey.set(key, {
          ...thread,
          tracking_number: thread.tracking_number || unreadMatch?.tracking_number || 'Shipment',
          unread: Number(unreadMatch?.unread || 0),
        });
      }

      for (const [key, unreadRow] of unreadByKey.entries()) {
        if (!mergedByKey.has(key)) {
          mergedByKey.set(key, {
            delivery_id: unreadRow.delivery_id,
            driver_id: unreadRow.driver_id,
            tracking_number: unreadRow.tracking_number || 'Shipment',
            driver_name: null,
            last_message_id: null,
            last_message_body: '',
            last_message_at: null,
            last_sender_role: 'driver',
            unread: Number(unreadRow.unread || 0),
          });
        }
      }

      return [...mergedByKey.values()].sort(compareThreadOrder);
    },
    send: (delivery, request, body, driver) => rpc('send_delivery_message', { p_delivery: delivery, p_request: request, p_body: body.trim(), p_driver: driver }),
    read: (delivery, ids) => rpc('read_delivery_messages', { p_delivery: delivery, p_ids: ids }),
    watch(delivery, changed) {
      const channel = client.channel(`conversation-${delivery}-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_messages', ...(delivery ? { filter: `delivery_id=eq.${delivery}` } : {}) }, changed)
        .subscribe();
      return () => { void client.removeChannel(channel); };
    },
  };
}

// A lost response must keep the same key/body. Editing is allowed after confirmation.
export class PendingDeliveryMessage {
  pending = null;
  sending = false;
  constructor(service, delivery, newId = () => crypto.randomUUID()) {
    this.service = service; this.delivery = delivery; this.newId = newId;
  }
  async send(body) {
    if (this.sending) return null;
    if (!this.pending) {
      if (!body.trim() || [...body.trim()].length > 2000) throw Error('Enter a message of 1–2000 characters.');
      this.pending = { request: this.newId(), body: body.trim() };
    }
    this.sending = true;
    try {
      const result = await this.service.send(this.delivery, this.pending.request, this.pending.body);
      this.pending = null;
      return result;
    } finally { this.sending = false; }
  }
}
