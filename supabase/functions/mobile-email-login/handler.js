const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (status, error) => new Response(JSON.stringify({ error }), { status, headers });
export function emailLoginHandler({ resolve, signIn, ready = true }) {
 return async request => {
  if (request.method !== 'POST') return reply(405, 'METHOD_NOT_ALLOWED');
  if (!ready) return reply(503, 'LOGIN_UNAVAILABLE');
  try {
   const raw = await request.text();
   if (raw.length > 8192) return reply(400, 'INVALID_REQUEST');
   const input = JSON.parse(raw);
   if (typeof input.email !== 'string' || typeof input.password !== 'string' ||
       input.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ||
       !input.password.length || input.password.length > 4096) return reply(400, 'INVALID_REQUEST');
   const account = await resolve(input.email.trim().toLowerCase());
   if (account.limited) return reply(429, 'LOGIN_RATE_LIMIT');
   if (!account.phone) return reply(401, 'INVALID_CREDENTIALS');
   const session = await signIn(account.phone, input.password);
   if (!session) return reply(401, 'INVALID_CREDENTIALS');
   if (!session.access_token || !session.refresh_token) return reply(503, 'LOGIN_UNAVAILABLE');
   // Only authenticated session tokens; never return a pre-auth phone/lookup result.
   return new Response(JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }), {status:200,headers});
  } catch { return reply(503, 'LOGIN_UNAVAILABLE'); }
 };
}
