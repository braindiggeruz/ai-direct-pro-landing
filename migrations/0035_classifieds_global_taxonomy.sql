-- Bormi classifieds foundation: one bilingual global taxonomy and condition.
-- Store category trees remain intact and opt in through an explicit mapping.

CREATE TABLE market_global_categories (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 120),
  parent_id TEXT REFERENCES market_global_categories(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 2 AND 80),
  name_ru TEXT NOT NULL CHECK (length(name_ru) BETWEEN 2 AND 80),
  name_uz TEXT NOT NULL CHECK (length(name_uz) BETWEEN 2 AND 80),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 1000000),
  high_risk INTEGER NOT NULL DEFAULT 0 CHECK (high_risk IN (0, 1)),
  allowed_conditions_json TEXT NOT NULL CHECK (
    json_valid(allowed_conditions_json)
    AND json_type(allowed_conditions_json) = 'array'
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64)
);

CREATE TABLE market_store_category_mappings (
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  store_category_id TEXT NOT NULL,
  global_category_id TEXT NOT NULL
    REFERENCES market_global_categories(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64),
  PRIMARY KEY (org_id, store_id, store_category_id),
  FOREIGN KEY (org_id, store_id, store_category_id)
    REFERENCES sotuvchi_categories(org_id, store_id, id) ON DELETE RESTRICT
);

CREATE TABLE market_listing_taxonomy (
  product_id TEXT PRIMARY KEY
    REFERENCES sotuvchi_products(id) ON DELETE RESTRICT,
  global_category_id TEXT NOT NULL
    REFERENCES market_global_categories(id) ON DELETE RESTRICT,
  condition TEXT NOT NULL CHECK (condition IN (
    'new', 'like_new', 'good', 'fair', 'for_parts', 'not_applicable'
  )),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_operation_key TEXT NOT NULL CHECK (length(last_operation_key) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64)
);

CREATE INDEX idx_market_global_categories_parent
  ON market_global_categories (parent_id, status, sort_order, id);
CREATE INDEX idx_market_store_category_mapping_global
  ON market_store_category_mappings (global_category_id, status, store_id);
CREATE INDEX idx_market_listing_taxonomy_discovery
  ON market_listing_taxonomy (global_category_id, condition, product_id);

INSERT INTO market_global_categories (
  id, parent_id, slug, name_ru, name_uz, status, sort_order, high_risk,
  allowed_conditions_json, created_at, updated_at
) VALUES
  ('cat-electronics', NULL, 'electronics', 'Электроника', 'Elektronika', 'active', 10, 0,
    '["new","like_new","good","fair","for_parts"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-home-garden', NULL, 'home-garden', 'Дом и сад', 'Uy va bog‘', 'active', 20, 0,
    '["new","like_new","good","fair","for_parts"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-fashion', NULL, 'fashion', 'Одежда и аксессуары', 'Kiyim va aksessuarlar', 'active', 30, 0,
    '["new","like_new","good","fair"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-kids', NULL, 'kids', 'Детское', 'Bolalar uchun', 'active', 40, 0,
    '["new","like_new","good","fair"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-sport-hobbies', NULL, 'sport-hobbies', 'Спорт и хобби', 'Sport va hobbi', 'active', 50, 0,
    '["new","like_new","good","fair","for_parts"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-vehicles', NULL, 'vehicles', 'Транспорт', 'Transport', 'active', 60, 1,
    '["new","like_new","good","fair","for_parts"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-parts', NULL, 'parts', 'Запчасти и аксессуары', 'Ehtiyot qismlar va aksessuarlar', 'active', 70, 0,
    '["new","like_new","good","fair","for_parts"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-services', NULL, 'services', 'Услуги', 'Xizmatlar', 'active', 80, 1,
    '["not_applicable"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-other', NULL, 'other', 'Другое', 'Boshqa', 'active', 90, 1,
    '["new","like_new","good","fair","for_parts","not_applicable"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
