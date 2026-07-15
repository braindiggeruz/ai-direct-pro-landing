// SEO Booster Engine — pure scoring + analysis library.
//
// Used by:
//  • /api/seo/booster  Cloudflare Pages Function (read-only dashboard data)
//  • /api/seo/indexnow Cloudflare Pages Function (safe submit guard)
//  • src/admin/pages/SeoBooster.tsx (UI helpers / re-renders)
//
// Pure TypeScript, no Node APIs, no fetch. Same module runs in the Workers
// runtime and in the admin SPA. All inputs come from /api/content; nothing
// here touches the network.
//
// White-hat only. NO behaviour that:
//  - mass-pings the same URL more than once per change
//  - submits noindex / admin / api / draft URLs
//  - fakes lastmod or schema
//  - bypasses the publish guard
//
// References (verified):
//  - Sitemap best practices: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
//  - URL Inspection API: https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
//  - Indexing API scope:  https://developers.google.com/search/apis/indexing-api/v3/quickstart  (JobPosting / BroadcastEvent ONLY — DO NOT use for blog/money)
//  - IndexNow protocol:   https://www.indexnow.org/documentation
//  - Hreflang reciprocity: https://developers.google.com/search/docs/specialty/international/localized-versions

import type { Page, BlogArticle, GlobalSEO, Locale, PageType } from './types';
import { hasMojibake } from './audit';
import { HREFLANG_PAIRS, SITE_URL } from './site-config';

// ---------------------------------------------------------------------------
// Unified content item
// ---------------------------------------------------------------------------
export type ContentKind = 'page' | 'blog';

export interface BoosterItem {
  kind: ContentKind;
  url: string;
  locale: Locale;
  pageType: PageType;
  title: string;
  h1: string;
  description: string;
  primaryKeyword: string;
  canonical: string;
  hreflangPair: string | undefined;
  hreflangReciprocal: boolean;
  status: 'draft' | 'published' | 'noindex';
  robotsIndex: boolean;
  inSitemap: boolean;
  hasSchema: boolean;
  faqCount: number;
  outgoingLinks: number;
  incomingLinks: number;
  isOrphan: boolean;
  lastModifiedAt: string | undefined; // ISO
  daysSinceUpdate: number; // 9999 if unknown
  mojibake: boolean;
  cluster: string | undefined;
  scores: {
    indexationPriority: number;
    moneyPower: number | null; // null for non-money
    freshness: number;
    quality: number; // re-uses audit issue counts to give a 0..100
  };
  flags: {
    canonicalSelf: boolean;
    canonicalMatchesUrl: boolean;
    descriptionInRange: boolean;
    titleInRange: boolean;
    needsFaq: boolean;
    pushable: boolean; // safe to submit to IndexNow / GSC
    pushReasons: string[]; // if !pushable, why
  };
}

// ---------------------------------------------------------------------------
// Cluster definition. We define clusters from MONEY_PAGES groups; supporting
// blog membership is inferred from `topicCluster` on each BlogArticle, with a
// keyword-overlap fallback for legacy posts.
// ---------------------------------------------------------------------------
export interface ClusterDef {
  id: string;
  label: string;
  money: { ru: string[]; uz: string[] };
  // canonical RU money page (used as the cluster head for scoring)
  head: string;
}

