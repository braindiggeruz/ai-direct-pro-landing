// The English layer /en/ (AI-visibility wave 1c, 2026-11-23): scripts/en-pages.ts,
// scripts/en-alternates.ts, scripts/prerender-en.ts.
//
// Run: node --import tsx --test tests/en-pages.test.ts
// The build checks run against a dist/ made by npm run build:fast.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { GlobalSEO } from '../src/shared/types';
import { EN_ALTERNATES, enDistFile, enPages } from '../scripts/en-pages';
import { EN_HEADER_CHAT, enHreflang, renderEnPage } from '../scripts/prerender-en';
import { buildFeed } from '../scripts/openai-feed';
import { CHAT_FACTS, STUDIO_FACTS } from '../scripts/product-facts';
import { PROTECTED_PATHS } from '../scripts/seo-protection';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://gptbot.uz';
const pages = enPages(ROOT);
const global = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/global/site.json'), 'utf8')) as GlobalSEO;

/** Every visible string of an English page. */
const visibleText = (page: (typeof pages)[number]): string => [
  page.title, page.description, page.h1, page.breadcrumb, page.intro,
  ...page.blocks.flatMap((b) => [b.text ?? '', ...(b.items ?? []), ...(b.headers ?? []), ...(b.rows ?? []).flat(), ...(b.links ?? []).map((l) => l.anchor ?? '')]),
  ...page.faq.flatMap((f) => [f.q, f.a]),
  ...(page.sources ?? []).flatMap((s) => [s.title, s.note ?? '']),
].join('\n');

const bodyText = (html: string): string => (html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '')
  .replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/** Published RU/UZ URLs from content/ (pages, blog, studio). */
const publishedUrls = (() => {
  const urls = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        const doc = JSON.parse(fs.readFileSync(full, 'utf8')) as { url?: string; status?: string };
        if (doc && typeof doc.url === 'string' && doc.status === 'published') urls.add(doc.url);
      }
    }
  };
  for (const dir of ['content/pages', 'content/blog', 'content/studio/pages']) walk(path.join(ROOT, dir));
  return urls;
})();

const contentDoc = (url: string): Record<string, unknown> | undefined => {
  for (const dir of ['content/pages', 'content/blog']) {
    for (const locale of ['ru', 'uz']) {
      const folder = path.join(ROOT, dir, locale);
      for (const file of fs.readdirSync(folder)) {
        if (!file.endsWith('.json')) continue;
        const doc = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')) as Record<string, unknown>;
        if (doc.url === url) return doc;
      }
    }
  }
  return undefined;
};

test('six English pages under /en/, each with its own URL, title, description and FAQ', () => {
  assert.deepEqual(pages.map((p) => p.url), [
    '/en/', '/en/uzbek-ai-chat/', '/en/ai-presentation-maker/', '/en/ai-chatbot-development-tashkent/',
    '/en/pay-for-chatgpt-in-uzbekistan/', '/en/uzbek-ai-chats-compared/',
  ]);
  for (const field of ['title', 'description', 'h1'] as const) {
    assert.equal(new Set(pages.map((p) => p[field])).size, pages.length, `unique ${field}`);
  }
  for (const page of pages) {
    assert.match(page.title, / \| GPTBot\.uz$/, `${page.url}: brand suffix`);
    assert.ok(page.description.length >= 70 && page.description.length <= 200, `${page.url}: description ${page.description.length} chars`);
    assert.ok(page.faq.length >= 4, `${page.url}: FAQ`);
    assert.ok(page.blocks.filter((b) => b.type === 'h2').length >= 2, `${page.url}: question headings`);
    assert.ok(/\d/.test(page.intro), `${page.url}: the answer-first paragraph carries a number`);
  }
});

test('no claim of being official or of a link to OpenAI; the brand is GPTBot.uz', () => {
  for (const page of pages) {
    const text = visibleText(page);
    assert.doesNotMatch(text, /\bofficial|rasmiy|официальн/i, `${page.url}: official`);
    assert.doesNotMatch(text, /\b(?:GPTbot|Gptbot|GPTBOT|GptBot)\.uz\b|\bGPTBot\.UZ\b/, `${page.url}: brand casing`);
  }
  for (const url of ['/en/', '/en/uzbek-ai-chat/']) {
    assert.match(visibleText(pages.find((p) => p.url === url)!), /not ChatGPT and not an OpenAI product/, `${url}: independence statement`);
  }
});

