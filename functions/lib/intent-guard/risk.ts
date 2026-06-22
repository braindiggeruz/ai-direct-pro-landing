// Risk score computation: combine deterministic similarity, SERP overlap
// (optional) and semantic verdict (optional) into a single 0..100 score
// + a low/medium/high level.
//
// Inputs:
//   * deterministic shortlist with per-pair scores 0..100
//   * SERP overlap snapshot (per-pair overlap of top 10 organic urls)
//   * semantic verdict from OpenRouter (when run)
//
// Hard rules:
//   * Score is non-decreasing as more signals are added — the deterministic
//     score is a floor; SERP / semantic can only raise it.
//   * Money page conflicts get +15 boost since they protect business value.
//   * "same intent + same funnel + same audience + same money page" alone
//     is already medium-risk even before SERP/semantic confirmation.

import type {
  IntentConflict, IntentRiskLevel, SemanticVerdict,
} from '../../../src/shared/intent-guard';
import { riskLevelFromScore } from '../../../src/shared/intent-guard';

export interface RiskInputs {
  conflicts: IntentConflict[];
  serperOverlap?: number; // 0..1 max overlap over shortlisted pairs
  semantic?: SemanticVerdict;
}

export interface RiskResult {
  risk_score: number;
  risk_level: IntentRiskLevel;
  top_conflict: IntentConflict | null;
}

export function computeRiskScore(input: RiskInputs): RiskResult {
  const top = input.conflicts[0] || null;
  let score = 0;

  if (top) {
    score = top.similarity.score;
    // boosts
    if (top.source_type === 'money_page') score += 15;
    else if (top.source_type === 'blog')  score += 6;
    if (top.similarity.same_intent && top.similarity.same_funnel) score += 8;
    if (top.similarity.same_audience && top.similarity.same_industry) score += 5;
    if (top.similarity.same_target_money_page) score += 6;
  }

  // SERP overlap: if we know top 10 share >=50% of urls, push up
  if (typeof input.serperOverlap === 'number') {
    const overlap = Math.max(0, Math.min(1, input.serperOverlap));
    score += overlap * 25;
  }

  // Semantic judge: when present, blend its verdict
  if (input.semantic && input.semantic.used) {
    score = Math.max(score, input.semantic.risk_score);
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;
  score = Math.round(score);

  return {
    risk_score: score,
    risk_level: riskLevelFromScore(score),
    top_conflict: top,
  };
}
