-- Ledger metadata reconciliation for 0026–0030.
--
-- Why this is not a numbered migration
-- ------------------------------------
-- `wrangler d1 migrations apply` decides what to run by diffing the migrations
-- directory against `d1_migrations`. Production's ledger stops at 0025 while the
-- schema physically carries everything through 0030, so the runner believes five
-- migrations are outstanding and would execute them. Three of those are bare
-- `ALTER TABLE ... ADD COLUMN`, and SQLite has no `IF NOT EXISTS` for a column:
-- the first one aborts with "duplicate column name" and the batch dies halfway.
--
-- So the ledger has to be told the truth *before* the runner is ever invoked
-- again. This file is run once, on its own, with `wrangler d1 execute --file`.
-- It executes none of the original DDL — it only records what is already there.
--
-- How drift happened: 0026–0030 reached production through a path that applied
-- the SQL without writing the ledger row. The schema is correct; the bookkeeping
-- is not, and every future migration is blocked until the two agree.
--
-- Safety properties
-- -----------------
-- Fail closed: each row is inserted only if this database physically proves it
-- already has that migration's artifacts. If a marker is missing, that row is
-- silently not written and the ledger stays behind — which leaves the runner
-- blocked, which is the safe direction. Nothing is repaired on a guess.
--
-- Idempotent: `NOT EXISTS` on the unique name means a second run writes zero
-- rows. `id` is AUTOINCREMENT and the ledger currently ends at 25, so these land
-- as 26–30 in order.
--
-- Writes at most 5 rows to `d1_migrations`. Touches no business data.

-- 0026 — four additive columns on the storefront session plus one index.
INSERT INTO d1_migrations (name)
SELECT '0026_market_buyer_experience.sql'
WHERE (
  SELECT COUNT(*) FROM pragma_table_info('sotuvchi_storefront_sessions')
  WHERE name IN ('preferred_locale', 'pending_intent', 'pending_request_key', 'pending_at')
) = 4
AND (
  SELECT COUNT(*) FROM sqlite_master
  WHERE type = 'index' AND name = 'idx_sotuvchi_storefront_pending'
) = 1
AND NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0026_market_buyer_experience.sql'
);

-- 0027 — the two grounded-search JSON columns on products.
INSERT INTO d1_migrations (name)
SELECT '0027_market_catalog_quality.sql'
WHERE (
  SELECT COUNT(*) FROM pragma_table_info('sotuvchi_products')
  WHERE name IN ('search_terms_json', 'specifications_json')
) = 2
AND NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0027_market_catalog_quality.sql'
);

-- 0028 — the two buyer comparison tables.
INSERT INTO d1_migrations (name)
SELECT '0028_market_product_comparison.sql'
WHERE (
  SELECT COUNT(*) FROM sqlite_master
  WHERE type = 'table'
    AND name IN ('sotuvchi_buyer_presentations', 'sotuvchi_buyer_comparisons')
) = 2
AND NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0028_market_product_comparison.sql'
);

-- 0029 — the optional checkout comment column.
INSERT INTO d1_migrations (name)
SELECT '0029_market_checkout_comment.sql'
WHERE (
  SELECT COUNT(*) FROM pragma_table_info('sotuvchi_orders')
  WHERE name = 'buyer_comment'
) = 1
AND NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0029_market_checkout_comment.sql'
);

-- 0030 — the three Telegram reliability tables.
INSERT INTO d1_migrations (name)
SELECT '0030_market_telegram_reliability.sql'
WHERE (
  SELECT COUNT(*) FROM sqlite_master
  WHERE type = 'table'
    AND name IN (
      'telegram_agent_update_metrics',
      'telegram_agent_rate_limits',
      'telegram_agent_rate_limit_notices'
    )
) = 3
AND NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0030_market_telegram_reliability.sql'
);
