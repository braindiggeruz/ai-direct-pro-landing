// POST /api/admin/ai-drafts/:id/apply-optimization
//
// Persists an AI-optimised article version into D1 after re-validating it
// against the strict schema. The previous article + previous validation
// block are snapshotted into the existing ai_draft_audit trail so the
// reviewer can compare history if needed.
//
// Hard rules:
//   • JWT auth required.
//   • Status STAYS pending_review (never auto-publish).
//   • Imported / rejected drafts cannot be mutated.
//   • Re-validation runs server-side; the body sent by the SPA is treated
//     as untrusted.
//   • No IndexNow, no GitHub commit.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft, replaceDraftArticle } from '../../../../lib/ai-drafts/store';
import {
  validateArticle,
  type ValidationError,
} from '../../../../lib/ai-drafts/validators';
import { jsonResponse } from '../../../../lib/api-errors';
import { buildSeoWarnings } from '../../../../lib/seo-validation';

const MAX_BODY_BYTES = 200_000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return jsonResponse({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ error: 'Draft storage not configured.' }, 503);

  // Soft size guard — protects D1 from oversized payloads.
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Payload too large' }, 413);
  }

  const body = (await request.json().catch(() => null)) as null | {
    locale?: string;
    optimized_article?: unknown;
    model?: string;
  };
  const locale = body?.locale === 'ru' || body?.locale === 'uz' ? body.locale : null;
  if (!locale) return jsonResponse({ error: 'locale must be "ru" or "uz"' }, 400);
  if (!body?.optimized_article || typeof body.optimized_article !== 'object') {
    return jsonResponse({ error: 'optimized_article object required' }, 400);
  }

  const draft = await getDraft(env, id);
  if (!draft) return jsonResponse({ error: 'Draft not found' }, 404);
  if (draft.status === 'rejected' || draft.status === 'imported') {
    return jsonResponse({ error: `Draft is ${draft.status} — cannot apply AI optimisation.` }, 409);
  }
  if (locale === 'ru' && !draft.has_ru) return jsonResponse({ error: 'Draft does not contain a RU article' }, 400);
  if (locale === 'uz' && !draft.has_uz) return jsonResponse({ error: 'Draft does not contain a UZ article' }, 400);

  // Re-validate the article from scratch — never trust client payload.
  const errors: ValidationError[] = [];
  const candidate = validateArticle(body.optimized_article, 'optimized_article', errors);
  if (!candidate) {
    return jsonResponse({ error: 'Validation failed', validation_errors: errors.slice(0, 50) }, 422);
  }

  // Force locale + keep the original slug. Slug renames must go through
  // the Blog Editor where redirects are handled.
  const original = locale === 'ru' ? draft.ru_article : draft.uz_article;
  candidate.locale = locale;
  if (original && candidate.slug !== original.slug) candidate.slug = original.slug;

  const warnings = buildSeoWarnings(candidate, { locale });
  const validation = { passed: warnings.length === 0, issues: warnings };

  try {
    const updated = await replaceDraftArticle(env, id, locale, candidate, validation, auth.email, {
      action: 'ai_optimize_apply',
      model: typeof body.model === 'string' ? body.model.slice(0, 80) : null,
    });
    if (!updated) return jsonResponse({ error: 'Draft vanished mid-update' }, 404);
    return jsonResponse({ ok: true, draft: updated });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message || 'apply failed' }, 500);
  }
};
