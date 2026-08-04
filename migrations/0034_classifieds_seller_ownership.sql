-- Bormi classifieds foundation: seller profiles and explicit listing ownership.
--
-- `sotuvchi_products` remains the canonical listing record. SQLite cannot make
-- its store scope nullable with ALTER COLUMN, so this is the one unavoidable
-- table rebuild in the classifieds foundation. Existing rows retain store
-- scope and every existing content/commerce column byte-for-byte.
--
-- Production precondition: fresh export + isolated restore, FK=0, ledger=0033.
-- Compensating rollback after a private row exists: stop the feature, unpublish
-- through the domain and roll code back. Do not narrow the table and destroy a
-- valid private listing.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE seller_profiles (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 120),
  identity_id TEXT NOT NULL UNIQUE
    REFERENCES identities(id) ON DELETE RESTRICT,
  public_display_name TEXT NOT NULL
    CHECK (length(public_display_name) BETWEEN 2 AND 80),
  seller_type TEXT NOT NULL CHECK (seller_type IN ('private', 'store')),
  verification_state TEXT NOT NULL CHECK (verification_state IN (
    'unverified', 'identity_verified', 'store_verified'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'active', 'restricted', 'suspended', 'closed'
  )),
  moderation_state TEXT NOT NULL CHECK (moderation_state IN (
    'clear', 'under_review', 'restricted', 'blocked'
  )),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_operation_key TEXT NOT NULL CHECK (length(last_operation_key) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64)
);

-- D1 keeps a deferred violation counter when a referenced parent is dropped,
-- even if a same-named valid parent exists before commit. Preserve and remove
-- the five product-reference tables first, then recreate their exact schema
-- after the parent. These backups exist only inside this atomic migration.
CREATE TABLE sotuvchi_order_items_classifieds_backup AS
  SELECT * FROM sotuvchi_order_items;
CREATE TABLE sotuvchi_inventory_classifieds_backup AS
  SELECT * FROM sotuvchi_inventory;
CREATE TABLE sotuvchi_inventory_moves_classifieds_backup AS
  SELECT * FROM sotuvchi_inventory_moves;
CREATE TABLE sotuvchi_buyer_presentations_classifieds_backup AS
  SELECT * FROM sotuvchi_buyer_presentations;
CREATE TABLE sotuvchi_buyer_comparisons_classifieds_backup AS
  SELECT * FROM sotuvchi_buyer_comparisons;

DROP TABLE sotuvchi_order_items;
DROP TABLE sotuvchi_inventory;
DROP TABLE sotuvchi_inventory_moves;
DROP TABLE sotuvchi_buyer_presentations;
DROP TABLE sotuvchi_buyer_comparisons;

CREATE TABLE sotuvchi_products_classifieds_new (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  store_id TEXT,
  listing_scope TEXT NOT NULL DEFAULT 'store'
    CHECK (listing_scope IN ('store', 'private')),
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
    CHECK (json_valid(media_refs_json) AND json_type(media_refs_json) = 'array'),
  search_terms_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(search_terms_json) AND json_type(search_terms_json) = 'array'),
  specifications_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(specifications_json) AND json_type(specifications_json) = 'array'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_operation_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (listing_scope = 'store' AND org_id IS NOT NULL AND store_id IS NOT NULL)
    OR
    (listing_scope = 'private' AND org_id IS NULL AND store_id IS NULL
      AND category_id IS NULL AND sku IS NULL)
  ),
  UNIQUE (store_id, sku),
  UNIQUE (org_id, store_id, id),
  UNIQUE (id, listing_scope),
  FOREIGN KEY (org_id, store_id)
    REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, store_id, category_id)
    REFERENCES sotuvchi_categories(org_id, store_id, id) ON DELETE RESTRICT
);

INSERT INTO sotuvchi_products_classifieds_new (
  id, org_id, store_id, listing_scope, category_id, sku, name, normalized_name,
  description, price_minor, currency, availability, status, media_refs_json,
  search_terms_json, specifications_json, version, last_operation_key,
  created_at, updated_at
)
SELECT
  id, org_id, store_id, 'store', category_id, sku, name, normalized_name,
  description, price_minor, currency, availability, status, media_refs_json,
  search_terms_json, specifications_json, version, last_operation_key,
  created_at, updated_at
