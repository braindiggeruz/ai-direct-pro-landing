// The free tier's daily budget for paid models (plan WP-04, decision L6).
//
// With GPT_FREE_TIER_PAID_PRIMARY on, a free turn starts on the paid primary
// (model-provider.ts webChatChain) while the UTC day's spend stays within
// GPT_FREE_PAID_DAILY_USD. Before every paid attempt the turn pre-reserves its
// WORST case with one atomic upsert that refuses to pass the cap, so any
// number of concurrent turns in any number of isolates cannot overspend it:
//   prompt  promptTokenBound(messages) tokens at PAID_PRICE_CEILING.prompt
//   answer  GPT_MAX_OUTPUT_TOKENS tokens at PAID_PRICE_CEILING.completion
// (the ceiling is the max_price every paid request carries, so no provider
// can bill more). When the answer's usage arrives, the reservation is replaced
// by its list-price cost (estimateCostUsd): actual_micro grows by the cost and
// the rest of the estimate is returned. A failed or unmetered attempt keeps
// its whole reservation, because the provider may still bill it. A refused
// reservation skips the paid model to ':free' and records
// free_paid_budget_exhausted (one row a day, alert-policy.ts).
//
// Pack turns never touch this budget: they walk the paid chain under
// TurnStore.admitModelAttempt. Money is integer micro-USD (1e-6 USD). SQL
// lives only in ModelSpendStore, every statement scoped to its org.
import type { GptChatConfig } from "./config";
import { isPaidOpenRouterModel } from "./model-provider";
import { PAID_PRICE_CEILING } from "./model-pricing";
import type { AdmitAttempt } from "./openrouter-chat";
import { promptTokenBound, type ChatMessage } from "./prompt";

/** gpt_model_spend.bucket of the free tier's spend on paid models (site; the bot joins it in WP-08). */
export const FREE_PAID_BUCKET = "free_paid";

export const FREE_PAID_BUDGET_ALERT = "free_paid_budget_exhausted";

/** UTC day of `now` as gpt_model_spend.day ('2026-09-30'); the quotas use the same day. */
export function spendDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** The most one paid attempt with these messages can cost, in micro-USD. */
export function worstCaseMicroUsd(messages: ChatMessage[], maxOutputTokens: number): number {
  // Micro-USD per token equals USD per million tokens.
  return Math.ceil(
    promptTokenBound(messages) * PAID_PRICE_CEILING.prompt +
      maxOutputTokens * PAID_PRICE_CEILING.completion,
  );
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

export interface FreePaidBudget {
  /** The free turn's admitAttempt: ':free' and Z.ai models pass, a paid one needs a reservation. */
  admit: AdmitAttempt;
  /**
   * After the answer: replace the reservation of the model that answered by
   * its list-price cost. A model without a reservation, or a null cost
   * (usage never arrived), leaves everything as it is.
   */
  settle(model: string, costUsd: number | null): Promise<void>;
}

/**
 * One free turn's view of the day's budget. `onExhausted` runs whenever a
 * paid attempt is skipped because the budget is spent; it must not throw.
 * A budget that cannot be read skips the paid model too: money fails closed
 * and ':free' still answers.
 */
export function freePaidBudget(
  store: ModelSpendStore,
  cfg: Pick<GptChatConfig, "freePaidDailyUsd" | "maxOutputTokens">,
  messages: ChatMessage[],
  onExhausted: () => void,
  now = Date.now(),
): FreePaidBudget {
  const day = spendDay(now);
  const estimate = worstCaseMicroUsd(messages, cfg.maxOutputTokens);
  const cap = Math.floor(cfg.freePaidDailyUsd * 1_000_000);
  const reserved = new Set<string>();
  return {
    async admit(model) {
      if (!isPaidOpenRouterModel(model)) return "ok";
      let admitted: boolean;
      try {
        admitted = await store.reserve(day, FREE_PAID_BUCKET, estimate, cap);
      } catch {
        console.warn("gpt_model_spend_unavailable");
        return "skip";
      }
      if (!admitted) {
        onExhausted();
        return "skip";
      }
      reserved.add(model);
      return "ok";
    },
    async settle(model, costUsd) {
      if (costUsd === null || !reserved.delete(model)) return;
      try {
        await store.settle(day, FREE_PAID_BUCKET, estimate, Math.round(costUsd * 1_000_000));
      } catch {
        console.warn("gpt_model_spend_settlement_failed");
      }
    },
  };
}
