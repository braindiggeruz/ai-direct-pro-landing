-- AI-chat runtime telemetry, the free tier's daily spend on the paid model and
-- the limit-hit counter (paid-chat plan WP-04, release R1). Additive only.
-- Runtime parity is tested (tests/gpt-chat-runtime-schema.test.ts):
-- CHAT_RUNTIME_COLUMNS and CHAT_RUNTIME_DDL in functions/lib/gpt-chat/billing-schema.ts,
-- CHAT_TIME_INDEXES in functions/lib/gpt-chat/schema.ts.
-- No text is stored: gpt_turn_reservations gains the settlement of each turn
-- (outcome, charged, model, finish_reason, cancel_reason, timings, token counts,
-- cost in micro-USD, attempts); gpt_limit_hits.subject is the same pseudonymous
-- key the quota uses, never an IP address or a message.
-- Order: apply this migration BEFORE deploying the code, previews included (the
-- preview shares the production D1). The runtime bootstrap adds the same columns
-- when they are missing; once it has run, the ALTERs below fail with
-- "duplicate column name" and the migration cannot be recorded. If that happens,
-- apply only the CREATE statements below by hand and record the file in
-- d1_migrations; do not drop anything.
-- Rollback: roll the application back; the columns, tables and indexes stay.
-- The previous code neither reads nor writes them. No DROP.
ALTER TABLE gpt_turn_reservations ADD COLUMN outcome TEXT;
ALTER TABLE gpt_turn_reservations ADD COLUMN charged INTEGER;
ALTER TABLE gpt_turn_reservations ADD COLUMN model TEXT;
ALTER TABLE gpt_turn_reservations ADD COLUMN finish_reason TEXT;
ALTER TABLE gpt_turn_reservations ADD COLUMN cancel_reason TEXT;
ALTER TABLE gpt_turn_reservations ADD COLUMN ttft_ms INTEGER;
ALTER TABLE gpt_turn_reservations ADD COLUMN total_ms INTEGER;
ALTER TABLE gpt_turn_reservations ADD COLUMN tokens_in INTEGER;
ALTER TABLE gpt_turn_reservations ADD COLUMN tokens_out INTEGER;
ALTER TABLE gpt_turn_reservations ADD COLUMN reasoning_tokens INTEGER;
ALTER TABLE gpt_turn_reservations ADD COLUMN cost_micro_usd INTEGER;
ALTER TABLE gpt_turn_reservations ADD COLUMN attempts INTEGER;

CREATE TABLE IF NOT EXISTS gpt_model_spend (org_id TEXT NOT NULL, day TEXT NOT NULL, bucket TEXT NOT NULL, reserved_micro INTEGER NOT NULL DEFAULT 0, actual_micro INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(org_id,day,bucket));

CREATE TABLE IF NOT EXISTS gpt_limit_hits (org_id TEXT NOT NULL, day TEXT NOT NULL, reason TEXT NOT NULL, tier TEXT NOT NULL, subject TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, first_at INTEGER NOT NULL, PRIMARY KEY(org_id,day,reason,subject));

CREATE INDEX IF NOT EXISTS idx_gpt_turn_created ON gpt_turn_reservations(org_id,created_at);

CREATE INDEX IF NOT EXISTS idx_gpt_service_alerts_pending ON gpt_service_alerts(org_id,delivered_at,created_at);

CREATE INDEX IF NOT EXISTS idx_gpt_messages_created ON gpt_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_gpt_sessions_created ON gpt_sessions(created_at);
