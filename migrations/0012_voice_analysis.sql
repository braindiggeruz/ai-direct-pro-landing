-- GPTBot Tahlil P0: timestamped transcript segments, one-time consent,
-- and owner-scoped 24-hour content-analysis reports.

ALTER TABLE telegram_items ADD COLUMN transcript_segments_json TEXT;
ALTER TABLE user_preferences ADD COLUMN analysis_consent_version TEXT;
ALTER TABLE user_preferences ADD COLUMN analysis_consent_at TEXT;

CREATE TABLE IF NOT EXISTS analysis_reports (
  id                         TEXT PRIMARY KEY,
  telegram_user_id           INTEGER NOT NULL,
  item_id                    TEXT NOT NULL UNIQUE,
  language                   TEXT NOT NULL,
  summary                    TEXT NOT NULL,
  transcript_with_timestamps TEXT,
  claims_json                TEXT NOT NULL,
  contradictions_json        TEXT NOT NULL,
  hedging_json               TEXT NOT NULL,
  questions_json             TEXT NOT NULL,
  quality_assessment         TEXT NOT NULL,
  provider                   TEXT NOT NULL,
  model                      TEXT,
  prompt_version             TEXT NOT NULL,
  latency_ms                 INTEGER NOT NULL DEFAULT 0,
  created_at                 TEXT NOT NULL,
  expires_at                 TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analysis_user_expiry
  ON analysis_reports (telegram_user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_analysis_expiry
  ON analysis_reports (expires_at);
