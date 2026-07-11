// GET /api/gpt/history?sessionId=... — return the current session's messages.
// MVP: anonymous, scoped strictly to the passed sessionId (no cross-session
// access). Registered-user history is an MVP2 extension point.
import type { Env } from '../../_types';
import { ensureSchema } from '../../lib/gpt-chat/schema';
import { json, fail } from '../../lib/gpt-chat/http';
import { proxyToRailway, relay } from '../../lib/gpt-chat/gateway';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  // Railway history is auth-based (user sessions); forward query + Authorization.
  const g = await proxyToRailway(env, request, `/v1/gpt/history${url.search}`, { method: 'GET' });
  if (g.proxied && g.response) return relay(g.response);

  const sessionId = (url.searchParams.get('sessionId') || '').slice(0, 64);
  if (!sessionId) return fail('missing_session', 'sessionId is required');

  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return json({ ok: true, messages: [] });

  try {
    await ensureSchema(db);
    const rows = await db
      .prepare('SELECT role, content, model_used AS model, created_at FROM gpt_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 200')
      .bind(sessionId)
      .all<{ role: string; content: string; model: string | null; created_at: string }>();
    return json({ ok: true, messages: rows.results ?? [] });
  } catch {
    return json({ ok: true, messages: [] });
  }
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use GET', 405);
