-- Optional acquisition-only extension. No sender permissions or runtime DDL.
CREATE TABLE lead_radar_crawler_workers (
  id TEXT PRIMARY KEY,
  -- Lead Radar uses owner-scoped IDs, not the commerce organizations registry.
  org_id TEXT NOT NULL CHECK(length(org_id) BETWEEN 1 AND 80),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  UNIQUE(org_id,id)
);
CREATE INDEX idx_lr_crawler_workers_org ON lead_radar_crawler_workers(org_id,revoked,last_seen_at);

CREATE TABLE lead_radar_crawler_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 160),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  identity_digest TEXT NOT NULL CHECK(length(identity_digest)=64),
  identity_json TEXT NOT NULL CHECK(json_valid(identity_json) AND length(identity_json)<=8000),
  url TEXT NOT NULL CHECK(length(url) BETWEEN 8 AND 2048),
  host TEXT NOT NULL CHECK(length(host) BETWEEN 1 AND 253),
  status TEXT NOT NULL CHECK(status IN ('queued','running','deferred','completed','partial','failed','cancelled')),
  reason TEXT CHECK(reason IS NULL OR length(reason) BETWEEN 1 AND 80),
  available_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 12),
  lease_owner TEXT,
  lease_generation INTEGER NOT NULL DEFAULT 0 CHECK(lease_generation>=0),
  lease_expires_at TEXT,
  deadline_at TEXT,
  resume_urls_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(resume_urls_json) AND json_type(resume_urls_json)='array' AND length(resume_urls_json)<=12000),
  pages_accepted INTEGER NOT NULL DEFAULT 0 CHECK(pages_accepted BETWEEN 0 AND 60),
  contacts_found INTEGER NOT NULL DEFAULT 0 CHECK(contacts_found BETWEEN 0 AND 480),
  UNIQUE(org_id,id),
  UNIQUE(org_id,request_key),
  FOREIGN KEY(org_id,company_id) REFERENCES lead_radar_companies(org_id,id) ON DELETE CASCADE,
  FOREIGN KEY(org_id,lease_owner) REFERENCES lead_radar_crawler_workers(org_id,id)
);
CREATE INDEX idx_lr_crawler_jobs_ready ON lead_radar_crawler_jobs(org_id,status,available_at);
CREATE INDEX idx_lr_crawler_jobs_company ON lead_radar_crawler_jobs(org_id,company_id,created_at);
CREATE INDEX idx_lr_crawler_jobs_host ON lead_radar_crawler_jobs(host,status,lease_expires_at);
CREATE UNIQUE INDEX idx_lr_crawler_jobs_active_company ON lead_radar_crawler_jobs(org_id,company_id)
  WHERE status IN ('queued','running','deferred');

CREATE TABLE lead_radar_crawler_receipts (
  org_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL CHECK(length(receipt_id) BETWEEN 8 AND 80),
  worker_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation>0),
  payload_digest TEXT NOT NULL CHECK(length(payload_digest)=64),
  accepted_at TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK(json_valid(summary_json) AND length(summary_json)<=4000),
  PRIMARY KEY(org_id,job_id,receipt_id),
  UNIQUE(org_id,job_id,generation),
  FOREIGN KEY(org_id,job_id) REFERENCES lead_radar_crawler_jobs(org_id,id) ON DELETE CASCADE,
  FOREIGN KEY(org_id,worker_id) REFERENCES lead_radar_crawler_workers(org_id,id)
);

-- One shared egress may serve several tenants; do not shorten another job's pause.
CREATE TABLE lead_radar_crawler_hosts (
  host TEXT PRIMARY KEY,
  next_allowed_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 80),
  updated_at TEXT NOT NULL
);
