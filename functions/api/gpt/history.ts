// GET /api/gpt/history?sessionId=... — return the current session's messages.
// MVP: anonymous, scoped strictly to the passed sessionId (no cross-session
// access). Registered-user history is an MVP2 extension point.
import type { Env } from '../../_types';
import { ensureSchema } from '../../lib/gpt-chat/schema';
import { json, fail } from '../../lib/gpt-chat/http';
import { proxyToRailway, relay } from '../../lib/gpt-chat/gateway';
import { resolveConfig } from '../../lib/gpt-chat/config';
import { sha256Hex } from '../../lib/gpt-chat/hash';

function cookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function sameValue(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  // Railway history is auth-based (user sessions); forward query + Authorization.
  const g = await proxyToRailway(env, request, `/v1/gpt/history${url.search}`, { method: 'GET' });
  if (g.proxied && g.response) return relay(g.response);

  const sessionId = (url.searchParams.get('sessionId') || '').slice(0, 64);
  if (!sessionId) return fail('missing_session', 'sessionId is required');

  // The random session id is an identifier, not authorization. Both an
  // HttpOnly session cookie and the independent secret-token cookie must match
  // the stored token hash before any message content is read.
  const sid = cookie(request, 'gpt_sid');
  const token = cookie(request, 'gpt_sat');
  if (!sid || !token || !sameValue(sid, sessionId)) return fail('forbidden', 'Forbidden', 403);

  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return fail('store_unavailable', 'Storage unavailable', 503);

  try {
    await ensureSchema(db);
    const session = await db.prepare(
      'SELECT anon_token FROM gpt_sessions WHERE id = ? LIMIT 1',
    ).bind(sessionId).first<{ anon_token: string | null }>();
    const suppliedHash = await sha256Hex(`${token}${resolveConfig(env).hashSalt}`);
    if (!session?.anon_token || !sameValue(session.anon_token, suppliedHash)) {
      return fail('forbidden', 'Forbidden', 403);
    }
    const rows = await db
      .prepare('SELECT role, content, model_used AS model, created_at FROM gpt_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 200')
      .bind(sessionId)
      .all<{ role: string; content: string; model: string | null; created_at: string }>();
    return json({ ok: true, messages: rows.results ?? [] });
  } catch {
    return fail('store_unavailable', 'Storage unavailable', 503);
  }
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use GET', 405);
