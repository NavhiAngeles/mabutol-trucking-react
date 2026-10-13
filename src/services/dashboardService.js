import { supabase } from './supabaseClient';
import { calculateOperationalStats, dispatchReadyIds } from './operationalStats';

export async function fetchOperationalRows(table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(offset, offset + 499);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error(`Invalid ${table} response`);
    rows.push(...data);
    if (data.length < 500) return [...new Map(rows.map(row => [row.id, row])).values()];
  }
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
  for (const table of ['shipments', 'deliveries', 'trucks', 'maintenance_records']) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, callback);
  }
  channel.subscribe(status => { if (status === 'SUBSCRIBED') callback(); });
  return () => { supabase.removeChannel(channel); };
}
