// How visitors reach the studio: the owner's order of 26.10.2026.
//
// Run: node --import tsx --test tests/studio-contact.test.ts
//
// «На всех формах и вообще где мой номер — грамотно замени на мой Telegram,
// чтобы писали, а не звонили … Только аккуратнее, чтобы SEO не нарушилось.»
// Two settings in content/global/site.json decide every studio contact on the
// site (src/shared/studio-contact.ts): `studioTelegram`, now the owner's
// https://t.me/XGame_changerx (the order supersedes paid-chat decision L14,
// under which that account was no public contact), and `phonePublic: false`,
// which takes the phone and every tel: link off the public surfaces. The
// number stays in site.json for the legal requisites only. Every link to the
// Telegram carries the studio-contact marker the analytics count.
//
// Legal exceptions, kept on purpose: the approved offer edition
// (/ru/oferta/, /uz/oferta/, ai-paket-2026-10-v5) renders with the contacts it
// was approved with (OFFER_EDITION_CONTACT), and the requisites block of the
// offer and of the privacy policies keeps the phone as a requisite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import site from '../content/global/site.json';
import { email, phone, phonePublic, studioTelegram } from '../content/global/site.json';
import {
  formatUzPhone,
  STUDIO_CONTACT_ATTR,
  STUDIO_EMAIL,
  STUDIO_PHONE,
  STUDIO_PHONE_DISPLAY,
  STUDIO_PHONE_PUBLIC,
  STUDIO_TELEGRAM_HANDLE,
  STUDIO_TELEGRAM_URL,
  studioTelegramUrl,
} from '../src/shared/studio-contact';
import {
  articleLinksContactCard,
  CONTACT_ANCHOR,
  contactCardHtml,
  isStudioTelegramHref,
  linksContactCard,
  OFFER_EDITION_CONTACT,
  pageContact,
  renderContactCard,
  SITE_CONTACT,
  stickyContactBar,
  studioFooterLinks,
} from '../scripts/contact-card';
import { buildOrganizationLd } from '../scripts/jsonld-helpers';
import { leadFormServiceFor } from '../scripts/lead-form';
import { PROTECTED_PATHS } from '../scripts/seo-protection';
import { studioTelegramHref } from '../scripts/telegram-cta';
import type { BlogArticle, GlobalSEO, Page } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const OWNER = 'https://t.me/XGame_changerx';
const HANDLE = /XGame_changerx/;
const WORK = 'https://t.me/studio_work';
/** The phone in any written shape: digits, spaced display, tel: link. */
const PHONE = /505870720|50 587 07 20|tel:\+?998/;
const TELEGRAM_REL = 'target="_blank" rel="nofollow noopener noreferrer"';

function listFiles(dir: string, ext: RegExp): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return listFiles(rel, ext);
    return ext.test(entry.name) ? [rel] : [];
  });
}
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAGES = listFiles('content/pages', /\.json$/).map((file) => ({ file, page: JSON.parse(read(file)) as Page }));
const ARTICLES = listFiles('content/blog', /\.json$/).map((file) => ({ file, article: JSON.parse(read(file)) as BlogArticle }));
/** GPTBot Market is a separate product with its own template and support channel. */
const isMarket = (page: Page) => page.designVariant === 'warm-market-signals';
const SITE_PAGES = PAGES.filter(({ page }) => !isMarket(page));
/** The approved offer edition: its content source stays as approved. */
const isOffer = (page: Page) => Boolean(page.termsVersion);

test('two settings: the owner Telegram is the public contact, the phone is not public', () => {
  assert.equal(studioTelegram, OWNER);
  assert.equal(STUDIO_TELEGRAM_URL, studioTelegramUrl(studioTelegram));
  assert.equal(STUDIO_TELEGRAM_URL, OWNER);
  assert.equal(STUDIO_TELEGRAM_HANDLE, '@XGame_changerx');
  assert.equal(phonePublic, false);
  assert.equal(STUDIO_PHONE_PUBLIC, false);
  assert.deepEqual(SITE_CONTACT, { phone: false, telegram: OWNER });
  assert.deepEqual(OFFER_EDITION_CONTACT, { phone: true, telegram: null });
});

