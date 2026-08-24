-- Evidence-first Lead Radar. Additive and rollback-safe: application rollback
-- leaves these owner-only tables unused while preserving discovered evidence.

CREATE TABLE IF NOT EXISTS lead_radar_searches (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 80),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  input_json TEXT NOT NULL CHECK (json_valid(input_json) AND json_type(input_json) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('running', 'ready', 'partial', 'failed', 'insufficient_results')),
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  verified_count INTEGER NOT NULL DEFAULT 0 CHECK (verified_count >= 0),
  p1_count INTEGER NOT NULL DEFAULT 0 CHECK (p1_count >= 0),
  p2_count INTEGER NOT NULL DEFAULT 0 CHECK (p2_count >= 0),
  p3_count INTEGER NOT NULL DEFAULT 0 CHECK (p3_count >= 0),
  telegram_count INTEGER NOT NULL DEFAULT 0 CHECK (telegram_count >= 0),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  completed_at TEXT CHECK (completed_at IS NULL OR length(completed_at) BETWEEN 1 AND 64)
);

CREATE TABLE IF NOT EXISTS lead_radar_companies (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 80),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  search_id TEXT NOT NULL REFERENCES lead_radar_searches(id) ON DELETE CASCADE,
  canonical_key TEXT NOT NULL CHECK (length(canonical_key) BETWEEN 1 AND 260),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 240),
  category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 160),
  city TEXT NOT NULL CHECK (length(city) BETWEEN 1 AND 120),
  country TEXT NOT NULL CHECK (length(country) BETWEEN 1 AND 40),
  address TEXT CHECK (address IS NULL OR length(address) <= 500),
  website TEXT CHECK (website IS NULL OR length(website) <= 2048),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 40),
  generic_email TEXT CHECK (generic_email IS NULL OR length(generic_email) <= 254),
  telegram_url TEXT CHECK (telegram_url IS NULL OR length(telegram_url) <= 2048),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  priority TEXT NOT NULL CHECK (priority IN ('P1', 'P2', 'P3')),
  lifecycle TEXT NOT NULL DEFAULT 'new' CHECK (lifecycle IN ('new', 'contacted', 'replied', 'qualified', 'meeting', 'won', 'lost', 'do_not_contact')),
  suppressed INTEGER NOT NULL DEFAULT 0 CHECK (suppressed IN (0, 1)),
  score_components_json TEXT NOT NULL CHECK (json_valid(score_components_json) AND json_type(score_components_json) = 'array'),
  signals_json TEXT NOT NULL CHECK (json_valid(signals_json) AND json_type(signals_json) = 'array'),
  discovered_at TEXT NOT NULL CHECK (length(discovered_at) BETWEEN 1 AND 64),
  last_verified_at TEXT NOT NULL CHECK (length(last_verified_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64),
  UNIQUE (org_id, search_id, canonical_key)
);

CREATE TABLE IF NOT EXISTS lead_radar_evidence (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 80),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  company_id TEXT NOT NULL REFERENCES lead_radar_companies(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL CHECK (length(field_path) BETWEEN 1 AND 160),
  value TEXT NOT NULL CHECK (length(value) BETWEEN 1 AND 4096),
  source_url TEXT NOT NULL CHECK (length(source_url) BETWEEN 1 AND 2048),
  source_type TEXT NOT NULL CHECK (source_type IN ('openstreetmap', 'company_website', 'official_open_data')),
  observed_at TEXT NOT NULL CHECK (length(observed_at) BETWEEN 1 AND 64),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  classification TEXT NOT NULL CHECK (classification IN ('company_data', 'fact', 'model_inference'))
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_searches_org_recent
  ON lead_radar_searches (org_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_companies_search_priority
  ON lead_radar_companies (org_id, search_id, priority, score DESC, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_companies_pipeline
  ON lead_radar_companies (org_id, lifecycle, suppressed, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_evidence_company
  ON lead_radar_evidence (org_id, company_id, field_path, id);
