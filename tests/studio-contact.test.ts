// How visitors reach the studio (paid-chat plan WP-11 and WP-12, decision L14).
//
// Run: node --import tsx --test tests/studio-contact.test.ts
//
// One setting, content/global/site.json `studioTelegram`, decides whether the
// site offers a Telegram contact at all (src/shared/studio-contact.ts). No work
// account has been named, so it is empty and the owner's personal account is
// gone from the whole site: WP-11 moved the unprotected pages, WP-12 the ten
// protected pages, the templates they share (homepage, AI-chat pages, blog),
// the click handlers in <head> and the blog articles. Calls to action lead to
// a lead form or to a contact card (phone and e-mail); naming a work account
// later puts Telegram back everywhere with one edit. Every link to it carries
// the studio-contact marker the analytics count. The guard at the end lists
// the few places the handle still lives, all of them other products or code
// outside the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import site from '../content/global/site.json';
import { email, phone, studioTelegram } from '../content/global/site.json';
import {
  formatUzPhone,
  STUDIO_CONTACT_ATTR,
  STUDIO_EMAIL,
  STUDIO_PHONE,
  STUDIO_PHONE_DISPLAY,
  STUDIO_TELEGRAM_URL,
  studioTelegramUrl,
} from '../src/shared/studio-contact';
import {
  articleLinksContactCard,
  CONTACT_ANCHOR,
  contactCardHtml,
  linksContactCard,
  renderContactCard,
  studioFooterLinks,
} from '../scripts/contact-card';
import { leadFormServiceFor } from '../scripts/lead-form';
import { studioTelegramHref } from '../scripts/telegram-cta';
import type { BlogArticle, Page } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const PERSONAL = /XGame_changerx/i;
const WORK = 'https://t.me/studio_work';

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

test('one setting: the studio Telegram is empty or a valid work handle, never the personal account', () => {
  assert.equal(typeof studioTelegram, 'string');
  assert.ok(studioTelegram === '' || studioTelegramUrl(studioTelegram) !== null, `invalid studioTelegram: ${studioTelegram}`);
  assert.equal(STUDIO_TELEGRAM_URL, studioTelegramUrl(studioTelegram));
  assert.doesNotMatch(studioTelegram, PERSONAL, 'the personal account is not a studio contact (L14)');
  assert.equal(STUDIO_TELEGRAM_URL, null, 'no work Telegram has been named yet');
});

test('site.json keeps no second contact: the legacy telegram field, defaultCTA and the personal sameAs are gone', () => {
  const global = site as Record<string, unknown>;
  assert.ok(!('telegram' in global), 'telegram');
  assert.ok(!('defaultCTA' in global), 'defaultCTA');
  assert.doesNotMatch(JSON.stringify(global), PERSONAL);
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
});

test('phone and e-mail come from the same file', () => {
  assert.equal(STUDIO_PHONE, phone);
  assert.equal(STUDIO_PHONE, '+998505870720');
  assert.equal(STUDIO_PHONE_DISPLAY, '+998 50 587 07 20');
  assert.equal(formatUzPhone('998 90 123 45 67'), '+998 90 123 45 67');
  assert.equal(formatUzPhone('+7 495 000-00-00'), '+7 495 000-00-00');
  assert.equal(STUDIO_EMAIL, email);
  assert.equal(STUDIO_EMAIL, 'ceo@gptbot.uz');
});

