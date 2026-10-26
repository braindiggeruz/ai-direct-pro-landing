// The studio's contact card, on landings that have no lead form and on blog
// articles, and the other contact surfaces the prerendered pages share: the
// footer links and the mobile contact bar.
//
// Content points a call to action at the card with the in-page anchor
// "#contact" (ctaPrimaryHref, ctaSecondaryHref, a cta block or a linkp target;
// on an article also its `cta`). Which channels a surface offers comes from
// content/global/site.json through src/shared/studio-contact.ts: since the
// owner's order of 26.10.2026 visitors write, they do not call, so the card,
// the footers and the bar offer the studio Telegram and the e-mail, and the
// phone only while `phonePublic` is true. So no page names a channel the site
// does not offer, and changing a channel is one setting, not an edit of every
// page.
//
// Rendered by scripts/prerender.ts in the lead form's slot, before the FAQ, and
// by scripts/prerender-blog.ts after the article, and only on a page that links
// it, so the anchor never dangles and pages that do not link it are unchanged.
import type { BlogArticle, BodyBlock, Page } from '../src/shared/types';
import {
  STUDIO_CONTACT_ATTR,
  STUDIO_EMAIL,
  STUDIO_PHONE,
  STUDIO_PHONE_DISPLAY,
  STUDIO_PHONE_PUBLIC,
  STUDIO_TELEGRAM_URL,
} from '../src/shared/studio-contact';
import { studioTelegramLinkFor, telegramServiceLabel } from './telegram-cta';

export const CONTACT_ANCHOR = '#contact';

/** The label of a call to action that only leads to the card. */
export const CONTACT_CTA_LABEL = { ru: 'Связаться с нами', uz: 'Biz bilan bog‘lanish' } as const;

/** The channels a surface offers besides the e-mail, which every surface offers. */
export interface ContactSet {
  /** The phone and its tel: link. */
  phone: boolean;
  /** https://t.me/<handle>, or null for no Telegram. */
  telegram: string | null;
}

/** The site's channels: the studio Telegram and, while it is public, the phone. */
export const SITE_CONTACT: ContactSet = { phone: STUDIO_PHONE_PUBLIC, telegram: STUDIO_TELEGRAM_URL };

/**
 * The channels of the approved offer edition (ai-paket-2026-10-v5, approved
 * 2026-10-07): it was published with the phone and the e-mail and no
 * Telegram, and its text sends the buyer to «the contacts at the end of the
 * page». A page with `termsVersion` keeps them, so the offer stays byte for
 * byte the approved document; a new contact there is a new edition.
 */
export const OFFER_EDITION_CONTACT: ContactSet = { phone: true, telegram: null };

/** The channels a page renders: the offer edition's on a page with `termsVersion`, the site's elsewhere. */
export function pageContact(page: { termsVersion?: string }): ContactSet {
  return page.termsVersion ? OFFER_EDITION_CONTACT : SITE_CONTACT;
}

type ContactPage = Pick<Page, 'url' | 'locale' | 'h1' | 'breadcrumbLabel' | 'ctaPrimaryHref' | 'ctaSecondaryHref' | 'bodyBlocks'> & { termsVersion?: string };
type ContactArticle = Pick<BlogArticle, 'url' | 'locale' | 'h1' | 'cta' | 'body'>;

/**
 * True for a link to the studio Telegram, bare or with a draft (?text=…).
 * Content links it where the phone stood; the renderers then add the marker
 * the head click handlers count and the site's Telegram rel/target.
 */
export function isStudioTelegramHref(href: string, studio: string | null = STUDIO_TELEGRAM_URL): boolean {
  return Boolean(studio) && (href === studio || href === `${studio}/` || href.startsWith(`${studio}?`));
}

/** "https://t.me/name" → "@name". */
export const telegramHandle = (telegram: string): string => `@${telegram.replace(/^https:\/\/t\.me\//, '')}`;

const COPY = {
  ru: {
    eyebrow: 'Контакты',
    heading: 'Связаться с GPTBot.uz',
    intro: 'Позвоните или напишите — ответим в рабочее время, Пн–Сб 10:00–19:00.',
    write: (handle: string) => `Напишите в Telegram ${handle} или на e-mail — ответим в рабочее время, Пн–Сб 10:00–19:00.`,
    mail: 'Напишите на e-mail — ответим в рабочее время, Пн–Сб 10:00–19:00.',
    call: 'Позвонить',
    telegram: 'Написать в Telegram',
    form: 'Заявка',
  },
  uz: {
    eyebrow: 'Aloqa',
    heading: 'GPTBot.uz bilan bog‘lanish',
    intro: 'Qo‘ng‘iroq qiling yoki yozing — ish vaqtida javob beramiz: Du–Sha 10:00–19:00.',
    write: (handle: string) => `Telegram’da (${handle}) yoki e-mail orqali yozing — ish vaqtida javob beramiz: Du–Sha 10:00–19:00.`,
    mail: 'E-mail orqali yozing — ish vaqtida javob beramiz: Du–Sha 10:00–19:00.',
    call: 'Qo‘ng‘iroq qilish',
    telegram: 'Telegram’da yozish',
    form: 'Ariza',
  },
} as const;

