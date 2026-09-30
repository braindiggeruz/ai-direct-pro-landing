// Consumer AI-chat runtime config, resolved from env with safe defaults.
// Pure — no I/O. Values from the brief's env contract.
import type { Env } from '../../_types';

export interface GptChatConfig {
  siteUrl: string;
  freeModel: string;
  freeFallbacks: string[];
  paidModel: string;
  paidFallbacks: string[];
  freeDailyLimit: number;
  freeHourlyLimit: number;
  paidMonthlyLimit: number;
  maxInputChars: number;
  maxHistoryTurns: number;
  hashSalt: string;
  /** max_tokens of one web-chat answer (GPT_MAX_OUTPUT_TOKENS). 400..4000, default 1600. */
  maxOutputTokens: number;
  /** Per-attempt budget until an OpenRouter stream's first content (GPT_FIRST_CONTENT_TIMEOUT_MS). 5000..20000 ms. */
  firstContentTimeoutMs: number;
  // ── Paid primary for the free tier (plan WP-04, decision L6) ─────────────────
  // webChatChain() puts the paid primary in front of the free chain only when
  // the flag is on AND the budget is above 0; every attempt on it then has to
  // pre-reserve its worst case from the day's budget (model-spend-store.ts),
  // and an exhausted budget skips it to ':free'. modelChain()/freeChain() never
  // change: Javob, AEO and the catalogue check stay ':free'.
  /** GPT_FREE_TIER_PAID_PRIMARY === 'true'; anything else (and unset) is false. */
  freeTierPaidPrimary: boolean;
  /** Daily USD the free tier may spend on the paid primary (GPT_FREE_PAID_DAILY_USD). 0..20, default 1; 0 = never. */
  freePaidDailyUsd: number;
  /**
   * GPT_STOP_CHARGE_MIN_CHARS (decision L4): a turn the visitor stopped or
   * left is charged only once at least this many answer characters reached
   * them; 0 = never charged. 0..20000, default 600.
   */
  stopChargeMinChars: number;
  // ── Z.ai (second provider, web chat only; see model-provider.ts) ──────────
  // Off unless ALL THREE: GPT_MODEL_PROVIDER='zai' and GPT_ZAI_EVAL_APPROVED
  // (public, need a deploy) and the secret ZAI_API_KEY. modelChain() below
  // never reads these fields, so Javob and the OpenRouter catalogue check can
  // never reach Z.ai.
  /** 'zai' only when GPT_MODEL_PROVIDER is 'zai' (trimmed, any case); anything else is 'openrouter'. */
  modelProvider: 'openrouter' | 'zai';
  /**
   * GPT_ZAI_EVAL_APPROVED: the date (YYYY-MM-DD, a real calendar day) of the
   * blind evaluation that approved Z.ai, or '' when unset or malformed. The
   * committed date must have docs/paid-chat/evals/zai-<date>.json (tested).
   */
  zaiEvalApproved: string;
  /** Bare Z.ai model code for the free tier. Must be a $0 model or it is ignored. */
  zaiModelFree: string;
  /** Bare Z.ai model code for the paid tier. Must be on the paid allowlist or it is ignored. */
  zaiModelPaid: string;
  /** Tiers that may put one Z.ai model in front of the OpenRouter chain. */
  zaiTiers: Array<'free' | 'paid'>;
  /** Per-attempt Z.ai budget (JSON: whole call; stream: first content). 3000..15000 ms. */
  zaiTimeoutMs: number;
}

