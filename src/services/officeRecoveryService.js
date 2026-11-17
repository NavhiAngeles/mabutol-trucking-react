import { createClient } from '@supabase/supabase-js';
import { normalizeOfficePhone } from '../../supabase/functions/_shared/officePhone.js';

export const RECOVERY_NOTICE = 'If this number is registered, an SMS verification code will be sent. Enter the latest code below.';
const INVALID_LINK = 'Your recovery verification is unavailable or expired. Start again and request a new SMS code.';
const ACCESS_ERROR = 'This verification cannot reset an active office account. Contact your administrator.';

export function createRecoveryClient() {
  return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mabutol-office-recovery' },
  });
}

export function officeRecoveryService(client) {
  let owner = null;
  let requestedPhone = null;
  let closed = false;
  let saving = false;
  let saved = false;

  async function dispose() {
    closed = true;
    owner = null;
    // Only the temporary recovery session is revoked. No office session storage
    // or other user's browser session is read, replaced or signed out.
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* session is memory-only */ }
  }

  async function request(phone) {
    if (closed || owner || saved) throw new Error(INVALID_LINK);
    const normalized = normalizeOfficePhone(phone);
    try {
      const { error } = await client.auth.signInWithOtp({ phone: normalized, options: { shouldCreateUser: false, channel: 'sms' } });
      // Never expose raw provider errors, account existence, roles or status.
      // Transport failures are independent of whether the account exists.
      if (error && (!error.status || error.name === 'AuthRetryableFetchError')) {
        throw new Error('Unable to reach the recovery service. Check your connection and try again.');
      }
    } catch {
      throw new Error('Unable to reach the recovery service. Check your connection and try again.');
    }
    if (closed) throw new Error(INVALID_LINK);
    requestedPhone = normalized;
    return RECOVERY_NOTICE;
  }

  async function identity() {
    if (closed || !owner || saved) throw new Error(INVALID_LINK);
    const { data, error } = await client.auth.getUser();
    if (closed || error || data?.user?.id !== owner || !data.user.phone_confirmed_at || normalizeOfficePhone(data.user.phone) !== requestedPhone) throw new Error(INVALID_LINK);
    const { data: profile, error: denied } = await client.from('users').select('role,is_active').eq('id', owner).single();
    if (closed || denied || profile?.is_active !== true || !['admin', 'staff'].includes(profile.role)) throw new Error(ACCESS_ERROR);
    return data.user;
  }

  async function security() {
    await identity();
    const [{ data: factors, error: factorError }, { data: assurance, error: assuranceError }] = await Promise.all([
      client.auth.mfa.listFactors(), client.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (closed || factorError || assuranceError || !Array.isArray(factors?.all) || !['aal1', 'aal2'].includes(assurance?.currentLevel)) {
      throw new Error('Unable to verify account security. Retry verification or request a new SMS code.');
    }
    const verified = factors.all.filter(factor => factor.status === 'verified');
    return {
      required: assurance.currentLevel !== 'aal2' && (assurance.nextLevel === 'aal2' || verified.length > 0),
      factors: verified.filter(factor => factor.factor_type === 'totp'),
      unsupported: verified.some(factor => factor.factor_type !== 'totp'),
    };
  }

  async function verifyPhone(phone, token) {
    if (closed || owner || !requestedPhone || normalizeOfficePhone(phone) !== requestedPhone) throw new Error(INVALID_LINK);
    if (!/^\d{6}$/.test(token)) throw new Error('Enter the six-digit SMS code.');
    const result = await client.auth.verifyOtp({ phone: requestedPhone, token, type: 'sms' });
    if (closed) { await dispose(); throw new Error(INVALID_LINK); }
    if (result.error || !result.data?.session || !result.data?.user?.id) {
      throw new Error('The SMS code is invalid or expired. Try the latest code or request a new one.');
    }
    try {
      owner = result.data.user.id;
      return await security();
    } catch {
      await dispose();
      throw new Error(ACCESS_ERROR);
    }
  }

  async function verify(factorId, code) {
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit authenticator code.');
    const state = await security();
    if (state.unsupported || !state.factors.some(factor => factor.id === factorId)) throw new Error('Contact your administrator for help with this authentication method.');
    const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    if (closed || error || !data?.access_token) throw new Error('Authenticator verification failed. Try a fresh code.');
    return security();
  }

  async function reset(password, confirmation) {
    if (saving || saved) throw new Error('A password reset is already in progress or completed.');
    if (typeof password !== 'string' || password.length < 8) throw new Error('Use a new password of at least 8 characters.');
    if (password !== confirmation) throw new Error('The passwords do not match.');
    saving = true;
    try {
      const state = await security();
      if (state.required) throw new Error('Verify your authenticator before changing the password.');
      // Recheck ownership and active role immediately before the mutation.
      const user = await identity();
      const { data, error } = await client.auth.updateUser({ password });
      if (closed) throw new Error(INVALID_LINK);
      if (error || data?.user?.id !== user.id) {
        if (error?.code === 'weak_password') throw new Error('Choose a stronger password that meets the office password policy.');
        if (error?.code === 'same_password') throw new Error('Choose a password different from your current password.');
        throw new Error('The password change was not confirmed. Try signing in with your new password before requesting another reset.');
      }
      saved = true;
      await dispose();
      return 'Your password has been reset. Return to login and sign in with your new password.';
    } finally { saving = false; }
  }

  return { request, verifyPhone, security, verify, reset, dispose };
}

export const createOfficeRecovery = () => officeRecoveryService(createRecoveryClient());
