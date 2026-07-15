// POST /api/seo/serper/query — admin JWT.
//
// Body: SerperQueryRequest { q, locale, gl?, hl?, num?, location?, forceRefresh? }
// Returns SerperQueryResult { ok, snapshot, digest, cached, cacheStatus }.
//
// Behavior:
//   1. Reject if SERPER_API_KEY missing → 503.
//   2. Try cache hit first (TTL 7d, key = locale|gl|hl|location|q).
//   3. If cached and not forceRefresh → return cached, credits=0.
//   4. Otherwise call Serper → persist snapshot → append run.
//   5. Always append a run log so the admin can audit credit usage.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import type {
  SerperQueryRequest,
  SerperQueryResult,
} from '../../../../src/shared/serp';
import { callSerper } from '../../../lib/serper/client';
import { buildDigest, digestWithinCap } from '../../../lib/serper/digest';
import {
  appendRun,
  buildRunLog,
  cacheKey,
  getCached,
  putCached,
} from '../../../lib/serper/store';

function json(d: unknown, status = 200): Response {
  return new Response(JSON.stringify(d), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function defaults(req: SerperQueryRequest): { gl: string; hl: string; num: number } {
  return {
    gl: req.gl || 'uz',
    hl: req.hl || (req.locale === 'uz' ? 'uz' : 'ru'),
    num: Math.min(req.num || 10, 10),
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  let body: SerperQueryRequest;
  try { body = (await request.json()) as SerperQueryRequest; }
  catch { return json({ ok: false, error: 'invalid JSON body' }, 400); }

  if (!body || typeof body.q !== 'string' || body.q.trim().length < 2) {
    return json({ ok: false, error: 'q required (min 2 chars)' }, 400);
  }
  if (body.locale !== 'ru' && body.locale !== 'uz') {
    return json({ ok: false, error: 'locale must be ru or uz' }, 400);
  }
  if (!env.SERPER_API_KEY) {
    return json({ ok: false, error: 'SERPER_API_KEY not configured' }, 503);
  }

  const q = body.q.trim();
  const { gl, hl, num } = defaults(body);
  const key = cacheKey({ locale: body.locale, gl, hl, location: body.location, query: q });

  // 1. Try cache
  if (!body.forceRefresh) {
    const cached = await getCached(env, key);
    if (cached) {
      const digest = buildDigest({ snapshot: cached, cached: true, location: body.location });
      await appendRun(env, buildRunLog({
        query: q, locale: body.locale, gl, hl, location: body.location,
        forUrl: null, status: 'cached', cached: true, snapshot: cached,
        rankFound: digest.rankSpotCheck.found, rankPosition: digest.rankSpotCheck.position,
      }));
      const out: SerperQueryResult = { ok: true, snapshot: cached, digest, cached: true, cacheStatus: 'hit' };
      return json(out);
    }
  }

  // 2. Fresh call
  try {
    const { snapshot } = await callSerper(env, { q, locale: body.locale, gl, hl, num, location: body.location });
    await putCached(env, key, snapshot);
    const digest = buildDigest({ snapshot, cached: false, location: body.location });
    const sizeCheck = digestWithinCap(digest);
    if (!sizeCheck.ok) {
      // Should not happen given our trimming, but never send oversized payload.
      digest.contentGaps = digest.contentGaps.slice(0, 3);
      digest.faqIdeas = digest.faqIdeas.slice(0, 3);
    }
    await appendRun(env, buildRunLog({
      query: q, locale: body.locale, gl, hl, location: body.location,
      forUrl: null, status: 'queried', cached: false, snapshot,
      rankFound: digest.rankSpotCheck.found, rankPosition: digest.rankSpotCheck.position,
    }));
    const out: SerperQueryResult = { ok: true, snapshot, digest, cached: false, cacheStatus: body.forceRefresh ? 'forced' : 'miss' };
    return json(out);
  } catch (e) {
    const error = (e as Error).message || 'Serper call failed';
    await appendRun(env, buildRunLog({
      query: q, locale: body.locale, gl, hl, location: body.location,
      forUrl: null, status: 'error', cached: false, snapshot: null,
      rankFound: false, error,
    }));
    return json({ ok: false, error }, 502);
  }
};
