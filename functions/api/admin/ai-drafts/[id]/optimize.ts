// POST /api/admin/ai-drafts/:id/optimize
//
// Send the selected locale article through OpenRouter and return a preview
// of the optimised version. NEVER mutates the draft — the human reviewer
// must explicitly POST /apply-optimization to save.
//
// Hard rules:
//   • JWT auth required.
//   • Key never leaves the server.
//   • In-flight lock per (draft, locale) prevents parallel double-calls
//     (Workers run isolates per request so this is a best-effort guard;
//     the apply step re-validates regardless).
//   • No auto-publish, no IndexNow.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft } from '../../../../lib/ai-drafts/store';
import {
  validateArticle,
  type ValidationError,
} from '../../../../lib/ai-drafts/validators';
import { buildSystemPrompt, buildUserPrompt } from '../../../../lib/ai-drafts/optimizer-prompt';
import { optimiseWithOpenRouter, parseStrictJson } from '../../../../lib/ai-drafts/optimizer-client';

interface OptimizerEnv extends Env {
  OPENROUTER_API_KEY?: string;
  AI_OPTIMIZER_MODEL?: string;
}

const inflight = new Map<string, number>();
const INFLIGHT_TTL_MS = 120_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function lockKey(id: string, locale: string): string { return `${id}::${locale}`; }
function takeLock(id: string, locale: string): boolean {
  const k = lockKey(id, locale);
  const now = Date.now();
  const prev = inflight.get(k);
  if (prev && now - prev < INFLIGHT_TTL_MS) return false;
  inflight.set(k, now);
  return true;
}
function releaseLock(id: string, locale: string): void {
  inflight.delete(lockKey(id, locale));
}

export const onRequestPost: PagesFunction<OptimizerEnv> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Draft storage not configured.' }, 503);
  if (!env.OPENROUTER_API_KEY) return json({ error: 'OPENROUTER_API_KEY not configured on the server.' }, 503);

  const body = (await request.json().catch(() => null)) as null | { locale?: string };
  const locale = body?.locale === 'ru' || body?.locale === 'uz' ? body.locale : null;
  if (!locale) return json({ error: 'locale must be "ru" or "uz"' }, 400);

  if (!takeLock(id, locale)) {
    return json({ error: 'Another optimisation for this draft/locale is already running.' }, 429);
  }
  try {
    const draft = await getDraft(env, id);
    if (!draft) return json({ error: 'Draft not found' }, 404);
    if (draft.status === 'rejected' || draft.status === 'imported') {
      return json({ error: `Draft is ${draft.status} — optimisation disabled.` }, 409);
    }
    const article = locale === 'ru' ? draft.ru_article : draft.uz_article;
    if (!article) return json({ error: `Bundle has no ${locale.toUpperCase()} article.` }, 400);

    const beforeErrors: ValidationError[] = [];
    validateArticle(article as unknown as Record<string, unknown>, 'before', beforeErrors);

    const system = buildSystemPrompt(locale);
    const user = buildUserPrompt({
      article,
      seoBrief: draft.seo_brief,
      validationIssues: draft.validation?.issues || [],
    });

    const llm = await optimiseWithOpenRouter(env, system, user);
    if (!llm.ok) {
      return json({ error: `LLM upstream failed (${llm.status || 'network'})`, detail: llm.error?.slice(0, 500) }, 502);
    }
    const parsed = parseStrictJson(llm.content);
    if (!parsed || typeof parsed !== 'object') {
      return json({ error: 'LLM returned non-JSON payload', raw_excerpt: llm.content.slice(0, 600) }, 502);
    }
    const rawArticle = (parsed as Record<string, unknown>).article;
    const summary = (parsed as Record<string, unknown>).summary as
      | { changes?: unknown; kept?: unknown }
      | undefined;

    const afterErrors: ValidationError[] = [];
    const optimised = validateArticle(rawArticle, 'after', afterErrors);

    if (!optimised) {
      return json({
        error: 'AI returned an article that failed local schema validation.',
        validation_errors: afterErrors.slice(0, 30),
        raw_excerpt: llm.content.slice(0, 600),
      }, 422);
    }

    // Defence in depth: force the locale to the requested one (the LLM
    // might emit the wrong tag) and keep the slug stable when the model
    // tried to change it without a good reason. We compare a normalised
    // slug — if changed we keep the original (the operator can rename
    // later in the Blog Editor).
    optimised.locale = locale;
    if (optimised.slug !== article.slug) optimised.slug = article.slug;

    // Per-step warnings (informational only — never block the preview).
    const warnings: string[] = [];
    if (optimised.meta_title.length < 30 || optimised.meta_title.length > 70) {
      warnings.push(`meta_title length ${optimised.meta_title.length} (recommended 45-65)`);
    }
    if (optimised.meta_description.length < 110 || optimised.meta_description.length > 170) {
      warnings.push(`meta_description length ${optimised.meta_description.length} (recommended 120-160)`);
    }
    if (locale === 'uz' && /[А-Яа-яЁё]/.test(JSON.stringify(optimised))) {
      warnings.push('UZ article contains Cyrillic characters — please review.');
    }

    const changes = Array.isArray(summary?.changes)
      ? (summary!.changes as unknown[]).map((s) => String(s)).filter(Boolean).slice(0, 30)
      : [];
    const kept = Array.isArray(summary?.kept)
      ? (summary!.kept as unknown[]).map((s) => String(s)).filter(Boolean).slice(0, 30)
      : [];

    return json({
      ok: true,
      locale,
      model: llm.model,
      original: article,
      optimized_article: optimised,
      changes,
      kept,
      validation_before: { issues: beforeErrors.slice(0, 50), passed: beforeErrors.length === 0 },
      validation_after:  { issues: afterErrors.slice(0, 50),  passed: afterErrors.length === 0 },
      warnings,
    });
  } catch (e) {
    return json({ error: (e as Error).message || 'optimize failed' }, 500);
  } finally {
    releaseLock(id, locale);
  }
};
