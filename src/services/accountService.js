import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

const COLUMNS = 'id,full_name,phone,role,avatar_url,created_at,updated_at';
const BUCKET = 'account-avatars';

export function accountService(client = supabase, verifierFactory = () => createClient(client.supabaseUrl, client.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'account-password-check' },
})) {
  async function identity() {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error('Please sign in again.');
    return data.user;
  }
  async function photoUrl(path, id) {
    if (!path || !path.startsWith(id + '/')) return null;
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) throw new Error('Unable to load your photo. Please retry.');
    return data.signedUrl;
  }
  async function load() {
    const user = await identity();
    const { data, error } = await client.from('users').select(COLUMNS).eq('id', user.id).single();
    if (error || !data) throw new Error('Unable to load your account. Please retry.');
    return { ...data, email: user.email, lastSignIn: user.last_sign_in_at, photo: await photoUrl(data.avatar_url, user.id) };
  }
  async function save(form, file, expected) {
    const fullName = form.fullName?.trim();
    if (!fullName || fullName.length > 200) throw new Error('Enter your full name (up to 200 characters).');
    if ((form.contact || '').length > 40) throw new Error('Contact number must be at most 40 characters.');
    if (file && (!['image/jpeg', 'image/png'].includes(file.type) || file.size <= 0 || file.size > 2 * 1024 * 1024)) throw new Error('Choose a JPG or PNG photo under 2MB.');
    const user = await identity();
    let path;
    if (file) {
      path = user.id + '/' + crypto.randomUUID() + (file.type === 'image/png' ? '.png' : '.jpg');
      const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error('Photo upload failed. Your profile has not been saved.');
    }
    const payload = { full_name: fullName, phone: form.contact?.trim() || null };
    if (path) payload.avatar_url = path;
    let query = client.from('users').update(payload).eq('id', user.id);
    if (expected) query = query.eq('updated_at', expected);
    const { data, error } = await query.select(COLUMNS).single();
    if (error || !data) {
      if (path) await client.storage.from(BUCKET).remove([path]);
      throw new Error('Profile was not saved. It may have changed elsewhere. Reload and retry.');
    }
    // Return the confirmed row; a later photo-read failure must not imply the save failed.
    let photo = null;
    try { photo = await photoUrl(data.avatar_url, user.id); } catch { /* initials remain available */ }
    return { ...data, email: user.email, lastSignIn: user.last_sign_in_at, photo };
  }
  async function changePassword(current, password) {
    if (!current || password.length < 8 || current === password) throw new Error('Enter your current password and a different new password of at least 8 characters.');
    const user = await identity();
    const verifier = verifierFactory();
    try {
      const { data, error } = await verifier.auth.signInWithPassword({ email: user.email, password: current });
      if (error || data?.user?.id !== user.id) throw new Error('Current password could not be verified. Please retry.');
    } finally {
      await verifier.auth.signOut({ scope: 'local' });
    }
    if ((await identity()).id !== user.id) throw new Error('Your account changed. Please reopen Account settings.');
    const { error } = await client.auth.updateUser({ password, current_password: current });
    if (error) throw new Error(error.message || 'Unable to update password. Please retry.');
  }
  async function revokeOthers() {
    await identity();
    const { error } = await client.auth.signOut({ scope: 'others' });
    if (error) throw new Error('Unable to sign out other sessions. Please retry.');
  }
  return { load, save, changePassword, revokeOthers };
}

export const accountApi = accountService();
