import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { resolveUser } from '../context.js';
import { assertOrigin } from '../auth.js';
import { hashIp, clientIp } from '../hash.js';
import { PLANS, resolvePlan, decideQuota, modelChain, type Plan } from '../plans.js';
import { buildMessages, sessionTitle, detectIntent, type Locale } from '../prompt.js';
import { chatComplete, chatStream } from '../openrouter.js';

const Body = z.object({
  sessionId: z.string().max(80).optional(),
  message: z.string().min(1),
  locale: z.enum(['ru', 'uz']).default('ru'),
  stream: z.boolean().optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).max(40).optional(),
});

export function chatRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/v1/gpt/chat', async (req, reply) => {
    if (!assertOrigin(req, ctx.cfg)) return reply.code(403).send({ ok: false, code: 'origin' });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, code: 'bad_request', message: 'invalid body' });
    const { message, locale, sessionId } = parsed.data;

    const user = await resolveUser(ctx, req);
    const sub = user ? await ctx.store.activeSubscription(user.id) : null;
    const plan: Plan = resolvePlan({ authenticated: !!user, subscriptionPlan: sub?.plan, subscriptionActive: sub?.status === 'active' });
    const limits = PLANS[plan];

    if (message.length > limits.maxInputChars) {
      return reply.code(400).send({ ok: false, code: 'too_long', message: `Максимум ${limits.maxInputChars} символов.` });
    }

    const ip = clientIp(req.headers);
    const hashedIp = hashIp(ip, ctx.cfg.hashSalt);

    // Quota (only when Supabase is enabled; otherwise CF gateway/D1 counts).
    if (ctx.store.enabled) {
      const usage = await ctx.store.readUsage(hashedIp, user?.id ?? null);
      const q = decideQuota(usage, plan);
      if (!q.allowed) {
        await ctx.store.event('GPTChatLimitReached', sessionId ?? null, user?.id ?? null, { plan, reason: q.reason });
        return reply.code(429).send({
          ok: false, code: 'limit_reached', reason: q.reason, remaining: 0,
          message: q.reason === 'hourly'
            ? 'Слишком много сообщений за час. Попробуйте позже или оформите Plus.'
            : 'Лимит бесплатных сообщений исчерпан. Возвращайтесь позже или оформите Plus.',
        });
      }
    }

    // Ownership: if a sessionId + user, ensure it belongs to the user.
    let sid = sessionId ?? null;
    if (sid && user) {
      const owner = await ctx.store.getSessionOwner(sid);
      if (owner && owner.user_id && owner.user_id !== user.id) return reply.code(403).send({ ok: false, code: 'forbidden' });
    }

    // Build context: prefer server-side stored history for authed users.
    const meta = sid ? await ctx.store.getSessionMeta(sid) : null;
    const serverHistory = sid && ctx.store.enabled ? await ctx.store.recentMessages(sid, limits.historyTurns * 2) : [];
    const history = serverHistory.length ? serverHistory : (parsed.data.history ?? []);
    const messages = buildMessages({ summary: meta?.summary, history, userMessage: message, maxTurns: limits.historyTurns });
    const chain = modelChain(ctx.cfg, plan);

    const onError = (e: { errorCode: string; status?: number; model?: string; detail?: string }) => {
      void ctx.store.providerError({
        provider: 'openrouter', model: e.model ?? null, status_code: e.status ?? null,
        error_code: e.errorCode, error_message: (e.detail ?? '').slice(0, 500), session_id: sid,
      });
      void ctx.store.event('GPTChatProviderError', sid, user?.id ?? null, { code: e.errorCode });
    };

    const wantStream = parsed.data.stream === true;

    // Persist the user message up front (so it survives even a provider failure).
    if (sid && ctx.store.enabled) {
      await ctx.store.saveMessage({ session_id: sid, user_id: user?.id ?? null, role: 'user', content: message });
      await ctx.store.setSessionTitleIfEmpty(sid, sessionTitle(message, locale as Locale));
      void ctx.store.event('GPTChatMessageSent', sid, user?.id ?? null, { plan });
    }

    const persistAssistant = async (content: string, modelUsed: string, tokIn: number, tokOut: number) => {
      if (!sid || !ctx.store.enabled) return;
      await ctx.store.saveMessage({ session_id: sid, user_id: user?.id ?? null, role: 'assistant', content, model_used: modelUsed, token_in: tokIn, token_out: tokOut, cost_usd: estimateCost(modelUsed, tokIn, tokOut) });
      await ctx.store.recordUsage({ hashedIp, userId: user?.id ?? null, sessionId: sid, tokIn, tokOut });
      await ctx.store.touchSession(sid);
      void ctx.store.event('GPTChatAnswerReceived', sid, user?.id ?? null, { model: modelUsed });
    };

    // ── Streaming (SSE) ──
    if (wantStream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('meta', { sessionId: sid, plan });
      const result = await chatStream(ctx.cfg, chain, messages, (delta) => send('delta', { t: delta }), { maxTokens: 900, onError });
      if (result.ok) {
        await persistAssistant(result.content, result.modelUsed, result.inputTokens, result.outputTokens);
        send('done', { ok: true, modelUsed: result.modelUsed, sessionId: sid });
      } else {
        send('done', { ok: false, code: result.errorCode, message: friendly(result.errorCode) });
      }
      reply.raw.end();
      return reply;
    }

    // ── Non-streaming ──
    const result = await chatComplete(ctx.cfg, chain, messages, { maxTokens: 900, onError });
    if (!result.ok) {
      return reply.send({ ok: false, code: 'provider_error', message: friendly(result.errorCode), sessionId: sid });
    }
    await persistAssistant(result.content, result.modelUsed, result.inputTokens, result.outputTokens);

    let remaining = -1;
    if (ctx.store.enabled) {
      const usage = await ctx.store.readUsage(hashedIp, user?.id ?? null);
      remaining = decideQuota(usage, plan).remaining;
    }
    const intent = detectIntent(message);
    return reply.send({
      ok: true, answer: result.content, remaining, modelUsed: result.modelUsed, sessionId: sid, plan,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      leadHint: intent !== 'unknown' ? intent : undefined,
    });
  });
}

function friendly(code: string): string {
  if (code === 'no_key') return 'AI-чат временно не настроен. Попробуйте позже.';
  if (code === 'rate_limit') return 'Сейчас много запросов. Повторите через минуту.';
  return 'Не удалось получить ответ. Попробуйте переформулировать или повторить.';
}

// Rough cost estimate (USD) using approximate OpenRouter per-1M prices from
// the strategic report. Free models = 0. Best-effort only.
const PRICE: Record<string, [number, number]> = {
  'mistralai/mistral-small-3.2-24b-instruct': [0.075, 0.2],
  'meta-llama/llama-3.3-70b-instruct': [0.1, 0.32],
  'deepseek/deepseek-chat': [0.2002, 0.8001],
};
function estimateCost(model: string, tokIn: number, tokOut: number): number {
  if (model.includes(':free')) return 0;
  const p = PRICE[model];
  if (!p) return 0;
  return +(((tokIn / 1e6) * p[0] + (tokOut / 1e6) * p[1]).toFixed(6));
}
