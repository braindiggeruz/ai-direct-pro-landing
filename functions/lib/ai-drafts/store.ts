// D1 helpers for the AI Draft Inbox.
//
// All writes are funnelled through this module so the audit log stays
// consistent and we never store unsanitised JSON.

import type { Env } from '../../_types';
import type {
  AiDraftArticle,
  AiDraftAuditEntry,
  AiDraftListRow,
  AiDraftRecord,
  AiDraftStatus,
} from '../../../src/shared/ai-drafts';
import type { ValidatedBundle } from './validators';

const DRAFT_ID_PREFIX = 'draft_';

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(len = 22): string {
  // Cloudflare Workers runtime ships crypto.randomUUID.
  const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return uuid.slice(0, len);
}

export function newDraftId(): string {
  return `${DRAFT_ID_PREFIX}${randomId()}`;
}

export class DraftsDbMissingError extends Error {
  constructor() { super('GPTBOT_DRAFTS_DB binding missing — configure D1 binding in Cloudflare Pages.'); }
}

export function requireDb(env: Env): D1Database {
  if (!env.GPTBOT_DRAFTS_DB) throw new DraftsDbMissingError();
  return env.GPTBOT_DRAFTS_DB;
}

function safeParse<T = unknown>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

function rowToRecord(row: Record<string, unknown>): AiDraftRecord {
  return {
    id: row.id as string,
    bundle_id: row.bundle_id as string,
    execution_id: (row.execution_id as string) || null,
    source: row.source as string,
    schema_version: row.schema_version as string,
    status: row.status as AiDraftStatus,
    ru_article: safeParse<AiDraftArticle>(row.ru_article_json as string),
    uz_article: safeParse<AiDraftArticle>(row.uz_article_json as string),
    seo_brief: safeParse<Record<string, unknown>>(row.seo_brief_json as string),
    validation: safeParse<AiDraftRecord['validation']>(row.validation_json as string),
    validation_passed: (row.validation_passed as number) === 1,
    validation_issue_count: (row.validation_issue_count as number) || 0,
    has_ru: (row.has_ru as number) === 1,
    has_uz: (row.has_uz as number) === 1,
    target_money_page: (row.target_money_page as string) || null,
    primary_title: (row.primary_title as string) || null,
    primary_slug: (row.primary_slug as string) || null,
    ru_imported_at: (row.ru_imported_at as string) || null,
    uz_imported_at: (row.uz_imported_at as string) || null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    imported_at: (row.imported_at as string) || null,
    rejected_at: (row.rejected_at as string) || null,
    review_note: (row.review_note as string) || null,
  };
}

