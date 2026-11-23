// OpenAI product feed (public/openai-product-feed.jsonl → https://gptbot.uz/openai-product-feed.jsonl).
// The main rule: the price of every record is the price its page shows.
// Also: the committed file is the one the generator writes now, every line
// passes the feed rules, item ids are append-only, the edge serves the file
// as NDJSON, and no route, redirect or Function catches the path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildFeed, FEED_FILE, groupThousands, LOCKED_ITEM_IDS, normaliseSpaces, packageRow, pageText, readPage,
  serializeFeed, SERVICE_ITEMS, SERVICE_PAGES, SITE, termInEnglish, validateFeedText, type FeedRecord,
} from '../scripts/openai-feed';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const built = buildFeed(ROOT);
const committed = read(FEED_FILE);
const records = committed.trim().split('\n').map((line) => JSON.parse(line) as FeedRecord);

test('the committed feed is exactly what the generator writes from the current prices', () => {
  assert.equal(committed, serializeFeed(built.records),
    `${FEED_FILE} is stale: run npx tsx scripts/build-openai-feed.ts and commit it`);
});

test('every line passes the feed rules', () => {
  assert.deepEqual(validateFeedText(committed), []);
  assert.ok(records.length >= LOCKED_ITEM_IDS.length);
});

test('the price of every record is the price its page shows', () => {
  for (const proof of built.proofs) {
    const record = records.find((r) => r.item_id === proof.itemId);
    assert.ok(record, `${proof.itemId} missing from the feed`);
    assert.equal(record.price, `${proof.amountUzs} UZS`, `${proof.itemId}: feed price differs from its source`);
    const page = readPage(ROOT, proof.page);
    assert.equal(record.url, `${SITE}${page.url}`, `${proof.itemId}: url is not the page the price was read from`);
    assert.ok(pageText(page).includes(proof.visible), `${proof.itemId}: ${page.url} does not show «${proof.visible}»`);
    if (proof.amountUzs > 0) assert.ok(proof.visible.includes(groupThousands(proof.amountUzs)), `${proof.itemId}: proof text has another number`);
  }
  assert.equal(built.proofs.length, records.length, 'every record carries a price proof');
});

