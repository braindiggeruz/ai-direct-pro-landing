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
//     fiscal settings and the live providers' secrets;
//   - a paid pack is not refundable (owner decision of 2026-10-03, WP-25),
//     with two narrow exceptions, and the pack window and the pricing page say
//     the same before anyone pays;
//   - edition ai-paket-2026-10-v3 (owner's approval of 2026-10-07): the guest
//     account of guest checkout and Payme, named in both offers and both
//     policies, as the Payme live switch and GPT_GUEST_CHECKOUT require;
//   - edition ai-paket-2026-10-v5 (owner's order of 2026-10-07, one tap):
//     the offer is accepted by pressing the pay button and paying, not by
//     ticking a box; the text of sections 7 and 11 says so, the rest is v3.
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
import { ANALYSIS_DEFAULT_MODEL } from '../functions/lib/telegram/analysis';
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
import { GUEST_SESSION_MS } from '../functions/lib/gpt-chat/identity-store';
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
// Clauses 1-13 describe chat; Studio has its own prices and refund rules in 14-18.
const chatText = (doc: Page) => {
  const cut = doc.bodyBlocks?.findIndex(block => block.type === 'h2' && /^14\. /.test(block.text ?? '')) ?? -1;
  return text(cut < 0 ? doc : {...doc, bodyBlocks: doc.bodyBlocks!.slice(0,cut)});
};
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
  // ai-paket-2026-10-v5: acceptance by pressing the pay button (one tap). v3 added
  // the guest account and Payme; v2 (WP-25) knew only the Telegram account, Click
  // and Uzum Bank; v1, published with R4, still promised refunds.
  assert.equal(config.GPT_BILLING_TERMS_VERSION, 'ai-paket-2026-10-v5');
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
  // The lawyer's approval of the offer (docs/paid-chat/OFFER-RU.md): none, or one date in both
  // copies of GPT_BILLING_TERMS_APPROVED_AT and on both offers; never half recorded. The
  // policies carry their own review date: the live gate demands it at deploy.
  const approvedAt = config.GPT_BILLING_TERMS_APPROVED_AT;
  assert.equal(nested.GPT_BILLING_TERMS_APPROVED_AT, approvedAt);
  for (const locale of LOCALES) assert.equal(offers[locale].legalReviewedAt ?? '', approvedAt, locale);
  assert.match(approvedAt, /^(\d{4}-\d{2}-\d{2})?$/);
  // v3 and the policies of the same day are the owner's approval of 2026-10-07, given without
  // a lawyer's review (docs/paid-chat/OFFER-RU.md); v2 was the owner's decision of 2026-10-03
  // on the refund clause, after the lawyer approved v1 on 2026-10-01.
  assert.equal(approvedAt, '2026-10-07');
  for (const doc of Object.values(policies)) assert.match(doc.legalReviewedAt ?? '', /^(\d{4}-\d{2}-\d{2})?$/, doc.url);
  for (const doc of Object.values(policies)) assert.equal(doc.legalReviewedAt, '2026-10-07', doc.url);
});

