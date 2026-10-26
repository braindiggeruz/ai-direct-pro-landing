// Growth audit 2026-10-24, W1-11 (lens L5-07; corrected action in
// docs/seo/research/2026-10-24-growth-audit/verify-W1-11.md).
//
// content/seo/intent-manifest.json gives each side of a pair (and the
// architecture decisions that carry their own list) the phrases that page must
// NOT target. An internal link whose anchor IS one of those phrases hands the
// target exactly the query the manifest reserved for its counterpart. No other
// test compared anchors with the target's list: tests/seo-content-guards.test.ts
// compares an anchor with the SOURCE page's own primaryKeyword, and
// tests/seo-cluster-quality.test.ts only caps the top anchor's share on a hub.
//
// The rule is EXACT equality after normalisation, not substring: a substring
// rule adds 12 known false positives («услуги SMM-специалиста» ⊃ «услуги smm»,
// «biznes uchun AI-bot nima» ⊃ «biznes uchun ai-bot», …).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');
const SOURCE_DIRS = ['blog', 'pages', path.join('studio', 'pages')];

/** Case, apostrophe variants (ʻ ʼ ’ ' ` → ‘), NBSP and runs of whitespace do not make a different anchor. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u02BB\u02BC\u2019'`]/g, '\u2018')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The site path a link target points at, or null for external, mailto:, tel: and in-page links. */
function internalPath(target: string): string | null {
  const local = target.trim().replace(/^https?:\/\/(?:www\.)?gptbot\.uz(?=[/?#]|$)/i, '') || '/';
  if (!local.startsWith('/') || local.startsWith('//')) return null;
  let pathname = local.split(/[?#]/)[0] || '/';
  // `/x` is redirected to `/x/`; treat both as the same target.
  if (!pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(pathname)) pathname += '/';
  return pathname;
}

// ── forbidden phrases per target URL ─────────────────────────────────────────

type Side = { url?: string; mustNotTarget?: string[] };
type Manifest = {
  pairs: Array<{ id: string; commercial?: Side; informational?: Side }>;
  architectureDecisions?: Array<{ id: string; url?: string; counterpart?: string; mustNotTarget?: string[] }>;
};
const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT, 'seo', 'intent-manifest.json'), 'utf8')) as Manifest;

/** target path → normalised phrase → manifest entries that forbid it. One URL can sit in many pairs (/ru/gpt-chat/: C23–C38). */
const forbidden = new Map<string, Map<string, Set<string>>>();
function forbid(url: string | undefined, phrases: string[] | undefined, id: string): void {
  if (!url || !phrases?.length) return;
  const byPhrase = forbidden.get(url) ?? new Map<string, Set<string>>();
  for (const phrase of phrases) {
    const key = normalize(phrase);
    if (!key) continue;
    byPhrase.set(key, (byPhrase.get(key) ?? new Set<string>()).add(id));
  }
  forbidden.set(url, byPhrase);
}
for (const pair of manifest.pairs) {
  for (const side of [pair.commercial, pair.informational]) forbid(side?.url, side?.mustNotTarget, pair.id);
}
// An architecture decision with its own mustNotTarget (today A8, the RU↔UZ
// translator pages) fences both of its URLs.
for (const decision of manifest.architectureDecisions ?? []) {
  forbid(decision.url, decision.mustNotTarget, decision.id);
  forbid(decision.counterpart, decision.mustNotTarget, decision.id);
}

// ── every link in published content ──────────────────────────────────────────

type Link = { file: string; block: string; location: string; target: string; anchor: string };

function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJson(full);
    return entry.name.endsWith('.json') ? [full] : [];
  });
}

const format = (segments: Array<string | number>): string =>
  segments.map((s, i) => (typeof s === 'number' ? `[${s}]` : i === 0 ? s : `.${s}`)).join('');