test('after a build, the prerendered page HTML shows the same price', (t) => {
  let checked = 0;
  for (const proof of built.proofs) {
    const page = readPage(ROOT, proof.page);
    const html = path.join(ROOT, 'dist', page.url, 'index.html');
    if (!fs.existsSync(html)) continue;
    const text = normaliseSpaces(fs.readFileSync(html, 'utf8').replace(/&nbsp;|&#160;/g, ' '));
    assert.ok(text.includes(normaliseSpaces(proof.visible)), `${proof.itemId}: dist${page.url}index.html does not show «${proof.visible}»`);
    checked += 1;
  }
  if (!checked) t.skip('no dist/ build present; run npm run build:fast');
});

test('the pages behind the feed are published and indexable, and every image ships in public/', () => {
  for (const proof of built.proofs) {
    const page = readPage(ROOT, proof.page);
    assert.equal(page.status, 'published', `${page.url} is not published`);
    assert.notEqual(page.robotsIndex, false, `${page.url} is noindex (it would answer 404)`);
  }
  // /assets/studio/* is the Studio build (apps/studio, base /assets/studio/), whose public/ ships verbatim.
  for (const record of records) {
    const pathname = new URL(record.image_url).pathname;
    const file = pathname.startsWith('/assets/studio/')
      ? path.join(ROOT, 'apps/studio/public', pathname.slice('/assets/studio/'.length))
      : path.join(ROOT, 'public', pathname);
    assert.ok(fs.existsSync(file), `${record.item_id}: ${record.image_url} is not a shipped file (${path.relative(ROOT, file)})`);
  }
});

test('item ids are the locked list in order, plus appended ones only', () => {
  const ids = records.map((r) => r.item_id);
  assert.deepEqual(ids.slice(0, LOCKED_ITEM_IDS.length), [...LOCKED_ITEM_IDS]);
  assert.equal(new Set(ids).size, ids.length);
});

test('each English package description was written from the cell the page shows now', () => {
  for (const item of SERVICE_ITEMS) {
    const page = readPage(ROOT, SERVICE_PAGES[item.page].file);
    assert.equal(packageRow(page, item.row).includes, normaliseSpaces(item.sourceRu),
      `${item.itemId}: «Что входит» changed on ${page.url}; review the English text in scripts/openai-feed.ts and update sourceRu`);
  }
});

test('wording rules: monthly, starting price, ad budget, AI costs, not OpenAI, never "official"', () => {
  const byId = new Map(records.map((r) => [r.item_id, r]));
  for (const id of ['gptbot-ai-chat-trial', 'gptbot-ai-pack-3d', 'gptbot-ai-pack-1m']) {
    assert.match(byId.get(id)!.description, /Independent AI chat, not ChatGPT and not an OpenAI product\./);
  }
  for (const id of ['gptbot-ai-pack-3d', 'gptbot-ai-pack-1m']) assert.equal(byId.get(id)!.accepts_returns, false);
  for (const item of SERVICE_ITEMS) {
    const record = byId.get(item.itemId)!;
    assert.match(record.description, /Starting price; the final scope and price are fixed in a quote before work starts\./);
    assert.ok(!('return_policy' in record), `${item.itemId}: the published offer covers chat packs and Studio, not agency services`);
  }
  for (const id of ['gptbot-smm-start', 'gptbot-smm-business', 'gptbot-smm-pro', 'gptbot-target-launch', 'gptbot-target-management', 'gptbot-ppc-launch', 'gptbot-ppc-management']) {
    assert.match(byId.get(id)!.description, /Advertising budget is paid separately\./);
  }
  for (const id of ['gptbot-ai-bot-business', 'gptbot-ai-bot-business-tier', 'gptbot-ai-bot-pro', 'gptbot-ai-bot-support']) {
    assert.match(byId.get(id)!.description, /AI\/API costs/);
  }
  for (const id of ['gptbot-ai-bot-support', 'gptbot-tg-support', 'gptbot-web-support', 'gptbot-seo-start', 'gptbot-smm-pro', 'gptbot-target-management', 'gptbot-ppc-management']) {
    assert.match(byId.get(id)!.description, /Price per month\./);
  }
  for (const id of ['gptbot-ai-bot-business', 'gptbot-seo-audit', 'gptbot-target-launch', 'gptbot-web-eshop']) {
    assert.doesNotMatch(byId.get(id)!.description, /Price per month/);
  }
  assert.ok(!records.some((r) => /sotuvchi|market/i.test(r.url)), 'GPTBot Market is not in the feed');
});

test('the package table parser fails closed on wording it does not know', () => {
  const page = (rows: string[][]) => ({ url: '/x/', bodyBlocks: [{ type: 'table', headers: ['Пакет', 'Что входит', 'Срок', 'Цена (сум)'], rows }] });
  assert.equal(packageRow(page([['Старт', 'a', '5 дней', 'от 1 990 000']]), 'Старт').amountUzs, 1_990_000);
  assert.equal(packageRow(page([['Поддержка', 'a', 'ежемесячно', 'от 490 000 / мес']]), 'Поддержка').monthly, true);
  assert.equal(packageRow(page([['Старт', 'a', 'в месяц', 'от\u00a02\u00a0490\u00a0000']]), 'Старт').monthly, true);
  assert.throws(() => packageRow(page([['Старт', 'a', '5 дней', '1 990 000 сум']]), 'Старт'), /price cell/);
  assert.throws(() => packageRow(page([['Старт', 'a', '5 дней', 'по запросу']]), 'Старт'), /price cell/);
  assert.throws(() => packageRow(page([['Бизнес', 'a', '5 дней', 'от 1']]), 'Старт'), /not found/);
  assert.throws(() => termInEnglish('около недели', false), /Unknown package term/);
  assert.equal(termInEnglish('21 день', true), 'Timeline: 21 days, counted from receipt of access and materials.');
  assert.equal(termInEnglish('разово, 5 дней', false), 'One-time service, timeline: 5 days.');
});

test('the validator rejects every rule violation', () => {
  const good = JSON.parse(committed.split('\n')[5]) as Record<string, unknown>;
  const rest = committed.split('\n').filter(Boolean).filter((_, i) => i !== 5);
  const feedWith = (record: Record<string, unknown>): string => [...rest, JSON.stringify(record)].join('\n') + '\n';
  const cases: Array<[string, Record<string, unknown> | string, RegExp]> = [
    ['thousands separator', { ...good, price: '1 990 000 UZS' }, /price is not/],
    ['decimal price', { ...good, price: '1990000.00 UZS' }, /price is not/],
    ['other currency', { ...good, price: '199 USD' }, /price is not/],
    ['null value', { ...good, brand: null }, /empty or a placeholder/],
    ['placeholder', { ...good, product_category: 'n/a' }, /empty or a placeholder/],
    ['empty string', { ...good, description: '' }, /empty or a placeholder/],
    ['missing field', Object.fromEntries(Object.entries(good).filter(([k]) => k !== 'image_url')), /missing image_url/],
    ['long title', { ...good, title: 'x'.repeat(151) }, /title missing or longer than 150/],
    ['Cyrillic title', { ...good, title: 'AI-бот для бизнеса' }, /not English/],
    ['official', { ...good, description: `${String(good.description)} Official partner.` }, /official/],
    ['http url', { ...good, url: 'http://gptbot.uz/ru/ai-bot-dlya-biznesa/' }, /url is not an absolute/],
    ['foreign image', { ...good, image_url: 'https://example.com/a.jpg' }, /image_url is not an absolute/],
    ['not an image', { ...good, image_url: 'https://gptbot.uz/ru/ai-bot-dlya-biznesa/' }, /not a jpg\/png\/webp/],
    ['bad availability', { ...good, availability: 'available' }, /availability not allowed/],
    ['other country', { ...good, target_countries: ['US'] }, /country must be UZ/],
    ['renamed id', { ...good, item_id: 'gptbot-ai-bot-start' }, /locked item_id is missing/],
  ];
  for (const [name, record, expected] of cases) {
    const errors = validateFeedText(feedWith(record as Record<string, unknown>));
    assert.ok(errors.some((e) => expected.test(e)), `${name}: expected ${expected}, got ${JSON.stringify(errors)}`);
  }
  assert.ok(validateFeedText(`${committed}${committed.split('\n')[0]}\n`).some((e) => /duplicate item_id/.test(e)));
  assert.ok(validateFeedText(`${committed}{not json\n`).some((e) => /not a JSON object/.test(e)));
  assert.ok(validateFeedText(`\ufeff${committed}`).some((e) => /BOM/.test(e)));
});

test('the edge serves the feed as NDJSON with one Cache-Control, and nothing intercepts the path', () => {
  const generator = read('scripts/generate-robots.ts');
  const start = generator.indexOf("headers.push('/openai-product-feed.jsonl');");
  assert.ok(start > -1, 'feed block missing from scripts/generate-robots.ts (it writes the production dist/_headers)');
  const block = generator.slice(start, generator.indexOf('// Markdown twins', start));
  for (const line of ['  ! Cache-Control', '  Cache-Control: public, max-age=3600', '  Content-Type: application/x-ndjson; charset=utf-8', '  Access-Control-Allow-Origin: *']) {
    assert.ok(block.includes(`headers.push('${line}');`), `generate-robots.ts feed block lacks «${line}»`);
  }
  const fallback = read('public/_headers');
  assert.match(fallback, /\/openai-product-feed\.jsonl\n {2}Cache-Control: public, max-age=3600\n {2}Content-Type: application\/x-ndjson; charset=utf-8\n {2}Access-Control-Allow-Origin: \*/);

  const routes = JSON.parse(read('public/_routes.json')) as { include: string[] };
  const caught = routes.include.filter((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test('/openai-product-feed.jsonl'));
  assert.deepEqual(caught, [], 'a Pages Function route would answer the feed path');
  assert.doesNotMatch(read('public/_redirects'), /^\/(\*|openai-product-feed\.jsonl)\s/m, 'a redirect rule would catch the feed path');
  assert.doesNotMatch(read('scripts/generate-robots.ts'), /lines\.push\('\/(\*|openai-product-feed\.jsonl)\s/, 'a generated redirect rule would catch the feed path');
  assert.ok(!fs.existsSync(path.join(ROOT, 'functions', 'openai-product-feed.jsonl.ts')));
});

test('every build regenerates the feed before vite copies public/ into dist/', () => {
  const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  for (const hook of ['prebuild', 'prebuild:fast', 'prebuild:cf']) {
    assert.match(scripts[hook], /tsx scripts\/build-openai-feed\.ts/, `${hook} must run the feed generator`);
  }
  assert.match(scripts.test, /tests\/openai-product-feed\.test\.ts/);
});
