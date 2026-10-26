// What the unprotected pages promise about money and limits (paid-chat plan
// WP-11). Every number a page states is read from the code or the deployed
// config it describes, so a page cannot drift from the product:
//   - the AI pack: PRICE_TIYIN / 100 sum, PAID_MESSAGES answers a month,
//     PACK_DAILY_LIMIT a day (functions/lib/gpt-chat);
//   - the free chat: resolveConfig() over the packed runtime config;
//   - the Telegram bot: resolveTelegramConfig() over the same config.
// No page sells a «Plus», a «Day Pass» or a subscription, and none sends a
// visitor to a personal Telegram account (decision L14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { GUEST_PROVIDERS, PAID_MESSAGES, PRICE_TIYIN, PROVIDERS, guestCheckoutOn, providersInMode } from '../functions/lib/gpt-chat/billing-config';
import { FREE_TRIAL_LIMIT } from '../functions/lib/gpt-chat/trial-store';
import { PACK_DAILY_LIMIT } from '../functions/lib/gpt-chat/turn-store';
import { resolveConfig } from '../functions/lib/gpt-chat/config';
import { resolveTelegramConfig } from '../functions/lib/telegram/config';
import { STUDIO_PLANS, TERMS_PLAN } from '../functions/lib/studio/plans';
import { telegramDeepLink } from '../src/lib/telegram';
import { STUDIO_TELEGRAM_URL } from '../src/shared/studio-contact';
import { LEAD_FORM_PAGES } from '../scripts/lead-form';
import { PROTECTED_PATHS } from '../scripts/seo-protection';
import { strings } from '../src/gpt-chat/i18n';
import type { Env } from '../functions/_types';

type Link = { token?: string; target?: string; anchor?: string };
type Block = { type: string; id?: string; href?: string; text?: string; headers?: string[]; rows?: string[][]; items?: string[]; links?: Link[] };
type Page = { url: string; locale?: string; pageType?: string; title?: string; h1?: string; description?: string; bodyBlocks: Block[]; faq: { q: string; a: string }[]; ctaPrimaryHref?: string; secondaryKeywords?: string[]; internalLinks?: Link[] };
const page = (file: string) => JSON.parse(readFileSync(`content/pages/${file}.json`, 'utf8')) as Page;
const tariffs = page('ru/tarify-ai-chat');

/**
 * The tool pages with the chat that carry «AI paket bu sahifada» / «AI-пакет на
 * этой странице» (monetization roadmap 2026-10-25, Ш6, §5.2): the translator
 * pages and the AI tools of wave A.
 */
const PACK_BLOCK_PAGES = [
  'uz/rus-ozbek-tarjimon', 'ru/russko-uzbekskiy-perevodchik', 'uz/kirill-lotin', 'ru/kirillica-v-latinicu',
  'uz/ai-sher-yozish', 'uz/ai-tabrik-generatori', 'ru/generator-pozdravleniy', 'uz/notogri-fellar',
  'ru/nepravilnye-glagoly', 'uz/gpt-telegram-instagram-ideya',
];
/** «Ustozlar va o‘quv markazlari uchun»: the tests hub, the three tests and the tenses hub. */
const TEACHER_PAGES = ['uz/onlayn-testlar', 'uz/informatika-test', 'uz/fizika-test', 'uz/matematika-test', 'uz/ingliz-tili-zamonlari'];
/**
 * No pack block here. The tests and the calculator wait for the «данные детей»
 * gate (decision №17, ROADMAP §5.2): no Ш6, no parents block. The tenses pages
 * shipped in wave B (25.10): Ш6 there waits for their first check.
 */
const NO_PACK_BLOCK_PAGES = [
  'uz/onlayn-testlar', 'uz/informatika-test', 'uz/fizika-test', 'uz/matematika-test', 'uz/kalkulyator', 'ru/kalkulyator',
  'uz/ingliz-tili-zamonlari', 'uz/present-simple', 'uz/past-simple', 'uz/present-continuous', 'ru/vremena-angliyskogo-yazyka',
];

