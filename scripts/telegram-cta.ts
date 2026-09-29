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
// Used by scripts/prerender.ts (landings) and scripts/prerender-blog.ts
// (articles and blog indexes). The ten protected pages keep the bare link:
// scripts/seo-protection.ts pins their internal links, and they are not to be
// touched in any way until the 2026-10-20 verdict.
import { PROTECTED_PATHS } from './seo-protection';

export const STUDIO_TELEGRAM_URL = 'https://t.me/XGame_changerx';

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

export function studioTelegramHref(locale: 'ru' | 'uz', label: string, path: string): string {
  return `${STUDIO_TELEGRAM_URL}?text=${encodeDraft(studioTelegramMessage(locale, label, path))}`;
}

export function isProtectedPath(path: string): boolean {
  return PROTECTED.has(path);
}

// /uz/ is the Uzbek homepage (hreflang pair of the protected "/"). Its
// breadcrumb label is a section name («O‘zbekcha bo‘lim»), not a service, so a
// draft built from it would read oddly; it keeps the bare link like "/".
const BARE_LINK_PATHS: ReadonlySet<string> = new Set(['/uz/']);

// Only an href that is exactly the bare contact (with or without the trailing
// slash) is rewritten. Links that already carry a query, other handles, the
// JSON-LD sameAs value and visible text mentioning the handle are left alone.
const BARE_STUDIO_HREF_RE = /href="https:\/\/t\.me\/XGame_changerx\/?"/g;

/**
 * Rewrite every bare studio-contact href in a rendered document to the
 * prefilled one. Protected pages are returned unchanged.
 */
export function withStudioTelegramPrefill(
  html: string,
  opts: { locale: 'ru' | 'uz'; label: string; path: string },
): string {
  if (isProtectedPath(opts.path) || BARE_LINK_PATHS.has(opts.path)) return html;
  const href = studioTelegramHref(opts.locale, opts.label, opts.path);
  return html.replace(BARE_STUDIO_HREF_RE, () => `href="${href}"`);
}
