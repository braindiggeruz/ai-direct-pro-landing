// The company behind the AI pack, for the pages that must name it: the public
// offer (/ru/oferta/, /uz/oferta/) as the seller and the privacy policies as
// the data operator (paid-chat plan WP-18).
//
// One source: content/global/legal-entity.json, copied from the owner's
// business.json (plan §7, outside Git) and saying so in `_source`. The e-mail
// and the phone are not copied into it: they are the studio contact of
// content/global/site.json (src/shared/studio-contact.ts), so a new contact
// stays a one-line change.
//
// A page asks for the block with `requisites`; scripts/prerender.ts renders it
// after the body and refuses to build a page that asks for it while any field
// is missing or malformed. Decision L13: without complete requisites the
// offer stays draft (tests/legal-oferta.test.ts), and the deploy-time live gate
// (scripts/release/live-gate.ts) reads the same validation.
import type { Locale, Page } from '../src/shared/types';
import { STUDIO_EMAIL, STUDIO_PHONE, STUDIO_PHONE_DISPLAY } from '../src/shared/studio-contact';
import entityJson from '../content/global/legal-entity.json';

type Localized = Record<Locale, string>;

export interface LegalEntity {
  name: Localized;
  shortName: Localized;
  /** STIR (INN), 9 digits. */
  stir: string;
  /** The registered address, as in the registration certificate. */
  address: Localized;
  bank: string;
  /** Settlement account, 20 digits. */
  account: string;
  /** The bank's MFO code, 5 digits. */
  mfo: string;
  director: Localized;
}

export const LEGAL_ENTITY = entityJson as unknown as LegalEntity;

const LOCALES: readonly Locale[] = ['ru', 'uz'];
const LOCALIZED_FIELDS = ['name', 'shortName', 'address', 'director'] as const;
const DIGIT_FIELDS = { stir: /^\d{9}$/, account: /^\d{20}$/, mfo: /^\d{5}$/ } as const;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;

/** Printable text without markup or line breaks, at most 200 characters. */
function text(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !/[<>\n\r]/.test(value);
}

/**
 * The fields of `entity` (and of the studio contact it is shown with) that are
 * missing or malformed, by name; empty means complete. Names only.
 */
export function legalEntityIssues(
  entity: unknown,
  contact: { email: string; phone: string } = { email: STUDIO_EMAIL, phone: STUDIO_PHONE },
): string[] {
  const record = (typeof entity === 'object' && entity !== null ? entity : {}) as Record<string, unknown>;
  const issues: string[] = [];
  for (const field of LOCALIZED_FIELDS) {
    const value = record[field] as Record<string, unknown> | undefined;
    for (const locale of LOCALES) if (!text(value?.[locale])) issues.push(`${field}.${locale}`);
  }
  if (!text(record.bank)) issues.push('bank');
  for (const [field, format] of Object.entries(DIGIT_FIELDS)) {
    if (typeof record[field] !== 'string' || !format.test(record[field] as string)) issues.push(field);
  }
  if (!EMAIL.test(contact.email)) issues.push('site.email');
  if (!/^\+998\d{9}$/.test(contact.phone)) issues.push('site.phone');
  return issues;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const COPY = {
  ru: {
    seller: 'Реквизиты продавца',
    operator: 'Реквизиты оператора',
    rows: ['Наименование', 'СТИР (ИНН)', 'Юридический адрес', 'Банк', 'Расчётный счёт', 'МФО', 'Директор', 'E-mail', 'Телефон'],
    edition: (version: string, day: string, iso: string) =>
      `Редакция <span data-terms-version="${version}">${version}</span> · действует с <time datetime="${iso}">${day}</time>`,
  },
  uz: {
    seller: 'Sotuvchi rekvizitlari',
    operator: 'Operator rekvizitlari',
    rows: ['Nomi', 'STIR', 'Yuridik manzil', 'Bank', 'Hisob raqami', 'MFO', 'Direktor', 'E-mail', 'Telefon'],
    edition: (version: string, day: string, iso: string) =>
      `Tahrir <span data-terms-version="${version}">${version}</span> · kuchga kirgan sana: <time datetime="${iso}">${day}</time>`,
  },
} as const;

export const TERMS_VERSION_FORMAT = /^[a-zA-Z0-9._-]{1,80}$/;

/** "2026-10-03" → "03.10.2026"; anything else is refused. */
function calendarDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match || new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) {
    throw new Error(`Not a calendar date: ${iso}`);
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/**
 * The line under the H1 of a page with `termsVersion`: the edition and the
 * day it took effect (`lastReviewedAt`), or '' for any other page. The gate
 * reads the edition back from data-terms-version.
 */
export function renderTermsEdition(page: Pick<Page, 'url' | 'locale' | 'termsVersion' | 'lastReviewedAt'>): string {
  if (!page.termsVersion) return '';
  if (!TERMS_VERSION_FORMAT.test(page.termsVersion)) throw new Error(`${page.url}: malformed termsVersion`);
  const iso = (page.lastReviewedAt || '').slice(0, 10);
  if (!iso) throw new Error(`${page.url}: a page with termsVersion needs lastReviewedAt, the day the edition took effect`);
  const t = COPY[page.locale === 'uz' ? 'uz' : 'ru'];
  return `<p data-testid="terms-edition" class="text-sm text-white/50 mb-4">${t.edition(page.termsVersion, calendarDay(iso), iso)}</p>`;
}

/**
 * The requisites section of a page with `requisites`, or '' for any other
 * page. Throws while the requisites are incomplete (L13): such a page must
 * stay draft, and prerender skips drafts.
 */
export function renderRequisites(
  page: Pick<Page, 'url' | 'locale' | 'requisites'>,
  entity: LegalEntity = LEGAL_ENTITY,
): string {
  if (!page.requisites) return '';
  const issues = legalEntityIssues(entity);
  if (issues.length) {
    throw new Error(`${page.url}: content/global/legal-entity.json is incomplete (${issues.join(', ')}); `
      + 'a page that names the seller stays draft until it is complete.');
  }
  const locale = page.locale === 'uz' ? 'uz' : 'ru';
  const t = COPY[locale];
  const values = [
    escapeHtml(entity.name[locale]),
    escapeHtml(entity.stir),
    escapeHtml(entity.address[locale]),
    escapeHtml(entity.bank),
    escapeHtml(entity.account),
    escapeHtml(entity.mfo),
    escapeHtml(entity.director[locale]),
    `<a href="mailto:${escapeHtml(STUDIO_EMAIL)}" class="text-brand-cyan underline underline-offset-2">${escapeHtml(STUDIO_EMAIL)}</a>`,
    `<a href="tel:${STUDIO_PHONE}" class="text-brand-cyan underline underline-offset-2">${escapeHtml(STUDIO_PHONE_DISPLAY)}</a>`,
  ];
  const rows = t.rows
    .map((label, i) => `<div class="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4 py-3 border-t border-white/10"><dt class="text-white/50">${escapeHtml(label)}</dt><dd class="text-white/85 break-words">${values[i]}</dd></div>`)
    .join('');
  return `<section id="requisites" data-testid="legal-requisites" aria-labelledby="requisites-heading" class="mt-12 scroll-mt-24">
      <h2 id="requisites-heading" class="font-display text-2xl sm:text-3xl text-white mb-4">${escapeHtml(t[page.requisites])}</h2>
      <dl class="text-sm sm:text-base">${rows}</dl>
    </section>`;
}
