-- GPTBot Agents P0.3: PII-guarded durable platform event outbox.
--
-- Rollback notes: before platform consumers depend on this outbox, drop the
-- three idx_events_* indexes and then DROP TABLE events. This migration is
-- additive and does not alter or replace telegram_events/gpt_events.

CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  org_id          TEXT,
  agent_id        TEXT,
  type            TEXT NOT NULL,
  aggregate_ref   TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  occurred_at     TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  processed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_org_created
  ON events (org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_type_created
  ON events (type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_unprocessed
  ON events (processed_at, created_at);
