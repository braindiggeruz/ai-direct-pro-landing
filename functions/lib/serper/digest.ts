// Pure helpers that turn a raw SerpSnapshot into the compact SerpDigest
// consumed by the admin UI and by the AI Autopilot prompt.
//
// No network calls. No env. No state.
// Used both server-side (functions/api/seo/serper/*.ts) and inside the
// scripts/test-serper-seo.ts harness.

import type {
  SerpContentGap,
  SerpDigest,
  SerpFaqIdea,
  SerpIntent,
  SerpRankSpotCheck,
  SerpSnapshot,
  SerpTitleMetaOpportunity,
} from '../../../src/shared/serp';
import { SERPER_LIMITS } from '../../../src/shared/serp';

const COMMERCIAL_HINTS = ['купить', 'цена', 'стоимость', 'заказать', 'sotib olish', 'narx', 'narxi', 'buyurtma'];
const COMPARE_HINTS    = ['vs', 'против', 'или', 'yoki', 'сравнение', 'taqqoslash'];
const LOCAL_HINTS      = ['ташкент', 'узбекистан', 'toshkent', 'o‘zbekiston', 'uzbekistan'];

export function detectIntent(query: string): SerpIntent {
  const q = query.toLowerCase();
  const isCommercial = COMMERCIAL_HINTS.some((h) => q.includes(h));
  const isCompare    = COMPARE_HINTS.some((h) => q.includes(h));
  const isLocal      = LOCAL_HINTS.some((h) => q.includes(h));
  if (isCompare) return 'comparison';
  if (isLocal && isCommercial) return 'local';
  if (isCommercial) return 'commercial';
  if (isLocal) return 'local';
  // Default: informational if no strong commercial signals were found.
  return 'informational';
}

/** Detect whether gptbot.uz is ranking in the snapshot's organic top10. */
export function detectRank(snapshot: SerpSnapshot, ownDomain = 'gptbot.uz'): SerpRankSpotCheck {
  const hit = snapshot.organic.find((o) => o.domain === ownDomain);
  if (!hit) return { found: false };
  return { found: true, position: hit.position, url: hit.url };
}

/** Derive FAQ ideas from PAA + related searches. Dedup + cap at 5. */
export function buildFaqIdeas(snapshot: SerpSnapshot): SerpFaqIdea[] {
  const out: SerpFaqIdea[] = [];
  const seen = new Set<string>();
  for (const p of snapshot.questions) {
    const key = p.question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ question: p.question, source: 'paa' });
    if (out.length >= 5) return out;
  }
  for (const r of snapshot.related) {
    if (!/[?]$/.test(r.query) && !/^(как|почему|зачем|где|когда|сколько|qanday|nima|qachon|qancha)\b/i.test(r.query)) continue;
    const key = r.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ question: r.query, source: 'related' });
    if (out.length >= 5) return out;
  }
  return out;
}

/** Heuristic content-gap miner: pick terms that appear in N>=3 competitor
 *  titles/snippets but NOT in our page primary keyword / title. */
const STOPWORDS = new Set([
  'и', 'в', 'на', 'для', 'с', 'или', 'как', 'что', 'это', 'не', 'по', 'из', 'от', 'у', 'к', 'за', 'до',
  'va', 'uchun', 'bilan', 'yoki', 'qanday', 'nima', 'bu', 'ham', 'esa',
  'the', 'a', 'of', 'and', 'for', 'to', 'in', 'on', 'is', 'with',
]);

