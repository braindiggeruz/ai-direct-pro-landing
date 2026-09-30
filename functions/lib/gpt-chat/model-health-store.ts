import { BILLING_ORG } from "./billing-config";
import {
  healthWildcards,
  OPENROUTER_PAID_WILDCARD,
  providerOf,
  providerWildcard,
  ZAI_WILDCARD,
} from "./model-provider";
// Durable cooldowns are shared between isolates. KV's eventual consistency is
// suitable for a catalogue cache, not admission, money or this cooldown gate.
//
// Wildcards are scoped (model-provider.ts healthWildcards): '*' blocks every
// OpenRouter model (one OpenRouter account), 'openrouter-paid/*' only the
// OpenRouter models that bill (no credits; ':free' still answers), 'zai/*'
// every Z.ai model (one Z.ai account). None blocks the other provider, so a
// dead Z.ai key or balance leaves the OpenRouter fallbacks answering, and an
// OpenRouter 402 leaves Z.ai answering.

/**
 * Model attempts per chat turn: the walkers' only retry layer. The walkers
 * count attempts, not chain slots, so a model that is cooling down or skipped
 * mid-walk (its account or its credits failed) never takes an attempt from a
 * live one.
 */
export const MAX_ATTEMPTS = 3;

/**
 * The models of the chain that are not cooling down, in chain order and
 * without duplicates. Blocked models are removed here, before the walker
 * spends any of its MAX_ATTEMPTS.
 */
export async function availableModels(
  db: D1Database | undefined,
  chain: string[],
  now = Date.now(),
): Promise<string[]> {
  const unique = [...new Set(chain)];
  if (!db) return unique;
  const rows = await db
    .prepare(
      "SELECT model FROM gpt_model_health WHERE org_id=? AND blocked_until>?",
    )
    .bind(BILLING_ORG, now)
    .all<{ model: string }>();
  const blocked = new Set((rows.results || []).map((r) => r.model));
  return unique.filter(
    (model) =>
      !blocked.has(model) &&
      !healthWildcards(model).some((wildcard) => blocked.has(wildcard)),
  );
}

function cooldownMs(model: string, code: string): number {
  if (code === "model_unavailable") return 3600_000;
  if (code === "rate_limit") return 60_000;
  // Z.ai 1113 / OpenRouter 402 on a paid model: topping up takes a human, so
  // do not re-probe every minute.
  if (code === "balance_exhausted" || code === "paid_credit_exhausted") return 15 * 60_000;
  // A rejected Z.ai key. '*' (OpenRouter 401/402) keeps its historical 30 s.
  if (code === "account_unavailable" && model === ZAI_WILDCARD) return 10 * 60_000;
  return 30_000;
}

export async function modelFailed(
  db: D1Database | undefined,
  model: string,
  code: string,
  now = Date.now(),
) {
  if (!db) return;
  const until = now + cooldownMs(model, code);
  try {
    await db
      .prepare(
        `INSERT INTO gpt_model_health(org_id,model,blocked_until,code) VALUES(?,?,?,?)
      ON CONFLICT(org_id,model) DO UPDATE SET blocked_until=MAX(blocked_until,excluded.blocked_until),code=excluded.code`,
      )
      .bind(BILLING_ORG, model, until, code)
      .run();
  } catch {
    console.warn("gpt_model_health_unavailable");
  }
}

function notifyOperator(onOperatorEvent: ((code: string) => void) | undefined, code: string) {
  if (!onOperatorEvent) return;
  try {
    onOperatorEvent(code);
  } catch {
    console.warn("gpt_operator_event_failed");
  }
}

/**
 * Record one failed attempt against model health and say how the walk goes
 * on: null = continue with the next candidate; a wildcard = it is now blocked,
 * so also skip every remaining candidate it covers (healthWildcards).
 *
 * - content_refused / bad_request: the REQUEST was refused (OpenRouter 403
 *   moderation or a request-level 400, Z.ai 1301), the model is fine. No
 *   cooldown — otherwise one visitor's prompt would switch a model off for
 *   everyone. The walk continues to the next candidate.
 * - paid_credit_exhausted (OpenRouter 402 on a paid model): the account has
 *   no credits. Block 'openrouter-paid/*' for 15 minutes, page the owner
 *   (openrouter_credit_exhausted) and skip the remaining paid candidates; the
 *   ':free' ones still answer.
 * - balance_exhausted / account_unavailable: the provider ACCOUNT is out.
 *   Block that provider's wildcard ('*' or 'zai/*'), tell the operator about
 *   Z.ai, and skip that provider's remaining candidates. For an OpenRouter-only
 *   chain this ends the walk exactly where the pre-Z.ai code returned early.
 * - anything else (rate_limit, model_unavailable, provider_error, timeout,
 *   empty): cool down that one model, continue.
 *
 * onOperatorEvent is best-effort and can never break the walk.
 */
export async function settleModelFailure(
  db: D1Database | undefined,
  model: string,
  code: string,
  onOperatorEvent?: (code: string) => void,
): Promise<string | null> {
  if (code === "content_refused" || code === "bad_request") return null;
  if (code === "paid_credit_exhausted") {
    await modelFailed(db, OPENROUTER_PAID_WILDCARD, code);
    notifyOperator(onOperatorEvent, "openrouter_credit_exhausted");
    return OPENROUTER_PAID_WILDCARD;
  }
  const provider = providerOf(model);
  if (code === "balance_exhausted" || code === "account_unavailable") {
    const wildcard = providerWildcard(provider);
    await modelFailed(db, wildcard, code);
    if (provider === "zai")
      notifyOperator(
        onOperatorEvent,
        code === "balance_exhausted" ? "zai_balance_exhausted" : "zai_auth_failed",
      );
    return wildcard;
  }
  await modelFailed(db, model, code);
  return null;
}
