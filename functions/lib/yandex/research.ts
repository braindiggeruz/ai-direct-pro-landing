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
//
// 2026-06-24 — fixed the Yandex Demand 502.
//
// Root cause of the previous 502:
//   * seeds ran sequentially → three 10-25 s upstream calls → ~50-75 s
//     total walltime → Cloudflare gave up before the response could be
//     written → frontend saw a generic Cloudflare HTML 502 page.
//
// Fix:
//   * Per-call timeout cut to 12 s in client.ts.
//   * Seeds now run via Promise.allSettled with a small concurrency cap
//     (MAX_PARALLEL = 3). Two seeds finishing fast + one failing seed
//     no longer destroys the whole batch.
//   * A single, bounded retry is attempted only for retryable codes
//     (timeout, network, 429, 5xx) and only when the global walltime
//     still has budget left. Authentication / config errors short-
//     circuit immediately.
//   * The result type now exposes:
//        ok          — true when at least one seed succeeded
//        topics      — successful seeds (may be partial)
//        warnings    — per-seed messages the UI can display
//        failed_seeds — exact list with retryable + error_code so the
//                      operator can click "Повторить только неуспешные"
//        partial     — boolean convenience flag
//   * The endpoint wrapper turns this into a JSON envelope and never
//     returns a generic 502.

import type { Env } from '../../_types';
import { callYandexSearch, isYandexConfigured, type YandexErrorCode } from './client';
import { makeCacheKey, readCached, writeCached } from './cache';
import type { YandexResearchTopic } from './types';

/** Max concurrent Yandex calls per research run. */
const MAX_PARALLEL = 3;
/** Total walltime budget for the whole research run. */
const GLOBAL_BUDGET_MS = 25_000;
/** Per-seed timeout — must fit twice into GLOBAL_BUDGET_MS so a single
 *  retry never blows the budget. */
const PER_CALL_TIMEOUT_MS = 12_000;

export interface YandexResearchInput {
  /** Seed phrases the operator picked or the system inferred. */
  seeds: string[];
  /** Article locale we plan to write in (the SERP we analyse). */
  locale: 'ru' | 'uz';
  /** Skip cache and force a fresh API call. */
  forceRefresh?: boolean;
  /** Override the global budget — used by tests to keep them fast. */
  budgetMs?: number;
}

export interface YandexResearchFailedSeed {
  seed: string;
  error_code: YandexErrorCode;
  error: string;
  retryable: boolean;
  http_status?: number;
  retry_after_seconds?: number;
}

export interface YandexResearchResult {
  /** True when at least one seed produced a snapshot. */
  ok: boolean;
  /** Successful topics (may be partial). */
  topics: YandexResearchTopic[];
  /** Warning messages for the UI. */
  warnings: string[];
  /** Seeds that did NOT produce a snapshot, with reason. */
  failed_seeds: YandexResearchFailedSeed[];
  /** Convenience flag — true when some succeeded AND some failed. */
  partial: boolean;
  /** Number of seeds we actually called the API for (after cache hits). */
  api_calls: number;
  /** Number of seeds served from cache. */
  cache_hits: number;
  /** Aggregate error code when ok=false (worst non-retryable wins). */
  error_code?: YandexErrorCode;
  /** Aggregate error message when ok=false. */
  error?: string;
}

/** Whether the overall failure should be marked retryable: yes if ALL
 *  failing seeds are retryable. */
function allFailuresRetryable(fails: YandexResearchFailedSeed[]): boolean {
  return fails.length > 0 && fails.every((f) => f.retryable);
}

/** Run a single seed: cache → live call → optional one retry. */
async function runSeed(
  env: Env,
  seed: string,
  locale: 'ru' | 'uz',
  forceRefresh: boolean,
  deadlineAt: number,
): Promise<
  | { kind: 'ok'; topic: YandexResearchTopic; fromCache: boolean; warning?: string }
  | { kind: 'fail'; failure: YandexResearchFailedSeed }
