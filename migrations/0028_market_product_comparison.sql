-- R1.1 buyer comparison state.
-- Stores only product references and bounded, content-free relevance metadata.

CREATE TABLE IF NOT EXISTS sotuvchi_buyer_presentations (
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  relevance_score INTEGER NOT NULL
    CHECK (relevance_score >= 0 AND relevance_score <= 4000),
  matched_requirement_count INTEGER NOT NULL
    CHECK (matched_requirement_count >= 0
      AND matched_requirement_count <= 12),
  missing_requirement_count INTEGER NOT NULL
    CHECK (missing_requirement_count >= 0
      AND missing_requirement_count <= 12),
  relevance_reason TEXT NOT NULL CHECK (relevance_reason IN (
    'catalog_listing', 'category_match', 'exact_name', 'exact_alias',
    'name_prefix', 'all_tokens', 'partial_tokens',
    'exact_product_reference'
  )),
  request_key TEXT NOT NULL,
  presented_at TEXT NOT NULL,
  PRIMARY KEY (session_id, product_id),
  FOREIGN KEY (session_id)
    REFERENCES sotuvchi_storefront_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, store_id, product_id)
    REFERENCES sotuvchi_products(org_id, store_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sotuvchi_buyer_comparisons (
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  position INTEGER NOT NULL
    CHECK (position >= 1 AND position <= 1000000),
  relevance_score INTEGER NOT NULL
    CHECK (relevance_score >= 0 AND relevance_score <= 4000),
  matched_requirement_count INTEGER NOT NULL
    CHECK (matched_requirement_count >= 0
      AND matched_requirement_count <= 12),
  missing_requirement_count INTEGER NOT NULL
    CHECK (missing_requirement_count >= 0
      AND missing_requirement_count <= 12),
  relevance_reason TEXT NOT NULL CHECK (relevance_reason IN (
    'catalog_listing', 'category_match', 'exact_name', 'exact_alias',
    'name_prefix', 'all_tokens', 'partial_tokens',
    'exact_product_reference'
  )),
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, product_id),
  UNIQUE (session_id, position),
  FOREIGN KEY (session_id)
    REFERENCES sotuvchi_storefront_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, store_id, product_id)
    REFERENCES sotuvchi_products(org_id, store_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sotuvchi_buyer_presentations_scope
  ON sotuvchi_buyer_presentations
    (session_id, org_id, store_id, presented_at);

CREATE INDEX IF NOT EXISTS idx_sotuvchi_buyer_comparisons_scope
  ON sotuvchi_buyer_comparisons
    (session_id, org_id, store_id, position);
