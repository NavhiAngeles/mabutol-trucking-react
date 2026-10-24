import { supabase } from './supabaseClient';

export function userManagementService(client = supabase) {
  async function adminIdentity() {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error('Please sign in again.');
    const { data: profile, error: profileError } = await client.from('users').select('role,is_active').eq('id', data.user.id).single();
    if (profileError || profile?.role !== 'admin' || profile.is_active !== true) throw new Error('Only active administrators may manage office users.');
    return data.user.id;
  }
  async function load() {
    const callerId = await adminIdentity();
    const users = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await client.from('users').select('id,full_name,email,phone,role,is_active,created_at,updated_at')
        .in('role', ['admin', 'staff']).order('id').range(start, start + 499);
      if (error || !Array.isArray(data)) throw new Error('Unable to load office users. Please retry.');
      users.push(...data);
      if (data.length < 500) break;
    }
    return { callerId, users };
  }
  async function save(target, form) {
    await adminIdentity();
    if (!form.fullName?.trim() || form.fullName.trim().length > 200 || (form.phone || '').length > 40 || !['admin', 'staff'].includes(form.role) || typeof form.active !== 'boolean') throw new Error('Enter valid profile details and an office role.');
    const { data, error } = await client.rpc('manage_office_user', { p_id: target.id, p_full_name: form.fullName.trim(), p_phone: form.phone || '', p_role: form.role, p_is_active: form.active, p_expected: target.updated_at });
    if (error || data !== target.id) throw new Error(error?.message || 'Account update was not confirmed. Reload and retry.');
    return data;
  }
  async function provision(action, form) {
    await adminIdentity();
    if (typeof form.password !== 'string' || form.password.length < 12 || form.password.length > 128) throw new Error('Use a password between 12 and 128 characters.');
    // Explicit fields keep UI-only permissions/status out of the privileged request.
    const body = action === 'create' ? { action, email: form.email?.trim(), fullName: form.fullName?.trim(), role: form.role, password: form.password }
      : { action: 'set_password', userId: form.userId, password: form.password };
    const { data, error } = await client.functions.invoke('manage-office-users', { body });
    if (error || data?.error || !data?.userId) {
      let detail = data?.error;
      if (!detail && error?.context?.json) { try { detail = (await error.context.json()).error; } catch { /* generic error below */ } }
      throw new Error(detail || 'Account action was not confirmed. Reload the directory before retrying.');
    }
    return data.userId;
  }
  return { load, save, create: form => provision('create', form), setPassword: form => provision('set_password', form) };
}
export const userManagementApi = userManagementService();
