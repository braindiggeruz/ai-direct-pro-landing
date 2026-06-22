// OpenRouter client wrapper for the cannibalization_retarget mode of the
// AI Optimizer. Reuses the same model + timeouts + JSON parser as the
// existing optimizer-client.
//
// As of v2 this client runs an ITERATIVE loop:
//   1. ask the LLM to retarget
//   2. validate output against the constraint set (fingerprint delta,
//      title/keyword distance, heading change, money-page protection)
//   3. compute provisional deterministic risk against the inventory
//   4. if constraints failed OR risk still ≥ 50 → next iteration with
//      explicit feedback about WHY the previous attempt was rejected
//   5. up to MAX_ATTEMPTS (default 3); return the attempt with the
//      LOWEST provisional risk
//
// The iterative loop is the whole reason the operator gets reliable
// 100 → <30 risk drops instead of the previous 100 → 81 dead-ends.

import type { Env } from '../../_types';
import type { AiDraftArticle } from '../../../src/shared/ai-drafts';
import type {
  ContentInventory, IntentConflict, IntentFingerprint, RetargetProposal,
} from '../../../src/shared/intent-guard';
import { validateArticle, type ValidationError } from '../ai-drafts/validators';
import { optimiseWithOpenRouter, parseStrictJson } from '../ai-drafts/optimizer-client';
import { buildRetargetSystemPrompt, buildRetargetUserPrompt } from './retarget-prompt';
import { validateRetargetConstraints, failuresAsFeedback, type ConstraintReport } from './retarget-constraints';
import { buildFingerprint, intentKeyOf } from './fingerprint';
import { shortlistConflicts } from './deterministic';
import { computeRiskScore } from './risk';

const ALLOWED_DECISIONS = ['retarget', 'merge', 'reject'] as const;
const ALLOWED_STRATEGIES = ['keep','narrow','change_audience','change_industry','change_channel','change_funnel_stage','change_modifier','change_content_format','merge','reject'] as const;

const MAX_ATTEMPTS = 3;
const TARGET_RISK_SCORE = 29;     // anything below this is "low"
const ACCEPTABLE_RISK_SCORE = 49; // medium-low boundary; we keep trying above this

export interface RetargetInput {
  article: AiDraftArticle;
  fingerprint: IntentFingerprint;
  conflicts: IntentConflict[];
  risk_score_before: number;
  recommendation: {
    action: string;
    reason: string;
    recommended_angle?: string;
    recommended_keyword?: string;
    recommended_funnel_stage?: string;
    recommended_target_money_page?: string;
  };
  user_hint?: string;
  /** Pass the freshly-built inventory so we can recheck risk per attempt
      WITHOUT re-fetching GitHub each time. */
  inventory: ContentInventory;
  /** Used for self-exclusion: the candidate's own item id. */
  candidateId: string;
}

export interface RetargetAttempt {
  iteration: number;
  proposal: RetargetProposal;
  constraint_report: ConstraintReport;
  provisional_risk_score: number;
  accepted: boolean;
  rejection_reason?: string;
}

export interface RetargetResult {
  ok: boolean;
  proposal?: RetargetProposal;
  /** Provisional deterministic risk for the returned proposal. */
  provisional_risk_score?: number;
  attempts?: RetargetAttempt[];
  best_attempt_index?: number;
  validation_errors?: ValidationError[];
  raw_excerpt?: string;
  upstream_error?: string;
}

function logIteration(label: string): void {
  // eslint-disable-next-line no-console
  console.log(`[Intent Guard retarget] ${label}`);
}

