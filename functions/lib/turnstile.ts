// Cloudflare Turnstile server-side verification.
// If TURNSTILE_SECRET_KEY is absent, returns true (dev / not configured).
import type { Env } from '../_types';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 5_000;

export interface TurnstileExpectations {
  expectedAction?: string;
  expectedHostname?: string;
}

export type TurnstileVerification =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'unavailable' };

interface SiteverifyResponse {
  success?: boolean;
  action?: string;
  hostname?: string;
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

export async function checkTurnstile(
  env: Env,
  token: string | undefined,
  ip: string | undefined,
  expectations: TurnstileExpectations = {},
): Promise<TurnstileVerification> {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: true }; // not configured → skip
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedToken || normalizedToken.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: 'invalid' };
  }

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', normalizedToken);
  if (ip) form.append('remoteip', ip);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    const data = await res.json() as SiteverifyResponse;
    if (data.success !== true) return { ok: false, reason: 'invalid' };
    if (expectations.expectedAction && data.action !== expectations.expectedAction) {
      return { ok: false, reason: 'invalid' };
    }
    if (
      expectations.expectedHostname
      && normalizeHostname(data.hostname || '') !== normalizeHostname(expectations.expectedHostname)
    ) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  ip: string | undefined,
  expectations: TurnstileExpectations = {},
): Promise<boolean> {
  return (await checkTurnstile(env, token, ip, expectations)).ok;
}
