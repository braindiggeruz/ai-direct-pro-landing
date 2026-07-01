// POST /api/seo/serper/batch — admin JWT.
//
// Body: SerperBatchRequest { items: SerperAnalyzeUrlRequest[] } (max 5).
// Returns SerperBatchResult { ok, results }.
//
// Sequential by design — Serper free tier credits are precious and we want
// cache hits to come first. We delegate to the same code path as analyze-url
// (cache-first, append run, append cache).

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { jsonResponse } from '../../../lib/api-errors';
import type {
  SerperAnalyzeUrlRequest,
  SerperBatchRequest,
  SerperBatchResult,
  SerpDigest,
} from '../../../../src/shared/serp';
import { SERPER_LIMITS } from '../../../../src/shared/serp';
import { callSerper } from '../../../lib/serper/client';
import { buildDigest, digestWithinCap } from '../../../lib/serper/digest';
import {
  appendRun, buildRunLog, cacheKey, getCached, putCached,
} from '../../../lib/serper/store';

async function runOne(env: Env, b: SerperAnalyzeUrlRequest): Promise<
  { url: string; ok: true; digest: SerpDigest } | { url: string; ok: false; error: string }
> {
  if (!b.url || !b.url.startsWith('/')) return { url: b.url || '', ok: false, error: 'url required' };
  const q = (b.extraQuery || b.primaryKeyword || b.title || b.h1 || '').trim();
  if (q.length < 2) return { url: b.url, ok: false, error: 'no usable query' };
  const gl = 'uz';
  const hl = b.locale === 'uz' ? 'uz' : 'ru';
  const location = 'Tashkent, Uzbekistan';
  const key = cacheKey({ locale: b.locale, gl, hl, location, query: q });

  if (!b.forceRefresh) {
    const cached = await getCached(env, key);
    if (cached) {
      const digest = buildDigest({
        snapshot: cached, cached: true, location,
        ownTitle: b.title, ownDescription: b.description, ownPrimaryKeyword: b.primaryKeyword,
      });
      await appendRun(env, buildRunLog({
        query: q, locale: b.locale, gl, hl, location,
        forUrl: b.url, status: 'cached', cached: true, snapshot: cached,
        rankFound: digest.rankSpotCheck.found, rankPosition: digest.rankSpotCheck.position,
      }));
      return { url: b.url, ok: true, digest };
    }
  }
  try {
    const { snapshot } = await callSerper(env, { q, locale: b.locale, gl, hl, num: 10, location });
    await putCached(env, key, snapshot);
    const digest = buildDigest({
      snapshot, cached: false, location,
      ownTitle: b.title, ownDescription: b.description, ownPrimaryKeyword: b.primaryKeyword,
    });
    if (!digestWithinCap(digest).ok) {
      digest.contentGaps = digest.contentGaps.slice(0, 3);
      digest.faqIdeas = digest.faqIdeas.slice(0, 3);
    }
    await appendRun(env, buildRunLog({
      query: q, locale: b.locale, gl, hl, location,
      forUrl: b.url, status: 'queried', cached: false, snapshot,
      rankFound: digest.rankSpotCheck.found, rankPosition: digest.rankSpotCheck.position,
    }));
    return { url: b.url, ok: true, digest };
  } catch (e) {
    const error = (e as Error).message || 'Serper call failed';
    await appendRun(env, buildRunLog({
      query: q, locale: b.locale, gl, hl, location,
      forUrl: b.url, status: 'error', cached: false, snapshot: null, rankFound: false, error,
    }));
    return { url: b.url, ok: false, error };
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  let body: SerperBatchRequest;
  try { body = (await request.json()) as SerperBatchRequest; }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400); }

  if (!body || !Array.isArray(body.items)) {
    return jsonResponse({ ok: false, error: 'items[] required' }, 400);
  }
  if (body.items.length === 0) return jsonResponse({ ok: false, error: 'items[] empty' }, 400);
  if (body.items.length > SERPER_LIMITS.maxBatch) {
    return jsonResponse({ ok: false, error: `max batch is ${SERPER_LIMITS.maxBatch}` }, 400);
  }
  if (!env.SERPER_API_KEY) {
    return jsonResponse({ ok: false, error: 'SERPER_API_KEY not configured' }, 503);
  }

  const results: SerperBatchResult['results'] = [];
  for (const item of body.items) {
    // Sequential so cache hits are honored and we don't spike Serper credits.
    results.push(await runOne(env, item));
  }
  const out: SerperBatchResult = { ok: true, results };
  return jsonResponse(out);
};
