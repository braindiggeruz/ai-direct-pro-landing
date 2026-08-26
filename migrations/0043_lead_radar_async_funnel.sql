-- Lead Radar P0/P1: honest funnel telemetry, request idempotency, and an
-- outbox-style, resumable job state machine. The migration is additive:
-- existing searches/leads remain readable and are marked terminal by default.
-- New nullable dispatch fields keep the current application write-compatible
-- while allowing the scheduler to become the only business retry authority.

ALTER TABLE lead_radar_searches ADD COLUMN phase TEXT NOT NULL DEFAULT 'completed'
  CHECK (phase IN ('queued', 'discovering', 'enriching', 'finalizing', 'completed'));
ALTER TABLE lead_radar_searches ADD COLUMN raw_discovered_count INTEGER NOT NULL DEFAULT 0
  CHECK (raw_discovered_count >= 0);
ALTER TABLE lead_radar_searches ADD COLUMN processed_count INTEGER NOT NULL DEFAULT 0
  CHECK (processed_count >= 0);
ALTER TABLE lead_radar_searches ADD COLUMN pending_count INTEGER NOT NULL DEFAULT 0
  CHECK (pending_count >= 0);
ALTER TABLE lead_radar_searches ADD COLUMN website_count INTEGER NOT NULL DEFAULT 0
  CHECK (website_count >= 0);
ALTER TABLE lead_radar_searches ADD COLUMN enriched_count INTEGER NOT NULL DEFAULT 0
  CHECK (enriched_count >= 0);
ALTER TABLE lead_radar_searches ADD COLUMN decision_maker_count INTEGER NOT NULL DEFAULT 0
  CHECK (decision_maker_count >= 0);
ALTER TABLE lead_radar_searches ADD COLUMN company_telegram_count INTEGER NOT NULL DEFAULT 0
  CHECK (company_telegram_count >= 0);
ALTER TABLE lead_radar_searches ADD COLUMN personal_telegram_count INTEGER NOT NULL DEFAULT 0
  CHECK (personal_telegram_count >= 0);
ALTER TABLE lead_radar_searches ADD COLUMN excluded_count INTEGER NOT NULL DEFAULT 0
  CHECK (excluded_count >= 0);
ALTER TABLE lead_radar_searches ADD COLUMN warnings_json TEXT NOT NULL DEFAULT '[]'
  CHECK (
    length(warnings_json) <= 32768
    AND json_valid(warnings_json)
    AND json_type(warnings_json) = 'array'
  );
ALTER TABLE lead_radar_searches ADD COLUMN request_key TEXT
  CHECK (request_key IS NULL OR length(request_key) BETWEEN 1 AND 160);
ALTER TABLE lead_radar_searches ADD COLUMN request_fingerprint TEXT
  CHECK (
    (request_key IS NULL AND request_fingerprint IS NULL)
    OR (
      request_key IS NOT NULL
      AND length(request_fingerprint) = 64
      AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
    )
  );
ALTER TABLE lead_radar_searches ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0
  CHECK (state_version >= 0);

ALTER TABLE lead_radar_companies ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'terminal'
  CHECK (enrichment_status IN ('pending', 'queued', 'processing', 'enriched', 'terminal'));
ALTER TABLE lead_radar_companies ADD COLUMN enrichment_reason TEXT
  CHECK (
    enrichment_reason IS NULL
    OR enrichment_reason IN (
      'no_website', 'enriched', 'no_relevant_evidence', 'robots_blocked',
      'http_blocked', 'source_timeout', 'source_unavailable', 'invalid_website',
      'payload_invalid', 'retry_exhausted', 'suppressed'
    )
  );
