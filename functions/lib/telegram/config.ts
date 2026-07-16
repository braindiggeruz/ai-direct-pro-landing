// Runtime config for the Telegram "Smart Forward" assistant. Pure — no I/O.
// Distinct secrets from the lead-capture bot (functions/api/telegram/webhook.ts)
// so both bots can coexist with different tokens and webhooks.
import type { Env } from '../../_types';

export interface TelegramConfig {
  token: string;
  webhookSecret: string;
  siteUrl: string;
  botUsername: string;
  freeDailyLimit: number;
  maxInputChars: number;
  maxOutputChars: number;
  itemTtlMs: number;
  hashSalt: string;
}

function num(v: string | undefined, def: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

export function resolveTelegramConfig(env: Env): TelegramConfig {
  return {
    token: env.TELEGRAM_ASSISTANT_BOT_TOKEN || '',
    webhookSecret: env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET || '',
    siteUrl: (env.SITE_URL || env.OPENROUTER_SITE_URL || 'https://gptbot.uz').replace(/\/+$/, ''),
    // Public, non-secret. Used only for share links; the site reads its own
    // VITE_TELEGRAM_BOT_USERNAME at build time.
    botUsername: (env.TELEGRAM_ASSISTANT_BOT_USERNAME || '').replace(/^@/, ''),
    freeDailyLimit: num(env.TELEGRAM_FREE_DAILY_LIMIT, 20),
    maxInputChars: num(env.TELEGRAM_MAX_INPUT_CHARS, 4000),
    maxOutputChars: num(env.TELEGRAM_MAX_OUTPUT_CHARS, 3000),
    // Source text retained only long enough for follow-up buttons (24h).
    itemTtlMs: num(env.TELEGRAM_ITEM_TTL_HOURS, 24) * 60 * 60 * 1000,
    hashSalt: env.GPT_HASH_SALT || '',
  };
}

/**
 * True only once BOTH dedicated secrets are present. Keeping the endpoint
 * dormant while the token and webhook secret are configured prevents an
 * unauthenticated window during setup.
 */
export function telegramConfigured(env: Env): boolean {
  return !!(env.TELEGRAM_ASSISTANT_BOT_TOKEN && env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET);
}

/**
 * Bots whose webhook must NEVER be repointed to the assistant route.
 * aidirectprobot is the live Telegram-Ads lead-capture bot served by
 * /api/telegram/webhook — redirecting it would silently kill the Ads funnel.
 * Used by scripts/telegram-setup.ts as a hard pre-setWebhook guard.
 */
const PROTECTED_BOT_USERNAMES = new Set(['aidirectprobot']);

export function isProtectedBotUsername(username: string): boolean {
  return PROTECTED_BOT_USERNAMES.has(username.replace(/^@/, '').toLowerCase());
}
