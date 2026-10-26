// The web chat's two daily USD budgets for billable models (plan WP-04,
// decision L6; UE-3 of the tariffs roadmap, rule S5 «cut free, never paid»).
//
//   free_paid  «free, trial, R2»: every free answer — the site's trial and
//              free tier, a pack holder's free answer (decision R2) and
//              Javob's replies (decision L15) — under GPT_FREE_PAID_DAILY_USD
//              (production 0.3, decision №13);
//   pack_paid  «packs»: every pack answer, under GPT_PACK_PAID_DAILY_USD, a
//              generous emergency brake (an error or an attack, not buyers);
//   pack_paid:<order_id>
//              one pack's share of that day, under PACK_PERIOD_DAILY_USD:
//              a pack answer reserves here first, then on pack_paid, so one
//              holder's uncharged attempts (cut, stopped, failed: they spend
//              no answer of PACK_DAILY_LIMIT) cannot spend the brake every
//              buyer shares. A spent share moves only that holder's answers
//              to ':free' (a background note, never a page).
// Separate rows, so a busy free day can never spend what the packs need:
// when free_paid is spent the free answers move to ':free' models and the
// packs are untouched; when pack_paid is spent the owner is paged.
//
// Before every attempt on a billable model the turn pre-reserves the
// attempt's WORST case with one atomic upsert that refuses to pass the cap,
// so any number of concurrent turns in any number of isolates cannot
// overspend it (attemptWorstCaseMicro):
//   paid OpenRouter  promptTokenBound(messages) tokens at
//                    PAID_PRICE_CEILING.prompt and GPT_MAX_OUTPUT_TOKENS at
//                    PAID_PRICE_CEILING.completion (the max_price every paid
//                    request carries, so no provider can bill more);
//   priced Z.ai      the same token bounds at the model's list price
//                    (model-pricing.ts): Z.ai bills the list price and
//                    max_tokens bounds the completion, reasoning included,
//                    as the studio's worst case assumes (studio/pricing.ts).
//                    This covers the prepaid glm-5.3-flash too: before UE-3
//                    it was priced at $0 and passed without any budget, so
//                    once the bundle ends (17.12.2026) a per-token bill would
//                    have had no cap at all;
//   ':free' and $0   nothing to reserve: they pass untouched.
// When the answer's usage arrives, the reservation is replaced by its
// list-price cost (estimateCostUsd): actual_micro grows by the cost and the
// rest of the estimate is returned. A failed or unmetered attempt keeps its
// whole reservation, because the provider may still bill it. A refused
// reservation skips the model (the walk goes on to the chain's next one,
// without spending an attempt) and calls onExhausted.
//
// A free answer still never calls a Z.ai model the free tier may not use
// (zaiModelAllowed: $0, or a listed prepaid bundle): any other is skipped
// before the budget is asked. A pack answer walks the pack's chain under
// both this budget and TurnStore.admitModelAttempt (functions/api/gpt/
// chat.ts): the USD brake first, so a model it skips spends no attempt of
// the pack's ceiling. Money is integer micro-USD (1e-6 USD). SQL lives only
// in ModelSpendStore, every statement scoped to its org. No migration: the
// bucket is the existing gpt_model_spend.bucket column (migrations/0066).
import type { GptChatConfig } from "./config";
import { bareModel, isPaidOpenRouterModel, providerOf, zaiModelAllowed } from "./model-provider";
import { modelPrice, PAID_PRICE_CEILING } from "./model-pricing";
import type { AdmitAttempt } from "./openrouter-chat";
import { promptTokenBound, type ChatMessage } from "./prompt";

/** gpt_model_spend.bucket of the free answers' spend on billable models: the site's free turns and Javob share it. */
export const FREE_PAID_BUCKET = "free_paid";
/** gpt_model_spend.bucket of the pack answers' spend on billable models. */
export const PACK_PAID_BUCKET = "pack_paid";
/**
 * One pack's share of the packs' day, in USD. A pack answers at most
 * PACK_DAILY_LIMIT (50) times a UTC day and one attempt reserves at most
 * ~$0.002 (attemptWorstCaseMicro, the longest prompt), so 50 answers fit
 * five times over; at the default $3 brake it takes six holders spending
 * their whole share to stop every buyer's billable models.
 */
export const PACK_PERIOD_DAILY_USD = 0.5;
/** gpt_model_spend.bucket of one pack's share of the day (the access period's order_id). */
export function packPeriodBucket(orderId: string): string {
  return `${PACK_PAID_BUCKET}:${orderId}`;
}