test('site.json keeps no second contact: the legacy telegram field, defaultCTA and a Telegram sameAs are gone', () => {
  const global = site as Record<string, unknown>;
  assert.ok(!('telegram' in global), 'telegram');
  assert.ok(!('defaultCTA' in global), 'defaultCTA');
  // The handle lives in one setting: studioTelegram, not sameAs or businessProfiles.
  assert.equal(JSON.stringify(global).match(/XGame_changerx/g)?.length, 1);
  assert.deepEqual(global.sameAs, ['https://github.com/braindiggeruz']);
  // The admin edits the one setting, not the field it replaced.
  const settings = read('src/admin/pages/Settings.tsx');
  assert.match(settings, /set\('studioTelegram'/);
  assert.match(settings, /set\('email'/);
  assert.doesNotMatch(settings, /set\('telegram'|defaultCTA/);
});

test('the setting is parsed strictly: only https://t.me/<public handle> becomes a link', () => {
  assert.equal(studioTelegramUrl(''), null);
  assert.equal(studioTelegramUrl('  '), null);
  assert.equal(studioTelegramUrl(WORK), WORK);
  assert.equal(studioTelegramUrl(`${WORK}/`), WORK);
  for (const bad of ['t.me/studio_work', 'http://t.me/studio_work', 'https://t.me/abc', 'https://t.me/studio_work?start=x',
    'https://t.me/+invite_hash', 'https://evil.example/studio_work', 'https://t.me/studio work', 'https://t.me/1studio']) {
    assert.equal(studioTelegramUrl(bad), null, bad);
  }
  assert.ok(isStudioTelegramHref(OWNER) && isStudioTelegramHref(`${OWNER}?text=x`) && isStudioTelegramHref(`${OWNER}/`));
  assert.ok(!isStudioTelegramHref('https://t.me/XGame_changerx_bot') && !isStudioTelegramHref('https://t.me/gptbotuz_bot'));
});

test('the phone and the e-mail still come from the same file: the phone for the legal requisites', () => {
  assert.equal(STUDIO_PHONE, phone);
  assert.equal(STUDIO_PHONE, '+998505870720');
  assert.equal(STUDIO_PHONE_DISPLAY, '+998 50 587 07 20');
  assert.equal(formatUzPhone('998 90 123 45 67'), '+998 90 123 45 67');
  assert.equal(formatUzPhone('+7 495 000-00-00'), '+7 495 000-00-00');
  assert.equal(STUDIO_EMAIL, email);
  assert.equal(STUDIO_EMAIL, 'ceo@gptbot.uz');
});

test('no page or article outside the offer names the phone or links tel:', () => {
  let offers = 0;
  for (const { file, page } of PAGES) {
    if (isOffer(page)) { offers += 1; continue; }
    assert.doesNotMatch(read(file), PHONE, file);
  }
  assert.equal(offers, 2, 'the two offers are the only exception');
  for (const { file } of ARTICLES) assert.doesNotMatch(read(file), PHONE, file);
});

test('every content link to the owner account is the bare studio Telegram, no draft and no other path', () => {
  let links = 0;
  const check = (file: string, target?: string) => {
    if (!target || !HANDLE.test(target)) return;
    links += 1;
    assert.equal(target, OWNER, `${file}: ${target}`);
  };
  for (const { file, page } of SITE_PAGES) {
    for (const block of page.bodyBlocks || []) {
      check(file, block.href);
      for (const link of block.links || []) check(file, link.target);
    }
  }
  for (const { file, article } of ARTICLES) {
    for (const block of article.body || []) {
      check(file, block.href);
      for (const link of block.links || []) check(file, link.target);
    }
  }
  // 32 «call us» links became Telegram links on 26.10.2026.
  assert.ok(links >= 30, `only ${links} content links to the studio Telegram`);
});

test('no page or article invites the visitor to call the studio', () => {
  // The studio speaking: «позвоните нам», «Позвоните +998…», «по телефону или
  // e-mail», «bizga qo‘ng‘iroq qiling», «Telefon: …». Pages about a client's
  // own calls («менеджер позвонит», «qo‘ng‘iroqlar jurnali») are not matched;
  // the offer keeps the approved edition's wording.
  const callStudio = new RegExp([
    'позвон(?:ите|ить)(?: нам|:| или напишите)',
    '(?:^|"|[.!?]\\s)Позвоните',
    'или позвоните',
    'звоните нам',
    'по телефону(?: \\+998| или e-mail)',
    'поговорить голосом',
    '(?<!«)[Bb]izga qo[‘\']ng[‘\']iroq qil',
    'qo[‘\']ng[‘\']iroq qiling(?: yoki e-mail|, ceo@|\\.")',
    'Qo[‘\']ng[‘\']iroq qilish(?: qulayroq|")',
    'Telefonda gaplashish',
    'telefoni (?:yoki ceo|orqali bog)',
    '(?:Telefon|Телефон):? \\+998',
  ].join('|'));
  for (const { file, page } of SITE_PAGES) {
    if (isOffer(page)) continue;
    assert.doesNotMatch(read(file), callStudio, file);
  }
  for (const { file } of ARTICLES) assert.doesNotMatch(read(file), callStudio, file);
});

test('the e-mail that replaced the phone reads as Russian, not as a swapped word', () => {
  // «обсудить в Telegram» rewritten word for word leaves «обсудить в E-mail»;
  // in Russian one writes «по e-mail» or «на e-mail».
  const swapped = /(?:обсудить|написать|напишите|пишите)(?: нам)? в e-?mail/i;
  for (const { file } of [...ARTICLES, ...SITE_PAGES]) assert.doesNotMatch(read(file), swapped, file);
});

test('the Uzbek copy writes Telegram’da with the tutuq belgisi (U+2019), never Telegramda or an ASCII apostrophe', () => {
  for (const { file } of [...ARTICLES, ...SITE_PAGES].filter(({ file }) => file.includes('/uz/'))) {
    assert.doesNotMatch(read(file), /Telegram(?:da|'da|‘da) (?:yoz|\()/, file);
  }
  for (const file of ['scripts/contact-card.ts', 'scripts/lead-form.ts', 'scripts/prerender.ts', 'src/components/StickyCTA.tsx',
    'src/components/Footer.tsx', 'src/i18n.ts']) {
    assert.doesNotMatch(read(file), /Telegramda yoz/, file);
  }
});

test('llms.txt and llms-full.txt name the Telegram and the e-mail, and no phone', () => {
  for (const file of ['public/llms.txt', 'public/llms-full.txt']) {
    const text = read(file);
    assert.ok(text.includes(STUDIO_TELEGRAM_HANDLE!), `${file}: Telegram`);
    assert.ok(text.includes(STUDIO_EMAIL), `${file}: e-mail`);
    assert.doesNotMatch(text, PHONE, file);
  }
  // llms.txt is hand-written. The phone is still printed in the requisites of
  // the offers and the privacy policies, so llms.txt must not claim the site
  // publishes none: it names that number a legal requisite, not a channel.
  const llms = read('public/llms.txt');
  assert.ok(llms.includes(`| Telegram (public, write) | ${STUDIO_TELEGRAM_HANDLE} — ${OWNER} |`));
  assert.match(llms, /requisites of the offer and\s+privacy-policy pages is a legal requisite, not an enquiry channel/);
  assert.doesNotMatch(llms, /publishes no phone number/);
  assert.ok(!llms.includes('publishes no Telegram account of its own'));
});

test('every #lead-form link is on a page that renders the form, and every #contact link has its card', () => {
  let contact = 0;
  for (const { file, page } of SITE_PAGES) {
    if (page.pageType === 'gpt-chat') continue; // no CTA row, no form, no card
    const hrefs = [page.ctaPrimaryHref, page.ctaSecondaryHref,
      ...(page.bodyBlocks || []).flatMap((block) => [block.href, ...(block.links || []).map((link) => link.target)])];
    if (hrefs.includes('#lead-form')) assert.ok(leadFormServiceFor(page), `${file} links a form it does not have`);
    if (hrefs.includes(CONTACT_ANCHOR)) {
      contact += 1;
      assert.equal(leadFormServiceFor(page), null, `${file} has the form: link #lead-form, not the card`);
      assert.ok(linksContactCard(page), file);
      assert.match(renderContactCard(page), /id="contact"/, file);
    } else {
      assert.equal(renderContactCard(page), '', `${file}: a card nothing links to`);
    }
  }
  // 39 until 2026-10-26; the SEO and sales-automation landings (TOP-3 roadmap
  // step 1.1) then swapped the card for the form.
  assert.ok(contact >= 34, `only ${contact} pages link the contact card`);
});

test('the AI-chat pages link no in-page card: their copy names the Telegram and the e-mail itself', () => {
  for (const { file, page } of SITE_PAGES.filter(({ page }) => page.pageType === 'gpt-chat')) {
    const hrefs = [page.ctaPrimaryHref, page.ctaSecondaryHref,
      ...(page.bodyBlocks || []).flatMap((block) => [block.href, ...(block.links || []).map((link) => link.target)])];
    assert.ok(!hrefs.includes(CONTACT_ANCHOR) && !hrefs.includes('#lead-form'), file);
    assert.ok(hrefs.includes(OWNER), `${file}: Telegram`);
    assert.ok(hrefs.includes(`mailto:${STUDIO_EMAIL}`), `${file}: e-mail`);
    assert.ok(!hrefs.some((href) => href?.startsWith('tel:')), `${file}: no phone`);
  }
});

test('an article that links #contact gets the card, and its own call to action never dangles', () => {
  let linking = 0;
  for (const { file, article } of ARTICLES) {
    if (article.status !== 'published') continue;
    const headerHref = article.cta?.href || CONTACT_ANCHOR;
    if (articleLinksContactCard(article, headerHref)) linking += 1;
    for (const block of article.body || []) {
      for (const href of [block.href, ...(block.links || []).map((link) => link.target)]) {
        if (href?.startsWith('#') && href !== CONTACT_ANCHOR) {
          const id = href.slice(1);
          assert.ok((article.body || []).some((b) => b.id === id) || ['faq', 'main'].includes(id), `${file}: ${href} has no target`);
        }
      }
    }
  }
  assert.ok(linking >= 150, `only ${linking} articles link the contact card`);
});

test('the contact card offers the Telegram first and the e-mail; the phone only with the switch or the offer edition', () => {
  const ru = PAGES.find(({ page }) => page.url === '/ru/whatsapp-bot-dlya-biznesa/')!.page;
  const uz = PAGES.find(({ page }) => page.url === '/uz/whatsapp-bot-biznes-uchun/')!.page;
  const card = renderContactCard(ru);
  const href = studioTelegramHref('ru', ru.breadcrumbLabel || ru.h1, ru.url, OWNER)!.replace(/&/g, '&amp;');
  assert.ok(card.includes(`<a data-testid="contact-telegram" ${STUDIO_CONTACT_ATTR} href="${href}" ${TELEGRAM_REL} class="btn-primary`), card);
  assert.ok(card.includes('>Написать в Telegram</a>'));
  assert.ok(card.includes(`Напишите в Telegram ${STUDIO_TELEGRAM_HANDLE} или на e-mail — ответим в рабочее время, Пн–Сб 10:00–19:00.`));
  assert.ok(card.includes(`href="mailto:${STUDIO_EMAIL}"`));
  assert.ok(card.indexOf('contact-telegram') < card.indexOf('contact-email'), 'Telegram first');
  assert.doesNotMatch(card, PHONE);
  assert.equal((card.match(/min-h-\[44px\]/g) ?? []).length, 2, 'two 44 px targets');
  assert.match(card, /aria-labelledby="contact-heading"/);

  const uzCard = renderContactCard(uz);
  assert.ok(uzCard.includes('>Telegram’da yozish</a>'));
  assert.ok(uzCard.includes(`Telegram’da (${STUDIO_TELEGRAM_HANDLE}) yoki e-mail orqali yozing — ish vaqtida javob beramiz: Du–Sha 10:00–19:00.`));
  assert.ok(uzCard.includes('GPTBot.uz bilan bog‘lanish'));
  assert.doesNotMatch(uzCard, PHONE);

  // The switch: phonePublic true brings the phone back first, Telegram beside it.
  const withPhone = renderContactCard(ru, { phone: true, telegram: OWNER });
  assert.ok(withPhone.includes(`href="tel:${STUDIO_PHONE}"`) && withPhone.includes(`Позвонить: ${STUDIO_PHONE_DISPLAY}`));
  assert.ok(withPhone.includes(`${STUDIO_CONTACT_ATTR} href="${href}"`));
  // No Telegram and no phone: the e-mail alone, said honestly.
  const mailOnly = renderContactCard(ru, { phone: false, telegram: null });
  assert.doesNotMatch(mailOnly, /t\.me|tel:|Telegram/);
  assert.ok(mailOnly.includes('Напишите на e-mail — ответим'));
  // Protected pages keep the bare link in the card (the draft names the page).
  assert.ok(contactCardHtml({ url: PROTECTED_PATHS[0], locale: 'uz', label: 'x' }).includes(`href="${OWNER}"`));
});

test('the approved offer edition renders the card, footer and Organization as approved: phone and e-mail, no Telegram', () => {
  const offers = PAGES.filter(({ page }) => isOffer(page)).map(({ page }) => page);
  assert.deepEqual(offers.map((page) => page.url).sort(), ['/ru/oferta/', '/uz/oferta/']);
  for (const page of offers) {
    assert.equal(page.termsVersion, 'ai-paket-2026-10-v5');
    assert.deepEqual(pageContact(page), OFFER_EDITION_CONTACT);
    const card = renderContactCard(page);
    assert.ok(card.includes(`data-testid="contact-phone" href="tel:${STUDIO_PHONE}"`), page.url);
    assert.ok(card.includes(page.locale === 'uz' ? 'Qo‘ng‘iroq qiling yoki yozing' : 'Позвоните или напишите'), page.url);
    assert.doesNotMatch(card, /t\.me|data-contact/, page.url);
  }
  const org = buildOrganizationLd(site as unknown as GlobalSEO, OFFER_EDITION_CONTACT);
  assert.equal(org.telephone, STUDIO_PHONE);
  assert.deepEqual(org.contactPoint, { '@type': 'ContactPoint', contactType: 'sales', telephone: STUDIO_PHONE, email: STUDIO_EMAIL, availableLanguage: ['Russian', 'Uzbek'] });
});

test('the Organization node: no telephone, a customer-support contactPoint with the e-mail and the Telegram url', () => {
  const org = buildOrganizationLd(site as unknown as GlobalSEO);
  assert.ok(!('telephone' in org));
  assert.deepEqual(org.contactPoint, { '@type': 'ContactPoint', contactType: 'customer support', email: STUDIO_EMAIL, url: OWNER, availableLanguage: ['Russian', 'Uzbek'] });
  assert.equal(org.email, STUDIO_EMAIL);
  // NAP: name and address stay as they were.
  assert.equal(org.name, 'GPTBot.uz');
  assert.deepEqual(org.address, { '@type': 'PostalAddress', addressLocality: 'Toshkent', addressCountry: 'UZ',
    ...((site as unknown as GlobalSEO).streetAddress ? { streetAddress: (site as unknown as GlobalSEO).streetAddress } : {}) });
});

test('Boss Digital JSON-LD: no telephone, its contactPoint carries the e-mail and the Telegram url; name and address unchanged', () => {
  for (const file of ['content/pages/ru/boss-digital.json', 'content/pages/uz/boss-digital.json']) {
    const page = JSON.parse(read(file)) as Page & { extraJsonLd: Array<Record<string, unknown>> };
    const node = page.extraJsonLd.find((n) => n['@id'] === 'https://gptbot.uz/boss-digital/#boss-digital')!;
    assert.ok(!JSON.stringify(node).includes('telephone'), file);
    assert.equal(node.name, 'Boss Digital');
    assert.deepEqual(node.address, { '@type': 'PostalAddress', streetAddress: 'Yahyo Gulyamov ko‘chasi 35', addressLocality: 'Tashkent', addressCountry: 'UZ' });
    assert.deepEqual(node.contactPoint, [{ '@type': 'ContactPoint', contactType: 'customer support', email: STUDIO_EMAIL, url: OWNER, availableLanguage: ['Russian', 'Uzbek'] }]);
  }
});

test('footers list the Telegram with its marker and the e-mail; the phone only with the switch', () => {
  const now = studioFooterLinks('hover:text-white', { phoneTestId: 'footer-call-cta', telegramTestId: 'footer-telegram-cta' });
  assert.ok(now.startsWith(`<a data-testid="footer-telegram-cta" ${STUDIO_CONTACT_ATTR} href="${OWNER}" rel="nofollow noopener noreferrer" target="_blank"`), now);
  assert.ok(now.includes(`href="mailto:${STUDIO_EMAIL}"`));
  assert.doesNotMatch(now, PHONE);
  // The offer edition: exactly the footer it was approved with.
  assert.equal(studioFooterLinks('hover:text-white', { contact: OFFER_EDITION_CONTACT }),
    `<a href="tel:${STUDIO_PHONE}" class="hover:text-white">${STUDIO_PHONE_DISPLAY}</a>\n      <a href="mailto:${STUDIO_EMAIL}" class="hover:text-white">${STUDIO_EMAIL}</a>`);
});

test('the mobile bar: «Написать в Telegram» takes the row, the form beside it; the phone only with the switch', () => {
  const ru = stickyContactBar('ru');
  assert.ok(ru.includes(`<a data-testid="sticky-telegram-cta" ${STUDIO_CONTACT_ATTR} href="${OWNER}" ${TELEGRAM_REL} class="bg-grad-cta`), ru);
  assert.ok(ru.includes('>Написать в Telegram</a>') && ru.includes('grid-cols-1'));
  assert.doesNotMatch(ru, PHONE);
  const uz = stickyContactBar('uz', { leadForm: true });
  assert.ok(uz.includes('>Telegram’da yozish</a>') && uz.includes('data-testid="sticky-form-cta" href="#lead-form"') && uz.includes('grid-cols-[1fr_auto]'));
  const legacy = stickyContactBar('ru', { leadForm: true, contact: { phone: true, telegram: null } });
  assert.ok(legacy.includes(`data-testid="sticky-call-cta" href="tel:${STUDIO_PHONE}"`) && legacy.includes('>Позвонить</a>'));
  assert.equal(stickyContactBar('ru', { contact: { phone: false, telegram: null } }), '', 'no direct contact, no bar');
});

test('every surface takes the contact from the one module and marks a studio Telegram link', () => {
  for (const file of ['src/calculator/CalculatorApp.tsx', 'src/gpt-chat/contact.ts', 'src/components/FinalCTA.tsx',
    'src/components/Footer.tsx', 'src/components/StickyCTA.tsx', 'src/gpt-chat/account/PackPanel.tsx']) {
    const source = read(file);
    assert.match(source, /from ['"]\.\.\/(?:\.\.\/)?shared\/studio-contact['"]/, file);
    assert.doesNotMatch(source, HANDLE, `${file} hard-codes the handle`);
  }
  for (const file of ['scripts/lead-form.ts', 'scripts/contact-card.ts', 'scripts/telegram-cta.ts', 'scripts/prerender.ts',
    'scripts/prerender-blog.ts', 'scripts/prerender-home.ts', 'scripts/generate-llm-markdown.ts']) {
    assert.match(read(file), /from '\.\.\/src\/shared\/studio-contact'/, file);
  }
  // Each place that renders the Telegram marks it for the analytics
  // (contact_click and telegram_cta_studio key off the marker, not a handle).
  for (const file of ['src/calculator/CalculatorApp.tsx', 'src/components/FinalCTA.tsx', 'src/components/Footer.tsx',
    'src/components/StickyCTA.tsx', 'src/gpt-chat/components/AiLeadForm.tsx', 'src/gpt-chat/account/PackPanel.tsx']) {
    assert.match(read(file), /STUDIO_CONTACT_PROPS/, file);
  }
  assert.match(read('src/gpt-chat/components/AiTelegramCta.tsx'), /data-contact=\{link\.channel === 'studio' \? 'studio' : undefined\}/);
  for (const file of ['scripts/prerender.ts', 'scripts/prerender-blog.ts', 'scripts/prerender-home.ts', 'scripts/contact-card.ts', 'scripts/lead-form.ts']) {
    assert.match(read(file), /STUDIO_CONTACT_ATTR/, file);
  }
  assert.match(read('scripts/lead-form.ts'), /a\.setAttribute\('data-contact','studio'\)/);
  assert.match(read('apps/studio/scripts/studio-page.ts'), /data-contact="studio"/);
  // Every phone renderer asks the switch first.
  for (const file of ['src/components/FinalCTA.tsx', 'src/components/Footer.tsx', 'src/components/StickyCTA.tsx',
    'src/calculator/CalculatorApp.tsx', 'src/gpt-chat/account/PackPanel.tsx', 'src/gpt-chat/contact.ts', 'scripts/prerender-home.ts',
    'scripts/generate-llm-markdown.ts', 'scripts/contact-card.ts', 'scripts/lead-form.ts']) {
    assert.match(read(file), /STUDIO_PHONE_PUBLIC|STUDIO_PUBLIC_PHONE/, file);
  }
  // Browser code reads only STUDIO_PUBLIC_PHONE, so its bundles carry no number while it is null.
  for (const file of ['src/components/FinalCTA.tsx', 'src/components/Footer.tsx', 'src/components/StickyCTA.tsx',
    'src/calculator/CalculatorApp.tsx', 'src/gpt-chat/account/PackPanel.tsx', 'src/gpt-chat/contact.ts']) {
    assert.doesNotMatch(read(file), /STUDIO_PHONE(?:_DISPLAY)?\b/, file);
  }
});

test('the homepage sends every demo button to its contact section; the section leads with the Telegram', () => {
  assert.match(read('src/lib/cta.ts'), /export const CONTACT_HREF = '#contact';/);
  for (const file of ['src/components/Header.tsx', 'src/components/Hero.tsx', 'src/components/Solution.tsx',
    'src/components/DemoChat.tsx', 'src/components/Offer.tsx', 'src/components/Footer.tsx']) {
    const source = read(file);
    assert.match(source, /href=\{CONTACT_HREF\}/, file);
    assert.doesNotMatch(source, /ctaUrl|t\.me\//, file);
  }
  const finalCta = read('src/components/FinalCTA.tsx');
  assert.match(finalCta, /<section id="contact"/);
  assert.match(finalCta, /\{STUDIO_PUBLIC_PHONE \? \(/, 'the phone only with the switch');
  assert.match(finalCta, /href=\{`mailto:\$\{STUDIO_EMAIL\}`\}/);
  assert.match(finalCta, /STUDIO_PUBLIC_PHONE \? 'btn-secondary[^']*' : 'btn-primary/, 'without the phone the Telegram is primary');
  const shell = read('scripts/prerender-home.ts');
  assert.match(shell, /<section id="contact" aria-labelledby="contact-heading">/);
  assert.match(shell, /<a href="#contact">\$\{escapeText\(RU\.hero\.cta\)\}<\/a>/);
  assert.doesNotMatch(read('src/lib/cta.ts'), /'Lead'/);
});

// Where the handle is written. The studio contact reaches every page through
// src/shared/studio-contact.ts; any other source file that writes the handle
// is another product, a hand-written text or code outside the build.
const HANDLE_FILES = new Map<string, string>([
  ['public/llms.txt', 'hand-written: the studio contact for assistants'],
  ['public/llms-full.txt', 'hand-written opening of the superset'],
  // The header comment records the owner's order of 26.10.2026; the code reads site.json.
  ['src/shared/studio-contact.ts', 'comment: the decision record'],
  ['functions/platform/bunzy/content.ts', 'Bunzy'],
  ['functions/platform/bunzy/render.ts', 'Bunzy'],
  // The lead bot @aidirectprobot; not to be touched (AGENTS.md section 2).
  ['functions/api/telegram/webhook.ts', 'lead bot'],
  // One-off generators of 2026-07 content; not part of the build.
  ['scripts/apply-blog.ts', 'content generator'],
  ['scripts/apply-research.ts', 'content generator'],
  ['scripts/seed-pages.ts', 'content generator'],
  ['scripts/blog-articles-part1.json', 'content generator data'],
  ['scripts/blog-articles-part2.json', 'content generator data'],
  ['scripts/blog-articles-part3.json', 'content generator data'],
  ['scripts/research-data.json', 'content generator data'],
]);

test('the handle is written only in site.json, the hand-written llms texts and code outside the studio contact', () => {
  const files = [
    ...listFiles('src', /\.(tsx?|json)$/),
    ...listFiles('scripts', /\.(tsx?|json|mjs)$/),
    ...listFiles('functions', /\.ts$/),
    ...listFiles('public', /\.(txt|html|json)$/),
    'index.html',
  ];
  const found = files.filter((file) => HANDLE.test(read(file)));
  assert.deepEqual(found.filter((file) => !HANDLE_FILES.has(file)), [], 'a new place hard-codes the handle; read it from studio-contact');
  for (const file of HANDLE_FILES.keys()) assert.ok(found.includes(file), `${file} no longer needs its entry — remove it`);
});

// ── The built site ───────────────────────────────────────────────────────────

const DIST = path.join(ROOT, 'dist');
const built = fs.existsSync(path.join(DIST, 'ru', 'gpt-chat', 'index.html'));
const MARKET = new Set(PAGES.filter(({ page }) => isMarket(page)).map(({ page }) => `dist${page.url}index.html`));
const OFFERS = new Set(['dist/ru/oferta/index.html', 'dist/uz/oferta/index.html']);
const POLICIES = new Set(['dist/ru/politika-konfidentsialnosti/index.html', 'dist/uz/maxfiylik-siyosati/index.html']);
/** The requisites block of a legal document: the one place the phone stays (scripts/legal-entity.ts). */
const withoutRequisites = (html: string) => html.replace(/<section id="requisites"[\s\S]*?<\/section>/, '');
/** The page's markup without <script> elements: the head click handlers name tel: and the marker in code. */
const markup = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

test('built site: no public page outside the legal exceptions names the phone or links tel:', { skip: !built && 'no dist/ build present' }, () => {
  let documents = 0;
  for (const file of listFiles('dist', /\.(html|md|txt|xml)$/)) {
    if (OFFERS.has(file)) continue;
    const text = POLICIES.has(file) ? withoutRequisites(read(file)) : read(file);
    documents += 1;
    assert.doesNotMatch(markup(text), PHONE, file);
    assert.ok(!text.includes('href="tel:'), file);
  }
  assert.ok(documents > 250, `only ${documents} built documents`);
  for (const file of POLICIES) {
    // The requisites block keeps the operator's phone; the text names Telegram for data requests.
    const html = read(file);
    assert.match(html, /data-testid="legal-requisites"[\s\S]*href="tel:\+998505870720"/, file);
    assert.ok(html.includes('XGame_changerx'), file);
  }
});

test('built site: the offers are the approved edition, with the phone and without the Telegram', { skip: !built && 'no dist/ build present' }, () => {
  for (const file of OFFERS) {
    const html = markup(read(file));
    assert.ok(html.includes('data-terms-version="ai-paket-2026-10-v5"'), file);
    assert.ok(html.includes(`href="tel:${STUDIO_PHONE}"`), file);
    assert.doesNotMatch(html, HANDLE, file);
  }
});

test('built site: every page with a contact surface links the studio Telegram with its marker and the Telegram rel', { skip: !built && 'no dist/ build present' }, () => {
  let pages = 0;
  for (const file of listFiles('dist', /\.html$/)) {
    if (MARKET.has(file) || OFFERS.has(file)) continue;
    const html = markup(read(file));
    // A contact surface: the studio e-mail in a footer, card or contact line.
    if (!html.includes(`mailto:${STUDIO_EMAIL}`)) continue;
    pages += 1;
    const links = html.match(/<a\b[^>]*href="https:\/\/t\.me\/XGame_changerx[^"]*"[^>]*>/g) ?? [];
    assert.ok(links.length > 0, `${file}: no studio Telegram link`);
    for (const tag of links) {
      assert.ok(tag.includes(STUDIO_CONTACT_ATTR), `${file}: ${tag.slice(0, 120)}`);
      assert.match(tag, /rel="nofollow noopener noreferrer"/, file);
      assert.match(tag, /target="_blank"/, file);
    }
  }
  assert.ok(pages > 250, `only ${pages} pages with a contact surface`);
});

test('built site: JSON-LD carries no telephone outside the offers; Organization and Boss Digital point to the Telegram', { skip: !built && 'no dist/ build present' }, () => {
  let organizations = 0;
  for (const file of listFiles('dist', /\.html$/)) {
    if (OFFERS.has(file) || MARKET.has(file)) continue;
    for (const [, json] of read(file).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      assert.ok(!json.includes('"telephone"'), file);
      const graph = (JSON.parse(json)['@graph'] ?? [JSON.parse(json)]) as Array<Record<string, unknown>>;
      for (const node of graph) {
        if (node['@id'] === 'https://gptbot.uz/#org') {
          organizations += 1;
          assert.deepEqual(node.contactPoint, { '@type': 'ContactPoint', contactType: 'customer support', email: STUDIO_EMAIL, url: OWNER, availableLanguage: ['Russian', 'Uzbek'] }, file);
        }
        if (node['@id'] === 'https://gptbot.uz/boss-digital/#boss-digital') {
          assert.deepEqual((node.contactPoint as Array<Record<string, unknown>>)[0].url, OWNER, file);
        }
      }
    }
  }
  assert.ok(organizations > 250, `only ${organizations} Organization nodes`);
});

test('built site: protected pages link the bare Telegram (no draft) and every #contact link has one card', { skip: !built && 'no dist/ build present' }, () => {
  for (const pathname of PROTECTED_PATHS) {
    const html = read(`dist${pathname}index.html`);
    assert.ok(html.includes(`href="${OWNER}"`), pathname);
    assert.doesNotMatch(html, /t\.me\/XGame_changerx\?text=/, pathname);
  }
  for (const file of listFiles('dist', /\.html$/)) {
    const text = read(file);
    if (text.includes(`href="${CONTACT_ANCHOR}"`)) {
      assert.equal((text.match(/id="contact"/g) ?? []).length, 1, `${file}: #contact without exactly one card`);
    }
  }
});

test('the homepage FAQ invites a written contact in both languages, never a call', () => {
  // src/i18n.ts feeds the React landing, the crawler shell of "/" and its FAQPage.
  const i18n = read('src/i18n.ts');
  assert.ok(i18n.includes("a: 'Вы пишете в Telegram или на e-mail — мы показываем демо"));
  assert.ok(i18n.includes("a: 'Siz Telegram’da yoki e-mail orqali yozasiz — biz demoni"));
  assert.doesNotMatch(i18n, /Вы звоните|qo[‘']ng[‘']iroq qilasiz/);
});

test('built site: every studio Telegram link carries the marker, market support included; market pages and policies link it bare', { skip: !built && 'no dist/ build present' }, () => {
  let links = 0;
  for (const file of listFiles('dist', /\.html$/)) {
    if (OFFERS.has(file)) continue;
    for (const tag of markup(read(file)).match(/<a\b[^>]*href="https:\/\/t\.me\/XGame_changerx[^"]*"[^>]*>/g) ?? []) {
      links += 1;
      assert.ok(tag.includes(STUDIO_CONTACT_ATTR), `${file}: ${tag.slice(0, 120)}`);
      assert.match(tag, /rel="nofollow noopener noreferrer"/, file);
      assert.match(tag, /target="_blank"/, file);
    }
  }
  assert.ok(links > 700, `only ${links} studio Telegram links`);
  // Market support and personal-data requests are not sales enquiries: no draft.
  for (const file of [...MARKET, ...POLICIES]) {
    const tags = markup(read(file)).match(/<a\b[^>]*href="https:\/\/t\.me\/XGame_changerx[^"]*"[^>]*>/g) ?? [];
    assert.ok(tags.length > 0, `${file}: no studio Telegram link`);
    for (const tag of tags) {
      assert.ok(tag.includes(`href="${OWNER}"`), `${file}: ${tag.slice(0, 120)}`);
      assert.ok(tag.includes(STUDIO_CONTACT_ATTR), file);
    }
  }
  assert.equal(MARKET.size, 4);
});

test('built site: the homepage FAQ and its FAQPage answer name the Telegram, not a call', { skip: !built && 'no dist/ build present' }, () => {
  const html = read('dist/index.html');
  assert.equal((html.match(/Вы пишете в Telegram или на e-mail — мы показываем демо/g) ?? []).length, 2, 'visible FAQ and FAQPage');
  assert.doesNotMatch(html, /Вы звоните/);
});

test('built site: Markdown twins and llms-full.txt keep mailto: and tel: targets unprefixed', { skip: !built && 'no dist/ build present' }, () => {
  let twins = 0;
  for (const file of [...listFiles('dist', /\.html\.md$/), 'dist/llms-full.txt']) {
    const text = read(file);
    twins += 1;
    assert.doesNotMatch(text, /gptbot\.uz(?:mailto|tel|https?):/, file);
  }
  assert.ok(twins > 20, `only ${twins} Markdown files`);
  assert.match(read('dist/llms-full.txt'), /\]\(mailto:ceo@gptbot\.uz\)/);
});
