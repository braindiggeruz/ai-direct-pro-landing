// POST /api/payments/webhook — payment provider webhook (SCAFFOLD).
// Verifies a shared secret and updates gpt_subscriptions / payment_attempts.
// When PAYMENT_WEBHOOK_SECRET is unset, safely rejects with 200 (so the
// provider does not retry-storm) but performs no state change.
import type { Env } from '../../_types';
import { ensureSchema } from '../../lib/gpt-chat/schema';
import { json, fail } from '../../lib/gpt-chat/http';
import { verifyWebhook } from '../../lib/gpt-chat/payments';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rawBody = await request.text();

  if (!env.PAYMENT_WEBHOOK_SECRET) {
    // Not configured: acknowledge without acting so no retry storm, but log nothing sensitive.
    return json({ ok: true, handled: false, reason: 'provider_not_configured' });
  }

  const valid = await verifyWebhook(env, request, rawBody);
  if (!valid) return fail('invalid_signature', 'Signature verification failed', 401);

  let evt: { type?: string; data?: Record<string, unknown> } = {};
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return fail('bad_json', 'Invalid webhook body');
  }

  const db = env.GPTBOT_DRAFTS_DB;
  if (db) {
    try {
      await ensureSchema(db);
      // Minimal, provider-agnostic status touch. Real adapters map their
      // event types (subscription_created / updated / cancelled) to the
      // gpt_subscriptions row. Left deliberately conservative for MVP.
      const nowIso = new Date().toISOString();
      await db
        .prepare('INSERT INTO gpt_events (id, session_id, user_id, event_name, payload_json, created_at) VALUES (?,?,?,?,?,?)')
        .bind(`evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`, null, null, `payment_webhook:${evt.type || 'unknown'}`, rawBody.slice(0, 4000), nowIso)
        .run();
    } catch {
      /* best-effort */
    }
  }

  return json({ ok: true, handled: true });
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