test('(v3) the guest account and Payme: what guest checkout and Payme live sell is what the offers and policies say', () => {
  const definition = (doc: Page, start: string) => {
    const items = doc.bodyBlocks!.flatMap((block) => (block as { items?: string[] }).items ?? []);
    const found = items.filter((item) => item.startsWith(start));
    assert.equal(found.length, 1, `${doc.url}: ${start}`);
    return found[0];
  };
  // The account may be a guest account of the browser; Telegram keeps it on every device;
  // the Seller restores a lost guest pack from the payment data (a restore link, ADMIN-RU.md).
  const ru = definition(offers.ru, 'Аккаунт — ');
  assert.ok(ru.includes('Покупатель может оплатить пакет без входа: тогда пакет привязывается к браузеру, в котором он оплачен (гостевой аккаунт).'));
  assert.ok(ru.includes('После входа через Telegram пакет переносится в аккаунт Telegram и действует на всех устройствах, где выполнен вход.'));
  assert.ok(ru.includes('Продавец по обращению Покупателя с данными платежа (номер платежа или чек) восстанавливает пакет на оставшийся срок.'));
  const uz = definition(offers.uz, 'Akkaunt — ');
  assert.ok(uz.includes('Xaridor paketni kirmasdan to‘lashi mumkin: bu holda paket u to‘langan brauzerga bog‘lanadi (mehmon akkaunti).'));
  assert.ok(uz.includes('Telegram orqali kirgandan so‘ng paket Telegram akkauntiga o‘tkaziladi va kirilgan barcha qurilmalarda ishlaydi.'));
  assert.ok(uz.includes('Sotuvchi Xaridorning to‘lov ma’lumotlari (to‘lov raqami yoki chek) bilan qilgan murojaati asosida paketni qolgan muddatga tiklaydi.'));
  // The defined party is the Seller: no "Исполнитель" / "Ijrochi" from the draft.
  for (const doc of [offers.ru, offers.uz]) assert.doesNotMatch(text(doc), /Исполнител|Ijrochi/, doc.url);
  // Payme is a way to pay in both offers (section 6) and the receipt link waits for the provider.
  assert.ok(definition(offers.ru, 'Пакет оплачивается через ').startsWith('Пакет оплачивается через Click, Payme или Uzum Bank'));
  assert.ok(definition(offers.uz, 'Paket Click').startsWith('Paket Click, Payme yoki Uzum Bank orqali'));
  assert.ok(text(offers.ru).includes('Ссылка на чек появляется в разделе «Мой пакет» AI-чата, когда платёжная система её передаст.'));
  assert.ok(text(offers.uz).includes('To‘lov tizimi chek havolasini uzatgach, u AI chatning «Paketim» bo‘limida paydo bo‘ladi.'));
  // The policies: the guest account in a cookie for up to a year (GUEST_SESSION_MS), the
  // salted IP hash that paces new guests, the move to Telegram, Payme among the recipients.
  assert.equal(GUEST_SESSION_MS, 365 * 86400_000);
  const policyRu = text(policies.ru);
  const policyUz = text(policies.uz);
  assert.ok(policyRu.includes('AI-пакет можно купить без входа: тогда мы создаём гостевой аккаунт и храним его в cookie браузера до года'));
  assert.ok(policyRu.includes('учитываем хеш IP-адреса с секретным ключом (сам адрес не храним)'));
  assert.ok(policyRu.includes('а пакет гостевого аккаунта переносим в аккаунт Telegram'));
  assert.ok(policyUz.includes('AI paketni kirmasdan ham sotib olish mumkin: bu holda biz mehmon akkauntini yaratamiz va uni brauzer cookie’sida bir yilgacha saqlaymiz'));
  assert.ok(policyUz.includes('IP-manzilning maxfiy kalit bilan olingan xeshini hisobga olamiz (manzilning o‘zini saqlamaymiz)'));
  assert.ok(policyUz.includes('mehmon akkauntidagi paket esa Telegram akkauntingizga o‘tkaziladi'));
  assert.ok(policyRu.includes('Click, Payme и Uzum Bank — данные заказа для оплаты, чека и возврата.'));
  assert.ok(policyUz.includes('Click, Payme va Uzum Bank — to‘lov, chek va pulni qaytarish uchun buyurtma ma’lumotlari.'));
  assert.ok(policyRu.includes('Данные карты вы вводите на стороне Click, Payme или Uzum Bank'));
  assert.ok(policyUz.includes('Karta ma’lumotlarini Click, Payme yoki Uzum Bank tomonida kiritasiz'));
  // The switches these texts allow, in both copies of the config: guest checkout on, Payme
  // live (2026-10-07) or back in its sandbox (the one-command rollback, PAYME-RU.md section 7).
  assert.equal(config.GPT_GUEST_CHECKOUT, 'true');
  assert.equal(nested.GPT_GUEST_CHECKOUT, 'true');
  assert.ok(['live', 'test'].includes(config.GPT_BILLING_MODE_PAYME), config.GPT_BILLING_MODE_PAYME);
  assert.equal(nested.GPT_BILLING_MODE_PAYME, config.GPT_BILLING_MODE_PAYME);
});

