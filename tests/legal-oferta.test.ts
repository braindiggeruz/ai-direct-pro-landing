// The public offer of the AI pack and the privacy policies (paid-chat plan
// WP-18, decisions L3, L4, L13, L16; map 05 §3.3 a–g):
//   - /ru/oferta/ and /uz/oferta/ are ordinary indexable legal pages, linked
//     from the pricing page and the policies, never from a footer or a
//     protected page;
//   - their edition and URLs are the deployed GPT_BILLING_TERMS_*;
//   - every number they state is read from the code or the deployed config
//     it describes, so the offer cannot drift from what is sold;
//   - the seller's requisites come from one file, and a page that shows them
//     does not build while they are incomplete (L13);
//   - the deploy-time live gate (scripts/release/live-gate.ts) refuses live
//     billing without the offers, the requisites, the lawyer's approval, the
//     fiscal settings and the live providers' secrets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PAID_MESSAGES, PRICE_TIYIN, termsUrl } from '../functions/lib/gpt-chat/billing-config';
import { TELEMETRY_RETENTION_DAYS } from '../functions/lib/gpt-chat/billing-maintenance-store';
import { resolveConfig } from '../functions/lib/gpt-chat/config';
import { includedVat, PACK_RECEIPT_NAME } from '../functions/lib/gpt-chat/fiscal-config';
import { retentionDays } from '../functions/lib/gpt-chat/retention-store';
import { MAX_CONCURRENT_TURNS, PACK_DAILY_LIMIT } from '../functions/lib/gpt-chat/turn-store';
import { resolveTelegramConfig } from '../functions/lib/telegram/config';
import type { Env } from '../functions/_types';
import { canonicalCommit, productionVariableNames, type PagesProject } from '../scripts/release/pages-production';
import { RUNTIME_CONFIG_KEYS } from '../functions/lib/runtime-config';
import {
  BILLING_SETTINGS,
  committedRuntimeConfig,
  LIVE_SECRETS,
  liveGate,
  loadLiveGateInput,
  type LiveGateInput,
} from '../scripts/release/live-gate';
import { LEGAL_ENTITY, legalEntityIssues, renderRequisites, renderTermsEdition, type LegalEntity } from '../scripts/legal-entity';
import { BASELINE, PROTECTED_PATHS } from '../scripts/seo-protection';
import { collectOutgoingLinks } from '../src/shared/audit';
import { STUDIO_EMAIL, STUDIO_PHONE_DISPLAY } from '../src/shared/studio-contact';
import { strings } from '../src/gpt-chat/i18n';
import { accountStrings } from '../src/gpt-chat/account-strings';
import type { Locale, Page } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const page = (file: string) => JSON.parse(read(`content/pages/${file}.json`)) as Page;
const LOCALES: Locale[] = ['ru', 'uz'];
const offers = { ru: page('ru/oferta'), uz: page('uz/oferta') };
const policies = { ru: page('ru/politika-konfidentsialnosti'), uz: page('uz/maxfiylik-siyosati') };
const config = committedRuntimeConfig(read('wrangler.toml'));
/** The nested [vars.GPTBOT_RUNTIME_CONFIG] table, the other copy of the config. */
const nested = Object.fromEntries([...read('wrangler.toml').split('[vars.GPTBOT_RUNTIME_CONFIG]')[1]
  .matchAll(/^([A-Z][A-Z0-9_]*)\s*=\s*"([^"]*)"\s*$/gmu)].map((m) => [m[1], m[2]]));
const deployed = config as unknown as Env;
/** Visible text of a page: what prerender renders from the JSON. */
const text = (doc: Page) => JSON.stringify([doc.h1, doc.title, doc.description, doc.heroSubtitle, doc.bodyBlocks, doc.faq]);
/** The pages scripts/generate-robots.ts lists in _redirects as 404. */
const answeredWith404 = (doc: Pick<Page, 'status' | 'robotsIndex'>) =>
  doc.status === 'draft' || doc.status === 'noindex' || doc.robotsIndex === false;
/** 2 000 000 tiyin → "20 000"; 214 286 tiyin → "2 142,86". */
const sum = (tiyin: number) => {
  const whole = String(Math.floor(tiyin / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return tiyin % 100 ? `${whole},${String(tiyin % 100).padStart(2, '0')}` : whole;
};

test('(a) both offers are published, indexable legal pages with a reciprocal hreflang pair, x-default Uzbek', () => {
  for (const locale of LOCALES) {
    const offer = offers[locale];
    assert.equal(offer.status, 'published', locale);
    assert.equal(offer.robotsIndex, true, locale);
    assert.equal(offer.robotsFollow, true, locale);
    assert.equal(offer.pageType, 'legal', locale);
    assert.equal(offer.url, `/${locale}/oferta/`);
    assert.equal(offer.canonical, `https://gptbot.uz/${locale}/oferta/`);
    assert.equal(offer.hreflangRu, '/ru/oferta/');
    assert.equal(offer.hreflangUz, '/uz/oferta/');
    assert.equal((offer as Page & { hreflangXDefault?: string }).hreflangXDefault, '/uz/oferta/');
    // generate-robots.ts answers 404 for draft, noindex and robotsIndex:false pages.
    assert.equal(answeredWith404(offer), false, locale);
    // No Offer, FAQPage or review schema for a legal text.
    assert.deepEqual(offer.schemaTypes, ['Organization', 'WebSite', 'BreadcrumbList']);
    assert.deepEqual(offer.faq, []);
    assert.equal(offer.ctaPrimaryHref, undefined, 'no sales CTA or trust chips on the offer');
  }
});

test('(b, c) the edition and the URLs of the offers are the deployed GPT_BILLING_TERMS_*', () => {
  assert.equal(config.GPT_BILLING_TERMS_VERSION, 'ai-paket-2026-10-v1');
  assert.equal(nested.GPT_BILLING_TERMS_VERSION, config.GPT_BILLING_TERMS_VERSION);
  for (const locale of LOCALES) {
    assert.equal(offers[locale].termsVersion, config.GPT_BILLING_TERMS_VERSION, locale);
    const setting = locale === 'ru' ? 'GPT_BILLING_TERMS_RU' : 'GPT_BILLING_TERMS_UZ';
    assert.equal(config[setting], `https://gptbot.uz${offers[locale].url}`);
    assert.equal(nested[setting], config[setting]);
    assert.equal(termsUrl(config[setting]), config[setting], 'the billing code accepts the URL');
  }
  // One edition, one day it took effect: the text, the edition and the date change together.
  assert.equal(offers.ru.lastReviewedAt, offers.uz.lastReviewedAt);
  // The lawyer's approval (docs/paid-chat/OFFER-RU.md): none yet, or one date in both copies of
  // GPT_BILLING_TERMS_APPROVED_AT and on both offers, with the policies reviewed too; never half
  // recorded. Recording it as the runbook says keeps this test green.
  const approvedAt = config.GPT_BILLING_TERMS_APPROVED_AT;
  assert.equal(nested.GPT_BILLING_TERMS_APPROVED_AT, approvedAt);
  for (const locale of LOCALES) assert.equal(offers[locale].legalReviewedAt ?? '', approvedAt, locale);
  if (approvedAt) {
    for (const doc of Object.values(policies)) assert.match(doc.legalReviewedAt ?? '', /^\d{4}-\d{2}-\d{2}$/, doc.url);
  }
});

test('(d) every number the offers state is the number the code and the deployed config sell', () => {
  const cfg = resolveConfig(deployed);
  const vat = Number(config.GPT_FISCAL_VAT_PERCENT);
  const price = sum(PRICE_TIYIN);
  const vatSum = sum(includedVat(PRICE_TIYIN, vat));
  assert.equal(price, '20 000');
  assert.equal(vatSum, '2 142,86');
  const ru = text(offers.ru);
  const uz = text(offers.uz);
  assert.ok(ru.includes(`Цена — ${price} сум, в том числе НДС ${vat} % — ${vatSum} сум`));
  assert.ok(uz.includes(`Narxi — ${price} so‘m, shu jumladan QQS ${vat} % — ${vatSum} so‘m`));
  for (const [locale, body] of [['ru', ru], ['uz', uz]] as const) {
    for (const [, amount] of body.matchAll(/(\d{1,3}(?: \d{3})*(?:,\d{2})?) (?:сум|so‘m)/g)) {
      assert.ok(amount === price || amount === vatSum, `${locale}: ${amount}`);
    }
    // The pack is named as on the receipt.
    assert.ok(body.includes(`«${PACK_RECEIPT_NAME}»`), locale);
  }
  assert.ok(ru.includes(`до ${PAID_MESSAGES} ответов`));
  assert.ok(uz.includes(`${PAID_MESSAGES} tagacha javob`));
  assert.ok(ru.includes(`не больше ${PACK_DAILY_LIMIT} ответов в сутки`));
  assert.ok(uz.includes(`bir sutkada ${PACK_DAILY_LIMIT} tadan ortiq javob yechilmaydi`));
  assert.ok(ru.includes(`не больше ${MAX_CONCURRENT_TURNS} ответов`));
  assert.ok(uz.includes(`${MAX_CONCURRENT_TURNS} tadan ortiq javob tayyorlanmaydi`));
  // Decision L4: a stop is charged only past GPT_STOP_CHARGE_MIN_CHARS.
  assert.ok(cfg.stopChargeMinChars > 0);
  assert.ok(ru.includes(`не меньше ${cfg.stopChargeMinChars} символов`));
  assert.ok(uz.includes(`kamida ${cfg.stopChargeMinChars} ta belgi`));
  // The free tier the deployed config gives.
  assert.ok(ru.includes(`до ${cfg.freeDailyLimit} сообщений в сутки и ${cfg.freeHourlyLimit} в час`));
  assert.ok(uz.includes(`sutkasiga ${cfg.freeDailyLimit} tagacha va soatiga ${cfg.freeHourlyLimit} tagacha`));
  // Decision L3: the pack has no hourly cap.
  assert.doesNotMatch(ru, /ответов в час|20 в час/);
  assert.doesNotMatch(uz, /soatiga \d+ tagacha javob/);
  // The full refund the code makes (it refunds whole orders only).
  assert.ok(ru.includes(`Возврат делается в полной сумме — ${price} сум`));
  assert.ok(uz.includes(`Pul to‘liq — ${price} so‘m`));
  // The refund request is answered within a stated number of working days, in both languages alike.
  const days = /не позднее (\d+) рабочих дней/.exec(ru)?.[1];
  assert.ok(days);
  assert.ok(uz.includes(`${days} ish kunidan kechiktirmay`));
  // The Paketim panel promises the same once a refund is requested (WP-17 left it to the offer).
  assert.ok(accountStrings('ru').refundPending.includes(`в течение ${days} рабочих дней`));
  assert.ok(accountStrings('uz').refundPending.includes(`${days} ish kuni ichida`));
});

test('(e) the product is «AI-пакет» / «AI paket»: no GPT, Plus, Pro, obuna or subscription in its name', () => {
  assert.doesNotMatch(PACK_RECEIPT_NAME, /GPT|Plus|\bPro\b|obuna|подписк/i);
  assert.match(offers.ru.h1, /AI-пакет/);
  assert.match(offers.uz.h1, /AI paket/);
  for (const doc of [...Object.values(offers), ...Object.values(policies)]) {
    assert.doesNotMatch(text(doc), /\bPlus\b|\bPro\b|obuna|подписк|Day Pass/i, doc.url);
    assert.doesNotMatch(JSON.stringify(doc), /t\.me\/|XGame_changerx/i, `${doc.url}: no personal Telegram (L14)`);
  }
  // The offer states what GPTBot.uz is not.
  assert.match(text(offers.ru), /не является продуктом OpenAI и не даёт доступа к ChatGPT/);
  assert.match(text(offers.uz), /OpenAI mahsuloti emas va ChatGPT’ga kirish imkonini bermaydi/);
});

test('(f) no footer, chat navigation or protected page links the offer', () => {
  for (const file of ['scripts/prerender.ts', 'scripts/prerender-blog.ts', 'scripts/prerender-home.ts']) {
    for (const footer of read(file).match(/<footer\b[\s\S]*?<\/footer>/g) ?? []) assert.doesNotMatch(footer, /oferta/, file);
  }
  for (const file of ['scripts/gpt-chat-nav.ts', 'scripts/contact-card.ts', 'src/components/Footer.tsx']) {
    assert.doesNotMatch(read(file), /oferta/, file);
  }
  const baseline = JSON.parse(read(BASELINE)) as { pages: Array<{ pathname: string; contract: { internalLinks: string[] } }> };
  assert.equal(baseline.pages.length, PROTECTED_PATHS.length);
  for (const protectedPage of baseline.pages) {
    assert.ok(!protectedPage.contract.internalLinks.some((href) => href.includes('/oferta/')), protectedPage.pathname);
  }
});

test('(g) the offers are linked from the pricing page and from the policy of their language', () => {
  const targets = (doc: Page) => new Set(collectOutgoingLinks(doc).map((link) => link.target));
  assert.ok(targets(page('ru/tarify-ai-chat')).has('/ru/oferta/'));
  assert.ok(targets(policies.ru).has('/ru/oferta/'));
  // The Uzbek policy is the one content link to the Uzbek offer: there is no Uzbek pricing page.
  assert.ok(targets(policies.uz).has('/uz/oferta/'));
  assert.ok(targets(offers.ru).has('/ru/politika-konfidentsialnosti/'));
  assert.ok(targets(offers.uz).has('/uz/maxfiylik-siyosati/'));
  // The chat's privacy link (composer, sign-in and lead consent) is the policy of its locale.
  assert.equal(strings('ru').privacyHref, policies.ru.url);
  assert.equal(strings('uz').privacyHref, policies.uz.url);
});

test('L13: the offers are published with complete requisites, and a page naming the seller refuses to build without them', () => {
  // Prerender throws on a page with `requisites` while they are incomplete (renderRequisites
  // below), so the offers and the policies are published only with all of them.
  assert.deepEqual(legalEntityIssues(LEGAL_ENTITY), [], 'content/global/legal-entity.json');
  for (const locale of LOCALES) {
    assert.equal(offers[locale].status, 'published');
    assert.equal(offers[locale].requisites, 'seller');
    assert.equal(policies[locale].requisites, 'operator');
  }
  // The requisites of the owner's business.json (owner decisions of 2026-09-30 and 2026-10-01).
  assert.equal(LEGAL_ENTITY.stir, config.GPT_FISCAL_TIN, 'the receipts carry the seller\'s TIN');
  assert.equal(LEGAL_ENTITY.mfo, '01095');
  assert.equal(LEGAL_ENTITY.bank, 'Asia Alliance Bank');
  assert.match(LEGAL_ENTITY.shortName.ru, /FREEDOM IS HEAVEN/);
  // Every malformed field is named, never its value.
  const broken = { ...LEGAL_ENTITY, account: '2020800010567083500', mfo: '', address: { ru: 'x', uz: '' } } as LegalEntity;
  assert.deepEqual(legalEntityIssues(broken), ['address.uz', 'account', 'mfo']);
  assert.deepEqual(legalEntityIssues(LEGAL_ENTITY, { email: 'nobody', phone: '+99850' }), ['site.email', 'site.phone']);
  assert.throws(() => renderRequisites(offers.ru, broken), /legal-entity\.json is incomplete \(address\.uz, account, mfo\)/);
});

test('the requisites block and the edition line render from the one source', () => {
  for (const locale of LOCALES) {
    const html = renderRequisites(offers[locale]);
    assert.match(html, locale === 'ru' ? /Реквизиты продавца/ : /Sotuvchi rekvizitlari/);
    for (const value of [LEGAL_ENTITY.name[locale], LEGAL_ENTITY.stir, LEGAL_ENTITY.address[locale], LEGAL_ENTITY.bank,
      LEGAL_ENTITY.account, LEGAL_ENTITY.mfo, LEGAL_ENTITY.director[locale], STUDIO_EMAIL, STUDIO_PHONE_DISPLAY]) {
      assert.ok(html.includes(value.replace(/"/g, '&quot;')), `${locale}: ${value}`);
    }
    assert.match(renderRequisites(policies[locale]), locale === 'ru' ? /Реквизиты оператора/ : /Operator rekvizitlari/);
    const edition = renderTermsEdition(offers[locale]);
    assert.ok(edition.includes(`data-terms-version="${config.GPT_BILLING_TERMS_VERSION}"`));
    assert.ok(edition.includes('<time datetime="2026-10-03">03.10.2026</time>'));
  }
  assert.equal(renderRequisites(page('ru/tarify-ai-chat')), '', 'only pages that ask for it');
  assert.equal(renderTermsEdition(policies.ru), '');
  assert.throws(() => renderTermsEdition({ ...offers.ru, lastReviewedAt: undefined }), /needs lastReviewedAt/);
  assert.throws(() => renderTermsEdition({ ...offers.ru, termsVersion: 'two words' }), /malformed termsVersion/);
});

test('the privacy policies describe the chat, its recipients, payment, sign-in and retention as the code does', () => {
  const ru = text(policies.ru);
  const uz = text(policies.uz);
  for (const recipient of ['Cloudflare', 'OpenRouter', 'Z.ai', 'Click', 'Uzum Bank', 'Telegram', 'Google Analytics']) {
    assert.ok(ru.includes(recipient) && uz.includes(recipient), recipient);
  }
  assert.ok(ru.includes('Яндекс Метрика') && uz.includes('Yandex Metrika'));
  // The IP is stored only as a salted hash (D7); text-free telemetry for TELEMETRY_RETENTION_DAYS.
  assert.match(ru, /IP-адрес мы не храним/);
  assert.match(uz, /IP-manzilni saqlamaymiz/);
  assert.equal(TELEMETRY_RETENTION_DAYS, 93);
  assert.ok(ru.includes(`хранятся ${TELEMETRY_RETENTION_DAYS} дня`) && ru.includes(`${TELEMETRY_RETENTION_DAYS} дня.`));
  assert.ok(uz.includes(`${TELEMETRY_RETENTION_DAYS} kun saqlanadi`) && uz.includes(`${TELEMETRY_RETENTION_DAYS} kun.`));
  // The bot keeps texts and voice messages for TELEGRAM_ITEM_TTL_HOURS.
  const hours = resolveTelegramConfig(deployed).itemTtlMs / 3_600_000;
  assert.ok(ru.includes(`голосовые сообщения — ${hours} часа`) && uz.includes(`${hours} soat saqlaydi`));
  assert.ok(ru.includes('/delete_me') && uz.includes('/delete_me'));
  // Conversations: until deleted on request while GPT_MESSAGES_RETENTION_DAYS is off; the
  // release that switches deletion on changes this text (retention-store.ts).
  const days = retentionDays(deployed);
  if (days === null) {
    assert.ok(ru.includes('Переписка AI-чата — пока вы не попросите её удалить.'));
    assert.ok(uz.includes('AI chat yozishmalari — ularni o‘chirishni so‘ramaguningizcha.'));
  } else {
    assert.ok(ru.includes(`не дольше ${days} дней`) && uz.includes(`${days} kundan ortiq emas`));
  }
  // The funnel counter of the pack window (WP-17) and the hidden Webvisor.
  assert.match(ru, /случайный номер вкладки/);
  assert.match(uz, /tasodifiy varaq raqamini/);
  assert.match(ru, /Вебвизор Яндекс Метрики не записывает окно чата/);
  // Card data never reaches the site; sign-in keeps a hash, not the Telegram id.
  assert.match(ru, /к нам они не попадают/);
  assert.match(ru, /не ваш Telegram ID, а его хеш/);
  assert.match(uz, /Telegram ID’ingizni emas, uning maxfiy kalit bilan olingan xeshini/);
  // The contact is the studio's (site.json), not a personal account.
  for (const doc of Object.values(policies)) {
    assert.ok(JSON.stringify(doc).includes(STUDIO_EMAIL), doc.url);
    assert.equal(doc.ctaPrimaryHref, '#contact');
    assert.equal(doc.lastReviewedAt, '2026-10-03');
  }
  // Correct Uzbek apostrophes only (o‘, g‘ with U+2018; ’ for the tutuq belgisi).
  for (const doc of [policies.uz, offers.uz]) assert.doesNotMatch(JSON.stringify(doc), /[a-zA-Z]'[a-zA-Z]/, doc.url);
  assert.doesNotMatch(uz, /\bmalumot|\bboglan|\bozingiz/, 'the Uzbek policy lost its apostrophes before');
});

// ---------------------------------------------------------------------------
// The deploy-time live gate.
// ---------------------------------------------------------------------------

const DAY = '2026-11-02';
const NOW = Date.parse('2026-11-10T00:00:00Z');

/** A build of the committed content that would be allowed to go live with Click. */
function liveFixture(change: Partial<LiveGateInput> = {}): LiveGateInput {
  const builtPage = (locale: Locale) => `<meta name="robots" content="index, follow, max-image-preview:large" />`
    + renderTermsEdition(offers[locale]) + renderRequisites(offers[locale]);
  const files: Record<string, string> = {
    'ru/oferta/index.html': builtPage('ru'),
    'uz/oferta/index.html': builtPage('uz'),
    'sitemap.xml': '<loc>https://gptbot.uz/ru/oferta/</loc><loc>https://gptbot.uz/uz/oferta/</loc>',
  };
  return {
    config: { ...config, GPT_BILLING_LIVE_READY: 'true', GPT_BILLING_MODE_CLICK: 'live', GPT_BILLING_TERMS_APPROVED_AT: DAY },
    d1Bound: true,
    offers: { ru: { ...offers.ru, legalReviewedAt: DAY }, uz: { ...offers.uz, legalReviewedAt: DAY } },
    policies: { ru: { ...policies.ru, legalReviewedAt: DAY }, uz: { ...policies.uz, legalReviewedAt: DAY } },
    entity: LEGAL_ENTITY,
    built: (file) => files[file] ?? null,
    production: new Set([...LIVE_SECRETS.filter((name) => !name.startsWith('UZUM_')), 'GPTBOT_RUNTIME_CONFIG_JSON']),
    now: NOW,
    ...change,
  };
}

test('live gate: the committed build passes, the offline check defers nothing, live is off', () => {
  const report = liveGate(loadLiveGateInput(ROOT, path.join(ROOT, 'dist'), null));
  assert.deepEqual(report, { live: false, providers: [], issues: [], deferred: [] });
});

test('live gate: a complete build with every secret in production may go live', () => {
  assert.deepEqual(liveGate(liveFixture()), { live: true, providers: ['click'], issues: [], deferred: [] });
  // Offline, the same build passes and names the secrets that check-production confirms.
  const offline = liveGate(liveFixture({ production: null }));
  assert.deepEqual(offline.issues, []);
  assert.deepEqual(offline.deferred, [
    'GPT_BILLING_MAINTENANCE_SECRET', 'GPT_CLICK_CREDENTIALS_JSON', 'GPT_HASH_SALT', 'GPT_IDENTITY_SECRET',
    'GPT_NOTIFY_BOT_TOKEN', 'GPT_NOTIFY_CHAT_ID', 'TELEGRAM_ASSISTANT_BOT_TOKEN', 'TELEGRAM_ASSISTANT_WEBHOOK_SECRET',
  ]);
});

test('live gate: each missing piece refuses live by name, and never prints a value', () => {
  const live = liveFixture();
  const cases: Array<[string, Partial<LiveGateInput>, RegExp]> = [
    ['no approval', { config: { ...live.config, GPT_BILLING_TERMS_APPROVED_AT: '' } }, /GPT_BILLING_TERMS_APPROVED_AT/],
    ['approval of another text', { config: { ...live.config, GPT_BILLING_TERMS_APPROVED_AT: '2026-11-03' } }, /legalReviewedAt differs from GPT_BILLING_TERMS_APPROVED_AT/],
    ['offer not reviewed', { offers: { ...live.offers, uz: offers.uz } }, /\/uz\/oferta\/: legalReviewedAt/],
    ['policy not reviewed', { policies: { ...live.policies, ru: policies.ru } }, /politika-konfidentsialnosti\/: legalReviewedAt/],
    ['offer draft', { offers: { ...live.offers, ru: { ...offers.ru, legalReviewedAt: DAY, status: 'draft' } } }, /\/ru\/oferta\/: not published/],
    ['edition changed in config only', { config: { ...live.config, GPT_BILLING_TERMS_VERSION: 'ai-paket-2026-11-v2' } }, /termsVersion differs/],
    ['terms URL elsewhere', { config: { ...live.config, GPT_BILLING_TERMS_UZ: 'https://gptbot.uz/uz/terms/' } }, /GPT_BILLING_TERMS_UZ is not https:\/\/gptbot\.uz\/uz\/oferta\//],
    ['offer not built', { built: (file) => file === 'ru/oferta/index.html' ? null : live.built(file) }, /dist\/ru\/oferta\/index\.html is missing/],
    ['old build without the edition', { built: (file) => file === 'uz/oferta/index.html' ? '<meta name="robots" content="index, follow" />' : live.built(file) }, /dist\/uz\/oferta\/: the built page does not state/],
    ['offer missing from the sitemap', { built: (file) => file === 'sitemap.xml' ? '' : live.built(file) }, /sitemap\.xml lacks/],
    ['incomplete requisites', { entity: { ...LEGAL_ENTITY, account: '' } }, /legal-entity\.json: account/],
    ['receipt TIN of another company', { config: { ...live.config, GPT_FISCAL_TIN: '123456789' } }, /GPT_FISCAL_TIN is not the seller's STIR/],
    ['no fiscal code', { config: { ...live.config, GPT_FISCAL_IKPU: '' } }, /click: GPT_FISCAL_IKPU/],
    ['Click secret not in production', { production: new Set(LIVE_SECRETS.filter((name) => name !== 'GPT_CLICK_CREDENTIALS_JSON')) }, /click: Pages secret GPT_CLICK_CREDENTIALS_JSON is not set/],
    ['no salt in production', { production: new Set(LIVE_SECRETS.filter((name) => name !== 'GPT_HASH_SALT')) }, /Pages secret GPT_HASH_SALT is not set/],
    ['Uzum live without its API', { config: { ...live.config, GPT_BILLING_MODE_CLICK: '', GPT_BILLING_MODE_UZUM: 'live' } }, /uzum: UZUM_API/],
    // liveReadiness() does not ask Uzum for the TIN; the gate still requires the seller's.
    ['Uzum live without the receipt TIN', { config: { ...live.config, GPT_BILLING_MODE_CLICK: '', GPT_BILLING_MODE_UZUM: 'live', UZUM_API: 'merchant', GPT_FISCAL_TIN: '' } }, /GPT_FISCAL_TIN is not the seller's STIR/],
  ];
  for (const [name, change, expected] of cases) {
    const report = liveGate({ ...live, ...change });
    assert.ok(report.issues.some((issue) => expected.test(issue)), `${name}: ${JSON.stringify(report.issues)}`);
    assert.doesNotMatch(JSON.stringify(report), /x{16}|stand-in|20208000105670835001/, `${name}: a value leaked`);
  }
});

test('live gate: switching live off always ships, and no Pages variable may shadow a billing setting', () => {
  // The stop switch: nothing is required while GPT_BILLING_LIVE_READY is not "true".
  const off = liveFixture({
    config: { ...config, GPT_BILLING_LIVE_READY: 'false', GPT_BILLING_MODE_CLICK: 'live' },
    offers: { ru: null, uz: null }, entity: {}, built: () => null, production: new Set(),
  });
  assert.deepEqual(liveGate(off).issues, []);
  // The other stop (the R-table rollback): the switch stays "true", the provider's mode is
  // cleared or back to test. Nothing sells live, so nothing is required either.
  for (const mode of ['', 'test']) {
    const stopped = { ...off, config: { ...off.config, GPT_BILLING_LIVE_READY: 'true', GPT_BILLING_MODE_CLICK: mode } };
    assert.deepEqual(liveGate(stopped), { live: false, providers: [], issues: [], deferred: [] }, mode || 'cleared');
  }
  // A secret named like a billing setting overrides the reviewed JSON at runtime.
  for (const name of ['GPT_BILLING_LIVE_READY', 'GPT_BILLING_MODE_CLICK', 'GPT_PAYMENT_PROVIDERS', 'GPT_FISCAL_TIN', 'UZUM_API']) {
    const report = liveGate({ ...off, production: new Set([name]) });
    assert.deepEqual(report.issues, [`Pages variable ${name} overrides the reviewed GPTBOT_RUNTIME_CONFIG_JSON: remove it`]);
  }
  assert.deepEqual(liveGate({ ...off, production: new Set(['GPT_HASH_SALT', 'GPTBOT_RUNTIME_CONFIG_JSON']) }).issues, []);
  // The guarded names are public settings of the packed config, and no secret is among them.
  for (const name of BILLING_SETTINGS) {
    assert.ok((RUNTIME_CONFIG_KEYS as readonly string[]).includes(name), name);
    assert.ok(!LIVE_SECRETS.includes(name), name);
  }
});

test('live gate: every release mode runs it; check-production and deploy with the production names', () => {
  const release = read('scripts/release/pages-production.ts');
  const main = release.slice(release.indexOf('async function main()'));
  // stamp, check, check-production and deploy all pass through main() before anything else.
  assert.match(main, /assertLiveGate\(loadLiveGateInput\(ROOT, dist, null\)\);\s*assertCleanRuntime\(ROOT\);/);
  const check = release.slice(release.indexOf('async function checkProduction('), release.indexOf('function describeLock('));
  assert.match(check, /assertLiveGate\(loadLiveGateInput\(root, dist, productionVariableNames\(project\)\)\);/);
  assert.match(release, /async function deploy\([^)]*\)[\s\S]*?await checkProduction\(root, dist\);[\s\S]*?'pages', 'deploy'/, 'deploy checks before the upload');
  assert.match(main, /checkProduction\(ROOT, dist\)/, 'check-production runs the online gate');
});

test('live gate: production names come from the Pages project, never values', () => {
  const project: PagesProject = {
    success: true,
    result: {
      canonical_deployment: { environment: 'production', latest_stage: { status: 'success' }, deployment_trigger: { metadata: { commit_hash: 'a'.repeat(40) } } },
      deployment_configs: { production: { env_vars: { GPT_HASH_SALT: { type: 'secret_text' }, GPTBOT_RUNTIME_CONFIG_JSON: { type: 'plain_text', value: '{}' } } } },
    },
  };
  assert.deepEqual([...productionVariableNames(project)].sort(), ['GPTBOT_RUNTIME_CONFIG_JSON', 'GPT_HASH_SALT']);
  assert.equal(canonicalCommit(project), 'a'.repeat(40));
  assert.deepEqual([...productionVariableNames({ success: true, result: {} })], []);
  assert.throws(() => canonicalCommit({ success: false }), /No confirmed successful production deployment/);
});

const built = fs.existsSync(path.join(ROOT, 'dist/ru/oferta/index.html'));
test('built site: the offers carry their edition and requisites, are indexable and in the sitemap', { skip: !built && 'no dist/ build present' }, () => {
  const sitemap = read('dist/sitemap.xml');
  const redirects = read('dist/_redirects');
  for (const locale of LOCALES) {
    const html = read(`dist/${locale}/oferta/index.html`);
    assert.ok(html.includes(`data-terms-version="${config.GPT_BILLING_TERMS_VERSION}"`), locale);
    assert.match(html, /<meta name="robots" content="index, follow/);
    assert.ok(html.includes(`<link rel="canonical" href="https://gptbot.uz/${locale}/oferta/" />`));
    assert.ok(html.includes('<link rel="alternate" hreflang="x-default" href="https://gptbot.uz/uz/oferta/" />'));
    assert.ok(html.includes(LEGAL_ENTITY.account) && html.includes(LEGAL_ENTITY.stir), locale);
    assert.doesNotMatch(html, /"@type":"(?:Offer|FAQPage)"/);
    assert.ok(sitemap.includes(`<loc>https://gptbot.uz/${locale}/oferta/</loc>`), locale);
    assert.doesNotMatch(redirects, new RegExp(`^/${locale}/oferta/\\s`, 'm'), 'not answered with a 404');
  }
  for (const file of ['dist/ru/politika-konfidentsialnosti/index.html', 'dist/uz/maxfiylik-siyosati/index.html']) {
    assert.ok(read(file).includes('data-testid="legal-requisites"'), file);
  }
  for (const pathname of PROTECTED_PATHS) {
    assert.doesNotMatch(read(path.join('dist', pathname, 'index.html')), /\/oferta\//, pathname);
  }
});
