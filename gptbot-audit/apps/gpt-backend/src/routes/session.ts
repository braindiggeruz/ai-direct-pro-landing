import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { resolveUser } from '../context.js';
import { assertOrigin } from '../auth.js';
import { hashIp, hashToken, newAnonToken, clientIp } from '../hash.js';
import { resolvePlan, planLimitsPublic, decideQuota } from '../plans.js';

const Body = z.object({
  locale: z.enum(['ru', 'uz']).default('ru'),
  source: z.string().max(60).optional(),
  anonToken: z.string().max(128).optional(),
});

export function sessionRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/v1/gpt/session', async (req, reply) => {
    if (!assertOrigin(req, ctx.cfg)) return reply.code(403).send({ ok: false, code: 'origin' });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, code: 'bad_request' });
    const { locale, source } = parsed.data;

    const user = await resolveUser(ctx, req);
    const ip = clientIp(req.headers);
    const hashedIp = hashIp(ip, ctx.cfg.hashSalt);
    const anonToken = parsed.data.anonToken || newAnonToken();
    const anonHash = hashToken(anonToken, ctx.cfg.hashSalt);

    const sub = user ? await ctx.store.activeSubscription(user.id) : null;
    const plan = resolvePlan({ authenticated: !!user, subscriptionPlan: sub?.plan, subscriptionActive: sub?.status === 'active' });

    const sessionId = await ctx.store.createSession({
      user_id: user?.id ?? null,
      anon_token_hash: user ? null : anonHash,
      hashed_ip: hashedIp,
      locale,
      source: source || 'web',
    });

    const usage = await ctx.store.readUsage(hashedIp, user?.id ?? null);
    const q = decideQuota(usage, plan);

    await ctx.store.event('GPTChatSessionStarted', sessionId, user?.id ?? null, { plan });

    return {
      ok: true,
      sessionId: sessionId ?? `ephemeral_${anonHash.slice(0, 16)}`,
      persisted: ctx.store.enabled && !!sessionId,
      plan,
      limits: planLimitsPublic(plan),
      remaining: q.remaining,
      anonToken: user ? undefined : anonToken,
    };
  });
}
