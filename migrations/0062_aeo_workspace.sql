-- AEO internal workspace. Additive; rollback: disable route/UI, retain evidence.
-- Do not DROP the table during rollback. Same DDL as platform/aeo/schema.ts.
CREATE TABLE IF NOT EXISTS aeo_runs (
  org_id TEXT NOT NULL, id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('analysis','measurement')),
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
  result_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(org_id,id), UNIQUE(org_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_aeo_runs_org_date ON aeo_runs(org_id,created_at DESC);
