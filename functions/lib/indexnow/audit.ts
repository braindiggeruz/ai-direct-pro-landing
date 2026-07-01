// IndexNow audit log — D1 helpers shared by /api/seo/indexnow (the
// submitter) and /api/admin/indexnow/* (the recent/history reader).
//
// Append-only by design. We never mutate rows: each submitted URL gets
// one INSERT and the UI joins by url to find the latest event.
//
// The schema is created lazily here (CREATE TABLE IF NOT EXISTS) so a
// deploy that did not run migration 0007 still works.

import type { Env } from '../../_types';

export interface IndexNowSubmissionRow {
  id: number;
  submitted_at: string;
  actor_email: string;
  url: string;
  upstream_status: number;
  upstream_ok: number;
  batch_id: string;
  duration_ms: number;
  error: string | null;
}

async function ensureTable(db: D1Database): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS indexnow_submissions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       submitted_at TEXT NOT NULL,
       actor_email TEXT NOT NULL,
       url TEXT NOT NULL,
       upstream_status INTEGER NOT NULL,
       upstream_ok INTEGER NOT NULL DEFAULT 0,
       batch_id TEXT NOT NULL,
       duration_ms INTEGER NOT NULL DEFAULT 0,
       error TEXT
     )`.replace(/\s+/g, ' '),
  ).catch((e) => console.warn('[indexnow-audit] ensureTable CREATE TABLE failed:', (e as Error).message));
  await db.exec('CREATE INDEX IF NOT EXISTS idx_indexnow_url ON indexnow_submissions(url)').catch((e) => console.warn('[indexnow-audit] ensureTable idx_url failed:', (e as Error).message));
  await db.exec('CREATE INDEX IF NOT EXISTS idx_indexnow_submitted_at ON indexnow_submissions(submitted_at DESC)').catch((e) => console.warn('[indexnow-audit] ensureTable idx_submitted_at failed:', (e as Error).message));
  await db.exec('CREATE INDEX IF NOT EXISTS idx_indexnow_batch_id ON indexnow_submissions(batch_id)').catch((e) => console.warn('[indexnow-audit] ensureTable idx_batch_id failed:', (e as Error).message));
}

export async function writeAudit(
  env: Env,
  rows: Array<{
    submitted_at: string;
    actor_email: string;
    url: string;
    upstream_status: number;
    upstream_ok: boolean;
    batch_id: string;
    duration_ms: number;
    error?: string | null;
  }>,
): Promise<void> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || rows.length === 0) return;
  await ensureTable(db);
  // batched D1 insert — single round-trip
  const stmt = db.prepare(
    `INSERT INTO indexnow_submissions
       (submitted_at, actor_email, url, upstream_status, upstream_ok, batch_id, duration_ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  await db
    .batch(rows.map((r) =>
      stmt.bind(
        r.submitted_at,
        r.actor_email.slice(0, 120),
        r.url.slice(0, 800),
        r.upstream_status,
        r.upstream_ok ? 1 : 0,
        r.batch_id,
        r.duration_ms,
        (r.error || null)?.toString().slice(0, 480) ?? null,
      ),
    ))
    .catch((e) => console.warn('[indexnow-audit] writeAudit batch insert failed:', (e as Error).message));
}

/**
 * Returns the most recent submission row per URL (latest submitted_at).
 * Used by /api/admin/indexnow/recent to badge each candidate URL with
 * its last submission status.
 */
export async function readLatestPerUrl(env: Env, urls: string[]): Promise<Map<string, IndexNowSubmissionRow>> {
  const out = new Map<string, IndexNowSubmissionRow>();
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || urls.length === 0) return out;
  await ensureTable(db);
  // SQLite parameter limit is 999 — cap at 500.
  const slice = urls.slice(0, 500);
  const placeholders = slice.map(() => '?').join(',');
  const sql = `
    SELECT i.* FROM indexnow_submissions i
    INNER JOIN (
      SELECT url, MAX(submitted_at) AS latest_at
      FROM indexnow_submissions
      WHERE url IN (${placeholders})
      GROUP BY url
    ) m ON m.url = i.url AND m.latest_at = i.submitted_at`;
  const r = await db.prepare(sql).bind(...slice).all<IndexNowSubmissionRow>();
  for (const row of r.results || []) out.set(row.url, row);
  return out;
}

/** Recent submission history — newest first. Capped at `limit` rows. */
export async function readRecentHistory(env: Env, limit = 100): Promise<IndexNowSubmissionRow[]> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return [];
  await ensureTable(db);
  const r = await db
    .prepare('SELECT * FROM indexnow_submissions ORDER BY submitted_at DESC LIMIT ?')
    .bind(Math.max(1, Math.min(500, Math.floor(limit))))
    .all<IndexNowSubmissionRow>();
  return r.results || [];
}
