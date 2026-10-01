// The studio's Telegram contact, prefilled with where the visitor came from.
//
// Telegram documents an optional `text` parameter on public username links
// (t.me/<username>?text=<draft>) for users, groups and channels: the draft is
// pre-entered into the input bar when the visitor can write in the chat
// (https://core.telegram.org/api/links, "Public username links", checked
// 2026-09-29). The visitor still decides whether to send it. What the owner gets
// is a first message that names the service and the page, instead of a bare
// "Здравствуйте" that has to be asked about.
//
// Which account that is comes from content/global/site.json `studioTelegram`
// (src/shared/studio-contact.ts). It is empty while the studio has no work
// account (paid-chat plan, decision L14): studioTelegramHref() then returns
// null, every caller offers the phone and e-mail instead, and
// withStudioTelegramPrefill() has nothing to rewrite.
//
// Used by scripts/prerender.ts (landings), scripts/prerender-blog.ts (articles
// and blog indexes), scripts/contact-card.ts and scripts/lead-form.ts. The ten
// protected pages keep the bare link: scripts/seo-protection.ts pins their
// text, and the draft names the page.
import { STUDIO_TELEGRAM_URL } from '../src/shared/studio-contact';
import { PROTECTED_PATHS } from './seo-protection';

export { STUDIO_TELEGRAM_URL };

const PROTECTED: ReadonlySet<string> = new Set(PROTECTED_PATHS);
const MAX_LABEL = 60;

/** Trimmed, single-line service label, at most ~60 characters. */
export function telegramServiceLabel(raw: string): string {
  const value = (raw || '').replace(/\s+/g, ' ').trim().replace(/[.!?:;,\s]+$/u, '');
  if (value.length <= MAX_LABEL) return value;
  const cut = value.slice(0, MAX_LABEL);
  const space = cut.lastIndexOf(' ');
  return `${(space > 30 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/u, '')}…`;
}

export function studioTelegramMessage(locale: 'ru' | 'uz', label: string, path: string): string {
  const service = telegramServiceLabel(label);
  return locale === 'uz'
    ? `Assalomu alaykum! GPTBot.uz saytidan yozyapman. Qiziqtirgan xizmat: ${service}. Sahifa: ${path}`
    : `Здравствуйте! Пишу с сайта GPTBot.uz. Интересует: ${service}. Страница: ${path}`;
}

/** encodeURIComponent leaves ' ( ) * ! alone; ' would end a single-quoted attribute. */
function encodeDraft(text: string): string {
  return encodeURIComponent(text).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function prefilled(base: string, locale: 'ru' | 'uz', label: string, path: string): string {
  return `${base}?text=${encodeDraft(studioTelegramMessage(locale, label, path))}`;
}

/**
 * The studio's work Telegram with the draft, or null while none is configured.
 * `studio` defaults to the configured account; tests pass one explicitly.
 */
export function studioTelegramHref(
  locale: 'ru' | 'uz',
  label: string,
  path: string,
  studio: string | null = STUDIO_TELEGRAM_URL,
): string | null {
  return studio ? prefilled(studio, locale, label, path) : null;
}

export function isProtectedPath(path: string): boolean {
  return PROTECTED.has(path);
}

// /uz/ is the Uzbek homepage (hreflang pair of the protected "/"). Its
// breadcrumb label is a section name («O‘zbekcha bo‘lim»), not a service, so a
// draft built from it would read oddly; it keeps the bare link like "/".
const BARE_LINK_PATHS: ReadonlySet<string> = new Set(['/uz/']);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrite every bare studio-contact href (exactly the configured work account,
 * with or without the trailing slash) in a rendered document to the prefilled
 * one. Links that already carry a query, other handles, JSON-LD and visible
 * text are left alone. Protected pages are returned unchanged, and so is every
 * page while no work account is configured. `studio` defaults to the
 * configured account; tests pass one explicitly.
 */
export function withStudioTelegramPrefill(
  html: string,
  opts: { locale: 'ru' | 'uz'; label: string; path: string },
  studio: string | null = STUDIO_TELEGRAM_URL,
): string {
  if (!studio || isProtectedPath(opts.path) || BARE_LINK_PATHS.has(opts.path)) return html;
  const base = studio.replace(/\/$/, '');
  const bare = new RegExp(`href="${escapeRe(base)}\\/?"`, 'g');
  return html.replace(bare, () => `href="${prefilled(base, opts.locale, opts.label, opts.path)}"`);
}
