import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { onRequest as middlewareRequest } from '../functions/_middleware';
import { onRequest as ruBlogIndexRequest } from '../functions/ru/blog/index';
import { onRequest as uzBlogIndexRequest } from '../functions/uz/blog/index';
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
  return middlewareRequest({
    request: new Request(url),
    env: {},
    next: async () => new Response('next', { status: 200 }),
  } as never);
}

async function blogIndex(
  handler: typeof ruBlogIndexRequest,
  url: string,
  assetFetch: (request: Request) => Promise<Response>,
): Promise<Response> {
  return handler({
    request: new Request(url),
    env: { ASSETS: { fetch: assetFetch } },
  } as never) as Promise<Response>;
}

test('the retired sitelinks SearchAction cannot regenerate a crawlable query template', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /SearchAction|search_term_string|query-input/);
});

test('blog q parameters permanently collapse to the canonical index in middleware', async () => {
  const template = await middleware('https://gptbot.uz/ru/blog/?q=%7Bsearch_term_string%7D');
  assert.equal(template.status, 301);
  assert.equal(template.headers.get('location'), 'https://gptbot.uz/ru/blog/');

  const attributed = await middleware('https://gptbot.uz/uz/blog?q=sinov&utm_source=gsc');
  assert.equal(attributed.status, 301);
  assert.equal(attributed.headers.get('location'), 'https://gptbot.uz/uz/blog/?utm_source=gsc');
});

test('explicit blog index edge routes enforce the cleanup before static assets', async () => {
  let assetCalls = 0;
  const failIfCalled = async (): Promise<Response> => {
    assetCalls += 1;
    return new Response('unexpected asset call', { status: 500 });
  };

  const ru = await blogIndex(
    ruBlogIndexRequest,
    'https://preview.example/ru/blog/?q=%7Bsearch_term_string%7D&utm_source=gsc#fragment',
    failIfCalled,
  );
  assert.equal(ru.status, 301);
  assert.equal(ru.headers.get('location'), 'https://gptbot.uz/ru/blog/?utm_source=gsc');

  const uz = await blogIndex(
    uzBlogIndexRequest,
    'https://preview.example/uz/blog?q=sinov',
    failIfCalled,
  );
  assert.equal(uz.status, 301);
  assert.equal(uz.headers.get('location'), 'https://gptbot.uz/uz/blog/');
  assert.equal(assetCalls, 0);
});

test('clean blog indexes delegate to the prerendered static asset exactly once', async () => {
  const seen: string[] = [];
  const response = await blogIndex(
    uzBlogIndexRequest,
    'https://preview.example/uz/blog/?utm_source=organic',
    async (request) => {
      seen.push(request.url);
      return new Response('static blog index', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'static blog index');
  assert.deepEqual(seen, ['https://preview.example/uz/blog/?utm_source=organic']);
});

test('both locale blog indexes have explicit Pages Function routes', () => {
  assert.match(read('functions/ru/blog/index.ts'), /createBlogIndexHandler\('\/ru\/blog\/'\)/);
  assert.match(read('functions/uz/blog/index.ts'), /createBlogIndexHandler\('\/uz\/blog\/'\)/);
  const helper = read('functions/lib/blog-index-edge.ts');
  assert.match(helper, /url\.searchParams\.has\('q'\)/);
  assert.match(helper, /env\.ASSETS\.fetch\(request\)/);
});

test('Pages invocation routes preserve the existing API surfaces and include only blog indexes', () => {
  const routes = JSON.parse(read('public/_routes.json')) as {
    version: number;
    include: string[];
    exclude: string[];
  };
  assert.equal(routes.version, 1);
  assert.deepEqual([...routes.include].sort(), [
    '/admin-tools/*',
    '/admin/*',
    '/api/*',
    '/robots.txt',
    '/ru/blog',
    '/ru/blog/',
    '/uz/blog',
    '/uz/blog/',
  ].sort());
  assert.deepEqual(routes.exclude, ['/admin/assets/*']);
  assert.ok(!routes.include.includes('/ru/blog/*'));
  assert.ok(!routes.include.includes('/uz/blog/*'));
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

test('priority sitemap contains only the current canonical reindex queue', () => {
  const expected = [
    'https://gptbot.uz/',
    'https://gptbot.uz/boss-digital/',
    'https://gptbot.uz/uz/boss-digital/',
    'https://gptbot.uz/ru/internet-reklama-tashkent/',
    'https://gptbot.uz/uz/internet-reklama-toshkent/',
    'https://gptbot.uz/ru/seo-prodvizhenie-saytov-tashkent/',
    'https://gptbot.uz/uz/seo-xizmati/',
    'https://gptbot.uz/ru/razrabotka-saytov-tashkent/',
    'https://gptbot.uz/uz/sayt-yaratish/',
    'https://gptbot.uz/ru/gpt-dlya-biznesa/',
    'https://gptbot.uz/uz/biznes-uchun-ai-bot/',
    'https://gptbot.uz/ru/telegram-ads-uzbekistan/',
    'https://gptbot.uz/uz/telegram-reklama/',
    'https://gptbot.uz/ru/smm-prodvizhenie-tashkent/',
    'https://gptbot.uz/uz/smm-xizmatlari/',
    'https://gptbot.uz/ru/kontekstnaya-reklama-tashkent/',
    'https://gptbot.uz/ru/targetirovannaya-reklama-tashkent/',
  ];
  const xml = read('public/sitemap-priority.xml');
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations, expected);
  assert.equal(new Set(locations).size, expected.length);
  assert.equal((xml.match(/<lastmod>2026-09-04<\/lastmod>/g) ?? []).length, expected.length);

  const pageFiles = fs.readdirSync(path.join(ROOT, 'content', 'pages'), { recursive: true })
    .filter((file) => typeof file === 'string' && file.endsWith('.json')) as string[];
  const published = new Set(pageFiles.map((file) => JSON.parse(read(path.join('content', 'pages', file))) as { status: string; url: string; robotsIndex?: boolean })
    .filter((page) => page.status === 'published' && page.robotsIndex !== false)
    .map((page) => page.url));
  const redirectSources = new Set((JSON.parse(read('content/seo/redirects.json')) as Array<{ from: string }>).map((item) => item.from));

  for (const location of locations) {
    const url = new URL(location);
    assert.equal(url.origin, 'https://gptbot.uz');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.ok(url.pathname === '/' || published.has(url.pathname), `${url.pathname} is not a published page`);
    assert.ok(!redirectSources.has(url.pathname), `${url.pathname} is a redirect source`);
  }
  assert.match(read('public/robots.txt'), /Sitemap: https:\/\/gptbot\.uz\/sitemap-priority\.xml/);
  assert.match(read('src/shared/robots-policy.ts'), /sitemap-priority\.xml/);
});
