// The studio's daily spend guards on gpt_model_spend (spec §2.5 items 3–4).
//
//   studio_free   every call of a free job, against STUDIO_FREE_DAILY_USD:
//                 the hard stop of the free tier ($0.3 for the first 48
//                 hours, then $3). limits.ts freeBudgetGate reads the same
//                 bucket before a free unit is taken.
//   studio_paid   every call of a paid job or a regeneration, against
//                 STUDIO_PAID_DAILY_USD_STOP ($20): an emergency stop for an
//                 error or an attack, never for buyers. When it trips, the
//                 call fails as a server fault: the unit is not spent, the
//                 person sees «Vaqtincha ishlamayapti», the owner gets the
//                 studio_paid_stop alert.
//
// Through the chat's ModelSpendStore, unchanged: before a call its worst
// case (the step's input bound and max_tokens at the shadow price,
// pricing.ts) is reserved with one statement that cannot pass the cap; after
// it, the reservation is replaced by what the call cost. In that store
// reserved_micro is the committed total, open reservations plus settled
// cost (settle lowers it by the unused part only, or raises it by an
// overrun), and actual_micro tallies the settled part inside it; the cap
// and limits.ts freeBudgetGate read reserved_micro alone. Each job reserves
// and settles on ONE day, its reserve_day (the UTC day it started), so a job
// that runs over midnight UTC (05:00 in Tashkent) is settled on the day it
// reserved on, never on the next one.
//
// The ledger row mirrors its open reservations (reserved_micro) and keeps
// the cost (cost_micro, tokens, model): a reservation goes on the row after
// the bucket took it, and comes off the row before the bucket settles it. A
// settlement whose reservation is gone from the row (the expiry sweep
// converted it) touches the bucket no more, so nothing is counted twice.
// What the sweep finds still reserved on an expired job it converts to spend
// (convertOpen): no reservation hangs.
//
// What a call cost (billedMicro): its usage at the shadow price when the
// provider reported usage; nothing when it was refused before an answer
// (HTTP error, 1302, 1113, 1301); its whole reservation when nobody knows
// (a timeout or a broken stream may still be billed). Money fails closed.
import type { CallRecord, TextStep } from "./llm";
import type { StudioConfig } from "./config";
import type { StudioAlert } from "./limits";
import { STUDIO_FREE_BUCKET, STUDIO_PAID_BUCKET } from "./limits";
import { LedgerStore, type LedgerJob, type LedgerSource, type ModelUsage } from "./ledger";
import { STEP_LIMITS } from "./plans";
import { FLUX_MICRO_PER_IMAGE, PROMPT_GUARD_PRICE, imageCheckMicro, modelPrice, tokenCostMicro } from "./pricing";
import { studioLog } from "./http";
import { ModelSpendStore, spendDay } from "../gpt-chat/model-spend-store";
import { STUDIO_ORG } from "./schema";

export type SpendBucket = typeof STUDIO_FREE_BUCKET | typeof STUDIO_PAID_BUCKET;
export type SpendConfig = Pick<StudioConfig, "freeDailyUsd" | "paidDailyUsdStop" | "imageCheckModel">;

const MICRO = 1_000_000;

/** The bucket of a job: free units on studio_free, paid units and regenerations on studio_paid. */
export function bucketOf(source: LedgerSource): SpendBucket {
  return source === "free" ? STUDIO_FREE_BUCKET : STUDIO_PAID_BUCKET;
}

/** The bucket's daily cap in micro-USD. */
export function bucketCapMicro(config: SpendConfig, bucket: SpendBucket): number {
  return Math.round((bucket === STUDIO_FREE_BUCKET ? config.freeDailyUsd : config.paidDailyUsdStop) * MICRO);
}

/** The day a job started on reserves all of its spend: gpt_model_spend.day. */
export function reserveDayOf(startedAt: number): string {
  return spendDay(startedAt);
}

function priceOf(model: string) {
  const price = modelPrice(model);
  if (!price) throw new Error(`no shadow price for ${model}`);
  return price;
}

/** A text step's call at its ceiling: the step's input bound and `maxTokens` (llm.ts prices an unmetered answer the same way). */
export function textCallMicro(model: string, step: TextStep, maxTokens: number): number {
  return tokenCostMicro(priceOf(model), { input: STEP_LIMITS[step].inputTokens, output: maxTokens });
}

/** A photo explanation's call at its ceiling. */
export function photoCallMicro(model: string, maxTokens: number): number {
  return tokenCostMicro(priceOf(model), { input: STEP_LIMITS.photo.inputTokens, output: maxTokens });
}

/** The one Llama Guard call of a job over its image prompts. */
export function promptGuardMicro(): number {
  const step = STEP_LIMITS.promptGuard;
  return tokenCostMicro(PROMPT_GUARD_PRICE, { input: step.inputTokens, output: step.maxTokens });
}

