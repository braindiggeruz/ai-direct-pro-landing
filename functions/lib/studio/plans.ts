// Studio tariffs, units, deck shapes and the fixed per-step limits.
//
// Prices and quotas are terms of the offer, so they live only here, never in
// an environment variable (spec §2.2). The edition of the offer a buyer
// accepted picks the quota version (TERMS_PLAN); the version is stored on the
// order and on the entitlement, so a sold entitlement keeps its own terms. A
// new price or quota is a new offer edition, a new STUDIO_PLANS entry, a new
// TERMS_PLAN row and a release.
//
// Model cost is bounded by these numbers, not by a dollar cap per purchase
// (spec §2.5): units, one regeneration per unit, ≤ 2 attempts a step, a fixed
// max_tokens per step, ≤ 8 pictures. tests/studio-plans.test.ts proves that
// even the absolute worst case they allow stays under half of a tariff's net
// (pricing.ts worstCase*). The numbers come from the 30-topic measurement
// T0.1 (studio/MEASURE-30.md §0, §3, §9).
import { addCalendarMonth } from "../gpt-chat/billing-config";
import { includedVat } from "../gpt-chat/fiscal-config";

export type StudioPlanId = "kunlik" | "oylik";
/** Who takes the money (DECISIONS 07.10.2026 §12): Payme through the chat's cash desk, Click through the studio's own service. */
export type StudioProvider = "payme" | "click";
export type StudioUnit = "presentation_full" | "presentation_free" | "photo_task";
export type StudioTool = "presentation" | "photo";
export type DeckShapeName = "free" | "full";

export const STUDIO_PLAN_IDS: readonly StudioPlanId[] = ["kunlik", "oylik"];
export const STUDIO_PROVIDERS: readonly StudioProvider[] = ["payme", "click"];
export const STUDIO_UNITS: readonly StudioUnit[] = ["presentation_full", "presentation_free", "photo_task"];

/** Hours from Complete, or one calendar month (the chat's addCalendarMonth, billing-config.ts). */
export type PlanDuration = { readonly hours: number } | { readonly calendarMonths: 1 };

export interface StudioPlan {
  /** The price, VAT included, in tiyin (1 so‘m = 100 tiyin). */
  readonly amountTiyin: number;
  /** Kunlik: 24 hours from Complete. Oylik: one calendar month (addCalendarMonth). */
  readonly duration: PlanDuration;
  /** presentation_full units. */
  readonly presentationFull: number;
  /** photo_task units. */
  readonly photoTask: number;
  /** Regenerations per spent unit (spec §2.4). */
  readonly regenPerUnit: number;
  /** The receipt line when we print the receipt (≤ 63 characters, Click / OFD). */
  readonly receiptName: string;
  /** The item id for accounting and analytics. */
  readonly itemId: string;
}

export const STUDIO_PLANS = {
  // Presentations only (DECISIONS 07.10.2026 §13 п. 2, 8): what is sold when
  // the photo tool did not pass its gate. The same prices, terms and receipt
  // lines as studio-2026-11-v1, without photo tasks.
  "studio-2026-10-decks-v1": {
    kunlik: {
      amountTiyin: 590_000,
      duration: { hours: 24 },
      presentationFull: 1,
      photoTask: 0,
      regenPerUnit: 1,
      receiptName: "Studio Kunlik (xizmat, 24 soat)",
      itemId: "studio_kunlik",
    },
    oylik: {
      amountTiyin: 3_990_000,
      duration: { calendarMonths: 1 },
      presentationFull: 10,
      photoTask: 0,
      regenPerUnit: 1,
      receiptName: "Studio Oylik (xizmat, 1 oy)",
      itemId: "studio_oylik",
    },
  },
  "studio-2026-11-v1": {
    kunlik: {
      amountTiyin: 590_000,
      duration: { hours: 24 },
      presentationFull: 1,
      photoTask: 5,
      regenPerUnit: 1,
      receiptName: "Studio Kunlik (xizmat, 24 soat)",
      itemId: "studio_kunlik",
    },
    oylik: {
      amountTiyin: 3_990_000,
      duration: { calendarMonths: 1 },
      presentationFull: 10,
      photoTask: 40,
      regenPerUnit: 1,
      receiptName: "Studio Oylik (xizmat, 1 oy)",
      itemId: "studio_oylik",
    },
  },
} as const satisfies Record<string, Record<StudioPlanId, StudioPlan>>;

