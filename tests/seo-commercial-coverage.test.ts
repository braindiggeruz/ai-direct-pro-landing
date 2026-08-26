// Two things this sprint learned the hard way, turned into gates.
//
// 1. /uz/telegram-reklama/ was a live Uzbek money page with no entry in
//    content/seo/intent-manifest.json, so every cluster-quality rule — including
//    the one that caps exact-match anchors at 60% — had silently never run
//    against it. When it was finally registered it was at 77%. A page can only
//    be missed like that once if something asserts the coverage.
//
// 2. content/seo/demand-policy.json recorded 390/mo against
//    «разработка сайтов в ташкенте». That volume belongs to the NON-geo head
//    term; the geo variants measure ~110. Nothing checked the file's internal
//    consistency, so the wrong number sat in the repository for 24 days and was
//    quoted as if it were measured.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { DemandPolicy } from '../src/shared/demand-gate';
import type { Page } from '../src/shared/types';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');

type Cluster = { id: string; hub: string; hubKeywords: string[]; spokes: { url: string }[] };
type Pair = { id: string; decision: string; decidedAt?: string; gscNote?: string };

const manifest: { clusters: Cluster[]; pairs: Pair[] } = JSON.parse(
  fs.readFileSync(path.join(CONTENT, 'seo', 'intent-manifest.json'), 'utf8'),
);
const policy: DemandPolicy & {
  approvedKeywords: {
    keyword: string;
    volumePerMonth: number;
    source?: string;
    measuredAt?: string;
    correctedAt?: string;
    note?: string;
  }[];
} = JSON.parse(fs.readFileSync(path.join(CONTENT, 'seo', 'demand-policy.json'), 'utf8'));

function readPages(dir: string): Page[] {
  const out: Page[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) out.push(JSON.parse(fs.readFileSync(full, 'utf8')) as Page);
    }
  };
  walk(dir);
  return out;
}

const pages = readPages(path.join(CONTENT, 'pages'));
const covered = new Set<string>([
  ...manifest.clusters.map((c) => c.hub),
  ...manifest.clusters.flatMap((c) => c.spokes.map((s) => s.url)),
]);

// ── cluster coverage ─────────────────────────────────────────────────────────

// The Uzbek commercial lane is what this sprint is measured on. Every one of
// these must be inside the manifest, with no exemption list.
const UZ_COMMERCIAL_LANE = [
  '/uz/sayt-yaratish/',
  '/uz/smm-xizmatlari/',
  '/uz/seo-xizmati/',
  '/uz/telegram-reklama/',
];

test('every Uzbek commercial money page is registered as a cluster hub', () => {
  const hubs = new Set(manifest.clusters.map((c) => c.hub));
  for (const url of UZ_COMMERCIAL_LANE) {
    const page = pages.find((p) => p.url === url);
    assert.ok(page, `${url} is missing from content/pages`);
    assert.equal(page.pageType, 'money', `${url} is no longer a money page`);
    assert.ok(
      hubs.has(url),
      `${url} is a live Uzbek money page with no cluster in content/seo/intent-manifest.json — `
        + 'every cluster-quality gate skips it while that is true',
    );
  }
});

// The Russian marketing pages the audit of 2026-08-25 classified as
// Defend / Watch / Freeze. They are deliberately outside the manifest today:
// several are frozen and none is being invested in this sprint. Recorded so the
// gap is visible and countable rather than silently forgotten.
// /ru/telegram-ads-uzbekistan/ left this list on 2026-08-26 when telegram-ru was
// registered — the advertising sweep of that day sized its cluster at roughly
// 7,900 searches a month, which is 3.6x webdev-uz.
const RU_COMMERCIAL_UNCLUSTERED = [
  '/ru/seo-prodvizhenie-saytov-tashkent/',
  '/ru/targetirovannaya-reklama-tashkent/',
  '/ru/kontekstnaya-reklama-tashkent/',
  '/ru/digital-marketing-tashkent/',
  '/ru/marketingovyi-audit-tashkent/',
  '/ru/sozdanie-sayta-dlya-biznesa/',
  '/ru/performance-marketing-tashkent/',
  '/ru/digital-strategiya-dlya-biznesa/',
];

test('the recorded Russian clustering gap does not grow silently', () => {
  const stillUncovered = RU_COMMERCIAL_UNCLUSTERED.filter((u) => !covered.has(u));
  assert.ok(
    stillUncovered.length <= RU_COMMERCIAL_UNCLUSTERED.length,
    'unreachable — guards the list below',
  );
  // Anything that gets clustered later should be removed from the list above,
  // so the list stays an accurate description of the gap.
  const nowCovered = RU_COMMERCIAL_UNCLUSTERED.filter((u) => covered.has(u));
  assert.deepEqual(
    nowCovered,
    [],
    `these are now clustered and should be dropped from RU_COMMERCIAL_UNCLUSTERED: ${nowCovered.join(', ')}`,
  );
});

test('no cluster hub is a spoke of another cluster', () => {
  const hubs = new Set(manifest.clusters.map((c) => c.hub));
  for (const cluster of manifest.clusters) {
    for (const spoke of cluster.spokes) {
      assert.ok(
        !hubs.has(spoke.url),
        `${spoke.url} is declared both as a hub and as a spoke of ${cluster.id}`,
      );
    }
  }
});

