import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildServiceLd } from '../scripts/jsonld-helpers';
import { LEAD_FORM_PAGES } from '../scripts/lead-form';
import type { BlogArticle, GlobalSEO, Page } from '../src/shared/types';

// Site-wide regression guards added after the 2026-09-28 advertising audit:
// raw {tokens} and href="#" CTAs were shipped in a dozen commercial articles,
// landings handed their own main query to other URLs as anchor text, and the
// Telegram Ads entry threshold existed in four versions.

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8'));
const listJson = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return listJson(full);
  return entry.name.endsWith('.json') ? [full] : [];
});
const blogFiles = listJson('content/blog');
const pageFiles = listJson('content/pages');
type Block = { type: string; text?: string; href?: string; links?: Array<{ token?: string; target?: string; anchor?: string }> };
const blocksOf = (doc: Partial<BlogArticle & Page> & { bodyBlocks?: Block[] }): Block[] => [
  ...((doc as { body?: Block[] }).body || []),
  ...(doc.bodyBlocks || []),
];

test('no published article or page shows a raw {token} or a CTA without a target', () => {
  for (const file of [...blogFiles, ...pageFiles]) {
    const doc = read<Partial<BlogArticle & Page> & { bodyBlocks?: Block[] }>(file);
    if (doc.status && doc.status !== 'published') continue;
    for (const block of blocksOf(doc)) {
      if (block.type === 'p' || block.type === 'quote' || block.type === 'h2' || block.type === 'h3') {
        assert.doesNotMatch(block.text || '', /\{[a-zA-Z_]+\}/, `${file}: unresolved token in ${block.type}`);
      }
      if (block.type === 'cta') assert.ok(block.href && block.href !== '#', `${file}: CTA "${block.text}" has no target`);
      if (block.type === 'linkp') {
        const tokens = [...(block.text || '').matchAll(/\{([a-zA-Z_]+)\}/g)].map(match => match[1]);
        for (const token of tokens) {
          const link = (block.links || []).find(item => item.token === token);
          assert.ok(link?.target && link.anchor, `${file}: linkp token {${token}} has no link`);
        }
      }
    }
  }
});

test('a landing never gives its own main query to another URL as anchor text', () => {
  const norm = (value?: string) => (value || '').trim().toLowerCase();
  const keywordByUrl = new Map<string, string>();
  for (const file of [...pageFiles, ...blogFiles]) {
    const doc = read<{ url?: string; slug?: string; locale?: string; primaryKeyword?: string }>(file);
    const url = doc.url || (doc.slug && doc.locale ? `/${doc.locale}/blog/${doc.slug}/` : '');
    if (url) keywordByUrl.set(url, norm(doc.primaryKeyword));
  }
  for (const file of pageFiles) {
    const page = read<Page>(file);
    const own = norm(page.primaryKeyword);
    if (!own) continue;
    for (const link of page.internalLinks || []) {
      if (link.target === page.url) continue;
      // Consolidation link: the target owns the same main query, so the anchor supports the owner.
      if (keywordByUrl.get(link.target) === own) continue;
      // The GPT cluster is traffic-protected (scripts/seo-protection.ts) and deliberately feeds its slug owner.
      if (page.url === '/uz/gpt-uzbek-tilida-ai-chat/' && link.target === '/uz/gpt-uzbek-tilida/') continue;
      assert.notEqual(norm(link.anchor), own, `${file}: anchor "${link.anchor}" is the page's own main query but points to ${link.target}`);
    }
  }
  const retired: Array<[string, string, string]> = [
    ['content/pages/ru/internet-reklama-tashkent.json', '/ru/blog/reklamnyy-byudzhet-skolko-protsentov-ot-oborota/', 'интернет-реклама в Ташкенте'],
    ['content/pages/ru/kontekstnaya-reklama-tashkent.json', '/ru/blog/google-ads-ili-yandeks-direkt-uzbekistan/', 'контекстная реклама в Ташкенте'],
    ['content/pages/uz/telegram-reklama.json', '/uz/blog/kontekst-reklama-narxi-toshkent-2026/', 'Telegram reklama'],
    ['content/pages/uz/smm-xizmatlari.json', '/uz/blog/reklama-byudjeti-qancha-bolishi-kerak/', 'SMM xizmati'],
    ['content/blog/uz/internet-reklama-narxi-ozbekiston-2026.json', '/uz/blog/kontekst-reklama-narxi-toshkent-2026/', 'internet reklama narxi'],
  ];
  for (const [file, target, anchor] of retired) {
    const doc = read<{ internalLinks?: Array<{ target: string; anchor: string }> }>(file);
    assert.ok(!(doc.internalLinks || []).some(link => link.target === target && link.anchor === anchor), `${file}: misleading anchor "${anchor}" returned`);
  }
});

