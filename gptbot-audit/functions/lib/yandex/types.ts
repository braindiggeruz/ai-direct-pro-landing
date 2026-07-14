// Yandex Search API — shared types.
//
// Powers the "Yandex как источник тем" path inside SEO Mission Control.
// Yandex Cloud Search API (searchapi.api.cloud.yandex.net) provides the
// raw SERP for yandex.uz; we normalise it into the same compact shape
// we already use for Serper so the topic planner can treat both
// engines uniformly.

export type YandexSearchType =
  | 'SEARCH_TYPE_RU' // yandex.ru
  | 'SEARCH_TYPE_UZ' // yandex.uz (Узбекистан)
  | 'SEARCH_TYPE_KK' // yandex.kz
  | 'SEARCH_TYPE_BE' // yandex.by
  | 'SEARCH_TYPE_TR'; // yandex.com.tr

export interface YandexSerpResult {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}

export interface YandexSerpSnapshot {
  query: string;
  locale: 'ru' | 'uz';
  search_type: YandexSearchType;
  region?: number | null;
  /** Yandex's reported total found pages — strong proxy for demand size. */
  found_total?: number;
  /** Top organic results (≤ 10). */
  organic: YandexSerpResult[];
  /** Aggregate domain-level metrics — useful for cannibalisation/competition. */
  domains: Array<{ domain: string; count: number }>;
  /** Heuristic difficulty score 0-100 (lower = better opportunity). */
  difficulty_score: number;
  /** Heuristic counts so the UI can show "это коммерческий SERP" badge. */
  commercial_pages: number;
  informational_pages: number;
  aggregator_pages: number;
  local_uz_pages: number;
  /** True when gptbot.uz already appears in the SERP. */
  contains_gptbot: boolean;
  /** Wall-clock retrieval timestamp. */
  checked_at: string;
}

export interface YandexResearchTopic {
  /** Phrase the operator/AI will use as the article's primary_keyword. */
  query: string;
  locale: 'ru' | 'uz';
  /** Real total found in Yandex (proxy demand). */
  yandex_found_total: number;
  /** Difficulty score 0-100 (lower = easier). */
  difficulty_score: number;
  /** Top 3 domains in the SERP. */
  top_domains: string[];
  /** True when the SERP is dominated by aggregators (good opportunity). */
  weak_competition: boolean;
  /** True when gptbot.uz already ranks for this query. */
  already_ranking: boolean;
  /** Aggregate signals for downstream scoring. */
  signals: {
    commercial_pages: number;
    informational_pages: number;
    aggregator_pages: number;
    local_uz_pages: number;
  };
  /** Rationale for the operator UI. */
  reasons: string[];
  warnings: string[];
}

/** Status payload returned by /api/admin/seo/yandex/status. */
export interface YandexStatusResponse {
  configured: boolean;
  web_search_available: boolean;
  /** True when at least one cached SERP row exists in D1. */
  cache_present: boolean;
  /** Last successful call timestamp (ISO). */
  last_call_at: string | null;
}

/** Aggregator domains in Uzbekistan — heavy commerce + listings. */
export const UZ_AGGREGATOR_DOMAINS: ReadonlySet<string> = new Set([
  'olx.uz', 'uybor.uz', 'avtoelon.uz', 'asaxiy.uz', 'lebazar.uz',
  'glovo.com', 'wildberries.uz', 'avtomotors.uz', 'arba.uz',
  'kun.uz', 'gazeta.uz', 'spot.uz', 'daryo.uz', 'wikipedia.org',
]);

/** Domains that signal a transactional / money-page SERP. */
export const COMMERCIAL_DOMAIN_HINTS: readonly string[] = [
  '.shop', '.store', 'tarif', 'price', 'price-list', 'cena',
  'service', 'narx', 'arzon', 'naqd',
];
