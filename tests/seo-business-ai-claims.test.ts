import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const article = JSON.parse(readFileSync('content/blog/ru/neyroseti-dlya-biznesa-v-uzbekistane.json', 'utf8'));
const copy = JSON.stringify({
  title: article.title, description: article.description, intro: article.intro,
  body: article.body, faq: article.faq, ogTitle: article.ogTitle, ogDescription: article.ogDescription,
});

test('the business AI guide does not reintroduce unsourced return, price, salary or speed benchmarks', () => {
  assert.doesNotMatch(copy, /10[–-]15.*(?:обращ|сообщ|звон)|20[–-]40\s*%|25[–-]40\s*%|70[–-]80\s*%|типовые 80\s*%/);
  assert.doesNotMatch(copy, /утроить|в разы выше|15 минут вместо двух часов|дешевле половины зарплаты|треть менеджера/);
  assert.doesNotMatch(copy, /500 000|1 500 000|2 500 000|3 [–-] 15 млн|4[–-]8 млн|\$2 000|0 [–-] 300 000/);
  assert.doesNotMatch(copy, /окупаются, если|автоматизация уже окупается|скорость реакции.*напрямую влияет на локальную выдачу/i);
  assert.match(article.faq[3].a, /Универсального порога.*нет/);
});

test('the guide teaches how to evaluate a pilot without presenting scenarios as real business results', () => {
  assert.match(copy, /исходный период/);
  assert.match(copy, /сопоставимую группу/);
  assert.match(copy, /контрольной группой/);
  assert.match(copy, /валовая прибыль|валовой прибыли/);
  assert.match(copy, /фактически сокращённые расходы/);
  assert.match(copy, /минус все затраты/);
  assert.match(copy, /не подменяйте валовую прибыль выручкой/);
  assert.match(copy, /результат остаётся неопределённым/);
  assert.match(copy, /не результаты клиентов GPTBot\.uz/);
  assert.match(copy, /не подтверждают оплату/);
});

test('factual repair preserves all twelve tasks and the existing article identity', () => {
  assert.equal(article.url, '/ru/blog/neyroseti-dlya-biznesa-v-uzbekistane/');
  assert.equal(article.canonical, `https://gptbot.uz${article.url}`);
  assert.equal(article.title, 'Нейросети для бизнеса в Узбекистане: 12 задач для ИИ');
  assert.equal(article.datePublished, '2026-07-08');
  assert.equal(article.status, 'published');
  assert.equal(article.robotsIndex, true);
  assert.equal(article.robotsFollow, true);
  assert.equal(article.body.filter((block: { type: string }) => block.type === 'h3').length, 12);
  assert.ok(article.internalLinks.some((link: { target: string }) => link.target === article.targetMoneyPage));
  assert.ok(article.sources.some((source: { url: string; note: string }) => source.url.includes('evaluation-best-practices') && /Не источник цен/.test(source.note)));
});

test('the hybrid architecture article explains its tradeoffs without a market price or fast-payback promise', () => {
  const hybrid = JSON.parse(readFileSync('content/blog/ru/gpt-bot-vs-chat-bot.json', 'utf8'));
  const text = JSON.stringify(hybrid);
  assert.doesNotMatch(text, /по 100 долларов|по нескольку тысяч|окупится быстро|лучшая связка|работает лучше всего/);
  assert.match(text, /экономический результат проверяйте на пилоте/);
  assert.match(text, /При неизвестном ответе или ошибке система передаёт разговор человеку/);
  assert.equal(hybrid.url, '/ru/blog/gpt-bot-vs-chat-bot/');
  assert.equal(hybrid.canonical, `https://gptbot.uz${hybrid.url}`);
  assert.equal(hybrid.title, 'Гибридный чат-бот: как совместить сценарии и GPT');
  assert.equal(hybrid.datePublished, '2026-05-30');
  assert.equal(hybrid.topicCluster, 'gpt-bot-architecture');
});