test('(v4) acceptance by action: the offer is accepted by pressing the pay button and paying, no box to tick', () => {
  const paragraph = (doc: Page, after: string) => {
    const blocks = doc.bodyBlocks as { type: string; text?: string }[];
    const at = blocks.findIndex((block) => block.type === 'h2' && block.text === after);
    assert.ok(at >= 0, `${doc.url}: ${after}`);
    return blocks[at + 1].text ?? '';
  };
  // Section 7 (acceptance) names the pay button, not a box; the edition travels with the order.
  const ru7 = paragraph(offers.ru, '7. Акцепт');
  assert.ok(ru7.startsWith('Покупатель принимает оферту, когда нажимает кнопку «Оплатить» в окне AI-пакета или в карточке лимита чата и оплачивает пакет: под кнопкой написано, что нажатие означает согласие с условиями оферты, и дана ссылка на неё.'), ru7);
  assert.ok(ru7.includes('Вместе с заказом сохраняется редакция оферты, которую он принял.'));
  const uz7 = paragraph(offers.uz, '7. Aksept');
  assert.ok(uz7.startsWith('Xaridor AI paket oynasida yoki chat limiti kartasida «To‘lash» tugmasini bosib, paket uchun to‘laganda ofertani qabul qiladi: tugma ostida bosish oferta shartlariga rozilikni bildirishi yozilgan va ofertaga havola berilgan.'), uz7);
  assert.ok(uz7.includes('Buyurtma bilan birga u qabul qilgan oferta tahriri saqlanadi.'));
  // Section 11 (changes): the next payment shows the current edition's link, asks no box.
  assert.ok(paragraph(offers.ru, '11. Изменение оферты').endsWith('Перед следующей оплатой окно AI-пакета снова показывает ссылку на действующую редакцию.'));
  assert.ok(paragraph(offers.uz, '11. Ofertaga o‘zgartirish kiritish').endsWith('Keyingi to‘lovdan oldin AI paket oynasi amaldagi tahrirga havolani yana ko‘rsatadi.'));
  // Nowhere does either offer still speak of ticking or marking consent.
  for (const doc of [offers.ru, offers.uz]) assert.doesNotMatch(text(doc), /отмеча|галочк|belgilab|снова попросит согласие|yana rozilik so‘raydi/, doc.url);
  // The pack window says the same line under its buttons, with the offer's link, in both languages.
  const ru = strings('ru').premium;
  const uz = strings('uz').premium;
  assert.deepEqual(ru.acceptByPay, { before: 'Нажимая «Оплатить», вы принимаете ', link: 'оферту', after: '.' });
  assert.deepEqual(uz.acceptByPay, { before: '«To‘lash» tugmasini bosib, ', link: 'ofertani', after: ' qabul qilasiz.' });
  // The buttons the line speaks of start with that word, in both languages.
  assert.match(ru.payVia('Click'), /^Оплатить через Click$/);
  assert.match(uz.payVia('Click'), /^Click orqali to‘lash$/);
  // v4 is the edition both offers state and the config sells; the studio's own offer must then take v5
  // (TERMS_PLAN in functions/lib/studio/plans.ts maps the chat's v3 to the studio plan: CHANGE_LOG 07.10).
  for (const locale of LOCALES) assert.equal(offers[locale].termsVersion, 'ai-paket-2026-10-v5', locale);
});

