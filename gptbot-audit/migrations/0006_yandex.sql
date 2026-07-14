-- D1 migration: Yandex Search API integration.
--
-- Adds a SERP cache table so the SEO Mission Control's «Собрать темы из
-- Яндекса» button can run several seed searches without burning the
-- paid Yandex quota every time the operator opens the panel.
--
-- Schema:
--   yandex_serp_cache — JSON snapshot per (search_type, locale, region, query)
--   24 h TTL (enforced in the application layer via expires_at_ms)
--
-- The functions/lib/yandex/cache.ts module also runs CREATE TABLE IF NOT
-- EXISTS at runtime so a deploy without a migration step still works.

CREATE TABLE IF NOT EXISTS yandex_serp_cache (
  cache_key      TEXT PRIMARY KEY,            -- search_type|locale|region|query (lowercased query)
  query          TEXT NOT NULL,
  locale         TEXT NOT NULL,               -- 'ru' | 'uz'
  search_type    TEXT NOT NULL,               -- SEARCH_TYPE_UZ | SEARCH_TYPE_RU | …
  region         INTEGER,                     -- optional Yandex region id
  snapshot_json  TEXT NOT NULL,               -- normalised YandexSerpSnapshot
  cached_at_ms   INTEGER NOT NULL,
  expires_at_ms  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_yandex_serp_expires ON yandex_serp_cache(expires_at_ms);
CREATE INDEX IF NOT EXISTS idx_yandex_serp_cached_at ON yandex_serp_cache(cached_at_ms);
