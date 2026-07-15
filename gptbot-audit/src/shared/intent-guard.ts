// Shared types for the Intent Guard subsystem.
// Used by both Cloudflare Functions and the admin SPA.

import type { Locale } from './types';

export type IntentRiskLevel = 'low' | 'medium' | 'high';

export type IntentReservationStatus =
  | 'reserved'
  | 'generating'
  | 'generated'
  | 'analyzed'
  | 'needs_retarget'
  | 'ready_for_review'
  | 'published'
  | 'failed'
  | 'released'
  | 'rejected';

export type TopicPlanStatus =
  | 'proposed'
  | 'reviewing'
  | 'launching'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TopicPlanItemStatus =
  | 'proposed'
  | 'reserved'
  | 'generating'
  | 'generated'
  | 'analyzed'
  | 'needs_retarget'
  | 'ready_for_review'
  | 'failed'
  | 'released'
  | 'rejected';

export interface IntentFingerprint {
  locale: Locale;
  primary_entity: string;        // e.g. "gpt-bot"
  search_intent: string;         // informational | commercial | etc
  funnel_stage: string;          // top | middle | bottom
  audience: string;              // clinic-owner | restaurant-owner | ...
  industry: string;              // clinic | restaurant | retail | ...
  channel: string;               // telegram | whatsapp | instagram | web | none
  geo: string;                   // uzbekistan | tashkent | samarkand | none
  modifier: string;              // pricing | integration | comparison | ...
  content_type: string;          // guide | comparison | listicle | case-study | ...
}

/** Stringified fingerprint suitable for hashing + DB unique constraint. */
export type IntentKey = string;

export interface IntentConflict {
  source_type: 'money_page' | 'blog' | 'ai_draft' | 'reserved_topic' | 'plan_item';
  id: string;                    // url or draft id or reservation id
  url: string | null;
  title: string;
  locale: Locale;
  intent_key: string;
  fingerprint: IntentFingerprint;
  similarity: {
    keyword_overlap: number;     // 0..1
    title_similarity: number;
    h1_similarity: number;
    slug_similarity: number;
    heading_overlap: number;
    same_intent: boolean;
    same_funnel: boolean;
    same_audience: boolean;
    same_industry: boolean;
    same_target_money_page: boolean;
    score: number;               // 0..100
  };
  reason: string;
}

export interface DeterministicAnalysis {
  fingerprint: IntentFingerprint;
  intent_key: string;
  conflicts: IntentConflict[];
  inventory_counts: {
    pages: number;
    blog: number;
    drafts_pending: number;
    reservations_active: number;
  };
}

export interface SemanticVerdict {
  used: boolean;
  risk_score: number;
  risk_level: IntentRiskLevel;
  summary: string;
  current_intent: IntentFingerprint;
  conflicts: Array<{
    id: string;
    url: string | null;
    reason: string;
  }>;
  recommendation: {
    action: 'keep' | 'narrow' | 'change_audience' | 'change_industry'
          | 'change_channel' | 'change_funnel_stage' | 'change_modifier'
          | 'change_content_format' | 'merge' | 'reject';
    reason: string;
    recommended_angle: string;
    recommended_keyword: string;
    recommended_funnel_stage: string;
    recommended_target_money_page: string;
  };
  model?: string;
}

export interface IntentGuardAnalysis {
  id?: string;
  target_kind: 'draft' | 'plan_item' | 'editor';
  draft_id: string | null;
  plan_item_id: string | null;
  locale: Locale;
  fingerprint: IntentFingerprint;
  intent_key: string;
  deterministic: DeterministicAnalysis;
  serper: { used: boolean; queries_run: number; overlap_score: number };
  semantic: SemanticVerdict;
  conflicts: IntentConflict[];
  risk_score: number;
  risk_level: IntentRiskLevel;
  recommendation: SemanticVerdict['recommendation'];
  retarget_proposal: RetargetProposal | null;
  before_risk_score?: number;
  after_risk_score?: number;
  after_risk_level?: IntentRiskLevel;
  applied: boolean;
  model?: string;
  created_at: string;
  applied_at?: string;
}

export interface RetargetProposal {
  decision: 'retarget' | 'merge' | 'reject';
  reason: string;
  strategy:
    | 'keep' | 'narrow' | 'change_audience' | 'change_industry'
    | 'change_channel' | 'change_funnel_stage' | 'change_modifier'
    | 'change_content_format' | 'merge' | 'reject';
  occupied_intent: IntentFingerprint;
  new_intent: IntentFingerprint;
  optimized_article: import('./ai-drafts').AiDraftArticle;
  changes: string[];
  kept: string[];
  warnings: string[];
  expected_result: {
    conflict_resolved: boolean;
    supports_url: string;
    new_funnel_role: string;
  };
  model: string;
}

export interface ContentInventoryItem {
  source_type: 'money_page' | 'blog' | 'ai_draft' | 'reserved_topic' | 'plan_item';
  id: string;
  url: string | null;
  locale: Locale;
  title: string;
  h1: string;
  slug: string;
  status: string;                  // 'published' | 'draft' | 'pending_review' | 'reserved' | ...
  target_keyword: string;
  target_money_page: string | null;
  headings: string[];
  faq_questions: string[];
  internal_link_targets: string[];
  fingerprint: IntentFingerprint;
  intent_key: string;
}

export interface ContentInventory {
  generated_at: string;
  items: ContentInventoryItem[];
  counts: {
    pages_total: number;
    pages_published: number;
    blog_total: number;
    blog_published: number;
    drafts_pending: number;
    reservations_active: number;
  };
}

export interface TopicPlanItem {
  id: string;
  plan_id: string;
  position: number;
  locale: Locale;
  planned_title: string;
  primary_keyword: string;
  intent_key: string;
  fingerprint: IntentFingerprint;
  cluster_key: string | null;
  funnel_stage: string | null;
  audience: string | null;
  industry: string | null;
  channel: string | null;
  geo: string | null;
  modifier: string | null;
  content_type: string | null;
  target_money_page: string | null;
  reason_unique: string | null;
  supports_url: string | null;
  link_plan: {
    outgoing: Array<{ target: string; anchor: string; reason: string }>;
    incoming_proposals: Array<{ source_url: string; anchor: string; reason: string }>;
    cluster: string;
  } | null;
  risk_score: number | null;
  risk_level: IntentRiskLevel | null;
  status: TopicPlanItemStatus;
  reservation_id: string | null;
  draft_id: string | null;
  source_job_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface TopicPlan {
  id: string;
  name: string | null;
  requested_count: number;
  locale_mode: 'ru' | 'uz' | 'ru+uz';
  params: {
    cluster?: string;
    industry?: string;
    channel?: string;
    target_money_page?: string;
    funnel_stage?: string;
    priority?: string;
  };
  status: TopicPlanStatus;
  summary: {
    total: number;
    proposed: number;
    reserved: number;
    generating: number;
    generated: number;
    analyzed: number;
    needs_retarget: number;
    ready_for_review: number;
    failed: number;
  };
  items: TopicPlanItem[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const RISK_THRESHOLDS = { low_max: 29, medium_max: 64 } as const;
export function riskLevelFromScore(score: number): IntentRiskLevel {
  if (score <= RISK_THRESHOLDS.low_max) return 'low';
  if (score <= RISK_THRESHOLDS.medium_max) return 'medium';
  return 'high';
}
