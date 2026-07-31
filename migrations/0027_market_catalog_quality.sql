-- R1.1 grounded search metadata.
-- Additive only: existing products keep empty verified specs and aliases.

ALTER TABLE sotuvchi_products
  ADD COLUMN search_terms_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(search_terms_json)
      AND json_type(search_terms_json) = 'array');

ALTER TABLE sotuvchi_products
  ADD COLUMN specifications_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(specifications_json)
      AND json_type(specifications_json) = 'array');
