// Hreflang guard for the two Uzbek access guides (TOP-3 roadmap 2026-10-26,
// step 1.4 / Т-05; decision A11 in content/seo/intent-manifest.json).
//
// Run: node --import tsx --test tests/seo-hreflang-guard.test.ts
//
// The download guide holds the site's only top-3 («chatgpt yuklab olish uzbek
// tilida»). Hreflang tells Google to serve the member of a pair that matches
// the searcher's interface language, which in Uzbekistan defaults to Russian:
// that is how the RU chat takes part of the Uzbek chat's queries. So neither
// guide may ever be paired with a RU page, not even with a future Russian
// download or login guide; such a page links them with a plain cross-link.
// Today they have no pair; this test locks that in content, the sitemap and
// the built HTML.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = 'https://gptbot.uz';
const GUIDES = [
  '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/',
  '/uz/blog/chatgptga-qanday-kirish-mumkin/',
] as const;
const HREFLANG_FIELDS = ['hreflangRu', 'hreflangUz', 'hreflangXDefault'] as const;

/** "/x/", "https://gptbot.uz/x/" → "/x/". */
const pathOf = (href: string): string => (href.startsWith(SITE) ? href.slice(SITE.length) || '/' : href);

function jsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(full);
    return entry.name.endsWith('.json') ? [full] : [];
  });
}

type Doc = { url?: string; locale?: string; status?: string } & Partial<Record<(typeof HREFLANG_FIELDS)[number], string>>;
const docs = jsonFiles(path.join(ROOT, 'content'))
  .map((file) => ({ file: path.relative(ROOT, file).split(path.sep).join('/'), doc: JSON.parse(fs.readFileSync(file, 'utf8')) as Doc }))
  .filter(({ doc }) => doc && typeof doc === 'object' && !Array.isArray(doc));

test('decision A11 in the intent manifest names exactly the two Uzbek guides', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/seo/intent-manifest.json'), 'utf8')) as {
    architectureDecisions: Array<{ id: string; decision: string; decidedAt: string; pages?: string[]; evidence?: string }>;
  };
  const a11 = manifest.architectureDecisions.find((d) => d.id === 'A11-uz-access-guides-no-hreflang-pair-2026-10-26');
  assert.ok(a11, 'A11 is recorded');
  assert.equal(a11.decision, 'NO_HREFLANG_PAIR_WITH_RU');
  assert.equal(a11.decidedAt, '2026-10-26');
  assert.deepEqual([...(a11.pages ?? [])].sort(), [...GUIDES].sort());
  assert.match(a11.evidence ?? '', /2026-10-26-top3-roadmap/);
});

test('content: each guide is an Uzbek page that names no RU alternate and no x-default', () => {
  for (const guide of GUIDES) {
    const own = docs.filter(({ doc }) => doc.url === guide);
    assert.equal(own.length, 1, `${guide}: one content file`);
    const { file, doc } = own[0];
    assert.equal(doc.locale, 'uz', file);
    assert.equal(doc.status, 'published', file);
    assert.equal(doc.hreflangRu ?? '', '', `${file}: hreflangRu would pair the guide with a RU page`);
    assert.equal(doc.hreflangXDefault ?? '', '', `${file}: x-default belongs to a pair`);
    if (doc.hreflangUz) assert.equal(pathOf(doc.hreflangUz), guide, `${file}: hreflangUz may only name the guide itself`);
  }
});

test('content: no other page names either guide as an hreflang alternate', () => {
  const guides = new Set<string>(GUIDES);
  for (const { file, doc } of docs) {
    if (doc.url && guides.has(doc.url)) continue;
    for (const field of HREFLANG_FIELDS) {
      const value = doc[field];
      if (typeof value !== 'string' || !value) continue;
      assert.ok(!guides.has(pathOf(value)), `${file}: ${field} points at the Uzbek guide ${pathOf(value)}`);
    }
  }
});

const DIST = path.join(ROOT, 'dist');
const built = fs.existsSync(path.join(DIST, 'sitemap.xml'))
  && GUIDES.every((guide) => fs.existsSync(path.join(DIST, guide.slice(1), 'index.html')));

