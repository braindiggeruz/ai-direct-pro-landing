-- GPT Chat lead durability and idempotency.
-- Rollback: application may be rolled back safely; retain the additive column,
-- index and outbox rows as delivery/audit evidence. Do not drop lead data.

ALTER TABLE gpt_leads ADD COLUMN request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gpt_leads_request
  ON gpt_leads (request_id);

CREATE TABLE IF NOT EXISTS gpt_lead_outbox (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'ru',
  share_conversation INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  delivered_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gpt_lead_outbox_pending
  ON gpt_lead_outbox (status, available_at, created_at);
