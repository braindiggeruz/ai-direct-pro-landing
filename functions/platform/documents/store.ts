import { DOCUMENT_LEASE_MS, DOCUMENT_MAX_ATTEMPTS, DOCUMENT_TTL_MS, DocumentError, type DocumentCreate, type DocumentFailure, type DocumentJob } from './types';

export const DOCUMENT_DDL = [
  `CREATE TABLE IF NOT EXISTS document_jobs (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, subject TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('presentation_pdf','proposal_pdf')),
    status TEXT NOT NULL CHECK(status IN ('queued','running','ready','failed','cancelled','expired')),
    payload_json TEXT, payload_hash TEXT NOT NULL, idempotency_key TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
    lease_token TEXT, lease_expires_at INTEGER, artifact_key TEXT, artifact_bytes INTEGER,
    error_code TEXT CHECK(error_code IS NULL OR error_code IN ('render_failed','invalid_payload','timeout')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    UNIQUE(org_id,subject,idempotency_key)
  )`,
  'CREATE INDEX IF NOT EXISTS document_jobs_subject ON document_jobs(org_id,subject,created_at)',
  'CREATE INDEX IF NOT EXISTS document_jobs_queue ON document_jobs(org_id,status,lease_expires_at,created_at)',
  'CREATE INDEX IF NOT EXISTS document_jobs_expiry ON document_jobs(org_id,expires_at)',
  'CREATE INDEX IF NOT EXISTS document_jobs_daily ON document_jobs(created_at)',
] as const;

