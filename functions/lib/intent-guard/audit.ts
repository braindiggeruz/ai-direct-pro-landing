// Intent Guard audit-event helpers. Logs are written into the existing
// ai_draft_audit table (action prefix `intent_guard:*`) when scoped to a
// specific draft, OR into intent_guard_analyses snapshot rows.

import type { Env } from '../../_types';
import { appendAudit } from '../ai-drafts/store';
import type {
  IntentGuardAnalysis, IntentFingerprint, IntentConflict, RetargetProposal, SemanticVerdict,
} from '../../../src/shared/intent-guard';

function nowIso(): string { return new Date().toISOString(); }

function randomId(prefix: string, len = 22): string {
  const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}${uuid.slice(0, len)}`;
}

export interface SaveAnalysisInput {
  target_kind: 'draft' | 'plan_item' | 'editor';
  draft_id?: string | null;
  plan_item_id?: string | null;
  locale: 'ru' | 'uz';
  fingerprint: IntentFingerprint;
  intent_key: string;
  deterministic: { conflicts: IntentConflict[]; inventory_counts: Record<string, number> };
  serper?: { used: boolean; queries_run: number; overlap_score: number } | null;
  semantic?: SemanticVerdict | null;
  conflicts: IntentConflict[];
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  recommendation?: SemanticVerdict['recommendation'] | null;
  retarget_proposal?: RetargetProposal | null;
  before_risk_score?: number;
  after_risk_score?: number;
  after_risk_level?: 'low' | 'medium' | 'high';
  applied?: boolean;
  model?: string;
  actor: string;
}

export async function saveAnalysis(env: Env, input: SaveAnalysisInput): Promise<string | null> {
  if (!env.GPTBOT_DRAFTS_DB) return null;
  const id = randomId('iga_');
  const now = nowIso();
  await env.GPTBOT_DRAFTS_DB
    .prepare(`INSERT INTO intent_guard_analyses
      (id, target_kind, draft_id, plan_item_id, locale, intent_key,
       fingerprint_json, deterministic_json, serper_json, semantic_json,
       conflicts_json, risk_score, risk_level, recommendation_json,
       retarget_proposal_json, applied, before_risk_score, after_risk_score, after_risk_level,
       model, actor, created_at, applied_at)
      VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?)`)
    .bind(
      id, input.target_kind, input.draft_id ?? null, input.plan_item_id ?? null,
      input.locale, input.intent_key,
      JSON.stringify(input.fingerprint),
      JSON.stringify(input.deterministic),
      input.serper ? JSON.stringify(input.serper) : null,
      input.semantic ? JSON.stringify(input.semantic) : null,
      JSON.stringify(input.conflicts),
      input.risk_score, input.risk_level,
      input.recommendation ? JSON.stringify(input.recommendation) : null,
      input.retarget_proposal ? JSON.stringify(input.retarget_proposal) : null,
      input.applied ? 1 : 0,
      input.before_risk_score ?? null,
      input.after_risk_score ?? null,
      input.after_risk_level ?? null,
      input.model ?? null,
      input.actor, now,
      input.applied ? now : null,
    )
    .run();

  // Mirror to ai_draft_audit when scoped to a draft.
  if (input.target_kind === 'draft' && input.draft_id) {
    await appendAudit(env, input.draft_id, 'intent_guard_analyzed', input.actor, {
      locale: input.locale,
      risk_score: input.risk_score,
      risk_level: input.risk_level,
      intent_key: input.intent_key,
      top_conflicts: input.conflicts.slice(0, 5).map((c) => ({ id: c.id, source_type: c.source_type, score: c.similarity.score })),
    }).catch((e) => console.warn('[intent-guard] appendAudit to draft failed:', (e as Error).message));
  }
  return id;
}

export async function updateAnalysisApplied(
  env: Env,
  id: string,
  patch: { after_risk_score: number; after_risk_level: 'low' | 'medium' | 'high'; applied: true },
): Promise<void> {
  if (!env.GPTBOT_DRAFTS_DB) return;
  const now = nowIso();
  await env.GPTBOT_DRAFTS_DB
    .prepare(`UPDATE intent_guard_analyses
              SET applied = 1, after_risk_score = ?, after_risk_level = ?, applied_at = ?
              WHERE id = ?`)
    .bind(patch.after_risk_score, patch.after_risk_level, now, id)
    .run();
}

export async function getAnalysis(env: Env, id: string): Promise<IntentGuardAnalysis | null> {
  if (!env.GPTBOT_DRAFTS_DB) return null;
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT * FROM intent_guard_analyses WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!r) return null;
  const safe = <T = unknown>(s: unknown): T | null => {
    if (typeof s !== 'string') return null;
    try { return JSON.parse(s) as T; } catch { return null; }
  };
  return {
    id: r.id as string,
    target_kind: r.target_kind as 'draft' | 'plan_item' | 'editor',
    draft_id: (r.draft_id as string) || null,
    plan_item_id: (r.plan_item_id as string) || null,
    locale: r.locale as 'ru' | 'uz',
    fingerprint: safe<IntentFingerprint>(r.fingerprint_json)!,
    intent_key: r.intent_key as string,
    deterministic: safe<IntentGuardAnalysis['deterministic']>(r.deterministic_json)!,
    serper: safe<IntentGuardAnalysis['serper']>(r.serper_json) || { used: false, queries_run: 0, overlap_score: 0 },
    semantic: safe<SemanticVerdict>(r.semantic_json) || { used: false } as SemanticVerdict,
    conflicts: safe<IntentConflict[]>(r.conflicts_json) || [],
    risk_score: r.risk_score as number,
    risk_level: r.risk_level as 'low' | 'medium' | 'high',
    recommendation: safe<SemanticVerdict['recommendation']>(r.recommendation_json) || {
      action: 'keep', reason: '', recommended_angle: '', recommended_keyword: '',
      recommended_funnel_stage: '', recommended_target_money_page: '',
    },
    retarget_proposal: safe<RetargetProposal>(r.retarget_proposal_json) || null,
    before_risk_score: (r.before_risk_score as number | null) ?? undefined,
    after_risk_score: (r.after_risk_score as number | null) ?? undefined,
    after_risk_level: (r.after_risk_level as 'low' | 'medium' | 'high' | null) ?? undefined,
    applied: (r.applied as number) === 1,
    model: (r.model as string | null) ?? undefined,
    created_at: r.created_at as string,
    applied_at: (r.applied_at as string | null) ?? undefined,
  };
}

export async function listRecentAnalyses(env: Env, draftId: string, limit = 5): Promise<IntentGuardAnalysis[]> {
  if (!env.GPTBOT_DRAFTS_DB) return [];
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT id FROM intent_guard_analyses
              WHERE draft_id = ? ORDER BY created_at DESC LIMIT ?`)
    .bind(draftId, Math.min(Math.max(limit, 1), 50))
    .all<{ id: string }>();
  const out: IntentGuardAnalysis[] = [];
  for (const row of r.results || []) {
    const a = await getAnalysis(env, row.id);
    if (a) out.push(a);
  }
  return out;
}

export async function logAuditEvent(
  env: Env,
  draftId: string | null,
  event: string,
  actor: string,
  details: Record<string, unknown>,
): Promise<void> {
  if (!draftId) return;
  try { await appendAudit(env, draftId, event, actor, details); } catch { /* best-effort */ }
}
