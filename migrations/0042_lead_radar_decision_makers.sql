-- Evidence-first Telegram classification and named decision-maker records.
-- Additive and backward compatible: existing rows deserialize to null / [].
-- Rollback: rebuild lead_radar_companies without these two JSON columns; no
-- existing search, company, evidence or suppression rows need to be removed.
-- Historical telegram_count values are intentionally reset below because they
-- did not prove a human LPR; they cannot be safely reconstructed on rollback.

ALTER TABLE lead_radar_companies
  ADD COLUMN telegram_contact_json TEXT NOT NULL DEFAULT 'null'
    CHECK (
      length(telegram_contact_json) <= 8192
      AND json_valid(telegram_contact_json)
      AND json_type(telegram_contact_json) IN ('object', 'null')
    );

ALTER TABLE lead_radar_companies
  ADD COLUMN decision_makers_json TEXT NOT NULL DEFAULT '[]'
    CHECK (
      length(decision_makers_json) <= 65536
      AND json_valid(decision_makers_json)
      AND json_type(decision_makers_json) = 'array'
    );

-- Historical rows only knew that a t.me URL existed; they did not prove that
-- it belonged to a named human. Reset the old aggregate instead of relabelling
-- bots or corporate channels as personal decision-maker contacts.
UPDATE lead_radar_searches SET telegram_count = 0;
