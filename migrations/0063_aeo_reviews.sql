-- AEO review decisions. Additive; rollback disables the UI and preserves review history.
CREATE TABLE IF NOT EXISTS aeo_reviews (
  org_id TEXT NOT NULL, run_id TEXT NOT NULL, finding_id TEXT NOT NULL,
  revision INTEGER NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  review_json TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(org_id,run_id,finding_id)
);
