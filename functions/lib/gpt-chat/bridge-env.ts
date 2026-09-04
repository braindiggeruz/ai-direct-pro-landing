// Env surface for the chat → owner bridge (owner notification + Telegram
// handoff). These names are NOT yet declared in functions/_types.ts, which is
// owned elsewhere; declaring them here keeps the bridge type-safe today and
// makes the eventual move into `Env` a copy-paste with no call-site changes.
//
// SECRETS — the owner sets these two by hand, they are never in wrangler.toml
// (Cloudflare Pages → Settings → Environment variables → Production, type
// "Secret"; a Pages deploy replaces plain-text vars but leaves secrets alone):
//
//   GPT_NOTIFY_BOT_TOKEN   Bot API token of the bot that DELIVERS the owner's
//                          lead alerts. May be the same bot as the Javob
//                          assistant; falls back to TELEGRAM_ASSISTANT_BOT_TOKEN
//                          when unset, so an operator who already configured the
//                          assistant gets notifications with no new credential.
//   GPT_NOTIFY_CHAT_ID     Numeric Telegram chat id that RECEIVES them (the
//                          owner's own chat with that bot, or a private group).
//                          Falls back to the long-standing TELEGRAM_ADMIN_CHAT_ID.
//
// Everything else below is public configuration and belongs in wrangler.toml.
import type { Env } from '../../_types';

export interface BridgeEnvExtras {
  /** Secret. Bot token used only to send the owner a lead alert. */
  GPT_NOTIFY_BOT_TOKEN?: string;
  /** Secret. Chat id that receives lead alerts. */
  GPT_NOTIFY_CHAT_ID?: string;
  /**
   * The Telegram-Ads lead bot's admin chat, in production since long before
   * this bridge (functions/api/telegram/webhook.ts declares it on its own
   * local Env). Read here only as the fallback recipient, never written.
   */
  TELEGRAM_ADMIN_CHAT_ID?: string;
  /** Public @username of the bot the web chat hands a conversation over to. */
  GPT_HANDOFF_BOT_USERNAME?: string;
  /** Public. Handoff token lifetime in minutes. Default 1440, clamped 5…10080. */
  GPT_HANDOFF_TTL_MINUTES?: string;
  /** Public. Handoff mints allowed per hashed IP per hour. Default 20. */
  GPT_HANDOFF_MAX_PER_HOUR?: string;
  /** Public. Leads accepted per hashed IP per hour. Default 5. */
  GPT_LEAD_MAX_PER_HOUR?: string;
  /** Public. Leads accepted per hashed IP per day. Default 20. */
  GPT_LEAD_MAX_PER_DAY?: string;
  /** Public. Leads accepted across all visitors per hour. Default 30. */
  GPT_LEAD_GLOBAL_MAX_PER_HOUR?: string;
  /** Public. Require Turnstile after this many hourly attempts from one IP. */
  GPT_LEAD_TURNSTILE_AFTER?: string;
  /** Public. Handoff rows minted across all visitors per hour. Default 100. */
  GPT_HANDOFF_GLOBAL_MAX_PER_HOUR?: string;
  /** Public. Owner alerts delivered per hour across ALL visitors. Default 30. */
  GPT_OWNER_NOTIFY_MAX_PER_HOUR?: string;
}

/** `Env` plus the bridge's own variables. Use this instead of `Env` here. */
export type BridgeEnv = Env & BridgeEnvExtras;

/** Bounded integer env read. Mirrors the `num()` in config.ts. */
export function boundedNum(raw: string | undefined, def: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export interface BridgeLimits {
  /** Leads accepted from one hashed IP per hour. */
  leadPerHour: number;
  /** Leads accepted from one hashed IP per calendar-independent 24h window. */
  leadPerDay: number;
  /** Handoff links minted for one hashed IP per hour. */
  handoffPerHour: number;
  /** Leads accepted globally per hour, bounding distributed floods. */
  leadGlobalPerHour: number;
  /** Per-IP attempt count after which a configured Turnstile is mandatory. */
  leadTurnstileAfter: number;
  /** Handoff rows minted globally per hour, bounding distributed floods. */
  handoffGlobalPerHour: number;
  /** Owner alerts pushed per hour across every visitor combined. */
  ownerAlertsPerHour: number;
  /** A repeat of the same contact inside this window is one lead, not two. */
  duplicateWindowMs: number;
}

/**
 * Deliberately low. A real person leaves one contact, maybe two if the first
 * attempt failed; nobody legitimately files six enquiries in an hour from one
 * address. Every ceiling is clamped in code as well as defaulted, so a typo in
 * the dashboard cannot open the funnel up to a flood.
 */
export function resolveBridgeLimits(env: BridgeEnvExtras): BridgeLimits {
  return {
    leadPerHour: boundedNum(env.GPT_LEAD_MAX_PER_HOUR, 5, 1, 50),
    leadPerDay: boundedNum(env.GPT_LEAD_MAX_PER_DAY, 20, 1, 200),
    handoffPerHour: boundedNum(env.GPT_HANDOFF_MAX_PER_HOUR, 20, 1, 200),
    leadGlobalPerHour: boundedNum(env.GPT_LEAD_GLOBAL_MAX_PER_HOUR, 30, 1, 500),
    leadTurnstileAfter: boundedNum(env.GPT_LEAD_TURNSTILE_AFTER, 2, 1, 20),
    handoffGlobalPerHour: boundedNum(env.GPT_HANDOFF_GLOBAL_MAX_PER_HOUR, 100, 1, 1000),
    ownerAlertsPerHour: boundedNum(env.GPT_OWNER_NOTIFY_MAX_PER_HOUR, 30, 1, 300),
    duplicateWindowMs: 60 * 60 * 1000,
  };
}