export const CLUSTERS: ClusterDef[] = [
  { id: 'ai-bot-business',   label: 'AI/GPT bot for business',  money: { ru: ['/ru/ai-bot-dlya-biznesa/', '/ru/gpt-bot-dlya-biznesa/', '/ru/chat-bot-dlya-biznesa/'], uz: ['/uz/biznes-uchun-ai-bot/', '/uz/gpt-bot-biznes-uchun/'] }, head: '/ru/ai-bot-dlya-biznesa/' },
  { id: 'telegram-bot',      label: 'Telegram bot for business', money: { ru: ['/ru/telegram-bot-dlya-biznesa/'], uz: ['/uz/telegram-bot-biznes-uchun/'] }, head: '/ru/telegram-bot-dlya-biznesa/' },
  { id: 'instagram-direct',  label: 'Instagram Direct bot',     money: { ru: ['/ru/instagram-direct-bot/', '/ru/ai-menedzher-dlya-instagram/'], uz: ['/uz/instagram-bot-biznes-uchun/'] }, head: '/ru/instagram-direct-bot/' },
  { id: 'lead-processing',   label: 'Lead processing automation', money: { ru: ['/ru/bot-dlya-obrabotki-zayavok/', '/ru/avtomatizatsiya-zayavok/', '/ru/ai-prodavec/'], uz: ['/uz/arizalarni-avtomatlashtirish/'] }, head: '/ru/avtomatizatsiya-zayavok/' },
  { id: 'sales-automation',  label: 'Sales automation',          money: { ru: ['/ru/avtomatizatsiya-prodazh/'], uz: ['/uz/savdoni-avtomatlashtirish/'] }, head: '/ru/avtomatizatsiya-prodazh/' },
  { id: 'niche-clinic',      label: 'Niche: Clinic',             money: { ru: ['/ru/ai-bot-dlya-kliniki/'], uz: ['/uz/klinika-uchun-ai-bot/'] }, head: '/ru/ai-bot-dlya-kliniki/' },
  { id: 'niche-beauty',      label: 'Niche: Beauty salon',       money: { ru: ['/ru/ai-bot-dlya-salona-krasoty/'], uz: ['/uz/salon-uchun-ai-bot/'] }, head: '/ru/ai-bot-dlya-salona-krasoty/' },
  { id: 'niche-edu',         label: 'Niche: Education center',   money: { ru: ['/ru/ai-bot-dlya-uchebnogo-tsentra/'], uz: ['/uz/oquv-markazi-uchun-ai-bot/'] }, head: '/ru/ai-bot-dlya-uchebnogo-tsentra/' },
  { id: 'niche-shop',        label: 'Niche: Shop',               money: { ru: ['/ru/ai-bot-dlya-magazina/'], uz: ['/uz/dokon-uchun-ai-bot/'] }, head: '/ru/ai-bot-dlya-magazina/' },
  { id: 'niche-horeca',      label: 'Niche: HoReCa',             money: { ru: ['/ru/ai-bot-dlya-horeca/'], uz: [] }, head: '/ru/ai-bot-dlya-horeca/' },
];

export interface ClusterReport {
  id: string;
  label: string;
  moneyUrls: string[];
  moneyUrlsPresent: string[];
  moneyUrlsMissing: string[];
  supportingArticles: { url: string; locale: Locale; pointsToMoney: boolean }[];
  ruUzPairsOk: number;
  ruUzPairsMissing: number;
  averageIncomingToMoney: number;
  authorityScore: number; // 0..100
  gaps: string[];
}

export interface CannibalizationPair {
  a: string;
  b: string;
  locale: Locale;
  risk: number; // 0..100
  reasons: string[];
  suggestion: 'merge' | 'canonicalize' | 'differentiate' | 'noindex-weaker';
}

export interface BoosterSummary {
  totalUrls: number;
  pushableUrls: number;
  pagesPushable: number;
  blogPushable: number;
  orphanPages: number;
  moneyLowIncoming: number;
  freshLast30d: number;
  staleOver180d: number;
  avgIndexationPriority: number;
  cannibalizationHigh: number;
  clusterAuthorityAvg: number;
  generatedAt: string;
}

