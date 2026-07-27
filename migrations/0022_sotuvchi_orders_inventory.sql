-- GPTBot Agents P2.5: Sotuvchi seller order management and inventory ledger.
--
-- Additive only. P2.4 kept the narrow order status CHECK
-- (draft|placed|cancelled), which SQLite cannot widen in place without a table
-- rebuild. Instead of a risky rebuild this migration adds one additive column
-- `fulfillment_status`; the effective seller lifecycle is the pair
-- (status, fulfillment_status):
--
--   status='draft'                                   -> draft
--   status='placed'    fulfillment_status='none'      -> placed
--   status='placed'    fulfillment_status='confirmed' -> confirmed
--   status='placed'    fulfillment_status='done'      -> done
--   status='cancelled' fulfillment_status='none'      -> cancelled
--
-- A cancelled order always keeps fulfillment_status='none', so a confirmed
-- order can never be cancelled and inventory never needs compensation in P2.5.
-- The invariant is enforced by the conditional SQL of every transition
-- (SQLite cannot add a table-level CHECK to an existing table).
--
-- No payment, refund, partial fulfillment, multi-item, multi-warehouse or
-- variant inventory data is created. Buyer PII stays in sotuvchi_orders only:
-- inventory rows, movements and notification intents never store it.
--
-- Rollback notes (only while Sotuvchi seller traffic is disabled):
--   DROP INDEX IF EXISTS idx_sotuvchi_orders_fulfillment;
--   DROP INDEX IF EXISTS idx_sotuvchi_notifications_pending;
--   DROP INDEX IF EXISTS idx_sotuvchi_inventory_moves_product;
--   DROP INDEX IF EXISTS idx_sotuvchi_inventory_moves_order_type;
--   DROP INDEX IF EXISTS idx_sotuvchi_inventory_store;
--   DROP TABLE IF EXISTS sotuvchi_notifications;
--   DROP TABLE IF EXISTS sotuvchi_inventory_moves;
--   DROP TABLE IF EXISTS sotuvchi_inventory;
-- The additive `fulfillment_status` column is left in place: SQLite column
-- removal requires a separate approved table rebuild change.
-- Git rollback does not remove D1 objects. This migration is not applied by
-- the P2.5 code change.

ALTER TABLE sotuvchi_orders
  ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'none'
    CHECK (fulfillment_status IN ('none', 'confirmed', 'done'));

CREATE TABLE IF NOT EXISTS sotuvchi_inventory (
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

CREATE TABLE IF NOT EXISTS sotuvchi_inventory_moves (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  order_id TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'initial', 'manual_adjustment', 'order_confirmed'
  )),
  delta INTEGER NOT NULL CHECK (delta >= -1000000 AND delta <= 1000000),
  balance_after INTEGER NOT NULL
    CHECK (balance_after >= 0 AND balance_after <= 1000000),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, store_id, idempotency_key),
  FOREIGN KEY (org_id, store_id, product_id)
    REFERENCES sotuvchi_products(org_id, store_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, order_id)
    REFERENCES sotuvchi_orders(org_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sotuvchi_notifications (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('seller', 'buyer')),
  type TEXT NOT NULL CHECK (type IN (
    'order_placed', 'order_confirmed', 'order_cancelled', 'order_done'
  )),
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  idempotency_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0 AND attempt_count <= 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  UNIQUE (org_id, store_id, idempotency_key),
  UNIQUE (order_id, audience, type),
  FOREIGN KEY (org_id, store_id)
    REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, order_id)
    REFERENCES sotuvchi_orders(org_id, id) ON DELETE RESTRICT
);

-- One order may decrement stock at most once: the seller confirm transition is
-- the only writer of an 'order_confirmed' movement.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sotuvchi_inventory_moves_order_type
  ON sotuvchi_inventory_moves (order_id, type) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sotuvchi_inventory_store
  ON sotuvchi_inventory (org_id, store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_inventory_moves_product
  ON sotuvchi_inventory_moves (org_id, store_id, product_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_notifications_pending
  ON sotuvchi_notifications (org_id, store_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_orders_fulfillment
  ON sotuvchi_orders (org_id, store_id, status, fulfillment_status, created_at);
