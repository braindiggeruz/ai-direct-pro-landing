// POST /api/admin/seo/yandex/research — admin JWT.
//
// Body: { seeds: string[], locale: 'ru'|'uz', forceRefresh?: boolean }
//
// Response envelope (always JSON, never raw HTML/502):
//   {
//     ok: boolean,
//     topics: YandexResearchTopic[],
//     warnings: string[],
//     failed_seeds: [{ seed, error_code, error, retryable, http_status?, retry_after_seconds? }],
//     partial: boolean,
//     api_calls: number,
//     cache_hits: number,
//     request_id: string,
//     // present only when ok=false
//     error?: { code, message, retryable, upstream_status? }
//   }
//
// 2026-06-24 — The previous implementation ran three Yandex calls
// sequentially with a 25 s per-call timeout. The combined walltime
// could exceed Cloudflare Pages Functions' ~30 s limit, in which case
// Cloudflare returned its generic HTML 502 page that the SPA tried to
// parse as JSON. The frontend then displayed the literal status "502"
// with no actionable message.
//
// The research lib now executes seeds in parallel via
// Promise.allSettled with a small concurrency cap, applies a single
// bounded retry per retryable failure, and surfaces partial successes.
// This endpoint always returns HTTP 200 with the structured envelope
// above — even on upstream failure — so Cloudflare's edge layer never
// has a reason to swap the body for an HTML error page. The SPA reads
// `ok` and `error` to render the appropriate UI state.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { researchTopicsViaYandex } from '../../../../lib/yandex/research';
import { newRequestId } from '../../../../lib/api-errors';

function json(d: unknown, status = 200): Response {
  return new Response(JSON.stringify(d), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = newRequestId();
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  let body: { seeds?: unknown; locale?: unknown; forceRefresh?: unknown };
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({
      ok: false,
      topics: [],
      warnings: [],
      failed_seeds: [],
      partial: false,
      api_calls: 0,
      cache_hits: 0,
      request_id: requestId,
      error: { code: 'BAD_REQUEST', message: 'invalid JSON body', retryable: false },
    }, 400);
  }

  const seeds = Array.isArray(body.seeds)
    ? (body.seeds as unknown[]).map((s) => (typeof s === 'string' ? s : '')).filter((s) => s.length > 0)
    : [];
  if (seeds.length === 0) {
    return json({
      ok: false,
      topics: [],
      warnings: [],
      failed_seeds: [],
      partial: false,
      api_calls: 0,
      cache_hits: 0,
      request_id: requestId,
      error: { code: 'BAD_REQUEST', message: 'seeds[] required (each ≥ 2 chars)', retryable: false },
    }, 400);
  }
  const locale = body.locale === 'uz' ? 'uz' : body.locale === 'ru' ? 'ru' : null;
  if (!locale) {
    return json({
      ok: false,
      topics: [],
      warnings: [],
      failed_seeds: [],
      partial: false,
      api_calls: 0,
      cache_hits: 0,
      request_id: requestId,
      error: { code: 'BAD_REQUEST', message: 'locale must be ru or uz', retryable: false },
    }, 400);
  }
  const forceRefresh = body.forceRefresh === true;

  let r;
  try {
    r = await researchTopicsViaYandex(env, { seeds, locale, forceRefresh });
  } catch (e) {
    // researchTopicsViaYandex never throws by contract, but if a future
    // refactor regresses we still produce a JSON envelope rather than
    // letting the runtime emit a 1101.
    const err = e as Error;
    console.error(`[yandex.research] [${requestId}] unexpected throw: ${err?.message || String(e)}`);
    return json({
      ok: false,
      topics: [],
      warnings: [],
      failed_seeds: [],
      partial: false,
      api_calls: 0,
      cache_hits: 0,
      request_id: requestId,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error while running Yandex research',
        retryable: true,
      },
    }, 200);
  }

  // ALWAYS HTTP 200 with a structured envelope. Cloudflare cannot swap
  // a 200 response body for its generic HTML error page, so the SPA can
  // safely call res.json() and branch on `ok`.
  const envelope = {
    ok: r.ok,
    topics: r.topics,
    warnings: r.warnings,
    failed_seeds: r.failed_seeds,
    partial: r.partial,
    api_calls: r.api_calls,
    cache_hits: r.cache_hits,
    request_id: requestId,
    ...(r.ok
      ? {}
      : {
        error: {
          code: r.error_code || 'YANDEX_NETWORK',
          message: r.error || 'Yandex research failed',
          retryable: r.failed_seeds.length > 0 && r.failed_seeds.every((f) => f.retryable),
          upstream_status: r.failed_seeds.find((f) => typeof f.http_status === 'number')?.http_status,
        },
      }),
  };
  const res = json(envelope, 200);
  res.headers.set('x-request-id', requestId);
  return res;
};
