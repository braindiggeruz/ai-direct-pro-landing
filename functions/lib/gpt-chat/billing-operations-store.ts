import { BILLING_ORG, type BillingEnv } from "./billing-config";
import { modelChain, resolveConfig } from "./config";
import { recordServiceAlert } from "./billing-maintenance-store";
import { modelFailed } from "./model-health-store";

export async function inspectBilling(env: BillingEnv, now = Date.now()) {
  const db = env.GPTBOT_DRAFTS_DB!;
  const [queue, turns, models] = await Promise.all([
    db
      .prepare(
        "SELECT COUNT(*) AS pending,MIN(o.created_at) AS oldest FROM gpt_billing_outbox o JOIN gpt_payment_orders p ON p.org_id=o.org_id AND p.id=o.order_id WHERE o.org_id=? AND o.delivered_at IS NULL AND p.mode='live'",
      )
      .bind(BILLING_ORG)
      .first(),
    db
      .prepare(
        "SELECT status,COUNT(*) AS n FROM gpt_turn_reservations WHERE org_id=? AND created_at>=? GROUP BY status",
      )
      .bind(BILLING_ORG, now - 3600_000)
      .all(),
    db
      .prepare(
        "SELECT model,code,blocked_until FROM gpt_model_health WHERE org_id=? AND blocked_until>?",
      )
      .bind(BILLING_ORG, now)
      .all(),
  ]);
  return {
    outbox: queue,
    lastHour: turns.results,
    blockedModels: models.results,
  };
}
export async function checkBillingProviders(env: BillingEnv, now = Date.now()) {
  const db = env.GPTBOT_DRAFTS_DB!;
  const claimed = await db
    .prepare(
      `INSERT INTO gpt_billing_ops(org_id,task,next_at) VALUES(?,'catalogue',?)
    ON CONFLICT(org_id,task) DO UPDATE SET next_at=excluded.next_at WHERE next_at<=? RETURNING task`,
    )
    .bind(BILLING_ORG, now + 3600_000, now)
    .first();
  if (!claimed) return;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error();
    const body = (await response.json()) as {
      data?: Array<{
        id: string;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    if (!Array.isArray(body.data) || !body.data.length) throw new Error();
    const cfg = resolveConfig(env);
    for (const id of new Set([
      ...modelChain(cfg, "free"),
      ...modelChain(cfg, "paid"),
    ])) {
      const model = body.data.find((m) => m.id === id);
      const free = id.endsWith(":free");
      const promptPrice = Number(model?.pricing?.prompt);
      const completionPrice = Number(model?.pricing?.completion);
      if (
        !model ||
        !Number.isFinite(promptPrice) ||
        !Number.isFinite(completionPrice) ||
        promptPrice < 0 ||
        completionPrice < 0 ||
        promptPrice > (free ? 0 : 0.1 / 1e6) ||
        completionPrice > (free ? 0 : 0.32 / 1e6)
      ) {
        await modelFailed(db, id, "model_unavailable");
        await recordServiceAlert(env, "catalogue_model_unavailable");
      }
    }
    if (env.OPENROUTER_API_KEY) {
      const keyResponse = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!keyResponse.ok)
        await recordServiceAlert(env, "openrouter_key_unavailable");
      else {
        const key = (await keyResponse.json()) as {
          data?: { limit_remaining?: number | null };
        };
        if (
          typeof key.data?.limit_remaining === "number" &&
          key.data.limit_remaining < 1
        )
          await recordServiceAlert(env, "openrouter_key_credit_low");
      }
    }
  } catch {
    await recordServiceAlert(env, "catalogue_check_failed");
  }
}
