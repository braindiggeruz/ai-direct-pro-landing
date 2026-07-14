// D1 helpers for seo_topic_plans + seo_topic_plan_items.
//
// A plan is the user-facing "10 unique topics / day" object. Items hold
// the planned title, fingerprint, link plan and life-cycle status.

import type { Env } from '../../_types';
import type {
  TopicPlan, TopicPlanItem, TopicPlanStatus, TopicPlanItemStatus,
  IntentFingerprint,
} from '../../../src/shared/intent-guard';
import type { LinkPlan } from './link-plan';

function nowIso(): string { return new Date().toISOString(); }

function randomId(prefix: string, len = 22): string {
  const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}${uuid.slice(0, len)}`;
}

export interface PlanInput {
  name: string | null;
  requested_count: number;
  locale_mode: 'ru' | 'uz' | 'ru+uz';
  params: Record<string, unknown>;
  created_by: string;
}

export interface PlanItemInput {
  locale: 'ru' | 'uz';
  planned_title: string;
  primary_keyword: string;
  intent_key: string;
  fingerprint: IntentFingerprint;
  cluster_key?: string | null;
  funnel_stage?: string | null;
  audience?: string | null;
  industry?: string | null;
  channel?: string | null;
  geo?: string | null;
  modifier?: string | null;
  content_type?: string | null;
  target_money_page?: string | null;
  reason_unique?: string;
  supports_url?: string | null;
  link_plan?: LinkPlan | null;
  risk_score?: number | null;
  risk_level?: 'low' | 'medium' | 'high' | null;
}

interface PlanRow {
  id: string; name: string | null; requested_count: number; locale_mode: string;
  params_json: string | null; status: string; summary_json: string | null;
  created_by: string; created_at: string; updated_at: string;
}
interface PlanItemRow {
  id: string; plan_id: string; position: number; locale: string;
  planned_title: string; primary_keyword: string; intent_key: string;
  fingerprint_json: string; cluster_key: string | null; funnel_stage: string | null;
  audience: string | null; industry: string | null; channel: string | null;
  geo: string | null; modifier: string | null; content_type: string | null;
  target_money_page: string | null; reason_unique: string | null; supports_url: string | null;
  link_plan_json: string | null; risk_score: number | null; risk_level: string | null;
  status: string; reservation_id: string | null; draft_id: string | null;
  source_job_id: string | null; error_message: string | null;
  created_at: string; updated_at: string;
}

function safeParse<T = unknown>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

function rowToPlan(r: PlanRow, items: TopicPlanItem[]): TopicPlan {
  const params = safeParse<Record<string, unknown>>(r.params_json) || {};
  const summary = safeParse<TopicPlan['summary']>(r.summary_json) || {
    total: 0, proposed: 0, reserved: 0, generating: 0, generated: 0,
    analyzed: 0, needs_retarget: 0, ready_for_review: 0, failed: 0,
  };
  return {
    id: r.id,
    name: r.name,
    requested_count: r.requested_count,
    locale_mode: r.locale_mode as 'ru' | 'uz' | 'ru+uz',
    params,
    status: r.status as TopicPlanStatus,
    summary,
    items,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToItem(r: PlanItemRow): TopicPlanItem {
  return {
    id: r.id,
    plan_id: r.plan_id,
    position: r.position,
    locale: r.locale as 'ru' | 'uz',
    planned_title: r.planned_title,
    primary_keyword: r.primary_keyword,
    intent_key: r.intent_key,
    fingerprint: (safeParse<IntentFingerprint>(r.fingerprint_json) || {} as IntentFingerprint),
    cluster_key: r.cluster_key,
    funnel_stage: r.funnel_stage,
    audience: r.audience,
    industry: r.industry,
    channel: r.channel,
    geo: r.geo,
    modifier: r.modifier,
    content_type: r.content_type,
    target_money_page: r.target_money_page,
    reason_unique: r.reason_unique,
    supports_url: r.supports_url,
    link_plan: safeParse<TopicPlanItem['link_plan']>(r.link_plan_json),
    risk_score: r.risk_score,
    risk_level: r.risk_level as 'low' | 'medium' | 'high' | null,
    status: r.status as TopicPlanItemStatus,
    reservation_id: r.reservation_id,
    draft_id: r.draft_id,
    source_job_id: r.source_job_id,
    error_message: r.error_message,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function createPlan(env: Env, input: PlanInput, items: PlanItemInput[]): Promise<TopicPlan> {
  if (!env.GPTBOT_DRAFTS_DB) throw new Error('GPTBOT_DRAFTS_DB binding missing');
  const id = randomId('plan_');
  const now = nowIso();
  const summary = {
    total: items.length, proposed: items.length, reserved: 0,
    generating: 0, generated: 0, analyzed: 0, needs_retarget: 0,
    ready_for_review: 0, failed: 0,
  };
  await env.GPTBOT_DRAFTS_DB
    .prepare(`INSERT INTO seo_topic_plans
      (id, name, requested_count, locale_mode, params_json, status, summary_json, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?, 'proposed', ?, ?, ?, ?)`)
    .bind(id, input.name, input.requested_count, input.locale_mode, JSON.stringify(input.params),
          JSON.stringify(summary), input.created_by, now, now)
    .run();

  // Batch insert items
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemId = randomId('pli_');
    await env.GPTBOT_DRAFTS_DB
      .prepare(`INSERT INTO seo_topic_plan_items
        (id, plan_id, position, locale, planned_title, primary_keyword, intent_key,
         fingerprint_json, cluster_key, funnel_stage, audience, industry, channel,
         geo, modifier, content_type, target_money_page, reason_unique, supports_url,
         link_plan_json, risk_score, risk_level, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?)`)
      .bind(
        itemId, id, i + 1, item.locale, item.planned_title, item.primary_keyword, item.intent_key,
        JSON.stringify(item.fingerprint), item.cluster_key || null, item.funnel_stage || null,
        item.audience || null, item.industry || null, item.channel || null,
        item.geo || null, item.modifier || null, item.content_type || null,
        item.target_money_page || null, item.reason_unique || null, item.supports_url || null,
        item.link_plan ? JSON.stringify(item.link_plan) : null,
        item.risk_score ?? null, item.risk_level || null,
        'proposed', now, now,
      )
      .run();
  }

  const plan = await getPlan(env, id);
  if (!plan) throw new Error('Plan created but not found');
  return plan;
}

export async function getPlan(env: Env, id: string): Promise<TopicPlan | null> {
  if (!env.GPTBOT_DRAFTS_DB) return null;
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT * FROM seo_topic_plans WHERE id = ?`)
    .bind(id)
    .first<PlanRow>();
  if (!r) return null;
  const items = await listItems(env, id);
  return rowToPlan(r, items);
}

