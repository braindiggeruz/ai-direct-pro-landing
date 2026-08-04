-- Bormi buyer journey: bounded in-app inquiries without public contact data.
-- Message and reply text are private to the two proven identities and are
-- deliberately absent from moderation/audit projections.

CREATE TABLE market_listing_inquiries (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 120),
  product_id TEXT NOT NULL REFERENCES sotuvchi_products(id) ON DELETE RESTRICT,
  seller_profile_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  buyer_identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 2 AND 500),
  status TEXT NOT NULL CHECK (status IN ('open', 'answered', 'closed')),
  reply_text TEXT CHECK (reply_text IS NULL OR length(reply_text) BETWEEN 2 AND 500),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  create_idempotency_key TEXT NOT NULL CHECK (
    length(create_idempotency_key) BETWEEN 1 AND 200
  ),
  reply_idempotency_key TEXT CHECK (
    reply_idempotency_key IS NULL
    OR length(reply_idempotency_key) BETWEEN 1 AND 200
  ),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64),
  UNIQUE (buyer_identity_id, create_idempotency_key),
  UNIQUE (seller_profile_id, reply_idempotency_key)
);

CREATE INDEX idx_market_listing_inquiries_buyer
  ON market_listing_inquiries (buyer_identity_id, updated_at DESC, id);
CREATE INDEX idx_market_listing_inquiries_seller_queue
  ON market_listing_inquiries (seller_profile_id, status, updated_at, id);
CREATE INDEX idx_market_listing_inquiries_product
  ON market_listing_inquiries (product_id, status, created_at);

-- Concurrency-safe abuse backstop. The service performs the same check first
-- for a stable 429, while this trigger prevents parallel requests from racing
-- past ten inquiries per proven identity in 24 hours.
CREATE TRIGGER market_listing_inquiries_identity_rate_limit
BEFORE INSERT ON market_listing_inquiries
WHEN (
  SELECT COUNT(*) FROM market_listing_inquiries
  WHERE buyer_identity_id = NEW.buyer_identity_id
    AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')
) >= 10
BEGIN
  SELECT RAISE(ABORT, 'classifieds_inquiry_rate_limited');
END;
