// Shared per-locale optimisation runner used by both the single-locale
// (/optimize) and dual-locale (/optimize-both) endpoints.
//
// Behaviour:
//   * Spawn balanced (temp 0.55) + aggressive (temp 0.85) Gemini Flash
//     passes in parallel. Pick whichever produced the higher
//     Jaccard-distance score on the body_blocks. Tie-breaker: prefer
//     the aggressive pass.
//   * Lock slug, target_money_page, target_keyword, locale on the
//     winner so SEO intent never drifts silently.
//   * Surface rewrite_stats so the UI can show a depth badge.
//   * Never throws — always returns either an `OptimizeRunSuccess` or
//     an `OptimizeRunFailure`. The caller decides what HTTP status to
//     emit.
//
// References:
//   functions/api/admin/ai-drafts/[id]/optimize.ts       (single locale)
//   functions/api/admin/ai-drafts/[id]/optimize-both.ts  (RU + UZ)

import type { Env } from '../../_types';
import { validateArticle, type ValidationError } from './validators';
import { buildSystemPrompt, buildUserPrompt } from './optimizer-prompt';
import { parseStrictJson } from './optimizer-client';
import { callGemini } from '../seo-autopilot/gemini-client';
import type { AiDraftArticle, AiDraftArticleBlock, AiDraftRecord } from '../../../src/shared/ai-drafts';

const MAX_OUTPUT_TOKENS = 8000;
const TEMPERATURE_BALANCED = 0.55;
const TEMPERATURE_AGGRESSIVE = 0.85;
// Per-call timeout. We run 2 passes per locale in parallel, so wall
// time per locale = max(b, a) ≈ 35-45 s. For the dual-locale endpoint
// the four calls all run together (max ≈ 45-55 s), still inside the
// ~95 s CF Pages Function budget.
const TIMEOUT_MS = 55_000;
const REWRITE_RATIO_TARGET = 0.55;

export interface RewriteStats {
  overall_diff_ratio: number;
  unchanged_blocks: number;
  compared_blocks: number;
  retried: boolean;
  retry_reason: string | null;
}

export interface OptimizeRunSuccess {
  ok: true;
  locale: 'ru' | 'uz';
  model: string;
  original: AiDraftArticle;
  optimized_article: AiDraftArticle;
  changes: string[];
  kept: string[];
  validation_before: { passed: boolean; issues: ValidationError[] };
  validation_after: { passed: boolean; issues: ValidationError[] };
  warnings: string[];
  rewrite_stats: RewriteStats;
}

export interface OptimizeRunFailure {
  ok: false;
  locale: 'ru' | 'uz';
  status: 'upstream' | 'validation';
  error: string;
  detail?: string;
}

export type OptimizeRunResult = OptimizeRunSuccess | OptimizeRunFailure;

/**
 * Optimise a single locale of a draft. Caller must have already
 * verified the draft exists, is not rejected/imported, and that
 * env.GEMINI_API_KEY is present.
 */
