// POST /api/admin/ai-drafts/:id/translate-locale
//
// Generate the missing locale of an AI Draft by localising the existing
// locale via Gemini. Persists the new article straight into D1 so the
// draft now carries both RU and UZ — which unlocks the existing dual
// optimise + per-locale import workflows.
//
// Request body:  { target_locale: "ru" | "uz" }
// Source locale is inferred (the other side of the bundle).
//
// Why we persist directly (not preview-then-apply, like the optimiser):
//   * The locale slot was empty. There is nothing to compare against —
//     a side-by-side diff would only show the new article vs nothing.
//   * Status remains pending_review either way; the reviewer still
//     looks at the new locale in the Inbox before importing to Blog
//     Editor. So we save the operator one extra click.
//   * If the result is unusable, the reviewer can re-run this endpoint;
//     the audit trail logs every translation attempt.
//
// Hard rules:
//   • JWT auth required.
//   • In-flight lock per (draft, target_locale).
//   • Cannot run on imported / rejected drafts.
//   • NEVER auto-publishes. NEVER pings IndexNow.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { addDraftLocaleArticle, getDraft } from '../../../../lib/ai-drafts/store';
import { runTranslateLocale } from '../../../../lib/ai-drafts/translate-runner';
import { jsonResponse } from '../../../../lib/api-errors';
import { createInflightLock } from '../../../../lib/inflight-lock';

const lock = createInflightLock(120_000);

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return jsonResponse({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ error: 'Draft storage not configured.' }, 503);
  if (!env.GEMINI_API_KEY) {
    return jsonResponse({
      error: 'GEMINI_API_KEY not configured on the server. Add it under Cloudflare Pages → ai-direct-pro-landing → Settings → Environment variables (secret_text). Free key: https://aistudio.google.com/app/apikey.',
    }, 503);
  }

  const body = (await request.json().catch(() => null)) as null | { target_locale?: string };
  const target = body?.target_locale === 'ru' || body?.target_locale === 'uz' ? body.target_locale : null;
  if (!target) return jsonResponse({ error: 'target_locale must be "ru" or "uz"' }, 400);

  const lockKey = `${id}::translate::${target}`;
  if (!lock.take(lockKey)) {
    return jsonResponse({ error: 'Another translation for this draft/locale is already running.' }, 429);
  }
  try {
    const draft = await getDraft(env, id);
    if (!draft) return jsonResponse({ error: 'Draft not found' }, 404);
    if (draft.status === 'rejected' || draft.status === 'imported') {
      return jsonResponse({ error: `Draft is ${draft.status} — translation disabled.` }, 409);
    }

    const targetAlreadyPresent =
      (target === 'ru' && draft.has_ru) ||
      (target === 'uz' && draft.has_uz);
    if (targetAlreadyPresent) {
      return jsonResponse({
        error: `Draft already contains a ${target.toUpperCase()} article. Use the «Оптимизировать с AI (${target.toUpperCase()})» button to rewrite it instead.`,
      }, 409);
    }

    const source = target === 'ru' ? draft.uz_article : draft.ru_article;
    if (!source) {
      return jsonResponse({ error: `Draft has no ${target === 'ru' ? 'UZ' : 'RU'} article to translate from.` }, 400);
    }

    const result = await runTranslateLocale(env, source, target);
    if (!result.ok) {
      const status = result.status === 'upstream' ? 502 : 422;
      return jsonResponse({ error: result.error, detail: result.detail }, status);
    }

    // Persist. Status stays pending_review (enforced by the store
    // helper's CASE expression). The audit trail records the
    // translation event with action='ai_translate_locale'.
    const updated = await addDraftLocaleArticle(
      env,
      id,
      target,
      result.article,
      { passed: result.validation.passed, issues: result.validation.issues.map((i) => ({
        level: 'warn',
        rule: i.path || 'translate',
        message: i.message,
        field: i.path,
      })) },
      auth.email,
      {
        action: 'ai_translate_locale',
        source_locale: result.source_locale,
        target_locale: result.target_locale,
        model: result.model,
        duration_ms: result.durationMs,
      },
    );
    if (!updated) return jsonResponse({ error: 'Draft vanished mid-update' }, 404);

    return jsonResponse({
      ok: true,
      draft: updated,
      source_locale: result.source_locale,
      target_locale: result.target_locale,
      model: result.model,
      validation: result.validation,
      warnings: result.warnings,
      duration_ms: result.durationMs,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message || 'translate-locale failed' }, 500);
  } finally {
    lock.release(lockKey);
  }
};