test('(d) every number the offers state is the number the code and the deployed config sell', () => {
  const cfg = resolveConfig(deployed);
  const vat = Number(config.GPT_FISCAL_VAT_PERCENT);
  const price = sum(PRICE_TIYIN);
  const vatSum = sum(includedVat(PRICE_TIYIN, vat));
  assert.equal(price, '20 000');
  assert.equal(vatSum, '2 142,86');
  const ru = chatText(offers.ru);
  const uz = chatText(offers.uz);
  assert.ok(ru.includes(`Цена — ${price} сум, в том числе НДС ${vat} % — ${vatSum} сум`));
  assert.ok(uz.includes(`Narxi — ${price} so‘m, shu jumladan QQS ${vat} % — ${vatSum} so‘m`));
  // The price and its VAT are the only sums: no refund amount or example any more (WP-25).
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

test('(h) a paid pack is not refundable: two narrow exceptions, said the same in the offers, the window and the pricing page (WP-25)', () => {
  const section8 = (doc: Page) => {
    const blocks = doc.bodyBlocks ?? [];
    const at = blocks.findIndex((block) => block.type === 'h2' && /^8\. /.test(block.text ?? ''));
    assert.ok(at > 0, doc.url);
    const list = blocks[at + 1] as { type: string; items?: string[] };
    assert.equal(list.type, 'list', doc.url);
    return list.items!.join(' ');
  };
  const ru = section8(offers.ru);
  const uz = section8(offers.uz);
  // The rule: the service counts as provided once the pack starts; no full or partial refund,
  // unused answers included.
  assert.ok(ru.startsWith('Оплаченный AI-пакет не возвращается. Услуга считается оказанной, когда пакет начал действовать'));
  assert.ok(uz.startsWith('To‘langan AI paket uchun pul qaytarilmaydi. Paket amal qila boshlagan paytda xizmat ko‘rsatilgan hisoblanadi'));
  assert.ok(ru.includes('не возвращаются ни полностью, ни частично, в том числе за ответы, которые Покупатель не использовал'));
  assert.ok(uz.includes('to‘liq ham, qisman ham qaytarilmaydi, shu jumladan Xaridor ishlatmagan javoblar uchun ham'));
  // Exception (a): money taken by mistake, in full, to the same card, within 10 working days.
  assert.ok(ru.includes('Исключение — деньги, списанные по ошибке: если за одну покупку деньги списаны дважды или оплата прошла, а пакет не начал действовать'));
  assert.ok(ru.includes('возвращает ошибочно списанную сумму полностью на ту же карту не позднее 10 рабочих дней со дня обращения'));
  assert.ok(uz.includes('Istisno — xato bilan yechilgan pul: bitta xarid uchun pul ikki marta yechilgan bo‘lsa yoki to‘lov o‘tgan, lekin paket amal qila boshlamagan bo‘lsa'));
  assert.ok(uz.includes('murojaat kunidan boshlab 10 ish kunidan kechiktirmay to‘liq o‘sha kartaga qaytaradi'));
  // Exception (b): what the law of Uzbekistan expressly requires. Nothing else.
  assert.ok(ru.includes('когда этого прямо требует законодательство Республики Узбекистан'));
  assert.ok(uz.includes('O‘zbekiston Respublikasi qonunchiligi buni bevosita talab qiladigan hollarda ham pul qaytariladi'));
  assert.equal(offers.ru.bodyBlocks!.filter((block) => block.type === 'h2' && block.text === '8. Возврат').length, 1);
  // No refund on request, no share for unused answers, no button, anywhere in either offer.
  for (const body of [chatText(offers.ru), chatText(offers.uz)]) {
    assert.doesNotMatch(body, /Запросить возврат|неиспользованн\S* част|делённая на|в момент запроса|13 333/);
    assert.doesNotMatch(body, /qaytarishni so‘rash|ishlatilmagan qism|ga bo‘lish|so‘rov paytida|13 333/);
  }
  // Before paying, beside the price, the pack window says it plainly in both languages; the
  // pricing page says it too. The panel points a payment problem to the studio.
  assert.equal(accountStrings('ru').noRefund, 'Деньги за оплаченный пакет не возвращаются: он начинает действовать сразу после оплаты.');
  assert.equal(accountStrings('uz').noRefund, 'To‘langan paket uchun pul qaytarilmaydi: u to‘lovdan keyin darhol amal qila boshlaydi.');
  assert.equal(accountStrings('ru').supportLabel, 'Проблема с оплатой? Напишите или позвоните:');
  assert.equal(accountStrings('uz').supportLabel, 'To‘lovda muammo bormi? Yozing yoki qo‘ng‘iroq qiling:');
  const pricing = text(page('ru/tarify-ai-chat'));
  assert.ok(pricing.includes('Оплаченный AI-пакет не возвращается: он начинает действовать сразу после оплаты. Деньги, списанные по ошибке, возвращаются.'));
  assert.doesNotMatch(pricing, /Запросить возврат|неиспользованн/);
  for (const copy of [accountStrings('ru'), accountStrings('uz')])
    for (const key of ['refund', 'refundPending', 'refundConfirm', 'refundYes', 'refundNo']) assert.ok(!(key in copy), key);
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
  // The director as the owner corrected it on 2026-10-05 (no patronymic was
  // given); a correction of the requisites, not a new edition of the offer.
  assert.deepEqual(LEGAL_ENTITY.director, { ru: 'Ахмедов Ильдар', uz: 'Axmedov Ildar' });
  for (const locale of LOCALES) assert.equal(offers[locale].termsVersion, config.GPT_BILLING_TERMS_VERSION, locale);
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
    assert.ok(edition.includes('<time datetime="2026-10-07">07.10.2026</time>'));
  }
  assert.equal(renderRequisites(page('ru/tarify-ai-chat')), '', 'only pages that ask for it');
  assert.equal(renderTermsEdition(policies.ru), '');
  assert.throws(() => renderTermsEdition({ ...offers.ru, lastReviewedAt: undefined }), /needs lastReviewedAt/);
  assert.throws(() => renderTermsEdition({ ...offers.ru, termsVersion: 'two words' }), /malformed termsVersion/);
});

test('the privacy policies describe the chat, its recipients, payment, sign-in and retention as the code does', () => {
  const ru = text(policies.ru);
  const uz = text(policies.uz);
  for (const recipient of ['Cloudflare', 'OpenRouter', 'Z.ai', 'Click', 'Payme', 'Uzum Bank', 'Telegram', 'Google Analytics']) {
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
    assert.equal(doc.lastReviewedAt, '2026-10-07');
  }
  // Correct Uzbek apostrophes only (o‘, g‘ with U+2018; ’ for the tutuq belgisi).
  for (const doc of [policies.uz, offers.uz]) assert.doesNotMatch(JSON.stringify(doc), /[a-zA-Z]'[a-zA-Z]/, doc.url);
  assert.doesNotMatch(uz, /\bmalumot|\bboglan|\bozingiz/, 'the Uzbek policy lost its apostrophes before');
});

test('the policies name OpenRouter, Inc. and every model supplier the deployed chains use (WP-24)', () => {
  const cfg = resolveConfig(deployed);
  // A supplier's slug on OpenRouter and the name both policies give it.
  const SUPPLIERS: Record<string, string> = {
    nvidia: 'NVIDIA', 'dots-studio': 'dots-studio', google: 'Google', mistralai: 'Mistral AI', openai: 'OpenAI',
  };
  const models = [
    cfg.freeModel, ...cfg.freeFallbacks, cfg.paidModel, ...cfg.paidFallbacks,
    // The bot's analysis of a recording (functions/lib/telegram/analysis.ts).
    (config as Record<string, string>).OPENROUTER_MODEL_ANALYSIS || ANALYSIS_DEFAULT_MODEL,
  ];
  assert.ok(models.some((model) => model.startsWith('dots-studio/')), 'the free chain as deployed');
  for (const model of models) {
    const name = SUPPLIERS[model.split('/')[0]];
    assert.ok(name, `${model}: a new model supplier; name it in both policies, then here`);
    for (const doc of Object.values(policies)) assert.ok(text(doc).includes(name), `${doc.url}: ${name}`);
  }
  for (const doc of Object.values(policies)) {
    assert.ok(text(doc).includes('OpenRouter, Inc.'), doc.url);
    // The bot's voice messages are transcribed by Groq, OpenAI when it fails (transcription.ts).
    assert.ok(text(doc).includes('Groq') && text(doc).includes('OpenAI'), doc.url);
  }
  assert.match(text(policies.ru), /OpenRouter, Inc\. \(США\)/);
  assert.match(text(policies.uz), /OpenRouter, Inc\. \(AQSh\)/);
  // OpenRouter runs a model at its developer or at another provider that serves it (a paid model
  // falls back between providers, openrouter-chat.ts): the policies name the models' developers,
  // never as the only companies a question reaches.
  assert.ok(text(policies.ru).includes('Это разработчик модели или другой провайдер, который предоставляет эту модель через OpenRouter.'));
  assert.ok(text(policies.uz).includes('Bu model ishlab chiquvchisi yoki shu modelni OpenRouter orqali taqdim etadigan boshqa provayder bo‘lishi mumkin.'));
  // No basis or safeguard of the transfer abroad is claimed: that is the lawyer's to state.
  for (const doc of Object.values(policies))
    assert.doesNotMatch(text(doc), /DPF|Data Privacy Framework|стандартн\w* договорн|адекватн|SCC/i, doc.url);
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
    config: { ...config, GPT_BILLING_LIVE_READY: 'true', GPT_BILLING_MODE_CLICK: 'live', GPT_BILLING_MODE_PAYME: 'live', GPT_BILLING_TERMS_APPROVED_AT: DAY },
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

/** The secrets a Click and Payme live sale needs, as the offline gate defers them. */
const DEFERRED = [
  'GPT_BILLING_MAINTENANCE_SECRET', 'GPT_CLICK_CREDENTIALS_JSON', 'GPT_HASH_SALT', 'GPT_IDENTITY_SECRET',
  'GPT_NOTIFY_BOT_TOKEN', 'GPT_NOTIFY_CHAT_ID', 'GPT_PAYME_KEY', 'GPT_PAYME_MERCHANT_ID',
  'TELEGRAM_ASSISTANT_BOT_TOKEN', 'TELEGRAM_ASSISTANT_WEBHOOK_SECRET',
];

test('live gate: the committed build passes with Click and Payme live; offline it defers only the secret names', () => {
  // Runbook S2 (2026-10-05): GPT_BILLING_LIVE_READY="true", Click live, Uzum off; Payme live
  // since 2026-10-07 (PAYME-RU.md section 6), with the v3 editions that name it. After the
  // one-command rollback (Payme back in test) only Click is live and asks for its secrets.
  const report = liveGate(loadLiveGateInput(ROOT, path.join(ROOT, 'dist'), null));
  const paymeLive = config.GPT_BILLING_MODE_PAYME === 'live';
  assert.deepEqual(report, {
    live: true,
    providers: paymeLive ? ['click', 'payme'] : ['click'],
    issues: [],
    deferred: paymeLive ? DEFERRED : DEFERRED.filter((name) => !name.startsWith('GPT_PAYME_')),
  });
});

test('live gate: a complete build with every secret in production may go live', () => {
  assert.deepEqual(liveGate(liveFixture()), { live: true, providers: ['click', 'payme'], issues: [], deferred: [] });
  // Offline, the same build passes and names the secrets that check-production confirms.
  const offline = liveGate(liveFixture({ production: null }));
  assert.deepEqual(offline.issues, []);
  assert.deepEqual(offline.deferred, DEFERRED);
});

test('live gate: each missing piece refuses live by name, and never prints a value', () => {
  const live = liveFixture();
  const cases: Array<[string, Partial<LiveGateInput>, RegExp]> = [
    ['no approval', { config: { ...live.config, GPT_BILLING_TERMS_APPROVED_AT: '' } }, /GPT_BILLING_TERMS_APPROVED_AT/],
    ['approval of another text', { config: { ...live.config, GPT_BILLING_TERMS_APPROVED_AT: '2026-11-03' } }, /legalReviewedAt differs from GPT_BILLING_TERMS_APPROVED_AT/],
    ['offer not reviewed', { offers: { ...live.offers, uz: offers.uz } }, /\/uz\/oferta\/: legalReviewedAt/],
    ['policy not reviewed', { policies: { ...live.policies, ru: { ...policies.ru, legalReviewedAt: undefined } } }, /politika-konfidentsialnosti\/: legalReviewedAt/],
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
    ['Uzum live without its API', { config: { ...live.config, GPT_PAYMENT_PROVIDERS: 'uzum', GPT_BILLING_MODE_CLICK: '', GPT_BILLING_MODE_UZUM: 'live' } }, /uzum: UZUM_API/],
    // liveReadiness() does not ask Uzum for the TIN; the gate still requires the seller's.
    ['Uzum live without the receipt TIN', { config: { ...live.config, GPT_PAYMENT_PROVIDERS: 'uzum', GPT_BILLING_MODE_CLICK: '', GPT_BILLING_MODE_UZUM: 'live', UZUM_API: 'merchant', GPT_FISCAL_TIN: '' } }, /GPT_FISCAL_TIN is not the seller's STIR/],
  ];
  for (const [name, change, expected] of cases) {
    const report = liveGate({ ...live, ...change });
    assert.ok(report.issues.some((issue) => expected.test(issue)), `${name}: ${JSON.stringify(report.issues)}`);
    assert.doesNotMatch(JSON.stringify(report), /x{16}|stand-in|20208000105670835001/, `${name}: a value leaked`);
  }
});

test('live gate: Payme in test never holds a deploy; Payme live needs its own secrets and an offer and policies that name it', () => {
  const live = liveFixture();
  // The rollback shape (PAYME-RU.md section 7: Payme back in test): only Click is live,
  // nothing more is asked.
  const paymeTest = liveGate({ ...live, config: { ...live.config, GPT_PAYMENT_PROVIDERS: 'click,uzum,payme', GPT_BILLING_MODE_PAYME: 'test' } });
  assert.deepEqual([paymeTest.providers, paymeTest.issues], [['click'], []]);
  // Payme live (the committed shape) with editions that do not name it (v2 named Click and
  // Uzum Bank only): refused, page by page.
  const config = { ...live.config, GPT_PAYMENT_PROVIDERS: 'click,uzum,payme', GPT_BILLING_MODE_PAYME: 'live' };
  const unnamed = <T,>(page: T) => JSON.parse(JSON.stringify(page).replace(/Payme/g, 'P*yme')) as T;
  const report = liveGate({
    ...live,
    config,
    offers: { ru: unnamed(live.offers.ru), uz: unnamed(live.offers.uz) },
    policies: { ru: unnamed(live.policies.ru), uz: unnamed(live.policies.uz) },
  });
  assert.deepEqual(report.providers, ['click', 'payme']);
  assert.deepEqual(report.issues.filter((issue) => /Payme/.test(issue)), [
    '/ru/oferta/: does not name Payme as a way to pay',
    '/ru/politika-konfidentsialnosti/: does not name Payme among the recipients',
    '/uz/oferta/: does not name Payme as a way to pay',
    '/uz/maxfiylik-siyosati/: does not name Payme among the recipients',
  ]);
  // Its production key and cash desk are Pages secrets, known by name.
  const withoutKey = liveGate({ ...live, config, production: new Set([...(live.production ?? [])].filter((name) => name !== 'GPT_PAYME_KEY')) });
  assert.ok(withoutKey.issues.includes('payme: Pages secret GPT_PAYME_KEY is not set in production'), JSON.stringify(withoutKey.issues));
  // The committed v3 editions name Payme: nothing is refused; the global live mode alone
  // never makes Payme live.
  assert.deepEqual(liveGate({ ...live, config }).issues, []);
  assert.deepEqual(liveGate({ ...live, config: { ...live.config, GPT_PAYMENT_PROVIDERS: 'click,uzum,payme', GPT_BILLING_MODE: 'live', GPT_BILLING_MODE_UZUM: 'off', GPT_BILLING_MODE_PAYME: '' } }).issues.filter((issue) => issue.startsWith('payme:')), ['payme: GPT_BILLING_MODE_PAYME']);
  assert.ok(BILLING_SETTINGS.has('GPT_BILLING_MODE_PAYME'));
  assert.ok(LIVE_SECRETS.includes('GPT_PAYME_KEY') && LIVE_SECRETS.includes('GPT_PAYME_MERCHANT_ID'));
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
    const stopped = { ...off, config: { ...off.config, GPT_BILLING_LIVE_READY: 'true', GPT_BILLING_MODE_CLICK: mode, GPT_BILLING_MODE_PAYME: mode } };
    assert.deepEqual(liveGate(stopped), { live: false, providers: [], issues: [], deferred: [] }, mode || 'cleared');
  }
  // A secret named like a billing setting overrides the reviewed JSON at runtime.
  for (const name of ['GPT_BILLING_LIVE_READY', 'GPT_BILLING_MODE_CLICK', 'GPT_PAYMENT_PROVIDERS', 'GPT_FISCAL_TIN', 'UZUM_API', 'GPT_GUEST_CHECKOUT']) {
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
  assert.match(main, /assertLiveGate\(loadLiveGateInput\(ROOT, dist, null\)\);\s*assertStudioLiveGate\(ROOT, dist, null\);\s*assertCleanRuntime\(ROOT\);/);
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
  // Both offers and both policies name the director of the one source, and the
  // name it replaced is gone from all four.
  for (const [file, locale] of [['dist/ru/oferta/index.html', 'ru'], ['dist/uz/oferta/index.html', 'uz'],
    ['dist/ru/politika-konfidentsialnosti/index.html', 'ru'], ['dist/uz/maxfiylik-siyosati/index.html', 'uz']] as const) {
    const html = read(file);
    assert.ok(html.includes(`<dd class="text-white/85 break-words">${LEGAL_ENTITY.director[locale]}</dd>`), file);
    assert.doesNotMatch(html, /Рубцов|Rubtsov/, file);
  }
  for (const pathname of PROTECTED_PATHS) {
    assert.doesNotMatch(read(path.join('dist', pathname, 'index.html')), /\/oferta\//, pathname);
  }
});
