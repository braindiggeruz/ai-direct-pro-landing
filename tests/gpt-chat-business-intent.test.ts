// The chat's business-topic detector (plan WP-20, map 03 §9): after the first
// answer of a conversation about ordering a bot, a site, ads or a CRM, the
// chat shows one line offering the studio's help. Every phrase here is
// synthetic, written for this test; none comes from a visitor.
//
// Run: node --import tsx --test tests/gpt-chat-business-intent.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { detectBusinessTopic, type BusinessTopic } from '../src/gpt-chat/business-intent';
import { strings } from '../src/gpt-chat/i18n';
import { CHAT_ENTRIES } from '../src/shared/chat-entry';

const POSITIVE: ReadonlyArray<readonly [string, BusinessTopic]> = [
  ['Telegram bot yaratib bering narxi qancha', 'bot'],
  ['нужен сайт для магазина', 'site'],
  ['Сколько стоит чат-бот для салона красоты?', 'bot'],
  ['Do‘konim uchun Telegram-bot kerak', 'bot'],
  ['Хочу заказать разработку бота для ресторана', 'bot'],
  ['Kompaniyamiz uchun sayt yaratmoqchimiz', 'site'],
  ['Landing sahifa qancha turadi?', 'site'],
  ['Нужна настройка таргетированной рекламы для кафе', 'ads'],
  ['Instagram reklama xizmati narxi qancha?', 'ads'],
  ['Подключите amoCRM к нашему сайту', 'crm'],
  ['Bitrix24 ni sozlash kerak', 'crm'],
  ['Нужен лендинг для курсов английского', 'site'],
  ['Klinikamiz uchun chatbot kerak', 'bot'],
  ['Сколько стоит разработка интернет-магазина?', 'site'],
  ['Нам нужен Telegram-бот для приёма заказов', 'bot'],
  ['SMM xizmati kerak, narxlari qanday?', 'ads'],
  ['Бизнесга бот керак', 'bot'],
  ['Mijozlarga javob beradigan bot qilib bera olasizmi?', 'bot'],
  ['Сделайте сайт для клиники', 'site'],
  ['Сколько стоит продвижение в Instagram для магазина?', 'ads'],
  ['Restoranimiz uchun sayt va bot kerak', 'bot'],
  ['Хотим внедрить чат-бота в отдел продаж', 'bot'],
  ['Telegram-botni CRM bilan ulash kerak', 'bot'],
  ['Какая цена у сайта-визитки?', 'site'],
  ['Biznesim uchun veb-sayt ishlab chiqish kerak', 'site'],
];

const NEGATIVE: readonly string[] = [
  'botir ismli bola haqida hikoya yoz',
  'работа в Ташкенте для студентов',
  'reklama haqida insho yoz',
  'Напиши эссе про чат-ботов',
  'Reklama matnini yozib ber',
  'Как работает ChatGPT?',
  'Что такое бот?',
  'Ботинки какого цвета подойдут к пальто?',
  'Переведи на узбекский: сайт закрыт на выходные',
  'Bot nima va u qanday ishlaydi?',
  'Kurs ishi uchun sayt yaratish mavzusida reja tuz',
  'Сочинение на тему «Мой любимый сайт»',
  'Мне грустно, плохое настроение, поговори со мной как бот',
  'Расскажи про торговый центр рядом с сайтом города',
  'Telegram kanal uchun post yoz',
  'Объясни простыми словами, что такое CRM',
  'Ular bot haqida gapirishdi',
  'Kafedra sayti haqida ma’lumot ber',
  'Сколько стоит доллар в сумах?',
  'Ботир, привет! Как дела?',
  'Придумай название для бота-помощника по учёбе',
  'SMM nima?',
  'Реклама на ТВ в 90-х годах',
  'Почему ценность бренда важна для сайта?',
  'Реферат: история создания первого сайта',
];

test('at least 20 synthetic phrases each way, every one answered as written', () => {
  assert.ok(POSITIVE.length >= 20 && NEGATIVE.length >= 20);
  for (const [phrase, topic] of POSITIVE) assert.equal(detectBusinessTopic(phrase), topic, phrase);
  for (const phrase of NEGATIVE) assert.equal(detectBusinessTopic(phrase), null, phrase);
});

test('topic words are exact forms, not prefixes; intent words skip their false friends', () => {
  // A name, shoes, work: a bot only by their first letters.
  for (const phrase of ['Botir kerak', 'Нужны ботинки для магазина', 'Нужна работа в магазине', 'Saytqa kerak']) {
    assert.equal(detectBusinessTopic(phrase), null, phrase);
  }
  // A centre, a cent and value are not prices; a mood is not a setup.
  for (const phrase of ['Бот для центра', 'Бот за 10 центов', 'Ценный бот', 'Бот поднимает настроение']) {
    assert.equal(detectBusinessTopic(phrase), null, phrase);
  }
  assert.equal(detectBusinessTopic('Бот для учебного центра, сколько стоит?'), 'bot', 'a price beside the centre still counts');
  // Case, apostrophes and hyphens: one spelling for each.
  assert.equal(detectBusinessTopic('TELEGRAM-BOT KERAK'), 'bot');
  for (const apostrophe of ["'", '‘', '’', 'ʻ', 'ʼ', '`', '´']) {
    assert.equal(detectBusinessTopic(`Do${apostrophe}kon uchun bot`), 'bot', apostrophe);
  }
  assert.equal(detectBusinessTopic('Нужен чат-бот'), 'bot');
  assert.equal(detectBusinessTopic('нужен «бот»!'), 'bot', 'punctuation around a word');
  assert.equal(detectBusinessTopic(''), null);
  assert.equal(detectBusinessTopic('   '), null);
});

test('ads need a commercial wish; a bot, a site or a CRM need a wish or a business', () => {
  assert.equal(detectBusinessTopic('Reklama uchun matn yoz'), null);
  assert.equal(detectBusinessTopic('Таргет для кафе'), null, 'a business alone does not make ads an order');
  assert.equal(detectBusinessTopic('Таргет для кафе: сколько стоит?'), 'ads');
  assert.equal(detectBusinessTopic('Bot do‘kon uchun'), 'bot', 'a business behind a bot is enough');
  assert.equal(detectBusinessTopic('Bot haqida'), null);
  // A study word switches the line off whatever else is there.
  assert.equal(detectBusinessTopic('Нужен бот для магазина, это для курсовой'), null);
  assert.equal(detectBusinessTopic('Diplom ishim uchun sayt kerak'), null);
});

test('the chat’s own chips and article entry prompts never call the line', () => {
  for (const locale of ['ru', 'uz'] as const) {
    for (const chip of strings(locale).chips) assert.equal(detectBusinessTopic(chip.insert), null, chip.insert);
  }
  for (const entry of CHAT_ENTRIES) assert.equal(detectBusinessTopic(entry.prompt), null, entry.prompt);
});

test('no \\b and no lookbehind: Safari before 16.4 must parse the start bundle', () => {
  const source = readFileSync(new URL('../src/gpt-chat/business-intent.ts', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assert.doesNotMatch(source, /\(\?<[=!]/, 'lookbehind');
  assert.doesNotMatch(source, /\\b/, '\\b');
  assert.doesNotMatch(source, /new RegExp/, 'every pattern is a literal this test can read');
});
