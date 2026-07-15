// D1 helpers for seo_topic_reservations.
//
// Reservation lifecycle:
//   reserved → generating → generated → analyzed → ready_for_review → published
//   any → released | rejected | failed
//
// Hard rules:
//   * Two ACTIVE reservations on the same (locale, intent_key) are
//     blocked by the partial unique index `uniq_active_intent`. The
//     reserve() helper catches the SQL error and returns ok=false.
//   * Default TTL is 4 hours — a generation job that takes longer than
//     that gets its reservation auto-released by sweepExpired().

import type { Env } from '../../_types';
import type {
  IntentReservationStatus, IntentFingerprint,
} from '../../../src/shared/intent-guard';

const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000;

function nowIso(): string { return new Date().toISOString(); }

function randomId(prefix: string, len = 22): string {
  const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}${uuid.slice(0, len)}`;
}

export interface ReservationInput {
  locale: 'ru' | 'uz';
  intent_key: string;
  primary_keyword: string;
  planned_title?: string;
  cluster_key?: string | null;
  funnel_stage?: string | null;
  audience?: string | null;
  industry?: string | null;
  channel?: string | null;
  geo?: string | null;
  modifier?: string | null;
  content_type?: string | null;
  target_money_page?: string | null;
  plan_id?: string | null;
  plan_item_id?: string | null;
  ttl_ms?: number;
  fingerprint?: IntentFingerprint;
}

export interface ReservationRow {
  id: string;
  locale: 'ru' | 'uz';
  intent_key: string;
  primary_keyword: string;
  planned_title: string | null;
  target_money_page: string | null;
  status: IntentReservationStatus;
  plan_id: string | null;
  plan_item_id: string | null;
  source_job_id: string | null;
  draft_id: string | null;
  reserved_at: string;
  expires_at: string;
  released_at: string | null;
  release_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type ReserveResult =
  | { ok: true; reservation: ReservationRow }
  | { ok: false; reason: 'duplicate'; existing: ReservationRow }
  | { ok: false; reason: 'storage_missing' };

export async function reserveTopic(env: Env, input: ReservationInput): Promise<ReserveResult> {
  if (!env.GPTBOT_DRAFTS_DB) return { ok: false, reason: 'storage_missing' };
  const id = randomId('res_');
  const now = nowIso();
  const ttl = input.ttl_ms && input.ttl_ms > 0 ? input.ttl_ms : DEFAULT_TTL_MS;
  const expires = new Date(Date.now() + ttl).toISOString();
  try {
    await env.GPTBOT_DRAFTS_DB
      .prepare(`INSERT INTO seo_topic_reservations
        (id, locale, intent_key, primary_keyword, planned_title, cluster_key, funnel_stage,
         audience, industry, channel, geo, modifier, content_type, target_money_page,
         status, plan_id, plan_item_id, reserved_at, expires_at, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'reserved', ?,?,?,?,?,?)`)
      .bind(
        id, input.locale, input.intent_key, input.primary_keyword, input.planned_title || null,
        input.cluster_key || null, input.funnel_stage || null,
        input.audience || null, input.industry || null, input.channel || null,
        input.geo || null, input.modifier || null, input.content_type || null,
        input.target_money_page || null,
        input.plan_id || null, input.plan_item_id || null,
        now, expires, now, now,
      )
      .run();
    const row = await getReservation(env, id);
    if (row) return { ok: true, reservation: row };
  } catch {
    // Unique-index violation = duplicate active intent.
    const existing = await findActiveReservation(env, input.locale, input.intent_key);
    if (existing) return { ok: false, reason: 'duplicate', existing };
  }
  // Fallback (should never reach here)
  const existing = await findActiveReservation(env, input.locale, input.intent_key);
  if (existing) return { ok: false, reason: 'duplicate', existing };
  return { ok: false, reason: 'storage_missing' };
}

export async function getReservation(env: Env, id: string): Promise<ReservationRow | null> {
  if (!env.GPTBOT_DRAFTS_DB) return null;
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT * FROM seo_topic_reservations WHERE id = ?`)
    .bind(id)
    .first<ReservationRow>();
  return r || null;
}

export async function findActiveReservation(env: Env, locale: string, intentKey: string): Promise<ReservationRow | null> {
  if (!env.GPTBOT_DRAFTS_DB) return null;
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT * FROM seo_topic_reservations
              WHERE locale = ? AND intent_key = ?
                AND status IN ('reserved','generating','generated','analyzed','needs_retarget','ready_for_review')
              ORDER BY created_at DESC LIMIT 1`)
    .bind(locale, intentKey)
    .first<ReservationRow>();
  return r || null;
}

export async function transitionReservation(
  env: Env,
  id: string,
  next: IntentReservationStatus,
  meta: { draft_id?: string | null; source_job_id?: string | null; release_reason?: string | null } = {},
): Promise<ReservationRow | null> {
  if (!env.GPTBOT_DRAFTS_DB) return null;
  const now = nowIso();
  const releaseStates: IntentReservationStatus[] = ['released', 'rejected', 'failed'];
  const releasedAt = releaseStates.includes(next) ? now : null;
  await env.GPTBOT_DRAFTS_DB
    .prepare(`UPDATE seo_topic_reservations
              SET status = ?, updated_at = ?,
                  draft_id = COALESCE(?, draft_id),
                  source_job_id = COALESCE(?, source_job_id),
                  released_at = COALESCE(?, released_at),
                  release_reason = COALESCE(?, release_reason)
              WHERE id = ?`)
    .bind(next, now, meta.draft_id ?? null, meta.source_job_id ?? null, releasedAt, meta.release_reason ?? null, id)
    .run();
  return getReservation(env, id);
}

export async function sweepExpired(env: Env): Promise<number> {
  if (!env.GPTBOT_DRAFTS_DB) return 0;
  const now = nowIso();
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`UPDATE seo_topic_reservations
              SET status = 'released', released_at = ?, release_reason = 'expired', updated_at = ?
              WHERE status IN ('reserved','generating')
                AND expires_at < ?`)
    .bind(now, now, now)
    .run();
  // D1 returns meta with changes count
  return (r.meta?.changes as number) || 0;
}

export async function listActiveReservations(env: Env): Promise<ReservationRow[]> {
  if (!env.GPTBOT_DRAFTS_DB) return [];
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT * FROM seo_topic_reservations
              WHERE status IN ('reserved','generating','generated','analyzed','needs_retarget','ready_for_review')
              ORDER BY created_at DESC LIMIT 200`)
    .all<ReservationRow>();
  return r.results || [];
}