/** One picture: Flux and the check of the finished picture (STUDIO_IMAGE_CHECK_MODEL). */
export function imageCallMicro(config: Pick<StudioConfig, "imageCheckModel">): number {
  return FLUX_MICRO_PER_IMAGE + imageCheckMicro(config.imageCheckModel);
}

/** What a finished call cost, in micro-USD, given what was reserved for it. */
export function billedMicro(call: Pick<CallRecord, "outcome" | "usage" | "costMicro">, reservedMicro: number): number {
  if (call.usage) return call.costMicro;
  switch (call.outcome) {
    case "ok":
    case "length":
      return call.costMicro; // priced at its ceiling by llm.ts
    case "rate_limit":
    case "unavailable":
    case "refused":
      return 0; // refused before an answer: nothing was billed
    default:
      return reservedMicro; // timeout, aborted, provider_error: may still be billed
  }
}

/** The usage of a call as the ledger keeps it. */
export function usageOf(call: Pick<CallRecord, "model" | "outcome" | "valid" | "usage">): ModelUsage {
  return {
    model: call.outcome === "ok" && call.valid ? call.model : null,
    tokensIn: call.usage?.input ?? 0,
    tokensOut: call.usage?.output ?? 0,
    reasoningTokens: call.usage?.reasoning ?? 0,
  };
}

export type SpendAdmission =
  | { readonly ok: true }
  /** The bucket is full or unreadable: a server fault (503 studio_busy). */
  | { readonly ok: false; readonly kind: "busy"; readonly alert: StudioAlert | null }
  /** The job closed or expired meanwhile: nothing was reserved. */
  | { readonly ok: false; readonly kind: "closed" };

/** One job's reservations and settlements. Never throws. */
export class JobSpend {
  readonly bucket: SpendBucket;
  private readonly ledger: LedgerStore;
  private readonly spend: ModelSpendStore;

  constructor(
    readonly db: D1Database,
    readonly job: Pick<LedgerJob, "id" | "source" | "reserveDay">,
    readonly org: string = STUDIO_ORG,
  ) {
    this.bucket = bucketOf(job.source);
    this.ledger = new LedgerStore(db, org);
    this.spend = new ModelSpendStore(db, org);
  }

  /**
   * Reserves `micro` on the job's bucket and day, then on the job's row. A
   * zero-cost call (a ':free' model) reserves nothing. A full or unreadable
   * bucket is "busy"; a job that is no longer open is "closed", and the
   * bucket's reservation is given back.
   */
  async reserve(micro: number, config: SpendConfig, now = Date.now()): Promise<SpendAdmission> {
    if (micro <= 0) return { ok: true };
    const cap = bucketCapMicro(config, this.bucket);
    let reserved: boolean;
    try {
      reserved = await this.spend.reserve(this.job.reserveDay, this.bucket, micro, cap);
    } catch {
      studioLog("studio_spend", "bucket_unavailable");
      return { ok: false, kind: "busy", alert: null };
    }
    if (!reserved) {
      studioLog("studio_spend", `${this.bucket}.full`);
      return { ok: false, kind: "busy", alert: this.bucket === STUDIO_FREE_BUCKET ? "studio_free_budget_spent" : "studio_paid_stop" };
    }
    let day: string | null;
    try {
      day = await this.ledger.addReserve(this.job.id, micro, now);
    } catch {
      await this.giveBack(micro);
      return { ok: false, kind: "busy", alert: null };
    }
    if (day === null) {
      await this.giveBack(micro);
      return { ok: false, kind: "closed" };
    }
    return { ok: true };
  }

  /**
   * Replaces a reservation of `reservedMicro` by `actualMicro`: first on the
   * row (with the usage), then on the bucket of the job's reserve day. False
   * when the reservation had already been converted, or D1 failed (the
   * bucket then keeps the reservation: money fails closed).
   */
  async settle(reservedMicro: number, actualMicro: number, usage: ModelUsage | null): Promise<boolean> {
    const actual = Math.max(0, Math.round(actualMicro));
    try {
      const day = await this.ledger.settleReserve(this.job.id, reservedMicro, actual, usage);
      if (day === null) return false;
      if (reservedMicro > 0 || actual > 0) await this.spend.settle(day, this.bucket, reservedMicro, actual);
      return true;
    } catch {
      studioLog("studio_spend", "settle_failed");
      return false;
    }
  }

  /** The expiry sweep: whatever is still reserved on the row becomes spend. True when something was converted. */
  async convertOpen(): Promise<boolean> {
    try {
      const job = await this.ledger.get(this.job.id);
      if (!job || job.reservedMicro <= 0) return false;
      return await this.settle(job.reservedMicro, job.reservedMicro, null);
    } catch {
      return false;
    }
  }

  private async giveBack(micro: number): Promise<void> {
    try {
      await this.spend.settle(this.job.reserveDay, this.bucket, micro, 0);
    } catch {
      studioLog("studio_spend", "give_back_failed");
    }
  }
}