async function runSingleAttempt(
  env: Env,
  input: RetargetInput,
  iteration: number,
  failureFeedback: string,
  priorAttempts: RetargetAttempt[],
): Promise<{ ok: true; proposal: RetargetProposal; constraintReport: ConstraintReport; provisionalRisk: number }
  | { ok: false; error: string; raw_excerpt?: string; validation_errors?: ValidationError[] }> {
  const system = buildRetargetSystemPrompt(input.article.locale, iteration);
  const user = buildRetargetUserPrompt({
    article: input.article,
    fingerprint: input.fingerprint,
    conflicts: input.conflicts,
    risk_score_before: input.risk_score_before,
    recommendation: input.recommendation,
    user_hint: input.user_hint,
    previous_failure_feedback: failureFeedback || undefined,
    prior_attempts: priorAttempts.map((a) => ({
      meta_title: a.proposal.optimized_article.meta_title,
      target_keyword: a.proposal.optimized_article.target_keyword,
      fingerprint: a.proposal.new_intent,
      risk_score: a.provisional_risk_score,
    })),
  });

  const llm = await optimiseWithOpenRouter(env, system, user);
  if (!llm.ok) return { ok: false, error: llm.error || 'OpenRouter call failed' };
  const parsed = parseStrictJson(llm.content) as Record<string, unknown> | null;
  if (!parsed) return { ok: false, error: 'LLM did not return JSON', raw_excerpt: (llm.content || '').slice(0, 600) };

  const decision = typeof parsed.decision === 'string' && (ALLOWED_DECISIONS as readonly string[]).includes(parsed.decision)
    ? parsed.decision as RetargetProposal['decision']
    : 'retarget';
  const strategy = typeof parsed.strategy === 'string' && (ALLOWED_STRATEGIES as readonly string[]).includes(parsed.strategy)
    ? parsed.strategy as RetargetProposal['strategy']
    : 'narrow';

  const errors: ValidationError[] = [];
  const article = validateArticle((parsed as { optimized_article?: unknown }).optimized_article, 'optimized_article', errors);
  if (!article) {
    return { ok: false, error: 'Article schema validation failed', validation_errors: errors, raw_excerpt: (llm.content || '').slice(0, 600) };
  }
  // Force locale + slug stability — slug renames go through Blog Editor.
  article.locale = input.article.locale;
  if (article.slug !== input.article.slug) article.slug = input.article.slug;

  const warnings: string[] = Array.isArray(parsed.warnings)
    ? (parsed.warnings as unknown[]).map((s) => String(s)).filter(Boolean).slice(0, 10)
    : [];
  if (article.meta_title.length < 30 || article.meta_title.length > 70) {
    warnings.push(`meta_title length ${article.meta_title.length} (рекомендуется 45–65)`);
  }
  if (article.meta_description.length < 110 || article.meta_description.length > 170) {
    warnings.push(`meta_description length ${article.meta_description.length} (рекомендуется 120–160)`);
  }
  if (input.article.locale === 'uz' && /[А-Яа-яЁё]/.test(JSON.stringify(article))) {
    warnings.push('UZ-статья содержит кириллицу — проверьте.');
  }

  const fp = (parsed.new_intent && typeof parsed.new_intent === 'object')
    ? { ...input.fingerprint, ...(parsed.new_intent as Partial<IntentFingerprint>) }
    : input.fingerprint;
  // Hard-recompute the new fingerprint from the actual article content
  // — never trust the LLM's self-declared "new_intent".
  const recomputedFingerprint = buildFingerprint({
    locale: article.locale,
    meta_title: article.meta_title,
    h1: article.h1,
    excerpt: article.excerpt,
    target_keyword: article.target_keyword,
    target_money_page: article.target_money_page,
    slug: article.slug,
  });
  // Use the recomputed fingerprint for constraint checks (more honest).
  const constraintReport = validateRetargetConstraints({
    original: input.article,
    originalFingerprint: input.fingerprint,
    optimized: article,
    optimizedFingerprint: recomputedFingerprint,
    conflicts: input.conflicts,
    iteration,
  });

  // Provisional risk: re-run the deterministic shortlist against the
  // (inventory minus this candidate) using the NEW article fields.
  const inventoryFiltered = input.inventory.items.filter((it) => it.id !== input.candidateId);
  const headings = (article.body_blocks || [])
    .filter((b) => b.type === 'h2' || b.type === 'h3')
    .map((b) => b.text || '')
    .filter(Boolean);
  const detResult = shortlistConflicts({
    locale: article.locale,
    id: input.candidateId,
    title: article.meta_title,
    h1: article.h1,
    slug: article.slug,
    target_keyword: article.target_keyword,
    target_money_page: article.target_money_page,
    headings,
    faq_questions: (article.faq || []).map((f) => f.q).filter(Boolean),
    internal_link_targets: (article.internal_links || []).map((l) => l.target).filter(Boolean),
    fingerprint: recomputedFingerprint,
  }, inventoryFiltered);
  const provisional = computeRiskScore({ conflicts: detResult.conflicts });

  const expected = (parsed.expected_result && typeof parsed.expected_result === 'object')
    ? parsed.expected_result as Record<string, unknown>
    : {};

  const occupied = (parsed.occupied_intent && typeof parsed.occupied_intent === 'object')
    ? { ...input.fingerprint, ...(parsed.occupied_intent as Partial<IntentFingerprint>) }
    : input.fingerprint;

  const proposal: RetargetProposal = {
    decision,
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 600) : '',
    strategy,
    occupied_intent: occupied,
    new_intent: recomputedFingerprint, // ← always use the recomputed one
    optimized_article: article,
    changes: Array.isArray(parsed.changes) ? (parsed.changes as unknown[]).map(String).filter(Boolean).slice(0, 30) : [],
    kept: Array.isArray(parsed.kept) ? (parsed.kept as unknown[]).map(String).filter(Boolean).slice(0, 30) : [],
    warnings,
    expected_result: {
      conflict_resolved: provisional.risk_level === 'low',
      supports_url: typeof expected.supports_url === 'string' ? expected.supports_url : (article.target_money_page || ''),
      new_funnel_role: typeof expected.new_funnel_role === 'string' ? expected.new_funnel_role : recomputedFingerprint.funnel_stage,
    },
    model: llm.model,
  };
  void fp;
  void intentKeyOf; // imported for use in surrounding logic but not in this fn

  return { ok: true, proposal, constraintReport, provisionalRisk: provisional.risk_score };
}

