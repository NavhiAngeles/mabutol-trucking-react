import { supabase } from './supabaseClient';
import { normalizeOfficePhone } from '../../supabase/functions/_shared/officePhone.js';

const SENSITIVE_KEY_PATTERN = /^(password|passwordhash|initialpassword|newpassword|confirmpassword|confirm|pwd|pass|token|accesstoken|refreshtoken|jwt|bearer|authorization|auth|secret|apikey|privatekey|code|otp|smscode|pin|credential|credentials|session|sessiontoken|cookie|salt|privatepayload)$/i;
const SENSITIVE_VALUE_PATTERN = /^(Bearer\s+[A-Za-z0-9._~+/-]+=*|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})$/;

export function redactMetadata(input) {
  if (input == null) return null;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (SENSITIVE_VALUE_PATTERN.test(trimmed)) return '[REDACTED]';
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return redactMetadata(JSON.parse(trimmed));
      } catch {
        return input;
      }
    }
    return input;
  }
  if (Array.isArray(input)) return input.map(item => redactMetadata(item));
  if (typeof input === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(input)) {
      const normalized = key.toLowerCase().replace(/[-_]/g, '');
      const lower = key.toLowerCase();
      const isSensitive = SENSITIVE_KEY_PATTERN.test(normalized) ||
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower.includes('credential') ||
        lower.includes('bearer') ||
        lower === 'auth' ||
        lower.startsWith('auth_') ||
        lower.endsWith('_auth') ||
        lower === 'authorization';

      if (isSensitive) {
        cleaned[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        cleaned[key] = redactMetadata(value);
      } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (SENSITIVE_VALUE_PATTERN.test(trimmed)) {
          cleaned[key] = '[REDACTED]';
        } else if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            cleaned[key] = redactMetadata(JSON.parse(trimmed));
          } catch {
            cleaned[key] = value;
          }
        } else {
          cleaned[key] = value;
        }
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
  return input;
}

export function formatAuditTimestamp(dateValue) {
  if (!dateValue) return 'Unavailable';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function validateOfficeCreation(form) {
  const fullName = form.fullName?.trim();
  const email = form.email?.trim();
  if (!fullName || fullName.length > 200) throw new Error('Enter the staff member’s full name (up to 200 characters).');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid login email address.');
  if (!['admin', 'staff'].includes(form.role)) throw new Error('Choose Admin or Staff.');
  if (typeof form.password !== 'string' || form.password.length < 12 || form.password.length > 128) throw new Error('Account was not created. The initial password must be between 12 and 128 characters.');
  return { action: 'create', fullName, email, role: form.role, password: form.password, phone: normalizeOfficePhone(form.phone) };
}

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
    let provisioningReady = false;
    try {
      const { data, error } = await client.functions.invoke('manage-office-users', { body: { action: 'capabilities' } });
      provisioningReady = !error && data?.officePhoneEnrollment === true;
    } catch { /* Keep the directory readable when provisioning is unavailable. */ }
    return { callerId, users, provisioningReady,
      provisioningError: provisioningReady ? '' : 'New office accounts cannot be created yet. The SMS account-management backend is unavailable or needs its approved deployment. Existing accounts can still be viewed. Refresh users after the backend is ready.' };
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
    const body = action === 'create' ? validateOfficeCreation(form)
      : { action: 'set_password', userId: form.userId, password: form.password };
    const { data, error } = await client.functions.invoke('manage-office-users', { body });
    if (error || data?.error || !data?.userId) {
      let detail = data?.error;
      if (!detail && error?.context?.json) { try { detail = (await error.context.json()).error; } catch { /* generic error below */ } }
      throw new Error(detail || 'Account action was not confirmed. Reload the directory before retrying.');
    }
    if (action === 'create' && data.recoveryPhone !== body.phone) throw new Error('Account creation did not confirm SMS recovery enrollment. Reload the directory and check Recovery Phone before retrying creation.');
    if (action === 'create') {
      const { data: saved, error: readError } = await client.from('users').select('id,email,role,is_active').eq('id', data.userId).single();
      if (readError || saved?.id !== data.userId || saved.email?.toLowerCase() !== body.email.toLowerCase() || saved.role !== body.role || saved.is_active !== true) {
        throw new Error('The server accepted the request, but the saved office account could not be verified. Refresh the directory before attempting creation again.');
      }
    }
    return data.userId;
  }
  async function recoveryPhone(target, form = null) {
    await adminIdentity();
    const body = form ? { action: 'set_recovery_phone', userId: target.id, phone: normalizeOfficePhone(form.recoveryPhone), expectedPhone: form.expectedPhone }
      : { action: 'get_recovery_phone', userId: target.id };
    const { data, error } = await client.functions.invoke('manage-office-users', { body });
    if (error || data?.error || data?.userId !== target.id || !Object.hasOwn(data, 'phone')) {
      let detail = data?.error;
      if (!detail && error?.context?.json) { try { detail = (await error.context.json()).error; } catch { /* safe fallback */ } }
      throw new Error(detail || 'Recovery enrollment was not confirmed. Close and reopen this dialog before retrying.');
    }
    return data.phone ? normalizeOfficePhone(data.phone) : null;
  }
  async function auditLogs() {
    await adminIdentity();
    const { data: logs, error } = await client
      .from('activity_logs')
      .select('id,entity_type,entity_id,action,created_at,user_id,details')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(500);

    if (error || !Array.isArray(logs)) {
      throw new Error(error?.message || 'Unable to load audit logs. Please retry.');
    }

    const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))];
    let userMap = new Map();
    if (userIds.length > 0) {
      try {
        const { data: usersData, error: userError } = await client
          .from('users')
          .select('id,full_name,email,role')
          .in('id', userIds);
        if (!userError && Array.isArray(usersData)) {
          userMap = new Map(usersData.map(u => [u.id, u]));
        }
      } catch {
        // Fallback to raw user IDs if user lookup is unavailable
      }
    }

    return logs.map(row => {
      const actorId = row.user_id || row.actor_id;
      const actorUser = actorId ? userMap.get(actorId) : null;
      const actor = row.actor && typeof row.actor === 'object'
        ? row.actor
        : actorUser
          ? { id: actorUser.id, name: actorUser.full_name || 'Staff', email: actorUser.email, role: actorUser.role }
          : actorId
            ? { id: actorId, name: 'User ' + String(actorId).slice(0, 8), email: '', role: '' }
            : { id: null, name: typeof row.actor === 'string' ? row.actor : 'System', email: '', role: '' };

      const target = row.entity_type
        ? `${row.entity_type}${row.entity_id ? ` #${row.entity_id}` : ''}`
        : (row.entity_id ? `#${row.entity_id}` : 'General');

      return {
        id: String(row.id),
        action: String(row.action || 'ACTION').toUpperCase(),
        entityType: row.entity_type || 'general',
        entityId: row.entity_id ? String(row.entity_id) : '',
        target,
        userId: actorId || null,
        actor,
        createdAt: row.created_at,
        philippineTime: formatAuditTimestamp(row.created_at),
        details: redactMetadata(row.details ?? row.metadata ?? null),
      };
    });
  }
  return { load, save, recoveryPhone, create: form => provision('create', form), setPassword: form => provision('set_password', form), auditLogs };
}
export const userManagementApi = userManagementService();
