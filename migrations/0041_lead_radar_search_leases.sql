-- Lead Radar reliability controls. Additive and rollback-safe: an application
-- rollback ignores these columns/tables while preserving owner data.

CREATE TABLE IF NOT EXISTS lead_radar_search_leases (
  org_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  active_until TEXT NOT NULL,
  next_allowed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE lead_radar_companies ADD COLUMN domain TEXT;
ALTER TABLE lead_radar_companies ADD COLUMN phone_digits TEXT;
ALTER TABLE lead_radar_companies ADD COLUMN name_city_key TEXT;

UPDATE lead_radar_companies SET
  domain = CASE WHEN canonical_key LIKE 'domain:%' THEN substr(canonical_key, 8) ELSE NULL END,
  phone_digits = CASE WHEN canonical_key LIKE 'phone:%' THEN substr(canonical_key, 7) ELSE NULL END
WHERE domain IS NULL AND phone_digits IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_radar_companies_domain
  ON lead_radar_companies (org_id, domain);
CREATE INDEX IF NOT EXISTS idx_lead_radar_companies_phone
  ON lead_radar_companies (org_id, phone_digits);
CREATE INDEX IF NOT EXISTS idx_lead_radar_companies_name_city
  ON lead_radar_companies (org_id, name_city_key);

CREATE TABLE IF NOT EXISTS lead_radar_geocode_cache (
  cache_key TEXT PRIMARY KEY,
  bounds_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_radar_source_throttles (
  source_key TEXT PRIMARY KEY,
  next_allowed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_radar_suppressions (
  org_id TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  domain TEXT,
  phone_digits TEXT,
  name_city_key TEXT,
  suppressed_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'do_not_contact',
  PRIMARY KEY (org_id, canonical_key)
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_suppressions_domain
  ON lead_radar_suppressions (org_id, domain);
CREATE INDEX IF NOT EXISTS idx_lead_radar_suppressions_phone
  ON lead_radar_suppressions (org_id, phone_digits);
CREATE INDEX IF NOT EXISTS idx_lead_radar_suppressions_name_city
  ON lead_radar_suppressions (org_id, name_city_key);

INSERT OR IGNORE INTO lead_radar_suppressions (
  org_id, canonical_key, domain, phone_digits, name_city_key, suppressed_at, reason
)
SELECT org_id, canonical_key, domain, phone_digits, name_city_key, updated_at, 'do_not_contact'
FROM lead_radar_companies
WHERE suppressed = 1;
