// POST /api/seo/serper/analyze-url — admin JWT.
//
// Body: SerperAnalyzeUrlRequest { url, locale, title?, description?, h1?,
//                                  primaryKeyword?, extraQuery?, forceRefresh? }
// Returns SerperQueryResult enriched with the URL-specific digest
// (rankSpotCheck, contentGaps vs our title/description/keyword).
//
// Query rules:
//   - Default query = primaryKeyword, or title, or h1 (first available).
//   - extraQuery is optional ("<keyword> Ташкент") and runs only if explicitly
//     provided by the admin. We do NOT auto-fan-out to several variants.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import type {
  SerperAnalyzeUrlRequest,
  SerperQueryResult,
} from '../../../../src/shared/serp';
import { callSerper } from '../../../lib/serper/client';
import { buildDigest, digestWithinCap } from '../../../lib/serper/digest';
import {
  appendRun, buildRunLog, cacheKey, getCached, putCached,
} from '../../../lib/serper/store';

function json(d: unknown, status = 200): Response {
  return new Response(JSON.stringify(d), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function pickQuery(b: SerperAnalyzeUrlRequest): string {
  const candidate = b.extraQuery || b.primaryKeyword || b.title || b.h1 || '';
  return candidate.trim();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  let body: SerperAnalyzeUrlRequest;
  try { body = (await request.json()) as SerperAnalyzeUrlRequest; }
  catch { return json({ ok: false, error: 'invalid JSON body' }, 400); }

  if (!body || typeof body.url !== 'string' || !body.url.startsWith('/')) {
    return json({ ok: false, error: 'url required (must start with /)' }, 400);
  }
  if (body.locale !== 'ru' && body.locale !== 'uz') {
    return json({ ok: false, error: 'locale must be ru or uz' }, 400);
  }
  if (!env.SERPER_API_KEY) {
    return json({ ok: false, error: 'SERPER_API_KEY not configured' }, 503);
  }
  const q = pickQuery(body);
  if (q.length < 2) return json({ ok: false, error: 'no usable query (primaryKeyword/title/h1 empty)' }, 400);

  const gl = 'uz';
  const hl = body.locale === 'uz' ? 'uz' : 'ru';
  const location = 'Tashkent, Uzbekistan';
  const key = cacheKey({ locale: body.locale, gl, hl, location, query: q });

  // 1. Cache first.
  if (!body.forceRefresh) {
    const cached = await getCached(env, key);
    if (cached) {
      const digest = buildDigest({
        snapshot: cached, cached: true, location,
        ownTitle: body.title, ownDescription: body.description, ownPrimaryKeyword: body.primaryKeyword,
      });
      await appendRun(env, buildRunLog({
        query: q, locale: body.locale, gl, hl, location,
        forUrl: body.url, status: 'cached', cached: true, snapshot: cached,
        rankFound: digest.rankSpotCheck.found, rankPosition: digest.rankSpotCheck.position,
      }));
      const out: SerperQueryResult = { ok: true, snapshot: cached, digest, cached: true, cacheStatus: 'hit' };
      return json(out);
    }
  }

  // 2. Fresh
  try {
    const { snapshot } = await callSerper(env, { q, locale: body.locale, gl, hl, num: 10, location });
    await putCached(env, key, snapshot);
    const digest = buildDigest({
      snapshot, cached: false, location,
      ownTitle: body.title, ownDescription: body.description, ownPrimaryKeyword: body.primaryKeyword,
    });
    const sizeCheck = digestWithinCap(digest);
    if (!sizeCheck.ok) {
      digest.contentGaps = digest.contentGaps.slice(0, 3);
      digest.faqIdeas = digest.faqIdeas.slice(0, 3);
    }
    await appendRun(env, buildRunLog({
      query: q, locale: body.locale, gl, hl, location,
      forUrl: body.url, status: 'queried', cached: false, snapshot,
      rankFound: digest.rankSpotCheck.found, rankPosition: digest.rankSpotCheck.position,
    }));
    const out: SerperQueryResult = { ok: true, snapshot, digest, cached: false, cacheStatus: body.forceRefresh ? 'forced' : 'miss' };
    return json(out);
  } catch (e) {
    const error = (e as Error).message || 'Serper call failed';
    await appendRun(env, buildRunLog({
      query: q, locale: body.locale, gl, hl, location,
      forUrl: body.url, status: 'error', cached: false, snapshot: null,
      rankFound: false, error,
    }));
    return json({ ok: false, error }, 502);
  }
};
