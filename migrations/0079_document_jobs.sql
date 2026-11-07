-- Additive document queue. No payment/entitlement table is touched.
-- Rollback: disable DOCUMENT_JOBS_ENABLED and the worker; retain this ledger.
-- Payload and PDF retention: 24h; terminal metadata retained at most 7 days by maintenance.
CREATE TABLE IF NOT EXISTS document_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('presentation_pdf','proposal_pdf')),
  status TEXT NOT NULL CHECK(status IN ('queued','running','ready','failed','cancelled','expired')),
  payload_json TEXT,
  payload_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  lease_token TEXT,
  lease_expires_at INTEGER,
  artifact_key TEXT,
  artifact_bytes INTEGER,
  error_code TEXT CHECK(error_code IS NULL OR error_code IN ('render_failed','invalid_payload','timeout')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(org_id,subject,idempotency_key)
);
CREATE INDEX IF NOT EXISTS document_jobs_subject ON document_jobs(org_id,subject,created_at);
CREATE INDEX IF NOT EXISTS document_jobs_queue ON document_jobs(org_id,status,lease_expires_at,created_at);
CREATE INDEX IF NOT EXISTS document_jobs_expiry ON document_jobs(org_id,expires_at);
CREATE INDEX IF NOT EXISTS document_jobs_daily ON document_jobs(created_at);
