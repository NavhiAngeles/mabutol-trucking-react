import { otpMessage, sendTextBee } from '../_shared/textbee.js';

export function authSmsHandler({ verify, send = sendTextBee, apiKey, deviceId }) {
  return async request => {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (!apiKey || !deviceId || !verify) return Response.json({ error: { message: 'SMS is not configured', http_code: 503 } }, { status: 503 });
    const raw = await request.text();
    if (raw.length > 20000) return new Response(null, { status: 413 });
    let event;
    try { event = await verify(raw, Object.fromEntries(request.headers)); }
    catch { return new Response(null, { status: 401 }); }
    try {
      await send({ apiKey, deviceId, phone: event.user?.phone, message: otpMessage(event.sms?.otp) });
      return Response.json({});
    } catch {
      // Do not expose provider bodies, OTPs or phone numbers in logs/responses.
      return Response.json({ error: { message: 'Verification SMS could not be queued. Try again later.', http_code: 503 } }, { status: 503 });
    }
  };
}
