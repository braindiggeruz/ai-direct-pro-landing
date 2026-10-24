import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { FREE_TRIAL_LIMIT } from '../functions/lib/gpt-chat/trial-store';
import { publishedStudioUrls } from '../apps/studio/shared/published-urls';
import { DESCRIBED_REDIRECTS, buildLlmsFull, renderTwins, siteUrlPaths, type LlmTwin } from '../scripts/generate-llm-markdown';
import { LLM_MARKDOWN_URLS } from '../scripts/llm-pages';
import { STATIC_ROUTES } from '../src/shared/audit';
import type { BlogArticle, Page, Redirect } from '../src/shared/types';

const read = (file: string) => fs.readFileSync(file, 'utf8');
const chatFiles = ['content/pages/ru/gpt-chat.json', 'content/pages/uz/gpt-uzbek-tilida.json'];
const acquisitionFiles = [...chatFiles, 'content/pages/ru/gpt-na-russkom.json'];
// The RU↔UZ translator pages (published 2026-10-24, chatRole translator): the same chat and
// the same 3 lifetime trial replies, so the same disclosure; they make no
// presentation claim, so the PPTX test below does not apply to them.
const translatorFiles = ['content/pages/ru/russko-uzbekskiy-perevodchik.json', 'content/pages/uz/rus-ozbek-tarjimon.json'];
const trialFiles = [...acquisitionFiles, ...translatorFiles, 'content/pages/uz/gpt-chat-qollanma.json',
  'content/blog/uz/referat-va-mustaqil-ish.json', 'content/blog/uz/rezyume-tayyorlash.json',
  // Unprotected RU funnel pages that describe the free chat (growth backlog
  // W1-01, 2026-10-24). chat-gpt-online leaves this list when its C23 301 ships.
  'content/pages/ru/gde-polzovatsya-gpt-besplatno.json', 'content/pages/ru/gpt-chat-guide.json',
  'content/pages/ru/promty-gpt-chatgpt-50-primerov.json', 'content/blog/ru/chat-gpt-na-russkom.json',
  'content/blog/ru/chat-gpt-online.json',
  // The UZ explainer that now states the trial terms next to its chat link (W1-02).
  'content/pages/uz/suniy-intellekt.json'];

test('chat acquisition copy and zero-price structured offers disclose the actual lifetime trial', () => {
  for (const file of [...acquisitionFiles, ...translatorFiles]) {
    const page = JSON.parse(read(file));
    for (const field of ['description', 'ogDescription', 'heroSubtitle']) {
      assert.match(page[field], new RegExp(String(FREE_TRIAL_LIMIT)), `${file}: ${field} must disclose the trial size`);
      assert.match(page[field], /sinov|пробн/, `${file}: ${field} must say these are trial replies`);
    }
    const app = page.extraJsonLd.find((item: { '@type': string }) => item['@type'] === 'SoftwareApplication');
    assert.equal(app.offers.price, '0');
    assert.equal(app.offers.priceCurrency, 'UZS', `${file}: the zero offer describes the local trial`);
    assert.match(app.offers.name, new RegExp(String(FREE_TRIAL_LIMIT)));
    assert.match(app.offers.description, /yangilanmaydi|без ежедневного обновления/);
    assert.match(app.offers.description, /AI.paket|AI-пакет/);
  }
});

test('web chat and its linked guides cannot republish daily/hourly or shared-IP trial terms', () => {
  for (const file of trialFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /kunlik va soatlik|kunlik,? soatlik|har kuni bepul xabar|kuniga 15|soatiga 5|дневной и часовой лимит|бесплатный дневной лимит|лимит сообщений в день|в рамках дневного лимита|[Бб]азов\S* (?:бесплатн\S* )?доступ|[Лл]имит считается по IP|[Bb]epul limit IP-manzil/iu, file);
    assert.match(source, /3 ta (?:bepul )?sinov|3 (?:бесплатных )?пробных/, file);
    assert.match(source, /yangilanmaydi|не обновляют|не обновляются/, file);
  }
  const manual = read('content/pages/uz/gpt-chat-qollanma.json');
  assert.match(manual, /bir oyga 300 ta javob/);
  assert.match(manual, /kuniga 50 tagacha/);
});

test('chat and AI-source descriptions keep presentation export separate from ordinary chat replies', () => {
  for (const file of [...acquisitionFiles, 'public/llms.txt', 'public/llms-full.txt']) {
    const source = read(file);
    assert.doesNotMatch(source, /independent, text-only|works with text only|он работает только с текстом|ИИ-чат[^\n]*только текстовые ответы|"Только текстовые ответы"|"Faqat matnli javob"|\.pptx fayl yaratmaydi|makes no \.pptx|файл презентации чат не создаёт/iu, file);
    assert.match(source, /PPTX/);
    assert.match(source, /alohida taqdimot|режим(?:е|а)? презентаций|separate presentation mode/, file);
    assert.match(source, /o‘z limiti va paketlari|отдельными лимитами и пакетами|own limits and plans/, file);
  }
});

