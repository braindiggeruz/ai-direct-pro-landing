// Shadow list prices of the studio's models, for accounting only, and the
// absolute worst case the fixed limits allow (spec §2.5).
//
// Nothing here decides what a buyer pays or gets: prices of the tariffs are
// in plans.ts. These numbers price each generation for studio_unit_ledger
// (cost_micro, in micro-USD like the chat's cost_micro_usd), for the daily
// spend guards and for the report. The chat's PRICE_USD_PER_MTOK
// (gpt-chat/model-pricing.ts), where glm-5.3-flash costs 0 while the prepaid
// bundle lasts, is neither used nor changed: the studio prices the list
// price, the cost after the bundle ends (17.12.2026).
//
// Sources (read 06.10.2026):
//   Z.ai https://docs.z.ai/guides/overview/pricing — glm-5.3-flash $0.15 in /
//   $0.03 cached / $0.50 out per 1M tokens; glm-4.6v-flash free.
//   Workers AI — $0.011 per 1 000 neurons. Flux-1-schnell 1024², 4 steps:
//   57.6 neurons ≈ $0.000634 a picture. Llama Guard 3 8B $0.484 in / $0.03
//   out per 1M. Gemma 4 26B as the picture check: measured 4.4 neurons a
//   call, priced at 5 (studio/MEASURE-30.md §3).
//   OpenRouter ':free' ids cost $0 (the chat's buildChatBody sends max_price 0).
import { includedVat } from "../gpt-chat/fiscal-config";
import {
  FREE_TEXT_FALLBACKS,
  IMAGE_CHECK_MODELS,
  TEXT_MODELS,
  VISION_MODELS,
} from "./config";
import {
  DECK_SHAPES,
  SPARE_PART_CALLS,
  STEP_LIMITS,
  STUDIO_FREE_DAILY,
  STUDIO_VAT_PERCENT,
  deckParts,
  maxJobModelCalls,
  type StudioPlan,
} from "./plans";

/** UZS per USD, Central Bank of Uzbekistan, 06.10.2026. For reports and the worst-case test only. */
export const UZS_PER_USD = 11_778.45;
/**
 * Click's commission, the top of its official «services» rate; the minimum
 * fee and the receipt fee are not known yet. Payme's rate is in the owner's
 * contract, not in this repository, so the net of every sale (Payme first,
 * DECISIONS §12) is counted with this rate until the report shows Payme's.
 */
export const CLICK_COMMISSION_PERCENT = 2.5;
/** The roadmap's stop criterion (§7.2 item 7): model cost of a buyer over a term above half of the net. */
export const COST_STOP_SHARE = 0.5;

/** USD per 1M tokens. */
export interface TokenPrice {
  readonly input: number;
  readonly cachedInput: number;
  readonly output: number;
}

export interface TokenUsage {
  /** All prompt tokens, cached ones included. */
  readonly input: number;
  /** The part of `input` the provider served from its cache. */
  readonly cachedInput?: number;
  /** Completion tokens, reasoning included. */
  readonly output: number;
}

const ZERO: TokenPrice = { input: 0, cachedInput: 0, output: 0 };
const GLM_53_FLASH: TokenPrice = { input: 0.15, cachedInput: 0.03, output: 0.5 };

/** Every text and vision model a setting may choose (config.ts lists). */
export const MODEL_PRICES: Readonly<Record<string, TokenPrice>> = {
  "zai/glm-5.3-flash": GLM_53_FLASH,
  "zai/glm-4.6v-flash": ZERO,
  "openrouter:google/gemma-4-31b-it:free": ZERO,
};

export const WORKERS_AI_USD_PER_1K_NEURONS = 0.011;
export const FLUX_MODEL = "@cf/black-forest-labs/flux-1-schnell";
/** One 1024×1024 picture at 4 steps. */
export const FLUX_USD_PER_IMAGE = 0.000634;
export const PROMPT_GUARD_MODEL = "@cf/meta/llama-guard-3-8b";
export const PROMPT_GUARD_PRICE: TokenPrice = { input: 0.484, cachedInput: 0.484, output: 0.03 };

/** A picture check: a fixed price a call (Workers AI) or the model's token price. */
export type ImageCheckPrice = { readonly usdPerCall: number } | { readonly tokens: TokenPrice };
export const IMAGE_CHECK_PRICES: Readonly<Record<string, ImageCheckPrice>> = {
  "@cf/google/gemma-4-26b-a4b-it": { usdPerCall: (5 * WORKERS_AI_USD_PER_1K_NEURONS) / 1000 },
  "zai/glm-5.3-flash": { tokens: GLM_53_FLASH },
};

const MICRO = 1_000_000;