FROM sotuvchi_products;

DROP TABLE sotuvchi_products;
ALTER TABLE sotuvchi_products_classifieds_new RENAME TO sotuvchi_products;

CREATE INDEX idx_sotuvchi_products_store_status_name
  ON sotuvchi_products (store_id, status, normalized_name, id);
CREATE INDEX idx_sotuvchi_products_store_category
  ON sotuvchi_products (store_id, category_id, status, id);
CREATE INDEX idx_sotuvchi_products_org_store
  ON sotuvchi_products (org_id, store_id);
CREATE INDEX idx_sotuvchi_products_scope_status_updated
  ON sotuvchi_products (listing_scope, status, updated_at DESC, id);

CREATE TABLE sotuvchi_order_items (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL
    CHECK (unit_price_minor >= 0 AND unit_price_minor <= 1000000000000),
  currency TEXT NOT NULL CHECK (currency = 'UZS'),
  availability_snapshot TEXT NOT NULL
    CHECK (availability_snapshot IN ('available', 'preorder')),
  quantity INTEGER CHECK (quantity IS NULL OR (quantity >= 1 AND quantity <= 99)),
  line_total_minor INTEGER CHECK (
    line_total_minor IS NULL
    OR (line_total_minor >= 0 AND line_total_minor <= 99000000000000)
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id, order_id)
    REFERENCES sotuvchi_orders(org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, store_id, product_id)
    REFERENCES sotuvchi_products(org_id, store_id, id) ON DELETE RESTRICT
);

CREATE TABLE sotuvchi_inventory (
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  on_hand INTEGER NOT NULL CHECK (on_hand >= 0 AND on_hand <= 1000000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, store_id, product_id),
  FOREIGN KEY (org_id, store_id)
    REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, store_id, product_id)
    REFERENCES sotuvchi_products(org_id, store_id, id) ON DELETE RESTRICT
);

CREATE TABLE sotuvchi_inventory_moves (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  order_id TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'initial', 'manual_adjustment', 'order_confirmed'
  )),
  delta INTEGER NOT NULL CHECK (delta >= -1000000 AND delta <= 1000000),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0 AND balance_after <= 1000000),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, store_id, idempotency_key),
  FOREIGN KEY (org_id, store_id, product_id)
    REFERENCES sotuvchi_products(org_id, store_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, order_id)
    REFERENCES sotuvchi_orders(org_id, id) ON DELETE RESTRICT
);

CREATE TABLE sotuvchi_buyer_presentations (
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  relevance_score INTEGER NOT NULL CHECK (relevance_score BETWEEN 0 AND 4000),
  matched_requirement_count INTEGER NOT NULL
    CHECK (matched_requirement_count BETWEEN 0 AND 12),
  missing_requirement_count INTEGER NOT NULL
    CHECK (missing_requirement_count BETWEEN 0 AND 12),
  relevance_reason TEXT NOT NULL CHECK (relevance_reason IN (
    'catalog_listing', 'category_match', 'exact_name', 'exact_alias',
    'name_prefix', 'all_tokens', 'partial_tokens', 'exact_product_reference'
  )),
  request_key TEXT NOT NULL,
  presented_at TEXT NOT NULL,
  PRIMARY KEY (session_id, product_id),
  FOREIGN KEY (session_id)
    REFERENCES sotuvchi_storefront_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, store_id, product_id)
    REFERENCES sotuvchi_products(org_id, store_id, id) ON DELETE RESTRICT
);

CREATE TABLE sotuvchi_buyer_comparisons (
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 1000000),
  relevance_score INTEGER NOT NULL CHECK (relevance_score BETWEEN 0 AND 4000),
  matched_requirement_count INTEGER NOT NULL
    CHECK (matched_requirement_count BETWEEN 0 AND 12),
  missing_requirement_count INTEGER NOT NULL
    CHECK (missing_requirement_count BETWEEN 0 AND 12),
  relevance_reason TEXT NOT NULL CHECK (relevance_reason IN (
    'catalog_listing', 'category_match', 'exact_name', 'exact_alias',
    'name_prefix', 'all_tokens', 'partial_tokens', 'exact_product_reference'
  )),
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, product_id),
  UNIQUE (session_id, position),
  FOREIGN KEY (session_id)
    REFERENCES sotuvchi_storefront_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, store_id, product_id)
    REFERENCES sotuvchi_products(org_id, store_id, id) ON DELETE RESTRICT
);

