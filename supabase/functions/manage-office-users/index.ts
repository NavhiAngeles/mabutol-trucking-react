import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });
  const authorization = req.headers.get('Authorization');
  if (!authorization) return reply(401, { error: 'Please sign in again.' });
  let createdId = null;
  let admin;
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const callerClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization } } });
    const { data: identity, error: authError } = await callerClient.auth.getUser();
    if (authError || !identity?.user) return reply(401, { error: 'Please sign in again.' });
    admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: caller, error: callerError } = await admin.from('users').select('role,is_active').eq('id', identity.user.id).single();
    if (callerError || caller?.role !== 'admin' || caller.is_active !== true) return reply(403, { error: 'Only active administrators may manage office accounts.' });
    const input = await req.json();
    if (!['create', 'set_password'].includes(input.action)) return reply(400, { error: 'Unsupported account action.' });
    if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) return reply(400, { error: 'Use a password between 12 and 128 characters.' });
    if (input.action === 'set_password') {
      if (typeof input.userId !== 'string' || input.userId === identity.user.id) return reply(400, { error: 'Use Account settings to change your own password.' });
      const { data: target, error: targetError } = await admin.from('users').select('role,is_active').eq('id', input.userId).single();
      if (targetError || !['admin', 'staff'].includes(target?.role)) return reply(404, { error: 'Office account not found.' });
      const { error } = await admin.auth.admin.updateUserById(input.userId, { password: input.password });
      if (error) return reply(400, { error: 'Password was not changed. Check the password requirements and retry.' });
      return reply(200, { userId: input.userId });
    }
    if (!['admin', 'staff'].includes(input.role) || typeof input.fullName !== 'string' || !input.fullName.trim() || input.fullName.trim().length > 200 || typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return reply(400, { error: 'Enter a valid full name, login email and office role.' });
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email.trim(), password: input.password, email_confirm: true,
      app_metadata: { provisioned_role: input.role }, user_metadata: { full_name: input.fullName.trim() },
    });
    if (error || !data?.user) return reply(409, { error: 'Account was not created. Check whether the email is already registered, then reload the directory.' });
    createdId = data.user.id;
    const { data: profile, error: profileError } = await admin.from('users').select('id,role,is_active').eq('id', createdId).single();
    if (profileError || profile?.role !== input.role || profile.is_active !== true) throw new Error('Profile setup failed');
    return reply(200, { userId: createdId });
  } catch {
    if (createdId && admin) {
      const { error } = await admin.auth.admin.deleteUser(createdId);
      if (error) return reply(500, { error: 'Account setup failed and cleanup requires administrator attention. Do not retry creation yet.' });
    }
    return reply(400, { error: 'Account action failed. Reload the directory before retrying.' });
  }
});
