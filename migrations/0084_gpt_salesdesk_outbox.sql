-- Private frozen CRM projection, independent of existing Telegram delivery.
-- Rollback: revert application code only; retain this additive table/index and
-- all queued/receipt rows for reconciliation. Never DROP or resend completed rows.
CREATE TABLE IF NOT EXISTS gpt_salesdesk_outbox (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  delivered_at TEXT,
  crm_operation_id TEXT,
  crm_lead_id TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gpt_salesdesk_outbox_due ON gpt_salesdesk_outbox(status,available_at,created_at);
