// OpenAI product feed: public/openai-product-feed.jsonl.gz (the Hosted URL),
// .tsv (fallback) and .jsonl (plain copy), served from https://gptbot.uz/.
// The main rule: the price of every record is the price its page shows.
// Also: the committed files are what the generator writes now, the .gz
// decompresses to the .jsonl byte for byte, the .tsv holds the same records,
// every image is a shipped JPEG or PNG, item ids are append-only, the edge
// serves the right types (the .gz without Content-Encoding), and no route,
// redirect or Function catches the paths.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildFeed, FEED_FILE, FEED_GZ_FILE, FEED_IMAGE_DIR, FEED_TSV_FILE, FREE_TRIAL_ITEM_ID, groupThousands, gunzipText,
  INCLUDE_FREE_TRIAL, LOCKED_ITEM_IDS, normaliseSpaces, packageRow, pageText, parseTsv, publicFile, readImageLock,
  readPage, refreshServicePricesManifest, serializeFeed, serializeTsv, SERVICE_ITEMS, SERVICE_PAGES, servicePricesManifest,
  sha256, SITE, termInEnglish, TSV_COLUMNS,
  validateFeedText, validateTsvText, webpSources, type FeedRecord,
} from '../scripts/openai-feed';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const built = buildFeed(ROOT);
const committed = read(FEED_FILE);
const records = committed.trim().split('\n').map((line) => JSON.parse(line) as FeedRecord);
const gz = fs.readFileSync(path.join(ROOT, FEED_GZ_FILE));
const tsv = read(FEED_TSV_FILE);

test('the committed feed is exactly what the generator writes from the current prices', () => {
  assert.equal(committed, serializeFeed(built.records),
    `${FEED_FILE} is stale: run npx tsx scripts/build-openai-feed.ts and commit it`);
  assert.equal(tsv, serializeTsv(built.records), `${FEED_TSV_FILE} is stale: run npx tsx scripts/build-openai-feed.ts and commit it`);
});

test('the .jsonl.gz is a gzip archive that decompresses to the .jsonl byte for byte', () => {
  assert.deepEqual([...gz.subarray(0, 2)], [0x1f, 0x8b], 'gzip magic bytes');
  assert.equal(gz[2], 8, 'deflate');
  assert.ok(Buffer.from(gunzipText(gz), 'utf8').equals(fs.readFileSync(path.join(ROOT, FEED_FILE))), '.jsonl.gz ≠ .jsonl after gunzip');
});

