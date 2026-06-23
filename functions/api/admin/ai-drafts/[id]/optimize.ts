// POST /api/admin/ai-drafts/:id/optimize
//
// Send the selected locale article through Gemini Flash and return a
// preview of the deeply rewritten version. NEVER mutates the draft —
// the human reviewer must explicitly POST /apply-optimization to save.
//
// The actual rewrite logic lives in lib/ai-drafts/optimize-runner.ts
// and is shared with /optimize-both (the dual-locale endpoint).
//
// Hard rules:
//   • JWT auth required.
//   • Key never leaves the server.
//   • In-flight lock per (draft, locale) prevents parallel double-calls.
//   • No auto-publish, no IndexNow.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft } from '../../../../lib/ai-drafts/store';
import { runOptimizeForLocale } from '../../../../lib/ai-drafts/optimize-runner';

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

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Draft storage not configured.' }, 503);
  if (!env.GEMINI_API_KEY) {
    return json({
      error: 'GEMINI_API_KEY not configured on the server. Add it under Cloudflare Pages → ai-direct-pro-landing → Settings → Environment variables (secret_text). Free key: https://aistudio.google.com/app/apikey.',
    }, 503);
  }

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

    const result = await runOptimizeForLocale(env, draft, locale);
    if (!result.ok) {
      const status = result.status === 'upstream' ? 502 : 422;
      return json({ error: result.error, detail: result.detail }, status);
    }
    // Strip per-locale field that the single-locale UI doesn't need.
    return json({ ...result, ok: true });
  } catch (e) {
    return json({ error: (e as Error).message || 'optimize failed' }, 500);
  } finally {
    releaseLock(id, locale);
  }
};
