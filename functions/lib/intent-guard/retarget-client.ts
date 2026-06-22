// OpenRouter client wrapper for the cannibalization_retarget mode of the
// AI Optimizer. Reuses the same model + timeouts + JSON parser as the
// existing optimizer-client.

import type { Env } from '../../_types';
import type { AiDraftArticle } from '../../../src/shared/ai-drafts';
import type {
  IntentConflict, IntentFingerprint, RetargetProposal,
} from '../../../src/shared/intent-guard';
import { validateArticle, type ValidationError } from '../ai-drafts/validators';
import { optimiseWithOpenRouter, parseStrictJson } from '../ai-drafts/optimizer-client';
import { buildRetargetSystemPrompt, buildRetargetUserPrompt } from './retarget-prompt';

const ALLOWED_DECISIONS = ['retarget', 'merge', 'reject'] as const;
const ALLOWED_STRATEGIES = ['keep','narrow','change_audience','change_industry','change_channel','change_funnel_stage','change_modifier','change_content_format','merge','reject'] as const;

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
}

export interface RetargetResult {
  ok: boolean;
  proposal?: RetargetProposal;
  validation_errors?: ValidationError[];
  raw_excerpt?: string;
  upstream_error?: string;
}

export async function runRetarget(env: Env, input: RetargetInput): Promise<RetargetResult> {
  if (!env.OPENROUTER_API_KEY) {
    return { ok: false, upstream_error: 'OPENROUTER_API_KEY not configured' };
  }
  const system = buildRetargetSystemPrompt(input.article.locale);
  const user = buildRetargetUserPrompt(input);
  const llm = await optimiseWithOpenRouter(env, system, user);
  if (!llm.ok) return { ok: false, upstream_error: llm.error || 'OpenRouter call failed' };
  const parsed = parseStrictJson(llm.content) as Record<string, unknown> | null;
  if (!parsed) {
    return { ok: false, raw_excerpt: (llm.content || '').slice(0, 600), upstream_error: 'LLM did not return JSON' };
  }
  const decision = typeof parsed.decision === 'string' && (ALLOWED_DECISIONS as readonly string[]).includes(parsed.decision)
    ? parsed.decision as RetargetProposal['decision']
    : 'retarget';
  const strategy = typeof parsed.strategy === 'string' && (ALLOWED_STRATEGIES as readonly string[]).includes(parsed.strategy)
    ? parsed.strategy as RetargetProposal['strategy']
    : 'narrow';

  // Validate the article through the SAME validator as the n8n ingest
  // + AI optimizer. We never trust the LLM to obey the schema.
  const errors: ValidationError[] = [];
  const article = validateArticle((parsed as { optimized_article?: unknown }).optimized_article, 'optimized_article', errors);
  if (!article) {
    return { ok: false, validation_errors: errors, raw_excerpt: (llm.content || '').slice(0, 600) };
  }
  // Force locale + slug stability — slug renames must go through Blog Editor.
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
  const occupied = (parsed.occupied_intent && typeof parsed.occupied_intent === 'object')
    ? { ...input.fingerprint, ...(parsed.occupied_intent as Partial<IntentFingerprint>) }
    : input.fingerprint;

  const expected = (parsed.expected_result && typeof parsed.expected_result === 'object')
    ? parsed.expected_result as Record<string, unknown>
    : {};

  const proposal: RetargetProposal = {
    decision,
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 600) : '',
    strategy,
    occupied_intent: occupied,
    new_intent: fp,
    optimized_article: article,
    changes: Array.isArray(parsed.changes) ? (parsed.changes as unknown[]).map(String).filter(Boolean).slice(0, 30) : [],
    kept: Array.isArray(parsed.kept) ? (parsed.kept as unknown[]).map(String).filter(Boolean).slice(0, 30) : [],
    warnings,
    expected_result: {
      conflict_resolved: expected.conflict_resolved === true,
      supports_url: typeof expected.supports_url === 'string' ? expected.supports_url : (article.target_money_page || ''),
      new_funnel_role: typeof expected.new_funnel_role === 'string' ? expected.new_funnel_role : fp.funnel_stage,
    },
    model: llm.model,
  };
  return { ok: true, proposal };
}
