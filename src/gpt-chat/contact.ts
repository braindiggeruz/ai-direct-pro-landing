// How the chat reaches a human, and how it reads what a visitor typed into
// the single contact field. Pure except for the env read inherited from
// ../lib/telegram.
import type { Locale } from './types';
import { TELEGRAM_CONFIGURED, telegramDeepLink } from '../lib/telegram';

/**
 * The studio's own Telegram contact — the same verified handle that
 * content/global/site.json publishes as `telegram` / `defaultCTA.href`, and
 * that AiChatMessageList already links to.
 *
 * src/lib/telegram.ts hides every Telegram CTA when VITE_TELEGRAM_BOT_USERNAME
 * is unset, which is exactly the state the production build ships in. Hiding a
 * broken bot link is right; hiding the only route to a human is not, so the
 * chat degrades to this contact instead of rendering nothing.
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

/** The owner's Telegram is the honest fallback when a bot handoff cannot mint. */
export function studioTelegramLink(locale: Locale): string {
  const greeting = locale === 'uz'
    ? 'Assalomu alaykum! Saytdagi AI-chatdan yozyapman.'
    : 'Здравствуйте! Пишу из AI-чата на сайте.';
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
