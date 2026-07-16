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
import { chatStreamStart, parseSseChunk } from '../../lib/gpt-chat/openrouter-stream';
import { verifyTurnstile } from '../../lib/turnstile';
import { proxyToRailway, relay } from '../../lib/gpt-chat/gateway';

interface ChatBody {
  sessionId?: string;
  message?: string;
  locale?: string;
  history?: ChatMessage[];
  turnstileToken?: string;
  /** When true the response is SSE (text/event-stream) instead of JSON. */
  stream?: boolean;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const cfg = resolveConfig(env);
  const bodyText = await request.clone().text();
  const body = await readJson<ChatBody>(request);
  if (!body) return fail('bad_json', 'Invalid JSON body');
  const wantStream = body.stream === true;

  // Prefer the Railway backend (Supabase-backed) when configured — JSON mode
  // only; streaming always runs the local path. On any transport failure or
  // 5xx, fall through to the local D1 implementation so chat never breaks.
  if (!wantStream) {
    const g = await proxyToRailway(env, request, '/v1/gpt/chat', { bodyText });
    if (g.proxied && g.response) return relay(g.response);
  }

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

  if (wantStream) {
    const start = await chatStreamStart(env, cfg, modelChain(cfg, plan), messages);
    if (!start.ok) {
      const friendly =
        start.errorCode === 'no_key'
          ? 'AI-чат временно не настроен. Попробуйте позже.'
          : start.errorCode === 'rate_limit'
            ? 'Сейчас много запросов. Попробуйте ещё раз через минуту.'
            : 'Не удалось получить ответ. Попробуйте переформулировать или повторить.';
      // Plain JSON (not SSE) — the client falls back on Content-Type.
      return json({ ok: false, code: 'provider_error', message: friendly, sessionId });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const send = (obj: unknown) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

    const pump = async () => {
      const reader = start.body.getReader();
      const state = { buffer: '' };
      let answer = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let clientGone = false;
      try {
        await send({ type: 'meta', sessionId, model: start.model });
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const ev of parseSseChunk(state, decoder.decode(value, { stream: true }))) {
            if (ev.inputTokens !== undefined) inputTokens = ev.inputTokens ?? 0;
            if (ev.outputTokens !== undefined) outputTokens = ev.outputTokens ?? 0;
            if (ev.delta) {
              answer += ev.delta;
              try { await send({ type: 'delta', text: ev.delta }); } catch { clientGone = true; }
            }
            if (clientGone) break;
          }
          if (clientGone) break;
        }
      } catch {
        // Upstream broke mid-stream. If nothing was produced, tell the client;
        // a partial answer is still worth keeping on their side.
        if (!answer && !clientGone) { try { await send({ type: 'error', code: 'provider_error' }); } catch { /* client gone */ } }
      } finally {
        start.abort();
      }

      // Persist + usage + remaining (best-effort), then close the stream.
      const nowIso = new Date().toISOString();
      let remaining = -1;
      if (db && answer) {
        try {
          await db.batch([
            db.prepare('INSERT INTO gpt_messages (id, session_id, role, content, model_used, token_in, token_out, cost_usd, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
              .bind(genId('msg'), sessionId, 'user', msg.value!, null, inputTokens || null, null, null, nowIso),
            db.prepare('INSERT INTO gpt_messages (id, session_id, role, content, model_used, token_in, token_out, cost_usd, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
              .bind(genId('msg'), sessionId, 'assistant', answer, start.model, null, outputTokens || null, null, nowIso),
            db.prepare('UPDATE gpt_sessions SET last_activity_at = ? WHERE id = ?').bind(nowIso, sessionId),
          ]);
          await recordUsage(db, hashedIp, null, inputTokens, outputTokens);
          const usage = await readUsage(db, hashedIp);
          remaining = decideQuota(usage, cfg, plan).remaining;
        } catch { /* best-effort */ }
      }
      if (answer && !clientGone) {
        try { await send({ type: 'done', remaining, modelUsed: start.model }); } catch { /* client gone */ }
      }
      try { await writer.close(); } catch { /* already closed */ }
    };
    waitUntil(pump());

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  }

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