/** The visible label of a button to the studio Telegram. */
export const TELEGRAM_LABEL = { ru: COPY.ru.telegram, uz: COPY.uz.telegram } as const;

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function escapeText(s: string): string {
  return s.replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' }[c]!));
}

/** A link to the studio Telegram: the marker the analytics count and the site's rel/target pattern. */
function telegramAnchor(href: string, cls: string, text: string, testId?: string): string {
  const id = testId ? `data-testid="${testId}" ` : '';
  return `<a ${id}${STUDIO_CONTACT_ATTR} href="${escapeAttr(href)}" target="_blank" rel="nofollow noopener noreferrer" class="${cls}">${escapeText(text)}</a>`;
}

function blocksLinkCard(blocks: BodyBlock[] | undefined): boolean {
  return (blocks || []).some((block) =>
    block.href === CONTACT_ANCHOR || (block.links || []).some((link) => link.target === CONTACT_ANCHOR));
}

/**
 * True when any call to action or link on the page points at the card. A page
 * without a primary CTA gets "#contact" in its header (scripts/prerender.ts),
 * so it links the card too.
 */
export function linksContactCard(page: ContactPage): boolean {
  if (!page.ctaPrimaryHref || page.ctaPrimaryHref === CONTACT_ANCHOR || page.ctaSecondaryHref === CONTACT_ANCHOR) return true;
  return blocksLinkCard(page.bodyBlocks);
}

/**
 * True when the article's call to action, its header button (`headerHref`, as
 * scripts/prerender-blog.ts resolves it) or a body block points at the card.
 */
export function articleLinksContactCard(article: ContactArticle, headerHref: string): boolean {
  return headerHref === CONTACT_ANCHOR || article.cta?.href === CONTACT_ANCHOR || blocksLinkCard(article.body);
}

/**
 * The card section for a document at `url`. `label` names the service in the
 * Telegram draft. `contact` defaults to the site's channels; tests pass their own.
 */
export function contactCardHtml(
  target: { url: string; locale?: string; label: string },
  contact: ContactSet = SITE_CONTACT,
): string {
  const locale = target.locale === 'uz' ? 'uz' : 'ru';
  const t = COPY[locale];
  // The draft names the page; protected pages keep the bare link.
  const telegram = studioTelegramLinkFor(locale, telegramServiceLabel(target.label), target.url, contact.telegram);
  const button = 'min-h-[44px] w-full sm:w-auto text-base';
  const email = `<a data-testid="contact-email" href="mailto:${escapeAttr(STUDIO_EMAIL)}" class="btn-secondary ${button}">E-mail: ${escapeText(STUDIO_EMAIL)}</a>`;
  // With the phone: phone first, as the offer edition was approved. Without
  // it the Telegram takes the phone's place and colour.
  const links = contact.phone
    ? [
      `<a data-testid="contact-phone" href="tel:${STUDIO_PHONE}" class="btn-primary ${button}">${escapeText(t.call)}: ${escapeText(STUDIO_PHONE_DISPLAY)}</a>`,
      email,
      ...(telegram ? [`<a data-testid="contact-telegram" ${STUDIO_CONTACT_ATTR} href="${escapeAttr(telegram)}" target="_blank" rel="nofollow noopener noreferrer" class="btn-secondary ${button}">${escapeText(t.telegram)}</a>`] : []),
    ]
    : [...(telegram ? [telegramAnchor(telegram, `btn-primary ${button}`, t.telegram, 'contact-telegram')] : []), email];
  const intro = contact.phone ? t.intro : contact.telegram ? t.write(telegramHandle(contact.telegram)) : t.mail;
  return `<section id="contact" data-testid="studio-contact" aria-labelledby="contact-heading" class="mt-16 scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8">
      <div class="eyebrow mb-3">${escapeText(t.eyebrow)}</div>
      <h2 id="contact-heading" class="font-display text-2xl sm:text-3xl text-white mb-3">${escapeText(t.heading)}</h2>
      <p class="text-sm sm:text-base text-white/70 leading-relaxed mb-6">${escapeText(intro)}</p>
      <div class="flex flex-col sm:flex-row sm:flex-wrap gap-3">${links.join('')}</div>
    </section>`;
}