test('every price on the English pages is a price of the product feed, and the chat and Studio figures are the sources of truth', () => {
  const feedPrices = new Set(buildFeed(ROOT).records.map((r) => Number(String(r.price).replace(/ UZS$/, ''))));
  for (const page of pages) {
    const text = visibleText(page);
    const amounts = [...text.matchAll(/(\d{1,3}(?: \d{3})*) UZS/g)].map((m) => Number(m[1].replace(/ /g, '')));
    for (const amount of amounts) assert.ok(feedPrices.has(amount), `${page.url}: ${amount} UZS is not a feed price`);
  }
  const chat = visibleText(pages.find((p) => p.url === '/en/uzbek-ai-chat/')!);
  assert.match(chat, new RegExp(`${CHAT_FACTS.trialReplies} free trial replies in total`));
  assert.match(chat, new RegExp(`${CHAT_FACTS.smallReplies} replies for ${CHAT_FACTS.smallHours} hours`));
  assert.match(chat, new RegExp(`${CHAT_FACTS.replies} replies for one calendar month \\(up to ${CHAT_FACTS.dailyReplies} a day\\)`));
  const studio = visibleText(pages.find((p) => p.url === '/en/ai-presentation-maker/')!);
  assert.match(studio, new RegExp(`${STUDIO_FACTS.kunlik.presentationFull} full presentation within 24 hours`));
  assert.match(studio, new RegExp(`${STUDIO_FACTS.oylik.presentationFull} full presentations within one calendar month`));
});

test('the facts block names the studio address of content/global/site.json', () => {
  const about = visibleText(pages.find((p) => p.url === '/en/')!);
  assert.ok(about.includes(global.address), 'address');
  assert.ok(about.includes('10:00–19:00'), 'hours');
});

