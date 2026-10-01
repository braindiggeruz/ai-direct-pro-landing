// Runtime config for the Telegram "Smart Forward" assistant. Pure — no I/O.
// Distinct secrets from the lead-capture bot (functions/api/telegram/webhook.ts)
// so both bots can coexist with different tokens and webhooks.
import type { Env } from '../../_types';
import { resolveHashSalt, type HashSalt } from '../gpt-chat/hash';

/** hashSalt/hashSaltSince (HashSalt): the pseudonym salt, see gpt-chat/hash.ts. */
export interface TelegramConfig extends HashSalt {
  token: string;
  webhookSecret: string;
  siteUrl: string;
  botUsername: string;
  /**
   * Free replies a day (TELEGRAM_FREE_DAILY_LIMIT) and a month
   * (TELEGRAM_FREE_MONTHLY_LIMIT), counted by Tashkent day and month
   * (billing.ts). null when unset or invalid: the plans row 'free' is the
   * fallback (decision L15).
   */
  freeDailyLimit: number | null;
  freeMonthlyLimit: number | null;
  maxInputChars: number;
  maxOutputChars: number;
  itemTtlMs: number;
  sttTimeoutMs: number;
  voiceMinSeconds: number;
  voiceMaxSeconds: number;
  voiceMaxBytes: number;
  voiceMaxTranscriptChars: number;
  analysisTimeoutMs: number;
  analysisTtlMs: number;
  analysisFreeDaily: number;
}

function num(v: string | undefined, def: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

/** A whole number 1..max, or null for unset, zero, negative or garbage. */
function limit(v: string | undefined, max: number): number | null {
  const raw = (v || '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? Math.min(n, max) : null;
}

export function resolveTelegramConfig(env: Env): TelegramConfig {
  const voiceMinSeconds = Math.min(num(env.TELEGRAM_VOICE_MIN_SECONDS, 3), 30);
  return {
    token: env.TELEGRAM_ASSISTANT_BOT_TOKEN || '',
    webhookSecret: env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET || '',
    siteUrl: (env.SITE_URL || env.OPENROUTER_SITE_URL || 'https://gptbot.uz').replace(/\/+$/, ''),
    // Public, non-secret. Used only for share links; the site reads its own
    // VITE_TELEGRAM_BOT_USERNAME at build time.
    botUsername: (env.TELEGRAM_ASSISTANT_BOT_USERNAME || '').replace(/^@/, ''),
    freeDailyLimit: limit(env.TELEGRAM_FREE_DAILY_LIMIT, 1000),
    freeMonthlyLimit: limit(env.TELEGRAM_FREE_MONTHLY_LIMIT, 30_000),
    maxInputChars: num(env.TELEGRAM_MAX_INPUT_CHARS, 4000),
    maxOutputChars: num(env.TELEGRAM_MAX_OUTPUT_CHARS, 3000),
    // Source text retained only long enough for follow-up buttons (24h).
    itemTtlMs: num(env.TELEGRAM_ITEM_TTL_HOURS, 24) * 60 * 60 * 1000,
    ...resolveHashSalt(env),
    sttTimeoutMs: Math.min(Math.max(num(env.TELEGRAM_STT_TIMEOUT_MS, 10_000), 1_000), 10_000),
    voiceMinSeconds,
    voiceMaxSeconds: Math.max(voiceMinSeconds, Math.min(num(env.TELEGRAM_VOICE_MAX_SECONDS, 300), 300)),
    voiceMaxBytes: Math.min(num(env.TELEGRAM_VOICE_MAX_BYTES, 20 * 1024 * 1024), 20 * 1024 * 1024),
    voiceMaxTranscriptChars: Math.min(num(env.TELEGRAM_VOICE_MAX_TRANSCRIPT_CHARS, 12_000), 16_000),
    analysisTimeoutMs: Math.min(Math.max(num(env.TELEGRAM_ANALYSIS_TIMEOUT_MS, 12_000), 1_000), 15_000),
    analysisTtlMs: Math.min(num(env.TELEGRAM_ANALYSIS_TTL_HOURS, 24), 24) * 60 * 60 * 1000,
    analysisFreeDaily: Math.min(num(env.TELEGRAM_ANALYSIS_FREE_DAILY, 1), 1),
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
