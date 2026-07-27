-- GPTBot Agents P2.4: Sotuvchi single-product checkout and order placement.
--
-- Additive only. One order carries exactly one catalog item (enforced by
-- idx_sotuvchi_order_items_single). No cart, no inventory reservation, no
-- stock decrement, no payment and no seller order management data is created.
-- Runtime bootstrap in functions/agents/sotuvchi/checkout/schema.ts must remain
-- structurally equivalent.
--
-- Buyer PII (name, phone, delivery address) lives only in sotuvchi_orders and
-- never in workflow payloads, operation rows, events or logs.
--
-- Rollback notes (only while Sotuvchi checkout traffic is disabled):
--   DROP INDEX IF EXISTS idx_sotuvchi_order_operations_created;
--   DROP INDEX IF EXISTS idx_sotuvchi_order_items_product;
--   DROP INDEX IF EXISTS idx_sotuvchi_order_items_single;
--   DROP INDEX IF EXISTS idx_sotuvchi_orders_active_draft;
--   DROP INDEX IF EXISTS idx_sotuvchi_orders_store_status;
--   DROP TABLE IF EXISTS sotuvchi_order_operations;
--   DROP TABLE IF EXISTS sotuvchi_order_items;
--   DROP TABLE IF EXISTS sotuvchi_orders;
-- Shared store, catalog, session, workflow and tenant tables are never dropped.
-- Git rollback does not remove D1 objects. This migration is not applied by the
-- P2.4 code change.

CREATE TABLE IF NOT EXISTS sotuvchi_orders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  buyer_session_id TEXT NOT NULL
    REFERENCES sotuvchi_storefront_sessions(id) ON DELETE RESTRICT,
  workflow_instance_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'placed', 'cancelled')),
  buyer_name TEXT,
  buyer_phone TEXT,
  buyer_address TEXT,
  total_minor INTEGER
    CHECK (total_minor IS NULL
      OR (total_minor >= 0 AND total_minor <= 99000000000000)),
  currency TEXT NOT NULL CHECK (currency = 'UZS'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_operation_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  placed_at TEXT,
  UNIQUE (org_id, store_id, order_number),
  UNIQUE (org_id, id),
  CHECK (status <> 'placed' OR (
    buyer_name IS NOT NULL
    AND buyer_phone IS NOT NULL
    AND buyer_address IS NOT NULL
    AND total_minor IS NOT NULL
    AND placed_at IS NOT NULL
  )),
  FOREIGN KEY (org_id, store_id)
    REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, workflow_instance_id)
    REFERENCES workflow_instances(org_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sotuvchi_order_items (
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
  line_total_minor INTEGER
    CHECK (line_total_minor IS NULL
      OR (line_total_minor >= 0 AND line_total_minor <= 99000000000000)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id, order_id)
    REFERENCES sotuvchi_orders(org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, store_id, product_id)
    REFERENCES sotuvchi_products(org_id, store_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sotuvchi_order_operations (
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

CREATE INDEX IF NOT EXISTS idx_sotuvchi_orders_store_status
  ON sotuvchi_orders (org_id, store_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sotuvchi_orders_active_draft
  ON sotuvchi_orders (buyer_session_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS idx_sotuvchi_order_items_single
  ON sotuvchi_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_order_items_product
  ON sotuvchi_order_items (org_id, store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_order_operations_created
  ON sotuvchi_order_operations (org_id, store_id, created_at);
