// POST /api/gpt/subscribe — begin (or defer) a plan checkout.
// MVP: records a payment_attempt and returns manual mode unless a provider
// is fully wired. NEVER fabricates an active subscription.
import type { Env } from '../../_types';
import { ensureSchema } from '../../lib/gpt-chat/schema';
import { json, fail, readJson, genId } from '../../lib/gpt-chat/http';
import { createCheckout, activeProvider } from '../../lib/gpt-chat/payments';
import { proxyToRailway, relay } from '../../lib/gpt-chat/gateway';

interface SubBody {
  plan?: string; // 'plus' | 'business'
  sessionId?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const g = await proxyToRailway(env, request, '/v1/gpt/subscribe');
  if (g.proxied && g.response) return relay(g.response);

  const body = (await readJson<SubBody>(request)) || {};
  const plan = body.plan === 'business' ? 'business' : 'plus';
  const db = env.GPTBOT_DRAFTS_DB;
  const attemptId = genId('pay');
  const nowIso = new Date().toISOString();
  const provider = activeProvider(env);

  const checkout = await createCheckout(env, plan, attemptId);

  if (db) {
    try {
      await ensureSchema(db);
      await db
        .prepare(
          `INSERT INTO payment_attempts (id, user_id, provider, provider_checkout_id, amount, currency, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          attemptId, null, provider || 'manual', null,
          plan === 'plus' ? 5 : null, 'USD',
          checkout.mode === 'checkout' ? 'created' : 'manual_pending', nowIso, nowIso,
        )
        .run();
    } catch {
      /* best-effort — still return the checkout decision */
    }
  }

  return json({
    ok: true,
    mode: checkout.mode,
    plan,
    provider: checkout.provider || null,
    checkoutUrl: checkout.checkoutUrl ?? null,
    message: checkout.message,
    attemptId,
  });
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
