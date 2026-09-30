import { BILLING_ORG } from "./billing-config";
import { providerOf, providerWildcard, ZAI_WILDCARD } from "./model-provider";
// Durable cooldowns are shared between isolates. KV's eventual consistency is
// suitable for a catalogue cache, not admission, money or this cooldown gate.
//
// Wildcards are scoped to a provider: '*' blocks every OpenRouter model (one
// OpenRouter account), 'zai/*' blocks every Z.ai model (one Z.ai account).
// Neither blocks the other provider, so a dead Z.ai key or balance leaves the
// OpenRouter fallbacks answering, and an OpenRouter 402 leaves Z.ai answering.
export async function availableModels(
  db: D1Database | undefined,
  chain: string[],
  now = Date.now(),
): Promise<string[]> {
  const unique = [...new Set(chain)].slice(0, 3);
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
      !(providerOf(model) === "openrouter" && blocked.has("*")) &&
      !(providerOf(model) === "zai" && blocked.has(ZAI_WILDCARD)),
  );
}

function cooldownMs(model: string, code: string): number {
  if (code === "model_unavailable") return 3600_000;
  if (code === "rate_limit") return 60_000;
  // Z.ai 1113: topping up takes a human, so do not re-probe every minute.
  if (code === "balance_exhausted") return 15 * 60_000;
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

/** What the chain walker does after a failed attempt. */
export type FailureStep = "continue" | "skip_provider";

/**
 * Record one failed attempt against model health and say how the walk goes on.
 *
 * - content_refused / bad_request: the REQUEST was refused, the model is fine.
 *   No cooldown — otherwise one visitor's prompt would switch a model off for
 *   everyone. The walk continues to the next candidate.
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
): Promise<FailureStep> {
  if (code === "content_refused" || code === "bad_request") return "continue";
  const provider = providerOf(model);
  if (code === "balance_exhausted" || code === "account_unavailable") {
    await modelFailed(db, providerWildcard(provider), code);
    if (provider === "zai" && onOperatorEvent) {
      try {
        onOperatorEvent(code === "balance_exhausted" ? "zai_balance_exhausted" : "zai_auth_failed");
      } catch {
        console.warn("gpt_operator_event_failed");
      }
    }
    return "skip_provider";
  }
  await modelFailed(db, model, code);
  return "continue";
}
