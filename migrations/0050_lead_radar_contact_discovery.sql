-- Additive, opt-in contact discovery. No sender authorization is stored here.
CREATE TABLE IF NOT EXISTS lead_radar_candidate_pools (
  org_id TEXT NOT NULL,
  search_id TEXT NOT NULL,
  candidates_json TEXT CHECK (candidates_json IS NULL OR (json_valid(candidates_json) AND json_type(candidates_json) = 'array' AND length(candidates_json) <= 1500000)),
  candidate_count INTEGER NOT NULL CHECK (candidate_count BETWEEN 0 AND 250),
  cursor INTEGER NOT NULL DEFAULT 0 CHECK (cursor BETWEEN 0 AND candidate_count),
  batch_start INTEGER NOT NULL DEFAULT 0 CHECK (batch_start BETWEEN 0 AND cursor),
  batch_job_id TEXT,
  target INTEGER NOT NULL CHECK (target BETWEEN 5 AND 50),
  resolved_count INTEGER NOT NULL DEFAULT 0 CHECK (resolved_count BETWEEN 0 AND 250),
  stop_reason TEXT CHECK (stop_reason IS NULL OR stop_reason IN ('target_reached','sources_exhausted','candidate_limit','time_limit','provider_budget','cancelled')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, search_id),
  FOREIGN KEY (org_id, search_id) REFERENCES lead_radar_searches(org_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lr_candidate_pools_expiry ON lead_radar_candidate_pools(expires_at);

CREATE TABLE IF NOT EXISTS lead_radar_contact_checks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  search_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  candidate_digest TEXT NOT NULL CHECK (length(candidate_digest) = 64),
  proof_digest TEXT NOT NULL CHECK (length(proof_digest) = 64),
  account_digest TEXT NOT NULL CHECK (length(account_digest) = 64),
  status TEXT NOT NULL CHECK (status IN ('pending','resolved','unresolved','unsupported','limited','failed')),
  result_json TEXT CHECK (result_json IS NULL OR (json_valid(result_json) AND length(result_json) <= 8000)),
  reason TEXT,
  attempt_day TEXT NOT NULL,
  attempts_today INTEGER NOT NULL DEFAULT 1 CHECK (attempts_today BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  checked_at TEXT,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, company_id, candidate_digest, proof_digest, account_digest),
  FOREIGN KEY (org_id, company_id) REFERENCES lead_radar_companies(org_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lr_contact_checks_search ON lead_radar_contact_checks(org_id, search_id, status);
CREATE INDEX IF NOT EXISTS idx_lr_contact_checks_expiry ON lead_radar_contact_checks(expires_at);
CREATE INDEX IF NOT EXISTS idx_lr_contact_checks_budget ON lead_radar_contact_checks(org_id, attempt_day);
