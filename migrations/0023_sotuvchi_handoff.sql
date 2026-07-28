-- GPTBot Agents P2.6: durable channel addresses and Sotuvchi human handoff.
--
-- Additive only.
--
-- `channel_addresses` is platform-level and channel-neutral: it records where
-- one platform identity can be reached inside one bot namespace, and nothing
-- else. It is never an authority — tenant membership, store ownership and
-- conversation ownership are re-derived from the domain before every send —
-- and the namespace column keeps the Agents bot separate from the Javob and
-- lead bots that share the same channel.
--
-- `sotuvchi_handoffs` carries the only free-form content the agent stores:
-- one bounded buyer question and one bounded seller reply. Both are cleared
-- once `expires_at` passes, so the retention window is enforced by data, not
-- by convention. No transcript, attachment, profile or chat id column exists.
--
-- Delivery state lives on the handoff row (`seller_notified_at`,
-- `buyer_delivered_at` and their attempt counters) rather than in a second
-- outbox table: the conditional UPDATE that stamps them is the claim, so one
-- intent is never stored twice and a duplicate push can never duplicate a
-- domain change.
--
-- Rollback notes (only while Sotuvchi handoff traffic is disabled):
--   DROP INDEX IF EXISTS idx_sotuvchi_seller_reply_sessions_expiry;
--   DROP INDEX IF EXISTS idx_sotuvchi_handoff_operations_created;
--   DROP INDEX IF EXISTS idx_sotuvchi_handoffs_expiry;
--   DROP INDEX IF EXISTS idx_sotuvchi_handoffs_queue;
--   DROP INDEX IF EXISTS idx_sotuvchi_handoffs_active;
--   DROP TABLE IF EXISTS sotuvchi_seller_reply_sessions;
--   DROP TABLE IF EXISTS sotuvchi_handoff_operations;
--   DROP TABLE IF EXISTS sotuvchi_handoffs;
--   DROP INDEX IF EXISTS idx_channel_addresses_lookup;
--   DROP TABLE IF EXISTS channel_addresses;
-- Dropping `channel_addresses` also stops delivery of the P2.5 order
-- notification intents; those intents stay pending and are not lost.
-- Git rollback does not remove D1 objects. This migration is not applied by
-- the P2.6 code change.

CREATE TABLE IF NOT EXISTS channel_addresses (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL
    CHECK (length(channel) >= 1 AND length(channel) <= 32),
  namespace TEXT NOT NULL
    CHECK (length(namespace) >= 1 AND length(namespace) <= 64),
  thread_ref TEXT NOT NULL
    CHECK (length(thread_ref) >= 1 AND length(thread_ref) <= 64),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (identity_id, channel, namespace)
);

CREATE INDEX IF NOT EXISTS idx_channel_addresses_lookup
  ON channel_addresses (channel, namespace, status, identity_id);

CREATE TABLE IF NOT EXISTS sotuvchi_handoffs (
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
);

CREATE TABLE IF NOT EXISTS sotuvchi_handoff_operations (
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

CREATE TABLE IF NOT EXISTS sotuvchi_seller_reply_sessions (
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
);

-- One live conversation per buyer session: a buyer cannot flood the seller
-- queue, and a repeated question resolves to the handoff already sent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sotuvchi_handoffs_active
  ON sotuvchi_handoffs (buyer_session_id)
  WHERE status IN ('open', 'answered');
CREATE INDEX IF NOT EXISTS idx_sotuvchi_handoffs_queue
  ON sotuvchi_handoffs (org_id, store_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_handoffs_expiry
  ON sotuvchi_handoffs (org_id, store_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_handoff_operations_created
  ON sotuvchi_handoff_operations (org_id, store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_seller_reply_sessions_expiry
  ON sotuvchi_seller_reply_sessions (org_id, store_id, state, expires_at);