function num(v: string | undefined, def: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

function list(v: string | undefined): string[] {
  return (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function clampedInt(v: string | undefined, def: number, min: number, max: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
}

function clampedUsd(v: string | undefined, def: number, max: number): number {
  const n = v?.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : def;
}

// '2026-10-05' → itself; '2026-02-30', '5.10.2026', '' → ''. A date that does
// not exist on the calendar is a typo, and a typo must keep Z.ai off.
function isoDay(v: string | undefined): string {
  const day = (v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : '';
}

// Unset → both tiers. Set → exactly the valid tiers named (an empty or invalid
// value switches Z.ai off for every tier, which fails towards OpenRouter).
function zaiTiers(v: string | undefined): Array<'free' | 'paid'> {
  if (v === undefined) return ['free', 'paid'];
  const tiers = list(v.toLowerCase()).filter(
    (tier): tier is 'free' | 'paid' => tier === 'free' || tier === 'paid',
  );
  return [...new Set(tiers)];
}

export function resolveConfig(env: Env): GptChatConfig {
  return {
    siteUrl: env.SITE_URL || env.OPENROUTER_SITE_URL || 'https://gptbot.uz',
    // These defaults ARE production. `wrangler pages deploy` replaces the whole
    // plain-text variable set from wrangler.toml, so a model pinned only in the
    // Cloudflare dashboard is deleted by the next deploy and the code default is
    // what actually runs. They are mirrored in wrangler.toml [vars]; the parity
    // assertion in tests/openrouter-model-catalogue.test.ts keeps the two equal.
    //
    // The previous defaults were set on 2026-07-11 and never revisited. By
    // 2026-09-04 OpenRouter had retired all three free slugs
    // (nvidia/nemotron-3-nano-30b-a3b:free, qwen/qwen3-235b-a22b-2507:free,
    // deepseek/deepseek-chat-v3-0324:free), so every candidate in the chain was
    // rejected as unknown and the chat answered provider_error — on the exact
    // pages that ~89% of the incoming Uzbek search traffic lands on.
    //
    // Replacements verified twice on 2026-09-04 (in the catalogue and
    // live-probed in Uzbek and Russian): MiniMax M3 ':free', nemotron and dots.
    // By 2026-09-07 OpenRouter had retired the MiniMax ':free' slug too (0
    // endpoints), yet it stayed at the head of the free chain and in the paid
    // fallbacks, and every hourly cooldown expiry spent a visitor's attempt on
    // it again.
    //
    // Chains from 2026-09-30, read from https://openrouter.ai/api/v1/models and
    // /api/v1/models/{id}/endpoints that day:
    //   free  1. nvidia/nemotron-3-super-120b-a12b:free ... fastest responder;
    //            the R1 production probe (2026-10-01) got 200 with 0 reasoning
    //            tokens and ~0.6 s to first token in Uzbek and Russian.
    //         2. dots-studio/dots-3-note-preview:free ... second vendor, 512k
    //            context, weakest Uzbek, answered every probe.
    //         3. google/gemma-4-31b-it:free ... one provider (Google AI Studio).
    //            It answered upstream 429 on 2026-09-04 and again to every call
    //            of the R1 probe, so it left the head of the chain; it returns
    //            there by config alone (OPENROUTER_MODEL_FREE) once a probe shows
    //            at most 10% 429 over 20 calls.
    //   paid  1. google/gemma-4-26b-a4b-it ... MoE, 13 providers, 5 of them
    //            inside PAID_PRICE_CEILING (model-pricing.ts); the request lets
    //            OpenRouter fall back between them (buildChatBody).
    //         2. mistralai/mistral-small-3.2-24b-instruct ... 4 providers, all
    //            inside the ceiling, no reasoning at all.
    //         3. google/gemma-4-31b-it:free ... so a paid turn still gets an
    //            answer when the OpenRouter credits run out (a 402 on a paid
    //            model skips to ':free', openrouter-chat.ts).
    // The free chain has three distinct vendors, so one vendor going down
    // cannot empty it; the paid chain's two gemma ids are served by different
    // hosts (third-party providers vs Google AI Studio). The gemma pair,
    // nemotron and dots answer without reasoning
    // (functions/platform/ai/model-policy.ts).
    // Rejected on evidence, not taste (2026-09-04): thinkingmachines/inkling*:free
    // answer 403 ("only available on agentic harnesses") to a website;
    // z-ai/glm-5.2:free returned upstream 429 on every attempt across ten
    // minutes; poolside/* and cohere/north-mini-code are coding agents;
    // inclusionai/ling-3.0-flash-fin is finance-tuned; liquid/lfm-2.5-2.6b is
    // 2.6B with mandatory reasoning.
    freeModel: env.OPENROUTER_MODEL_FREE || 'nvidia/nemotron-3-super-120b-a12b:free',
    freeFallbacks: list(env.OPENROUTER_MODEL_FREE_FALLBACKS).length
      ? list(env.OPENROUTER_MODEL_FREE_FALLBACKS)
      : ['dots-studio/dots-3-note-preview:free', 'google/gemma-4-31b-it:free'],
    // Every paid request also enforces the provider price cap (max_price).
    paidModel: env.OPENROUTER_MODEL_PAID || 'google/gemma-4-26b-a4b-it',
    paidFallbacks: list(env.OPENROUTER_MODEL_PAID_FALLBACKS).length
      ? list(env.OPENROUTER_MODEL_PAID_FALLBACKS)
      : ['mistralai/mistral-small-3.2-24b-instruct', 'google/gemma-4-31b-it:free'],
    freeDailyLimit: num(env.GPT_FREE_DAILY_LIMIT, 15),
    freeHourlyLimit: num(env.GPT_FREE_HOURLY_LIMIT, 5),
    paidMonthlyLimit: Math.min(num(env.GPT_PAID_MONTHLY_LIMIT, 300), 300),
    maxInputChars: num(env.GPT_MAX_INPUT_CHARS, 3000),
    maxHistoryTurns: 10, // server-side history window cap (per report)
    hashSalt: env.GPT_HASH_SALT || '',
    maxOutputTokens: clampedInt(env.GPT_MAX_OUTPUT_TOKENS, 1600, 400, 4000),
    firstContentTimeoutMs: clampedInt(env.GPT_FIRST_CONTENT_TIMEOUT_MS, 12_000, 5_000, 20_000),
    freeTierPaidPrimary: (env.GPT_FREE_TIER_PAID_PRIMARY || '').trim().toLowerCase() === 'true',
    freePaidDailyUsd: clampedUsd(env.GPT_FREE_PAID_DAILY_USD, 1, 20),
    stopChargeMinChars: clampedInt(env.GPT_STOP_CHARGE_MIN_CHARS, 600, 0, 20_000),
    modelProvider: (env.GPT_MODEL_PROVIDER || '').trim().toLowerCase() === 'zai' ? 'zai' : 'openrouter',
    zaiModelFree: (env.ZAI_MODEL_FREE || '').trim().toLowerCase() || 'glm-4.7-flash',
    zaiModelPaid: (env.ZAI_MODEL_PAID || '').trim().toLowerCase() || 'glm-4.5-air',
    zaiEvalApproved: isoDay(env.GPT_ZAI_EVAL_APPROVED),
    zaiTiers: zaiTiers(env.ZAI_TIERS),
    zaiTimeoutMs: clampedInt(env.ZAI_TIMEOUT_MS, 12_000, 3_000, 15_000),
  };
}

/**
 * Model fallback chain for a plan tier: [primary, ...fallbacks].
 *
 * The free tier keeps ':free' ids only, whatever the env says: anonymous
 * traffic must never turn into a paid request (the second line of defence
 * next to max_price 0/0/0 for ':free' in buildChatBody).
 */
export function modelChain(cfg: GptChatConfig, tier: 'free' | 'paid'): string[] {
  return tier === 'paid'
    ? [cfg.paidModel, ...cfg.paidFallbacks]
    : [cfg.freeModel, ...cfg.freeFallbacks].filter((model) => model.endsWith(':free'));
}

/**
 * The ':free' chain by name, for the callers that must never pay on their own:
 * Javob (functions/lib/telegram/service.ts) and the web chat's free tier, which
 * webChatChain may head with the budgeted paid primary.
 */
export function freeChain(cfg: GptChatConfig): string[] {
  return modelChain(cfg, 'free');
}
