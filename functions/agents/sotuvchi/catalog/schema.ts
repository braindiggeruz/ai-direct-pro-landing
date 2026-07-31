import { ensureSotuvchiOnboardingSchema } from '../onboarding';

export const SOTUVCHI_CATALOG_DDL = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sotuvchi_stores_org_id
    ON sotuvchi_stores (org_id, id)`,
  `CREATE TABLE IF NOT EXISTS sotuvchi_categories (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    sort_order INTEGER NOT NULL
      CHECK (sort_order >= 0 AND sort_order <= 1000000),
    last_operation_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (store_id, slug),
    UNIQUE (org_id, store_id, id),
    FOREIGN KEY (org_id, store_id)
      REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS sotuvchi_products (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
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
      CHECK (json_valid(media_refs_json)
        AND json_type(media_refs_json) = 'array'),
    search_terms_json TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(search_terms_json)
        AND json_type(search_terms_json) = 'array'),
    specifications_json TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(specifications_json)
        AND json_type(specifications_json) = 'array'),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    last_operation_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (store_id, sku),
    UNIQUE (org_id, store_id, id),
    FOREIGN KEY (org_id, store_id)
      REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (org_id, store_id, category_id)
      REFERENCES sotuvchi_categories(org_id, store_id, id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS sotuvchi_catalog_operations (
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
  `CREATE TABLE IF NOT EXISTS sotuvchi_storefront_sessions (
    id TEXT PRIMARY KEY,
    bot_username TEXT NOT NULL,
    identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
    org_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
    last_product_id TEXT,
    last_intent TEXT,
    selection_request_key TEXT,
    selected_at TEXT,
    preferred_locale TEXT
      CHECK (preferred_locale IS NULL OR preferred_locale IN ('ru', 'uz')),
    pending_intent TEXT
      CHECK (pending_intent IS NULL OR pending_intent = 'budget'),
    pending_request_key TEXT,
    pending_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (bot_username, identity_id),
    FOREIGN KEY (org_id, store_id)
      REFERENCES sotuvchi_stores(org_id, id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS sotuvchi_buyer_presentations (
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
  )`,
  `CREATE TABLE IF NOT EXISTS sotuvchi_buyer_comparisons (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_categories_store_status_sort
    ON sotuvchi_categories (store_id, status, sort_order, name, id)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_categories_org_store
    ON sotuvchi_categories (org_id, store_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_products_store_status_name
    ON sotuvchi_products (store_id, status, normalized_name, id)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_products_store_category
    ON sotuvchi_products (store_id, category_id, status, id)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_products_org_store
    ON sotuvchi_products (org_id, store_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_catalog_operations_created
    ON sotuvchi_catalog_operations (org_id, store_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_storefront_sessions_store
    ON sotuvchi_storefront_sessions (org_id, store_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_storefront_pending
    ON sotuvchi_storefront_sessions
      (bot_username, identity_id, pending_intent, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_buyer_presentations_scope
    ON sotuvchi_buyer_presentations
      (session_id, org_id, store_id, presented_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sotuvchi_buyer_comparisons_scope
    ON sotuvchi_buyer_comparisons
      (session_id, org_id, store_id, position)`,
] as const;

const SOTUVCHI_BUYER_SESSION_UPGRADES = [
  'ALTER TABLE sotuvchi_storefront_sessions ADD COLUMN last_product_id TEXT',
  'ALTER TABLE sotuvchi_storefront_sessions ADD COLUMN last_intent TEXT',
  'ALTER TABLE sotuvchi_storefront_sessions ADD COLUMN selection_request_key TEXT',
  'ALTER TABLE sotuvchi_storefront_sessions ADD COLUMN selected_at TEXT',
  `ALTER TABLE sotuvchi_storefront_sessions ADD COLUMN preferred_locale TEXT
    CHECK (preferred_locale IS NULL OR preferred_locale IN ('ru', 'uz'))`,
  `ALTER TABLE sotuvchi_storefront_sessions ADD COLUMN pending_intent TEXT
    CHECK (pending_intent IS NULL OR pending_intent = 'budget')`,
  'ALTER TABLE sotuvchi_storefront_sessions ADD COLUMN pending_request_key TEXT',
  'ALTER TABLE sotuvchi_storefront_sessions ADD COLUMN pending_at TEXT',
] as const;

const SOTUVCHI_PRODUCT_QUALITY_UPGRADES = [
  `ALTER TABLE sotuvchi_products ADD COLUMN search_terms_json TEXT
    NOT NULL DEFAULT '[]'
    CHECK (json_valid(search_terms_json)
      AND json_type(search_terms_json) = 'array')`,
  `ALTER TABLE sotuvchi_products ADD COLUMN specifications_json TEXT
    NOT NULL DEFAULT '[]'
    CHECK (json_valid(specifications_json)
      AND json_type(specifications_json) = 'array')`,
] as const;

function isDuplicateColumn(error: unknown): boolean {
  return error instanceof Error
    && /duplicate column name/i.test(error.message);
}

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureSotuvchiCatalogSchema(db: D1Database): Promise<void> {
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      await ensureSotuvchiOnboardingSchema(db);
      for (const statement of SOTUVCHI_CATALOG_DDL) {
        await db.prepare(statement).run();
      }
      for (const statement of SOTUVCHI_BUYER_SESSION_UPGRADES) {
        try {
          await db.prepare(statement).run();
        } catch (error) {
          if (!isDuplicateColumn(error)) throw error;
        }
      }
      for (const statement of SOTUVCHI_PRODUCT_QUALITY_UPGRADES) {
        try {
          await db.prepare(statement).run();
        } catch (error) {
          if (!isDuplicateColumn(error)) throw error;
        }
      }
    })().catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}
