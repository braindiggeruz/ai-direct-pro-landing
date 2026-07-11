// POST /api/gpt/session — create an anonymous chat session.
// Stores a hashed IP (never raw), returns { sessionId }. Safe to call
// repeatedly; the client persists the id in localStorage.
import type { Env } from '../../_types';
import { resolveConfig } from '../../lib/gpt-chat/config';
import { ensureSchema } from '../../lib/gpt-chat/schema';
import { hashIp, getClientIp } from '../../lib/gpt-chat/hash';
import { json, fail, readJson, genId } from '../../lib/gpt-chat/http';
import { normLocale } from '../../lib/gpt-chat/validate';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const cfg = resolveConfig(env);
  const body = (await readJson<{ locale?: string; source?: string }>(request)) || {};
  const locale = normLocale(body.locale);
  const source = typeof body.source === 'string' ? body.source.slice(0, 60) : 'gpt_chat';
  const sessionId = genId('sess');
  const nowIso = new Date().toISOString();

  const db = env.GPTBOT_DRAFTS_DB;
  if (db) {
    try {
      await ensureSchema(db);
      const hashedIp = await hashIp(getClientIp(request), cfg.hashSalt);
      await db
        .prepare(
          `INSERT INTO gpt_sessions (id, user_id, anon_token, hashed_ip, locale, source, created_at, last_activity_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(sessionId, genId('anon'), hashedIp, locale, source, nowIso, nowIso)
        .run();
    } catch {
      // Degrade gracefully: return an ephemeral session id so the chat still
      // works even if the DB is briefly unavailable. Quotas re-key on IP.
      return json({ ok: true, sessionId, persisted: false });
    }
  }
  return json({ ok: true, sessionId, persisted: !!db }, 200, {
    'Set-Cookie': `gpt_sid=${sessionId}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
  });
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
