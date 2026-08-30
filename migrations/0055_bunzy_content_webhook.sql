-- Bunzy content webhook: durable, idempotent article state without a deploy per article.
-- Raw webhook bodies and signing secrets are deliberately never persisted.
CREATE TABLE IF NOT EXISTS bunzy_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('article.published', 'article.updated', 'article.unpublished')),
  is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
  locale TEXT NOT NULL CHECK (locale IN ('ru', 'uz')),
  slug TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processed', 'test_received'))
);

CREATE INDEX IF NOT EXISTS idx_bunzy_events_received
  ON bunzy_webhook_events(received_at DESC);

CREATE TABLE IF NOT EXISTS bunzy_articles (
  locale TEXT NOT NULL CHECK (locale IN ('ru', 'uz')),
  slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'unpublished')),
  title TEXT,
  description TEXT,
  article_json TEXT,
  source_markdown TEXT,
  source_updated_at TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  unpublished_at TEXT,
  PRIMARY KEY (locale, slug)
);

CREATE INDEX IF NOT EXISTS idx_bunzy_articles_public
  ON bunzy_articles(locale, status, source_updated_at DESC);
