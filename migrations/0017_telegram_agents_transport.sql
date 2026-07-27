-- P1.4 Telegram Agents transport deduplication.
-- Additive only. It is isolated from legacy telegram_updates used by Javob.
--
-- Rollback (only before the endpoint is enabled):
--   DROP INDEX IF EXISTS idx_telegram_agent_updates_status;
--   DROP TABLE IF EXISTS telegram_agent_updates;

CREATE TABLE IF NOT EXISTS telegram_agent_updates (
  idempotency_key TEXT PRIMARY KEY,
  bot_username TEXT NOT NULL,
  update_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'failed')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (bot_username, update_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_agent_updates_status
  ON telegram_agent_updates (status, created_at);
