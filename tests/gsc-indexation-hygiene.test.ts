import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { onRequest } from '../functions/_middleware';
import { HREFLANG_PAIRS, MONEY_PAGES } from '../src/shared/site-config';

const ROOT = process.cwd();
const RETIRED = ['/ru/gpt-bot-dlya-biznesa/', '/ru/bot-dlya-obrabotki-zayavok/'];
const ACTIVE_FILES = [
  'src/shared/site-config.ts',
  'src/components/Footer.tsx',
  'src/components/SolutionsGrid.tsx',
  'src/shared/booster.ts',
  'public/llms.txt',
  'public/llms-full.txt',
];

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function middleware(url: string): Promise<Response> {
  return onRequest({
    request: new Request(url),
    env: {},
    next: async () => new Response('next', { status: 200 }),
  } as never);
}

test('the retired sitelinks SearchAction cannot regenerate a crawlable query template', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /SearchAction|search_term_string|query-input/);
});

test('blog q parameters permanently collapse to the canonical index', async () => {
  const template = await middleware('https://gptbot.uz/ru/blog/?q=%7Bsearch_term_string%7D');
  assert.equal(template.status, 301);
  assert.equal(template.headers.get('location'), 'https://gptbot.uz/ru/blog/');

  const attributed = await middleware('https://gptbot.uz/uz/blog?q=sinov&utm_source=gsc');
  assert.equal(attributed.status, 301);
  assert.equal(attributed.headers.get('location'), 'https://gptbot.uz/uz/blog/?utm_source=gsc');
});

test('GSC legacy content URLs resolve in one permanent map to published owners', () => {
  const redirects = JSON.parse(read('content/seo/redirects.json')) as Array<{ from: string; to: string; statusCode: number }>;
  const expected = new Map([
    ['/ru/telegram-bot-uzbekistan/', '/ru/telegram-bot-dlya-biznesa/'],
    ['/gpt-uzbek-tilida/', '/uz/gpt-uzbek-tilida/'],
    ['/gpt-chat/', '/ru/gpt-chat/'],
  ]);
  for (const [from, to] of expected) {
    const matches = redirects.filter((item) => item.from === from);
    assert.equal(matches.length, 1, from);
    assert.equal(matches[0].to, to);
    assert.equal(matches[0].statusCode, 301);
  }
});

test('redirect sources are absent from active money, hreflang, UI and LLM sources', () => {
  const money = [...MONEY_PAGES.ru, ...MONEY_PAGES.uz];
  const hreflang = HREFLANG_PAIRS.flat();
  for (const retired of RETIRED) {
    assert.ok(!money.includes(retired as never), `money config contains ${retired}`);
    assert.ok(!hreflang.includes(retired), `hreflang config contains ${retired}`);
    for (const file of ACTIVE_FILES) assert.ok(!read(file).includes(retired), `${file} contains ${retired}`);
  }
});

test('unknown private-looking routes remain true noindex 404s instead of homepage redirects', () => {
  const redirects = JSON.parse(read('content/seo/redirects.json')) as Array<{ from: string }>;
  for (const route of ['/cabinet', '/oauth', '/api', '/callback', '/reset-password', '/auth', '/account']) {
    assert.ok(!redirects.some((item) => item.from === route || item.from === route + '/'), route);
  }
  assert.match(read('public/404.html'), /name="robots" content="noindex, nofollow"/);
});

test('the Telegram country legacy URL consolidates into a geographically explicit owner', () => {
  const page = JSON.parse(read('content/pages/ru/telegram-bot-dlya-biznesa.json')) as Record<string, unknown>;
  assert.equal(page.url, '/ru/telegram-bot-dlya-biznesa/');
  assert.match(String(page.title), /Узбекистан/);
  assert.match(String(page.h1), /Узбекистан/);
  assert.match(String(page.description), /Узбекистан/);
  assert.equal(page.robotsIndex, true);
});