/**
 * The studio's contact links for a footer (landings, AI-chat pages, articles,
 * blog indexes): the Telegram and the e-mail, and the phone while it is public
 * (then first, with `phoneTestId`; without it the Telegram takes its place and
 * `telegramTestId`).
 */
export function studioFooterLinks(
  linkClass: string,
  opts: { phoneTestId?: string; telegramTestId?: string; contact?: ContactSet } = {},
): string {
  const contact = opts.contact ?? SITE_CONTACT;
  const email = `<a href="mailto:${escapeAttr(STUDIO_EMAIL)}" class="${linkClass}">${escapeText(STUDIO_EMAIL)}</a>`;
  if (!contact.phone) {
    const id = opts.telegramTestId ? `data-testid="${escapeAttr(opts.telegramTestId)}" ` : '';
    return [
      ...(contact.telegram ? [`<a ${id}${STUDIO_CONTACT_ATTR} href="${escapeAttr(contact.telegram)}" rel="nofollow noopener noreferrer" target="_blank" class="${linkClass}">Telegram</a>`] : []),
      email,
    ].join('\n      ');
  }
  const testId = opts.phoneTestId ? `data-testid="${escapeAttr(opts.phoneTestId)}" ` : '';
  return [
    `<a ${testId}href="tel:${STUDIO_PHONE}" class="${linkClass}">${escapeText(STUDIO_PHONE_DISPLAY)}</a>`,
    email,
    ...(contact.telegram ? [`<a ${STUDIO_CONTACT_ATTR} href="${escapeAttr(contact.telegram)}" rel="nofollow noopener noreferrer" target="_blank" class="${linkClass}">Telegram</a>`] : []),
  ].join('\n      ');
}

const BAR_PRIMARY = 'bg-grad-cta text-bg-base font-semibold px-4 py-3 rounded-xl text-center text-sm';
const BAR_SECONDARY = 'px-4 py-3 rounded-xl border border-white/15 text-white/80 text-sm';

/**
 * The mobile contact bar of landings and articles (`.sticky-cta` in
 * src/index.css, hidden from lg). GA4 shows every recorded conversion comes
 * from mobile, so its first action is a direct contact: the phone while it is
 * public, otherwise the studio Telegram («Написать в Telegram»). The second is
 * the Telegram next to a public phone, otherwise the page's lead form when
 * `leadForm`, otherwise nothing: the first action takes the row. '' when the
 * site offers neither a public phone nor a Telegram.
 */
export function stickyContactBar(locale: 'ru' | 'uz', opts: { leadForm?: boolean; contact?: ContactSet } = {}): string {
  const contact = opts.contact ?? SITE_CONTACT;
  const t = COPY[locale];
  const form = opts.leadForm ? `<a data-testid="sticky-form-cta" href="#lead-form" class="${BAR_SECONDARY}">${t.form}</a>` : '';
  const telegram = contact.telegram;
  let first = '';
  let second = '';
  if (contact.phone) {
    first = `<a data-testid="sticky-call-cta" href="tel:${STUDIO_PHONE}" class="${BAR_PRIMARY}">${escapeText(t.call)}</a>`;
    second = telegram
      ? `<a data-testid="sticky-telegram-cta" ${STUDIO_CONTACT_ATTR} href="${escapeAttr(telegram)}" rel="nofollow noopener noreferrer" target="_blank" class="${BAR_SECONDARY}">Telegram</a>`
      : form;
  } else if (telegram) {
    first = telegramAnchor(telegram, BAR_PRIMARY, t.telegram, 'sticky-telegram-cta');
    second = form;
  }
  if (!first) return '';
  return `<div class="sticky-cta lg:hidden grid ${second ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'} gap-2 rounded-2xl border border-white/10 bg-bg-base/95 p-2 shadow-2xl backdrop-blur">${first}${second}</div>`;
}

/**
 * The card section of a landing, or '' when nothing on the page links it.
 * `contact` defaults to the page's channels (pageContact); tests pass their own.
 */
export function renderContactCard(page: ContactPage, contact: ContactSet = pageContact(page)): string {
  if (!linksContactCard(page)) return '';
  return contactCardHtml({ url: page.url, locale: page.locale, label: page.breadcrumbLabel || page.h1 }, contact);
}
