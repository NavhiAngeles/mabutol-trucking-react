import { supabase } from './supabaseClient';
import { calculateOperationalStats, dispatchReadyIds } from './operationalStats';

const OPERATIONAL_CACHE_TTL_MS = 2000;
const inFlightOperational = new Map();
const cachedOperational = new Map();
const defaultOperationalFilter = query => query;

export function clearOperationalCache(tablePrefix = null) {
  if (tablePrefix) {
    for (const key of cachedOperational.keys()) {
      if (key.startsWith(`${tablePrefix}:`)) {
        cachedOperational.delete(key);
      }
    }
    return;
  }
  cachedOperational.clear();
}

export async function fetchOperationalRows(table, columns, filter = defaultOperationalFilter) {
  const isUnfiltered = filter === defaultOperationalFilter || filter == null;
  const cacheKey = isUnfiltered ? `${table}:${columns}` : null;

  if (cacheKey) {
    const cached = cachedOperational.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < OPERATIONAL_CACHE_TTL_MS) {
      return cached.data;
    }
    const pending = inFlightOperational.get(cacheKey);
    if (pending) {
      return pending;
    }
  }

  const runFetch = async () => {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const base = supabase.from(table).select(columns);
      const query = typeof filter === 'function' ? filter(base) : base;
      const { data, error } = await query.order('id').range(offset, offset + 499);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error(`Invalid ${table} response`);
      rows.push(...data);
      if (data.length < 500) {
        const result = [...new Map(rows.map(row => [row.id, row])).values()];
        if (cacheKey) {
          cachedOperational.set(cacheKey, { data: result, cachedAt: Date.now() });
        }
        return result;
      }
    }
  };

  if (!cacheKey) {
    return runFetch();
  }

  const promise = runFetch().finally(() => {
    inFlightOperational.delete(cacheKey);
  });
  inFlightOperational.set(cacheKey, promise);
  return promise;
}

export const fetchOperationalDeliveries = () => fetchOperationalRows('deliveries', 'id,shipment_id,truck_id,driver_id,status,departed_at');
export const fetchOperationalMaintenance = () => fetchOperationalRows('maintenance_records', 'id,truck_id,status');

export async function getDispatchReadyTruckIds() {
  const [trucks, deliveries, maintenance] = await Promise.all([
    fetchOperationalRows('trucks', 'id,status'), fetchOperationalDeliveries(), fetchOperationalMaintenance(),
  ]);
  return dispatchReadyIds(trucks, deliveries, maintenance);
}

export async function getDashboardStats() {
  const [shipments, trucks, deliveries, maintenance, history] = await Promise.all([
    fetchOperationalRows('shipments', 'id,status,created_at'),
    fetchOperationalRows('trucks', 'id,status'), fetchOperationalDeliveries(), fetchOperationalMaintenance(),
    fetchOperationalRows('shipment_status_history', 'id,shipment_id,from_status,to_status,created_at').catch(() => null),
  ]);
  return calculateOperationalStats(shipments, trucks, deliveries, maintenance, history);
}

let channelId = 0;
export function subscribeToDashboardChanges(callback) {
  let channel = supabase.channel(`dashboard-stats-${++channelId}`);
  const onDbChange = () => {
    clearOperationalCache();
    callback();
  };
  for (const table of ['shipments', 'deliveries', 'trucks', 'maintenance_records']) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, onDbChange);
  }
  channel.subscribe(status => { if (status === 'SUBSCRIBED') callback(); });
  return () => { supabase.removeChannel(channel); };
}
