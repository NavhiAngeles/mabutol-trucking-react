import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { authSmsHandler } from './handler.js';

const secret = Deno.env.get('TEXTBEE_AUTH_HOOK_SECRET');
const webhook = secret ? new Webhook(secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '')) : null;
Deno.serve(authSmsHandler({
  verify: webhook ? (body: string, headers: Record<string, string>) => webhook.verify(body, headers) : null,
  apiKey: Deno.env.get('TEXTBEE_API_KEY'), deviceId: Deno.env.get('TEXTBEE_DEVICE_ID'),
}));