export interface BoosterReport {
  summary: BoosterSummary;
  items: BoosterItem[];
  clusters: ClusterReport[];
  cannibalization: CannibalizationPair[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function daysSince(iso: string | undefined): number {
  if (!iso) return 9999;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 9999;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function relUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  return u.replace(/^https?:\/\/[^/]+/, '') || undefined;
}

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni ? inter / uni : 0;
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
export function scoreFreshness(item: { lastModifiedAt?: string; pageType?: string }): number {
  const d = daysSince(item.lastModifiedAt);
  // Blog ages faster than money pages; homepage almost never decays.
  const isBlog = item.pageType === 'blog';
  if (d <= 30) return 100;
  if (d <= 90)  return isBlog ? 70 : 85;
  if (d <= 180) return isBlog ? 50 : 70;
  if (d <= 365) return isBlog ? 30 : 55;
  if (d <= 9000) return 20;
  return 50; // unknown lastmod — neutral, not punitive
}

export function scoreMoneyPower(item: BoosterItem): number {
  if (item.pageType !== 'money') return 0;
  let s = 0;
  // 25 — incoming internal links
  s += Math.min(25, Math.round((item.incomingLinks / 4) * 25));
  // 20 — FAQ
  s += item.faqCount >= 4 ? 20 : Math.round((item.faqCount / 4) * 20);
  // 20 — schema present
  s += item.hasSchema ? 20 : 0;
  // 15 — hreflang reciprocal
  s += item.hreflangReciprocal ? 15 : 0;
  // 10 — outgoing internal links
  s += item.outgoingLinks >= 3 ? 10 : Math.round((item.outgoingLinks / 3) * 10);
  // 10 — description length in 120..160
  s += item.flags.descriptionInRange ? 10 : 0;
  return clamp(s);
}

export function scoreIndexationPriority(item: BoosterItem): number {
  // Higher = more urgent to surface for IndexNow / GSC manual queue.
  // Non-pushable items get 0 so they cannot be picked up by automation.
  if (!item.flags.pushable) return 0;
  let s = 0;
  if (item.pageType === 'money') s += 25;
  else if (item.pageType === 'niche') s += 18;
  else if (item.pageType === 'blog') s += 10;
  else if (item.pageType === 'homepage') s += 30;
  // Authority signals — keep surfacing what users link to.
  if (item.incomingLinks >= 2) s += 15;
  else if (item.incomingLinks === 1) s += 8;
  // Hreflang reciprocity (helps international serving).
  if (item.hreflangReciprocal) s += 10;
  // Freshness recency boost.
  if (item.daysSinceUpdate <= 30) s += 20;
  else if (item.daysSinceUpdate <= 90) s += 12;
  else if (item.daysSinceUpdate <= 180) s += 6;
  // Penalize if missing critical metadata.
  if (!item.flags.titleInRange) s -= 8;
  if (!item.flags.descriptionInRange) s -= 5;
  if (!item.hasSchema) s -= 5;
  if (item.isOrphan) s -= 10;
  return clamp(s);
}

// ---------------------------------------------------------------------------
// Build report
// ---------------------------------------------------------------------------
function isPushableUrl(url: string): { ok: boolean; reason?: string } {
  if (!url || !url.startsWith('/')) return { ok: false, reason: 'non-relative URL' };
  if (url.startsWith('/admin-tools')) return { ok: false, reason: '/admin-tools blocked' };
  if (url.startsWith('/api/')) return { ok: false, reason: '/api blocked' };
  if (url.includes('?')) return { ok: false, reason: 'query string URL' };
  if (url.includes('#')) return { ok: false, reason: 'fragment URL' };
  return { ok: true };
}

function pageToItem(
  src: Page | BlogArticle,
  kind: ContentKind,
  ctx: { allUrls: Set<string>; incomingMap: Map<string, number>; outgoingMap: Map<string, number> },
): BoosterItem {
  const url = src.url;
  const locale = src.locale;
  const pageType = (kind === 'blog' ? 'blog' : (src as Page).pageType) || 'blog';
  const title = (src as Page).title || (src as BlogArticle).title || '';
  const h1 = (src as Page).h1 || (src as BlogArticle).h1 || '';
  const description = (src as Page).description || (src as BlogArticle).description || '';
  const primaryKeyword = (src as Page).primaryKeyword || ((src as BlogArticle).keywords?.[0] ?? '');
  const canonical = (src as Page).canonical || (src as BlogArticle).canonical || '';
  const hreflangPair = locale === 'ru'
    ? relUrl((src as Page).hreflangUz || (src as BlogArticle).hreflangUz)
    : relUrl((src as Page).hreflangRu || (src as BlogArticle).hreflangRu);
  const hreflangReciprocal = !!hreflangPair && ctx.allUrls.has(hreflangPair);
  const status = src.status;
  const robotsIndex = src.robotsIndex !== false;
  const inSitemap = status === 'published' && robotsIndex;
  const schemaTypes = (src as Page).schemaTypes || (src as BlogArticle).schemaTypes || [];
  const hasSchema = (schemaTypes?.length || 0) > 0;
  const faqCount = (src.faq?.length) || 0;
  const outgoing = (src.internalLinks || []).filter((l) => l.target).length;
  const incoming = ctx.incomingMap.get(url) || 0;
  const lastModifiedAt = (src as Page).updatedAt
    || (src as BlogArticle).dateModified
    || (src as BlogArticle).datePublished
    || (src as Page).lastReviewedAt
    || (src as Page).createdAt
    || (src as BlogArticle).createdAt;
  const ds = daysSince(lastModifiedAt);
  const mojibake = hasMojibake(title) || hasMojibake(description) || hasMojibake(h1);

  // Cluster lookup
  let cluster: string | undefined;
  for (const c of CLUSTERS) {
    if (c.money.ru.includes(url) || c.money.uz.includes(url)) { cluster = c.id; break; }
  }
  if (!cluster && kind === 'blog') {
    const tc = (src as BlogArticle).topicCluster;
    if (tc) {
      const found = CLUSTERS.find((c) => c.id === tc || c.label.toLowerCase().includes(tc.toLowerCase()));
      if (found) cluster = found.id;
    }
  }

  const titleInRange = title.length >= 45 && title.length <= 65;
  const descriptionInRange = description.length >= 120 && description.length <= 160;
  const canonicalSelf = !!canonical;
  const canonicalMatchesUrl = relUrl(canonical) === url || canonical === url;
  const needsFaq = (pageType === 'money' && faqCount < 4) || (pageType === 'blog' && faqCount < 3);

  // Pushability — single source of truth used by ALL automation surfaces.
  const pushReasons: string[] = [];
  const urlGuard = isPushableUrl(url);
  if (!urlGuard.ok) pushReasons.push(urlGuard.reason!);
  if (status !== 'published') pushReasons.push(`status=${status}`);
  if (!robotsIndex) pushReasons.push('robotsIndex=false');
  if (mojibake) pushReasons.push('mojibake detected');
  if (!title || !description) pushReasons.push('missing title/description');
  if (!canonical) pushReasons.push('missing canonical');
  const pushable = pushReasons.length === 0;

  const flags = {
    canonicalSelf, canonicalMatchesUrl, descriptionInRange, titleInRange, needsFaq, pushable, pushReasons,
  };

  const isOrphan = status === 'published' && pageType !== 'homepage' && incoming === 0;

  // Quality score — derived from the same rules as the audit but compressed
  // into a single 0..100 number for sortable dashboards.
  let q = 100;
  if (!title) q -= 25; else if (!titleInRange) q -= 8;
  if (!description) q -= 25; else if (!descriptionInRange) q -= 6;
  if (!h1) q -= 15;
  if (!canonical) q -= 10;
  if (!hasSchema) q -= 8;
  if (needsFaq) q -= 8;
  if (outgoing < 3) q -= 5;
  if (pageType === 'money' && incoming < 2) q -= 10;
  if (isOrphan) q -= 12;
  if (mojibake) q = 0;

  const item: BoosterItem = {
    kind, url, locale, pageType, title, h1, description, primaryKeyword, canonical,
    hreflangPair, hreflangReciprocal, status, robotsIndex, inSitemap, hasSchema,
    faqCount, outgoingLinks: outgoing, incomingLinks: incoming, isOrphan,
    lastModifiedAt, daysSinceUpdate: ds, mojibake, cluster,
    scores: { indexationPriority: 0, moneyPower: null, freshness: 0, quality: clamp(q) },
    flags,
  };
  ctx.outgoingMap.set(url, outgoing);
  item.scores.freshness = scoreFreshness({ lastModifiedAt, pageType });
  item.scores.moneyPower = pageType === 'money' ? scoreMoneyPower(item) : null;
  item.scores.indexationPriority = scoreIndexationPriority(item);
  return item;
}

function buildIncomingMap(pages: Page[], blog: BlogArticle[]): Map<string, number> {
  const m = new Map<string, number>();
  const add = (target: string) => m.set(target, (m.get(target) || 0) + 1);
  for (const p of pages) for (const l of p.internalLinks || []) if (l.target?.startsWith('/')) add(l.target);
  for (const a of blog)  for (const l of a.internalLinks || []) if (l.target?.startsWith('/')) add(l.target);
  return m;
}

export function buildBoosterReport(
  pages: Page[],
  blog: BlogArticle[],
  // global is currently unused but kept in signature so future scoring can
  // factor in defaults (e.g. defaultOgImage missing → OG-image penalty).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _global?: GlobalSEO,
): BoosterReport {
  const allUrls = new Set<string>([
    ...pages.map((p) => p.url),
    ...blog.map((b) => b.url),
  ]);
  const incomingMap = buildIncomingMap(pages, blog);
  const outgoingMap = new Map<string, number>();
  const ctx = { allUrls, incomingMap, outgoingMap };
  const items: BoosterItem[] = [
    ...pages.map((p) => pageToItem(p, 'page', ctx)),
    ...blog.map((b) => pageToItem(b, 'blog', ctx)),
  ];

  // Clusters
  const clusters: ClusterReport[] = CLUSTERS.map((c) => {
    const all = [...c.money.ru, ...c.money.uz];
    const present = all.filter((u) => allUrls.has(u));
    const missing = all.filter((u) => !allUrls.has(u));
    const moneyItems = items.filter((i) => all.includes(i.url));
    const supportingArticles = items.filter(
      (i) => i.kind === 'blog' && i.cluster === c.id,
    ).map((i) => ({
      url: i.url, locale: i.locale,
      pointsToMoney: blog
        .find((b) => b.url === i.url)
        ?.internalLinks?.some((l) => all.includes(l.target)) === true,
    }));
    // hreflang pairs
    let pairsOk = 0; let pairsMissing = 0;
    for (const [ru, uz] of HREFLANG_PAIRS) {
      if (all.includes(ru) || all.includes(uz)) {
        if (allUrls.has(ru) && allUrls.has(uz)) pairsOk++; else pairsMissing++;
      }
    }
    const avgIncomingToMoney = moneyItems.length
      ? Math.round(moneyItems.reduce((s, i) => s + i.incomingLinks, 0) / moneyItems.length * 10) / 10
      : 0;
    const completeness = all.length ? (present.length / all.length) * 100 : 0;
    const inbound = Math.min(1, avgIncomingToMoney / 3) * 100;
    const hreflangShare = (pairsOk + pairsMissing) > 0 ? (pairsOk / (pairsOk + pairsMissing)) * 100 : 100;
    const authorityScore = Math.round(0.5 * completeness + 0.3 * inbound + 0.2 * hreflangShare);
    const gaps: string[] = [];
    if (missing.length) gaps.push(`${missing.length} money page(s) not present`);
    if (avgIncomingToMoney < 2) gaps.push(`avg incoming to money < 2 (have ${avgIncomingToMoney})`);
    if (supportingArticles.length < 3) gaps.push(`only ${supportingArticles.length} supporting article(s) (target 3+)`);
    if (pairsMissing) gaps.push(`${pairsMissing} RU↔UZ hreflang pair(s) incomplete`);
    return {
      id: c.id, label: c.label, moneyUrls: all, moneyUrlsPresent: present, moneyUrlsMissing: missing,
      supportingArticles, ruUzPairsOk: pairsOk, ruUzPairsMissing: pairsMissing,
      averageIncomingToMoney: avgIncomingToMoney, authorityScore: clamp(authorityScore), gaps,
    };
  });

  // Cannibalization — pairs within the same locale where title/keyword overlap is high.
  const cannibalization: CannibalizationPair[] = [];
  const published = items.filter((i) => i.status === 'published' && i.robotsIndex);
  for (let i = 0; i < published.length; i++) {
    for (let j = i + 1; j < published.length; j++) {
      const a = published[i]; const b = published[j];
      if (a.locale !== b.locale) continue;
      if (a.url === b.url) continue;
      const titleSim = jaccard(tokenize(a.title), tokenize(b.title));
      const h1Sim    = jaccard(tokenize(a.h1), tokenize(b.h1));
      const kwSim    = a.primaryKeyword && b.primaryKeyword
        ? jaccard(tokenize(a.primaryKeyword), tokenize(b.primaryKeyword))
        : 0;
      // Same exact primary keyword counts the most.
      const sameKw = a.primaryKeyword && b.primaryKeyword
        && a.primaryKeyword.toLowerCase() === b.primaryKeyword.toLowerCase();
      let risk = 0;
      const reasons: string[] = [];
      if (titleSim >= 0.7) { risk += 40; reasons.push(`title similarity ${(titleSim*100).toFixed(0)}%`); }
      else if (titleSim >= 0.5) { risk += 20; reasons.push(`title similarity ${(titleSim*100).toFixed(0)}%`); }
      if (h1Sim >= 0.7) { risk += 20; reasons.push(`H1 similarity ${(h1Sim*100).toFixed(0)}%`); }
      if (sameKw)       { risk += 30; reasons.push(`identical primary keyword "${a.primaryKeyword}"`); }
      else if (kwSim >= 0.7) { risk += 15; reasons.push(`keyword similarity ${(kwSim*100).toFixed(0)}%`); }
      if (a.pageType === 'blog' && b.pageType === 'money') { risk += 5; reasons.push('blog competes with money'); }
      if (a.pageType === 'money' && b.pageType === 'blog') { risk += 5; reasons.push('money competes with blog'); }
      if (risk < 35) continue;
      // Suggestion heuristic
      let suggestion: CannibalizationPair['suggestion'] = 'differentiate';
      const moneyA = a.pageType === 'money';
      const moneyB = b.pageType === 'money';
      if (moneyA !== moneyB) suggestion = 'canonicalize'; // blog → canonical to money
      else if (titleSim >= 0.85 && sameKw) suggestion = 'merge';
      else if (a.scores.quality < 50 || b.scores.quality < 50) suggestion = 'noindex-weaker';
      cannibalization.push({
        a: a.url, b: b.url, locale: a.locale, risk: clamp(risk), reasons, suggestion,
      });
    }
  }
  cannibalization.sort((x, y) => y.risk - x.risk);

  // Summary
  const pushable = items.filter((i) => i.flags.pushable);
  const pagesPushable = pushable.filter((i) => i.kind === 'page').length;
  const blogPushable  = pushable.filter((i) => i.kind === 'blog').length;
  const orphans = items.filter((i) => i.isOrphan && i.status === 'published').length;
  const moneyLowIncoming = items.filter((i) => i.pageType === 'money' && i.incomingLinks < 2).length;
  const fresh = items.filter((i) => i.status === 'published' && i.daysSinceUpdate <= 30).length;
  const stale = items.filter((i) => i.status === 'published' && i.daysSinceUpdate > 180 && i.daysSinceUpdate < 9000).length;
  const avgIp = pushable.length
    ? Math.round(pushable.reduce((s, i) => s + i.scores.indexationPriority, 0) / pushable.length)
    : 0;
  const cannibHigh = cannibalization.filter((c) => c.risk >= 60).length;
  const clusterAvg = clusters.length
    ? Math.round(clusters.reduce((s, c) => s + c.authorityScore, 0) / clusters.length)
    : 0;

  return {
    summary: {
      totalUrls: items.length,
      pushableUrls: pushable.length,
      pagesPushable, blogPushable, orphanPages: orphans,
      moneyLowIncoming, freshLast30d: fresh, staleOver180d: stale,
      avgIndexationPriority: avgIp,
      cannibalizationHigh: cannibHigh,
      clusterAuthorityAvg: clusterAvg,
      generatedAt: new Date().toISOString(),
    },
    items, clusters, cannibalization,
  };
}

// ---------------------------------------------------------------------------
// IndexNow safe validator. Used by both UI and POST /api/seo/indexnow.
// ---------------------------------------------------------------------------
export function filterSafeForIndexNow(
  urls: string[],
  items: BoosterItem[],
): { safe: string[]; rejected: { url: string; reason: string }[] } {
  const byUrl = new Map(items.map((i) => [i.url, i]));
  const byAbs = new Map(items.map((i) => [`${SITE_URL}${i.url}`, i]));
  const safe: string[] = [];
  const rejected: { url: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const u = raw.trim();
    if (!u) { rejected.push({ url: raw, reason: 'empty' }); continue; }
    let abs = u;
    if (u.startsWith('/')) abs = `${SITE_URL}${u}`;
    else if (!u.startsWith('https://') && !u.startsWith('http://')) { rejected.push({ url: u, reason: 'not absolute' }); continue; }
    if (!abs.startsWith(SITE_URL + '/') && abs !== SITE_URL) { rejected.push({ url: abs, reason: 'host mismatch' }); continue; }
    if (seen.has(abs)) { rejected.push({ url: abs, reason: 'duplicate' }); continue; }
    seen.add(abs);
    const item = byUrl.get(abs.replace(SITE_URL, '')) || byAbs.get(abs);
    if (!item) { rejected.push({ url: abs, reason: 'not in content/' }); continue; }
    if (!item.flags.pushable) { rejected.push({ url: abs, reason: item.flags.pushReasons.join('; ') }); continue; }
    safe.push(abs);
  }
  // IndexNow allows up to 10,000 URLs/batch; we cap at 1,000 to keep retries cheap.
  return { safe: safe.slice(0, 1000), rejected };
}