test('links: every internal target is an English page or a published RU/UZ page; sources are https with a check date', () => {
  const en = new Set(pages.map((p) => p.url));
  for (const page of pages) {
    for (const block of page.blocks.filter((b) => b.type === 'linkp')) {
      for (const link of block.links ?? []) {
        assert.ok(link.target && (en.has(link.target) || publishedUrls.has(link.target)), `${page.url}: ${link.target}`);
        assert.ok(block.text?.includes(`{${link.token}}`), `${page.url}: token {${link.token}} is in the text`);
      }
    }
    for (const source of page.sources ?? []) {
      assert.match(source.url, /^https:\/\//, `${page.url}: ${source.url}`);
      assert.match(source.note ?? '', /Checked 2026-11-23/, `${page.url}: ${source.url} check date`);
    }
  }
  // Every English page has at least two contextual links from other English pages.
  for (const target of en) {
    const incoming = pages.filter((p) => p.url !== target && p.blocks.some((b) => b.type === 'linkp' && (b.links ?? []).some((l) => l.target === target)));
    assert.ok(incoming.length >= 2, `${target}: ${incoming.length} contextual incoming links`);
  }
});

test('hreflang: an English page joins only unprotected, declared RU/UZ pairs, and the map is reciprocal', () => {
  const protectedPaths = new Set<string>(PROTECTED_PATHS);
  for (const [member, en] of Object.entries(EN_ALTERNATES)) {
    assert.ok(!protectedPaths.has(member), `${member} is protected and keeps its reviewed hreflang set`);
    const doc = contentDoc(member);
    assert.ok(doc, `${member}: content file`);
    assert.equal(doc!.status, 'published');
    assert.equal(doc!.hreflangUnpaired ?? false, false, `${member}: a declared pair`);
    assert.equal(doc!.hreflangXDefault ?? '', '', `${member}: x-default is the Russian member`);
    const page = pages.find((p) => p.url === en);
    assert.ok(page?.alternates, `${en}: names its pair`);
    assert.equal(doc!.hreflangRu, page!.alternates!.ru, `${member}: RU member`);
    assert.equal(doc!.hreflangUz, page!.alternates!.uz, `${member}: UZ member`);
  }
  for (const page of pages.filter((p) => p.alternates)) {
    assert.equal(EN_ALTERNATES[page.alternates!.ru], page.url);
    assert.equal(EN_ALTERNATES[page.alternates!.uz], page.url);
    assert.deepEqual(enHreflang(page).map((h) => h.lang), ['ru', 'uz', 'en', 'x-default']);
    assert.equal(enHreflang(page).at(-1)!.href, `${SITE}${page.alternates!.ru}`);
  }
  for (const page of pages.filter((p) => !p.alternates)) {
    assert.deepEqual(enHreflang(page), [], `${page.url}: stands alone`);
    for (const target of Object.values(page.switchTo ?? {})) assert.ok(target === '/uz/' || publishedUrls.has(target), `${page.url}: switch to ${target}`);
  }
});

test('rendered page: substantive text, FAQPage only from the visible questions, one header chat button', () => {
  for (const page of pages) {
    const html = renderEnPage(page, global, '');
    assert.ok(bodyText(html).length > 2500, `${page.url}: ${bodyText(html).length} characters of body text`);
    assert.match(html, /<html lang="en">/);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}${page.url}" />`), `${page.url}: canonical`);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]) as { '@graph': Array<Record<string, unknown>> };
    const types = ld['@graph'].map((n) => n['@type']).flat();
    for (const type of ['Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'FAQPage']) assert.ok(types.includes(type), `${page.url}: ${type}`);
    assert.ok(!types.includes('Offer') && !types.includes('AggregateRating') && !types.includes('Review'), `${page.url}: no Offer, rating or review markup`);
    const faq = ld['@graph'].find((n) => n['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string }> };
    assert.deepEqual(faq.mainEntity.map((q) => q.name), page.faq.map((f) => f.q));
    for (const f of page.faq) assert.ok(bodyText(html).includes(f.q), `${page.url}: visible question «${f.q}»`);
    const header = html.match(/<header\b[\s\S]*?<\/header>/)![0];
    assert.equal(header.match(new RegExp(`<a href="${EN_HEADER_CHAT.href}"[^>]*>${EN_HEADER_CHAT.label}</a>`, 'g'))?.length, 1, `${page.url}: header chat button`);
  }
});

test('wiring: the English prerender runs right after vite build, before the RU/UZ prerenderers that read it', () => {
  const scripts = (JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
  for (const name of ['build', 'build:fast', 'build:cf']) {
    assert.match(scripts[name], /vite build && tsx scripts\/prerender-en\.ts && tsx scripts\/prerender\.ts && /, name);
  }
  assert.match(scripts.test, /tests\/en-pages\.test\.ts/);
});

// ── After a build (npm run build:fast) ──────────────────────────────────────
const built = fs.existsSync(path.join(DIST, 'en', 'index.html'));
const skipBuild = !built && 'dist/en/ is missing; run npm run build:fast';

test('build: English pages, hreflang on both sides and the sitemap agree', { skip: skipBuild }, () => {
  const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const block = (url: string): string => sitemap.match(new RegExp(`<url>\\s*<loc>${SITE}${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>[\\s\\S]*?</url>`))?.[0] ?? '';
  const alternatesOf = (html: string) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)].map((m) => ({ lang: m[1], href: m[2] }));
  for (const page of pages) {
    const html = fs.readFileSync(enDistFile(DIST, page.url), 'utf8');
    assert.match(html, /<meta property="og:site_name" content="GPTBot\.uz" \/>/);
    assert.match(html, /<meta property="og:locale" content="en_US" \/>/);
    assert.match(html, /<meta name="robots" content="index, follow/);
    assert.deepEqual(alternatesOf(html), enHreflang(page), `${page.url}: hreflang`);
    const entry = block(page.url);
    assert.ok(entry, `${page.url}: in the sitemap`);
    assert.match(entry, /<lastmod>2026-11-23<\/lastmod>/);
    for (const h of enHreflang(page)) assert.ok(entry.includes(`hreflang="${h.lang}" href="${h.href}"`), `${page.url}: sitemap ${h.lang}`);
  }
  for (const [member, en] of Object.entries(EN_ALTERNATES)) {
    const html = fs.readFileSync(path.join(DIST, member, 'index.html'), 'utf8');
    const page = pages.find((p) => p.url === en)!;
    assert.deepEqual(alternatesOf(html), enHreflang(page), `${member}: the same four-member set`);
    assert.ok(block(member).includes(`hreflang="en" href="${SITE}${en}"`), `${member}: sitemap en`);
  }
  // Nothing else declares an English alternate.
  const members = new Set([...Object.keys(EN_ALTERNATES), ...pages.map((p) => p.url)]);
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'assets' || e.name === 'admin' ? [] : walk(full);
    return e.name === 'index.html' ? [full] : [];
  });
  for (const file of walk(DIST)) {
    const url = `/${path.relative(DIST, path.dirname(file)).split(path.sep).join('/')}/`.replace(/^\/\/$/, '/');
    if (members.has(url)) continue;
    assert.ok(!fs.readFileSync(file, 'utf8').includes('hreflang="en" href='), `${url}: unexpected English alternate`);
  }
  assert.equal((sitemap.match(/hreflang="en"/g) ?? []).length, 9, 'en in the sitemap: three sets, three entries each');
});