export function buildContentGaps(snapshot: SerpSnapshot, ownText: string): SerpContentGap[] {
  const own = ownText.toLowerCase();
  const counts = new Map<string, number>();
  for (const o of snapshot.organic.slice(0, 10)) {
    const tokens = `${o.title} ${o.snippet}`.toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
    const seenInDoc = new Set<string>();
    for (const t of tokens) {
      if (seenInDoc.has(t)) continue;
      seenInDoc.add(t);
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const gaps: SerpContentGap[] = [];
  for (const [term, n] of counts.entries()) {
    if (n < 3) continue;
    if (own.includes(term)) continue;
    gaps.push({ topic: term, competitorCount: n });
  }
  gaps.sort((a, b) => b.competitorCount - a.competitorCount);
  return gaps.slice(0, 7);
}

export function buildTitleMetaOpportunities(args: {
  currentTitle?: string;
  currentDescription?: string;
  snapshot: SerpSnapshot;
  locale: 'ru' | 'uz';
}): SerpTitleMetaOpportunity[] {
  const out: SerpTitleMetaOpportunity[] = [];
  const t = args.currentTitle?.trim() || '';
  const d = args.currentDescription?.trim() || '';
  const sample = args.snapshot.organic.slice(0, 3).map((o) => o.title.length).filter((n) => n > 0);
  const avgTitleLen = sample.length ? Math.round(sample.reduce((s, n) => s + n, 0) / sample.length) : 55;
  if (t.length === 0 || t.length < 35 || t.length > 70) {
    out.push({
      field: 'title',
      currentLength: t.length,
      suggestion: args.locale === 'uz'
        ? `Title’ni ${Math.max(45, avgTitleLen - 5)}–${Math.min(64, avgTitleLen + 5)} belgi diapazoniga keltiring`
        : `Подтяните title в диапазон ${Math.max(45, avgTitleLen - 5)}–${Math.min(64, avgTitleLen + 5)} символов`,
    });
  }
  if (d.length === 0 || d.length < 110 || d.length > 170) {
    out.push({
      field: 'description',
      currentLength: d.length,
      suggestion: args.locale === 'uz'
        ? 'Description’ni 120–160 belgiga moslang, yagona aniq CTA bilan tugating'
        : 'Описание в диапазон 120–160 символов с одним конкретным CTA в конце',
    });
  }
  return out;
}

export function buildCompetitorGapsFromTitles(snapshot: SerpSnapshot, ownTitle?: string): string[] {
  const own = (ownTitle || '').toLowerCase();
  const result: string[] = [];
  for (const o of snapshot.organic.slice(0, 5)) {
    const phrases = o.title.split(/[—|\-·•:]/g).map((p) => p.trim()).filter((p) => p.length >= 10 && p.length <= 60);
    for (const p of phrases) {
      if (own.includes(p.toLowerCase())) continue;
      if (!result.includes(p)) result.push(p);
      if (result.length >= 5) return result;
    }
  }
  return result;
}

export interface BuildDigestArgs {
  snapshot: SerpSnapshot;
  cached: boolean;
  ownTitle?: string;
  ownDescription?: string;
  ownPrimaryKeyword?: string;
  location?: string;
}

/** Build the compact digest. Caller is responsible for capping bytes. */
export function buildDigest(args: BuildDigestArgs): SerpDigest {
  const snapshot = args.snapshot;
  const ownText = [args.ownTitle, args.ownDescription, args.ownPrimaryKeyword].filter(Boolean).join(' ');
  const digest: SerpDigest = {
    query: snapshot.query,
    locale: snapshot.locale,
    location: args.location || snapshot.location || 'Uzbekistan',
    intent: detectIntent(snapshot.query),
    topCompetitors: snapshot.organic.slice(0, 5).map((o) => ({
      position: o.position, domain: o.domain, title: o.title, snippet: o.snippet,
    })),
    relatedSearches: snapshot.related.slice(0, 5).map((r) => r.query),
    faqIdeas: buildFaqIdeas(snapshot),
    contentGaps: buildContentGaps(snapshot, ownText),
    titleMetaOpportunities: buildTitleMetaOpportunities({
      currentTitle: args.ownTitle,
      currentDescription: args.ownDescription,
      snapshot,
      locale: snapshot.locale,
    }),
    rankSpotCheck: detectRank(snapshot),
    generatedAt: new Date().toISOString(),
    cached: args.cached,
  };
  return digest;
}

/** Compact-encode digest as a single-line JSON string and verify size cap. */
export function digestWithinCap(digest: SerpDigest): { ok: boolean; bytes: number } {
  const bytes = new TextEncoder().encode(JSON.stringify(digest)).length;
  return { ok: bytes <= SERPER_LIMITS.digestMaxBytes, bytes };
}
