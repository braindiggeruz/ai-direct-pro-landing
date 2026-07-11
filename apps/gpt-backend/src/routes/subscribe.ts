import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { resolveUser } from '../context.js';
import { assertOrigin, internalHeader, hasInternalSecret } from '../auth.js';

const SubBody = z.object({ plan: z.enum(['plus', 'business']).default('plus'), sessionId: z.string().max(80).optional() });

export function subscribeRoutes(app: FastifyInstance, ctx: AppContext) {
  // Begin (or defer) a checkout. MVP: manual mode, never fakes active sub.
  app.post('/v1/gpt/subscribe', async (req, reply) => {
    if (!assertOrigin(req, ctx.cfg)) return reply.code(403).send({ ok: false, code: 'origin' });
    const parsed = SubBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, code: 'bad_request' });
    const { plan, sessionId } = parsed.data;
    const user = await resolveUser(ctx, req);
    const provider = (process.env.PAYMENT_PROVIDER || '').toLowerCase().trim();

    const attemptId = await ctx.store.createPaymentAttempt({
      user_id: user?.id ?? null,
      provider: provider || 'manual',
      amount: plan === 'plus' ? 5 : null,
      currency: 'USD',
      status: 'created',
      metadata: { plan, sessionId: sessionId ?? null },
    });
    await ctx.store.event('GPTChatSubscribeIntent', sessionId ?? null, user?.id ?? null, { plan, provider: provider || 'manual' });

    // No live provider adapters wired yet → manual mode. Never mark active.
    return reply.send({
      ok: true,
      mode: 'manual',
      plan,
      provider: provider || null,
      checkoutUrl: null,
      attemptId,
      message: 'Оплата скоро будет доступна. Оставьте заявку — подключим тариф вручную.',
    });
  });

  // Provider webhook — verified secret, idempotent. Scaffold only.
  app.post('/v1/payments/webhook', async (req, reply) => {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) return reply.send({ ok: true, handled: false, reason: 'provider_not_configured' });

    const sig = (Array.isArray(req.headers['x-signature']) ? req.headers['x-signature'][0] : req.headers['x-signature'])
      || (Array.isArray(req.headers['x-webhook-secret']) ? req.headers['x-webhook-secret'][0] : req.headers['x-webhook-secret']);
    // Placeholder shared-secret check (provider HMAC added with real adapter).
    if (!hasInternalSecret(sig as string | undefined, secret)) return reply.code(401).send({ ok: false, code: 'invalid_signature' });

    const body = (req.body ?? {}) as { type?: string; data?: { checkoutId?: string } };
    const checkoutId = body.data?.checkoutId;
    // Idempotency: skip already-processed checkouts.
    if (checkoutId && (await ctx.store.webhookAlreadyProcessed(checkoutId))) {
      return reply.send({ ok: true, handled: true, idempotent: true });
    }
    await ctx.store.event(`payment_webhook:${body.type || 'unknown'}`, null, null, { checkoutId: checkoutId ?? null });
    return reply.send({ ok: true, handled: true });
  });

  // Internal-secret guarded example (kept for gateway/server-to-server calls).
  app.post('/v1/internal/ping', async (req, reply) => {
    if (!hasInternalSecret(internalHeader(req), ctx.cfg.internalSecret)) return reply.code(401).send({ ok: false });
    return { ok: true, pong: true };
  });
}
