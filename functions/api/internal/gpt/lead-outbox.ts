import type { Env } from '../../../_types';
import { resolveBridgeLimits, type BridgeEnv } from '../../../lib/gpt-chat/bridge-env';
import { drainLeadOutbox } from '../../../lib/gpt-chat/lead-outbox';
import { ensureSchema } from '../../../lib/gpt-chat/schema';
import { fail, json } from '../../../lib/gpt-chat/http';

function sameSecret(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

/** Authenticated retry hook for cron/operations. Never exposed to browsers. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const expected = env.GPTBOT_INTERNAL_API_SECRET || '';
  const supplied = request.headers.get('X-Internal-Secret') || '';
  if (!expected) return fail('not_found', 'Not found', 404);
  if (!sameSecret(supplied, expected)) return fail('unauthorized', 'Unauthorized', 401);
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return fail('store_unavailable', 'Storage unavailable', 503);
  try {
    await ensureSchema(db);
    const bridgeEnv = env as BridgeEnv;
    const limits = resolveBridgeLimits(bridgeEnv);
    return json({ ok: true, ...(await drainLeadOutbox(bridgeEnv, db, limits.ownerAlertsPerHour)) });
  } catch {
    return fail('store_unavailable', 'Storage unavailable', 503);
  }
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