test('official login help keeps the official destination first and identifies the limited independent trial', () => {
  const article = JSON.parse(read('content/blog/uz/chatgptga-qanday-kirish-mumkin.json'));
  const body = JSON.stringify(article.body);
  const official = body.indexOf('https://chatgpt.com/');
  const alternative = body.indexOf('/uz/gpt-uzbek-tilida/');
  assert.ok(official >= 0 && alternative > official, 'solve official account access before offering another service');
  assert.match(body, /3 ta bepul sinov javobi/);
  assert.match(body, /keyin AI paket/);
  assert.match(body, /hisobingizga kirishni tiklamaydi/);
  assert.equal(article.datePublished, '2026-09-01', 'a substantive refresh must not invent a new publication date');
  assert.equal(article.canonical, 'https://gptbot.uz/uz/blog/chatgptga-qanday-kirish-mumkin/');
});

// Growth backlog W2-07 (2026-10-24 audit, L4-08): scripts/generate-llm-markdown.ts
// builds dist/llms-full.txt from the cluster notes in public/llms-full.txt, all
// of public/llms.txt and the bodies of the curated Markdown twins. These tests
// build the same file from content/ and public/, so they need no dist.
const lf = (text: string) => text.replace(/\r\n?/g, '\n').trim();
let built: { twins: LlmTwin[]; full: string } | undefined;
function llmsFull() {
  if (!built) {
    const { twins } = renderTwins();
    built = { twins, full: buildLlmsFull(read('public/llms-full.txt'), read('public/llms.txt'), twins) };
  }
  return built;
}
function contentDocs<T>(dir: string): T[] {
  return fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(read(path.join(dir, file))) as T);
}

test('llms-full.txt is a superset of llms.txt: all of it, plus the cluster notes and every twin body', () => {
  const { twins, full } = llmsFull();
  const llms = read('public/llms.txt');
  const notes = read('public/llms-full.txt');
  assert.ok(full.startsWith(lf(notes)), 'the cluster notes open the file');
  assert.ok(full.includes(lf(llms)), 'llms.txt must appear word for word');
  assert.ok(Buffer.byteLength(full) > Buffer.byteLength(llms), 'llms-full.txt must be larger than llms.txt');
  assert.deepEqual(twins.map((twin) => twin.url).sort(), [...LLM_MARKDOWN_URLS].sort(), 'every curated twin is rendered');
  for (const twin of twins) {
    assert.ok(full.includes(`URL: https://gptbot.uz${twin.url}\n\n${lf(twin.markdown)}`), `${twin.url}: body missing`);
  }
  // The notes keep only what llms.txt lacks; a section in both would be printed twice.
  const sections = (text: string) => new Set(text.split(/\r?\n/).filter((line) => line.startsWith('## ')));
  const inLlms = sections(llms);
  assert.deepEqual([...sections(notes)].filter((heading) => inLlms.has(heading)), []);
});

test('llms-full.txt opens with the independence clause and the lifetime trial', () => {
  const { full } = llmsFull();
  const opening = full.slice(0, full.indexOf('\n## '));
  assert.match(opening, /independent AI chat/);
  assert.match(opening, /not ChatGPT and not an OpenAI product/);
  assert.match(opening, new RegExp(`${FREE_TRIAL_LIMIT} free trial replies`));
  assert.match(full, new RegExp(`${FREE_TRIAL_LIMIT} successful lifetime trial replies[^\\n]*without daily renewal`));
  assert.doesNotMatch(full, /up to 15 messages a day|up to 5 an hour/);
  assert.doesNotMatch(full, /GPTBot\.uz is (?:an? |the )?(?:official|authori[sz]ed)/i);
});

test('every gptbot.uz URL in llms-full.txt is served by the build', () => {
  const { twins, full } = llmsFull();
  const served = new Set<string>([
    ...contentDocs<Page>('content/pages').filter((page) => page.status !== 'draft').map((page) => page.url),
    ...contentDocs<BlogArticle>('content/blog')
      .filter((article) => article.status === 'published' && article.robotsIndex !== false).map((article) => article.url),
    ...publishedStudioUrls(process.cwd()),
    ...STATIC_ROUTES,
    ...twins.map((twin) => `${twin.url}index.html.md`),
    // Files in public/ (Vite copies them) and the files the generators of every build chain write.
    ...fs.readdirSync('public', { recursive: true, encoding: 'utf8' }).map((file) => `/${file.replace(/\\/g, '/')}`),
    '/robots.txt', '/sitemap.xml', '/ru/blog/feed.xml', '/uz/blog/feed.xml', '/updates/atom.xml',
  ]);
  const redirects = JSON.parse(read('content/seo/redirects.json')) as Redirect[];
  for (const from of DESCRIBED_REDIRECTS) {
    const hop = redirects.find((redirect) => redirect.from === from);
    assert.ok(hop && served.has(hop.to), `${from} must stay a redirect to a served page`);
  }
  const urls = siteUrlPaths(full);
  assert.ok(urls.length > 100, 'the URL extraction found the links');
  assert.deepEqual(urls.filter((url) => !served.has(url) && !DESCRIBED_REDIRECTS.has(url)), []);
});
