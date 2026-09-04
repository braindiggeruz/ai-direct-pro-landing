// IndexNow audit log — D1 helpers shared by /api/seo/indexnow (the
// submitter) and /api/admin/indexnow/* (the recent/history reader).
//
// Append-only by design. We never mutate rows: each submitted URL gets
// one INSERT and the UI joins by url to find the latest event.
//
// The schema is created lazily here (CREATE TABLE IF NOT EXISTS) so a
// deploy that did not run migration 0007 still works.

import type { Env } from '../../_types';

export const INDEXNOW_AUDIT_LOOKUP_CHUNK_SIZE = 80;

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

export function chunkIndexNowAuditUrls(urls: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < urls.length; index += INDEXNOW_AUDIT_LOOKUP_CHUNK_SIZE) {
    chunks.push(urls.slice(index, index + INDEXNOW_AUDIT_LOOKUP_CHUNK_SIZE));
  }
  return chunks;
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
  ).catch((e) => { console.error("indexnow-audit: DB operation failed", e); });
  await db.exec('CREATE INDEX IF NOT EXISTS idx_indexnow_url ON indexnow_submissions(url)').catch((e) => { console.error("indexnow-audit: DB operation failed", e); });
  await db.exec('CREATE INDEX IF NOT EXISTS idx_indexnow_submitted_at ON indexnow_submissions(submitted_at DESC)').catch((e) => { console.error("indexnow-audit: DB operation failed", e); });
  await db.exec('CREATE INDEX IF NOT EXISTS idx_indexnow_batch_id ON indexnow_submissions(batch_id)').catch((e) => { console.error("indexnow-audit: DB operation failed", e); });
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
    .catch((e) => { console.error("indexnow-audit: DB operation failed", e); });
}

/**
 * Evidence-grade variant used by the manual admin submitter. Unlike the
 * historical best-effort helper, this rejects when the D1 receipt cannot be
 * persisted so the response can state that fact explicitly.
 */
export async function writeAuditStrict(
  env: Env,
  rows: Parameters<typeof writeAudit>[1],
): Promise<void> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) throw new Error('indexnow_audit_store_unavailable');
  if (rows.length === 0) return;
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
  );
  await db.exec('CREATE INDEX IF NOT EXISTS idx_indexnow_url ON indexnow_submissions(url)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_indexnow_submitted_at ON indexnow_submissions(submitted_at DESC)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_indexnow_batch_id ON indexnow_submissions(batch_id)');
  const stmt = db.prepare(
    `INSERT INTO indexnow_submissions
       (submitted_at, actor_email, url, upstream_status, upstream_ok, batch_id, duration_ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const results = await db.batch(rows.map((row) => stmt.bind(
    row.submitted_at,
    row.actor_email.slice(0, 120),
    row.url.slice(0, 800),
    row.upstream_status,
    row.upstream_ok ? 1 : 0,
    row.batch_id,
    row.duration_ms,
    (row.error || null)?.toString().slice(0, 480) ?? null,
  )));
  if (results.length !== rows.length
    || results.some((result) => (result as { success?: boolean }).success === false)) {
    throw new Error('indexnow_audit_incomplete');
  }
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
  // D1 enforces a lower bound-parameter ceiling than stock SQLite. Keep each
  // statement comfortably below it and batch the chunks in one round trip.
  const slice = urls.slice(0, 500);
  const statements = chunkIndexNowAuditUrls(slice).map((chunk) => {
    const placeholders = chunk.map(() => '?').join(',');
    const sql = `
      SELECT i.* FROM indexnow_submissions i
      INNER JOIN (
        SELECT url, MAX(submitted_at) AS latest_at
        FROM indexnow_submissions
        WHERE url IN (${placeholders})
        GROUP BY url
      ) m ON m.url = i.url AND m.latest_at = i.submitted_at`;
    return db.prepare(sql).bind(...chunk);
  });
  const results = await db.batch<IndexNowSubmissionRow>(statements);
  for (const result of results) {
    for (const row of result.results || []) out.set(row.url, row);
  }
  return out;
}

/**
 * Returns the latest successful submission for each URL. A newer failed
 * attempt must not hide the last success when Search Pulse compares content
 * lastmod with the version already announced to search engines.
 */
export async function readLatestSuccessfulPerUrl(
  env: Env,
  urls: string[],
): Promise<Map<string, IndexNowSubmissionRow>> {
  const out = new Map<string, IndexNowSubmissionRow>();
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || urls.length === 0) return out;
  await ensureTable(db);
  const slice = urls.slice(0, 500);
  const statements = chunkIndexNowAuditUrls(slice).map((chunk) => {
    const placeholders = chunk.map(() => '?').join(',');
    const sql = `
      SELECT i.* FROM indexnow_submissions i
      INNER JOIN (
        SELECT url, MAX(submitted_at) AS latest_at
        FROM indexnow_submissions
        WHERE upstream_ok = 1 AND url IN (${placeholders})
        GROUP BY url
      ) m ON m.url = i.url AND m.latest_at = i.submitted_at
      WHERE i.upstream_ok = 1`;
    return db.prepare(sql).bind(...chunk);
  });
  const results = await db.batch<IndexNowSubmissionRow>(statements);
  for (const result of results) {
    for (const row of result.results || []) out.set(row.url, row);
  }
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