> {
  const cacheKey = makeCacheKey({ query: seed, locale, search_type: 'SEARCH_TYPE_UZ' });
  let snapshot = forceRefresh ? null : await readCached(env, cacheKey);
  const fromCache = !!snapshot;
  let retryWarning: string | undefined;
  if (!snapshot) {
    // First attempt.
    const first = await callYandexSearch(env, {
      query: seed,
      locale,
      timeoutMs: PER_CALL_TIMEOUT_MS,
    });
    if (first.ok) {
      snapshot = first.snapshot;
      await writeCached(env, cacheKey, snapshot).catch((e) => console.warn(`[yandex-research] writeCached failed for seed "${seed}":`, (e as Error).message));
    } else if (
      first.retryable
      && Date.now() < deadlineAt - PER_CALL_TIMEOUT_MS
      // Don't retry on hard auth/config — those won't fix on retry.
      && first.error_code !== 'YANDEX_NOT_CONFIGURED'
      && first.error_code !== 'YANDEX_AUTH_FAILED'
      && first.error_code !== 'YANDEX_BAD_REQUEST'
      && first.error_code !== 'YANDEX_INVALID_RESPONSE'
    ) {
      // One bounded retry. Respect Retry-After up to 2 s — anything
      // larger would blow the global budget so we skip those.
      const waitMs = Math.min(2_000, (first.retry_after_seconds ?? 0) * 1000);
      if (waitMs > 0 && Date.now() + waitMs < deadlineAt - PER_CALL_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
      const second = await callYandexSearch(env, {
        query: seed,
        locale,
        timeoutMs: PER_CALL_TIMEOUT_MS,
      });
      if (second.ok) {
        snapshot = second.snapshot;
        await writeCached(env, cacheKey, snapshot).catch((e) => console.warn(`[yandex-research] writeCached (retry) failed for seed "${seed}":`, (e as Error).message));
        retryWarning = `«${seed}»: первый запрос ${first.error_code}, второй удался`;
      } else {
        return {
          kind: 'fail',
          failure: {
            seed,
            error_code: second.error_code,
            error: second.error,
            retryable: second.retryable,
            http_status: second.http_status,
            retry_after_seconds: second.retry_after_seconds,
          },
        };
      }
    } else {
      return {
        kind: 'fail',
        failure: {
          seed,
          error_code: first.error_code,
          error: first.error,
          retryable: first.retryable,
          http_status: first.http_status,
          retry_after_seconds: first.retry_after_seconds,
        },
      };
    }
  }

  const topic = buildTopic(seed, locale, snapshot);
  return { kind: 'ok', topic, fromCache, warning: retryWarning };
}

/** Hard-coded sequential? No — we shard the seeds into MAX_PARALLEL
 *  batches and run each batch with Promise.allSettled. This keeps the
 *  Yandex quota burst within their limits while finishing well under
 *  Cloudflare walltime even for the max (20-seed) request. */
export async function researchTopicsViaYandex(env: Env, input: YandexResearchInput): Promise<YandexResearchResult> {
  const emptyResult: YandexResearchResult = {
    ok: false, topics: [], warnings: [], failed_seeds: [], partial: false,
    api_calls: 0, cache_hits: 0,
  };
  if (!isYandexConfigured(env)) {
    return {
      ...emptyResult,
      error_code: 'YANDEX_NOT_CONFIGURED',
      error: 'YANDEX_SEARCH_API_KEY not configured',
    };
  }
  const seeds = (input.seeds || [])
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length >= 2)
    .slice(0, 20);
  if (seeds.length === 0) {
    return {
      ...emptyResult,
      error_code: 'YANDEX_BAD_REQUEST',
      error: 'no valid seeds (each must be ≥ 2 characters)',
    };
  }

  const budgetMs = Math.max(5_000, Math.min(60_000, input.budgetMs ?? GLOBAL_BUDGET_MS));
  const deadlineAt = Date.now() + budgetMs;

  const topics: YandexResearchTopic[] = [];
  const warnings: string[] = [];
  const failedSeeds: YandexResearchFailedSeed[] = [];
  let apiCalls = 0;
  let cacheHits = 0;

  // Shard the seed list into MAX_PARALLEL-sized batches.
  for (let i = 0; i < seeds.length; i += MAX_PARALLEL) {
    if (Date.now() >= deadlineAt) {
      // Anything we have not yet started gets recorded as a timeout
      // so the UI can offer a "retry the rest" button.
      for (let j = i; j < seeds.length; j++) {
        failedSeeds.push({
          seed: seeds[j],
          error_code: 'YANDEX_TIMEOUT',
          error: 'Skipped — research run exceeded global budget',
          retryable: true,
        });
      }
      break;
    }
    const batch = seeds.slice(i, i + MAX_PARALLEL);
    const results = await Promise.allSettled(
      batch.map((s) => runSeed(env, s, input.locale, !!input.forceRefresh, deadlineAt)),
    );
    for (let k = 0; k < batch.length; k++) {
      const r = results[k];
      const seed = batch[k];
      if (r.status === 'fulfilled') {
        if (r.value.kind === 'ok') {
          topics.push(r.value.topic);
          if (r.value.fromCache) cacheHits++; else apiCalls++;
          if (r.value.warning) warnings.push(r.value.warning);
        } else {
          failedSeeds.push(r.value.failure);
        }
      } else {
        // runSeed itself never throws — any rejection here is a
        // genuinely unexpected runtime fault. Record it as a network
        // error so the UI keeps a useful "retry" affordance.
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason || 'unknown error');
        failedSeeds.push({
          seed,
          error_code: 'YANDEX_NETWORK',
          error: msg.slice(0, 240),
          retryable: true,
        });
      }
    }
  }

  // Append a human-readable summary warning when some failed.
  if (topics.length > 0 && failedSeeds.length > 0) {
    warnings.push(
      `Получено ${topics.length} из ${seeds.length} результатов — ${failedSeeds.length} запрос(а) не успели ответить.`,
    );
  }

  // Pick the aggregate error code (worst non-retryable wins). When ALL
  // failures are retryable we surface YANDEX_TIMEOUT to signal "try again
  // later" rather than "wrong config".
  let aggregateError: { code: YandexErrorCode; message: string } | undefined;
  if (topics.length === 0 && failedSeeds.length > 0) {
    const hardFail = failedSeeds.find((f) => !f.retryable);
    if (hardFail) {
      aggregateError = { code: hardFail.error_code, message: hardFail.error };
    } else if (allFailuresRetryable(failedSeeds)) {
      // Prefer YANDEX_TIMEOUT > YANDEX_RATE_LIMITED > YANDEX_UPSTREAM_ERROR > YANDEX_NETWORK
      const ordered: YandexErrorCode[] = ['YANDEX_TIMEOUT', 'YANDEX_RATE_LIMITED', 'YANDEX_UPSTREAM_ERROR', 'YANDEX_NETWORK'];
      const picked = ordered.find((c) => failedSeeds.some((f) => f.error_code === c)) || 'YANDEX_NETWORK';
      const sample = failedSeeds.find((f) => f.error_code === picked) || failedSeeds[0];
      aggregateError = {
        code: picked,
        message: `Все ${failedSeeds.length} seed(ов) не получили ответ от Yandex: ${sample.error}`,
      };
    } else {
      aggregateError = { code: failedSeeds[0].error_code, message: failedSeeds[0].error };
    }
  }

  const ok = topics.length > 0;
  const partial = ok && failedSeeds.length > 0;

  return {
    ok,
    topics,
    warnings,
    failed_seeds: failedSeeds,
    partial,
    api_calls: apiCalls,
    cache_hits: cacheHits,
    ...(aggregateError ? { error_code: aggregateError.code, error: aggregateError.message } : {}),
  };
}

function buildTopic(seed: string, locale: 'ru' | 'uz', snapshot: NonNullable<Awaited<ReturnType<typeof readCached>>>): YandexResearchTopic {
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

  return {
    query: seed,
    locale,
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
  };
}

function formatThousands(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} тыс.`;
  return String(n);
}
