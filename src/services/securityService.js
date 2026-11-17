import { supabase } from './supabaseClient';
import { normalizeOfficePhone } from '../../supabase/functions/_shared/officePhone.js';

export function securityService(client = supabase) {
  async function identity() {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error('Please sign in again.');
    return data.user;
  }

  async function load() {
    const user = await identity();
    const { data, error } = await client.auth.mfa.listFactors();
    if (error || !Array.isArray(data?.all)) throw new Error('Unable to load authentication factors. Please retry.');

    let twoFactorPhone = user.user_metadata?.two_factor_phone || user.phone || '';
    if (!twoFactorPhone && client.from) {
      try {
        const { data: profile } = await client.from('users').select('phone').eq('id', user.id).single();
        if (profile?.phone) twoFactorPhone = profile.phone;
      } catch {
        // Profile fallback is optional
      }
    }
    const twoFactorEnabled = Boolean(
      user.user_metadata?.two_factor_enabled ||
      (user.user_metadata?.two_factor_phone && user.phone_confirmed_at)
    );

    return {
      email: user.email,
      phone: twoFactorPhone,
      lastSignIn: user.last_sign_in_at,
      twoFactorEnabled,
      twoFactorPhone,
      twoFactorType: 'textbee_sms',
      factors: data.all.filter(f => f.factor_type === 'totp'),
      unsupported: data.all.some(f => f.status === 'verified' && f.factor_type !== 'totp'),
    };
  }

  async function sendSms2fa(phone) {
    await identity();
    const normalized = normalizeOfficePhone(phone);
    const { error } = await client.auth.updateUser({ phone: normalized });
    if (error) {
      throw new Error(error.message || 'Unable to send verification SMS via TextBee. Please check the phone number and retry.');
    }
    return { phone: normalized };
  }

  async function verifySms2fa(phone, code) {
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit SMS code.');
    await identity();
    const normalized = normalizeOfficePhone(phone);

    let { error } = await client.auth.verifyOtp({ phone: normalized, token: code, type: 'phone_change' });
    if (error) {
      const secondTry = await client.auth.verifyOtp({ phone: normalized, token: code, type: 'sms' });
      if (secondTry.error) {
        throw new Error(error.message || secondTry.error.message || 'Invalid or expired SMS code. Try a fresh code.');
      }
    }

    const { error: metaErr } = await client.auth.updateUser({
      data: {
        two_factor_enabled: true,
        two_factor_type: 'textbee_sms',
        two_factor_phone: normalized,
      },
    });
    if (metaErr) throw new Error(metaErr.message || 'Failed to activate 2FA settings.');

    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const u = await identity();
        window.sessionStorage.setItem('mabutol_2fa_verified_' + u.id, 'true');
      } catch { /* ignore */ }
    }

    return { success: true, phone: normalized };
  }

  async function disable2fa(factorId) {
    const user = await identity();
    if (factorId && client.auth?.mfa?.unenroll) {
      try { await client.auth.mfa.unenroll({ factorId }); } catch { /* ignore */ }
    }
    if (client.auth?.updateUser) {
      const { error } = await client.auth.updateUser({
        data: {
          two_factor_enabled: false,
          two_factor_type: null,
          two_factor_phone: null,
        },
      });
      if (error) throw new Error(error.message || 'Unable to disable 2FA. Please retry.');
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem('mabutol_2fa_verified_' + user.id);
    }
    return { success: true };
  }

  async function enroll(phone) {
    if (phone && typeof phone === 'string') return sendSms2fa(phone);
    await identity();
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', issuer: 'Mabutol Trucking' });
    if (error || !data?.id || !data?.totp?.qr_code) throw new Error(error?.message || 'Authenticator setup failed. Refresh before retrying.');
    return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }

  async function verify(factorIdOrPhone, code) {
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit authenticator code.');
    await identity();
    if (String(factorIdOrPhone).startsWith('+63') || String(factorIdOrPhone).startsWith('09')) {
      return verifySms2fa(factorIdOrPhone, code);
    }
    const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId: factorIdOrPhone, code });
    if (error || !data?.access_token) throw new Error(error?.message || 'Code verification failed. Try a fresh code.');
  }

  async function remove(factorId) {
    await identity();
    const { error } = await client.auth.mfa.unenroll({ factorId });
    if (error) throw new Error(error.message || 'Unable to remove authenticator. Please retry.');
    if (client.auth?.updateUser) {
      try {
        await client.auth.updateUser({
          data: {
            two_factor_enabled: false,
            two_factor_type: null,
            two_factor_phone: null,
          },
        });
      } catch { /* ignore */ }
    }
  }

  async function assurance() {
    const snapshot = await load();
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data?.currentLevel) throw new Error('Unable to verify sign-in security. Please retry.');

    const user = await identity();
    if (snapshot.twoFactorEnabled) {
      const verifiedThisSession = typeof window !== 'undefined' && window.sessionStorage?.getItem('mabutol_2fa_verified_' + user.id) === 'true';
      return {
        required: !verifiedThisSession,
        phone: snapshot.twoFactorPhone,
        twoFactorType: 'textbee_sms',
        factors: snapshot.factors,
      };
    }

    const factors = snapshot.factors.filter(f => f.status === 'verified');
    const required = data.currentLevel !== 'aal2' && (data.nextLevel === 'aal2' || factors.length > 0 || snapshot.unsupported);
    return { required, factors };
  }

  async function sendChallengeSms() {
    const user = await identity();
    const phone = user.user_metadata?.two_factor_phone || user.phone;
    if (!phone) throw new Error('No 2FA phone registered on this account.');
    const { error } = await client.auth.signInWithOtp({
      phone: normalizeOfficePhone(phone),
      options: { shouldCreateUser: false, channel: 'sms' },
    });
    if (error) {
      throw new Error(error.message || 'Unable to queue verification SMS via TextBee.');
    }
    return { phone };
  }

  async function verifyChallengeSms(code) {
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit SMS code.');
    const user = await identity();
    const phone = normalizeOfficePhone(user.user_metadata?.two_factor_phone || user.phone);
    const { data, error } = await client.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (error || !data?.session) {
      throw new Error(error?.message || 'Invalid or expired SMS code. Try a fresh code.');
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('mabutol_2fa_verified_' + user.id, 'true');
    }
    return { success: true };
  }

  async function signOut() {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new Error('Unable to sign out. Please retry.');
  }

  return {
    load,
    sendSms2fa,
    verifySms2fa,
    disable2fa,
    sendChallengeSms,
    verifyChallengeSms,
    enroll,
    verify,
    remove,
    assurance,
    signOut,
  };
}
export const securityApi = securityService();
