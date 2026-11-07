import { supabase } from './supabaseClient.js';

export function complianceNotificationService(client = supabase) {
  /**
   * Invokes the database producer function to check driver/truck compliance documents
   * and scheduled maintenance against compliance thresholds, delivering deduplicated
   * notifications via notify_user() for opted-in office users.
   */
  async function produceNotifications(now = null) {
    const params = now ? { p_now: typeof now === 'string' ? now : new Date(now).toISOString() } : {};
    const { data, error } = await client.rpc('produce_compliance_notifications', params);
    if (error) {
      throw new Error(error.message || 'Unable to produce compliance notifications.');
    }
    return typeof data === 'number' ? data : Number(data || 0);
  }

  return { produceNotifications };
}

export const complianceNotificationApi = complianceNotificationService();