test('no page or article names or links the personal account, and no contact button promises Telegram', () => {
  // A button to the studio leads to a form or a card, neither of which is
  // Telegram while none is configured. Buttons to the bot may say Telegram.
  const studio = (href?: string) => href === '#lead-form' || href === CONTACT_ANCHOR;
  const viaTelegram = / в Telegram$|Telegram[’']?da |Telegramda /;
  for (const { file, page } of SITE_PAGES) {
    assert.doesNotMatch(read(file), PERSONAL, file);
    for (const block of page.bodyBlocks || []) {
      if (block.type === 'cta' && studio(block.href)) assert.doesNotMatch(block.text || '', viaTelegram, `${file}: ${block.text}`);
    }
    if (studio(page.ctaPrimaryHref)) assert.doesNotMatch(page.ctaPrimaryLabel || '', viaTelegram, `${file}: ${page.ctaPrimaryLabel}`);
  }
  for (const { file, article } of ARTICLES) {
    assert.doesNotMatch(read(file), PERSONAL, file);
    for (const block of article.body || []) {
      if (block.type === 'cta' && studio(block.href)) assert.doesNotMatch(block.text || '', viaTelegram, `${file}: ${block.text}`);
    }
    if (studio(article.cta?.href)) assert.doesNotMatch(article.cta!.label, viaTelegram, `${file}: ${article.cta!.label}`);
  }
});

test('no page tells a visitor to write to the studio in Telegram while none is configured', () => {
  // Body copy as well as buttons: "Вы пишете нам в Telegram" or "Borisga
  // Telegram orqali yuboring" sends a visitor to a channel the page no longer
  // offers. Sentences about the assistant bot or a client's own Telegram do
  // not address the studio and are not matched.
  assert.equal(STUDIO_TELEGRAM_URL, null, 'with a work account configured, review this guard');
  const writeToStudio = new RegExp([
    '(?:пишете|напишите|пишите|откройте)(?: нам)? (?:в |через )?Telegram',
    '(?:нам|Борису) в Telegram',
    'Telegram[’\']?(?:ga|da) yoz(?:asiz|ing)',
    'Telegram orqali (?:yozing|yuboring|bog‘laning)',
    'Telegramda (?:yozing|bog‘laning)',
  ].join('|'), 'i');
  for (const { file } of SITE_PAGES) assert.doesNotMatch(read(file), writeToStudio, file);
});

test('no article asks the reader to contact the studio in Telegram', () => {
  // Articles explain Telegram itself ("Откройте Telegram и найдите @BotFather")
  // and clients' Telegram channels ("пишете в Telegram компании"), so the
  // pattern here only matches the studio speaking: "напишите нам в Telegram",
  // "в Telegram по кнопке ниже", "Telegram’da muhokama qilamiz". Checked against
  // the articles before WP-12 (e11524f0): it flags 29 of them, and none now.
  assert.equal(STUDIO_TELEGRAM_URL, null, 'with a work account configured, review this guard');
  const studioSpeaks = new RegExp([
    'напишите(?: нам)? в Telegram',
    'нам в Telegram',
    'в Telegram по кнопке',
    'в Telegram, ответим',
    'Telegram[’\'‘]?(?:ga|da) yozing',
    'Telegram[’\'‘]?da muhokama qil(?:amiz|ish mumkin|ib)',
    'Telegram orqali (?:yozing|bog‘laning)',
  ].join('|'), 'i');
  for (const { file } of ARTICLES) assert.doesNotMatch(read(file), studioSpeaks, file);
});

test('llms.txt and llms-full.txt name the same phone and e-mail, and no Telegram while none is configured', () => {
  for (const file of ['public/llms.txt', 'public/llms-full.txt']) {
    const text = read(file);
    assert.ok(text.includes(STUDIO_PHONE_DISPLAY), `${file}: phone`);
    assert.ok(text.includes(STUDIO_EMAIL), `${file}: e-mail`);
  }
  // llms.txt is hand-written, so naming a work account in site.json must come
  // with an edit of its contact section, or assistants keep saying there is none.
  assert.equal(read('public/llms.txt').includes('publishes no Telegram account of its own'), STUDIO_TELEGRAM_URL === null);
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
  assert.ok(contact >= 70, `only ${contact} pages link the contact card`);
});

test('the AI-chat pages link no in-page card: their summary has no CTA row, so their copy names phone and e-mail itself', () => {
  for (const { file, page } of SITE_PAGES.filter(({ page }) => page.pageType === 'gpt-chat')) {
    const hrefs = [page.ctaPrimaryHref, page.ctaSecondaryHref,
      ...(page.bodyBlocks || []).flatMap((block) => [block.href, ...(block.links || []).map((link) => link.target)])];
    assert.ok(!hrefs.includes(CONTACT_ANCHOR) && !hrefs.includes('#lead-form'), file);
    assert.ok(hrefs.includes(`tel:${STUDIO_PHONE}`), `${file}: phone`);
    assert.ok(hrefs.includes(`mailto:${STUDIO_EMAIL}`), `${file}: e-mail`);
  }
});

test('an article that links #contact gets the card, and its own call to action never dangles', () => {
  let linking = 0;
  for (const { file, article } of ARTICLES) {
    if (article.status !== 'published') continue;
    // prerender-blog.ts: without its own CTA (and without a chat entry) the
    // header button leads to the card.
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
  const one = { url: '/ru/blog/x/', locale: 'ru', h1: 'X', body: [{ type: 'p', text: 'x' }] } as unknown as BlogArticle;
  assert.equal(articleLinksContactCard(one, '/ru/gpt-chat/'), false, 'a chat entry in the header links no card');
  assert.equal(articleLinksContactCard({ ...one, cta: { label: 'Связаться', href: CONTACT_ANCHOR } }, '/ru/gpt-chat/'), true);
  assert.equal(articleLinksContactCard(one, CONTACT_ANCHOR), true);
});

test('the contact card offers the phone and the e-mail, and Telegram only once one is configured', () => {
  const ru = PAGES.find(({ page }) => page.url === '/ru/ai-bot-dlya-kliniki/')!.page;
  const uz = PAGES.find(({ page }) => page.url === '/uz/klinika-uchun-ai-bot/')!.page;
  const card = renderContactCard(ru);
  assert.ok(card.includes(`href="tel:${STUDIO_PHONE}"`));
  assert.ok(card.includes(`Позвонить: ${STUDIO_PHONE_DISPLAY}`));
  assert.ok(card.includes(`href="mailto:${STUDIO_EMAIL}"`));
  assert.ok(card.includes('Пн–Сб 10:00–19:00'));
  assert.doesNotMatch(card, /t\.me|Telegram/);
  assert.equal((card.match(/min-h-\[44px\]/g) ?? []).length, 2, 'two 44 px targets');
  assert.match(card, /aria-labelledby="contact-heading"/);

  const uzCard = renderContactCard(uz);
  assert.ok(uzCard.includes(`Qo‘ng‘iroq qilish: ${STUDIO_PHONE_DISPLAY}`));
  assert.ok(uzCard.includes('GPTBot.uz bilan bog‘lanish'));
  assert.ok(uzCard.includes('Du–Sha 10:00–19:00'));

  // The one-line change: a configured work account joins the card, with the
  // same prefilled draft the rest of the site uses and the studio marker.
  const withWork = renderContactCard(ru, WORK);
  const href = studioTelegramHref('ru', ru.breadcrumbLabel || ru.h1, ru.url, WORK)!;
  assert.ok(withWork.includes(`${STUDIO_CONTACT_ATTR} href="${href.replace(/&/g, '&amp;')}"`));
  assert.ok(withWork.includes('target="_blank" rel="nofollow noopener noreferrer"'));
  assert.ok(withWork.includes('Написать в Telegram'));
  assert.ok(renderContactCard(uz, WORK).includes('Telegramda yozish'));
  // The same card on an article, keyed by its URL and H1.
  const article = contactCardHtml({ url: '/uz/blog/x/', locale: 'uz', label: 'AI-chat nima' }, WORK);
  assert.ok(article.includes(studioTelegramHref('uz', 'AI-chat nima', '/uz/blog/x/', WORK)!.replace(/&/g, '&amp;')));
});

test('footers list phone and e-mail, and the work Telegram with its marker once configured', () => {
  const now = studioFooterLinks('hover:text-white', { phoneTestId: 'footer-call-cta' });
  assert.ok(now.includes(`data-testid="footer-call-cta" href="tel:${STUDIO_PHONE}"`));
  assert.ok(now.includes(`>${STUDIO_PHONE_DISPLAY}</a>`));
  assert.ok(now.includes(`href="mailto:${STUDIO_EMAIL}"`));
  assert.doesNotMatch(now, /t\.me|Telegram|data-contact/);
  const later = studioFooterLinks('hover:text-white', { studio: WORK });
  assert.ok(later.includes(`<a ${STUDIO_CONTACT_ATTR} href="${WORK}" rel="nofollow noopener noreferrer" target="_blank"`));
});

test('every surface takes the contact from the one module and marks a studio Telegram link', () => {
  // Readers of src/shared/studio-contact.ts.
  for (const file of ['src/calculator/CalculatorApp.tsx', 'src/gpt-chat/contact.ts', 'src/components/FinalCTA.tsx',
    'src/components/Footer.tsx', 'src/components/StickyCTA.tsx']) {
    assert.match(read(file), /from '\.\.\/shared\/studio-contact'/, file);
  }
  for (const file of ['scripts/lead-form.ts', 'scripts/contact-card.ts', 'scripts/telegram-cta.ts', 'scripts/prerender.ts',
    'scripts/prerender-blog.ts', 'scripts/prerender-home.ts', 'scripts/generate-llm-markdown.ts']) {
    assert.match(read(file), /from '\.\.\/src\/shared\/studio-contact'/, file);
  }
  // Each place that can render the work Telegram marks it for the analytics
  // (contact_click and telegram_cta_studio key off the marker, not a handle).
  for (const file of ['src/calculator/CalculatorApp.tsx', 'src/components/FinalCTA.tsx', 'src/components/Footer.tsx',
    'src/components/StickyCTA.tsx', 'src/gpt-chat/components/AiLeadForm.tsx']) {
    assert.match(read(file), /STUDIO_CONTACT_PROPS/, file);
  }
  assert.match(read('src/gpt-chat/components/AiTelegramCta.tsx'), /data-contact=\{link\.channel === 'studio' \? 'studio' : undefined\}/);
  for (const file of ['scripts/prerender.ts', 'scripts/prerender-blog.ts', 'scripts/prerender-home.ts', 'scripts/contact-card.ts', 'scripts/lead-form.ts']) {
    assert.match(read(file), /STUDIO_CONTACT_ATTR/, file);
  }
  assert.match(read('scripts/lead-form.ts'), /a\.setAttribute\('data-contact','studio'\)/);
});

test('the homepage sends every demo button to its contact section, not to Telegram', () => {
  assert.match(read('src/lib/cta.ts'), /export const CONTACT_HREF = '#contact';/);
  for (const file of ['src/components/Header.tsx', 'src/components/Hero.tsx', 'src/components/Solution.tsx',
    'src/components/DemoChat.tsx', 'src/components/Offer.tsx', 'src/components/Footer.tsx']) {
    const source = read(file);
    assert.match(source, /href=\{CONTACT_HREF\}/, file);
    assert.doesNotMatch(source, /ctaUrl|t\.me\//, file);
  }
  const finalCta = read('src/components/FinalCTA.tsx');
  assert.match(finalCta, /<section id="contact"/);
  assert.match(finalCta, /href=\{`tel:\$\{STUDIO_PHONE\}`\}/);
  assert.match(finalCta, /href=\{`mailto:\$\{STUDIO_EMAIL\}`\}/);
  assert.match(finalCta, /\{STUDIO_TELEGRAM_URL && \(/, 'Telegram only once one is configured');
  // The crawler shell says what the landing says (tests/homepage-crawler-shell.test.ts).
  const shell = read('scripts/prerender-home.ts');
  assert.match(shell, /<section id="contact" aria-labelledby="contact-heading">/);
  assert.match(shell, /<a href="#contact">\$\{escapeText\(RU\.hero\.cta\)\}<\/a>/);
  // A scroll to the contact section is not a lead: no Meta Lead from the browser.
  assert.doesNotMatch(read('src/lib/cta.ts'), /'Lead'/);
});

// Where the personal handle may still appear, and why. Anything else in
// src/, scripts/, functions/ or public/ fails here.
const LEGACY = new Map<string, string>([
  // A separate product with its own support channel.
  ['scripts/market-page.ts', 'GPTBot Market footer'],
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

test('the personal handle survives only where another product or code outside the build owns it', () => {
  const files = [
    ...listFiles('src', /\.(tsx?|json)$/),
    ...listFiles('scripts', /\.(tsx?|json|mjs)$/),
    ...listFiles('functions', /\.ts$/),
    ...listFiles('public', /\.(txt|html|json)$/),
    'index.html',
  ];
  const found = files.filter((file) => PERSONAL.test(read(file)));
  assert.deepEqual(found.filter((file) => !LEGACY.has(file)), [], 'a new place links the personal account');
  for (const file of LEGACY.keys()) assert.ok(found.includes(file), `${file} no longer needs its exemption — remove it`);
});

const DIST = path.join(ROOT, 'dist');
const built = fs.existsSync(path.join(DIST, 'ru', 'gpt-chat', 'index.html'));

test('built site: only GPTBot Market names the personal account, and every #contact link has one card', { skip: !built && 'no dist/ build present' }, () => {
  const market = new Set(PAGES.filter(({ page }) => isMarket(page)).map(({ page }) => `dist${page.url}index.html`));
  let documents = 0;
  for (const file of listFiles('dist', /\.(html|md|txt|xml)$/)) {
    const text = read(file);
    documents += 1;
    if (!market.has(file)) assert.doesNotMatch(text, PERSONAL, file);
    if (file.endsWith('.html') && text.includes(`href="${CONTACT_ANCHOR}"`)) {
      assert.equal((text.match(/id="contact"/g) ?? []).length, 1, `${file}: #contact without exactly one card`);
    }
  }
  assert.ok(documents > 250, `only ${documents} built documents`);
});
