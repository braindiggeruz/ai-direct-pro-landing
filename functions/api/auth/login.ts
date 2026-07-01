import type { Env } from '../../_types';
import { signToken } from '../../lib/jwt';
import { verifyPassword } from '../../lib/password';
import { attemptKey, isLocked, registerFailure, clearFailures } from '../../lib/lockout';
import { verifyTurnstile } from '../../lib/turnstile';
import { jsonResponse } from '../../lib/api-errors';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { email?: string; password?: string; turnstileToken?: string };
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid body' }, 400); }
  const { email, password, turnstileToken } = body;
  if (!email || !password) return jsonResponse({ error: 'Missing email or password' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown';
  const key = attemptKey(ip, email);

  // Lockout check
  const lockedFor = await isLocked(env, key);
  if (lockedFor > 0) {
    return jsonResponse({ error: `Too many failed attempts. Try again in ${Math.ceil(lockedFor / 60)} min.`, lockedFor }, 429);
  }

  // Turnstile (optional)
  const turnstileOk = await verifyTurnstile(env, turnstileToken, ip);
  if (!turnstileOk) return jsonResponse({ error: 'Captcha verification failed' }, 403);

  // Email check
  if (email !== env.ADMIN_EMAIL) {
    await registerFailure(env, key);
    return jsonResponse({ error: 'Invalid credentials' }, 401);
  }

  // Password check: prefer hash, fall back to plain (dev only)
  let ok = false;
  if (env.ADMIN_PASSWORD_HASH) {
    ok = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  } else if (env.ADMIN_PASSWORD) {
    ok = password === env.ADMIN_PASSWORD;
  }
  if (!ok) {
    const r = await registerFailure(env, key);
    if (r.lockedFor > 0) {
      return jsonResponse({ error: `Locked for ${Math.ceil(r.lockedFor / 60)} min after ${r.count} failed attempts.`, lockedFor: r.lockedFor }, 429);
    }
    return jsonResponse({ error: 'Invalid credentials', remaining: Math.max(0, 5 - r.count) }, 401);
  }

  await clearFailures(env, key);
  const token = await signToken(env, { email, role: 'admin' });
  return jsonResponse({ token, email, role: 'admin' });
};
