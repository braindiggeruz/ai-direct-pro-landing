// POST /api/admin/seo/yandex/research — admin JWT.
//
// Body: { seeds: string[], locale: 'ru'|'uz', forceRefresh?: boolean }
// Returns: { ok, topics, api_calls, cache_hits } | { ok: false, error }
//
// Runs sequential Yandex Search API calls for each seed (≤ 20 seeds),
// builds normalised topic candidates with reasons + warnings, and
// returns them to the План роста блога for the operator to review.
//
// Generation is NOT triggered — operator picks topics and clicks
// "Запустить выбранные" → existing topic-plan launcher.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { researchTopicsViaYandex } from '../../../../lib/yandex/research';

function json(d: unknown, status = 200): Response {
  return new Response(JSON.stringify(d), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  let body: { seeds?: unknown; locale?: unknown; forceRefresh?: unknown };
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ ok: false, error: 'invalid JSON body' }, 400); }

  const seeds = Array.isArray(body.seeds)
    ? (body.seeds as unknown[]).map((s) => (typeof s === 'string' ? s : '')).filter((s) => s.length > 0)
    : [];
  if (seeds.length === 0) return json({ ok: false, error: 'seeds[] required (each ≥ 2 chars)' }, 400);
  const locale = body.locale === 'uz' ? 'uz' : body.locale === 'ru' ? 'ru' : null;
  if (!locale) return json({ ok: false, error: 'locale must be ru or uz' }, 400);
  const forceRefresh = body.forceRefresh === true;

  const r = await researchTopicsViaYandex(env, { seeds, locale, forceRefresh });
  if (!r.ok) {
    return json({
      ok: false,
      error: r.error,
      partial_topics: r.partial_topics ?? null,
    }, 502);
  }
  return json(r);
};