/**
 * Micro-USD of one call, rounded up; uncached input at the input price. A
 * price per 1M tokens in USD is the price of one token in micro-USD.
 */
export function tokenCostMicro(price: TokenPrice, usage: TokenUsage): number {
  const cached = Math.min(Math.max(usage.cachedInput ?? 0, 0), usage.input);
  const micro = (usage.input - cached) * price.input + cached * price.cachedInput + usage.output * price.output;
  // Rounded to 1e-6 first, so float noise (650000.0000001) does not round up.
  return Math.ceil(Math.round(micro * 1e6) / 1e6);
}

/** The shadow price of a model by name, or null for one the studio does not know (never a guessed zero). */
export function modelPrice(model: string): TokenPrice | null {
  return Object.prototype.hasOwnProperty.call(MODEL_PRICES, model) ? MODEL_PRICES[model] : null;
}

/** Micro-USD of one picture check with `model`, at the step's token limits for a token-priced one. */
export function imageCheckMicro(model: string): number {
  const price = IMAGE_CHECK_PRICES[model];
  if (!price) throw new Error(`no shadow price for the picture check ${model}`);
  if ("usdPerCall" in price) return Math.ceil(price.usdPerCall * MICRO);
  return tokenCostMicro(price.tokens, { input: STEP_LIMITS.imageCheck.inputTokens, output: STEP_LIMITS.imageCheck.maxTokens });
}

export const FLUX_MICRO_PER_IMAGE = Math.ceil(FLUX_USD_PER_IMAGE * MICRO);

// ── The absolute worst case (spec §2.5; tests/studio-plans.test.ts) ─────────
// Every call at its ceiling, every attempt and retry used, every spare call
// spent, the dearest model each setting may choose, no cache. Not counted:
// attempts the ledger hands back (a server fault, a refusal, an empty
// expiry). A refused topic or prompt list makes no further call, a failed
// provider call is not billed, they are capped at 5 a day a subject
// (studio_free_usage 'returned'), and the daily spend buckets studio_free /
// studio_paid stop them. Units the owner credits by hand (studio-unit-credit,
// ≤ 10 an order) are outside what a buyer can drive.

/** The highest price of each kind among `models`: an upper bound whichever a setting picks. */
function dearest(models: readonly string[]): TokenPrice {
  return models.reduce<TokenPrice>((top, model) => {
    const price = modelPrice(model);
    if (!price) throw new Error(`no shadow price for ${model}`);
    return {
      input: Math.max(top.input, price.input),
      cachedInput: Math.max(top.cachedInput, price.cachedInput),
      output: Math.max(top.output, price.output),
    };
  }, ZERO);
}

type TextStep = { readonly maxTokens: number; readonly lengthRetryMaxTokens: number; readonly attempts: number; readonly inputTokens: number };

/**
 * `steps` planned steps (each one call at maxTokens and its further attempts
 * at the length-retry ceiling) and `spare` browser re-calls, each at that
 * ceiling too.
 */
function textMicro(step: TextStep, price: TokenPrice, steps: number, spare = 0): number {
  const calls = steps * step.attempts + spare;
  return tokenCostMicro(price, {
    input: calls * step.inputTokens,
    output: steps * step.maxTokens + (calls - steps) * step.lengthRetryMaxTokens,
  });
}

function promptGuardMicro(): number {
  const step = STEP_LIMITS.promptGuard;
  return tokenCostMicro(PROMPT_GUARD_PRICE, { input: step.inputTokens * step.attempts, output: step.maxTokens * step.attempts });
}

/** One call of `step` at `output` tokens out and the step's most input. */
function callMicro(step: TextStep, price: TokenPrice, output: number): number {
  return tokenCostMicro(price, { input: step.inputTokens, output });
}

/**
 * The text of a paid full deck with its proofreading pass, at the job's
 * step cap (jobs.ts): the outline and the parts make at most
 * maxJobModelCalls(full, S) calls, all steps together at most
 * maxJobModelCalls(full, S, true). The pass usually makes one call a part,
 * but two requests for the same part at once both proofread it, so a pass
 * may also take a step the outline and the parts left unused. The bound is
 * the dearest mix under both caps: the n dearest outline and part calls
 * (each at its ceiling, as textMicro counts them) and every other step of
 * the cap a proofreading call at its ceiling, for the worst n.
 */