test('a cluster declares at least one hub keyword and no empty one', () => {
  for (const cluster of manifest.clusters) {
    assert.ok(cluster.hubKeywords.length > 0, `${cluster.id} declares no hub keyword`);
    for (const keyword of cluster.hubKeywords) {
      assert.ok(keyword.trim().length > 0, `${cluster.id} declares an empty hub keyword`);
    }
  }
});

test('every declared intent exception records why and when it was decided', () => {
  for (const pair of manifest.pairs) {
    assert.ok(pair.decision, `${pair.id} has no decision`);
    assert.ok(pair.decidedAt, `${pair.id} does not say when it was decided`);
    assert.ok(
      (pair.gscNote || '').length > 60,
      `${pair.id} has no evidence note — an intent exception without evidence is an opinion`,
    );
  }
});

// ── demand policy data integrity ─────────────────────────────────────────────

test('every approved keyword records a volume, a source and a measurement date', () => {
  for (const row of policy.approvedKeywords) {
    assert.ok(row.keyword.trim().length > 0, 'an approved keyword row has an empty keyword');
    assert.equal(
      typeof row.volumePerMonth,
      'number',
      `${row.keyword} has a non-numeric volume`,
    );
    assert.ok(
      Number.isInteger(row.volumePerMonth) && row.volumePerMonth >= 0,
      `${row.keyword} records ${row.volumePerMonth}/mo`,
    );
    assert.ok(row.source, `${row.keyword} records no source`);
    assert.ok(row.measuredAt, `${row.keyword} records no measurement date`);
  }
});

test('no approved keyword is recorded twice', () => {
  const seen = new Set<string>();
  for (const row of policy.approvedKeywords) {
    const key = row.keyword.toLowerCase();
    assert.ok(!seen.has(key), `${row.keyword} appears twice in demand-policy.json`);
    seen.add(key);
  }
});

// The exact defect this file was written for: Google Ads groups «X ташкент» and
// «X в ташкенте» into one measurement, so two rows that normalise to the same
// geo phrase must not disagree. They did — 390 against 110 — and the higher
// figure had been borrowed from the non-geo head term.
// «разработка сайтов ташкент» and «разработка сайтов в ташкенте» are the same
// query to Google Ads: the preposition and the locative ending are the only
// difference. Fold both away so the two rows land in the same bucket.
function normaliseGeo(keyword: string): string {
  // \b is ASCII-only in JS, so it never matches next to a Cyrillic letter —
  // the boundaries have to be written out.
  return keyword
    .toLowerCase()
    .replace(/(^|\s)в(\s+)/g, '$1')
    .replace(/ташкенте(?=\s|$)/g, 'ташкент')
    .replace(/\s+/g, ' ')
    .trim();
}

test('two spellings of the same geo phrase record the same volume', () => {
  const byPhrase = new Map<string, { keyword: string; volumePerMonth: number }[]>();
  for (const row of policy.approvedKeywords) {
    const key = normaliseGeo(row.keyword);
    byPhrase.set(key, [...(byPhrase.get(key) || []), row]);
  }
  for (const [phrase, rows] of byPhrase) {
    if (rows.length < 2) continue;
    const volumes = new Set(rows.map((r) => r.volumePerMonth));
    assert.equal(
      volumes.size,
      1,
      `"${phrase}" is recorded at ${[...volumes].join(' and ')}/mo by ${rows
        .map((r) => `"${r.keyword}"`)
        .join(' vs ')} — Google Ads measures these together, so one of them is borrowed`,
    );
  }
});

test('a corrected volume keeps the evidence for the correction', () => {
  for (const row of policy.approvedKeywords) {
    if (!row.correctedAt) continue;
    assert.ok(
      (row.note || '').length > 40,
      `${row.keyword} was corrected on ${row.correctedAt} with no note explaining what was wrong`,
    );
  }
});

test('the webdev geo correction of 2026-08-25 stays corrected', () => {
  const geo = policy.approvedKeywords.filter((r) => normaliseGeo(r.keyword) === 'разработка сайтов ташкент');
  assert.equal(geo.length, 2, 'expected both spellings of the Russian geo webdev term');
  for (const row of geo) {
    assert.equal(
      row.volumePerMonth,
      110,
      `${row.keyword} is back at ${row.volumePerMonth}/mo — 390 belongs to the non-geo head term`,
    );
  }
});

test('the non-geo Russian webdev head term is not approved for a new page', () => {
  // 390/mo, but its SERP carries a 3-5 slot local pack that is unreachable
  // without a Google Business Profile. Approving it here would let the demand
  // gate wave through a page the site cannot rank.
  const approved = policy.approvedKeywords.map((r) => r.keyword.toLowerCase());
  for (const forbidden of ['разработка сайтов', 'создание сайтов', 'рекламное агентство']) {
    assert.ok(
      !approved.includes(forbidden),
      `"${forbidden}" is approved in demand-policy.json — its SERP is local-pack gated`,
    );
  }
});
