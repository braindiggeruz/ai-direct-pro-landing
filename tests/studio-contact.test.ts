// How visitors reach the studio (paid-chat plan WP-11, decision L14).
//
// Run: node --import tsx --test tests/studio-contact.test.ts
//
// One setting, content/global/site.json `studioTelegram`, decides whether the
// site offers a Telegram contact at all (src/shared/studio-contact.ts). No work
// account has been named, so it is empty and the owner's personal account is
// gone from every unprotected page: calls to action lead to the page's lead
// form or to the contact card (phone and e-mail), and naming a work account
// later puts Telegram back everywhere with one edit. The surfaces the ten
// protected pages share keep the old link until their one revision (WP-12);
// the guard at the end lists them, so nothing else can bring the link back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { email, phone, studioTelegram, telegram as legacyTelegram } from '../content/global/site.json';
import {
  formatUzPhone,
  STUDIO_EMAIL,
  STUDIO_PHONE,
  STUDIO_PHONE_DISPLAY,
  STUDIO_TELEGRAM_URL,
  studioTelegramUrl,
} from '../src/shared/studio-contact';
import { CONTACT_ANCHOR, linksContactCard, renderContactCard } from '../scripts/contact-card';
import { leadFormServiceFor } from '../scripts/lead-form';
import { PROTECTED_PATHS } from '../scripts/seo-protection';
import { studioTelegramHref } from '../scripts/telegram-cta';
import type { Page } from '../src/shared/types';

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
const PROTECTED = new Set<string>(PROTECTED_PATHS);
/** GPTBot Market is a separate product with its own template and support channel. */
const isMarket = (page: Page) => page.designVariant === 'warm-market-signals';
const UNPROTECTED = PAGES.filter(({ page }) => !PROTECTED.has(page.url) && !isMarket(page));

test('one setting: the studio Telegram is empty or a valid work handle, never the personal account', () => {
  assert.equal(typeof studioTelegram, 'string');
  assert.ok(studioTelegram === '' || studioTelegramUrl(studioTelegram) !== null, `invalid studioTelegram: ${studioTelegram}`);
  assert.equal(STUDIO_TELEGRAM_URL, studioTelegramUrl(studioTelegram));
  assert.doesNotMatch(studioTelegram, PERSONAL, 'the personal account is not a studio contact (L14)');
  assert.equal(STUDIO_TELEGRAM_URL, null, 'no work Telegram has been named yet');
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

test('no unprotected page names or links the personal account, and no contact button promises Telegram', () => {
  // A button to the studio leads to the form or the card, neither of which is
  // Telegram while none is configured. Buttons to the bot may say Telegram.
  const studio = (href?: string) => href === '#lead-form' || href === CONTACT_ANCHOR;
  const viaTelegram = / в Telegram$|Telegram[’']?da |Telegramda /;
  for (const { file, page } of UNPROTECTED) {
    assert.doesNotMatch(read(file), PERSONAL, file);
    for (const block of page.bodyBlocks || []) {
      if (block.type === 'cta' && studio(block.href)) assert.doesNotMatch(block.text || '', viaTelegram, `${file}: ${block.text}`);
    }
    if (studio(page.ctaPrimaryHref)) assert.doesNotMatch(page.ctaPrimaryLabel || '', viaTelegram, `${file}: ${page.ctaPrimaryLabel}`);
  }
});

test('no unprotected page tells a visitor to write to the studio in Telegram while none is configured', () => {
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
  for (const { file } of UNPROTECTED) assert.doesNotMatch(read(file), writeToStudio, file);
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
  for (const { file, page } of UNPROTECTED) {
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
  // same prefilled draft the rest of the site uses.
  const withWork = renderContactCard(ru, WORK);
  const href = studioTelegramHref('ru', ru.breadcrumbLabel || ru.h1, ru.url, WORK)!;
  assert.ok(withWork.includes(`href="${href.replace(/&/g, '&amp;')}"`));
  assert.ok(withWork.includes('target="_blank" rel="nofollow noopener noreferrer"'));
  assert.ok(withWork.includes('Написать в Telegram'));
  assert.ok(renderContactCard(uz, WORK).includes('Telegramda yozish'));
});

test('the calculator and the chat take the contact from the one module', () => {
  const calculator = read('src/calculator/CalculatorApp.tsx');
  assert.match(calculator, /from '\.\.\/shared\/studio-contact'/);
  assert.doesNotMatch(calculator, PERSONAL);
  assert.match(read('src/gpt-chat/contact.ts'), /from '\.\.\/shared\/studio-contact'/);
  for (const file of ['scripts/lead-form.ts', 'scripts/contact-card.ts', 'scripts/telegram-cta.ts', 'scripts/prerender.ts', 'scripts/generate-llm-markdown.ts']) {
    assert.match(read(file), /from '\.\.\/src\/shared\/studio-contact'/, file);
  }
});

// Where the personal handle may still appear, and why. Anything else in
// src/, scripts/, functions/ or public/ fails here.
const LEGACY = new Map<string, string>([
  // The ten protected pages share these; their one revision moves them (WP-12).
  ['src/components/Footer.tsx', 'homepage footer (React)'],
  ['src/lib/cta.ts', 'homepage call to action (React)'],
  ['scripts/prerender-home.ts', 'homepage shell fallback for defaultCTA'],
  ['scripts/analytics-snippet.ts', 'head click handler of every page (telegram_cta_studio)'],
  ['scripts/analytics-metrika.ts', 'head Metrika goal of every page (telegram_cta_studio)'],
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

test('the personal handle survives only where a later revision or another product owns it', () => {
  const files = [
    ...listFiles('src', /\.(tsx?|json)$/),
    ...listFiles('scripts', /\.(tsx?|json|mjs)$/),
    ...listFiles('functions', /\.ts$/),
    ...listFiles('public', /\.(txt|html|json)$/),
  ];
  const found = files.filter((file) => PERSONAL.test(read(file)));
  assert.deepEqual(found.filter((file) => !LEGACY.has(file)), [], 'a new place links the personal account');
  for (const file of LEGACY.keys()) assert.ok(found.includes(file), `${file} no longer needs its exemption — remove it`);
  // site.json keeps the legacy value for those shared surfaces only.
  assert.match(legacyTelegram, PERSONAL);
});