ALTER TABLE lead_radar_companies ADD COLUMN enrichment_attempts INTEGER NOT NULL DEFAULT 0
  CHECK (enrichment_attempts BETWEEN 0 AND 5);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_radar_searches_org_id
  ON lead_radar_searches (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_radar_companies_org_id
  ON lead_radar_companies (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_radar_searches_org_request_key
  ON lead_radar_searches (org_id, request_key)
  WHERE request_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS lead_radar_jobs (
  id TEXT PRIMARY KEY
    CHECK (
      length(id) = 38
      AND substr(id, 1, 6) = 'lrjob_'
      AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'
    ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  search_id TEXT NOT NULL CHECK (length(search_id) BETWEEN 1 AND 80),
  company_id TEXT CHECK (company_id IS NULL OR length(company_id) BETWEEN 1 AND 80),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 260),
  stage TEXT NOT NULL CHECK (stage IN ('discovery', 'enrichment')),
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'retry_wait', 'completed', 'dead_letter')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0 AND attempt_count <= max_attempts),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  available_at TEXT NOT NULL CHECK (length(available_at) BETWEEN 1 AND 64),
  lease_owner TEXT CHECK (lease_owner IS NULL OR length(lease_owner) BETWEEN 1 AND 160),
  lease_expires_at TEXT CHECK (
    lease_expires_at IS NULL OR length(lease_expires_at) BETWEEN 1 AND 64
  ),
  lease_generation INTEGER NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  last_error_code TEXT CHECK (
    last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 80
  ),
  dispatch_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (dispatch_status IN ('pending', 'sent')),
  dispatch_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (dispatch_attempt_count >= 0),
  next_dispatch_at TEXT CHECK (
    next_dispatch_at IS NULL OR length(next_dispatch_at) BETWEEN 1 AND 64
  ),
  dispatch_lease_owner TEXT CHECK (
    dispatch_lease_owner IS NULL OR length(dispatch_lease_owner) BETWEEN 1 AND 160
  ),
  dispatch_lease_expires_at TEXT CHECK (
    dispatch_lease_expires_at IS NULL OR length(dispatch_lease_expires_at) BETWEEN 1 AND 64
  ),
  dispatched_at TEXT CHECK (dispatched_at IS NULL OR length(dispatched_at) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64),
  completed_at TEXT CHECK (completed_at IS NULL OR length(completed_at) BETWEEN 1 AND 64),
  CHECK (
    (stage = 'discovery' AND company_id IS NULL)
    OR (stage = 'enrichment' AND company_id IS NOT NULL)
  ),
  CHECK (
    (status = 'running' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'running' AND lease_owner IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK (
    (dispatch_lease_owner IS NULL AND dispatch_lease_expires_at IS NULL)
    OR (dispatch_lease_owner IS NOT NULL AND dispatch_lease_expires_at IS NOT NULL)
  ),
  CHECK (
    (status IN ('completed', 'dead_letter') AND completed_at IS NOT NULL)
    OR (status NOT IN ('completed', 'dead_letter') AND completed_at IS NULL)
  ),
  CHECK (dispatch_status = 'pending' OR dispatched_at IS NOT NULL),
  UNIQUE (org_id, idempotency_key),
  FOREIGN KEY (org_id, search_id)
    REFERENCES lead_radar_searches(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, company_id)
    REFERENCES lead_radar_companies(org_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_radar_jobs_org_id
  ON lead_radar_jobs (org_id, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_jobs_due
  ON lead_radar_jobs (status, stage, available_at, org_id, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_jobs_search
  ON lead_radar_jobs (org_id, search_id, stage, status, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_jobs_dispatch_due
  ON lead_radar_jobs (
    dispatch_status, stage, next_dispatch_at, org_id, dispatch_attempt_count, id
  );
CREATE INDEX IF NOT EXISTS idx_lead_radar_jobs_dispatch_lease
  ON lead_radar_jobs (dispatch_status, dispatch_lease_expires_at, org_id, id);

CREATE TABLE IF NOT EXISTS lead_radar_job_effects (
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  job_id TEXT NOT NULL CHECK (length(job_id) = 38),
  effect_key TEXT NOT NULL CHECK (length(effect_key) BETWEEN 1 AND 160),
  payload_digest TEXT NOT NULL CHECK (
    length(payload_digest) = 64
    AND payload_digest NOT GLOB '*[^0-9a-f]*'
  ),
  applied_at TEXT NOT NULL CHECK (length(applied_at) BETWEEN 1 AND 64),
  PRIMARY KEY (org_id, job_id, effect_key),
  FOREIGN KEY (org_id, job_id)
    REFERENCES lead_radar_jobs(org_id, id) ON DELETE CASCADE
);
