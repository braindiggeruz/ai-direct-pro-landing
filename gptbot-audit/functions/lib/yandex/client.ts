// Yandex Cloud Search API client.
//
// Endpoint: https://searchapi.api.cloud.yandex.net/v2/web/search
// Auth:     Authorization: Api-Key <YANDEX_SEARCH_API_KEY> (server-only)
// Region:   ⌀ — when omitted the Yandex backend uses the search type's
//           default geography (SEARCH_TYPE_UZ → Uzbekistan).
//
// The endpoint returns rawData as a Base64-encoded XML document (see
// parser.ts). We never expose the API key past the server, never log
// the Authorization header, and never write the raw XML to the SPA.
//
// 2026-06-24: per-call timeout lowered from 25 s → 12 s and the result
// objects now carry a stable `error_code` + `retryable` flag so the
// research layer can run seeds in parallel via Promise.allSettled and
// the endpoint can return a JSON envelope instead of a generic 502.

import type { Env } from '../../_types';
import type {
  YandexSearchType, YandexSerpResult, YandexSerpSnapshot,
} from './types';
import { UZ_AGGREGATOR_DOMAINS, COMMERCIAL_DOMAIN_HINTS } from './types';
import { decodeBase64, parseYandexXml } from './parser';

const ENDPOINT = 'https://searchapi.api.cloud.yandex.net/v2/web/search';
// Aggressive per-call timeout so three parallel seeds always finish
// inside the Cloudflare Pages Functions walltime (~30 s).
const DEFAULT_TIMEOUT_MS = 12_000;

/** Stable error codes the research layer + UI can branch on. */
export type YandexErrorCode =
  | 'YANDEX_NOT_CONFIGURED'    // env key missing (non-retryable)
  | 'YANDEX_BAD_REQUEST'       // 400 / malformed payload (non-retryable)
  | 'YANDEX_AUTH_FAILED'       // 401 / 403 (non-retryable, rotate key)
  | 'YANDEX_RATE_LIMITED'      // 429 (retryable, respect Retry-After)
  | 'YANDEX_UPSTREAM_ERROR'    // 5xx (retryable)
  | 'YANDEX_TIMEOUT'           // AbortError / per-call deadline (retryable)
  | 'YANDEX_NETWORK'           // fetch failed (retryable)
  | 'YANDEX_INVALID_RESPONSE'; // 200 but malformed body (non-retryable)

export interface YandexSearchInput {
  query: string;
  /** Article locale — used to pick search_type and locale tag. */
  locale: 'ru' | 'uz';
  /** Override the search type. Defaults to SEARCH_TYPE_UZ for both
   *  ru and uz (yandex.uz indexes both languages and is the relevant
   *  geography for GPTBot.uz). */
  searchType?: YandexSearchType;
  /** Optional Yandex region id; omit to use the SEARCH_TYPE default. */
  region?: number | null;
  timeoutMs?: number;
}

export interface YandexSearchSuccess {
  ok: true;
  snapshot: YandexSerpSnapshot;
  duration_ms: number;
}

export interface YandexSearchFailure {
  ok: false;
  /** Stable enum the research layer + UI branch on. */
  error_code: YandexErrorCode;
  /** Human-readable message; safe to display, never leaks the API key. */
  error: string;
  /** Upstream HTTP status (when the request reached Yandex). */
  http_status?: number;
  /** True when the caller may safely retry. Mirrors NON_RETRYABLE
   *  / RETRYABLE policy in the research layer. */
  retryable: boolean;
  /** Optional Retry-After hint (seconds) parsed from the upstream
   *  response. Only set when the upstream provided one. */
  retry_after_seconds?: number;
  duration_ms: number;
}

export type YandexSearchResult = YandexSearchSuccess | YandexSearchFailure;

export function isYandexConfigured(env: Env): boolean {
  return !!env.YANDEX_SEARCH_API_KEY;
}

/** Map upstream status / failure mode to a stable internal error code. */
function classifyHttpStatus(status: number): { code: YandexErrorCode; retryable: boolean } {
  if (status === 400) return { code: 'YANDEX_BAD_REQUEST', retryable: false };
  if (status === 401 || status === 403) return { code: 'YANDEX_AUTH_FAILED', retryable: false };
  if (status === 429) return { code: 'YANDEX_RATE_LIMITED', retryable: true };
  if (status >= 500 && status <= 599) return { code: 'YANDEX_UPSTREAM_ERROR', retryable: true };
  // Any other 4xx is treated as a contract violation we shouldn't retry.
  return { code: 'YANDEX_BAD_REQUEST', retryable: false };
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const n = parseInt(header, 10);
  if (Number.isFinite(n) && n >= 0 && n <= 3600) return n;
  return undefined;
}