/** The AI-chat pages outside the protected set (scripts/seo-protection.ts) that state the pack. */
const CHAT_PAGES = [
  'uz/gpt-chat-qollanma', 'uz/javob', 'ru/javob', 'ru/tarify-ai-chat', 'ru/gpt-chat-guide', 'ru/gde-polzovatsya-gpt-besplatno', 'ru/gpt-na-russkom',
  ...PACK_BLOCK_PAGES, ...TEACHER_PAGES,
];

/** Every page of content/pages by URL. */
const PAGES = new Map(['ru', 'uz'].flatMap((locale) => readdirSync(`content/pages/${locale}`)
  .filter((name) => name.endsWith('.json'))
  .map((name) => page(`${locale}/${name.slice(0, -5)}`))
  .map((doc) => [doc.url, doc] as const)));
/**
 * The sums the studio's service pages publish (the lead-form landings,
 * scripts/lead-form.ts). A chat page may quote one, and only as a starting
 * price — «от 1 990 000 сум», «1 990 000 so‘mdan» — never as the pack's.
 */
const SERVICE_PRICES = new Set([...Object.keys(LEAD_FORM_PAGES)].flatMap((url) => {
  const doc = PAGES.get(url);
  return doc ? [...JSON.stringify(doc).matchAll(/(\d{1,3}(?: \d{3})+) (?:сум|so‘m)/g)].map((match) => match[1]) : [];
}));

/** What a page claims about the pack: everything but its Studio section, which is checked on its own. */
function claims(doc: Page): string {
  const studioAt = doc.bodyBlocks.findIndex(block => block.type === 'h2' && /Studio/.test(block.text ?? ''));
  return JSON.stringify(studioAt < 0 ? doc : { ...doc, bodyBlocks: doc.bodyBlocks.slice(0, studioAt) });
}

/** The packed public runtime config of wrangler.toml, as production reads it. */
function deployedEnv(): Env {
  const packed = /GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(readFileSync('wrangler.toml', 'utf8'))?.[1];
  assert.ok(packed, 'the packed runtime config is missing');
  return JSON.parse(packed) as Env;
}

