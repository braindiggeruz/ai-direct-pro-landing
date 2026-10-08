import type { GptChatConfig } from './config';
import { cookieValue, authCookie } from './identity-store';
import { sha256Hex } from './hash';

const NAME = '__Host-gpt_trial';
const encoder = new TextEncoder();
async function signingKey(cfg: GptChatConfig) {
  if (!cfg.hashSalt) throw new Error('trial_identity_unavailable');
  return crypto.subtle.importKey('raw', encoder.encode(cfg.hashSalt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function readTrialKey(request: Request, cfg: GptChatConfig): Promise<string | null> {
  const raw = cookieValue(request, NAME);
  if (!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(raw)) return null;
  const [nonce, signature] = raw.split('.');
  const bytes = Uint8Array.from(signature.match(/../g)!, n => parseInt(n, 16));
  const valid = await crypto.subtle.verify('HMAC', await signingKey(cfg), bytes, encoder.encode(`gpt-trial-v1:${nonce}`));
  return valid ? `trial:${await sha256Hex(nonce)}` : null;
}
/** First account read claims a browser. No IP/fingerprint, no AI call. */
export async function claimTrialIdentity(request: Request, cfg: GptChatConfig): Promise<{ key: string; cookie: string | null }> {
  const existing = await readTrialKey(request, cfg);
  if (existing) return { key: existing, cookie: null };
  const nonce = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
  const signature = await crypto.subtle.sign('HMAC', await signingKey(cfg), encoder.encode(`gpt-trial-v1:${nonce}`));
  const mac = [...new Uint8Array(signature)].map(n => n.toString(16).padStart(2, '0')).join('');
  return { key: `trial:${await sha256Hex(nonce)}`, cookie: authCookie(NAME, `${nonce}.${mac}`, 400 * 86400) };
}
