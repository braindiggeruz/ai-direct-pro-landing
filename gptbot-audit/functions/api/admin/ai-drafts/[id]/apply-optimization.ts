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

const MAX_BODY_BYTES = 200_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Draft storage not configured.' }, 503);

  // Soft size guard — protects D1 from oversized payloads.
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: 'Payload too large' }, 413);
  }

  const body = (await request.json().catch(() => null)) as null | {
    locale?: string;
    optimized_article?: unknown;
    model?: string;
  };
  const locale = body?.locale === 'ru' || body?.locale === 'uz' ? body.locale : null;
  if (!locale) return json({ error: 'locale must be "ru" or "uz"' }, 400);
  if (!body?.optimized_article || typeof body.optimized_article !== 'object') {
    return json({ error: 'optimized_article object required' }, 400);
  }

  const draft = await getDraft(env, id);
  if (!draft) return json({ error: 'Draft not found' }, 404);
  if (draft.status === 'rejected' || draft.status === 'imported') {
    return json({ error: `Draft is ${draft.status} — cannot apply AI optimisation.` }, 409);
  }
  if (locale === 'ru' && !draft.has_ru) return json({ error: 'Draft does not contain a RU article' }, 400);
  if (locale === 'uz' && !draft.has_uz) return json({ error: 'Draft does not contain a UZ article' }, 400);

  // Re-validate the article from scratch — never trust client payload.
  const errors: ValidationError[] = [];
  const candidate = validateArticle(body.optimized_article, 'optimized_article', errors);
  if (!candidate) {
    return json({ error: 'Validation failed', validation_errors: errors.slice(0, 50) }, 422);
  }

  // Force locale + keep the original slug. Slug renames must go through
  // the Blog Editor where redirects are handled.
  const original = locale === 'ru' ? draft.ru_article : draft.uz_article;
  candidate.locale = locale;
  if (original && candidate.slug !== original.slug) candidate.slug = original.slug;

  // Re-build the validation summary from the local schema check (these
  // errors are guaranteed empty here, but we still record warnings about
  // length to stay aligned with the preview UI).
  const warnings: Array<{ level: string; rule: string; field?: string; message: string }> = [];
  if (candidate.meta_title.length < 30 || candidate.meta_title.length > 70) {
    warnings.push({ level: 'warn', rule: 'meta_title_length', field: 'meta_title', message: `length ${candidate.meta_title.length}` });
  }
  if (candidate.meta_description.length < 110 || candidate.meta_description.length > 170) {
    warnings.push({ level: 'warn', rule: 'meta_description_length', field: 'meta_description', message: `length ${candidate.meta_description.length}` });
  }
  if (locale === 'uz' && /[А-Яа-яЁё]/.test(JSON.stringify(candidate))) {
    warnings.push({ level: 'warn', rule: 'uz_cyrillic', message: 'Cyrillic characters detected in UZ article.' });
  }
  const validation = { passed: warnings.length === 0, issues: warnings };

  try {
    const updated = await replaceDraftArticle(env, id, locale, candidate, validation, auth.email, {
      action: 'ai_optimize_apply',
      model: typeof body.model === 'string' ? body.model.slice(0, 80) : null,
    });
    if (!updated) return json({ error: 'Draft vanished mid-update' }, 404);
    return json({ ok: true, draft: updated });
  } catch (e) {
    return json({ error: (e as Error).message || 'apply failed' }, 500);
  }
};
