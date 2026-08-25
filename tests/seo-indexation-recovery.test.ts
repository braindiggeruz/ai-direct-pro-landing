import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');
const RETIRED_URL = '/ru/gpt-na-russkom-kak-zadavat-zaprosy/';
const HOW_TO_URL = '/ru/blog/chat-gpt-na-russkom/';
const DEFINITION_URL = '/ru/chto-takoe-gpt-i-kak-polzovatsya/';
const PROMPTS_URL = '/ru/promty-gpt-chatgpt-50-primerov/';

type JsonDoc = Record<string, unknown>;

function readJson<T = JsonDoc>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8')) as T;
}

function allJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allJsonFiles(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

test('the competing Russian query guide is consolidated with one permanent redirect', () => {
  const retiredFile = path.join(CONTENT, 'pages', 'ru', 'gpt-na-russkom-kak-zadavat-zaprosy.json');
  const redirects = readJson<Array<{ from: string; to: string; statusCode: number }>>('content/seo/redirects.json');
  const matches = redirects.filter((redirect) => redirect.from === RETIRED_URL);

  assert.equal(fs.existsSync(retiredFile), false, 'redirect sources must not remain as generated content');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].to, HOW_TO_URL);
  assert.equal(matches[0].statusCode, 301);
});

test('published content links directly to the surviving guide, never the redirect source', () => {
  const offenders: string[] = [];
  for (const root of [path.join(CONTENT, 'pages'), path.join(CONTENT, 'blog')]) {
    for (const file of allJsonFiles(root)) {
      if (fs.readFileSync(file, 'utf8').includes(RETIRED_URL)) offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test('the surviving how-to owns the migrated five-part prompt method', () => {
  const guide = readJson<JsonDoc>('content/blog/ru/chat-gpt-na-russkom.json');
  const text = JSON.stringify(guide).toLowerCase();

  assert.equal(guide.status, 'published');
  assert.equal(guide.dateModified, '2026-08-25');
  for (const element of ['роль', 'задача', 'контекст', 'формат', 'ограничения']) {
    assert.ok(text.includes(element), `the consolidated guide is missing: ${element}`);
  }
  assert.ok(text.includes('плохой запрос'));
  assert.ok(text.includes(PROMPTS_URL));
});

test('the GPT definition has a distinct explainer intent, original visual and primary sources', () => {
  const page = readJson<JsonDoc>('content/pages/ru/chto-takoe-gpt-i-kak-polzovatsya.json');
  const blocks = page.bodyBlocks as Array<Record<string, unknown>>;
  const sources = page.sources as Array<{ url: string }>;

  assert.equal(page.url, DEFINITION_URL);
  assert.equal(page.status, 'published');
  assert.equal(page.robotsIndex, true);
  assert.equal(page.lastReviewedAt, '2026-08-25');
  assert.match(String(page.h1), /^Что такое GPT простыми словами/);
  assert.ok(blocks.some((block) => block.type === 'figure' && block.src === '/assets/guides/gpt-how-it-works-ru.svg'));
  assert.ok(sources.length >= 3);
  assert.ok(sources.some((source) => source.url === 'https://arxiv.org/abs/1706.03762'));
});

test('the prompt library is a reciprocal, copyable set of exactly 50 prompts', () => {
  const page = readJson<JsonDoc>('content/pages/ru/promty-gpt-chatgpt-50-primerov.json');
  const uz = readJson<JsonDoc>('content/blog/uz/chatgpt-uzbek-tilida-promptlar.json');
  const blocks = page.bodyBlocks as Array<{ type: string; items?: string[]; copyableItems?: boolean }>;
  const copyableLists = blocks.filter((block) => block.type === 'list' && block.copyableItems);
  const promptCount = copyableLists.reduce((sum, block) => sum + (block.items?.length || 0), 0);

  assert.equal(page.url, PROMPTS_URL);
  assert.equal(page.status, 'published');
  assert.equal(page.robotsIndex, true);
  assert.equal(page.lastReviewedAt, '2026-08-25');
  assert.match(String(page.title), /промпт/iu);
  assert.match(String(page.h1), /промпт/iu);
  assert.match(String(page.primaryKeyword), /промпт/iu);
  assert.equal(copyableLists.length, 8);
  assert.equal(promptCount, 50);
  assert.equal(page.hreflangUz, '/uz/blog/chatgpt-uzbek-tilida-promptlar/');
  assert.equal(uz.hreflangRu, PROMPTS_URL);
  assert.ok(Array.isArray(page.sources) && page.sources.length > 0);
});

test('the page renderer ships accessible copy controls only for opted-in lists', () => {
  const renderer = fs.readFileSync(path.join(ROOT, 'scripts', 'prerender.ts'), 'utf8');

  assert.match(renderer, /copyableItems/);
  assert.match(renderer, /data-copy-prompt/);
  assert.match(renderer, /navigator\.clipboard/);
  assert.match(renderer, /aria-live/);
});
