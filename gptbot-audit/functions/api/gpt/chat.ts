// POST /api/gpt/chat — main chat turn.
// Body: { sessionId, message, locale, history?, turnstileToken? }
// Enforces hashed-IP quotas, calls OpenRouter server-side with a model
// fallback chain, persists both messages + usage, returns a friendly error
// on provider failure instead of crashing.
import type { Env } from '../../_types';
import { resolveConfig, modelChain } from '../../lib/gpt-chat/config';
import { ensureSchema } from '../../lib/gpt-chat/schema';
import { hashIp, getClientIp } from '../../lib/gpt-chat/hash';
import { json, fail, readJson, genId } from '../../lib/gpt-chat/http';
import { normLocale, validateMessage } from '../../lib/gpt-chat/validate';
import { readUsage, recordUsage, decideQuota } from '../../lib/gpt-chat/quota';
import { buildMessages, type ChatMessage } from '../../lib/gpt-chat/prompt';
import { chatComplete } from '../../lib/gpt-chat/openrouter-chat';
import { verifyTurnstile } from '../../lib/turnstile';
import { proxyToRailway, relay } from '../../lib/gpt-chat/gateway';

interface ChatBody {
  sessionId?: string;
  message?: string;
  locale?: string;
  history?: ChatMessage[];
  turnstileToken?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Prefer the Railway backend (Supabase-backed) when configured. On any
  // transport failure or 5xx, fall through to the local D1 implementation so
  // production chat never fully breaks.
  const g = await proxyToRailway(env, request, '/v1/gpt/chat');
  if (g.proxied && g.response) return relay(g.response);

  const cfg = resolveConfig(env);
  const body = await readJson<ChatBody>(request);
  if (!body) return fail('bad_json', 'Invalid JSON body');

  const msg = validateMessage(body.message, cfg.maxInputChars);
  if (!msg.ok) return fail('invalid_message', msg.error || 'invalid message');

  const locale = normLocale(body.locale);
  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId.slice(0, 64) : genId('sess');
  const plan: 'free' | 'paid' = 'free'; // MVP: anonymous users are free tier
  const db = env.GPTBOT_DRAFTS_DB;
  const ip = getClientIp(request);
  const hashedIp = await hashIp(ip, cfg.hashSalt);

  // Turnstile is optional; verifyTurnstile returns true when unconfigured.
  // Only enforced when a token is supplied OR the secret is set.
  if (env.TURNSTILE_SECRET_KEY && body.turnstileToken) {
    const okTs = await verifyTurnstile(env, body.turnstileToken, ip);
    if (!okTs) return fail('turnstile_failed', 'Проверка не пройдена. Обновите страницу.', 403);
  }

  // Quota (DB-backed; skipped only if no D1 binding at all).
  if (db) {
    try {
      await ensureSchema(db);
      const usage = await readUsage(db, hashedIp);
      const decision = decideQuota(usage, cfg, plan);
      if (!decision.allowed) {
        return json({
          ok: false,
          code: 'limit_reached',
          reason: decision.reason,
          remaining: 0,
          message:
            decision.reason === 'hourly'
              ? 'Слишком много сообщений за час. Попробуйте позже или оформите Plus.'
              : 'Дневной лимит бесплатных сообщений исчерпан. Возвращайтесь завтра или оформите Plus.',
        }, 429);
      }
    } catch {
      // If quota read fails we do NOT hard-block — chat proceeds without
      // durable counting this turn. Abuse is still bounded by the model chain.
    }
  }

  // Provider call.
  const messages = buildMessages(body.history, msg.value!, cfg.maxHistoryTurns, locale);
  const result = await chatComplete(env, cfg, modelChain(cfg, plan), messages);

  if (!result.ok) {
    const friendly =
      result.errorCode === 'no_key'
        ? 'AI-чат временно не настроен. Попробуйте позже.'
        : result.errorCode === 'rate_limit'
          ? 'Сейчас много запросов. Попробуйте ещё раз через минуту.'
          : 'Не удалось получить ответ. Попробуйте переформулировать или повторить.';
    // 200 with ok:false so the client renders an error state, not a crash.
    return json({ ok: false, code: 'provider_error', message: friendly, sessionId });
  }

  const answer = result.content!;
  const nowIso = new Date().toISOString();

  // Persist (best-effort — never block the answer on a write failure).
  if (db) {
    try {
      await db.batch([
        db.prepare('INSERT INTO gpt_messages (id, session_id, role, content, model_used, token_in, token_out, cost_usd, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .bind(genId('msg'), sessionId, 'user', msg.value!, null, result.inputTokens ?? null, null, null, nowIso),
        db.prepare('INSERT INTO gpt_messages (id, session_id, role, content, model_used, token_in, token_out, cost_usd, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .bind(genId('msg'), sessionId, 'assistant', answer, result.modelUsed ?? null, null, result.outputTokens ?? null, null, nowIso),
        db.prepare('UPDATE gpt_sessions SET last_activity_at = ? WHERE id = ?').bind(nowIso, sessionId),
      ]);
      await recordUsage(db, hashedIp, null, result.inputTokens ?? 0, result.outputTokens ?? 0);
    } catch {
      /* best-effort persistence */
    }
  }

  let remaining = -1;
  if (db) {
    try {
      const usage = await readUsage(db, hashedIp);
      remaining = decideQuota(usage, cfg, plan).remaining;
    } catch { /* leave -1 = unknown */ }
  }

  return json({ ok: true, answer, remaining, modelUsed: result.modelUsed, sessionId });
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
