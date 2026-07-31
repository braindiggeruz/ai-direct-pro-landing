-- GPTBot Market R1.1: privacy-safe Telegram transport telemetry and abuse limits.
--
-- Additive and repeatable. Neither table stores a Telegram user/chat id,
-- message, callback body, profile, IP address, credential or tenant content.
-- Rate-limit scope keys are one-way SHA-256 digests computed by the Worker.
--
-- Rollback notes (only while the R1.1 transport is disabled):
--   DROP INDEX IF EXISTS idx_telegram_agent_rate_limit_notices_created;
--   DROP INDEX IF EXISTS idx_telegram_agent_rate_limits_updated;
--   DROP INDEX IF EXISTS idx_telegram_agent_update_metrics_updated;
--   DROP TABLE IF EXISTS telegram_agent_rate_limit_notices;
--   DROP TABLE IF EXISTS telegram_agent_rate_limits;
--   DROP TABLE IF EXISTS telegram_agent_update_metrics;
-- The existing telegram_agent_updates idempotency ledger is never changed.

CREATE TABLE IF NOT EXISTS telegram_agent_update_metrics (
  idempotency_key TEXT PRIMARY KEY,
  bot_username TEXT NOT NULL
    CHECK (length(bot_username) >= 5 AND length(bot_username) <= 32),
  duplicate_count INTEGER NOT NULL DEFAULT 0
    CHECK (duplicate_count >= 0 AND duplicate_count <= 1000000),
  processing_ms INTEGER
    CHECK (processing_ms IS NULL OR (
      processing_ms >= 0 AND processing_ms <= 86400000
    )),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (idempotency_key)
    REFERENCES telegram_agent_updates(idempotency_key) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_telegram_agent_update_metrics_updated
  ON telegram_agent_update_metrics (updated_at, bot_username);

CREATE TABLE IF NOT EXISTS telegram_agent_rate_limits (
  scope_key TEXT NOT NULL
    CHECK (length(scope_key) = 64),
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
    CHECK (request_count >= 0 AND request_count <= 1000000),
  callback_count INTEGER NOT NULL DEFAULT 0
    CHECK (callback_count >= 0 AND callback_count <= 1000000),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope_key, window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_telegram_agent_rate_limits_updated
  ON telegram_agent_rate_limits (updated_at);

CREATE TABLE IF NOT EXISTS telegram_agent_rate_limit_notices (
  scope_key TEXT NOT NULL
    CHECK (length(scope_key) = 64),
  window_started_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope_key, window_started_at),
  FOREIGN KEY (scope_key, window_started_at)
    REFERENCES telegram_agent_rate_limits(scope_key, window_started_at)
      ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_telegram_agent_rate_limit_notices_created
  ON telegram_agent_rate_limit_notices (created_at);
