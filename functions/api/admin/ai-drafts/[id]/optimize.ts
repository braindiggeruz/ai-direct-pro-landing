// POST /api/admin/ai-drafts/:id/optimize
//
// Send the selected locale article through Gemini Flash and return a
// preview of the deeply rewritten version. NEVER mutates the draft —
// the human reviewer must explicitly POST /apply-optimization to save.
//
// Why Gemini Flash (was OpenRouter gpt-4o-mini):
//   * The old optimiser made cosmetic edits only — meta and excerpt
//     would update but body_blocks came back nearly identical (owner
//     screenshot showed 23 → 23 with the first paragraph byte-for-byte
//     the same on both sides). gpt-4o-mini interpreted the conservative
//     "preserve intent" wording as "leave the body alone".
//   * Gemini 2.5 Flash (via Google AI Studio direct REST, free tier)
//     follows long structured prompts much better. Combined with a
//     prompt that explicitly demands a block-by-block rewrite, we now
//     get a genuinely different body on every pass.
//   * Drops one external dependency (OpenRouter) from the optimise
//     critical path. OpenRouter is still used by the Intent Guard
//     semantic judge and retarget client — those are unchanged.
//
// Quality enforcement:
//   * Two parallel Gemini passes per click — balanced (temp 0.55) and
//     aggressive (temp 0.85, with a "rewrite EVERY block" suffix). The
//     server picks whichever produced the higher Jaccard-distance score
//     on the body blocks. Total wall = max(b, a) ≈ 35-45 s, well inside
//     the ~95 s CF Pages budget. Cost = 2 Gemini calls per click,
//     comfortably within the 1500 RPD free-tier quota.
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
import { parseStrictJson } from '../../../../lib/ai-drafts/optimizer-client';
import { callGemini } from '../../../../lib/seo-autopilot/gemini-client';
import type { AiDraftArticle, AiDraftArticleBlock } from '../../../../../src/shared/ai-drafts';

const inflight = new Map<string, number>();
const INFLIGHT_TTL_MS = 120_000;

// Token budget — Gemini 2.5 Flash caps at 8192 output. Optimised
// articles are typically 6-8k tokens of JSON, so we give the full
// budget to ensure no truncation.
const MAX_OUTPUT_TOKENS = 8000;
// We run TWO parallel Gemini calls and pick whichever produced the
// deeper rewrite. The balanced call uses a moderate temperature so the
// model still respects structure; the aggressive call uses higher
// temperature + an explicit "rewrite EVERY block" suffix in the user
// message. Wall time = max(balanced, aggressive) ≈ 35-45 s, well inside
// the ~95 s CF Pages Function budget. Cost = 2 calls per optimisation,
// well inside the 1500 RPD free-tier quota.
const TEMPERATURE_BALANCED = 0.55;
const TEMPERATURE_AGGRESSIVE = 0.85;
// Per-call wall. The balanced pass is slightly more disciplined and
// usually finishes first; the aggressive pass needs the same budget.
const TIMEOUT_MS = 55_000;

// Empirical similarity threshold below which we tag the rewrite as
// "shallow" in the warnings list. 0.55 means at least 55% of trigrams
// must differ between original and rewrite. We do NOT block on this
// (the reviewer can always trigger «Повторить оптимизацию»), but we
// surface the number prominently in the modal so they can decide.
const REWRITE_RATIO_TARGET = 0.55;

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

/**
 * Collapse a block into a normalised text representation for similarity
 * comparison. Strips whitespace runs, casing, and quotation differences.
 */