export type StudioPlanVersion = keyof typeof STUDIO_PLANS;

/**
 * The offer edition a buyer accepts decides the quotas. A terms version with
 * no row here cannot be sold: checkout answers 503 checkout_unavailable. The
 * chat's current edition (ai-paket-2026-10-v2) has none on purpose.
 */
export const TERMS_PLAN: Readonly<Record<string, StudioPlanVersion>> = {
  "ai-paket-2026-10-v3": "studio-2026-11-v1",
};

/** Free units per UTC day (= from 05:00 Tashkent, like the offer's «Сутки»). */
export const STUDIO_FREE_DAILY = { presentation_free: 1, photo_task: 2 } as const;

/** An unpaid order waits this long for its payment (Payme: from Payme's own CreateTransaction time). */
export const STUDIO_ORDER_TTL_MS = 12 * 3_600_000;

/** The buyer may ask for the money of unused units within this long after paying (DECISIONS §4 п. 1). */
export const REFUND_WINDOW_MS = 14 * 86_400_000;

/** VAT inside the price (fiscal-config.ts includedVat; GPT_FISCAL_VAT_PERCENT is 12). */
export const STUDIO_VAT_PERCENT = 12;

/**
 * The two decks. `images` is the cap on pictures handed out; `imageRetries`
 * the cap on repeated Flux calls for the whole job (a failed or refused
 * picture is redrawn at most once, then the slide goes without one).
 * Full: up to 15 slides; T0.1 measured p90 39.6 s for 15 slides with 8
 * pictures, under the 60 s gate (MEASURE-30 §0). The slider itself opens at
 * STUDIO_MAX_SLIDES (config.ts, 12 until a release raises it).
 */
export const DECK_SHAPES = {
  free: { minSlides: 4, maxSlides: 6, images: 2, imageRetries: 2, notes: false, palettes: 1 },
  full: { minSlides: 6, maxSlides: 15, images: 8, imageRetries: 4, notes: true, palettes: 3 },
} as const;

/** A full deck's slides are written in parts of at most this many, all at once. */
export const SLIDES_PER_PART = 4;

/** Parts of a full deck of `slides` slides (15 → 4, 12 → 3). */
export function deckParts(slides: number): number {
  return Math.ceil(slides / SLIDES_PER_PART);
}

/**
 * Fixed limits of every model step (MEASURE-30 §3, §9; spec §2.5).
 *
 * Text steps: at most `attempts` calls. The first asks for `maxTokens`; a
 * later one is either a JSON/schema repair or, after finish_reason=length,
 * the same request with `lengthRetryMaxTokens` (×1.5). A length retry is one
 * of the attempts.
 *
 * Photo: at most `attempts` calls at `maxTokens` (a retry at medium effort
 * after confidence=low is one of them), plus `lengthRetries` free retries at
 * `lengthRetryMaxTokens` after finish_reason=length; no other call asks for
 * more than `maxTokens`.
 *
 * `inputTokens` is the most input a call may carry by construction (system
 * prompt, glossary, a topic of ≤ 200 characters, the signed outline of ≤ 15
 * slides, a photo resized to ≤ 1 600 px). It bounds the worst case; the
 * measured maxima were 961 (outline), 1 478 (part) and 955 (free).
 */
export const STEP_LIMITS = {
  /** Full deck, step 1: titles, one key point and an English image prompt per slide. */
  outline: { maxTokens: 1300, lengthRetryMaxTokens: 1950, attempts: 2, inputTokens: 1500 },
  /** Full deck: one part of ≤ 4 slides with speaker notes. */
  part: { maxTokens: 1300, lengthRetryMaxTokens: 1950, attempts: 2, inputTokens: 2000 },
  /** Free deck: up to 6 slides in one call, no speaker notes. */
  free: { maxTokens: 1100, lengthRetryMaxTokens: 1650, attempts: 2, inputTokens: 1500 },
  /** Llama Guard 3 over every image prompt of a job, one call. */
  promptGuard: { maxTokens: 20, attempts: 1, inputTokens: 1500 },
  /** The check of one finished picture (STUDIO_IMAGE_CHECK_MODEL); one call per Flux picture. */
  imageCheck: { maxTokens: 90, attempts: 1, inputTokens: 2000 },
  /**
   * The proofreading pass of a paid Uzbek deck (proofread.ts, MEASURE-30 §6;
   * DECISIONS §13 п. 4): one call a slide part, «fix the language only», T 0.2,
   * as long as the part it reads; in: PROOF_SYSTEM (≈ 150 tokens) and the
   * part's JSON, at most its length-retry ceiling (1 950).
   */
  proof: { maxTokens: 1300, lengthRetryMaxTokens: 1950, attempts: 2, inputTokens: 2200 },
  /** Explaining a photographed task. */
  photo: { maxTokens: 1500, attempts: 2, lengthRetries: 1, lengthRetryMaxTokens: 2500, inputTokens: 3200 },
} as const;

