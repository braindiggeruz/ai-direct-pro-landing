-- D1 migration: SEO Autopilot bridge job tracker.
--
-- Stores one row per Runable → bridge → n8n forward attempt. The bridge
-- returns a job_id synchronously (HTTP 202) and processes the n8n call
-- in the background via ctx.waitUntil. Runable can poll
-- `GET /api/seo-autopilot/jobs/<id>` for the final outcome.
--
-- Lifecycle:
--   pending     ─ row inserted, before forwarding to n8n
--   forwarding  ─ HTTP request to n8n is in-flight
--   normalising ─ n8n responded 200, parsing + validating
--   ingesting   ─ normalised bundle is being stored in ai_drafts
--   completed   ─ draft_id is set, end state (success)
--   failed      ─ error_message is set, end state (failure)

CREATE TABLE IF NOT EXISTS seo_autopilot_jobs (
  id                 TEXT PRIMARY KEY,        -- job_<22 hex>
  request_id         TEXT,                    -- echoed from x-request-id header (or generated)
  status             TEXT NOT NULL DEFAULT 'pending',

  -- n8n side --------------------------------------------------------------
  n8n_url            TEXT NOT NULL,           -- which webhook we forwarded to
  n8n_status         INTEGER,                 -- HTTP code from n8n
  n8n_execution_id   TEXT,                    -- execution_id from n8n response (when present)
  generation_status  TEXT,                    -- echoed `status` from n8n response
  validation_status  TEXT,                    -- 'passed' | 'failed' | NULL
  validation_passed  INTEGER,                 -- 0/1 mirror for fast querying
  validation_issue_count INTEGER,

  -- Inbox side ------------------------------------------------------------
  draft_id           TEXT,                    -- ai_drafts.id once ingested
  bundle_id          TEXT,                    -- ai_drafts.bundle_id
  admin_url          TEXT,                    -- /admin-tools/ai-drafts/<draft_id>
  ingestion_success  INTEGER NOT NULL DEFAULT 0,
  deduplicated       INTEGER NOT NULL DEFAULT 0, -- 1 if existing draft was reused

  -- Errors ----------------------------------------------------------------
  error_code         TEXT,                    -- machine-readable: 'n8n_timeout' | 'n8n_http_4xx' | ...
  error_message      TEXT,                    -- short, safe-to-display
  error_detail_json  TEXT,                    -- structured error (never holds secrets)

  -- Timing ----------------------------------------------------------------
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  finished_at        TEXT,
  duration_ms        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_seo_autopilot_jobs_status     ON seo_autopilot_jobs(status);
CREATE INDEX IF NOT EXISTS idx_seo_autopilot_jobs_created_at ON seo_autopilot_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_seo_autopilot_jobs_request_id ON seo_autopilot_jobs(request_id);
CREATE INDEX IF NOT EXISTS idx_seo_autopilot_jobs_draft_id   ON seo_autopilot_jobs(draft_id);