export async function callYandexSearch(env: Env, input: YandexSearchInput): Promise<YandexSearchResult> {
  const startedAt = Date.now();
  const apiKey = env.YANDEX_SEARCH_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error_code: 'YANDEX_NOT_CONFIGURED',
      error: 'YANDEX_SEARCH_API_KEY not configured',
      retryable: false,
      duration_ms: 0,
    };
  }
  const searchType: YandexSearchType = input.searchType ?? 'SEARCH_TYPE_UZ';
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const body: Record<string, unknown> = {
    query: {
      searchType,
      queryText: input.query,
      familyMode: 'FAMILY_MODE_MODERATE',
      page: '0',
      fixTypoMode: 'FIX_TYPO_MODE_ON',
    },
    groupSpec: {
      groupMode: 'GROUP_MODE_DEEP',
      groupsOnPage: '10',
      docsInGroup: '1',
    },
    responseFormat: 'FORMAT_XML',
  };
  // FolderId is optional on this endpoint when calling with an Api-Key
  // bound to a service account; the backend resolves the right folder
  // automatically. When the operator wants to scope by a specific
  // folder we read YANDEX_CLOUD_FOLDER_ID without ever exposing it.
  if (env.YANDEX_CLOUD_FOLDER_ID) body.folderId = env.YANDEX_CLOUD_FOLDER_ID;
  if (typeof input.region === 'number' && input.region > 0) body.region = String(input.region);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const dt = Date.now() - startedAt;
    if (!res.ok) {
      const cls = classifyHttpStatus(res.status);
      // Keep the upstream snippet short and DO NOT echo the request body
      // — the Yandex error message itself does not leak our key, but we
      // trim aggressively anyway in case of a future format change.
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error_code: cls.code,
        error: `Yandex API HTTP ${res.status}${text ? `: ${text.slice(0, 240)}` : ''}`,
        http_status: res.status,
        retryable: cls.retryable,
        retry_after_seconds: parseRetryAfter(res.headers.get('Retry-After')),
        duration_ms: dt,
      };
    }
    const json = (await res.json().catch(() => null)) as { rawData?: string } | null;
    if (!json || !json.rawData) {
      return {
        ok: false,
        error_code: 'YANDEX_INVALID_RESPONSE',
        error: 'Yandex API returned no rawData',
        http_status: res.status,
        retryable: false,
        duration_ms: dt,
      };
    }
    const xml = decodeBase64(json.rawData);
    const { organic, foundTotal } = parseYandexXml(xml);
    const snapshot = enrich({
      query: input.query,
      locale: input.locale,
      search_type: searchType,
      region: input.region ?? null,
      found_total: foundTotal,
      organic,
      checked_at: new Date().toISOString(),
    });
    return { ok: true, snapshot, duration_ms: dt };
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error;
    const dt = Date.now() - startedAt;
    if (err.name === 'AbortError') {
      return {
        ok: false,
        error_code: 'YANDEX_TIMEOUT',
        error: `Yandex API timed out after ${timeoutMs} ms`,
        retryable: true,
        duration_ms: dt,
      };
    }
    return {
      ok: false,
      error_code: 'YANDEX_NETWORK',
      error: err.message || 'Yandex API network error',
      retryable: true,
      duration_ms: dt,
    };
  }
}

/** Compute domain stats + heuristic difficulty score from organic results. */
function enrich(base: {
  query: string;
  locale: 'ru' | 'uz';
  search_type: YandexSearchType;
  region: number | null;
  found_total: number;
  organic: YandexSerpResult[];
  checked_at: string;
}): YandexSerpSnapshot {
  const domains = new Map<string, number>();
  let commercial = 0;
  let informational = 0;
  let aggregator = 0;
  let local_uz = 0;
  let containsGptbot = false;
  for (const r of base.organic) {
    const d = r.domain.toLowerCase();
    domains.set(d, (domains.get(d) || 0) + 1);
    if (d === 'gptbot.uz' || d === 'www.gptbot.uz') containsGptbot = true;
    if (d.endsWith('.uz')) local_uz++;
    if (UZ_AGGREGATOR_DOMAINS.has(d)) aggregator++;
    const url = r.url.toLowerCase();
    if (COMMERCIAL_DOMAIN_HINTS.some((h) => d.includes(h) || url.includes(h))) commercial++;
    else informational++;
  }
  // Difficulty heuristic 0-100. Weighted by:
  //   - large aggregators (lower opportunity for new content)
  //   - commercial dominance (means money-page territory)
  //   - very high `found_total` (saturated SERP)
  //   - presence of high-authority domains (wikipedia, kun.uz, gazeta.uz)
  const ratioCommercial = base.organic.length ? commercial / base.organic.length : 0;
  const ratioAggregator = base.organic.length ? aggregator / base.organic.length : 0;
  const foundFactor = Math.min(1, Math.log10(Math.max(10, base.found_total)) / 7); // 10 → ~0.14, 1e7 → 1.0
  const localBonus = base.organic.length && local_uz / base.organic.length < 0.4 ? 1 : 0; // foreign SERP is harder

  const difficulty = Math.round(
    35 * ratioAggregator + 30 * ratioCommercial + 25 * foundFactor + 10 * localBonus,
  );

  // Top domain frequency list, sorted by count desc.
  const domainList = Array.from(domains.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    query: base.query,
    locale: base.locale,
    search_type: base.search_type,
    region: base.region,
    found_total: base.found_total,
    organic: base.organic,
    domains: domainList,
    difficulty_score: Math.max(0, Math.min(100, difficulty)),
    commercial_pages: commercial,
    informational_pages: informational,
    aggregator_pages: aggregator,
    local_uz_pages: local_uz,
    contains_gptbot: containsGptbot,
    checked_at: base.checked_at,
  };
}
