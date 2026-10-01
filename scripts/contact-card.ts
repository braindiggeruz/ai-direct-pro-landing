// The studio's contact card, on landings that have no lead form.
//
// Content points a call to action at it with the in-page anchor "#contact"
// (ctaPrimaryHref, ctaSecondaryHref, a cta block or a linkp target). The card
// lists the phone and the e-mail from content/global/site.json and, once one is
// configured, the studio's work Telegram (src/shared/studio-contact.ts). So no
// page names a channel the site does not offer, and naming a work Telegram
// later is one setting, not an edit of every page (paid-chat plan, L14).
//
// Rendered by scripts/prerender.ts in the lead form's slot, before the FAQ, and
// only on a page that links it, so the anchor never dangles and pages that do
// not link it are unchanged.
import type { Page } from '../src/shared/types';
import { STUDIO_EMAIL, STUDIO_PHONE, STUDIO_PHONE_DISPLAY, STUDIO_TELEGRAM_URL } from '../src/shared/studio-contact';
import { studioTelegramHref, telegramServiceLabel } from './telegram-cta';

export const CONTACT_ANCHOR = '#contact';

type ContactPage = Pick<Page, 'url' | 'locale' | 'h1' | 'breadcrumbLabel' | 'ctaPrimaryHref' | 'ctaSecondaryHref' | 'bodyBlocks'>;

const COPY = {
  ru: {
    eyebrow: 'Контакты',
    heading: 'Связаться с GPTBot.uz',
    intro: 'Позвоните или напишите — ответим в рабочее время, Пн–Сб 10:00–19:00.',
    call: 'Позвонить',
    telegram: 'Написать в Telegram',
  },
  uz: {
    eyebrow: 'Aloqa',
    heading: 'GPTBot.uz bilan bog‘lanish',
    intro: 'Qo‘ng‘iroq qiling yoki yozing — ish vaqtida javob beramiz: Du–Sha 10:00–19:00.',
    call: 'Qo‘ng‘iroq qilish',
    telegram: 'Telegramda yozish',
  },
} as const;

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function escapeText(s: string): string {
  return s.replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' }[c]!));
}

/** True when any call to action or link on the page points at the card. */
export function linksContactCard(page: ContactPage): boolean {
  if (page.ctaPrimaryHref === CONTACT_ANCHOR || page.ctaSecondaryHref === CONTACT_ANCHOR) return true;
  return (page.bodyBlocks || []).some((block) =>
    block.href === CONTACT_ANCHOR || (block.links || []).some((link) => link.target === CONTACT_ANCHOR));
}

/**
 * The card section, or '' when nothing on the page links it. `studio`
 * defaults to the configured work Telegram; tests pass one explicitly.
 */
export function renderContactCard(page: ContactPage, studio: string | null = STUDIO_TELEGRAM_URL): string {
  if (!linksContactCard(page)) return '';
  const locale = page.locale === 'uz' ? 'uz' : 'ru';
  const t = COPY[locale];
  const telegram = studioTelegramHref(locale, telegramServiceLabel(page.breadcrumbLabel || page.h1), page.url, studio);
  const button = 'min-h-[44px] w-full sm:w-auto text-base';
  const links = [
    `<a data-testid="contact-phone" href="tel:${STUDIO_PHONE}" class="btn-primary ${button}">${escapeText(t.call)}: ${escapeText(STUDIO_PHONE_DISPLAY)}</a>`,
    `<a data-testid="contact-email" href="mailto:${escapeAttr(STUDIO_EMAIL)}" class="btn-secondary ${button}">E-mail: ${escapeText(STUDIO_EMAIL)}</a>`,
    ...(telegram ? [`<a data-testid="contact-telegram" href="${escapeAttr(telegram)}" target="_blank" rel="nofollow noopener noreferrer" class="btn-secondary ${button}">${escapeText(t.telegram)}</a>`] : []),
  ];
  return `<section id="contact" data-testid="studio-contact" aria-labelledby="contact-heading" class="mt-16 scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8">
      <div class="eyebrow mb-3">${escapeText(t.eyebrow)}</div>
      <h2 id="contact-heading" class="font-display text-2xl sm:text-3xl text-white mb-3">${escapeText(t.heading)}</h2>
      <p class="text-sm sm:text-base text-white/70 leading-relaxed mb-6">${escapeText(t.intro)}</p>
      <div class="flex flex-col sm:flex-row sm:flex-wrap gap-3">${links.join('')}</div>
    </section>`;
}