/** How the pages name a provider. */
const PROVIDER_NAME = { click: 'Click', payme: 'Payme', uzum: 'Uzum' } as const;
/** The live providers of the packed config, as the page lists them: «Click или Payme». */
function livePaymentNames(env: Env): string {
  const names = providersInMode(env, 'live').map((provider) => PROVIDER_NAME[provider]);
  assert.ok(names.length > 0, 'no live provider in the packed config');
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} или ${names.at(-1)}`;
}

/** 2 000 000 tiyin → "20 000", grouped the way the pages write sums. */
const sum = (tiyin: number) => String(tiyin / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const PRICE = sum(PRICE_TIYIN);

test('the pack the pages describe is the pack the code sells', () => {
  assert.equal(PRICE, '20 000');
  assert.ok(['1 990 000', '1 490 000', '2 490 000'].every((amount) => SERVICE_PRICES.has(amount)), 'the service pages publish their starting prices');
  for (const file of CHAT_PAGES) {
    const doc = page(file);
    const studioAt = doc.bodyBlocks.findIndex(block => block.type === 'h2' && /Studio/.test(block.text ?? ''));
    const text = claims(doc);
    if (studioAt >= 0) {
      const studio = JSON.stringify(doc.bodyBlocks.slice(studioAt));
      assert.ok(studio.includes('5 900') && studio.includes('39 900'));
      assert.ok(studio.includes('Kunlik') && studio.includes('Oylik'));
    }
    // «100 000 so‘mlik misol» is an example in a sample prompt, not a price.
    for (const [, from, amount, dan] of text.matchAll(/(от )?(\d{1,3}(?: \d{3})*) (?:сум|so‘m(?!lik))(dan)?/g)) {
      if (from || dan) assert.ok(SERVICE_PRICES.has(amount), `${file}: ${amount} is no service page's price`);
      else assert.ok(amount === PRICE || amount === '0', `${file}: ${amount}`);
    }
    for (const [, ru, uz] of text.matchAll(/(\d+) ответов на (?:один календарный )?месяц|bir (?:kalendar )?oyga (\d+) ta javob/g)) {
      assert.equal(Number(ru ?? uz), PAID_MESSAGES, file);
    }
    if (file.endsWith('/javob')) continue; // the bot's own allowance, tested below
    for (const [, ru, uz] of text.matchAll(/до (\d+) (?:ответов )?в день|kuniga (\d+) tagacha/g)) {
      assert.equal(Number(ru ?? uz), PACK_DAILY_LIMIT, file);
    }
  }
  const all = JSON.stringify(tariffs);
  assert.ok(all.includes(`${PAID_MESSAGES} ответов на месяц за ${PRICE} сум`));
  assert.ok(all.includes(`до ${PACK_DAILY_LIMIT} в день`));
  assert.match(all, /без автосписаний/);
  // The ways to pay are the providers the packed config runs live (Click and
  // Payme since 2026-10-07): the page names every live one and none that is
  // off. «Можно без входа» holds only while each of them may pay as a guest.
  const env = deployedEnv();
  const live = providersInMode(env, 'live');
  const pay = livePaymentNames(env);
  assert.ok(guestCheckoutOn(env), 'the page promises payment without signing in');
  for (const provider of live) assert.ok(GUEST_PROVIDERS.includes(provider), `${provider} cannot pay as a guest`);
  const table = tariffs.bodyBlocks.find((block) => block.type === 'table');
  const payRow = table?.rows?.find((row) => row[0] === 'Оплата');
  assert.equal(payRow?.[2], `${pay} — можно без входа`, 'the table row names every live provider');
  assert.ok(all.includes(`через ${pay} пакет можно оплатить и без входа`), 'the paragraph');
  assert.ok(all.includes(`через ${pay} (можно без входа).`), 'the summary');
  for (const provider of PROVIDERS) {
    if (!live.includes(provider)) assert.doesNotMatch(all, new RegExp(PROVIDER_NAME[provider]), `${provider} is off but named`);
  }
  assert.doesNotMatch(all, /обязательно: пакет можно оплатить/);
  // A second pack works at once and side by side (BillingStore.transition and
  // usablePacks; PACKS_LEFT in turn-store), under one day cap for all packs.
  assert.ok(all.includes('Второй пакет можно купить, не дожидаясь конца первого: он тоже начинает действовать сразу и работает параллельно'));
  const second = tariffs.faq.find((item) => /второй пакет/i.test(item.q));
  assert.ok(second, 'the FAQ answers whether a second pack can be bought');
  assert.match(second.a, /сразу после оплаты и работает параллельно/);
  assert.ok(second.a.includes(`Из всех пакетов вместе списывается до ${PACK_DAILY_LIMIT} ответов в день.`));
});

test('the free tier on the pricing page is the deployed lifetime trial', () => {
  // Since the trial went live (GPT_FREE_TRIAL_ENABLED) a visitor without a pack
  // gets FREE_TRIAL_LIMIT answers in all, not a daily and hourly allowance.
  assert.equal(resolveConfig(deployedEnv()).freeTrialEnabled, true);
  const trial = `${FREE_TRIAL_LIMIT} пробных ответа всего`;
  const table = tariffs.bodyBlocks.find((block) => block.type === 'table');
  assert.equal(table?.rows?.find((row) => row[0] === 'Ответы')?.[1], trial, 'table row');
  assert.ok(tariffs.bodyBlocks.some((block) => block.type === 'list' && JSON.stringify(block).includes(`Бесплатный AI-чат: ${trial}`)), 'summary');
  const free = tariffs.faq.find((item) => /бесплатный тариф/i.test(item.q));
  assert.ok(free?.a.includes(`Бесплатно — ${trial}`), 'FAQ');
  assert.match(free!.a, /не обновляется каждый день/);
  assert.doesNotMatch(JSON.stringify(tariffs), /сообщений в день и \d+ в час|бесплатн\S* лимит/, 'no daily or hourly free allowance');
});