function rowToListRow(row: Record<string, unknown>): AiDraftListRow {
  return {
    id: row.id as string,
    bundle_id: row.bundle_id as string,
    source: row.source as string,
    status: row.status as AiDraftStatus,
    has_ru: (row.has_ru as number) === 1,
    has_uz: (row.has_uz as number) === 1,
    primary_title: (row.primary_title as string) || null,
    primary_slug: (row.primary_slug as string) || null,
    target_money_page: (row.target_money_page as string) || null,
    validation_passed: (row.validation_passed as number) === 1,
    validation_issue_count: (row.validation_issue_count as number) || 0,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Idempotently insert a validated bundle. If a row with the same bundle_id
 * already exists we DO NOT mutate it — we just return the existing record
 * and flag deduplicated=true. This makes the endpoint safe for n8n retries.
 */
export async function insertOrReuseDraft(
  env: Env,
  bundle: ValidatedBundle,
): Promise<{ record: AiDraftRecord; deduplicated: boolean }> {
  const db = requireDb(env);

  const existing = await db
    .prepare('SELECT * FROM ai_drafts WHERE bundle_id = ?')
    .bind(bundle.bundle_id)
    .first<Record<string, unknown>>();
  if (existing) {
    return { record: rowToRecord(existing), deduplicated: true };
  }

  const id = newDraftId();
  const now = nowIso();
  const ru = bundle.articles.find((a) => a.locale === 'ru') || null;
  const uz = bundle.articles.find((a) => a.locale === 'uz') || null;
  const primary = ru || uz!;
  const targetMoneyPage = ru?.target_money_page || uz?.target_money_page || null;

  await db
    .prepare(
      `INSERT INTO ai_drafts (
        id, bundle_id, execution_id, source, schema_version, status,
        ru_article_json, uz_article_json, seo_brief_json, validation_json,
        validation_passed, validation_issue_count,
        has_ru, has_uz, target_money_page, primary_title, primary_slug,
        ru_imported_at, uz_imported_at, created_at, updated_at,
        imported_at, rejected_at, review_note
      ) VALUES (?, ?, ?, ?, ?, 'pending_review',
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        NULL, NULL, ?, ?,
        NULL, NULL, NULL)`,
    )
    .bind(
      id,
      bundle.bundle_id,
      bundle.execution_id,
      bundle.source,
      bundle.schema_version,
      ru ? JSON.stringify(ru) : null,
      uz ? JSON.stringify(uz) : null,
      bundle.seo_brief ? JSON.stringify(bundle.seo_brief) : null,
      JSON.stringify(bundle.validation),
      bundle.validation.passed ? 1 : 0,
      bundle.validation.issues.length,
      ru ? 1 : 0,
      uz ? 1 : 0,
      targetMoneyPage,
      primary.meta_title,
      primary.slug,
      now,
      now,
    )
    .run();

  await appendAudit(env, id, 'created', `system:${bundle.source}`, {
    bundle_id: bundle.bundle_id,
    execution_id: bundle.execution_id,
    has_ru: !!ru,
    has_uz: !!uz,
    validation_passed: bundle.validation.passed,
    issue_count: bundle.validation.issues.length,
  });

  const row = await db
    .prepare('SELECT * FROM ai_drafts WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) throw new Error('draft inserted but row not found');
  return { record: rowToRecord(row), deduplicated: false };
}

export async function listDrafts(
  env: Env,
  filters: { status?: AiDraftStatus | 'all'; locale?: 'ru' | 'uz' | 'all'; source?: string; limit?: number } = {},
): Promise<AiDraftListRow[]> {
  const db = requireDb(env);
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.status && filters.status !== 'all') {
    where.push('status = ?');
    args.push(filters.status);
  }
  if (filters.locale === 'ru') where.push('has_ru = 1');
  if (filters.locale === 'uz') where.push('has_uz = 1');
  if (filters.source) {
    where.push('source = ?');
    args.push(filters.source);
  }
  const sql = `SELECT id, bundle_id, source, status, has_ru, has_uz,
    primary_title, primary_slug, target_money_page,
    validation_passed, validation_issue_count, created_at, updated_at
    FROM ai_drafts
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC
    LIMIT ?`;
  args.push(Math.min(Math.max(filters.limit || 100, 1), 500));
  const r = await db.prepare(sql).bind(...args).all<Record<string, unknown>>();
  return (r.results || []).map(rowToListRow);
}

export async function getDraft(env: Env, id: string): Promise<AiDraftRecord | null> {
  const db = requireDb(env);
  const row = await db
    .prepare('SELECT * FROM ai_drafts WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? rowToRecord(row) : null;
}

export async function getAuditTrail(env: Env, draftId: string): Promise<AiDraftAuditEntry[]> {
  const db = requireDb(env);
  const r = await db
    .prepare('SELECT id, draft_id, action, actor, details_json, created_at FROM ai_draft_audit WHERE draft_id = ? ORDER BY created_at ASC LIMIT 200')
    .bind(draftId)
    .all<Record<string, unknown>>();
  return (r.results || []).map((row) => ({
    id: row.id as number,
    draft_id: row.draft_id as string,
    action: row.action as string,
    actor: row.actor as string,
    details: safeParse<Record<string, unknown>>(row.details_json as string),
    created_at: row.created_at as string,
  }));
}

export async function appendAudit(
  env: Env,
  draftId: string,
  action: string,
  actor: string,
  details: Record<string, unknown> | null,
): Promise<void> {
  const db = requireDb(env);
  await db
    .prepare('INSERT INTO ai_draft_audit (draft_id, action, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(draftId, action, actor, details ? JSON.stringify(details) : null, nowIso())
    .run();
}

export async function updateDraftStatus(
  env: Env,
  id: string,
  nextStatus: AiDraftStatus,
  actor: string,
  note?: string,
): Promise<AiDraftRecord | null> {
  const db = requireDb(env);
  const before = await getDraft(env, id);
  if (!before) return null;
  const now = nowIso();
  const rejectedAt = nextStatus === 'rejected' ? now : null;
  await db
    .prepare(
      `UPDATE ai_drafts SET status = ?, updated_at = ?,
        rejected_at = CASE WHEN ? = 'rejected' THEN ? ELSE rejected_at END,
        review_note = COALESCE(?, review_note)
       WHERE id = ?`,
    )
    .bind(nextStatus, now, nextStatus, rejectedAt, note ?? null, id)
    .run();
  await appendAudit(env, id, 'status_change', actor, {
    from: before.status,
    to: nextStatus,
    note: note || null,
  });
  return getDraft(env, id);
}

export async function markImported(
  env: Env,
  id: string,
  locale: 'ru' | 'uz',
  actor: string,
): Promise<AiDraftRecord | null> {
  const db = requireDb(env);
  const before = await getDraft(env, id);
  if (!before) return null;
  const now = nowIso();
  const ruImported = locale === 'ru' ? now : before.ru_imported_at;
  const uzImported = locale === 'uz' ? now : before.uz_imported_at;
  // The bundle is considered fully imported when every locale present has
  // been imported (either side may be missing entirely).
  const bothDone =
    (!before.has_ru || ruImported) &&
    (!before.has_uz || uzImported);
  const nextStatus: AiDraftStatus = bothDone ? 'imported' : before.status === 'imported' ? 'imported' : 'pending_review';
  const importedAt = bothDone ? now : before.imported_at;

  await db
    .prepare(
      `UPDATE ai_drafts SET
        ru_imported_at = ?,
        uz_imported_at = ?,
        status = ?,
        imported_at = ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .bind(ruImported, uzImported, nextStatus, importedAt, now, id)
    .run();

  await appendAudit(env, id, 'import', actor, {
    locale,
    bundle_id: before.bundle_id,
    primary_slug: before.primary_slug,
  });
  return getDraft(env, id);
}

export async function deleteDraft(env: Env, id: string, actor: string): Promise<boolean> {
  const db = requireDb(env);
  const before = await getDraft(env, id);
  if (!before) return false;
  // Append a delete audit row first. The FK has ON DELETE CASCADE, so the
  // history rows for this draft will be removed alongside the row — this
  // is intentional: hard-delete is only allowed for non-imported drafts
  // (the admin UI blocks delete otherwise), so the history matters less
  // than keeping the table tidy. If you ever need a soft-delete instead,
  // add a `deleted_at` column and drop the CASCADE.
  await appendAudit(env, id, 'delete', actor, {
    bundle_id: before.bundle_id,
    status: before.status,
  });
  await db.prepare('DELETE FROM ai_drafts WHERE id = ?').bind(id).run();
  return true;
}

/** Constant-time string compare to defeat timing oracles. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
