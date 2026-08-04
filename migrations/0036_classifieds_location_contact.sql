-- Bormi classifieds foundation: structured beta location and disclosure policy.
-- No coordinates, home address, Telegram id or phone value is stored here.

CREATE TABLE market_regions (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 2 AND 80),
  country_code TEXT NOT NULL CHECK (country_code = 'UZ'),
  name_ru TEXT NOT NULL CHECK (length(name_ru) BETWEEN 2 AND 80),
  name_uz TEXT NOT NULL CHECK (length(name_uz) BETWEEN 2 AND 80),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 1000000),
  UNIQUE (country_code, id)
);

CREATE TABLE market_districts (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 2 AND 80),
  region_id TEXT NOT NULL REFERENCES market_regions(id) ON DELETE RESTRICT,
  name_ru TEXT NOT NULL CHECK (length(name_ru) BETWEEN 2 AND 80),
  name_uz TEXT NOT NULL CHECK (length(name_uz) BETWEEN 2 AND 80),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 1000000),
  UNIQUE (region_id, id)
);

CREATE TABLE market_listing_locations (
  product_id TEXT PRIMARY KEY
    REFERENCES sotuvchi_products(id) ON DELETE RESTRICT,
  country_code TEXT NOT NULL CHECK (country_code = 'UZ'),
  region_id TEXT NOT NULL,
  district_id TEXT NOT NULL,
  locality_text TEXT CHECK (
    locality_text IS NULL OR length(locality_text) BETWEEN 1 AND 120
  ),
  approximate_only INTEGER NOT NULL DEFAULT 1 CHECK (approximate_only = 1),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_operation_key TEXT NOT NULL CHECK (length(last_operation_key) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64),
  FOREIGN KEY (country_code, region_id)
    REFERENCES market_regions(country_code, id) ON DELETE RESTRICT,
  FOREIGN KEY (region_id, district_id)
    REFERENCES market_districts(region_id, id) ON DELETE RESTRICT
);

CREATE TABLE market_listing_channels (
  product_id TEXT PRIMARY KEY,
  listing_scope TEXT NOT NULL CHECK (listing_scope IN ('store', 'private')),
  contact_mode TEXT NOT NULL CHECK (contact_mode IN (
    'in_app', 'telegram_relay', 'phone_optional'
  )),
  phone_disclosure TEXT NOT NULL CHECK (phone_disclosure IN (
    'not_available', 'after_buyer_action'
  )),
  commerce_mode TEXT NOT NULL CHECK (commerce_mode IN ('inquiry', 'store_order')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_operation_key TEXT NOT NULL CHECK (length(last_operation_key) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64),
  CHECK (
    (contact_mode = 'phone_optional' AND phone_disclosure = 'after_buyer_action')
    OR
    (contact_mode <> 'phone_optional' AND phone_disclosure = 'not_available')
  ),
  CHECK (listing_scope = 'store' OR commerce_mode = 'inquiry'),
  FOREIGN KEY (product_id, listing_scope)
    REFERENCES sotuvchi_products(id, listing_scope) ON DELETE RESTRICT
);

CREATE INDEX idx_market_districts_region
  ON market_districts (region_id, status, sort_order, id);
CREATE INDEX idx_market_listing_location_discovery
  ON market_listing_locations (country_code, region_id, district_id, product_id);
CREATE INDEX idx_market_listing_channels_discovery
  ON market_listing_channels (commerce_mode, contact_mode, product_id);

INSERT INTO market_regions (
  id, country_code, name_ru, name_uz, status, sort_order
) VALUES (
  'uz-tashkent-city', 'UZ', 'Ташкент', 'Toshkent shahri', 'active', 10
);

INSERT INTO market_districts (
  id, region_id, name_ru, name_uz, status, sort_order
) VALUES
  ('uz-tashkent-almazar', 'uz-tashkent-city', 'Алмазарский район', 'Olmazor tumani', 'active', 10),
  ('uz-tashkent-bektemir', 'uz-tashkent-city', 'Бектемирский район', 'Bektemir tumani', 'active', 20),
  ('uz-tashkent-chilanzar', 'uz-tashkent-city', 'Чиланзарский район', 'Chilonzor tumani', 'active', 30),
  ('uz-tashkent-mirabad', 'uz-tashkent-city', 'Мирабадский район', 'Mirobod tumani', 'active', 40),
  ('uz-tashkent-mirzo-ulugbek', 'uz-tashkent-city', 'Мирзо-Улугбекский район', 'Mirzo Ulug‘bek tumani', 'active', 50),
  ('uz-tashkent-sergeli', 'uz-tashkent-city', 'Сергелийский район', 'Sergeli tumani', 'active', 60),
  ('uz-tashkent-shaykhantahur', 'uz-tashkent-city', 'Шайхантахурский район', 'Shayxontohur tumani', 'active', 70),
  ('uz-tashkent-uchtepa', 'uz-tashkent-city', 'Учтепинский район', 'Uchtepa tumani', 'active', 80),
  ('uz-tashkent-yakkasaray', 'uz-tashkent-city', 'Яккасарайский район', 'Yakkasaroy tumani', 'active', 90),
  ('uz-tashkent-yangihayot', 'uz-tashkent-city', 'Янгихаётский район', 'Yangihayot tumani', 'active', 100),
  ('uz-tashkent-yashnabad', 'uz-tashkent-city', 'Яшнабадский район', 'Yashnobod tumani', 'active', 110),
  ('uz-tashkent-yunusabad', 'uz-tashkent-city', 'Юнусабадский район', 'Yunusobod tumani', 'active', 120);
