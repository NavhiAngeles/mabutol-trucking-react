import { supabase } from './supabaseClient';
import { validateThresholds } from './complianceThresholds.js';

export const COMPLIANCE_SETTING_KEY = 'compliance_thresholds';
export function complianceThresholdService(client = supabase) {
  async function load() {
    const { data, error } = await client.from('system_settings').select('key,value,updated_at')
      .in('key', [COMPLIANCE_SETTING_KEY, 'compliance_threshold_days']);
    if (error || !Array.isArray(data)) throw new Error('Unable to load compliance thresholds. Please retry.');
    const current = data.find(row => row.key === COMPLIANCE_SETTING_KEY);
    const legacy = data.find(row => row.key === 'compliance_threshold_days');
    const legacyDays = legacy ? Number(legacy.value) : 30;
    if (!Number.isInteger(legacyDays) || legacyDays < 0 || legacyDays > 365) throw new Error('The existing compliance warning setting is invalid.');
    return { thresholds: current ? validateThresholds(current.value) : null, legacyDays, updatedAt: current?.updated_at || null };
  }
  async function save(value, snapshot) {
    const thresholds = validateThresholds(value);
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth?.user) throw new Error('Please sign in again.');
    const { data: profile, error: profileError } = await client.from('users').select('role,is_active').eq('id', auth.user.id).single();
    if (profileError || profile?.role !== 'admin' || profile.is_active !== true) throw new Error('Only active administrators can change compliance thresholds.');
    const payload = { value: thresholds, updated_by: auth.user.id, updated_at: new Date().toISOString() };
    let query;
    if (snapshot?.thresholds) {
      if (!snapshot.updatedAt) throw new Error('Reload settings before saving.');
      query = client.from('system_settings').update(payload).eq('key', COMPLIANCE_SETTING_KEY).eq('updated_at', snapshot.updatedAt);
    } else {
      // INSERT deliberately rejects a racing first save instead of overwriting it.
      query = client.from('system_settings').insert({ ...payload, key: COMPLIANCE_SETTING_KEY, description: 'Per-document first and critical warning lead times in days; maintenance uses scheduled date.' });
    }
    const { data, error } = await query.select('key,value,updated_at').single();
    if (error || data?.key !== COMPLIANCE_SETTING_KEY || !data.updated_at) throw new Error('Save was not confirmed. Settings may have changed elsewhere. Reload and retry.');
    return { thresholds: validateThresholds(data.value), legacyDays: snapshot?.legacyDays ?? 30, updatedAt: data.updated_at };
  }
  return { load, save };
}
export const complianceThresholdApi = complianceThresholdService();
export const getComplianceConfiguration = () => complianceThresholdApi.load();