/** All SQL stays here; org is the first argument even on worker operations. */
export class DocumentStore {
  constructor(readonly db: D1Database) {}
  async create(orgId: string, subject: string, key: string, hash: string, input: DocumentCreate, now: number, subjectLimit: number, globalLimit: number): Promise<{ job: DocumentJob; replay: boolean }> {
    const earlier = await this.byKey(orgId, subject, key);
    if (earlier) {
      if (earlier.payload_hash !== hash) throw new DocumentError('idempotency_conflict', 409);
      return { job: earlier, replay: true };
    }
    const id = `doc_${crypto.randomUUID().replaceAll('-', '')}`;
    const day = Math.floor(now / DOCUMENT_TTL_MS) * DOCUMENT_TTL_MS;
    // One SQLite statement serializes global + per-subject budget reservation with insertion.
    // The global count intentionally spans orgs; rows are never deleted during their quota day.
    await this.db.prepare(`INSERT OR IGNORE INTO document_jobs
      (id,org_id,subject,type,status,payload_json,payload_hash,idempotency_key,created_at,updated_at,expires_at)
      SELECT ?,?,?,?,'queued',?,?,?,?,?,?
      WHERE (SELECT COUNT(*) FROM document_jobs WHERE org_id=? AND subject=? AND created_at>=?) < ?
      AND (SELECT COUNT(*) FROM document_jobs WHERE created_at>=?) < ?`)
      .bind(id, orgId, subject, input.type, JSON.stringify(input.payload), hash, key, now, now, now + DOCUMENT_TTL_MS,
        orgId, subject, day, subjectLimit, day, globalLimit).run();
    const job = await this.byKey(orgId, subject, key);
    if (!job) throw new DocumentError('quota_exceeded', 429);
    if (job.payload_hash !== hash) throw new DocumentError('idempotency_conflict', 409);
    return { job, replay: job.id !== id };
  }
  byKey(orgId: string, subject: string, key: string): Promise<DocumentJob | null> {
    return this.db.prepare('SELECT * FROM document_jobs WHERE org_id=? AND subject=? AND idempotency_key=?').bind(orgId, subject, key).first<DocumentJob>();
  }
  get(orgId: string, subject: string, id: string): Promise<DocumentJob | null> {
    return this.db.prepare('SELECT * FROM document_jobs WHERE org_id=? AND subject=? AND id=?').bind(orgId, subject, id).first<DocumentJob>();
  }
  async list(orgId: string, subject: string): Promise<DocumentJob[]> {
    return (await this.db.prepare('SELECT * FROM document_jobs WHERE org_id=? AND subject=? ORDER BY created_at DESC,id DESC LIMIT 30').bind(orgId, subject).all<DocumentJob>()).results;
  }
  workerGet(orgId: string, id: string): Promise<DocumentJob | null> {
    return this.db.prepare('SELECT * FROM document_jobs WHERE org_id=? AND id=?').bind(orgId, id).first<DocumentJob>();
  }
  async claim(orgId: string, now: number): Promise<DocumentJob | null> {
    // Mark exhausted crashed jobs terminal without returning their private payloads.
    await this.db.prepare(`UPDATE document_jobs SET status='failed',error_code='timeout',payload_json=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=?
      WHERE org_id=? AND id IN (SELECT id FROM document_jobs WHERE org_id=? AND status='running' AND lease_expires_at<=? AND attempts>=? LIMIT 50)`)
      .bind(now, orgId, orgId, now, DOCUMENT_MAX_ATTEMPTS).run();
    const token = crypto.randomUUID();
    return this.db.prepare(`UPDATE document_jobs SET status='running',attempts=attempts+1,lease_token=?,lease_expires_at=?,updated_at=?,error_code=NULL
      WHERE org_id=? AND id=(SELECT id FROM document_jobs WHERE org_id=? AND expires_at>?
        AND attempts<? AND (status='queued' OR (status='running' AND lease_expires_at<=?)) ORDER BY created_at,id LIMIT 1)
      AND expires_at>? AND attempts<? AND (status='queued' OR (status='running' AND lease_expires_at<=?)) RETURNING *`)
      .bind(token, now + DOCUMENT_LEASE_MS, now, orgId, orgId, now, DOCUMENT_MAX_ATTEMPTS, now, now, DOCUMENT_MAX_ATTEMPTS, now).first<DocumentJob>();
  }
  async complete(orgId: string, id: string, token: string, artifactKey: string, bytes: number, now: number): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE document_jobs SET status='ready',artifact_key=?,artifact_bytes=?,payload_json=NULL,lease_expires_at=NULL,updated_at=?
      WHERE org_id=? AND id=? AND status='running' AND lease_token=? AND lease_expires_at>? AND expires_at>?`)
      .bind(artifactKey, bytes, now, orgId, id, token, now, now).run();
    return result.meta.changes === 1;
  }
  async fail(orgId: string, id: string, token: string, reason: DocumentFailure, now: number): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE document_jobs SET
      status=CASE WHEN attempts<? AND ?!='invalid_payload' THEN 'queued' ELSE 'failed' END,
      payload_json=CASE WHEN attempts<? AND ?!='invalid_payload' THEN payload_json ELSE NULL END,
      error_code=?,lease_token=NULL,lease_expires_at=NULL,updated_at=?
      WHERE org_id=? AND id=? AND status='running' AND lease_token=? AND lease_expires_at>? AND expires_at>?`)
      .bind(DOCUMENT_MAX_ATTEMPTS, reason, DOCUMENT_MAX_ATTEMPTS, reason, reason, now, orgId, id, token, now, now).run();
    return result.meta.changes === 1;
  }
  async cancel(orgId: string, subject: string, job: DocumentJob, now: number): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE document_jobs SET status='cancelled',payload_json=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=?
      WHERE org_id=? AND subject=? AND id=? AND status IN ('queued','running') AND COALESCE(lease_token,'')=? AND expires_at>?`)
      .bind(now, orgId, subject, job.id, job.lease_token ?? '', now).run();
    return result.meta.changes === 1;
  }
  async expired(orgId: string, now: number): Promise<DocumentJob[]> {
    return (await this.db.prepare(`SELECT * FROM document_jobs WHERE org_id=? AND expires_at<=?
      AND (status!='expired' OR artifact_key IS NOT NULL OR payload_json IS NOT NULL) ORDER BY expires_at LIMIT 50`)
      .bind(orgId, now).all<DocumentJob>()).results;
  }
  async expire(orgId: string, id: string, now: number): Promise<void> {
    await this.db.prepare(`UPDATE document_jobs SET status='expired',payload_json=NULL,artifact_key=NULL,artifact_bytes=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=?
      WHERE org_id=? AND id=? AND expires_at<=?`).bind(now, orgId, id, now).run();
  }
  async prune(orgId: string, now: number): Promise<void> {
    await this.db.prepare(`DELETE FROM document_jobs WHERE org_id=? AND id IN (SELECT id FROM document_jobs WHERE org_id=? AND status='expired' AND artifact_key IS NULL AND created_at<? LIMIT 50)`)
      .bind(orgId, orgId, now - 7 * DOCUMENT_TTL_MS).run();
  }
}