function proofreadDeckTextMicro(price: TokenPrice, slides: number): number {
  const { outline, part, proof } = STEP_LIMITS;
  const parts = deckParts(slides);
  const shared = [
    callMicro(outline, price, outline.maxTokens),
    ...Array<number>(outline.attempts - 1).fill(callMicro(outline, price, outline.lengthRetryMaxTokens)),
    ...Array<number>(parts).fill(callMicro(part, price, part.maxTokens)),
    ...Array<number>(parts * (part.attempts - 1) + SPARE_PART_CALLS.full).fill(callMicro(part, price, part.lengthRetryMaxTokens)),
  ].sort((a, b) => b - a);
  const cap = maxJobModelCalls("full", slides, true);
  const proofCall = Math.max(callMicro(proof, price, proof.maxTokens), callMicro(proof, price, proof.lengthRetryMaxTokens));
  let taken = 0;
  let worst = cap * proofCall;
  shared.forEach((micro, index) => {
    taken += micro;
    worst = Math.max(worst, taken + (cap - index - 1) * proofCall);
  });
  return worst;
}

/** Flux calls of a job (pictures plus retries), each followed by the dearest allowed check. */
function picturesMicro(shape: keyof typeof DECK_SHAPES): number {
  const calls = DECK_SHAPES[shape].images + DECK_SHAPES[shape].imageRetries;
  const check = Math.max(...IMAGE_CHECK_MODELS.map(imageCheckMicro));
  return calls * (FLUX_MICRO_PER_IMAGE + check);
}

/**
 * A full deck at the most slides: the outline, every part, the spare
 * re-calls, the prompt check and every picture. With `proofread` (the
 * default: every paid deck is counted as an Uzbek one, DECISIONS §13 п. 4)
 * the text is bounded at the job's step cap with the proofreading pass
 * (proofreadDeckTextMicro, DECISIONS §16).
 */
export function worstFullDeckMicro(proofread = true): number {
  const price = dearest(TEXT_MODELS);
  const slides = DECK_SHAPES.full.maxSlides;
  const text = proofread
    ? proofreadDeckTextMicro(price, slides)
    : textMicro(STEP_LIMITS.outline, price, 1) + textMicro(STEP_LIMITS.part, price, deckParts(slides), SPARE_PART_CALLS.full);
  return text + promptGuardMicro() + picturesMicro("full");
}

/** The free deck: its call, the spare re-call, the prompt check and its pictures. */
export function worstFreeDeckMicro(): number {
  const price = dearest([...TEXT_MODELS, ...FREE_TEXT_FALLBACKS]);
  return textMicro(STEP_LIMITS.free, price, 1, SPARE_PART_CALLS.free) + promptGuardMicro() + picturesMicro("free");
}

/** One photo: every attempt at maxTokens plus the length retries at their ceiling. */
export function worstPhotoMicro(): number {
  const step = STEP_LIMITS.photo;
  const calls = step.attempts + step.lengthRetries;
  return tokenCostMicro(dearest(VISION_MODELS), {
    input: step.inputTokens * calls,
    output: step.attempts * step.maxTokens + step.lengthRetries * step.lengthRetryMaxTokens,
  });
}

/** UTC days (free-tier days) a term can touch: 24 h spans 2, a calendar month of 31 days spans 32. */
export function freeDaysInTerm(plan: StudioPlan): number {
  return "hours" in plan.duration ? Math.ceil(plan.duration.hours / 24) + 1 : 31 + 1;
}

export interface PlanWorstCase {
  /** Micro-USD over the whole term. */
  readonly micro: number;
  readonly uzs: number;
  /** What the seller keeps of the price after VAT and Click's commission, in so‘m. */
  readonly netUzs: number;
  readonly share: number;
}

/** What remains of `amountTiyin` after the VAT inside it and Click's commission, in tiyin. */
export function netTiyin(amountTiyin: number): number {
  return amountTiyin - includedVat(amountTiyin, STUDIO_VAT_PERCENT) - Math.round((amountTiyin * CLICK_COMMISSION_PERCENT) / 100);
}

/**
 * A buyer's absolute worst term: every paid unit and its regeneration at the
 * worst case, plus every free unit of every UTC day the term touches.
 */
export function worstPlanCase(plan: StudioPlan): PlanWorstCase {
  const regen = 1 + plan.regenPerUnit;
  const days = freeDaysInTerm(plan);
  const micro = plan.presentationFull * regen * worstFullDeckMicro()
    + plan.photoTask * regen * worstPhotoMicro()
    + days * STUDIO_FREE_DAILY.presentation_free * worstFreeDeckMicro()
    + days * STUDIO_FREE_DAILY.photo_task * worstPhotoMicro();
  const uzs = (micro / MICRO) * UZS_PER_USD;
  const netUzs = netTiyin(plan.amountTiyin) / 100;
  return { micro, uzs, netUzs, share: uzs / netUzs };
}

/** Micro-USD in so‘m at the shadow rate (reports). */
export function microToUzs(micro: number): number {
  return (micro / MICRO) * UZS_PER_USD;
}
