import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { normalizeOfficePhone } from '../_shared/officePhone.js';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });
  const authorization = req.headers.get('Authorization');
  if (!authorization) return reply(401, { error: 'Please sign in again.' });
  let createdId = null;
  let setupStage = 'request';
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
    if (!['create', 'set_password', 'get_recovery_phone', 'set_recovery_phone', 'capabilities'].includes(input.action)) return reply(400, { error: 'Unsupported account action.' });
    if (input.action === 'capabilities') return reply(200, { officePhoneEnrollment: true });
    if (['get_recovery_phone', 'set_recovery_phone'].includes(input.action)) {
      if (typeof input.userId !== 'string') return reply(400, { error: 'Choose an office account.' });
      const { data: target, error: targetError } = await admin.from('users').select('role,is_active').eq('id', input.userId).single();
      if (targetError || !['admin', 'staff'].includes(target?.role)) return reply(404, { error: 'Office account not found.' });
      const { data: account, error: accountError } = await admin.auth.admin.getUserById(input.userId);
      if (accountError || !account?.user) return reply(400, { error: 'Unable to load recovery enrollment. Reload before retrying.' });
      const previousPhone = account.user.phone ? normalizeOfficePhone(account.user.phone) : null;
      if (input.action === 'get_recovery_phone') return reply(200, { userId: input.userId, phone: previousPhone });
      if (input.expectedPhone !== previousPhone) return reply(409, { error: 'Recovery enrollment changed. Close and reopen this dialog before saving.' });
      let phone;
      try { phone = normalizeOfficePhone(input.phone); } catch { return reply(400, { error: 'Enter a valid Philippine mobile number.' }); }
      // An active admin already has password-reset authority. This enrolls the
      // number they designate, not a self-editable public contact field. Actual
      // possession is challenged by SMS on every recovery; never use unconfirmed
      // phone OTP signup, which can replace an existing account password.
      const { data: updated, error } = await admin.auth.admin.updateUserById(input.userId, { phone, phone_confirm: true });
      if (error || !updated?.user?.phone || normalizeOfficePhone(updated.user.phone) !== phone) return reply(409, { error: 'Recovery phone was not confirmed. It may already belong to another account. Reload enrollment before retrying.' });
      return reply(200, { userId: input.userId, phone });
    }
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
    let phone;
    try { phone = normalizeOfficePhone(input.phone); } catch { return reply(400, { error: 'Enter a valid Philippine recovery mobile number.' }); }
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email.trim(), password: input.password, email_confirm: true,
      phone, phone_confirm: true,
      app_metadata: { provisioned_role: input.role }, user_metadata: { full_name: input.fullName.trim() },
    });
    if (error || !data?.user) return reply(409, { error: 'Account was not created. Check whether the email is already registered, then reload the directory.' });
    createdId = data.user.id;
    setupStage = 'phone enrollment';
    if (!data.user.phone || normalizeOfficePhone(data.user.phone) !== phone) throw new Error('Recovery phone enrollment failed');
    setupStage = 'office profile';
    const { data: profile, error: profileError } = await admin.from('users').select('id,role,is_active').eq('id', createdId).single();
    if (profileError || !profile || profile.is_active !== true) throw new Error('Profile setup failed');
    // Auth applies app_metadata AFTER its INSERT trigger. The initial profile
    // can therefore be customer even for an admin-provisioned office account.
    // Finalize ONLY this newly created id using the already-authorized server
    // client; never broaden normal signup metadata or convert existing users.
    if (profile.role === 'customer') {
      const { data: office, error: officeError } = await admin.from('users')
        .update({ role: input.role }).eq('id', createdId).eq('role', 'customer')
        .select('id,role,is_active').single();
      if (officeError || office?.id !== createdId || office.role !== input.role || office.is_active !== true) throw new Error('Office role finalization failed');
    } else if (profile.role !== input.role) throw new Error('Unexpected profile role');
    setupStage = 'temporary customer cleanup';
    // This row is generated by the customer INSERT trigger during this request.
    // Restrict deletion to this new Auth id; FK protection prevents deleting
    // customer records that have acquired operational dependencies.
    const { error: customerError } = await admin.from('customers').delete().eq('user_id', createdId);
    if (customerError) throw new Error('Temporary customer cleanup failed');
    return reply(200, { userId: createdId, recoveryPhone: phone });
  } catch {
    if (createdId && admin) {
      const { error } = await admin.auth.admin.deleteUser(createdId);
      if (error) return reply(500, { error: 'Account setup failed and cleanup requires administrator attention. Do not retry creation yet.' });
    }
    return reply(400, { error: createdId
      ? `Account setup failed during ${setupStage}. The new account was removed; no login account was saved. Contact an administrator if it happens again.`
      : 'Account request could not be completed. Check your connection and sign-in, then try again.' });
  }
});
