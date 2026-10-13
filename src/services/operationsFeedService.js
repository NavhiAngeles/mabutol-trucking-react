import { supabase } from './supabaseClient';
import { EVENT_STATUSES, SOURCE_RANK, compareEvents, mapOperationEvent, timestampKey } from './operationsFeed';

const SOURCES = {
  history: ['shipment_status_history', 'id,shipment_id,from_status,to_status,created_at'],
  incident: ['delivery_incidents', 'id,shipment_id,delivery_id,category,created_at'],
  audit: ['activity_logs', 'id,entity_id,action,entity_type,created_at'],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchOperationsPage({ cursor = null, snapshot = new Date().toISOString(), size = 10 } = {}) {
  if (!timestampKey(snapshot) || !Number.isInteger(size) || size < 1 || size > 50) throw new Error('Invalid activity page request.');
  if (cursor && (!Object.hasOwn(SOURCES, cursor.source) || !timestampKey(cursor.created_at) ||
    !(cursor.source === 'incident' ? UUID.test(cursor.id) : /^\d+$/.test(cursor.id)))) throw new Error('Invalid activity cursor.');
  const batches = await Promise.all(Object.entries(SOURCES).map(async ([source, [table, columns]]) => {
    let query = supabase.from(table).select(columns).lte('created_at', snapshot);
    if (source === 'history') query = query.in('to_status', EVENT_STATUSES);
    if (source === 'audit') query = query.eq('entity_type', 'shipments').eq('action', 'DELETE');
    if (cursor) {
      if (source === cursor.source) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      else query = SOURCE_RANK[source] > SOURCE_RANK[cursor.source]
        ? query.lt('created_at', cursor.created_at) : query.lte('created_at', cursor.created_at);
    }
    const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(size + 1);
    if (error) throw error;
    if (!Array.isArray(data) || data.some(row => !row.id || !timestampKey(row.created_at) ||
      (typeof row.id === 'number' && !Number.isSafeInteger(row.id)) ||
      (source !== 'incident' && !/^\d+$/.test(String(row.id))))) throw new Error(`Invalid ${table} event response.`);
    return data.map(row => ({ ...row, id: String(row.id), source }));
  }));
  const ordered = [...new Map(batches.flat().map(row => [`${row.source}:${row.id}`, row])).values()].sort(compareEvents);
  const page = ordered.slice(0, size);
  const ids = [...new Set(page.filter(row => row.source !== 'audit').map(row => row.shipment_id).filter(id => UUID.test(id)))];
  let shipments = [];
  if (ids.length) {
    const { data, error } = await supabase.from('shipments')
      .select('id,tracking_number,pickup_address,dropoff_address,customer:customers!shipments_customer_id_fkey(name)').in('id', ids);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Invalid shipment details response.');
    shipments = data;
  }
  const lookup = new Map(shipments.map(s => [s.id, s]));
  const last = page.at(-1);
  return {
    events: page.map(row => mapOperationEvent(row.source, row, lookup.get(row.shipment_id))), snapshot,
    nextCursor: ordered.length > size && last ? { source: last.source, id: last.id, created_at: last.created_at } : null,
  };
}

let subscriptionId = 0;
export function subscribeOperationsFeed(onChange) {
  const channel = supabase.channel(`operations-feed-${++subscriptionId}`);
  // History, incidents and audit logs are unpublished. These published parent tables trigger early refreshes.
  for (const table of ['shipments', 'deliveries']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  }
  channel.subscribe(status => { if (status === 'SUBSCRIBED') onChange(); });
  return () => { supabase.removeChannel(channel); };
}
