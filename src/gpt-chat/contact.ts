// How the chat reaches a human, and how it reads what a visitor typed into
// the single contact field. Pure except for the env read inherited from
// ../lib/telegram.
import type { Locale } from './types';
import { TELEGRAM_CONFIGURED, telegramDeepLink } from '../lib/telegram';

/**
 * The studio's own Telegram contact — the same verified handle that
 * content/global/site.json publishes as `telegram` / `defaultCTA.href`.
 *
 * src/lib/telegram.ts defaults the bot username to the live assistant handle,
 * so the bot is always configured and every consumer route goes there. The
 * chat reaches this personal account only through the explicit B2B call to
 * action (studioBusinessLink) and the no-bot fallbacks below (telegramContact,
 * studioTelegramLink), which a normal build never takes.
 */
export const STUDIO_TELEGRAM_URL = 'https://t.me/XGame_changerx';

export interface TelegramTarget {
  href: string;
  /** 'bot' = the assistant deep link; 'studio' = a person answers. */
  channel: 'bot' | 'studio';
}

export function telegramContact(locale: Locale): TelegramTarget {
  return TELEGRAM_CONFIGURED
    ? { href: telegramDeepLink(locale), channel: 'bot' }
    : { href: STUDIO_TELEGRAM_URL, channel: 'studio' };
}

/**
 * Last resort only. Consumer surfaces reach this solely through
 * publicBotLink() in handoff.ts, and only when no bot username is configured
 * at all — which src/lib/telegram.ts makes impossible in a normal build. It
 * keeps a Telegram button from ever being dead; it is not a handoff route.
 */
export function studioTelegramLink(locale: Locale): string {
  const greeting = locale === 'uz'
    ? 'Assalomu alaykum! Saytdagi AI-chatdan yozyapman.'
    : 'Здравствуйте! Пишу из AI-чата на сайте.';
  return `${STUDIO_TELEGRAM_URL}?text=${encodeURIComponent(greeting)}`;
}

/**
 * The studio's own Telegram with a B2B opener prefilled.
 *
 * The ONLY chat surface allowed to use the personal account is the explicit
 * B2B call to action ("Нужен такой AI-чат для сайта…", AiOfferCard stage
 * 'b2b'): there a human conversation is the right outcome — one B2B bot is
 * worth roughly fifty consumer packages. Every consumer "continue in
 * Telegram" route goes to the assistant bot instead (handoff.ts).
 */
export function studioBusinessLink(locale: Locale): string {
  const greeting = locale === 'uz'
    ? 'Assalomu alaykum! Biznes uchun AI-bot bo‘yicha gaplashmoqchiman.'
    : 'Здравствуйте! Хочу обсудить AI-бота для бизнеса.';
  return `${STUDIO_TELEGRAM_URL}?text=${encodeURIComponent(greeting)}`;
}

export interface ParsedContact {
  type: 'phone' | 'telegram';
  /** Normalized for the operator: +998XXXXXXXXX or @handle. */
  value: string;
}

const HANDLE = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

/**
 * One field, two answers people actually give: an Uzbek mobile number in any
 * shape (+998 90 123 45 67, 998901234567, 90 123 45 67) or a Telegram handle
 * (@name, name, t.me/name). Returns null when it is neither — the caller shows
 * the inline error rather than posting an unreachable contact.
 */
export function parseContact(raw: string): ParsedContact | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const handleish = trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@/, '');
  if (/[a-zA-Z_]/.test(trimmed)) {
    return HANDLE.test(handleish) ? { type: 'telegram', value: `@${handleish}` } : null;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 9) return { type: 'phone', value: `+998${digits}` };
  if (digits.length === 12 && digits.startsWith('998')) return { type: 'phone', value: `+${digits}` };
  return null;
}
