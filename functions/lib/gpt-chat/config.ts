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
    // Replacements verified twice on 2026-09-04: present in
    // https://openrouter.ai/api/v1/models, AND live-probed with this file's own
    // request body in Uzbek and Russian. Three DISTINCT vendors on three
    // different stacks, so one vendor going down cannot empty the chain.
    //   1. minimax/minimax-m3:free ...... 1M context, the cleanest Uzbek and
    //      Russian of the batch, ~1.1 s, and the only strong candidate that
    //      spends no part of the 900-token budget on reasoning tokens.
    //   2. nvidia/nemotron-3-super-120b-a12b:free ... hybrid Mamba-Transformer
    //      MoE, so a shared-architecture failure is unlikely; fastest responder
    //      measured (~0.5 s) with correct Uzbek and Russian.
    //   3. dots-studio/dots-3-note-preview:free ... third vendor, 512k context.
    //      Last because its Uzbek is the weakest of the three, but it answered
    //      every probe, which the tail of a fallback chain is for.
    // Rejected on evidence, not taste: thinkingmachines/inkling*:free answer 403
    // ("only available on agentic harnesses") to a website; google/gemma-4-*:free
    // and z-ai/glm-5.2:free returned upstream 429 on every attempt across ten
    // minutes; poolside/* and cohere/north-mini-code are coding agents;
    // inclusionai/ling-3.0-flash-fin is finance-tuned; liquid/lfm-2.5-2.6b is
    // 2.6B with mandatory reasoning.
    freeModel: env.OPENROUTER_MODEL_FREE || 'minimax/minimax-m3:free',
    freeFallbacks: list(env.OPENROUTER_MODEL_FREE_FALLBACKS).length
      ? list(env.OPENROUTER_MODEL_FREE_FALLBACKS)
      : ['nvidia/nemotron-3-super-120b-a12b:free', 'dots-studio/dots-3-note-preview:free'],
    // Paid chain re-checked against the same catalogue response on 2026-09-04:
    // all three slugs are still served, so they stay as they are.
    paidModel: env.OPENROUTER_MODEL_PAID || 'mistralai/mistral-small-3.2-24b-instruct',
    paidFallbacks: list(env.OPENROUTER_MODEL_PAID_FALLBACKS).length
      ? list(env.OPENROUTER_MODEL_PAID_FALLBACKS)
      : ['meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'],
    freeDailyLimit: num(env.GPT_FREE_DAILY_LIMIT, 15),
    freeHourlyLimit: num(env.GPT_FREE_HOURLY_LIMIT, 5),
    paidMonthlyLimit: num(env.GPT_PAID_MONTHLY_LIMIT, 600),
    maxInputChars: num(env.GPT_MAX_INPUT_CHARS, 3000),
    maxHistoryTurns: 10, // server-side history window cap (per report)
    hashSalt: env.GPT_HASH_SALT || '',
  };
}

/** Model fallback chain for a plan tier: [primary, ...fallbacks]. */
export function modelChain(cfg: GptChatConfig, tier: 'free' | 'paid'): string[] {
  return tier === 'paid'
    ? [cfg.paidModel, ...cfg.paidFallbacks]
    : [cfg.freeModel, ...cfg.freeFallbacks];
}