test('the pricing page is honest before and after payment opens', () => {
  const payment = tariffs.faq.find((item) => /оплатить/i.test(item.q));
  assert.ok(payment, 'Pricing must explain how and when the pack can be paid');
  assert.ok(payment.a.includes(`открывает оплату: ${livePaymentNames(deployedEnv())} — можно без входа.`));
  assert.match(payment.a, /Если кнопки нет, оплата сейчас недоступна/);
  const offer = JSON.stringify(tariffs);
  assert.doesNotMatch(offer, /(?:href|target)":\s*"[^"]*(?:checkout|payment|\/api\/gpt\/)/);
  assert.doesNotMatch(offer, /подписк|\bPlus\b|\bPro\b|obuna/i);
  for (const keyword of tariffs.secondaryKeywords ?? []) assert.doesNotMatch(keyword, /подписк|plus/i, keyword);
});

test('pricing sends the free chat to the chat and a business to a business page', () => {
  const chat = page('ru/gpt-chat');
  assert.equal(tariffs.ctaPrimaryHref, chat.url);
  const business = tariffs.bodyBlocks.find((block) => block.type === 'cta' && /бизнес/i.test(block.text || ''));
  assert.ok(business, 'A B2B enquiry needs an explicit route');
  assert.equal(business.href, '/ru/gpt-dlya-biznesa/');
  assert.ok(tariffs.bodyBlocks.some((block) => block.type === 'p' && /отдельный проект/.test(block.text || '') && /пакет/.test(block.text || '')));
});

test('no AI-chat page sells a Plus, a Day Pass or a subscription', () => {
  for (const file of CHAT_PAGES) {
    const doc = page(file);
    const studioAt = doc.bodyBlocks.findIndex(block => block.type === 'h2' && /Studio/.test(block.text ?? ''));
    const text = JSON.stringify(studioAt < 0 ? doc : {...doc, bodyBlocks: doc.bodyBlocks.slice(0,studioAt)});
    if (studioAt >= 0) {
      const studio = JSON.stringify(doc.bodyBlocks.slice(studioAt));
      assert.ok(studio.includes('5 900') && studio.includes('39 900'));
      assert.ok(studio.includes('Kunlik') && studio.includes('Oylik'));
    }
    assert.doesNotMatch(text, /\bPlus\b|Day Pass|подписк|\bobuna\b|tarifi mavjud|Онлайн-оплата подключается|to‘lov ulanmoqda/, file);
    assert.doesNotMatch(text, /XGame_changerx/i, file);
  }
});

test('the bot pages state the bot allowance the deployed config gives, and link the live bot', () => {
  const bot = resolveTelegramConfig(deployedEnv());
  assert.equal(bot.freeDailyLimit, 10);
  assert.equal(bot.freeMonthlyLimit, 100);
  assert.equal(bot.analysisFreeDaily, 1);
  const ru = readFileSync('content/pages/ru/javob.json', 'utf8');
  const uz = readFileSync('content/pages/uz/javob.json', 'utf8');
  assert.ok(ru.includes(`${bot.freeDailyLimit} в день, до ${bot.freeMonthlyLimit} в месяц`));
  assert.ok(ru.includes(`${bot.freeDailyLimit} ответов в день и до ${bot.freeMonthlyLimit} в месяц`));
  assert.ok(uz.includes(`Kuniga ${bot.freeDailyLimit} ta, oyiga ${bot.freeMonthlyLimit} tagacha`));
  assert.ok(uz.includes(`Kuniga ${bot.freeDailyLimit} ta javob va oyiga ${bot.freeMonthlyLimit} tagacha`));
  for (const text of [ru, uz]) {
    assert.doesNotMatch(text, /UZS|\d \d{3} (?:сум|so‘m)/, 'no price in the bot');
    assert.match(text, /\/plans/);
  }
  // The page's own button opens the bot that answers (GPT_HANDOFF_BOT_USERNAME),
  // not @gptbot_javob_bot, a handle no bot answers to.
  assert.equal(page('ru/javob').ctaPrimaryHref, telegramDeepLink('ru'));
  assert.equal(page('uz/javob').ctaPrimaryHref, telegramDeepLink('uz'));
});

// ── monetization stage B content (roadmap 2026-10-25 §5.2, §3.1) ─────────────

/** The h2 with this id and the blocks under it, up to the next heading. */
const blockAfter = (doc: Page, id: string) => {
  const at = doc.bodyBlocks.findIndex((block) => block.type === 'h2' && block.id === id);
  if (at < 0) return null;
  const next = doc.bodyBlocks.findIndex((block, i) => i > at && /^h[23]$/.test(block.type));
  return { heading: doc.bodyBlocks[at], body: doc.bodyBlocks.slice(at + 1, next < 0 ? undefined : next) };
};
const targetsOf = (blocks: Block[]) => blocks.flatMap((block) => [block.href, ...(block.links ?? []).map((link) => link.target)]).filter(Boolean) as string[];
const UZ_HUB = '/uz/tariflar/';
// A link to the hub from a pack or a pilot lands on the section it names, not on the Studio plans above it.
const UZ_HUB_PACK = `${UZ_HUB}#ai-paket`;
const UZ_HUB_ORGS = `${UZ_HUB}#tashkilotlar`;

test('«AI paket bu sahifada»: the wave A tool pages state the pack the code sells and link the tariffs of their language', () => {
  for (const file of PACK_BLOCK_PAGES) {
    const doc = page(file);
    const uz = doc.locale === 'uz';
    const block = blockAfter(doc, 'ai-paket');
    assert.ok(block, `${file}: no pack block`);
    assert.equal(block.heading.text, uz ? 'AI paket bu sahifada' : 'AI-пакет на этой странице', file);
    const text = block.body.map((b) => b.text ?? '').join(' ');
    if (uz) {
      assert.ok(text.includes(`AI paket — ${PRICE} so‘m: bir kalendar oyga ${PAID_MESSAGES} ta javob, kuniga ${PACK_DAILY_LIMIT} tagacha, avtomatik to‘lovsiz.`), file);
    } else {
      assert.ok(text.includes(`AI-пакет — ${PRICE} сум: ${PAID_MESSAGES} ответов на один календарный месяц, до ${PACK_DAILY_LIMIT} в день, без автосписаний.`), file);
    }
    // What the pack gives on this very tool comes first, then the pack, then its page.
    assert.ok(text.indexOf(uz ? 'AI paket —' : 'AI-пакет —') > 40, `${file}: the block opens with this tool`);
    assert.deepEqual(targetsOf(block.body), [uz ? UZ_HUB_PACK : '/ru/tarify-ai-chat/'], file);
    // The pack covers the AI chats; Studio presentations are sold apart (plans.ts), so no «every AI page».
    assert.doesNotMatch(text, /всех AI-страницах|barcha AI sahifalarida/, file);
    assert.ok(text.includes(uz ? 'Bitta paket saytdagi barcha AI chatlarda ishlaydi' : 'Один пакет работает во всех AI-чатах сайта'), file);
    assert.ok(text.includes(uz ? 'Studio taqdimotlari alohida to‘lanadi' : 'презентации Studio оплачиваются отдельно'), file);
  }
  for (const file of NO_PACK_BLOCK_PAGES) {
    const doc = page(file);
    assert.equal(blockAfter(doc, 'ai-paket'), null, `${file}: a pack block before its gate`);
    assert.doesNotMatch(JSON.stringify(doc.bodyBlocks), /AI paket bu sahifada|AI-пакет на этой странице/, file);
  }
  // The children-data gate stays closed: no block for parents on the tests or the calculator.
  for (const file of ['uz/onlayn-testlar', 'uz/informatika-test', 'uz/fizika-test', 'uz/matematika-test', 'uz/kalkulyator', 'ru/kalkulyator']) {
    assert.ok(!page(file).bodyBlocks.some((block) => /^h[23]$/.test(block.type) && /^(?:Ota-onalar uchun|Для родителей)/.test(block.text ?? '')), file);
  }
  // The role is set in the browser, the server does not enforce it: no page may promise that the AI never gives ready answers.
  for (const file of CHAT_PAGES) assert.doesNotMatch(JSON.stringify(page(file)), /tayyor javob(?:ni|lar)? bermaydi|не (?:даёт|дает) готов/, file);
});

test('«Ustozlar va o‘quv markazlari uchun»: an honest pilot through a contact, adults only, no checkout', () => {
  for (const file of TEACHER_PAGES) {
    const doc = page(file);
    const block = blockAfter(doc, 'ustozlar-uchun');
    assert.ok(block, `${file}: no teacher block`);
    assert.equal(block.heading.text, 'Ustozlar va o‘quv markazlari uchun', file);
    const text = block.body.map((b) => b.text ?? '').join(' ');
    assert.ok(text.includes(`Tashkilotlar uchun AI paket — ${PRICE} so‘m bir o‘rin uchun, oyiga.`), file);
    assert.ok(text.includes(`bir kalendar oyga ${PAID_MESSAGES} ta javob, kuniga ${PACK_DAILY_LIMIT} tagacha`), file);
    // A pilot on personal purchases: no invoice yet, nothing bought on the page.
    assert.match(text, /har bir o‘qituvchi paketni chatda o‘zi sotib oladi/, file);
    assert.match(text, /bitta hisob-faktura va shartnoma bilan to‘lash hali yo‘q/, file);
    assert.match(text, /Pilot faqat kattalar uchun/, file);
    assert.match(text, /o‘quvchilarning ismi va ishlarini chatga yubormang/, file);
    assert.match(text, /xato bo‘lishi mumkin|xato qilishi mumkin/, file);
    const targets = targetsOf(block.body);
    for (const target of [STUDIO_TELEGRAM_URL!, 'mailto:ceo@gptbot.uz', UZ_HUB_ORGS]) assert.ok(targets.includes(target), `${file}: ${target}`);
    assert.ok(!targets.some((target) => /checkout|payment|\/api\//.test(target)), file);
  }
});

test('/ru/tarify-ai-chat/: «Для организаций» — the same pilot, before the Studio section', () => {
  const at = tariffs.bodyBlocks.findIndex((block) => block.type === 'h2' && block.text === 'Для организаций');
  const studioAt = tariffs.bodyBlocks.findIndex((block) => block.type === 'h2' && /Studio/.test(block.text ?? ''));
  assert.ok(at > 0 && at < studioAt, 'the section is checked as a pack claim');
  const text = JSON.stringify(blockAfter(tariffs, 'dlya-organizatsiy')!.body);
  assert.ok(text.includes(`AI-пакет для организаций — ${PRICE} сум за одно место в месяц.`));
  assert.ok(text.includes(`${PAID_MESSAGES} ответов на один календарный месяц, до ${PACK_DAILY_LIMIT} в день`));
  assert.ok(text.includes('каждый учитель или сотрудник покупает свой пакет в чате сам'));
  assert.ok(text.includes('Оплаты одним счётом по договору пока нет.'));
  assert.ok(text.includes('Пилот только для взрослых'));
  const targets = targetsOf(blockAfter(tariffs, 'dlya-organizatsiy')!.body);
  for (const target of [STUDIO_TELEGRAM_URL!, 'mailto:ceo@gptbot.uz', UZ_HUB_ORGS]) assert.ok(targets.includes(target), target);
});

test('/ru/tarify-ai-chat/ names the header button as the chat shows it before a purchase', () => {
  const all = JSON.stringify(tariffs);
  const button = strings('ru').premium.buyPack;
  assert.ok(all.includes(`кнопка «${button}» появляется в его шапке`), button);
  assert.ok(all.includes(`кнопка «${button}» в шапке открывает оплату`), button);
  assert.doesNotMatch(all, /кнопка «AI-пакет»/);
});

test('the Uzbek chat-tool pages send «AI paket shartlari» to the UZ hub, not to the Russian page', () => {
  const protectedPaths = new Set<string>(PROTECTED_PATHS);
  const tools = [...PAGES.values()].filter((doc) => doc.locale === 'uz' && doc.pageType === 'gpt-chat' && !protectedPaths.has(doc.url));
  assert.ok(tools.length >= 15);
  for (const doc of tools) {
    assert.doesNotMatch(JSON.stringify(doc), /"\/ru\/tarify-ai-chat\/"/, doc.url);
    assert.ok(targetsOf(doc.bodyBlocks).includes(UZ_HUB_PACK), `${doc.url}: no link to the hub's AI paket`);
  }
  // Ш8 on every unprotected Uzbek page, the guides included: the UZ hub, never the Russian page.
  const uzPages = [...PAGES.values()].filter((doc) => doc.locale === 'uz' && !protectedPaths.has(doc.url));
  for (const doc of uzPages) assert.doesNotMatch(JSON.stringify(doc), /"\/ru\/tarify-ai-chat\/"/, doc.url);
  // A body link or the primary button to the hub lands on «AI paket · 1 oy» or «Tashkilotlar uchun»
  // (its title and H1 name Studio only); internalLinks keep the canonical URL for the link graph.
  const sections = new Set((JSON.parse(readFileSync('content/studio/pages/uz/tariflar.json', 'utf8')) as { sections: { id: string }[] }).sections.map((s) => s.id));
  for (const doc of uzPages) {
    const hubLinks = [...targetsOf(doc.bodyBlocks), doc.ctaPrimaryHref ?? ''].filter((target) => target.startsWith(UZ_HUB));
    for (const target of hubLinks) {
      const anchor = doc.bodyBlocks.flatMap((block) => block.links ?? []).find((link) => link.target === target)?.anchor;
      if (anchor && /^Studio/.test(anchor)) { assert.equal(target, UZ_HUB, `${doc.url}: a Studio link keeps the hub's top`); continue; }
      assert.ok([UZ_HUB_PACK, UZ_HUB_ORGS].includes(target), `${doc.url}: ${target}`);
      assert.ok(sections.has(target.slice(target.indexOf('#') + 1)), `${doc.url}: the hub has ${target}`);
    }
    if (doc.ctaPrimaryHref?.startsWith(UZ_HUB)) assert.equal(doc.ctaPrimaryHref, UZ_HUB_PACK, doc.url);
  }
});

test('/uz/tariflar/ is the UZ hub of every tariff: numbers from the code, Studio as plans.ts sells it, title and H1 unchanged', () => {
  type Section = { id: string; h2: string; items?: string[]; paragraphs?: Array<string | { text: string; links: Link[] }> };
  const hub = JSON.parse(readFileSync('content/studio/pages/uz/tariflar.json', 'utf8')) as Page & { lead: string; sections: Section[]; links: { text: string; links: Link[] } };
  // No Search Console read yet (ROADMAP §3.1 #3): the snippet stays as published.
  assert.equal(hub.title, 'Studio tariflari: taqdimot uchun Kunlik va Oylik');
  assert.equal(hub.h1, 'Studio tariflari: Kunlik va Oylik');
  assert.equal(hub.description, 'Taqdimot uchun Studio tariflari: Kunlik 5 900 so‘m, Oylik 39 900 so‘m. Narx, muddat, slaydlar va pulni qaytarish shartlarini bilib oling. Avtoto‘lov yo‘q.');
  const plans = STUDIO_PLANS[TERMS_PLAN[Object.keys(TERMS_PLAN)[0]]];
  const kunlik = sum(plans.kunlik.amountTiyin);
  const oylik = sum(plans.oylik.amountTiyin);
  const pair = sum(PRICE_TIYIN + plans.oylik.amountTiyin);
  const text = (id: string) => {
    const section = hub.sections.find((s) => s.id === id);
    assert.ok(section, `no section ${id}`);
    return [...(section.paragraphs ?? []).map((p) => typeof p === 'string' ? p : p.text), ...(section.items ?? [])].join(' ');
  };
  assert.ok(text('tarif-0').includes(`Kunlik — ${kunlik} so‘m`) && text('tarif-0').includes(`Oylik — ${oylik} so‘m`), 'Studio as plans.ts sells it');
  // AI paket · 1 oy, next to Studio.
  const ids = hub.sections.map((s) => s.id);
  assert.equal(ids.indexOf('ai-paket'), ids.indexOf('tarif-0') + 1);
  const pack = text('ai-paket');
  assert.ok(pack.includes(`AI paket — ${PRICE} so‘m: bir kalendar oyga ${PAID_MESSAGES} ta javob, kuniga ${PACK_DAILY_LIMIT} tagacha.`));
  assert.ok(pack.includes('Muddati — to‘lov paytidan boshlab bir kalendar oy.'));
  assert.ok(pack.includes('avtomatik to‘lov yo‘q'));
  assert.ok(pack.includes(`jami ${FREE_TRIAL_LIMIT} ta bepul sinov javobi bor, ular yangilanmaydi`));
  const env = deployedEnv();
  const live = providersInMode(env, 'live').map((provider) => PROVIDER_NAME[provider]);
  assert.ok(guestCheckoutOn(env) && providersInMode(env, 'live').every((provider) => GUEST_PROVIDERS.includes(provider)), 'the hub promises payment without signing in');
  assert.ok(pack.includes(`To‘lov — ${live.join(' yoki ')}, kirmasdan ham mumkin`), 'the hub names every live provider');
  for (const provider of PROVIDERS) if (!providersInMode(env, 'live').includes(provider)) assert.doesNotMatch(JSON.stringify(hub), new RegExp(PROVIDER_NAME[provider]));
  // Juftlik: text only, two purchases, wallets not linked.
  const juftlik = text('juftlik');
  assert.ok(juftlik.includes(`AI paket (${PRICE} so‘m)`) && juftlik.includes(`Studio Oylik (${oylik} so‘m)`));
  assert.ok(juftlik.includes(`Ikkalasi birga — oyiga ${pair} so‘m.`));
  assert.match(juftlik, /ikki alohida xarid, umumiy chegirma yo‘q/);
  assert.match(juftlik, /Hisoblar bog‘lanmagan/);
  // Organisations: the pilot, adults only.
  const orgs = text('tashkilotlar');
  assert.ok(orgs.includes(`Tashkilotlar uchun AI paket — ${PRICE} so‘m bir o‘rin uchun, oyiga.`));
  assert.match(orgs, /Bitta hisob-faktura va shartnoma bilan to‘lash hozircha yo‘q/);
  assert.match(orgs, /Pilot faqat kattalar uchun/);
  // Every sum on the hub is one of these (VAT lines «632,14 so‘m» aside).
  for (const [, amount] of JSON.stringify(hub).matchAll(/(?<![\d,])(\d{1,3}(?: \d{3})*) so‘m/g)) {
    assert.ok([PRICE, kunlik, oylik, pair].includes(amount), `uz/tariflar: ${amount}`);
  }
  assert.ok(hub.links.links.some((link) => link.target === '/ru/tarify-ai-chat/'), 'the Russian AI-chat tariffs are one click away');
  // The pack covers the AI chats, not the Studio pages; the button is named as the chat shows it before a purchase.
  assert.ok(pack.includes('U saytdagi barcha AI chatlarda ishlaydi'));
  assert.doesNotMatch(JSON.stringify(hub), /barcha AI sahifalarida/);
  assert.ok(pack.includes(`chat sarlavhasidagi «${strings('uz').premium.buyPack}» tugmasi`));
});

test('SEO package starting prices remain present and are not contradicted by no-price-list copy', () => {
  const seo = page('uz/seo-xizmati');
  const packageTable = seo.bodyBlocks.find((block: Block) => block.type === 'table' && block.headers?.some(header => /Narx/.test(header)) && block.rows?.some(row => row[0] === 'Audit'));
  assert.ok(packageTable);
  assert.deepEqual(packageTable.rows!.map((row: string[]) => row.at(-1)), ['990 000 dan', '2 490 000 dan', '4 900 000 dan', '7 900 000 dan']);
  assert.doesNotMatch(JSON.stringify(seo.bodyBlocks), /tayyor narxlar ro‘yxati yo‘q/);
  assert.ok(seo.bodyBlocks.some((block: Block) => /boshlang‘ich narxlar/.test(block.text || '') && /Yakuniy smeta/.test(block.text || '')));
});
