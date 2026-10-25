/** Server-only transport. Acceptance means queued by TextBee, never delivered. */
export class SmsTransportError extends Error {
  constructor(code) { super(code); this.name = 'SmsTransportError'; }
}

export function normalizeSmsPhone(raw) {
  const cleaned = String(raw ?? '').trim().replace(/[ ()-]/g, '');
  const phone = /^09\d{9}$/.test(cleaned) ? `+63${cleaned.slice(1)}`
    : /^9\d{9}$/.test(cleaned) ? `+63${cleaned}`
    : /^639\d{9}$/.test(cleaned) ? `+${cleaned}` : cleaned;
  if (!/^\+639\d{9}$/.test(phone)) throw new SmsTransportError('INVALID_SMS_PHONE');
  return phone;
}

export async function sendTextBee({ apiKey, deviceId, phone, message, fetchImpl = fetch }) {
  if (!apiKey || !/^[a-f0-9]{24}$/i.test(deviceId ?? '')) {
    throw new SmsTransportError('SMS_NOT_CONFIGURED');
  }
  const recipient = normalizeSmsPhone(phone);
  // Keep OTP and notification templates short; avoid accidentally shipping raw records.
  if (typeof message !== 'string' || !message.trim() || message.length > 160) {
    throw new SmsTransportError('INVALID_SMS_MESSAGE');
  }
  let response;
  try {
    response = await fetchImpl('https://api.textbee.dev/api/v1/gateway/send-sms', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2500),
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ recipients: [recipient], message, deviceId }),
    });
  } catch {
    // An interrupted request may already have been accepted. Do not automatically resend.
    throw new SmsTransportError('SMS_OUTCOME_UNKNOWN');
  }
  if (!response.ok) throw new SmsTransportError(
    response.status === 429 ? 'SMS_QUOTA_REACHED' : 'SMS_PROVIDER_REJECTED');
  let payload;
  try { payload = await response.json(); } catch { throw new SmsTransportError('SMS_OUTCOME_UNKNOWN'); }
  const batch = payload?.data;
  if (batch?.success !== true || typeof batch.smsBatchId !== 'string' || !batch.smsBatchId) {
    throw new SmsTransportError('SMS_OUTCOME_UNKNOWN');
  }
  return { status: 'queued', batchId: batch.smsBatchId };
}

export function otpMessage(code) {
  if (!/^\d{6,8}$/.test(String(code))) throw new SmsTransportError('INVALID_SMS_CODE');
  return `Tanaw verification code: ${code}. Do not share this code.`;
}

export function shipmentMessage() {
  // No customer names, addresses, cargo, proof or free-text notes sent to a shared SMS inbox.
  return 'Tanaw: Your shipment has an update. Open Tanaw to view its current status.';
}
