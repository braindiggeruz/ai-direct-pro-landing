// POST /api/admin/ai-drafts/:id/suggest-links
//
// Returns a CTR-boost link plan: a deterministic + LLM-refined list of
// internal-link suggestions for the selected locale.
//
// Behaviour:
//   * JWT auth required.
//   * Routes the LLM call via the multi-provider router with the
//     'judge' feature → Groq llama-3.3-70b primary (≈ 1 s).
//   * Never mutates the draft. The operator must POST /apply-links
//     to persist accepted suggestions.
//   * Falls back to a deterministic-only plan when every LLM provider
//     fails — operator still gets value.
//
// Hard rules: no auto publish, no IndexNow.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft } from '../../../../lib/ai-drafts/store';
import { buildContentInventory } from '../../../../lib/intent-guard/inventory';
import { suggestCtrBoostLinks } from '../../../../lib/ai-drafts/ctr-boost-runner';
import { jsonResponse } from '../../../../lib/api-errors';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return jsonResponse({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ error: 'Draft storage not configured.' }, 503);

  const body = (await request.json().catch(() => null)) as null | { locale?: string };
  const locale = body?.locale === 'ru' || body?.locale === 'uz' ? body.locale : null;
  if (!locale) return jsonResponse({ error: 'locale must be "ru" or "uz"' }, 400);

  const draft = await getDraft(env, id);
  if (!draft) return jsonResponse({ error: 'Draft not found' }, 404);
  if (draft.status === 'rejected' || draft.status === 'imported') {
    return jsonResponse({ error: `Draft is ${draft.status} — CTR boost disabled.` }, 409);
  }
  const article = locale === 'ru' ? draft.ru_article : draft.uz_article;
  if (!article) return jsonResponse({ error: `Draft does not contain a ${locale.toUpperCase()} article.` }, 400);

  const inventory = await buildContentInventory(env);
  const result = await suggestCtrBoostLinks(env, id, locale, article, inventory);
  if (!result.ok) {
    const status = result.reason === 'no_candidates' ? 422 : 502;
    return jsonResponse({ ok: false, error: result.error, reason: result.reason ?? null }, status);
  }
  return jsonResponse(result);
};
