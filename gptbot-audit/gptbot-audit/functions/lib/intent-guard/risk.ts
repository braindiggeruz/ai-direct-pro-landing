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
    // Money-page conditional boost. The key insight: a money_page in the
    // conflicts list is only a REAL conflict when the candidate still
    // shares the commercial intent. When the retarget has successfully
    // moved the article to informational / different funnel, the money
    // page becomes a SUPPORTED page rather than a competitor, so the
    // boost is reduced to almost zero (it remains a signal, not a flag).
    if (top.source_type === 'money_page') {
      if (top.similarity.same_intent && top.similarity.same_funnel) {
        score += 15;            // direct commercial conflict
      } else if (top.similarity.same_funnel) {
        score += 6;             // same funnel, different intent — partial overlap
      } else {
        score += 2;             // different intent + different funnel — supporting article
      }
    } else if (top.source_type === 'blog') {
      // Same logic for blog: only punish hard when intents truly clash.
      score += top.similarity.same_intent ? 6 : 2;
    }
    if (top.similarity.same_intent && top.similarity.same_funnel) score += 8;
    if (top.similarity.same_audience && top.similarity.same_industry) score += 5;
    // same_target_money_page is a FEATURE when the candidate has a
    // different intent (supporting article), not a bug. Only count it
    // when intents also overlap.
    if (top.similarity.same_target_money_page && top.similarity.same_intent) score += 6;
  }

  // SERP overlap: if we know top 10 share >=50% of urls, push up
  if (typeof input.serperOverlap === 'number') {
    const overlap = Math.max(0, Math.min(1, input.serperOverlap));
    score += overlap * 25;
  }

  // Semantic judge: when present, blend its verdict — but cap it so a
  // single conservative LLM reply can't drag a deterministically-clean
  // article back into 'medium'. Semantic can only contribute UP TO
  // a 10-point pull above the deterministic floor.
  if (input.semantic && input.semantic.used) {
    const semCapped = Math.min(input.semantic.risk_score, score + 10);
    score = Math.max(score, semCapped);
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
