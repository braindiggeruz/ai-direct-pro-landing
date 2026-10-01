// How a visitor reaches the studio: one source for the build scripts and the
// browser bundles.
//
// The values live in content/global/site.json, the file the admin already
// edits: `phone`, `email` and `studioTelegram`. `studioTelegram` is the WORK
// Telegram of the studio. It is empty because no work account has been named:
// the personal account is no longer a public contact anywhere on the site
// (paid-chat plan, decision L14), so phone, e-mail and the lead forms carry
// every enquiry. When the owner names a work account, setting `studioTelegram`
// to https://t.me/<handle> puts it back on every surface at once: the landing,
// article and AI-chat footers, the mobile call bars, the contact cards on
// landings, articles and the homepage, the lead form's fallback, the
// calculator and the B2B card in the AI chat. Nothing else has to change.
//
// Read via named JSON imports so a bundle keeps these three strings and not
// the whole site config.
import { email, phone, studioTelegram } from '../../content/global/site.json';

const TELEGRAM_HANDLE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

/**
 * https://t.me/<handle> for a valid public handle, null for "" (no Telegram).
 * Anything else is also null: a malformed setting never becomes a link.
 * tests/studio-contact.test.ts fails the build on such a setting instead.
 */
export function studioTelegramUrl(raw: string): string | null {
  const match = /^https:\/\/t\.me\/([^/?#]+)\/?$/.exec(raw.trim());
  return match && TELEGRAM_HANDLE.test(match[1]) ? `https://t.me/${match[1]}` : null;
}

/** "+998505870720" → "+998 50 587 07 20"; other shapes are returned trimmed. */
export function formatUzPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('998')
    ? `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`
    : raw.trim();
}

/** The studio's work Telegram, or null while none is configured. */
export const STUDIO_TELEGRAM_URL: string | null = studioTelegramUrl(studioTelegram);
/** E.164, for tel: links. */
export const STUDIO_PHONE = `+${phone.replace(/\D/g, '')}`;
export const STUDIO_PHONE_DISPLAY = formatUzPhone(phone);
export const STUDIO_EMAIL = email.trim();

/**
 * Every link to the studio's work Telegram carries data-contact="studio". The
 * click handlers in <head> (contact_click in scripts/analytics-snippet.ts,
 * the Metrika goal telegram_cta_studio in scripts/analytics-metrika.ts and
 * their copies in index.html) key off this attribute, not off a handle, so
 * naming a work account stays a one-line change in site.json.
 */
export const STUDIO_CONTACT_ATTR = 'data-contact="studio"';
/** The same marker as JSX props: <a {...STUDIO_CONTACT_PROPS}>. */
export const STUDIO_CONTACT_PROPS = { 'data-contact': 'studio' } as const;
