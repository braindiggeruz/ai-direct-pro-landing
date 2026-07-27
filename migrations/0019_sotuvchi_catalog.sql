-- GPTBot Agents P2.2: tenant-aware Sotuvchi catalog.
--
-- Additive only. No cart, order, inventory reservation or payment data is
-- created. Runtime bootstrap in functions/agents/sotuvchi/catalog/schema.ts
-- must remain structurally equivalent.
--
-- Rollback notes (only while Sotuvchi catalog traffic is disabled):
--   DROP INDEX IF EXISTS idx_sotuvchi_storefront_sessions_store;
--   DROP INDEX IF EXISTS idx_sotuvchi_catalog_operations_created;
--   DROP INDEX IF EXISTS idx_sotuvchi_products_org_store;
--   DROP INDEX IF EXISTS idx_sotuvchi_products_store_category;
--   DROP INDEX IF EXISTS idx_sotuvchi_products_store_status_name;
--   DROP INDEX IF EXISTS idx_sotuvchi_categories_org_store;
--   DROP INDEX IF EXISTS idx_sotuvchi_categories_store_status_sort;
--   DROP TABLE IF EXISTS sotuvchi_storefront_sessions;
--   DROP TABLE IF EXISTS sotuvchi_catalog_operations;
--   DROP TABLE IF EXISTS sotuvchi_products;
--   DROP TABLE IF EXISTS sotuvchi_categories;
--   DROP INDEX IF EXISTS idx_sotuvchi_stores_org_id;
-- Git rollback does not remove D1 objects. This migration is not applied by
-- the P2.2 code change.

CREATE UNIQUE INDEX IF NOT EXISTS idx_sotuvchi_stores_org_id
  ON sotuvchi_stores (org_id, id);

CREATE TABLE IF NOT EXISTS sotuvchi_categories (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  sort_order INTEGER NOT NULL
    CHECK (sort_order >= 0 AND sort_order <= 1000000),
  last_operation_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (store_id, slug),
  UNIQUE (org_id, store_id, id),
  FOREIGN KEY (org_id, store_id)
    REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sotuvchi_products (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  category_id TEXT,
  sku TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description TEXT,
  price_minor INTEGER NOT NULL
    CHECK (price_minor >= 0 AND price_minor <= 1000000000000),
  currency TEXT NOT NULL CHECK (currency = 'UZS'),
  availability TEXT NOT NULL
    CHECK (availability IN ('available', 'unavailable', 'preorder')),
  status TEXT NOT NULL
    CHECK (status IN ('draft', 'published', 'archived')),
  media_refs_json TEXT NOT NULL
    CHECK (json_valid(media_refs_json)
      AND json_type(media_refs_json) = 'array'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_operation_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (store_id, sku),
  UNIQUE (org_id, store_id, id),
  FOREIGN KEY (org_id, store_id)
    REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, store_id, category_id)
    REFERENCES sotuvchi_categories(org_id, store_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sotuvchi_catalog_operations (
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  target_id TEXT NOT NULL,
  result_version INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, store_id, idempotency_key),
  FOREIGN KEY (org_id, store_id)
    REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sotuvchi_storefront_sessions (
  id TEXT PRIMARY KEY,
  bot_username TEXT NOT NULL,
  identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (bot_username, identity_id),
  FOREIGN KEY (org_id, store_id)
    REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sotuvchi_categories_store_status_sort
  ON sotuvchi_categories (store_id, status, sort_order, name, id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_categories_org_store
  ON sotuvchi_categories (org_id, store_id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_products_store_status_name
  ON sotuvchi_products (store_id, status, normalized_name, id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_products_store_category
  ON sotuvchi_products (store_id, category_id, status, id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_products_org_store
  ON sotuvchi_products (org_id, store_id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_catalog_operations_created
  ON sotuvchi_catalog_operations (org_id, store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_storefront_sessions_store
  ON sotuvchi_storefront_sessions (org_id, store_id, status);
