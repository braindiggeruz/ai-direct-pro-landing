// Cost accounting for one chat answer, in USD, from the provider's own token
// counts. Written to gpt_messages.cost_usd on the ASSISTANT row, so the owner
// can see what each model actually costs per answer (the roadmap's "учёт
// стоимости каждой попытки") and compare it with the 20 000 UZS package.
//
// Prices are USD per 1M tokens, { in: prompt, out: completion }.
//
// Sources:
//   Z.ai — https://docs.z.ai/guides/overview/pricing, read 2026-09-30:
//     GLM-4.7-Flash, GLM-4.5-Flash free; GLM-4.7-FlashX 0.07 / 0.4;
//     GLM-4.5-Air 0.2 / 1.1; GLM-4.7 0.6 / 2.2 (listed for accounting only;
//     it is not on the chain allowlist in model-provider.ts).
//   OpenRouter — https://openrouter.ai/api/v1/models, read 2026-09-30:
//     google/gemma-4-26b-a4b-it prompt 0.00000009 / completion 0.0000003 per
//     token → 0.09 / 0.30 per 1M (the paid primary; its cheaper providers,
//     down to 0.042 / 0.22, are billed at their own price);
//     mistralai/mistral-small-3.2-24b-instruct 0.00000009375 / 0.00000025
//     → 0.09375 / 0.25;
//     meta-llama/llama-3.3-70b-instruct 0.0000001 / 0.00000032 → 0.1 / 0.32;
//     deepseek/deepseek-v4-flash 0.00000007854 / 0.00000015708 → 0.07854 /
//     0.15708 (a candidate, in no chain yet; it was 0.0818 / 0.1635 earlier
//     that day — list prices move, max_price holds the real cap).
//     All are inside PAID_PRICE_CEILING below, the max_price cap buildChatBody
//     enforces.
//   Any OpenRouter ':free' id is $0: buildChatBody sends max_price 0/0/0 for
//   those, so OpenRouter cannot bill the request.
//
// The number is an estimate from list prices (cached-input discounts are not
// modelled). An unknown model or a missing token count yields null, never a
// guessed zero.
import { providerOf } from "./model-provider";

/** OpenRouter `provider.max_price`: USD per 1M prompt / completion tokens, USD per request. */
export interface PriceCeiling {
  prompt: number;
  completion: number;
  request: number;
}

/**
 * The most an OpenRouter request may cost. buildChatBody sends it as
 * max_price, so OpenRouter refuses any endpoint above it, and the hourly
 * catalogue check (billing-operations-store.ts) takes a chain model out when
 * none of its endpoints fits. One constant, so the two cannot drift apart.
 */
export const PAID_PRICE_CEILING: Readonly<PriceCeiling> = { prompt: 0.1, completion: 0.32, request: 0 };
/** A ':free' id must never become a billable request. */
export const FREE_PRICE_CEILING: Readonly<PriceCeiling> = { prompt: 0, completion: 0, request: 0 };

/** The ceiling for an OpenRouter model id: $0 for ':free', PAID_PRICE_CEILING otherwise. */
export function priceCeiling(modelId: string): Readonly<PriceCeiling> {
  return modelId.endsWith(":free") ? FREE_PRICE_CEILING : PAID_PRICE_CEILING;
}

export interface ModelPrice {
  /** USD per 1M prompt tokens. */
  in: number;
  /** USD per 1M completion tokens. */
  out: number;
}

export const PRICE_USD_PER_MTOK: Readonly<Record<string, ModelPrice>> = {
  "zai/glm-4.7-flash": { in: 0, out: 0 },
  "zai/glm-4.5-flash": { in: 0, out: 0 },
  "zai/glm-4.7-flashx": { in: 0.07, out: 0.4 },
  "zai/glm-4.5-air": { in: 0.2, out: 1.1 },
  "zai/glm-4.7": { in: 0.6, out: 2.2 },
  "google/gemma-4-26b-a4b-it": { in: 0.09, out: 0.3 },
  "mistralai/mistral-small-3.2-24b-instruct": { in: 0.09375, out: 0.25 },
  "meta-llama/llama-3.3-70b-instruct": { in: 0.1, out: 0.32 },
  "deepseek/deepseek-v4-flash": { in: 0.07854, out: 0.15708 },
};

export function modelPrice(modelId: string | null | undefined): ModelPrice | null {
  if (!modelId) return null;
  if (providerOf(modelId) === "openrouter" && modelId.endsWith(":free")) return { in: 0, out: 0 };
  return Object.prototype.hasOwnProperty.call(PRICE_USD_PER_MTOK, modelId)
    ? PRICE_USD_PER_MTOK[modelId]
    : null;
}

function tokens(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Estimated USD cost of one answer; null when the model or a token count is unknown. */
export function estimateCostUsd(
  modelId: string | null | undefined,
  inTok: number | null | undefined,
  outTok: number | null | undefined,
): number | null {
  const price = modelPrice(modelId);
  const input = tokens(inTok);
  const output = tokens(outTok);
  if (!price || input === null || output === null) return null;
  const usd = (input * price.in + output * price.out) / 1_000_000;
  // Ten decimals (1e-10 USD) is far below a token's price and removes the
  // float noise (0.0003 + 0.00055 = 0.0008500000000000001).
  return Math.round(usd * 1e10) / 1e10;
}
