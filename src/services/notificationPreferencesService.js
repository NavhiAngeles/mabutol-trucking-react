import { supabase } from './supabaseClient';

// These are the backend notification_type enum values, not UI-only categories.
export const NOTIFICATION_TYPES = ['shipment_status', 'booking_confirmed', 'assignment', 'delay', 'compliance_expiry', 'payment', 'message', 'system'];

export function notificationPreferencesService(client = supabase) {
  async function identity() {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error('Please sign in again.');
    return data.user.id;
  }
  async function load() {
    const userId = await identity();
    const { data, error } = await client.from('notification_preferences')
      .select('type,channel,enabled').eq('user_id', userId).eq('channel', 'in_app');
    if (error || !Array.isArray(data)) throw new Error('Unable to load notification preferences. Please retry.');
    // notify_user treats missing rows as enabled. Loading never inserts defaults.
    const preferences = Object.fromEntries(NOTIFICATION_TYPES.map(type => [type, true]));
    for (const row of data) {
      if (row.channel !== 'in_app' || !NOTIFICATION_TYPES.includes(row.type) || typeof row.enabled !== 'boolean') throw new Error('Invalid notification preferences response. Please retry.');
      preferences[row.type] = row.enabled;
    }
    return { userId, preferences };
  }
  async function save(userId, type, enabled) {
    if (!NOTIFICATION_TYPES.includes(type) || typeof enabled !== 'boolean') throw new Error('Invalid notification preference.');
    if (!userId || await identity() !== userId) throw new Error('Your account changed. Reload notification settings.');
    // One category per request preserves other categories and other delivery channels.
    const { data, error } = await client.from('notification_preferences').upsert({ user_id: userId, type, channel: 'in_app', enabled },
      { onConflict: 'user_id,type,channel' }).select('user_id,type,channel,enabled').single();
    if (error || !data || data.user_id !== userId || data.type !== type || data.channel !== 'in_app' || data.enabled !== enabled) {
      throw new Error('Notification preference was not confirmed. Reload or retry.');
    }
    return data.enabled;
  }
  return { load, save };
}

export const notificationPreferencesApi = notificationPreferencesService();