let publishedFiles = 0;
const links: Link[] = [];
for (const full of SOURCE_DIRS.flatMap((dir) => listJson(path.join(CONTENT, dir)))) {
  const doc = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, unknown>;
  if (doc.status !== 'published') continue;
  publishedFiles += 1;
  const file = path.relative(ROOT, full).split(path.sep).join('/');
  // internalLinks[], body[]/bodyBlocks[] links[] (linkp), and any other
  // {target, anchor} object a template renders as a link.
  const visit = (value: unknown, segments: Array<string | number>): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...segments, index]));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.target === 'string' && typeof record.anchor === 'string') {
      // A link inside a block is keyed by its block (body[34]); a list entry by itself (internalLinks[1]).
      const inBlock = segments.length >= 3 && segments[segments.length - 2] === 'links';
      links.push({
        file,
        block: format(inBlock ? segments.slice(0, -2) : segments),
        location: format(segments),
        target: record.target,
        anchor: record.anchor,
      });
    }
    for (const [key, child] of Object.entries(record)) visit(child, [...segments, key]);
  };
  visit(doc, []);
}

type Violation = Link & { path: string; ids: string[] };
const violations: Violation[] = [];
for (const link of links) {
  const target = internalPath(link.target);
  if (!target) continue;
  const ids = forbidden.get(target)?.get(normalize(link.anchor));
  if (ids) violations.push({ ...link, path: target, ids: [...ids].sort() });
}

// ── deliberately deferred violations ──────────────────────────────────────────
//
// Backlog W3-02 (≈2026-11-25, after the RU chat's 28-day read ≈21–25.11): 301
// /ru/blog/chat-gpt-online/ → /ru/gpt-chat/ (pair C23) and clean these anchors.
// They are links to or from that article and are left alone until then so the
// RU chat's query signals do not move inside its measurement window. Nothing
// else may be added here. Keyed by (file, block, target, anchor): when W3-02
// fixes one, the entry stops matching and the second test fails until the
// entry is deleted. H-3 is not here: W1-10 fixed it. H-4b is a
// substring-only match the exact rule does not see (W3-02 owns it). H-5 was
// one too; W2-01 (R-S1b, 26.10.2026) fixed it, and a test below keeps it fixed.
type Deferred = { id: string; backlog: 'W3-02'; file: string; block: string; target: string; anchor: string };
const DEFERRED: Deferred[] = [
  // H-1 → W3-02 ≈2026-11-25: «чат GPT онлайн» is in C23's mustNotTarget for the article itself.
  { id: 'H-1', backlog: 'W3-02', file: 'content/blog/ru/chat-gpt-na-russkom.json', block: 'internalLinks[1]', target: '/ru/blog/chat-gpt-online/', anchor: 'чат GPT онлайн' },
  // H-2 → W3-02 ≈2026-11-25: leaves with the redirected article; «Chat GPT на русском» is C10's.
  { id: 'H-2', backlog: 'W3-02', file: 'content/blog/ru/chat-gpt-online.json', block: 'internalLinks[1]', target: '/ru/blog/chat-gpt-na-russkom/', anchor: 'Chat GPT на русском' },
  // H-4a → W3-02 ≈2026-11-25: the linkp moves to /ru/gpt-chat/ with the anchor «ИИ-чат GPTBot.uz».
  { id: 'H-4a', backlog: 'W3-02', file: 'content/blog/ru/zakazat-telegram-bota.json', block: 'body[34]', target: '/ru/blog/chat-gpt-online/', anchor: 'чат GPT онлайн' },
];

const matches = (entry: Deferred, violation: Violation): boolean =>
  violation.file === entry.file
  && violation.block === entry.block
  && violation.path === entry.target
  && normalize(violation.anchor) === normalize(entry.anchor);

const describe = (v: Violation): string =>
  `${v.file} ${v.location} → ${v.target}: anchor «${v.anchor}» is in mustNotTarget of ${v.path} (${v.ids.join(', ')})`;

