-- Additive: keep the legacy <=50 snapshot for old readers and campaign FKs.
-- A larger RESEARCH selection is not a larger campaign or delivery permission.
ALTER TABLE lead_radar_audiences ADD COLUMN selection_ids_json TEXT
  CHECK (selection_ids_json IS NULL OR (json_valid(selection_ids_json)
    AND json_type(selection_ids_json)='array' AND json_array_length(selection_ids_json)<=500));
ALTER TABLE lead_radar_audiences ADD COLUMN selection_version INTEGER;
