import { supabase } from "./supabaseClient";

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', data.user.id)
    .single();
  
  if (profileError) {
    await supabase.auth.signOut();
    throw new Error('Unable to verify account. Please try again.');
  }

  if (!['admin', 'staff'].includes(profile.role)) {
    await supabase.auth.signOut();
    throw new Error('Invalid login credentials');
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new Error('This account has been deactivated.');
  }

  return { ...data, role: profile.role };
}

export async function checkSessionValidity() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single();

  const maxSessionMinutes = ['admin', 'staff'].includes(profile.role) ? 30 : 60 * 24 * 7;
  const signedInAt = new Date(session.user.last_sign_in_at).getTime();
  const elapsedMinutes = (Date.now() - signedInAt) / 1000 / 60;

  if (elapsedMinutes > maxSessionMinutes) {
    await supabase.auth.signOut();
    return false;
  }

  return true;
}

const IDLE_LIMITS_MINUTES = {
  admin: 30,
  staff: 30,
  driver: 60 * 24 * 7,   // 7 days, mobile
  customer: 60 * 24 * 7, // 7 days, mobile
};

export function getIdleLimitMinutes(role) {
  return IDLE_LIMITS_MINUTES[role] ?? 30;
}

export function markActivity() {
  localStorage.setItem('lastActivityAt', Date.now().toString());
}

export function getLastActivity() {
  const val = localStorage.getItem('lastActivityAt');
  return val ? parseInt(val, 10) : null;
}