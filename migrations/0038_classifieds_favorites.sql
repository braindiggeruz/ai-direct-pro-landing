-- Bormi buyer journey: identity-scoped saved listings.
-- No listing copy, seller data or contact data is stored here.

CREATE TABLE market_listing_favorites (
  identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES sotuvchi_products(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  PRIMARY KEY (identity_id, product_id)
);

CREATE INDEX idx_market_listing_favorites_product
  ON market_listing_favorites (product_id, created_at DESC);
CREATE INDEX idx_market_listing_favorites_identity_recent
  ON market_listing_favorites (identity_id, created_at DESC, product_id);
