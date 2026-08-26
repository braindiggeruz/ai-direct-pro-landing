-- Evidence-first Telegram classification and named decision-maker records.
-- Additive and backward compatible: existing rows deserialize to null / [].
-- Rollback: rebuild lead_radar_companies without these two JSON columns; no
-- existing search, company, evidence or suppression rows need to be removed.
-- Historical aggregate counters are preserved. Their legacy semantics are
-- exposed by the application as company Telegram references, never relabelled
-- as verified personal decision-maker contacts.

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
