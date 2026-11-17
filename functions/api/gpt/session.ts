// POST /api/gpt/session — create an anonymous chat session.
// Stores a hashed IP (never raw), returns { sessionId }. Safe to call
// repeatedly; the client persists the id in localStorage.
//
// A browser asks once and keeps the id, so many requests from one address in
// an hour are not visitors: on 11.11.2026 a vulnerability scanner made 1 026
// empty sessions in a day and bent the funnel's numbers. Past
// SESSIONS_PER_HOUR the answer is the one a database that cannot be written
// already gives, an id that is not stored and no session cookies: the chat
// answers and its limits hold (they are counted by address and account, not
// by session), nothing is refused, and chat.ts keeps no turns for a session
// its caller does not own. The ceiling is generous on purpose: a school or a mobile carrier
// puts many people behind one address. `source` is kept only when it is a
// short lower-case label; anything else is stored as the default, never as sent.
import type { Env } from '../../_types';
import { resolveConfig } from '../../lib/gpt-chat/config';
import { ensureSchema } from '../../lib/gpt-chat/schema';
import { hashIp, getClientIp, hashToken } from '../../lib/gpt-chat/hash';
import { json, fail, readJson, genId } from '../../lib/gpt-chat/http';
import { normLocale } from '../../lib/gpt-chat/validate';
import { proxyToRailway, relay } from '../../lib/gpt-chat/gateway';
import { consumeRateLimit, HOUR_MS } from '../../lib/gpt-chat/rate-limit';

/** Stored sessions per hashed address and hour; gpt_rate_limits action gpt_session. */
export const SESSIONS_PER_HOUR = 120;
const SOURCE = /^[a-z][a-z0-9_]{0,39}$/;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Prefer the Railway backend when configured; fall back to D1 below.
  const g = await proxyToRailway(env, request, '/v1/gpt/session');
  if (g.proxied && g.response) return relay(g.response);

  const cfg = resolveConfig(env);
  const body = (await readJson<{ locale?: string; source?: string }>(request)) || {};
  const locale = normLocale(body.locale);
  const source = typeof body.source === 'string' && SOURCE.test(body.source) ? body.source : 'gpt_chat';
  const sessionId = genId('sess');
  const anonToken = genId('anon');
  const anonTokenHash = await hashToken(anonToken);
  const nowIso = new Date().toISOString();

  const db = env.GPTBOT_DRAFTS_DB;
  if (db) {
    try {
      await ensureSchema(db);
      const hashedIp = await hashIp(getClientIp(request), cfg);
      // A counter that cannot be read lets the session through (consumeRateLimit degrades open).
      if (hashedIp && !(await consumeRateLimit(db, 'gpt_session', hashedIp, { limit: SESSIONS_PER_HOUR, windowMs: HOUR_MS })).allowed)
        return json({ ok: true, sessionId, persisted: false });
      await db
        .prepare(
          `INSERT INTO gpt_sessions (id, user_id, anon_token, hashed_ip, locale, source, created_at, last_activity_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(sessionId, anonTokenHash, hashedIp, locale, source, nowIso, nowIso)
        .run();
    } catch {
      // Degrade gracefully: return an ephemeral session id so the chat still
      // works even if the DB is briefly unavailable. Quotas re-key on IP.
      return json({ ok: true, sessionId, persisted: false });
    }
  }
  const response = json({ ok: true, sessionId, persisted: !!db });
  response.headers.append('Set-Cookie', `gpt_sid=${sessionId}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`);
  response.headers.append('Set-Cookie', `gpt_sat=${anonToken}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`);
  return response;
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
