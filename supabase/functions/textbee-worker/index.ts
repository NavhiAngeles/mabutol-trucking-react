import { createClient } from 'npm:@supabase/supabase-js@2.114.0';
import { sendTextBee, shipmentMessage } from '../_shared/textbee.js';

const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const serverKey = typeof secretKeys.default === 'string' ? secretKeys.default : '';
const db = serverKey ? createClient(Deno.env.get('SUPABASE_URL') || '', serverKey, { auth: { persistSession: false } }) : null;
Deno.serve(async request => {
  // Only the approved default server secret; reject legacy, user and other named keys.
  // No client-selected recipient/text is accepted.
  if (!serverKey || request.headers.get('apikey') !== serverKey) return new Response(null, { status: 401 });
  const apiKey = Deno.env.get('TEXTBEE_API_KEY');
  const deviceId = Deno.env.get('TEXTBEE_DEVICE_ID');
  if (request.method === 'GET') {
    if (!apiKey || !deviceId) return Response.json({ configured: false }, { status: 503 });
    try {
      const response = await fetch(`https://api.textbee.dev/api/v1/gateway/devices/${encodeURIComponent(deviceId)}`, {
        headers: { 'x-api-key': apiKey }, redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      // Return no phone number, API key or device payload.
      return Response.json({ configured: true, deviceAccessible: response.ok, providerStatus: response.status });
    } catch { return Response.json({ configured: true, deviceAccessible: false }, { status: 502 }); }
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!apiKey || !deviceId) return Response.json({ error: 'SMS_NOT_CONFIGURED' }, { status: 503 });
  const { data: jobs, error } = await db.rpc('claim_textbee_shipments');
  if (error) return Response.json({ error: 'QUEUE_UNAVAILABLE' }, { status: 503 });
  let queued = 0;
  for (const job of jobs ?? []) {
    let state = 'unknown'; let batch = null;
    try {
      const result = await sendTextBee({ apiKey, deviceId, phone: job.phone, message: shipmentMessage() });
      state = 'queued'; batch = result.batchId; queued++;
    } catch (error) {
      state = error.message === 'SMS_OUTCOME_UNKNOWN' ? 'unknown' : 'failed';
    }
    // Reserved jobs are never automatically resent, even if this persistence fails.
    await db.from('sms_outbox').update({ state, provider_batch: batch }).eq('id', job.id).eq('state', 'sending');
  }
  return Response.json({ processed: jobs?.length ?? 0, queued });
});
