import { ensureSotuvchiCheckoutSchema } from '../checkout/schema';

/**
 * Durable notification outbox shared by two writers: P2.4 order placement
 * records the seller intent inside the placement batch, and P2.5 seller
 * transitions record the buyer intents inside their own batch. The row holds
 * no payload at all — a renderer re-reads the trusted order — so notification
 * storage can never leak buyer contact data.
 *
 * It lives outside both modules so neither has to import the other.
 */
export const SOTUVCHI_NOTIFICATIONS_DDL = [
  `CREATE TABLE IF NOT EXISTS sotuvchi_notifications (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_notifications_pending
    ON sotuvchi_notifications (org_id, store_id, status, created_at, id)`,
] as const;

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureSotuvchiNotificationsSchema(
  db: D1Database,
): Promise<void> {
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      await ensureSotuvchiCheckoutSchema(db);
      for (const statement of SOTUVCHI_NOTIFICATIONS_DDL) {
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
