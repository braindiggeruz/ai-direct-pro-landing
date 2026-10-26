// How a visitor reaches the studio: one source for the build scripts and the
// browser bundles.
//
// The values live in content/global/site.json, the file the admin already
// edits: `phone`, `phonePublic`, `email` and `studioTelegram`.
//
// Owner order of 26.10.2026: visitors write, they do not call — «замени мой
// номер на мой Telegram, чтобы писали, а не звонили». It supersedes decision
// L14 of the paid-chat plan (2026-10-01), under which the owner's personal
// account was no public contact and the phone carried every enquiry: the owner
// now names that account, https://t.me/XGame_changerx, as the studio's public
// contact. So
//   - `studioTelegram` puts the Telegram link on every surface at once: the
//     landing, article and AI-chat footers, the mobile contact bars, the
//     contact cards on landings, articles and the homepage, the lead form's
//     fallback, the calculator, the chat's B2B card and pack window, JSON-LD
//     (Organization contactPoint url) and the Markdown twins;
//   - `phonePublic: false` takes the phone and every tel: link off those
//     surfaces. The number stays in site.json for the legal requisites only:
//     the seller / operator block of the offer and of the privacy policy
//     (scripts/legal-entity.ts). The approved offer edition keeps the contacts
//     it was approved with (OFFER_EDITION_CONTACT, scripts/contact-card.ts).
// Setting `phonePublic` back to true restores every phone link; emptying
// `studioTelegram` removes every Telegram link. Nothing else has to change.
//
// Read via named JSON imports so a bundle keeps these strings and not the
// whole site config.
import { email, phone, phonePublic, studioTelegram } from '../../content/global/site.json';

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

/** The studio's public Telegram, or null while none is configured. */
export const STUDIO_TELEGRAM_URL: string | null = studioTelegramUrl(studioTelegram);
/** "@handle" of STUDIO_TELEGRAM_URL for visible text, or null. */
export const STUDIO_TELEGRAM_HANDLE: string | null = STUDIO_TELEGRAM_URL && `@${STUDIO_TELEGRAM_URL.slice(13)}`;
/** The phone as a tel: target (E.164) and as text. */
export interface StudioPhone {
  tel: string;
  display: string;
}
/**
 * The phone as a public contact, or null while site.json `phonePublic` is
 * false (since 26.10.2026: no surface shows it or links tel:, except the legal
 * requisites). The browser surfaces read only this one, so while it is null
 * the bundler folds it away and no script on the site carries the number.
 */
export const STUDIO_PUBLIC_PHONE: StudioPhone | null = phonePublic === true
  ? { tel: `+${phone.replace(/\D/g, '')}`, display: formatUzPhone(phone) }
  : null;
export const STUDIO_PHONE_PUBLIC: boolean = STUDIO_PUBLIC_PHONE !== null;
/**
 * E.164 and display form of the phone for the build scripts: the legal
 * requisites (scripts/legal-entity.ts) and the approved offer edition
 * (scripts/contact-card.ts OFFER_EDITION_CONTACT). Browser code uses
 * STUDIO_PUBLIC_PHONE instead.
 */
export const STUDIO_PHONE = `+${phone.replace(/\D/g, '')}`;
export const STUDIO_PHONE_DISPLAY = /*#__PURE__*/ formatUzPhone(phone);
export const STUDIO_EMAIL = email.trim();

/**
 * Every link to the studio's Telegram carries data-contact="studio". The
 * click handlers in <head> (contact_click in scripts/analytics-snippet.ts,
 * the Metrika goal telegram_cta_studio in scripts/analytics-metrika.ts and
 * their copies in index.html) key off this attribute, not off a handle, so
 * the account stays a one-line change in site.json.
 */
export const STUDIO_CONTACT_ATTR = 'data-contact="studio"';
/** The same marker as JSX props: <a {...STUDIO_CONTACT_PROPS}>. */
export const STUDIO_CONTACT_PROPS = { 'data-contact': 'studio' } as const;
