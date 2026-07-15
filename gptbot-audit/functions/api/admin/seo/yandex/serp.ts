// POST /api/admin/seo/yandex/serp — admin JWT.
//
// Body: { query: string, locale: 'ru'|'uz', searchType?, region?, forceRefresh? }
// Returns: { ok, snapshot, cached } | { ok: false, error }
//
// Behaviour:
//   1. Reject if YANDEX_SEARCH_API_KEY missing → 503.
//   2. Try cache (24h TTL) unless forceRefresh.
//   3. On miss → call Yandex Cloud Search API → store snapshot.
//   4. Never return raw XML, only the normalised SerpSnapshot.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { callYandexSearch, isYandexConfigured } from '../../../../lib/yandex/client';
import { makeCacheKey, readCached, writeCached } from '../../../../lib/yandex/cache';
import type { YandexSearchType } from '../../../../lib/yandex/types';

function json(d: unknown, status = 200): Response {
  return new Response(JSON.stringify(d), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const VALID_SEARCH_TYPES: YandexSearchType[] = [
  'SEARCH_TYPE_RU', 'SEARCH_TYPE_UZ', 'SEARCH_TYPE_KK', 'SEARCH_TYPE_BE', 'SEARCH_TYPE_TR',
];

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  if (!isYandexConfigured(env)) {
    return json({ ok: false, error: 'YANDEX_SEARCH_API_KEY not configured' }, 503);
  }

  let body: { query?: unknown; locale?: unknown; searchType?: unknown; region?: unknown; forceRefresh?: unknown };
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ ok: false, error: 'invalid JSON body' }, 400); }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < 2) return json({ ok: false, error: 'query required (min 2 chars)' }, 400);
  const locale = body.locale === 'uz' ? 'uz' : body.locale === 'ru' ? 'ru' : null;
  if (!locale) return json({ ok: false, error: 'locale must be ru or uz' }, 400);
  const searchType: YandexSearchType =
    typeof body.searchType === 'string' && VALID_SEARCH_TYPES.includes(body.searchType as YandexSearchType)
      ? (body.searchType as YandexSearchType)
      : 'SEARCH_TYPE_UZ';
  const region = typeof body.region === 'number' && body.region > 0 ? body.region : null;
  const forceRefresh = body.forceRefresh === true;

  const cacheKey = makeCacheKey({ query, locale, search_type: searchType, region });
  if (!forceRefresh) {
    const cached = await readCached(env, cacheKey);
    if (cached) return json({ ok: true, snapshot: cached, cached: true });
  }

  const r = await callYandexSearch(env, { query, locale, searchType, region });
  if (!r.ok) {
    return json({ ok: false, error: r.error, http_status: r.http_status }, r.http_status === 401 || r.http_status === 403 ? 502 : 502);
  }
  await writeCached(env, cacheKey, r.snapshot).catch(() => undefined);
  return json({ ok: true, snapshot: r.snapshot, cached: false, duration_ms: r.duration_ms });
};
