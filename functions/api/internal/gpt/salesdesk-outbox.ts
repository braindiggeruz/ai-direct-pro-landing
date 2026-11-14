import type { BillingEnv } from '../../../lib/gpt-chat/billing-config';
import { internalAuthorized } from '../../../lib/gpt-chat/internal-auth';
import { ensureSchema } from '../../../lib/gpt-chat/schema';
import { drainSalesdeskOutbox, salesdeskOutboxHealth } from '../../../lib/gpt-chat/salesdesk-outbox';
import { fail, json } from '../../../lib/gpt-chat/http';

/** Authenticated operational retry only; periodic recovery uses maintenance. */
export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!internalAuthorized(request, env.GPT_BILLING_MAINTENANCE_SECRET)) return fail('forbidden', 'Forbidden', 403);
  if (!env.GPTBOT_DRAFTS_DB) return fail('unavailable', 'Unavailable', 503);
  try {
    await ensureSchema(env.GPTBOT_DRAFTS_DB);
    const result = await drainSalesdeskOutbox(env, env.GPTBOT_DRAFTS_DB, 3);
    const queue = await salesdeskOutboxHealth(env.GPTBOT_DRAFTS_DB);
    return json({ ok: queue.failed === 0, ...result, queue }, queue.failed ? 503 : 200);
  } catch { return fail('store_unavailable', 'Storage unavailable', 503); }
};
export const onRequest: PagesFunction<BillingEnv> = async () => fail('method_not_allowed', 'Use POST', 405);
