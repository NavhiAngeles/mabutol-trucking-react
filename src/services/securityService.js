import { supabase } from './supabaseClient';
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
    return { email: user.email, lastSignIn: user.last_sign_in_at,
      factors: data.all.filter(f => f.factor_type === 'totp'),
      unsupported: data.all.some(f => f.status === 'verified' && f.factor_type !== 'totp') };
  }
  async function enroll() {
    await identity();
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', issuer: 'Mabutol Trucking' });
    if (error || !data?.id || !data?.totp?.qr_code) throw new Error(error?.message || 'Authenticator setup failed. Refresh before retrying.');
    return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }
  async function verify(factorId, code) {
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit authenticator code.');
    await identity();
    const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    if (error || !data?.access_token) throw new Error(error?.message || 'Code verification failed. Try a fresh code.');
  }
  async function remove(factorId) {
    await identity();
    const { error } = await client.auth.mfa.unenroll({ factorId });
    if (error) throw new Error(error.message || 'Unable to remove authenticator. Please retry.');
  }
  async function assurance() {
    // Read current server factors as well as the local session's assurance.
    // Cached session.user factors can lag enrollment on another device.
    const snapshot = await load();
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data?.currentLevel) throw new Error('Unable to verify sign-in security. Please retry.');
    const factors = snapshot.factors.filter(f => f.status === 'verified');
    const required = data.currentLevel !== 'aal2' && (data.nextLevel === 'aal2' || factors.length > 0 || snapshot.unsupported);
    return { required, factors };
  }
  async function signOut() {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new Error('Unable to sign out. Please retry.');
  }
  return { load, enroll, verify, remove, assurance, signOut };
}
export const securityApi = securityService();
