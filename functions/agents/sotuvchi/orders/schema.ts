import { ensureSotuvchiNotificationsSchema } from '../outbox/schema';
import {
  isRuntimeSchemaVerified,
} from '../../../platform/storage/runtime-schema';

/**
 * P2.5 seller schema: inventory balance and append-only movements, plus the
 * additive order fulfillment column. The notification outbox is bootstrapped
 * by `../outbox/schema` because order placement writes it too. Structural
 * parity with migrations/0022_sotuvchi_orders_inventory.sql is required.
 */
export const SOTUVCHI_ORDERS_DDL = [
  `CREATE TABLE IF NOT EXISTS sotuvchi_inventory (
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
  )`,
  `CREATE TABLE IF NOT EXISTS sotuvchi_inventory_moves (
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
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sotuvchi_inventory_moves_order_type
    ON sotuvchi_inventory_moves (order_id, type) WHERE order_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_inventory_store
    ON sotuvchi_inventory (org_id, store_id, product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_inventory_moves_product
    ON sotuvchi_inventory_moves (org_id, store_id, product_id, created_at, id)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_orders_fulfillment
    ON sotuvchi_orders (org_id, store_id, status, fulfillment_status, created_at)`,
] as const;

/**
 * SQLite cannot widen the P2.4 status CHECK in place, so the seller lifecycle
 * is carried by one additive column. ALTER TABLE has no IF NOT EXISTS for
 * columns; a repeated bootstrap swallows only the duplicate-column error.
 */
export const SOTUVCHI_ORDER_UPGRADES = [
  `ALTER TABLE sotuvchi_orders
     ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'none'
       CHECK (fulfillment_status IN ('none', 'confirmed', 'done'))`,
] as const;

function isDuplicateColumn(error: unknown): boolean {
  return error instanceof Error
    && /duplicate column name/i.test(error.message);
}

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureSotuvchiOrdersSchema(db: D1Database): Promise<void> {
  if (isRuntimeSchemaVerified(db)) return Promise.resolve();
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      await ensureSotuvchiNotificationsSchema(db);
      for (const statement of SOTUVCHI_ORDER_UPGRADES) {
        try {
          await db.prepare(statement).run();
        } catch (error) {
          if (!isDuplicateColumn(error)) throw error;
        }
      }
      for (const statement of SOTUVCHI_ORDERS_DDL) {
        await db.prepare(statement).run();
      }
    })().catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}
