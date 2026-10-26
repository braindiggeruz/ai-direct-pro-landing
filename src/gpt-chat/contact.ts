// How the chat reaches a person at the studio, and how it reads what a visitor
// typed into the single contact field. Pure.
import type { Locale } from './types';
import { STUDIO_EMAIL, STUDIO_PUBLIC_PHONE, STUDIO_TELEGRAM_URL, type StudioPhone } from '../shared/studio-contact';

export interface TelegramTarget {
  href: string;
  /** 'bot' = the assistant deep link; 'studio' = a person answers. */
  channel: 'bot' | 'studio';
}

/**
 * The studio Telegram with a B2B opener prefilled, or null while none is
 * configured (content/global/site.json `studioTelegram`, read through
 * src/shared/studio-contact.ts; since the owner's order of 26.10.2026 the
 * owner's account, named as the public contact).
 *
 * The explicit B2B call to action ("Нужен такой AI-чат для сайта…",
 * AiOfferCard) is the only chat surface that may send a visitor to a person
 * in Telegram: one B2B bot is worth roughly fifty consumer packages. Every
 * consumer "continue in Telegram" route goes to the assistant bot instead
 * (handoff.ts). Without a studio Telegram the card offers its lead form alone.
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
  /** 'studio' = the studio Telegram, 'phone' = a tel: link, 'email' = a mailto: link. */
  channel: 'studio' | 'phone' | 'email';
  /** Visible text, e.g. "Telegram". */
  display: string;
}

/**
 * The fastest way to a person after a business lead: the studio Telegram when
 * one is configured, otherwise the phone while it is public (owner order of
 * 26.10.2026: visitors write, not call), otherwise the e-mail. Never the
 * assistant bot, which answers questions, not enquiries.
 */
export function studioQuickContact(
  locale: Locale,
  studio: string | null = STUDIO_TELEGRAM_URL,
  phone: StudioPhone | null = STUDIO_PUBLIC_PHONE,
): StudioQuickContact {
  const telegram = studioBusinessLink(locale, studio);
  if (telegram) return { href: telegram, channel: 'studio', display: 'Telegram' };
  return phone
    ? { href: `tel:${phone.tel}`, channel: 'phone', display: phone.display }
    : { href: `mailto:${STUDIO_EMAIL}`, channel: 'email', display: STUDIO_EMAIL };
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