test('Telegram Ads entry threshold is one sourced fact set, not a universal EUR deposit', () => {
  const files = [
    'content/blog/ru/telegram-ads-stoimost-i-zapusk-uzbekistan.json',
    'content/pages/ru/telegram-ads-uzbekistan.json',
    'content/pages/uz/telegram-reklama.json',
    'content/blog/ru/telegram-ads-ili-posevy-v-kanalah.json',
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /2\s?000\s*(евро|€|yevro)|€\s?2\s?000|от \$100 за/i, `${file}: universal deposit claim`);
    assert.match(text, /0,1 (TON|Toncoin)/, `${file}: official minimum CPM missing`);
  }
  const article = read<BlogArticle>('content/blog/ru/telegram-ads-stoimost-i-zapusk-uzbekistan.json');
  const ids = (article.body as Block[] & Array<{ id?: string }>).map(block => (block as { id?: string }).id);
  assert.ok(ids.includes('minimalnyy-byudzhet'), 'minimum-budget section missing');
  assert.ok((article.sources || []).some(source => source.url.includes('elama.ru')), 'reseller source missing');
});

test('the Uzbek hub publishes the same launch and management prices as the Russian landings', () => {
  const hub = read<Page & { bodyBlocks: Array<Block & { id?: string; rows?: string[][] }> }>('content/pages/uz/internet-reklama-toshkent.json');
  for (const id of ['target', 'kontekst']) assert.ok(hub.bodyBlocks.some(block => block.id === id), `UZ hub section #${id} missing`);
  const uzRows = hub.bodyBlocks.filter(block => block.type === 'table').flatMap(block => block.rows || []).map(row => row.join(' '));
  for (const slug of ['targetirovannaya-reklama-tashkent', 'kontekstnaya-reklama-tashkent']) {
    const ru = read<Page & { bodyBlocks: Array<Block & { headers?: string[]; rows?: string[][] }> }>(`content/pages/ru/${slug}.json`);
    const prices = ru.bodyBlocks.filter(block => block.type === 'table' && (block.headers || []).some(header => /^Цена/.test(header)))
      .flatMap(block => block.rows || [])
      .filter(row => /^(Запуск|Ведение)$/.test(row[0])).map(row => row[row.length - 1].replace(/^от\s*/, ''));
    assert.deepEqual(prices, ['1 990 000', '1 490 000'], `${slug}: RU tariff rows changed`);
    for (const price of prices) assert.ok(uzRows.some(row => row.includes(price)), `UZ hub lacks ${price}`);
  }
});

test('only bots declare 24/7 availability; team services follow office hours', () => {
  const global = read<GlobalSEO>('content/global/site.json');
  assert.equal((global as GlobalSEO & { openingHours?: string }).openingHours, 'Mo-Sa 10:00-19:00');
  const base = { global, url: '/ru/targetirovannaya-reklama-tashkent/', name: 'Таргет', description: 'd', serviceType: 'таргет' };
  assert.equal('hoursAvailable' in buildServiceLd({ ...base, alwaysAvailable: false }), false);
  assert.equal('hoursAvailable' in buildServiceLd({ ...base, url: '/ru/ai-bot-dlya-biznesa/' }), true);
  const prerender = fs.readFileSync('scripts/prerender.ts', 'utf8');
  assert.match(prerender, /alwaysAvailable: !TEAM_SERVICE_URL_RE\.test\(page\.url\)/);
  const helpers = fs.readFileSync('scripts/jsonld-helpers.ts', 'utf8');
  assert.match(helpers, /opens: '10:00',\s*closes: '19:00'/);
});

