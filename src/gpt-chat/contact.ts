// How the chat reaches a person at the studio, and how it reads what a visitor
// typed into the single contact field. Pure.
import type { Locale } from './types';
import { STUDIO_PHONE, STUDIO_PHONE_DISPLAY, STUDIO_TELEGRAM_URL } from '../shared/studio-contact';

export interface TelegramTarget {
  href: string;
  /** 'bot' = the assistant deep link; 'studio' = a person answers. */
  channel: 'bot' | 'studio';
}

/**
 * The studio's work Telegram with a B2B opener prefilled, or null while none
 * is configured (content/global/site.json `studioTelegram`, read through
 * src/shared/studio-contact.ts).
 *
 * The explicit B2B call to action ("Нужен такой AI-чат для сайта…",
 * AiOfferCard) is the only chat surface that may send a visitor to a person
 * in Telegram: one B2B bot is worth roughly fifty consumer packages. Every
 * consumer "continue in Telegram" route goes to the assistant bot instead
 * (handoff.ts). The owner's personal account is not a public contact any more
 * (paid-chat plan, decision L14): without a work account the card offers its
 * lead form alone.
 */
export function studioBusinessLink(locale: Locale, studio: string | null = STUDIO_TELEGRAM_URL): string | null {
  if (!studio) return null;
  const greeting = locale === 'uz'
    ? 'Assalomu alaykum! Biznes uchun AI-bot bo‘yicha gaplashmoqchiman.'
    : 'Здравствуйте! Хочу обсудить AI-бота для бизнеса.';
  return `${studio}?text=${encodeURIComponent(greeting)}`;
}

export interface StudioQuickContact {
  href: string;
  /** 'studio' = the work Telegram, 'phone' = a tel: link. */
  channel: 'studio' | 'phone';
  /** Visible text, e.g. "+998 50 587 07 20". */
  display: string;
}

/**
 * The fastest way to a person after a business lead: the work Telegram when
 * one is configured, otherwise the studio phone. Never the assistant bot,
 * which answers questions, not enquiries.
 */
export function studioQuickContact(locale: Locale, studio: string | null = STUDIO_TELEGRAM_URL): StudioQuickContact {
  const telegram = studioBusinessLink(locale, studio);
  return telegram
    ? { href: telegram, channel: 'studio', display: 'Telegram' }
    : { href: `tel:${STUDIO_PHONE}`, channel: 'phone', display: STUDIO_PHONE_DISPLAY };
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
