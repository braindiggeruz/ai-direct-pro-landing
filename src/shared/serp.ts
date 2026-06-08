// Shared types for the Serper SERP Intelligence layer.
//
// Architecture:
//   - Serper is the "eyes" of SEO Booster. It is NOT an LLM.
//   - All Serper calls are made backend-only (functions/lib/serper/*),
//     never from the browser. The admin SPA only sees the digest, never
//     the raw upstream payload and never the API key.
//   - LLM stays Puter / Mock / (optional) Gemini. SERP digest is forwarded
//     into the AI Autopilot prompt as an *inspiration* context only.
//
// Hard limits enforced server-side:
//   - cache-first (24h cooldown per exact query + locale + location)
//   - top 10 organic only
//   - digest payload <= 4 KB
//   - max batch size = 5
//   - no auto-query on dashboard load (only manual buttons)
//   - SERPER_API_KEY missing → status reports configured=false and the
//     rest of SEO Booster keeps working.

import type { Locale } from './types';

export interface SerperProviderStatus {
  configured: boolean;
  /** Number of cached snapshots currently in the cache file. */
  cachedSnapshots: number;
  /** Total runs recorded in the ledger. */
  totalRuns: number;
  /** ISO timestamp of the most recent SERP check (any URL). */
  lastCheckAt?: string;
  /** Manual checks performed today (UTC). Helps the admin self-rate-limit. */
  queriesToday: number;
  /** Human-readable note, never includes the API key. */
  note: string;
}

export interface SerperQueryRequest {
  q: string;
  locale: Locale;
  /** Country code for `gl`. Defaults to "uz". */
  gl?: string;
  /** Interface language for `hl`. Defaults to "ru" for RU locale, "uz" otherwise. */
  hl?: string;
  /** Number of organic results. Defaults to 10, hard-capped at 10. */
  num?: number;
  /** Optional location string (city). Forwarded to Serper as `location`. */
  location?: string;
  /** Force-refresh cache. Default false. */
  forceRefresh?: boolean;
}

export interface SerpOrganicResult {
  position: number;
  domain: string;
  url: string;
  title: string;
  snippet: string;
}

export interface SerpRelatedSearch {
  query: string;
}

export interface SerpQuestion {
  question: string;
  /** Best-effort short answer if Serper returned one. */
  snippet?: string;
}

/** Compact SERP snapshot persisted in content/seo/serp-cache.json. */
export interface SerpSnapshot {
  query: string;
  locale: Locale;
  gl: string;
  hl: string;
  location?: string;
  checkedAt: string; // ISO
  /** Top 10 organic results (compact, trimmed for storage). */
  organic: SerpOrganicResult[];
  related: SerpRelatedSearch[];
  questions: SerpQuestion[];
}

export type SerpIntent =
  | 'commercial'
  | 'informational'
  | 'local'
  | 'comparison'
  | 'mixed';

export interface SerpCompetitorGap {
  /** Short reason the admin can act on (RU/UZ depending on locale). */
  reason: string;
  /** Up to 3 competitor titles that already cover this angle. */
  evidenceTitles: string[];
}

export interface SerpFaqIdea {
  question: string;
  source: 'paa' | 'related' | 'snippet';
}

export interface SerpContentGap {
  topic: string;
  /** "appears in N of top10 competitors". */
  competitorCount: number;
}

export interface SerpTitleMetaOpportunity {
  field: 'title' | 'description';
  currentLength: number;
  suggestion: string;
}

export interface SerpRankSpotCheck {
  found: boolean;
  position?: number;
  url?: string;
}

/** Compact digest sent to the AI Autopilot prompt. Max ~4 KB. */
export interface SerpDigest {
  query: string;
  locale: Locale;
  location: string;
  intent: SerpIntent;
  topCompetitors: { position: number; domain: string; title: string; snippet: string }[];
  relatedSearches: string[];
  faqIdeas: SerpFaqIdea[];
  contentGaps: SerpContentGap[];
  titleMetaOpportunities: SerpTitleMetaOpportunity[];
  rankSpotCheck: SerpRankSpotCheck;
  /** When the underlying snapshot was taken. */
  generatedAt: string;
  /** True if served from cache (snapshot < 7d old). */
  cached: boolean;
}

/** Result returned by /api/seo/serper/query and analyze-url. */
export interface SerperQueryResult {
  ok: true;
  snapshot: SerpSnapshot;
  digest: SerpDigest;
  /** True if the snapshot was loaded from cache (no Serper credit used). */
  cached: boolean;
  /** Reason cache was bypassed (forceRefresh, expired, missing). */
  cacheStatus: 'hit' | 'expired' | 'miss' | 'forced';
}

export type SerperRunStatus = 'queried' | 'cached' | 'error';

export interface SerpRunLog {
  runId: string;
  query: string;
  locale: Locale;
  gl: string;
  hl: string;
  location?: string;
  /** Source GPTBot URL when analyze-url was used; null for raw queries. */
  forUrl: string | null;
  status: SerperRunStatus;
  cached: boolean;
  resultPositions: number;
  rankFound: boolean;
  rankPosition?: number;
  createdAt: string;
  /** Serper credit consumed (0 if cache hit). */
  credits: 0 | 1;
  /** Error message if status === 'error'. */
  error?: string;
}

/** Input for /api/seo/serper/analyze-url. */
export interface SerperAnalyzeUrlRequest {
  /** GPTBot URL the admin selected from SEO Booster. */
  url: string;
  locale: Locale;
  /** Page title / description / H1 / primary keyword to drive the query. */
  title?: string;
  description?: string;
  h1?: string;
  primaryKeyword?: string;
  /** Optional extra local variant ("<keyword> Tashkent") opted-in by admin. */
  extraQuery?: string;
  /** Force-refresh cache. Default false. */
  forceRefresh?: boolean;
}

export interface SerperBatchRequest {
  items: SerperAnalyzeUrlRequest[];
}

export interface SerperBatchResult {
  ok: true;
  results: ({ url: string; ok: true; digest: SerpDigest } | { url: string; ok: false; error: string })[];
}

/** Hard limits exposed to the UI. */
export const SERPER_LIMITS = {
  maxBatch: 5,
  cacheTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  cooldownMs: 24 * 60 * 60 * 1000,     // 24 h per exact query
  digestMaxBytes: 4 * 1024,            // 4 KB cap on digest payload
  topNOrganic: 10,
} as const;