export async function listPlans(env: Env, limit = 50): Promise<TopicPlan[]> {
  if (!env.GPTBOT_DRAFTS_DB) return [];
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT * FROM seo_topic_plans ORDER BY created_at DESC LIMIT ?`)
    .bind(Math.min(Math.max(limit, 1), 200))
    .all<PlanRow>();
  const plans: TopicPlan[] = [];
  for (const row of r.results || []) {
    const items = await listItems(env, row.id);
    plans.push(rowToPlan(row, items));
  }
  return plans;
}

export async function listItems(env: Env, planId: string): Promise<TopicPlanItem[]> {
  if (!env.GPTBOT_DRAFTS_DB) return [];
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT * FROM seo_topic_plan_items WHERE plan_id = ? ORDER BY position ASC`)
    .bind(planId)
    .all<PlanItemRow>();
  return (r.results || []).map(rowToItem);
}

export async function getItem(env: Env, itemId: string): Promise<TopicPlanItem | null> {
  if (!env.GPTBOT_DRAFTS_DB) return null;
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT * FROM seo_topic_plan_items WHERE id = ?`)
    .bind(itemId)
    .first<PlanItemRow>();
  return r ? rowToItem(r) : null;
}

export async function updatePlan(
  env: Env,
  id: string,
  patch: { name?: string | null; status?: TopicPlanStatus; summary?: TopicPlan['summary'] },
): Promise<TopicPlan | null> {
  if (!env.GPTBOT_DRAFTS_DB) return null;
  const now = nowIso();
  const cur = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT * FROM seo_topic_plans WHERE id = ?`)
    .bind(id)
    .first<PlanRow>();
  if (!cur) return null;
  await env.GPTBOT_DRAFTS_DB
    .prepare(`UPDATE seo_topic_plans
              SET name = COALESCE(?, name),
                  status = COALESCE(?, status),
                  summary_json = COALESCE(?, summary_json),
                  updated_at = ?
              WHERE id = ?`)
    .bind(patch.name ?? null, patch.status ?? null, patch.summary ? JSON.stringify(patch.summary) : null, now, id)
    .run();
  return getPlan(env, id);
}

