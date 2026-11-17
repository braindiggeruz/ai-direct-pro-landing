-- The AI readings of the natal chart and compatibility pages (owner's order of
-- 17.11.2026; functions/lib/natal/store.ts, functions/api/natal/reading.ts).
-- Additive only: two new tables and an index, nothing existing changes.
-- natal_readings keeps a generated reading under the browser's trial identity
-- (a hash, as gpt_trial_usage keys it) and the chart's fingerprint (a hash of
-- its signs, houses and aspects), so reopening shows the same text. No birth
-- date, time, place or name is stored: the browser never sends them.
-- natal_free holds each identity's one free natal reading and one free pair
-- reading, with the number of corrections made to it.
-- Runtime parity: NATAL_DDL in functions/lib/natal/store.ts (tested in
-- tests/natal-reading.test.ts). Every statement is IF NOT EXISTS.
-- Order: apply before deploying the code (a preview shares the production D1).
-- Rollback: roll the application back; the tables stay and nothing reads them.
CREATE TABLE IF NOT EXISTS natal_readings (
  org_id TEXT NOT NULL, id TEXT NOT NULL, identity_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('natal','pair')), fingerprint TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN ('uz','ru')), sections TEXT NOT NULL, model TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, id),
  UNIQUE (org_id, identity_key, fingerprint, locale)
);
CREATE TABLE IF NOT EXISTS natal_free (
  org_id TEXT NOT NULL, identity_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('natal','pair')),
  fingerprint TEXT NOT NULL, edits INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, identity_key, kind)
);
CREATE INDEX IF NOT EXISTS idx_natal_readings_created ON natal_readings (org_id, created_at);
