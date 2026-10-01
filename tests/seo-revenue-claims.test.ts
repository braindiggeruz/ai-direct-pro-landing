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

import { PAID_MESSAGES, PRICE_TIYIN } from '../functions/lib/gpt-chat/billing-config';
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

/** 2 000 000 tiyin → "20 000", grouped the way the pages write sums. */
const sum = (tiyin: number) => String(tiyin / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const PRICE = sum(PRICE_TIYIN);

test('the pack the pages describe is the pack the code sells', () => {
  assert.equal(PRICE, '20 000');
  for (const file of CHAT_PAGES) {
    const text = readFileSync(`content/pages/${file}.json`, 'utf8');
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
  assert.match(all, /Click или Uzum Bank/);
});

test('the free limits on the pricing page are the deployed free limits', () => {
  const cfg = resolveConfig(deployedEnv());
  const all = JSON.stringify(tariffs);
  assert.ok(all.includes(`до ${cfg.freeDailyLimit} сообщений в день и ${cfg.freeHourlyLimit} в час`), 'table row and summary');
  assert.ok(tariffs.faq.some((item) => item.a.includes(`до ${cfg.freeDailyLimit} сообщений в день и ${cfg.freeHourlyLimit} в час`)));
});

test('the pricing page is honest before and after payment opens', () => {
  const payment = tariffs.faq.find((item) => /оплатить/i.test(item.q));
  assert.ok(payment, 'Pricing must explain how and when the pack can be paid');
  assert.match(payment.a, /Click или Uzum Bank/);
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
    const text = readFileSync(`content/pages/${file}.json`, 'utf8');
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