/** Background, one row a day: free answers moved to ':free' models (alert-policy.ts). */
export const FREE_PAID_BUDGET_ALERT = "free_paid_budget_exhausted";
/** Urgent, one row a day: the packs' brake is spent, pack answers moved to ':free' (alert-policy.ts). */
export const PACK_PAID_BUDGET_ALERT = "pack_paid_budget_exhausted";
/** Background, one row a day: one pack's own share is spent, its answers moved to ':free' (alert-policy.ts). */
export const PACK_PERIOD_BUDGET_ALERT = "pack_period_budget_exhausted";

/** UTC day of `now` as gpt_model_spend.day ('2026-09-30'); the quotas use the same day. */
export function spendDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** The most one paid OpenRouter attempt with these messages can cost, in micro-USD. */
export function worstCaseMicroUsd(messages: ChatMessage[], maxOutputTokens: number): number {
  // Micro-USD per token equals USD per million tokens.
  return Math.ceil(
    promptTokenBound(messages) * PAID_PRICE_CEILING.prompt +
      maxOutputTokens * PAID_PRICE_CEILING.completion,
  );
}

/**
 * The most one attempt on `model` with these messages can cost, in
 * micro-USD: 0 for a ':free' OpenRouter id or a $0 Z.ai model (nothing to
 * reserve), the max_price bound for a paid OpenRouter id, the list-price
 * bound for a priced Z.ai model, and null for a Z.ai model without a price,
 * which cannot be bounded and is therefore never admitted on a budget.
 */
export function attemptWorstCaseMicro(
  model: string,
  messages: ChatMessage[],
  maxOutputTokens: number,
): number | null {
  if (providerOf(model) === "zai") {
    const price = modelPrice(model);
    if (!price) return null;
    return Math.ceil(promptTokenBound(messages) * price.in + maxOutputTokens * price.out);
  }
  return isPaidOpenRouterModel(model) ? worstCaseMicroUsd(messages, maxOutputTokens) : 0;
}

export class ModelSpendStore {
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {}

  /**
   * Reserve `micro` on the day's bucket unless the bucket would pass
   * `capMicro`. One statement decides and reserves; true when reserved.
   */
  async reserve(day: string, bucket: string, micro: number, capMicro: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        `INSERT INTO gpt_model_spend(org_id,day,bucket,reserved_micro,actual_micro,attempts)
      SELECT ?,?,?,?,0,1 WHERE ?<=?
      ON CONFLICT(org_id,day,bucket) DO UPDATE SET reserved_micro=reserved_micro+excluded.reserved_micro,attempts=attempts+1
      WHERE reserved_micro+excluded.reserved_micro<=? RETURNING reserved_micro`,
      )
      .bind(this.org, day, bucket, micro, micro, capMicro, capMicro)
      .first<{ reserved_micro: number }>();
    return !!row;
  }

  /** Replace a reservation of `reservedMicro` by the attempt's actual cost. */
  async settle(day: string, bucket: string, reservedMicro: number, actualMicro: number): Promise<void> {
    await this.db
      .prepare(
        "UPDATE gpt_model_spend SET reserved_micro=MAX(0,reserved_micro-?),actual_micro=actual_micro+? WHERE org_id=? AND day=? AND bucket=?",
      )
      .bind(reservedMicro - actualMicro, actualMicro, this.org, day, bucket)
      .run();
  }
}

export interface DayBudget {
  /**
   * The turn's admitAttempt, 'ok' or 'skip' (never 'stop'): a model with
   * nothing to reserve passes, a billable one needs a reservation, and one
   * that cannot be bounded is skipped.
   */
  admit: AdmitAttempt;
  /**
   * After the answer: replace the reservation of the model that answered by
   * its list-price cost. A model without a reservation, or a null cost
   * (usage never arrived), leaves everything as it is.
   */
  settle(model: string, costUsd: number | null): Promise<void>;
  /**
   * Give back the reservation of an attempt that was never sent (the pack's
   * attempt ceiling stopped the walk right after this budget admitted it).
   */
  release(model: string): Promise<void>;
}

/** The free tier's view of the day: FreePaidBudget is a DayBudget on free_paid. */
export type FreePaidBudget = DayBudget;

type BudgetConfig = Pick<GptChatConfig, "maxOutputTokens">;

/** One row an attempt reserves on: its bucket, its cap and who hears that it is spent. */
interface BudgetLayer {
  bucket: string;
  capUsd: number;
  onExhausted: () => void;
}

/**
 * A billable attempt reserves its worst case on every layer, in order, and
 * passes only when all of them hold it. A refusal (or an unreadable row)
 * gives back what the earlier layers reserved and skips the model; only the
 * layer that refused hears it. Settlement and release apply to every layer.
 */
