// Yandex-driven topic research.
//
// Combines:
//   * the existing Serper digest (Google view of the SERP),
//   * a fresh Yandex Search API call (yandex.uz view of the SERP),
//   * the existing Content Inventory + Intent Guard so duplicates are
//     filtered before they ever reach the AI generator.
//
// Output: a normalised array of YandexResearchTopic candidates ready
// for the operator to review and selectively launch from the План
// роста блога. Generation is NOT triggered automatically.

import type { Env } from '../../_types';
import { callYandexSearch, isYandexConfigured } from './client';
import { makeCacheKey, readCached, writeCached } from './cache';
import type { YandexResearchTopic } from './types';

export interface YandexResearchInput {
  /** Seed phrases the operator picked or the system inferred. */
  seeds: string[];
  /** Article locale we plan to write in (the SERP we analyse). */
  locale: 'ru' | 'uz';
  /** Skip cache and force a fresh API call. */
  forceRefresh?: boolean;
}

export interface YandexResearchSuccess {
  ok: true;
  topics: YandexResearchTopic[];
  /** Number of seeds we actually called the API for (after cache hits). */
  api_calls: number;
  /** Number of seeds served from cache. */
  cache_hits: number;
}

export interface YandexResearchFailure {
  ok: false;
  error: string;
  /** How many calls succeeded before the failure. */
  partial_topics?: YandexResearchTopic[];
}

export type YandexResearchResult = YandexResearchSuccess | YandexResearchFailure;

// Sequential instead of Promise.all so we never burst the Yandex quota.
// The endpoint is paid; we keep the operator's bill predictable.
export async function researchTopicsViaYandex(env: Env, input: YandexResearchInput): Promise<YandexResearchResult> {
  if (!isYandexConfigured(env)) {
    return { ok: false, error: 'YANDEX_SEARCH_API_KEY not configured' };
  }
  const seeds = (input.seeds || [])
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length >= 2)
    .slice(0, 20);
  if (seeds.length === 0) {
    return { ok: false, error: 'no valid seeds (each must be ≥ 2 characters)' };
  }

  const topics: YandexResearchTopic[] = [];
  let apiCalls = 0;
  let cacheHits = 0;
  for (const seed of seeds) {
    const cacheKey = makeCacheKey({ query: seed, locale: input.locale, search_type: 'SEARCH_TYPE_UZ' });
    let snapshot = input.forceRefresh ? null : await readCached(env, cacheKey);
    if (!snapshot) {
      const r = await callYandexSearch(env, { query: seed, locale: input.locale });
      if (!r.ok) {
        // Surface what we have so far rather than discarding successful
        // calls. The UI then shows partial research with a "Retry" button.
        return { ok: false, error: r.error, partial_topics: topics };
      }
      snapshot = r.snapshot;
      await writeCached(env, cacheKey, snapshot);
      apiCalls++;
    } else {
      cacheHits++;
    }

    const topDomains = snapshot.domains.slice(0, 3).map((d) => d.domain);
    const reasons: string[] = [];
    const warnings: string[] = [];

    const totalOrganic = snapshot.organic.length || 1;
    const aggregatorRatio = snapshot.aggregator_pages / totalOrganic;
    const informationalRatio = snapshot.informational_pages / totalOrganic;
    const localUzRatio = snapshot.local_uz_pages / totalOrganic;

    if (snapshot.found_total && snapshot.found_total > 1000) {
      reasons.push(`Подтверждённый спрос в Yandex (${formatThousands(snapshot.found_total)} страниц в выдаче)`);
    } else if (snapshot.found_total && snapshot.found_total > 100) {
      reasons.push(`Низкочастотный спрос (${formatThousands(snapshot.found_total)} страниц), но возможна точечная коммерческая выгода`);
    } else {
      warnings.push('Очень малый объём выдачи — проверьте, действительно ли это рабочий запрос');
    }

    if (informationalRatio > 0.5 && aggregatorRatio < 0.3) {
      reasons.push('SERP в основном информационный — есть место для нашей экспертной статьи');
    }
    if (localUzRatio < 0.4) {
      warnings.push('SERP не локализован под Узбекистан — нужен сильный локальный угол, чтобы пробиться');
    }
    if (snapshot.contains_gptbot) {
      warnings.push('gptbot.uz уже есть в выдаче — проверьте Intent Guard на каннибализацию');
    }
    if (snapshot.difficulty_score >= 70) {
      warnings.push(`Высокая сложность (${snapshot.difficulty_score}) — рассмотрите более узкий long-tail`);
    } else if (snapshot.difficulty_score <= 35) {
      reasons.push(`Низкая сложность (${snapshot.difficulty_score}) — хорошая возможность`);
    }

    topics.push({
      query: seed,
      locale: input.locale,
      yandex_found_total: snapshot.found_total ?? 0,
      difficulty_score: snapshot.difficulty_score,
      top_domains: topDomains,
      weak_competition: aggregatorRatio > 0.4 && snapshot.difficulty_score < 60,
      already_ranking: snapshot.contains_gptbot,
      signals: {
        commercial_pages: snapshot.commercial_pages,
        informational_pages: snapshot.informational_pages,
        aggregator_pages: snapshot.aggregator_pages,
        local_uz_pages: snapshot.local_uz_pages,
      },
      reasons,
      warnings,
    });
  }

  return { ok: true, topics, api_calls: apiCalls, cache_hits: cacheHits };
}

function formatThousands(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} тыс.`;
  return String(n);
}
