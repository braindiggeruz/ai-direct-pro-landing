-- Optional additive provenance. This grants neither sender approval nor consent.
CREATE TABLE IF NOT EXISTS lead_radar_contact_enrichments (
  org_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  identity_digest TEXT NOT NULL CHECK (length(identity_digest)=64),
  status TEXT NOT NULL CHECK (status IN ('complete','limited','unavailable')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 80),
  sources_json TEXT NOT NULL CHECK (json_valid(sources_json) AND json_type(sources_json)='array' AND length(sources_json)<=80000),
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (org_id,company_id),
  FOREIGN KEY (org_id,company_id) REFERENCES lead_radar_companies(org_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lr_contact_enrichments_expiry ON lead_radar_contact_enrichments(expires_at);
