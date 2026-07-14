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
    // Defaults mirror the strategic report's recommended model stack.
    freeModel: env.OPENROUTER_MODEL_FREE || 'nvidia/nemotron-3-nano-30b-a3b:free',
    freeFallbacks: list(env.OPENROUTER_MODEL_FREE_FALLBACKS).length
      ? list(env.OPENROUTER_MODEL_FREE_FALLBACKS)
      : ['qwen/qwen3-235b-a22b-2507:free', 'deepseek/deepseek-chat-v3-0324:free'],
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
