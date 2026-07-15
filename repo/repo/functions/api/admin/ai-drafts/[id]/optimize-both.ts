// POST /api/admin/ai-drafts/:id/optimize-both
//
// Run the AI optimisation for BOTH locales (RU + UZ) in parallel and
// return a single preview payload the modal can render side-by-side
// with one Apply All button.
//
// Wall time: 4 Gemini calls run concurrently (2 locales × balanced +
// aggressive). The total ≈ max of all four ≈ 45-55 s, comfortably
// inside the ~95 s CF Pages Function budget.
//
// Quota: 4 calls per click. Even on a hectic editing session this
// comfortably fits the 1500 RPD free-tier limit (375 dual-clicks/day).
//
// Hard rules:
//   • JWT auth required.
//   • In-flight lock per draft (not per-locale — both locales run
//     together so we hold one lock for the pair).
//   • NEVER mutates the draft — Apply is a separate explicit step.
//   • Bundles that contain only one locale produce a single-locale
//     result with the missing-locale slot set to { ok: false,
//     status: 'validation', error: '<missing>' }.
//   • No auto-publish, no IndexNow.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft } from '../../../../lib/ai-drafts/store';
import {
  runOptimizeForLocale,
  type OptimizeRunResult,
} from '../../../../lib/ai-drafts/optimize-runner';

const inflight = new Map<string, number>();
const INFLIGHT_TTL_MS = 120_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function takeLock(id: string): boolean {
  const now = Date.now();
  const prev = inflight.get(id);
  if (prev && now - prev < INFLIGHT_TTL_MS) return false;
  inflight.set(id, now);
  return true;
}
function releaseLock(id: string): void { inflight.delete(id); }

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

  // Optional request body: { locales?: ('ru'|'uz')[] }. Defaults to
  // whichever locales the bundle actually carries.
  const body = (await request.json().catch(() => null)) as null | { locales?: string[] };
  const explicit = Array.isArray(body?.locales)
    ? body!.locales!.filter((l): l is 'ru' | 'uz' => l === 'ru' || l === 'uz')
    : null;

  if (!takeLock(id)) {
    return json({ error: 'Another optimisation for this draft is already running.' }, 429);
  }
  try {
    const draft = await getDraft(env, id);
    if (!draft) return json({ error: 'Draft not found' }, 404);
    if (draft.status === 'rejected' || draft.status === 'imported') {
      return json({ error: `Draft is ${draft.status} — optimisation disabled.` }, 409);
    }

    // Resolve which locales to attempt. If the caller asked for
    // explicit locales, respect them; otherwise run every locale the
    // bundle has.
    const available: Array<'ru' | 'uz'> = [];
    if (draft.has_ru) available.push('ru');
    if (draft.has_uz) available.push('uz');
    const targets = explicit ? explicit.filter((l) => available.includes(l)) : available;

    if (targets.length === 0) {
      return json({ error: 'Bundle has no RU or UZ article to optimise.' }, 400);
    }

    // Parallel fan-out. Promise.all keeps the wall time at
    // max(targets) rather than sum. With 2 locales × 2 passes each
    // (the runner itself uses Promise.all internally) we have 4
    // concurrent Gemini calls per click — Google's free tier is
    // 15 RPM, so even rapid-fire clicks are fine.
    const settled = await Promise.allSettled(
      targets.map((locale) => runOptimizeForLocale(env, draft, locale)),
    );

    const results: { ru?: OptimizeRunResult; uz?: OptimizeRunResult } = {};
    settled.forEach((s, idx) => {
      const locale = targets[idx]!;
      if (s.status === 'fulfilled') {
        results[locale] = s.value;
      } else {
        results[locale] = {
          ok: false,
          locale,
          status: 'upstream',
          error: (s.reason as Error)?.message || 'optimize-runner threw',
        };
      }
    });

    const okCount = Object.values(results).filter((r) => r?.ok).length;
    const failCount = Object.values(results).filter((r) => r && !r.ok).length;

    // If at least one locale produced a usable preview, return 200.
    // Per-locale failures are surfaced inside `results.<locale>` so the
    // modal can render the successful side and a clear error on the
    // failed side. Only return a non-2xx status if EVERY locale failed.
    if (okCount === 0) {
      // All-fail: aggregate the upstream/validation classification.
      const allUpstream = Object.values(results).every((r) => r && !r.ok && r.status === 'upstream');
      return json({
        ok: false,
        results,
        ok_count: 0,
        fail_count: failCount,
        attempted_locales: targets,
      }, allUpstream ? 502 : 422);
    }

    return json({
      ok: true,
      results,
      ok_count: okCount,
      fail_count: failCount,
      attempted_locales: targets,
    });
  } catch (e) {
    return json({ error: (e as Error).message || 'optimize-both failed' }, 500);
  } finally {
    releaseLock(id);
  }
};
