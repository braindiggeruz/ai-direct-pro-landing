import { ensureChannelAddressSchema } from '../../../platform/channels';
import { ensureSotuvchiOrdersSchema } from '../orders/schema';

/**
 * P2.6 handoff schema. Question and reply are the only free-form columns in
 * the whole agent, they are bounded by CHECK and cleared when the retention
 * window closes; no transcript, attachment or profile column exists.
 *
 * Delivery state lives on the handoff aggregate itself rather than in a second
 * outbox table: the conditional UPDATE that stamps `seller_notified_at` or
 * `buyer_delivered_at` is the claim, so an intent is never stored twice.
 */
export const SOTUVCHI_HANDOFF_DDL = [
  `CREATE TABLE IF NOT EXISTS sotuvchi_handoffs (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    buyer_identity_id TEXT NOT NULL
      REFERENCES identities(id) ON DELETE RESTRICT,
    buyer_session_id TEXT NOT NULL
      REFERENCES sotuvchi_storefront_sessions(id) ON DELETE RESTRICT,
    seller_identity_id TEXT,
    status TEXT NOT NULL
      CHECK (status IN ('open', 'answered', 'closed', 'expired')),
    reason TEXT NOT NULL CHECK (reason IN (
      'unknown_intent', 'buyer_requested_human', 'catalog_no_result',
      'order_question', 'seller_initiated'
    )),
    question_text TEXT
      CHECK (question_text IS NULL OR length(question_text) <= 1000),
    reply_text TEXT
      CHECK (reply_text IS NULL OR length(reply_text) <= 1000),
    content_cleared_at TEXT,
    seller_notified_at TEXT,
    seller_notify_attempts INTEGER NOT NULL DEFAULT 0
      CHECK (seller_notify_attempts >= 0 AND seller_notify_attempts <= 100),
    buyer_delivered_at TEXT,
    buyer_delivery_attempts INTEGER NOT NULL DEFAULT 0
      CHECK (buyer_delivery_attempts >= 0 AND buyer_delivery_attempts <= 100),
    last_operation_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    answered_at TEXT,
    closed_at TEXT,
    expires_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    UNIQUE (org_id, id),
    CHECK (status <> 'answered' OR (answered_at IS NOT NULL)),
    CHECK (status <> 'closed' OR closed_at IS NOT NULL),
    FOREIGN KEY (org_id, store_id)
      REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS sotuvchi_handoff_operations (
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
  )`,
  `CREATE TABLE IF NOT EXISTS sotuvchi_seller_reply_sessions (
    org_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    seller_identity_id TEXT NOT NULL
      REFERENCES identities(id) ON DELETE RESTRICT,
    handoff_id TEXT NOT NULL,
    workflow_instance_id TEXT NOT NULL,
    state TEXT NOT NULL
      CHECK (state IN ('awaiting_reply', 'completed', 'cancelled')),
    request_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (org_id, store_id, seller_identity_id),
    FOREIGN KEY (org_id, handoff_id)
      REFERENCES sotuvchi_handoffs(org_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (org_id, workflow_instance_id)
      REFERENCES workflow_instances(org_id, id) ON DELETE RESTRICT
  )`,
  // One live conversation per buyer session: a buyer cannot flood the seller
  // queue, and a repeated question resolves to the handoff already sent.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sotuvchi_handoffs_active
    ON sotuvchi_handoffs (buyer_session_id)
    WHERE status IN ('open', 'answered')`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_handoffs_queue
    ON sotuvchi_handoffs (org_id, store_id, status, created_at, id)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_handoffs_expiry
    ON sotuvchi_handoffs (org_id, store_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_handoff_operations_created
    ON sotuvchi_handoff_operations (org_id, store_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_seller_reply_sessions_expiry
    ON sotuvchi_seller_reply_sessions (org_id, store_id, state, expires_at)`,
] as const;

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureSotuvchiHandoffSchema(db: D1Database): Promise<void> {
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      await ensureSotuvchiOrdersSchema(db);
      await ensureChannelAddressSchema(db);
      for (const statement of SOTUVCHI_HANDOFF_DDL) {
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
