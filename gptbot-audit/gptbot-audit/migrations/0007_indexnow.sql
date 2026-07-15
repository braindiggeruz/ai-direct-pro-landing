-- D1 migration: IndexNow submission audit log.
--
-- Purpose: every operator-triggered POST to api.indexnow.org is recorded
-- here so the bulk submission UI can show "last submitted at" badges and
-- the operator can see history without grepping Cloudflare logs.
--
-- Stays append-only — we never UPDATE rows, we only INSERT. A scheduled
-- vacuum job (out of scope here) can prune rows older than 365 d.

CREATE TABLE IF NOT EXISTS indexnow_submissions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at    TEXT    NOT NULL,                   -- ISO 8601
  actor_email     TEXT    NOT NULL,                   -- admin who clicked
  url             TEXT    NOT NULL,                   -- one row per URL
  upstream_status INTEGER NOT NULL,                   -- HTTP from api.indexnow.org
  upstream_ok     INTEGER NOT NULL DEFAULT 0,         -- 1 when 200/202
  batch_id        TEXT    NOT NULL,                   -- groups URLs in same submit
  duration_ms     INTEGER NOT NULL DEFAULT 0,         -- wall clock
  error           TEXT                                -- short message when not ok
);

CREATE INDEX IF NOT EXISTS idx_indexnow_url            ON indexnow_submissions(url);
CREATE INDEX IF NOT EXISTS idx_indexnow_submitted_at   ON indexnow_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_indexnow_batch_id       ON indexnow_submissions(batch_id);
