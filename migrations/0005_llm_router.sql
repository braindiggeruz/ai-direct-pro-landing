-- D1 migration: multi-provider LLM router infrastructure.
--
-- Adds the three append-only tables the router needs:
--   * llm_usage              — append-only telemetry of every LLM call
--   * llm_provider_health    — per-provider/model circuit-breaker state
--   * llm_idempotency        — short-TTL cache of finished call results
--
-- Does NOT touch any existing migration. Backward-compatible with
-- production: the router code creates these tables on demand via
-- CREATE TABLE IF NOT EXISTS so this migration can roll out at any time
-- without coordinated deployment.
--
-- Also extends `seo_autopilot_jobs` with two columns so the admin UI can
-- show which provider/model finally produced the draft (instead of
-- always reading `n8n_status`).

CREATE TABLE IF NOT EXISTS llm_usage (
  id                  TEXT PRIMARY KEY,
  created_at_ms       INTEGER NOT NULL,
  feature             TEXT NOT NULL,         -- ru_article | uz_article | translate | optimizer | retarget | judge | json_repair
  provider            TEXT NOT NULL,         -- gemini | mistral | groq | cerebras | openrouter
  model               TEXT NOT NULL,         -- wire model id
  status              TEXT NOT NULL,         -- 'ok' | 'error'
  error_class         TEXT,                  -- LlmErrorClass enum or NULL on success
  duration_ms         INTEGER NOT NULL,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  fallback_used       INTEGER NOT NULL DEFAULT 0,
  idempotency_key     TEXT,
  attempts_json       TEXT
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created_at ON llm_usage(created_at_ms);
CREATE INDEX IF NOT EXISTS idx_llm_usage_feature    ON llm_usage(feature);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider   ON llm_usage(provider);

CREATE TABLE IF NOT EXISTS llm_provider_health (
  key                 TEXT PRIMARY KEY,      -- "<provider>|<model>"
  provider            TEXT NOT NULL,
  model               TEXT NOT NULL,
  state               TEXT NOT NULL,         -- 'closed' | 'open' | 'half_open'
  open_until_ms       INTEGER NOT NULL DEFAULT 0,
  failures_60s        INTEGER NOT NULL DEFAULT 0,
  last_error_class    TEXT,
  last_failure_at_ms  INTEGER,
  updated_at_ms       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_idempotency (
  key             TEXT PRIMARY KEY,
  feature         TEXT NOT NULL,
  result_json     TEXT NOT NULL,
  created_at_ms   INTEGER NOT NULL,
  expires_at_ms   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_llm_idempotency_expires ON llm_idempotency(expires_at_ms);

-- Extend the existing autopilot jobs table with provider/model so the
-- admin UI can show "Created via Mistral medium" instead of the
-- misleading n8n_status=200 for direct-AI runs.
-- ALTER TABLE is idempotent-tolerant via CATCH-ALL in the runner: if these
-- columns already exist (re-run), D1 returns "duplicate column" and the
-- migration runner should ignore it. If your runner is strict, run these
-- ALTERs once and remove them from this file before next deploy.
ALTER TABLE seo_autopilot_jobs ADD COLUMN llm_provider TEXT;
ALTER TABLE seo_autopilot_jobs ADD COLUMN llm_model    TEXT;
ALTER TABLE seo_autopilot_jobs ADD COLUMN llm_fallback_used INTEGER NOT NULL DEFAULT 0;