test('the scan reads the manifest and the published content it guards', () => {
  assert.equal(normalize('O\'zbek\u00A0 TILIDA '), normalize('o‘zbek tilida'));
  assert.equal(normalize('ta\u02BClim'), normalize('ta’lim'));
  assert.equal(internalPath('https://gptbot.uz/ru/gpt-chat/#chat'), '/ru/gpt-chat/');
  assert.equal(internalPath('/ru/gpt-chat?x=1'), '/ru/gpt-chat/');
  assert.equal(internalPath('https://chatgpt.com/'), null);
  assert.equal(internalPath('#faq'), null);
  // Not vacuous: dozens of fenced URLs, the translator decision included, and thousands of links.
  assert.ok(forbidden.size >= 40, `only ${forbidden.size} URLs carry mustNotTarget`);
  assert.ok(forbidden.has('/ru/gpt-chat/') && forbidden.has('/ru/blog/chat-gpt-online/'));
  assert.ok(forbidden.get('/ru/russko-uzbekskiy-perevodchik/')?.has('переводчик'), 'A8 must fence the RU translator page');
  assert.ok(forbidden.get('/uz/rus-ozbek-tarjimon/')?.has('tarjimon'), 'A8 must fence the UZ translator page');
  assert.ok(publishedFiles >= 250, `only ${publishedFiles} published content files`);
  assert.ok(links.length >= 2500, `only ${links.length} links found`);
});

test('no internal anchor equals a phrase the intent manifest forbids its target', () => {
  const unexpected = violations.filter((v) => !DEFERRED.some((entry) => matches(entry, v)));
  assert.deepEqual(
    unexpected.map(describe),
    [],
    'Pick an anchor that names what the target page owns, not a phrase the manifest reserved for another URL.',
  );
});

test('every deferred exception is still live, so the list cannot rot', () => {
  for (const entry of DEFERRED) {
    const live = violations.filter((v) => matches(entry, v));
    assert.equal(
      live.length,
      1,
      `${entry.id} (${entry.backlog}): ${entry.file} ${entry.block} → ${entry.target} «${entry.anchor}» `
        + (live.length === 0
          ? 'no longer violates the rule — delete it from DEFERRED (or, if only the block index moved, update it).'
          : `matches ${live.length} links; an exception covers exactly one.`),
    );
  }
});

test('H-5 stays fixed: the prompt library names the insho guide by insho and esse, not referat', () => {
  // Backlog W2-01 (R-S1b, 26.10.2026; intent manifest C30): «referat yozish»
  // is fenced on the insho/esse guide and belongs to /uz/blog/referat-va-mustaqil-ish/.
  // The exact-match rule above cannot see «insho va referat yozish».
  const source = 'content/blog/uz/chatgpt-uzbek-tilida-promptlar.json';
  const toInsho = links.filter((link) => link.file === source
    && internalPath(link.target) === '/uz/blog/insho-yozish-suniy-intellekt-bilan/');
  assert.deepEqual(toInsho.map((link) => normalize(link.anchor)), [normalize('insho va esse yozish')]);
  assert.ok(!links.some((link) => internalPath(link.target) === '/uz/blog/insho-yozish-suniy-intellekt-bilan/'
    && /referat/i.test(link.anchor)), 'no anchor to the insho/esse guide mentions referat');
});

test('no internal link uses the bare «ChatGPT kirish» or «чат джипити» as its anchor', () => {
  // Anchor policy (intent manifest C22 and C10, docs/seo/CHANGE_LOG_2026-10.md):
  // no URL is pulled to the bare login query by an anchor, and «чат джипити» is
  // mentioned as text, never used as link text.
  const banned = new Set(['chatgpt kirish', 'чат джипити'].map(normalize));
  const hits = links
    .filter((link) => internalPath(link.target) && banned.has(normalize(link.anchor)))
    .map((link) => `${link.file} ${link.location} → ${link.target}: «${link.anchor}»`);
  assert.deepEqual(hits, []);
});