// /uz/instagram-target-yoqish/ shipped with a 24/7 Service while its page says
// «Du–Sha 10:00–19:00»: its slug was missing from TEAM_SERVICE_URL_RE. Every
// lead-form page that sells a team service (not a bot) and gets the generated
// Service node must match the regex prerender.ts uses.
test('every lead-form page of a team service is excluded from 24/7 availability', () => {
  const prerender = fs.readFileSync('scripts/prerender.ts', 'utf8');
  const literal = prerender.match(/const TEAM_SERVICE_URL_RE = \/(.+)\/;\n/);
  assert.ok(literal, 'TEAM_SERVICE_URL_RE not found in scripts/prerender.ts');
  const teamService = new RegExp(literal[1]);
  const botServices = new Set(['telegram-bot', 'chat-bot', 'telegram-mini-app', 'ai-bot']);
  const byUrl = new Map(pageFiles.map(file => read<Page>(file)).map(page => [page.url, page]));
  const checked: string[] = [];
  for (const [url, service] of Object.entries(LEAD_FORM_PAGES)) {
    if (botServices.has(service)) continue;
    const page = byUrl.get(url);
    assert.ok(page, `${url}: no page JSON`);
    // Same condition as the Service node in scripts/prerender.ts.
    if (!(page.schemaTypes || []).includes('Service') && page.pageType !== 'money') continue;
    assert.match(url, teamService, `${url} (${service}) would declare hoursAvailable 24/7`);
    checked.push(url);
  }
  assert.ok(checked.includes('/uz/instagram-target-yoqish/'), 'the Uzbek targeting page was not checked');
  assert.ok(checked.length >= 13, `only ${checked.length} team-service pages checked`);
});

test('the homepage main content links every advertising landing in both languages', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /<main id="main-content">[\s\S]*<PromotionServices lang=\{lang\} \/>[\s\S]*<\/main>/);
  const block = fs.readFileSync('src/components/PromotionServices.tsx', 'utf8');
  const published = new Set(pageFiles.map(file => read<Page>(file)).filter(page => page.status === 'published').map(page => page.url));
  const linked = [...block.matchAll(/href: '([^'#]+)(?:#[a-z-]+)?'/g)].map(match => match[1]);
  for (const url of linked) assert.ok(published.has(url), `homepage links ${url}, which is not a published page`);
  for (const url of [
    '/ru/internet-reklama-tashkent/', '/ru/kontekstnaya-reklama-tashkent/', '/ru/targetirovannaya-reklama-tashkent/',
    '/ru/telegram-ads-uzbekistan/', '/ru/smm-prodvizhenie-tashkent/', '/ru/marketingovyi-audit-tashkent/',
    '/ru/performance-marketing-tashkent/', '/ru/digital-marketing-tashkent/', '/ru/digital-strategiya-dlya-biznesa/',
    '/uz/internet-reklama-toshkent/', '/uz/telegram-reklama/', '/uz/smm-xizmatlari/',
  ]) assert.ok(linked.includes(url), `homepage does not link ${url}`);
});

test('the blog index surfaces revised articles above the publication-date grid', () => {
  const source = fs.readFileSync('scripts/prerender-blog.ts', 'utf8');
  assert.match(source, /data-testid="blog-recently-updated"/);
  assert.match(source, /day\(a\.dateModified\) > day\(a\.datePublished\)/);
  assert.ok(source.indexOf('${updatedSection}') < source.indexOf('data-testid="blog-grid"'), 'recently updated list must precede the grid');
});