export async function runRetarget(env: Env, input: RetargetInput): Promise<RetargetResult> {
  if (!env.OPENROUTER_API_KEY) {
    return { ok: false, upstream_error: 'OPENROUTER_API_KEY not configured' };
  }

  const attempts: RetargetAttempt[] = [];
  let feedbackForNext = '';
  let lastError: string | undefined;
  let lastValidationErrors: ValidationError[] | undefined;
  let lastRawExcerpt: string | undefined;

  for (let iteration = 1; iteration <= MAX_ATTEMPTS; iteration++) {
    logIteration(`iteration ${iteration}/${MAX_ATTEMPTS}, prior attempts: ${attempts.length}`);
    const result = await runSingleAttempt(env, input, iteration, feedbackForNext, attempts);
    if (!result.ok) {
      lastError = result.error;
      lastValidationErrors = result.validation_errors;
      lastRawExcerpt = result.raw_excerpt;
      // On transient failure, retry once more if we still have iterations.
      attempts.push({
        iteration,
        proposal: emptyProposal(input.fingerprint, input.article, lastError),
        constraint_report: { passed: false, failures: [], fingerprintDimsChanged: 0, titleSim: 1, keywordSim: 1, headingSim: 1 },
        provisional_risk_score: input.risk_score_before,
        accepted: false,
        rejection_reason: lastError,
      });
      feedbackForNext = `На предыдущей попытке произошла ошибка модели: "${lastError}". Верни валидный JSON по схеме.`;
      continue;
    }
    const { proposal, constraintReport, provisionalRisk } = result;
    const accepted = constraintReport.passed && provisionalRisk <= ACCEPTABLE_RISK_SCORE;
    // Special-case: when the LLM chose "merge" or "reject", we don't enforce
    // the article-distance constraints — there is no successor article to
    // measure against. The operator UX surfaces decision != "retarget" as a
    // direct recommendation rather than an Apply flow.
    const honestNonRetarget = proposal.decision === 'merge' || proposal.decision === 'reject';
    const finalAccepted = accepted || honestNonRetarget;
    attempts.push({
      iteration,
      proposal,
      constraint_report: constraintReport,
      provisional_risk_score: provisionalRisk,
      accepted: finalAccepted,
      rejection_reason: finalAccepted
        ? undefined
        : (!constraintReport.passed
            ? `Constraint failures: ${constraintReport.failures.map((f) => f.code).join(', ')}`
            : `Risk still ${provisionalRisk} (>${ACCEPTABLE_RISK_SCORE})`),
    });
    if (honestNonRetarget) {
      logIteration(`LLM honestly returned decision=${proposal.decision} on iteration ${iteration}, stopping early`);
      break;
    }
    if (finalAccepted && provisionalRisk <= TARGET_RISK_SCORE) {
      logIteration(`accepted on iteration ${iteration} with provisional risk ${provisionalRisk}`);
      break;
    }
    // Build feedback for next iteration
    const parts: string[] = [];
    if (!constraintReport.passed) parts.push(failuresAsFeedback(constraintReport.failures));
    if (provisionalRisk > TARGET_RISK_SCORE) {
      parts.push(
        `Deterministic risk пока ${provisionalRisk}/100. Цель — ниже ${TARGET_RISK_SCORE}. Реши, что НЕ удалось:\n` +
        `- если конфликт всё ещё с прежней страницей, выбери ДРУГУЮ комбинацию (audience+industry+channel), которая отсутствует в shortlist;\n` +
        `- если ты выбрал стратегию "narrow", замени её на "change_audience" или "change_industry";\n` +
        `- если конфликт с money page — переведи статью в чисто informational (search_intent="informational-howto" или "informational-list").`,
      );
    }
    feedbackForNext = parts.join('\n\n');
    if (iteration === MAX_ATTEMPTS) break;
  }

  if (attempts.length === 0) {
    return {
      ok: false,
      upstream_error: lastError || 'No attempts produced',
      validation_errors: lastValidationErrors,
      raw_excerpt: lastRawExcerpt,
    };
  }

  // Pick the attempt with the lowest provisional risk that has a valid proposal.
  const valid = attempts.filter((a) => a.proposal && a.proposal.optimized_article && a.proposal.optimized_article.meta_title);
  if (valid.length === 0) {
    return {
      ok: false,
      upstream_error: lastError || 'All attempts rejected by validation',
      validation_errors: lastValidationErrors,
      raw_excerpt: lastRawExcerpt,
      attempts,
    };
  }
  valid.sort((a, b) => a.provisional_risk_score - b.provisional_risk_score);
  const best = valid[0];
  const bestIndex = attempts.indexOf(best);

  // Annotate the best proposal's warnings with iteration metadata so the
  // operator can see HOW HARD the system tried.
  const annotatedProposal: RetargetProposal = {
    ...best.proposal,
    warnings: [
      ...best.proposal.warnings,
      `AI сделал ${attempts.length} попыток; лучшая снизила риск ${input.risk_score_before} → ${best.provisional_risk_score} (deterministic).`,
      ...(best.provisional_risk_score > TARGET_RISK_SCORE
        ? [`Внимание: риск всё ещё ${best.provisional_risk_score}/100. Possible options: (a) "Создать другой вариант", (b) ручная правка в редакторе, (c) объединить со существующей статьёй (decision=merge), (d) отказаться (decision=reject).`]
        : []),
    ],
  };

  return {
    ok: true,
    proposal: annotatedProposal,
    provisional_risk_score: best.provisional_risk_score,
    attempts,
    best_attempt_index: bestIndex,
  };
}

function emptyProposal(fp: IntentFingerprint, article: AiDraftArticle, reason: string): RetargetProposal {
  return {
    decision: 'reject',
    reason,
    strategy: 'reject',
    occupied_intent: fp,
    new_intent: fp,
    optimized_article: article,
    changes: [],
    kept: [],
    warnings: [`LLM error: ${reason}`],
    expected_result: { conflict_resolved: false, supports_url: '', new_funnel_role: fp.funnel_stage },
    model: 'unknown',
  };
}
