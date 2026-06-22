// Public entry point for Intent Guard analysis. Used by:
//   * POST /api/admin/seo/cannibalization/analyze
//   * POST /api/admin/seo/topic-plans (to pre-score planned topics)
//   * The auto-recheck after /apply-retarget.
//
// Steps:
//   1. Build / receive content inventory
//   2. Compute fingerprint + deterministic shortlist
//   3. Optionally probe SERP overlap for the top conflict
//   4. Optionally call OpenRouter semantic judge
//   5. Aggregate into a single risk score + level
//
// The "optional" toggles let the caller scale CPU/wallclock. The default
// for AI Draft Detail / Blog Editor analyze is: SERP + semantic both on
// only when at least one deterministic conflict has score >= 35. For
// "10 unique topics" planning we keep both off — too expensive.

import type { Env } from '../../_types';
import type { AiDraftArticle } from '../../../src/shared/ai-drafts';
import type {
  ContentInventory, ContentInventoryItem, IntentConflict, IntentFingerprint,
  IntentGuardAnalysis, IntentRiskLevel,
} from '../../../src/shared/intent-guard';
import { buildContentInventory } from './inventory';
import { buildFingerprint, intentKeyOf } from './fingerprint';
import { shortlistConflicts } from './deterministic';
import { probeSerpOverlap } from './serper-shortlist';
import { judgeSemantic } from './semantic-judge';
import { computeRiskScore } from './risk';
import { riskLevelFromScore } from '../../../src/shared/intent-guard';

export interface AnalyzeOptions {
  inventory?: ContentInventory;
  useSerper?: boolean | 'auto';   // 'auto' = only when top deterministic >= 35
  useSemantic?: boolean | 'auto'; // 'auto' = only when top deterministic >= 30
  excludeIds?: string[];          // additional ids to exclude beyond own
}

export interface AnalyzeCandidate {
  id: string;                     // unique id for self-exclusion (e.g. "draft_xxx#ru" or "editor")
  source_type: ContentInventoryItem['source_type'];
  article: AiDraftArticle;
}

export interface AnalyzeOutput {
  fingerprint: IntentFingerprint;
  intent_key: string;
  conflicts: IntentConflict[];
  inventory_counts: ContentInventory['counts'];
  risk_score: number;
  risk_level: IntentRiskLevel;
  serper: { used: boolean; queries_run: number; overlap_score: number };
  semantic: IntentGuardAnalysis['semantic'];
}

export async function analyzeCandidate(
  env: Env,
  candidate: AnalyzeCandidate,
  options: AnalyzeOptions = {},
): Promise<AnalyzeOutput> {
  const inventory = options.inventory || await buildContentInventory(env);
  const article = candidate.article;

  const fingerprint = buildFingerprint({
    locale: article.locale,
    meta_title: article.meta_title,
    h1: article.h1,
    excerpt: article.excerpt,
    target_keyword: article.target_keyword,
    target_money_page: article.target_money_page,
    slug: article.slug,
  });
  const intent_key = intentKeyOf(fingerprint);

  // Build the deterministic candidate
  const headings = (article.body_blocks || [])
    .filter((b) => b.type === 'h2' || b.type === 'h3')
    .map((b) => b.text || '')
    .filter(Boolean);
  const faqQuestions = (article.faq || []).map((f) => f.q).filter(Boolean);
  const linkTargets = (article.internal_links || []).map((l) => l.target).filter(Boolean);

  const excludeSet = new Set<string>([candidate.id, ...(options.excludeIds || [])]);
  const inventoryFiltered = inventory.items.filter((it) => !excludeSet.has(it.id));

  const detResult = shortlistConflicts({
    locale: article.locale,
    id: candidate.id,
    title: article.meta_title,
    h1: article.h1,
    slug: article.slug,
    target_keyword: article.target_keyword,
    target_money_page: article.target_money_page,
    headings,
    faq_questions: faqQuestions,
    internal_link_targets: linkTargets,
    fingerprint,
  }, inventoryFiltered);

  const topScore = detResult.conflicts[0]?.similarity.score ?? 0;

  // Serper
  let serperResult = { used: false, queries_run: 0, overlap_score: 0 };
  const wantSerper = options.useSerper === true || (options.useSerper === 'auto' && topScore >= 35);
  if (wantSerper) {
    try {
      const sr = await probeSerpOverlap(env, {
        locale: article.locale,
        primaryKeyword: article.target_keyword || article.meta_title,
        conflictKeywords: detResult.conflicts.slice(0, 2).map((c) => c.fingerprint.search_intent),
        maxQueries: 2,
      });
      serperResult = { used: sr.used, queries_run: sr.queries_run, overlap_score: sr.overlap_score };
    } catch { /* SERP failures degrade gracefully */ }
  }

  // Semantic judge
  let semantic: IntentGuardAnalysis['semantic'] = {
    used: false,
    risk_score: topScore,
    risk_level: riskLevelFromScore(topScore),
    summary: '',
    current_intent: fingerprint,
    conflicts: [],
    recommendation: { action: 'keep', reason: '', recommended_angle: '', recommended_keyword: '', recommended_funnel_stage: '', recommended_target_money_page: '' },
  };
  const wantSemantic = options.useSemantic === true || (options.useSemantic === 'auto' && topScore >= 30);
  if (wantSemantic) {
    try {
      semantic = await judgeSemantic(env, {
        locale: article.locale,
        fingerprint,
        meta_title: article.meta_title,
        h1: article.h1,
        excerpt: article.excerpt,
        target_keyword: article.target_keyword,
        target_money_page: article.target_money_page,
        headings,
        faq_questions: faqQuestions,
        conflicts: detResult.conflicts,
        deterministic_top_score: topScore,
        serper_overlap: serperResult.overlap_score,
      });
    } catch { /* semantic failures degrade gracefully */ }
  }

  const risk = computeRiskScore({
    conflicts: detResult.conflicts,
    serperOverlap: serperResult.overlap_score,
    semantic,
  });

  return {
    fingerprint,
    intent_key,
    conflicts: detResult.conflicts,
    inventory_counts: inventory.counts,
    risk_score: risk.risk_score,
    risk_level: risk.risk_level,
    serper: serperResult,
    semantic,
  };
}