INSERT INTO sotuvchi_order_items SELECT * FROM sotuvchi_order_items_classifieds_backup;
INSERT INTO sotuvchi_inventory SELECT * FROM sotuvchi_inventory_classifieds_backup;
INSERT INTO sotuvchi_inventory_moves SELECT * FROM sotuvchi_inventory_moves_classifieds_backup;
INSERT INTO sotuvchi_buyer_presentations
  SELECT * FROM sotuvchi_buyer_presentations_classifieds_backup;
INSERT INTO sotuvchi_buyer_comparisons
  SELECT * FROM sotuvchi_buyer_comparisons_classifieds_backup;

DROP TABLE sotuvchi_order_items_classifieds_backup;
DROP TABLE sotuvchi_inventory_classifieds_backup;
DROP TABLE sotuvchi_inventory_moves_classifieds_backup;
DROP TABLE sotuvchi_buyer_presentations_classifieds_backup;
DROP TABLE sotuvchi_buyer_comparisons_classifieds_backup;

CREATE UNIQUE INDEX idx_sotuvchi_order_items_single
  ON sotuvchi_order_items (order_id);
CREATE INDEX idx_sotuvchi_order_items_product
  ON sotuvchi_order_items (org_id, store_id, product_id);
CREATE INDEX idx_sotuvchi_inventory_store
  ON sotuvchi_inventory (org_id, store_id, product_id);
CREATE UNIQUE INDEX idx_sotuvchi_inventory_moves_order_type
  ON sotuvchi_inventory_moves (order_id, type) WHERE order_id IS NOT NULL;
CREATE INDEX idx_sotuvchi_inventory_moves_product
  ON sotuvchi_inventory_moves (org_id, store_id, product_id, created_at, id);
CREATE INDEX idx_sotuvchi_buyer_presentations_scope
  ON sotuvchi_buyer_presentations (session_id, org_id, store_id, presented_at);
CREATE INDEX idx_sotuvchi_buyer_comparisons_scope
  ON sotuvchi_buyer_comparisons (session_id, org_id, store_id, position);

CREATE TABLE listing_ownerships (
  product_id TEXT NOT NULL,
  seller_profile_id TEXT NOT NULL
    REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  ownership_type TEXT NOT NULL CHECK (ownership_type IN ('private', 'store')),
  org_id TEXT,
  store_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'released')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_operation_key TEXT NOT NULL CHECK (length(last_operation_key) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64),
  PRIMARY KEY (product_id, seller_profile_id),
  CHECK (
    (ownership_type = 'private' AND org_id IS NULL AND store_id IS NULL)
    OR
    (ownership_type = 'store' AND org_id IS NOT NULL AND store_id IS NOT NULL)
  ),
  FOREIGN KEY (product_id, ownership_type)
    REFERENCES sotuvchi_products(id, listing_scope) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, store_id, product_id)
    REFERENCES sotuvchi_products(org_id, store_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_listing_ownership_one_active
  ON listing_ownerships (product_id) WHERE status = 'active';
CREATE INDEX idx_listing_ownership_seller_active
  ON listing_ownerships (seller_profile_id, status, updated_at DESC, product_id);
CREATE INDEX idx_seller_profiles_status_type
  ON seller_profiles (status, seller_type, updated_at DESC, id);

CREATE TABLE market_listing_operations (
  seller_profile_id TEXT NOT NULL
    REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  operation TEXT NOT NULL CHECK (operation IN (
    'private.submit', 'private.update', 'private.unpublish', 'private.archive'
  )),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  target_product_id TEXT NOT NULL
    REFERENCES sotuvchi_products(id) ON DELETE RESTRICT,
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  PRIMARY KEY (seller_profile_id, idempotency_key)
);

CREATE INDEX idx_market_listing_operations_target
  ON market_listing_operations (target_product_id, created_at);