test('the .tsv parses into the same records: same item ids, order and prices', () => {
  assert.deepEqual(validateTsvText(tsv, committed), []);
  const parsed = parseTsv(tsv);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.header, [...TSV_COLUMNS]);
  assert.deepEqual(parsed.records.map((r) => r.item_id), records.map((r) => r.item_id));
  assert.deepEqual(parsed.records.map((r) => r.price), records.map((r) => r.price));
  assert.equal(parsed.records.length, records.length);
  assert.ok(!tsv.includes('\r') && tsv.charCodeAt(0) !== 0xfeff, 'UTF-8 without BOM, LF only');
  for (const row of tsv.slice(0, -1).split('\n')) assert.equal(row.split('\t').length, TSV_COLUMNS.length, 'one cell per column, no tab inside a value');
  assert.match(tsv.split('\n')[1], /\t\["UZ"\]\tUZ\t/, 'target_countries is a JSON string');
  assert.throws(() => serializeTsv([{ ...records[0], title: 'a\tb' }]), /tab or line break/);
  assert.throws(() => serializeTsv([{ ...records[0], description: 'a\nb' }]), /tab or line break/);
  assert.throws(() => serializeTsv([{ ...records[0], extra: 'x' } as FeedRecord]), /has no TSV column/);
  assert.ok(validateTsvText(tsv.replace('\t5000 UZS\t', '\t5900 UZS\t'), committed).some((e) => /differs/.test(e)));
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

test('the pages behind the feed are published and indexable', () => {
  for (const proof of built.proofs) {
    const page = readPage(ROOT, proof.page);
    assert.equal(page.status, 'published', `${page.url} is not published`);
    assert.notEqual(page.robotsIndex, false, `${page.url} is noindex (it would answer 404)`);
  }
});

/** Width of a JPEG (SOF marker) or PNG (IHDR). */
function imageWidth(data: Buffer): number {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return data.readUInt32BE(16);
  for (let i = 2; i < data.length - 9;) {
    if (data[i] !== 0xff) { i += 1; continue; }
    const marker = data[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return data.readUInt16BE(i + 7);
    i += 2 + data.readUInt16BE(i + 2);
  }
  throw new Error('no SOF marker');
}

test('every image_url is a shipped JPEG or PNG; WebP og:images are linked through 1200px JPEG copies', () => {
  for (const record of records) {
    const sitePath = new URL(record.image_url).pathname;
    assert.match(sitePath, /\.(jpe?g|png)$/i, `${record.item_id}: image_url is not .jpg or .png`);
    const file = publicFile(ROOT, sitePath);
    assert.ok(fs.existsSync(file), `${record.item_id}: ${record.image_url} is not a shipped file (${path.relative(ROOT, file)})`);
    const data = fs.readFileSync(file);
    const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const png = data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    assert.ok(jpeg || png, `${record.item_id}: ${sitePath} is not JPEG or PNG data`);
    assert.ok(imageWidth(data) <= 1200 && imageWidth(data) >= 600, `${record.item_id}: ${sitePath} is ${imageWidth(data)}px wide`);
  }
  const lock = readImageLock(ROOT);
  const sources = webpSources(ROOT);
  assert.deepEqual(Object.keys(lock).sort(), sources, 'the image lock lists exactly the WebP og:images the feed needs');
  for (const [source, entry] of Object.entries(lock)) {
    assert.equal(sha256(fs.readFileSync(publicFile(ROOT, source))), entry.sourceSha256, `${source} changed: run npx tsx scripts/build-openai-feed.ts`);
    const copy = fs.readFileSync(publicFile(ROOT, entry.jpg));
    assert.equal(sha256(copy), entry.jpgSha256, `${entry.jpg} differs from its lock entry`);
    assert.ok(entry.jpg.startsWith(FEED_IMAGE_DIR) && entry.jpg.includes(entry.jpgSha256.slice(0, 8)), 'the copy name carries its content hash');
    assert.equal(imageWidth(copy), 1200);
    assert.equal(entry.width, 1200);
  }
  const shipped = fs.readdirSync(publicFile(ROOT, FEED_IMAGE_DIR)).sort();
  assert.deepEqual(shipped, Object.values(lock).map((e) => path.basename(e.jpg)).sort(), 'no orphan files in public/assets/feed/');
  // The page images themselves stay as they are.
  for (const source of sources) assert.match(source, /\.webp$/);
});

test('INCLUDE_FREE_TRIAL switches the 0 UZS trial row without breaking the locked-id rule', () => {
  assert.equal(INCLUDE_FREE_TRIAL, true, 'the owner keeps the trial row for now (23.11.2026)');
  assert.equal(records[0].item_id, FREE_TRIAL_ITEM_ID);
  assert.equal(records[0].price, '0 UZS');
  const without = buildFeed(ROOT, { includeFreeTrial: false });
  assert.ok(!without.records.some((r) => r.item_id === FREE_TRIAL_ITEM_ID));
  assert.equal(without.records.length, built.records.length - 1);
  const text = serializeFeed(without.records);
  assert.deepEqual(validateFeedText(text, { includeFreeTrial: false }), []);
  assert.ok(validateFeedText(text, { includeFreeTrial: true }).some((e) => e.includes(`${FREE_TRIAL_ITEM_ID}: locked item_id is missing`)));
  assert.deepEqual(validateTsvText(serializeTsv(without.records), text), []);
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
  for (const id of [...(INCLUDE_FREE_TRIAL ? [FREE_TRIAL_ITEM_ID] : []), 'gptbot-ai-pack-3d', 'gptbot-ai-pack-1m']) {
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
    ['not an image', { ...good, image_url: 'https://gptbot.uz/ru/ai-bot-dlya-biznesa/' }, /not a JPEG or PNG/],
    ['webp image', { ...good, image_url: 'https://gptbot.uz/assets/digital/smm-prodvizhenie-tashkent-1200.webp' }, /not a JPEG or PNG/],
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

test('the edge serves each feed file with its type and one Cache-Control; the .gz without Content-Encoding', () => {
  const generator = read('scripts/generate-robots.ts');
  const fallback = read('public/_headers');
  const blocks: Array<[string, string[]]> = [
    ['/openai-product-feed.jsonl', ['  Cache-Control: public, max-age=3600', '  Content-Type: application/x-ndjson; charset=utf-8']],
    ['/openai-product-feed.jsonl.gz', ['  Cache-Control: public, max-age=3600, no-transform', '  Content-Type: application/gzip']],
    ['/openai-product-feed.tsv', ['  Cache-Control: public, max-age=3600', '  Content-Type: text/tab-separated-values; charset=utf-8']],
  ];
  for (const [file, lines] of blocks) {
    const start = generator.indexOf(`headers.push('${file}');`);
    assert.ok(start > -1, `${file} block missing from scripts/generate-robots.ts (it writes the production dist/_headers)`);
    const next = generator.indexOf("headers.push('/", start + 1);
    const block = generator.slice(start, next);
    for (const line of ['  ! Cache-Control', ...lines, '  Access-Control-Allow-Origin: *']) {
      assert.ok(block.includes(`headers.push('${line}');`), `generate-robots.ts ${file} block lacks «${line}»`);
    }
    assert.ok(!block.split('\n').some((l) => l.startsWith('headers.push') && /Content-Encoding/i.test(l)), `${file}: no Content-Encoding header`);
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(fallback, new RegExp(`${escaped}\n {2}! Cache-Control\n`), `public/_headers ${file}: detach block`);
    assert.match(fallback, new RegExp(`${escaped}\n${lines.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\n')}\n {2}Access-Control-Allow-Origin: \\*`), `public/_headers ${file}: header block`);
  }

  const routes = JSON.parse(read('public/_routes.json')) as { include: string[] };
  for (const file of blocks.map(([f]) => f)) {
    const caught = routes.include.filter((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(file));
    assert.deepEqual(caught, [], `a Pages Function route would answer ${file}`);
  }
  assert.doesNotMatch(read('public/_redirects'), /^\/(\*|openai-product-feed[^\s]*)\s/m, 'a redirect rule would catch a feed path');
  assert.doesNotMatch(generator, /lines\.push\('\/(\*|openai-product-feed[^\s']*)\s/, 'a generated redirect rule would catch a feed path');
  assert.ok(!fs.readdirSync(path.join(ROOT, 'functions')).some((f) => f.startsWith('openai-product-feed')));
});

test('the feed files keep LF on Windows checkouts', () => {
  const attributes = read('.gitattributes');
  for (const line of ['public/openai-product-feed.jsonl text eol=lf', 'public/openai-product-feed.tsv text eol=lf', 'public/openai-product-feed.jsonl.gz binary']) {
    assert.ok(attributes.includes(line), `.gitattributes lacks «${line}»`);
  }
});

test('every build regenerates the feed before vite copies public/ into dist/', () => {
  const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  for (const hook of ['prebuild', 'prebuild:fast', 'prebuild:cf']) {
    assert.match(scripts[hook], /tsx scripts\/build-openai-feed\.ts/, `${hook} must run the feed generator`);
  }
  assert.match(scripts.test, /tests\/openai-product-feed\.test\.ts/);
});

test('llms.txt quotes the current business service prices, read from the same package tables as the feed', () => {
  const llms = read('public/llms.txt');
  const block = servicePricesManifest(ROOT);
  assert.ok(llms.includes(block), 'public/llms.txt service-prices block is stale: run npx tsx scripts/build-openai-feed.ts');
  assert.equal(refreshServicePricesManifest(llms, ROOT), llms);
  // Every price in the block is a price a feed record carries.
  const feedPrices = new Set(records.map((r) => Number(r.price.split(' ')[0])));
  for (const [, digits] of block.matchAll(/from (\d{1,3}(?: \d{3})+) UZS/g)) {
    assert.ok(feedPrices.has(Number(digits.replace(/ /g, ''))), `${digits} UZS in llms.txt is not a feed price`);
  }
  assert.match(block, /https:\/\/gptbot\.uz\/openai-product-feed\.jsonl\.gz/);
  assert.doesNotMatch(llms, /scoped and priced per business/, 'bots have published starting prices now');
  const stale = llms.replace(/Start from 1 990 000 UZS/, 'Start from 1 000 UZS');
  assert.equal(refreshServicePricesManifest(stale, ROOT), llms, 'the generator repairs a stale price');
});
