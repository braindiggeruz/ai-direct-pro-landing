import {
  BILLING_ORG,
  liveReadiness,
  PROVIDERS,
  providerMode,
  type BillingEnv,
} from "./billing-config";
import { modelChain, resolveConfig } from "./config";
import { recordServiceAlert } from "./billing-maintenance-store";
import { modelFailed } from "./model-health-store";
import { priceCeiling } from "./model-pricing";
import { providerOf } from "./model-provider";

/** SQLite/D1 wording for a table or view that does not exist (yet). */
function missingSchema(error: unknown): boolean {
  return /no such table/i.test(
    error instanceof Error ? error.message : String(error),
  );
}
export async function inspectBilling(env: BillingEnv, now = Date.now()) {
  const db = env.GPTBOT_DRAFTS_DB!;
  const [queue, turns, models] = await Promise.all([
    db
      .prepare(
        "SELECT COUNT(*) AS pending,MIN(o.created_at) AS oldest FROM gpt_billing_outbox o JOIN gpt_payment_orders_all p ON p.org_id=o.org_id AND p.id=o.order_id WHERE o.org_id=? AND o.delivered_at IS NULL AND p.mode='live'",
      )
      .bind(BILLING_ORG)
      .first<{ pending: number; oldest: number | null }>()
      // The view comes from migrations/0065. Before it is applied this one
      // section says so; the rest of the diagnostics still answer.
      .catch((error: unknown) => {
        if (missingSchema(error)) return "schema_pending" as const;
        throw error;
      }),
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
    // Each provider's mode and what a live sale of it still lacks: setting
    // names only, never a value (billing-config.ts liveReadiness).
    payments: Object.fromEntries(
      PROVIDERS.map((provider) => [
        provider,
        { mode: providerMode(env, provider), missing: liveReadiness(env, provider, now) },
      ]),
    ),
    outbox: queue,
    lastHour: turns.results,
    blockedModels: models.results,
  };
}
const OPENROUTER_API = "https://openrouter.ai/api/v1";
/** The chain is at most two tiers of three; never fan out further than that. */
const MAX_CHECKED_MODELS = 6;
/** 'vendor/model' or 'vendor/model:variant' — the only shape put into a URL. */
const MODEL_SLUG = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::[a-z0-9-]+)?$/i;

type EndpointPrice = { prompt?: string; completion?: string; request?: string };

/** Catalogue prices are USD per token (per request for `request`); the ceiling is per 1M tokens. */
function withinCeiling(model: string, price: EndpointPrice | undefined): boolean {
  const ceiling = priceCeiling(model);
  const perToken = (value: string | undefined, max: number) => {
    const usd = Number(value ?? "0");
    // Compared in micro-USD per 1M tokens, so 0.00000032 equals 0.32 exactly.
    return Number.isFinite(usd) && usd >= 0 && Math.round(usd * 1e12) <= Math.round(max * 1e6);
  };
  const request = Number(price?.request ?? "0");
  return (
    !!price &&
    perToken(price.prompt, ceiling.prompt) &&
    perToken(price.completion, ceiling.completion) &&
    Number.isFinite(request) &&
    request >= 0 &&
    request <= ceiling.request
  );
}

/**
 * One model's endpoints (~2–15 KB instead of the 762 KB catalogue):
 * 'ok' when some endpoint is inside the price ceiling, 'unavailable' when the
 * model is unknown (404) or no endpoint fits (a retired model keeps its page
 * with an empty list), 'failed' when OpenRouter could not be asked.
 */
async function checkModel(model: string): Promise<"ok" | "unavailable" | "failed"> {
  if (!MODEL_SLUG.test(model)) return "unavailable";
  try {
    const response = await fetch(`${OPENROUTER_API}/models/${model}/endpoints`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return response.status === 404 ? "unavailable" : "failed";
    }
    const body = (await response.json()) as {
      data?: { endpoints?: Array<{ pricing?: EndpointPrice }> };
    };
    const endpoints = body.data?.endpoints;
    if (!Array.isArray(endpoints)) return "failed";
    return endpoints.some((e) => withinCeiling(model, e.pricing))
      ? "ok"
      : "unavailable";
  } catch {
    return "failed";
  }
}

/** The account behind OPENROUTER_API_KEY: free tier and remaining key limit. */
async function checkKey(env: BillingEnv, now: number) {
  try {
    const response = await fetch(`${OPENROUTER_API}/key`, {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      await recordServiceAlert(env, "openrouter_key_unavailable", now);
      return;
    }
    const key = (await response.json()) as {
      data?: { is_free_tier?: boolean; limit_remaining?: number | null };
    };
    // No credits ever bought: every ':free' model shares 50 requests a day
    // across the chat, the bot and AEO.
    if (key.data?.is_free_tier === true)
      await recordServiceAlert(env, "openrouter_free_tier_50rpd", now);
    if (
      typeof key.data?.limit_remaining === "number" &&
      key.data.limit_remaining < 1
    )
      await recordServiceAlert(env, "openrouter_key_credit_low", now);
  } catch {
    await recordServiceAlert(env, "openrouter_key_unavailable", now);
  }
}

/**
 * Hourly (lease task 'catalogue'): every OpenRouter model of the free and paid
 * chains must still be served inside its price ceiling. A model that is not
 * is blocked for an hour (model_unavailable) and raises
 * catalogue_model_unavailable; an unreachable API raises
 * catalogue_check_failed and blocks nothing.
 */
export async function checkBillingProviders(env: BillingEnv, now = Date.now()) {
  const db = env.GPTBOT_DRAFTS_DB!;
  const claimed = await db
    .prepare(
      `INSERT INTO gpt_billing_ops(org_id,task,next_at) VALUES(?,'catalogue',?)
    ON CONFLICT(org_id,task) DO UPDATE SET next_at=excluded.next_at WHERE next_at<=? RETURNING task`,
    )
    .bind(BILLING_ORG, now + 3600_000, now)
    .first();
  if (!claimed) return { ran: false, unavailable: [] as string[] };
  const cfg = resolveConfig(env);
  const models = [
    ...new Set([...modelChain(cfg, "free"), ...modelChain(cfg, "paid")]),
  ]
    .filter((model) => providerOf(model) === "openrouter")
    .slice(0, MAX_CHECKED_MODELS);
  const [results] = await Promise.all([
    Promise.all(models.map(checkModel)),
    env.OPENROUTER_API_KEY ? checkKey(env, now) : undefined,
  ]);
  const unavailable = models.filter((_, i) => results[i] === "unavailable");
  for (const model of unavailable) await modelFailed(db, model, "model_unavailable", now);
  if (unavailable.length)
    await recordServiceAlert(env, "catalogue_model_unavailable", now);
  if (results.includes("failed"))
    await recordServiceAlert(env, "catalogue_check_failed", now);
  return { ran: true, unavailable };
}