function blockText(b: AiDraftArticleBlock | undefined | null): string {
  if (!b) return '';
  const t = (b as { text?: string }).text || '';
  const items = Array.isArray((b as { items?: unknown[] }).items)
    ? ((b as { items?: unknown[] }).items as unknown[]).map((x) => String(x || '')).join(' ')
    : '';
  return `${t} ${items}`
    .toLowerCase()
    .replace(/[«»""''`]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fraction of tokens that DIFFER between `a` and `b`. 0 = identical,
 * 1 = no overlap. A trigram-based comparison so synonym swaps still
 * register as a meaningful change but pure reordering does not.
 */
function rewriteFraction(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a || !b) return 1;
  const grams = (s: string): Set<string> => {
    const out = new Set<string>();
    for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  let common = 0;
  for (const g of ga) if (gb.has(g)) common++;
  const total = ga.size + gb.size - common; // |A ∪ B|
  if (total === 0) return 0;
  return 1 - common / total; // Jaccard distance
}

/**
 * Overall body-blocks rewrite ratio. Pairs blocks by index up to
 * min(len) and averages the per-block rewrite fractions. Returns a
 * number in [0, 1].
 */
function bodyRewriteRatio(
  original: AiDraftArticle,
  rewritten: AiDraftArticle,
): { overall: number; unchangedCount: number; comparedCount: number } {
  const oa = original.body_blocks || [];
  const ob = rewritten.body_blocks || [];
  const n = Math.min(oa.length, ob.length);
  if (n === 0) {
    return { overall: rewritten.body_blocks?.length === original.body_blocks?.length ? 0 : 1, unchangedCount: 0, comparedCount: 0 };
  }
  let sum = 0;
  let unchanged = 0;
  for (let i = 0; i < n; i++) {
    const f = rewriteFraction(blockText(oa[i]), blockText(ob[i]));
    sum += f;
    if (f < 0.15) unchanged++;
  }
  return { overall: sum / n, unchangedCount: unchanged, comparedCount: n };
}

async function callOptimiser(
  env: Env,
  system: string,
  user: string,
  temperature: number,
): Promise<{ ok: true; content: string; model: string; durationMs: number } | { ok: false; error: string; status?: number; model: string; durationMs: number; rawExcerpt?: string }> {
  const r = await callGemini(env, {
    system,
    user,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature,
    timeoutMs: TIMEOUT_MS,
    jsonObject: true,
  });
  if (r.ok) return { ok: true, content: r.content, model: r.model, durationMs: r.durationMs };
  return { ok: false, error: r.error, status: r.status, model: r.model, durationMs: r.durationMs, rawExcerpt: r.rawExcerpt };
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
    const article = locale === 'ru' ? draft.ru_article : draft.uz_article;
    if (!article) return json({ error: `Bundle has no ${locale.toUpperCase()} article.` }, 400);

    const beforeErrors: ValidationError[] = [];
    validateArticle(article as unknown as Record<string, unknown>, 'before', beforeErrors);

    const system = buildSystemPrompt(locale);
    const userBase = buildUserPrompt({
      article,
      seoBrief: draft.seo_brief,
      validationIssues: draft.validation?.issues || [],
    });
    const userAggressive = [
      userBase,
      '',
      '⚠️ AGGRESSIVE PASS — this run is paired with a balanced pass; the system will pick whichever produced the deeper rewrite. Push the rewrite as far as you can while staying truthful:',
      '* Rewrite EVERY single body block end-to-end. Pair each output block with the input block at the same index, but the wording, sentence rhythm, and concrete examples MUST be substantively different.',
      '* If you find yourself outputting a paragraph that shares more than 40% of its trigrams with the original, start that paragraph over from scratch with a different opening verb and a different concrete operator detail.',
      '* Every list item must be replaced with a sharper, operator-level instruction (a CRM field name, a button label, a webhook path, a city, a workflow step).',
      '* Every FAQ question rephrased the way a Tashkent operator actually asks it; every answer must include a concrete channel, CRM, or workflow step.',
      '* Same constraints: same slug, same target_money_page, same target_keyword, same locale, no invented stats, no invented clients.',
    ].join('\n');

    // ── Parallel passes ─────────────────────────────────────────────
    // Run balanced + aggressive in parallel. Wall time = max(b, a),
    // typically ~35-45 s. Both share the per-key Gemini quota; the
    // 15 RPM free-tier limit comfortably absorbs the 2-calls-per-click
    // pattern (a click every ~10 s would still fit).
    const [balancedResult, aggressiveResult] = await Promise.all([
      callOptimiser(env, system, userBase, TEMPERATURE_BALANCED),
      callOptimiser(env, system, userAggressive, TEMPERATURE_AGGRESSIVE),
    ]);

    interface Candidate {
      ok: true;
      article: AiDraftArticle;
      ratio: { overall: number; unchangedCount: number; comparedCount: number };
      summary?: { changes?: unknown; kept?: unknown };
      afterErrors: ValidationError[];
      content: string;
      model: string;
      pass: 'balanced' | 'aggressive';
    }
    interface CandidateFailure {
      ok: false;
      pass: 'balanced' | 'aggressive';
      reason: string;
    }

    function digest(
      pass: 'balanced' | 'aggressive',
      raw: Awaited<ReturnType<typeof callOptimiser>>,
    ): Candidate | CandidateFailure {
      if (!raw.ok) {
        return { ok: false, pass, reason: `${pass} upstream ${raw.status || 'network'}: ${(raw.error || '').slice(0, 200)}` };
      }
      const parsed = parseStrictJson(raw.content);
      const rawArticle = (parsed as Record<string, unknown> | null)?.article;
      const summary = (parsed as Record<string, unknown> | null)?.summary as
        | { changes?: unknown; kept?: unknown }
        | undefined;
      const errors: ValidationError[] = [];
      const opt = rawArticle ? validateArticle(rawArticle, 'after', errors) : null;
      if (!opt) {
        return { ok: false, pass, reason: `${pass} validation failed: ${errors.slice(0, 3).map((e) => e.message).join('; ').slice(0, 200)}` };
      }
      const r = bodyRewriteRatio(article, opt);
      return { ok: true, article: opt, ratio: r, summary, afterErrors: errors, content: raw.content, model: raw.model, pass };
    }

    const candidates: Array<Candidate | CandidateFailure> = [
      digest('balanced', balancedResult),
      digest('aggressive', aggressiveResult),
    ];
    const successes = candidates.filter((c): c is Candidate => c.ok);

    if (successes.length === 0) {
      // Both passes failed. Surface the most informative error.
      const reasons = candidates
        .filter((c): c is CandidateFailure => !c.ok)
        .map((c) => c.reason)
        .join(' | ');
      // If both failed upstream, return 502; otherwise 422.
      const upstream = !balancedResult.ok && !aggressiveResult.ok;
      return json({
        error: upstream
          ? 'Both LLM passes failed upstream.'
          : 'AI returned articles that failed local schema validation.',
        detail: reasons.slice(0, 800),
      }, upstream ? 502 : 422);
    }

    // Pick the candidate with the higher rewrite ratio. Tie-breaker:
    // prefer the aggressive pass (operator clicked Optimise specifically
    // to get a stronger rewrite).
    successes.sort((a, b) => {
      if (b.ratio.overall !== a.ratio.overall) return b.ratio.overall - a.ratio.overall;
      return a.pass === 'aggressive' ? -1 : 1;
    });
    const winner = successes[0]!;
    const optimised = winner.article;
    const summary = winner.summary;
    const afterErrors = winner.afterErrors;
    const ratio = winner.ratio;

    // Defence in depth: force the locale to the requested one (the LLM
    // might emit the wrong tag) and keep the slug stable when the model
    // tried to change it without a good reason. We compare a normalised
    // slug — if changed we keep the original (the operator can rename
    // later in the Blog Editor). Also lock the target_money_page +
    // target_keyword so SEO intent is never silently moved.
    optimised.locale = locale;
    if (optimised.slug !== article.slug) optimised.slug = article.slug;
    if (article.target_money_page && optimised.target_money_page !== article.target_money_page) {
      optimised.target_money_page = article.target_money_page;
    }
    if (article.target_keyword && !optimised.target_keyword) {
      optimised.target_keyword = article.target_keyword;
    }

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
    if (ratio.overall < REWRITE_RATIO_TARGET) {
      warnings.push(`Body rewrite ratio is ${(ratio.overall * 100).toFixed(0)}% (${ratio.unchangedCount}/${ratio.comparedCount} blocks barely changed). Consider running «Повторить оптимизацию» if the result still feels shallow.`);
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
      model: `${winner.model} (${winner.pass})`,
      original: article,
      optimized_article: optimised,
      changes,
      kept,
      validation_before: { issues: beforeErrors.slice(0, 50), passed: beforeErrors.length === 0 },
      validation_after:  { issues: afterErrors.slice(0, 50),  passed: afterErrors.length === 0 },
      warnings,
      rewrite_stats: {
        overall_diff_ratio: Number(ratio.overall.toFixed(3)),
        unchanged_blocks: ratio.unchangedCount,
        compared_blocks: ratio.comparedCount,
        retried: successes.length > 1, // both passes returned
        retry_reason: successes.length > 1
          ? `picked ${winner.pass} (balanced=${successes.find((s) => s.pass === 'balanced')?.ratio.overall.toFixed(2) ?? 'n/a'}, aggressive=${successes.find((s) => s.pass === 'aggressive')?.ratio.overall.toFixed(2) ?? 'n/a'})`
          : `only ${winner.pass} pass returned a valid article`,
      },
    });
  } catch (e) {
    return json({ error: (e as Error).message || 'optimize failed' }, 500);
  } finally {
    releaseLock(id, locale);
  }
};