/** Browser re-calls of a failed part a job may make on top of the planned calls. */
export const SPARE_PART_CALLS = { full: 4, free: 2 } as const;

/**
 * The most model calls one job may make (the ledger's `steps` cap). Full:
 * 2 for the outline, 2 per part and 4 spare, `steps ≤ 2 + 2·P + 4` (spec §7.1),
 * and with `proofread` (a paid Uzbek deck) 2 more per part.
 * Free: 2 for its single call and 2 spare; never proofread.
 */
export function maxJobModelCalls(shape: DeckShapeName, slides: number, proofread = false): number {
  if (shape === "free") return STEP_LIMITS.free.attempts + SPARE_PART_CALLS.free;
  const parts = deckParts(slides);
  const proof = proofread ? STEP_LIMITS.proof.attempts * parts : 0;
  return STEP_LIMITS.outline.attempts + STEP_LIMITS.part.attempts * parts + SPARE_PART_CALLS.full + proof;
}

/** The plan of `plan` under the offer edition `termsVersion`, or null when that edition sells nothing. */
export function planFor(termsVersion: string, plan: string): StudioPlan | null {
  if (!Object.prototype.hasOwnProperty.call(TERMS_PLAN, termsVersion)) return null;
  return planOfVersion(TERMS_PLAN[termsVersion], plan);
}

/** The plan of a stored quota version (an order's or entitlement's plan_version), or null. */
export function planOfVersion(planVersion: string, plan: string): StudioPlan | null {
  if (!Object.prototype.hasOwnProperty.call(STUDIO_PLANS, planVersion)) return null;
  const plans: Record<string, StudioPlan> = STUDIO_PLANS[planVersion as StudioPlanVersion];
  return (STUDIO_PLAN_IDS as readonly string[]).includes(plan) ? plans[plan] : null;
}

/** When an entitlement bought at `performTime` (Click Complete, ms) ends. */
export function entitlementEndsAt(plan: StudioPlan, performTime: number): number {
  const { duration } = plan;
  return "hours" in duration ? performTime + duration.hours * 3_600_000 : addCalendarMonth(performTime);
}

/** The VAT inside a plan's price, in tiyin (63 214 for Kunlik, 427 500 for Oylik). */
export function planVatTiyin(plan: StudioPlan): number {
  return includedVat(plan.amountTiyin, STUDIO_VAT_PERCENT);
}

/** A count of unused units: a whole number ≥ 0 (anything else counts as 0). */
function unitCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * What the unused units of a sold tariff are worth back, in tiyin (DECISIONS
 * 07.10.2026 §4 п. 2): with photo tasks in the tariff, presentations carry
 * 80 % of the price and photo tasks 20 % (Kunlik 4 720 / 236 so‘m, Oylik
 * 3 192 / 199,50 so‘m a unit); a tariff of presentations only spreads the
 * whole price over them (Kunlik 5 900, Oylik 3 990 a presentation). Units
 * returned for a defect count as unused too, so the sum is capped at the
 * price; rounded down to the tiyin. 0 for an unknown quota version or plan.
 */
export function refundValueTiyin(planVersion: string, plan: string, unusedPresentations: number, unusedPhotos: number): number {
  const tariff = planOfVersion(planVersion, plan);
  if (!tariff) return 0;
  const price = tariff.amountTiyin;
  const presentations = unitCount(unusedPresentations);
  const photos = unitCount(unusedPhotos);
  const P = tariff.presentationFull;
  const F = tariff.photoTask;
  let value: number;
  if (F > 0 && P > 0) {
    // presentations · 0.8 · price / P + photos · 0.2 · price / F, in whole numbers: (4·p·F + f·P) · price / (5·P·F).
    value = Math.floor(((4 * presentations * F + photos * P) * price) / (5 * P * F));
  } else if (P > 0) {
    value = Math.floor((presentations * price) / P);
  } else {
    value = F > 0 ? Math.floor((photos * price) / F) : 0;
  }
  return Math.min(price, value);
}
