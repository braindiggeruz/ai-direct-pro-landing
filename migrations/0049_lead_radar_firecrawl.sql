-- Optional provider extension. No changes to SEO, sender or existing tables.
-- Keep reservations even after a company/job is deleted: deletion must not refund
-- a billable request. Only short-lived result payloads are purged by maintenance.
CREATE TABLE IF NOT EXISTS lead_radar_firecrawl_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  search_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 2),
  operation TEXT NOT NULL CHECK (operation IN ('search','map','scrape')),
  domain TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits BETWEEN 1 AND 2),
  state TEXT NOT NULL CHECK (state IN ('started','completed','failed','unknown')),
  error_code TEXT,
  retry_at TEXT,
  result_json TEXT CHECK (result_json IS NULL OR (json_valid(result_json) AND length(result_json) <= 100000)),
  result_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, request_key, attempt)
);
CREATE INDEX IF NOT EXISTS idx_lr_firecrawl_day ON lead_radar_firecrawl_requests(created_at, credits);
CREATE INDEX IF NOT EXISTS idx_lr_firecrawl_search ON lead_radar_firecrawl_requests(org_id, search_id, credits);
CREATE INDEX IF NOT EXISTS idx_lr_firecrawl_job ON lead_radar_firecrawl_requests(org_id, job_id, credits);
CREATE INDEX IF NOT EXISTS idx_lr_firecrawl_domain ON lead_radar_firecrawl_requests(org_id, domain, created_at, credits);
CREATE INDEX IF NOT EXISTS idx_lr_firecrawl_result_expiry ON lead_radar_firecrawl_requests(result_expires_at) WHERE result_json IS NOT NULL;
CREATE TABLE IF NOT EXISTS lead_radar_firecrawl_control (
  id TEXT PRIMARY KEY CHECK (id = 'account'),
  error_code TEXT NOT NULL,
  blocked_until TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lead_radar_firecrawl_reports (
  org_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  search_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('shadow','fallback')),
  status TEXT NOT NULL,
  pages INTEGER NOT NULL DEFAULT 0,
  contacts INTEGER NOT NULL DEFAULT 0,
  direct_contacts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_lr_firecrawl_reports_search ON lead_radar_firecrawl_reports(org_id, search_id, updated_at);