export async function updateItem(
  env: Env,
  itemId: string,
  patch: Partial<{
    status: TopicPlanItemStatus;
    reservation_id: string | null;
    draft_id: string | null;
    source_job_id: string | null;
    error_message: string | null;
    risk_score: number | null;
    risk_level: 'low' | 'medium' | 'high' | null;
    planned_title: string;
    primary_keyword: string;
    intent_key: string;
    fingerprint: IntentFingerprint;
    link_plan: LinkPlan | null;
    reason_unique: string;
    supports_url: string | null;
    target_money_page: string | null;
  }>,
): Promise<TopicPlanItem | null> {
  if (!env.GPTBOT_DRAFTS_DB) return null;
  const now = nowIso();
  await env.GPTBOT_DRAFTS_DB
    .prepare(`UPDATE seo_topic_plan_items
              SET status = COALESCE(?, status),
                  reservation_id = COALESCE(?, reservation_id),
                  draft_id = COALESCE(?, draft_id),
                  source_job_id = COALESCE(?, source_job_id),
                  error_message = COALESCE(?, error_message),
                  risk_score = COALESCE(?, risk_score),
                  risk_level = COALESCE(?, risk_level),
                  planned_title = COALESCE(?, planned_title),
                  primary_keyword = COALESCE(?, primary_keyword),
                  intent_key = COALESCE(?, intent_key),
                  fingerprint_json = COALESCE(?, fingerprint_json),
                  link_plan_json = COALESCE(?, link_plan_json),
                  reason_unique = COALESCE(?, reason_unique),
                  supports_url = COALESCE(?, supports_url),
                  target_money_page = COALESCE(?, target_money_page),
                  updated_at = ?
              WHERE id = ?`)
    .bind(
      patch.status ?? null,
      patch.reservation_id ?? null,
      patch.draft_id ?? null,
      patch.source_job_id ?? null,
      patch.error_message ?? null,
      patch.risk_score ?? null,
      patch.risk_level ?? null,
      patch.planned_title ?? null,
      patch.primary_keyword ?? null,
      patch.intent_key ?? null,
      patch.fingerprint ? JSON.stringify(patch.fingerprint) : null,
      patch.link_plan ? JSON.stringify(patch.link_plan) : null,
      patch.reason_unique ?? null,
      patch.supports_url ?? null,
      patch.target_money_page ?? null,
      now,
      itemId,
    )
    .run();
  return getItem(env, itemId);
}

export async function deleteItem(env: Env, itemId: string): Promise<void> {
  if (!env.GPTBOT_DRAFTS_DB) return;
  await env.GPTBOT_DRAFTS_DB.prepare(`DELETE FROM seo_topic_plan_items WHERE id = ?`).bind(itemId).run();
}

export async function recomputeSummary(env: Env, planId: string): Promise<TopicPlan['summary']> {
  const items = await listItems(env, planId);
  const summary: TopicPlan['summary'] = {
    total: items.length, proposed: 0, reserved: 0, generating: 0, generated: 0,
    analyzed: 0, needs_retarget: 0, ready_for_review: 0, failed: 0,
  };
  for (const it of items) {
    switch (it.status) {
      case 'proposed':         summary.proposed++; break;
      case 'reserved':         summary.reserved++; break;
      case 'generating':       summary.generating++; break;
      case 'generated':        summary.generated++; break;
      case 'analyzed':         summary.analyzed++; break;
      case 'needs_retarget':   summary.needs_retarget++; break;
      case 'ready_for_review': summary.ready_for_review++; break;
      case 'failed':           summary.failed++; break;
    }
  }
  await updatePlan(env, planId, { summary });
  return summary;
}