export async function runOptimizeForLocale(
  env: Env,
  draft: AiDraftRecord,
  locale: 'ru' | 'uz',
): Promise<OptimizeRunResult> {
  const article = locale === 'ru' ? draft.ru_article : draft.uz_article;
  if (!article) {
    return {
      ok: false,
      locale,
      status: 'validation',
      error: `Bundle has no ${locale.toUpperCase()} article.`,
    };
  }

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

  const [balancedResult, aggressiveResult] = await Promise.all([
    callGeminiPass(env, system, userBase, TEMPERATURE_BALANCED),
    callGeminiPass(env, system, userAggressive, TEMPERATURE_AGGRESSIVE),
  ]);

  type Pass = 'balanced' | 'aggressive';
  interface Cand {
    ok: true;
    article: AiDraftArticle;
    ratio: { overall: number; unchangedCount: number; comparedCount: number };
    summary?: { changes?: unknown; kept?: unknown };
    afterErrors: ValidationError[];
    model: string;
    pass: Pass;
  }
  interface CandFail { ok: false; pass: Pass; reason: string; }

  function digest(pass: Pass, raw: Awaited<ReturnType<typeof callGeminiPass>>): Cand | CandFail {
    if (!raw.ok) {
      return { ok: false, pass, reason: `${pass} upstream ${raw.status || 'network'}: ${(raw.error || '').slice(0, 200)}` };
    }
    const parsed = parseStrictJson(raw.content);
    if (!parsed || typeof parsed !== 'object') {
      return {
        ok: false,
        pass,
        reason: `${pass} returned non-JSON content (len=${raw.content.length}): ${raw.content.slice(0, 200).replace(/\s+/g, ' ')}`,
      };
    }
    const rawArticle = (parsed as Record<string, unknown>).article;
    if (!rawArticle || typeof rawArticle !== 'object') {
      const topKeys = Object.keys(parsed as Record<string, unknown>).slice(0, 10).join(',');
      return {
        ok: false,
        pass,
        reason: `${pass} JSON has no .article field. Top keys=[${topKeys}]. Excerpt: ${raw.content.slice(0, 200).replace(/\s+/g, ' ')}`,
      };
    }
    const summary = (parsed as Record<string, unknown>).summary as
      | { changes?: unknown; kept?: unknown }
      | undefined;
    const errors: ValidationError[] = [];
    const opt = validateArticle(rawArticle, 'after', errors);
    if (!opt) {
      const errSummary = errors.slice(0, 5).map((e) => `${e.path || '?'}=${e.message}`).join('; ').slice(0, 300);
      return { ok: false, pass, reason: `${pass} schema validation failed (${errors.length} errors): ${errSummary || 'no errors recorded'}` };
    }
    const r = bodyRewriteRatio(article!, opt);
    return { ok: true, article: opt, ratio: r, summary, afterErrors: errors, model: raw.model, pass };
  }

  const candidates: Array<Cand | CandFail> = [
    digest('balanced', balancedResult),
    digest('aggressive', aggressiveResult),
  ];
  const successes = candidates.filter((c): c is Cand => c.ok);

  if (successes.length === 0) {
    const reasons = candidates
      .filter((c): c is CandFail => !c.ok)
      .map((c) => c.reason)
      .join(' | ');
    const upstream = !balancedResult.ok && !aggressiveResult.ok;
    return {
      ok: false,
      locale,
      status: upstream ? 'upstream' : 'validation',
      error: upstream ? 'Both LLM passes failed upstream.' : 'AI returned articles that failed local schema validation.',
      detail: reasons.slice(0, 800),
    };
  }

  successes.sort((a, b) => {
    if (b.ratio.overall !== a.ratio.overall) return b.ratio.overall - a.ratio.overall;
    return a.pass === 'aggressive' ? -1 : 1;
  });
  const winner = successes[0]!;
  const optimised = winner.article;

  // Lock SEO-critical fields. Slug renames must go through the Blog
  // Editor where redirects are handled; target_keyword / money_page
  // must never move silently.
  optimised.locale = locale;
  if (optimised.slug !== article.slug) optimised.slug = article.slug;
  if (article.target_money_page && optimised.target_money_page !== article.target_money_page) {
    optimised.target_money_page = article.target_money_page;
  }
  if (article.target_keyword && !optimised.target_keyword) {
    optimised.target_keyword = article.target_keyword;
  }

  const ratio = winner.ratio;
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

  const changes = Array.isArray(winner.summary?.changes)
    ? (winner.summary!.changes as unknown[]).map((s) => String(s)).filter(Boolean).slice(0, 30)
    : [];
  const kept = Array.isArray(winner.summary?.kept)
    ? (winner.summary!.kept as unknown[]).map((s) => String(s)).filter(Boolean).slice(0, 30)
    : [];

  const balancedRatio = successes.find((s) => s.pass === 'balanced')?.ratio.overall;
  const aggressiveRatio = successes.find((s) => s.pass === 'aggressive')?.ratio.overall;

  return {
    ok: true,
    locale,
    model: `${winner.model} (${winner.pass})`,
    original: article,
    optimized_article: optimised,
    changes,
    kept,
    validation_before: { issues: beforeErrors.slice(0, 50), passed: beforeErrors.length === 0 },
    validation_after: { issues: winner.afterErrors.slice(0, 50), passed: winner.afterErrors.length === 0 },
    warnings,
    rewrite_stats: {
      overall_diff_ratio: Number(ratio.overall.toFixed(3)),
      unchanged_blocks: ratio.unchangedCount,
      compared_blocks: ratio.comparedCount,
      retried: successes.length > 1,
      retry_reason: successes.length > 1
        ? `picked ${winner.pass} (balanced=${balancedRatio?.toFixed(2) ?? 'n/a'}, aggressive=${aggressiveRatio?.toFixed(2) ?? 'n/a'})`
        : `only ${winner.pass} pass returned a valid article`,
    },
  };
}

interface GeminiPassResult {
  ok: boolean;
  content: string;
  model: string;
  error?: string;
  status?: number;
  durationMs: number;
}

async function callGeminiPass(env: Env, system: string, user: string, temperature: number): Promise<GeminiPassResult> {
  const r = await callGemini(env, {
    system,
    user,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature,
    timeoutMs: TIMEOUT_MS,
    jsonObject: true,
    // Disable Gemini's hidden reasoning step. With 4 calls fanned out
    // from /optimize-both, reasoning tokens were eating through the
    // 8000-token output budget and the JSON came back truncated. The
    // article we're rewriting is already in front of the model — it
    // doesn't need to "think" to copy structure, just to vary wording.
    // Disabling reasoning also shaves ~5-10 s off each pass under
    // burst load, keeping wall time inside the CF Pages budget.
    thinkingBudget: 0,
  });
  if (r.ok) return { ok: true, content: r.content, model: r.model, durationMs: r.durationMs };
  return { ok: false, content: '', model: r.model, error: r.error, status: r.status, durationMs: r.durationMs };
}

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
 * Jaccard distance over trigrams. 0 = identical, 1 = no overlap.
 * Synonym swaps register as meaningful change; pure reordering does not.
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
  const total = ga.size + gb.size - common;
  if (total === 0) return 0;
  return 1 - common / total;
}

function bodyRewriteRatio(
  original: AiDraftArticle,
  rewritten: AiDraftArticle,
): { overall: number; unchangedCount: number; comparedCount: number } {
  const oa = original.body_blocks || [];
  const ob = rewritten.body_blocks || [];
  const n = Math.min(oa.length, ob.length);
  if (n === 0) {
    return {
      overall: rewritten.body_blocks?.length === original.body_blocks?.length ? 0 : 1,
      unchangedCount: 0,
      comparedCount: 0,
    };
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