function dayBudget(
  store: ModelSpendStore,
  layers: readonly BudgetLayer[],
  worstCase: (model: string) => number | null,
  now: number,
): DayBudget {
  const day = spendDay(now);
  // The open reservation of each model in this turn's walk, in micro-USD.
  const reserved = new Map<string, number>();
  const settleAll = async (on: readonly BudgetLayer[], micro: number, actualMicro: number) => {
    for (const layer of on)
      try {
        await store.settle(day, layer.bucket, micro, actualMicro);
      } catch {
        console.warn("gpt_model_spend_settlement_failed");
      }
  };
  return {
    async admit(model) {
      const micro = worstCase(model);
      if (micro === null) return "skip";
      if (micro === 0) return "ok";
      const taken: BudgetLayer[] = [];
      for (const layer of layers) {
        let admitted: boolean;
        try {
          admitted = await store.reserve(day, layer.bucket, micro, Math.floor(layer.capUsd * 1_000_000));
        } catch {
          console.warn("gpt_model_spend_unavailable");
          await settleAll(taken, micro, 0);
          return "skip";
        }
        if (!admitted) {
          await settleAll(taken, micro, 0);
          layer.onExhausted();
          return "skip";
        }
        taken.push(layer);
      }
      reserved.set(model, micro);
      return "ok";
    },
    async settle(model, costUsd) {
      const micro = reserved.get(model);
      if (costUsd === null || micro === undefined) return;
      reserved.delete(model);
      await settleAll(layers, micro, Math.round(costUsd * 1_000_000));
    },
    async release(model) {
      const micro = reserved.get(model);
      if (micro === undefined) return;
      reserved.delete(model);
      await settleAll(layers, micro, 0);
    },
  };
}

/**
 * One free answer's view of the day's «free, trial, R2» budget
 * (GPT_FREE_PAID_DAILY_USD). ':free' models and $0 Z.ai models pass, a paid
 * OpenRouter model or a priced Z.ai model the free tier may use (a listed
 * prepaid bundle) needs a reservation, any other Z.ai model is skipped.
 * `onExhausted` runs whenever a model is skipped because the budget is
 * spent; it must not throw. A budget that cannot be read skips the model
 * too: money fails closed and ':free' still answers.
 */
export function freePaidBudget(
  store: ModelSpendStore,
  cfg: Pick<GptChatConfig, "freePaidDailyUsd"> & BudgetConfig &
    Partial<Pick<GptChatConfig, "zaiPrepaidModels">>,
  messages: ChatMessage[],
  onExhausted: () => void,
  now = Date.now(),
): FreePaidBudget {
  const budget = dayBudget(
    store,
    [{ bucket: FREE_PAID_BUCKET, capUsd: cfg.freePaidDailyUsd, onExhausted }],
    (model) => attemptWorstCaseMicro(model, messages, cfg.maxOutputTokens),
    now,
  );
  return {
    ...budget,
    async admit(model) {
      // A Z.ai model the free tier may not call is skipped without
      // onExhausted: the budget is not what refuses it. Without the list
      // (Javob, which never walks a Z.ai model) no prepaid bundle passes.
      if (
        providerOf(model) === "zai" &&
        !zaiModelAllowed({ zaiPrepaidModels: cfg.zaiPrepaidModels ?? [] }, "free", bareModel(model))
      )
        return "skip";
      return budget.admit(model);
    },
  };
}

/**
 * One pack answer's view of the day's «packs» budget (GPT_PACK_PAID_DAILY_USD).
 * Same rules as freePaidBudget, without the free tier's Z.ai allowlist: the
 * pack's chain (webChatChain 'paid') already holds only models the paid tier
 * may call. A billable attempt reserves first on the pack's own share of the
 * day (packPeriodBucket(periodId), PACK_PERIOD_DAILY_USD), then on the shared
 * brake. A spent share skips billable models to the chain's ':free' one for
 * this pack only and calls `alerts.period` (background); a spent brake does
 * the same for every pack and calls `alerts.brake` (an urgent, once-a-day
 * page). An unreadable row skips them too.
 */
export function packPaidBudget(
  store: ModelSpendStore,
  cfg: Pick<GptChatConfig, "packPaidDailyUsd"> & BudgetConfig,
  messages: ChatMessage[],
  periodId: string,
  alerts: { period: () => void; brake: () => void },
  now = Date.now(),
): DayBudget {
  return dayBudget(
    store,
    [
      { bucket: packPeriodBucket(periodId), capUsd: PACK_PERIOD_DAILY_USD, onExhausted: alerts.period },
      { bucket: PACK_PAID_BUCKET, capUsd: cfg.packPaidDailyUsd, onExhausted: alerts.brake },
    ],
    (model) => attemptWorstCaseMicro(model, messages, cfg.maxOutputTokens),
    now,
  );
}