test('built site: the guides carry no hreflang link and no page points one at them', { skip: !built && 'no dist/ build present' }, () => {
  for (const guide of GUIDES) {
    const html = fs.readFileSync(path.join(DIST, guide.slice(1), 'index.html'), 'utf8');
    assert.doesNotMatch(html, /<link\b[^>]*\bhreflang=/i, `${guide}: an hreflang <link> in the HTML`);
  }
  const pages: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (entry.name !== 'assets') visit(path.join(dir, entry.name)); }
      else if (entry.name === 'index.html') pages.push(path.join(dir, entry.name));
    }
  };
  visit(DIST);
  assert.ok(pages.length > 300, `only ${pages.length} built pages`);
  for (const file of pages) {
    const html = fs.readFileSync(file, 'utf8');
    for (const link of html.match(/<link\b[^>]*\bhreflang=[^>]*>/gi) ?? []) {
      for (const guide of GUIDES) assert.ok(!link.includes(`${SITE}${guide}"`), `${path.relative(DIST, file)}: ${link}`);
    }
  }
});

// ---- Decision A14 (2026-11-18): the two chats stay linked for people but are not an hreflang pair.
const CHATS = { ru: '/ru/gpt-chat/', uz: '/uz/gpt-uzbek-tilida/' } as const;

test('decision A14 names exactly the two chats', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/seo/intent-manifest.json'), 'utf8')) as {
    architectureDecisions: Array<{ id: string; decision: string; decidedAt: string; pages?: string[]; evidence?: string }>;
  };
  const a14 = manifest.architectureDecisions.find((d) => d.id === 'A14-chat-pair-hreflang-unpaired-2026-11-18');
  assert.ok(a14, 'A14 is recorded');
  assert.equal(a14.decision, 'HREFLANG_UNPAIRED_KEEP_CROSS_LINKS');
  assert.deepEqual([...(a14.pages ?? [])].sort(), Object.values(CHATS).sort());
  assert.ok(fs.existsSync(path.join(ROOT, a14.evidence ?? '')), 'the evidence file exists');
});

test('content: both chats keep their language links for people and declare no hreflang pair', () => {
  for (const url of Object.values(CHATS)) {
    const own = docs.filter(({ doc }) => doc.url === url);
    assert.equal(own.length, 1, `${url}: one content file`);
    const { file, doc } = own[0];
    assert.equal((doc as { hreflangUnpaired?: unknown }).hreflangUnpaired, true, `${file}: hreflangUnpaired`);
    assert.equal(pathOf(doc.hreflangRu ?? ''), CHATS.ru, `${file}: hreflangRu keeps the visible pair`);
    assert.equal(pathOf(doc.hreflangUz ?? ''), CHATS.uz, `${file}: hreflangUz keeps the visible pair`);
  }
});

const chatsBuilt = fs.existsSync(path.join(DIST, 'sitemap.xml'))
  && Object.values(CHATS).every((url) => fs.existsSync(path.join(DIST, url.slice(1), 'index.html')));

test('built site: the chats carry no hreflang link, no sitemap alternates, and still link each other', { skip: !chatsBuilt && 'no dist/ build present' }, () => {
  const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const entries = sitemap.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  for (const [lang, url] of Object.entries(CHATS)) {
    const html = fs.readFileSync(path.join(DIST, url.slice(1), 'index.html'), 'utf8');
    assert.doesNotMatch(html, /<link\b[^>]*\bhreflang=/i, `${url}: an hreflang <link> in the HTML`);
    const other = lang === 'ru' ? CHATS.uz : CHATS.ru;
    assert.match(html, new RegExp(`<a\\b[^>]*href="(?:${SITE})?${other.replace(/\//g, '\\/')}"`), `${url}: a visible link to ${other}`);
    const own = entries.filter((entry) => entry.includes(`<loc>${SITE}${url}</loc>`));
    assert.equal(own.length, 1, `${url}: one sitemap entry`);
    assert.doesNotMatch(own[0], /xhtml:link/, `${url}: an alternate in the sitemap`);
  }
});

test('built site: the sitemap lists the guides without xhtml:link alternates', { skip: !built && 'no dist/ build present' }, () => {
  const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  const entries = sitemap.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  for (const guide of GUIDES) {
    const own = entries.filter((entry) => entry.includes(`<loc>${SITE}${guide}</loc>`));
    assert.equal(own.length, 1, `${guide}: one sitemap entry`);
    assert.doesNotMatch(own[0], /xhtml:link/, `${guide}: an alternate in the sitemap`);
    for (const entry of entries) assert.ok(!entry.includes(`hreflang="ru" href="${SITE}${guide}"`) && !entry.includes(`hreflang="uz" href="${SITE}${guide}"`) && !entry.includes(`hreflang="x-default" href="${SITE}${guide}"`), `${guide} named as an alternate`);
  }
});
