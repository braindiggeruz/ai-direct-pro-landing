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
import { readFileSync } from 'node:fs';

import { GUEST_PROVIDERS, PAID_MESSAGES, PRICE_TIYIN, PROVIDERS, guestCheckoutOn, providersInMode } from '../functions/lib/gpt-chat/billing-config';
import { FREE_TRIAL_LIMIT } from '../functions/lib/gpt-chat/trial-store';
import { PACK_DAILY_LIMIT } from '../functions/lib/gpt-chat/turn-store';
import { resolveConfig } from '../functions/lib/gpt-chat/config';
import { resolveTelegramConfig } from '../functions/lib/telegram/config';
import { telegramDeepLink } from '../src/lib/telegram';
import type { Env } from '../functions/_types';

type Block = { type: string; href?: string; text?: string; headers?: string[]; rows?: string[][]; links?: { target?: string }[] };
type Page = { url: string; bodyBlocks: Block[]; faq: { q: string; a: string }[]; ctaPrimaryHref?: string; secondaryKeywords?: string[] };
const page = (file: string) => JSON.parse(readFileSync(`content/pages/${file}.json`, 'utf8')) as Page;
const tariffs = page('ru/tarify-ai-chat');

/** The seven AI-chat pages outside the protected set (scripts/seo-protection.ts). */
const CHAT_PAGES = ['uz/gpt-chat-qollanma', 'uz/javob', 'ru/javob', 'ru/tarify-ai-chat', 'ru/gpt-chat-guide', 'ru/gde-polzovatsya-gpt-besplatno', 'ru/gpt-na-russkom'];

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
  for (const file of CHAT_PAGES) {
    const doc = page(file);
    const studioAt = doc.bodyBlocks.findIndex(block => block.type === 'h2' && /Studio/.test(block.text ?? ''));
    const text = JSON.stringify(studioAt < 0 ? doc : {...doc, bodyBlocks: doc.bodyBlocks.slice(0,studioAt)});
    if (studioAt >= 0) {
      const studio = JSON.stringify(doc.bodyBlocks.slice(studioAt));
      assert.ok(studio.includes('5 900') && studio.includes('39 900'));
      assert.ok(studio.includes('Kunlik') && studio.includes('Oylik'));
    }
    for (const [, amount] of text.matchAll(/(\d{1,3}(?: \d{3})*) (?:сум|so‘m)/g)) {
      assert.ok(amount === PRICE || amount === '0', `${file}: ${amount}`);
    }
    for (const [, ru, uz] of text.matchAll(/(\d+) ответов на (?:один календарный )?месяц|bir oyga (\d+) ta javob/g)) {
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

test('SEO package starting prices remain present and are not contradicted by no-price-list copy', () => {
  const seo = page('uz/seo-xizmati');
  const packageTable = seo.bodyBlocks.find((block: Block) => block.type === 'table' && block.headers?.some(header => /Narx/.test(header)) && block.rows?.some(row => row[0] === 'Audit'));
  assert.ok(packageTable);
  assert.deepEqual(packageTable.rows!.map((row: string[]) => row.at(-1)), ['990 000 dan', '2 490 000 dan', '4 900 000 dan', '7 900 000 dan']);
  assert.doesNotMatch(JSON.stringify(seo.bodyBlocks), /tayyor narxlar ro‘yxati yo‘q/);
  assert.ok(seo.bodyBlocks.some((block: Block) => /boshlang‘ich narxlar/.test(block.text || '') && /Yakuniy smeta/.test(block.text || '')));
});
