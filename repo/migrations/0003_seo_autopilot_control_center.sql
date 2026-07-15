-- D1 migration: GPTBot Control Center for SEO Autopilot.
--
-- Removes the dependency on the external Runable trigger by:
--   1. Adding `source` + `requested_by` columns to seo_autopilot_jobs so we
--      can tell admin runs apart from scheduled runs (Runable is gone).
--   2. Adding `system_settings` (single-row key/value store) to persist the
--      schedule mode (disabled | weekly | twice_weekly) and any future
--      runtime-tunable configuration.

ALTER TABLE seo_autopilot_jobs ADD COLUMN source TEXT NOT NULL DEFAULT 'external';
ALTER TABLE seo_autopilot_jobs ADD COLUMN requested_by TEXT;

CREATE INDEX IF NOT EXISTS idx_seo_autopilot_jobs_source ON seo_autopilot_jobs(source);

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);
