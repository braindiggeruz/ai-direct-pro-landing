-- Telegram "Smart Forward" assistant — MVP schema.
-- Applied at runtime by functions/lib/telegram/schema.ts (CREATE TABLE IF NOT
-- EXISTS) so the feature works the moment the D1 binding is present; this file
-- is the canonical reference for `wrangler d1 migrations`.
--
-- Privacy: raw source text is retained only long enough to power the follow-up
-- buttons (see telegram_items.expires_at, default 24h). Analytics store a
-- pseudonymous key, never the raw telegram_user_id, username, name, or text.

CREATE TABLE IF NOT EXISTS telegram_users (
  telegram_user_id   INTEGER PRIMARY KEY,
  locale             TEXT NOT NULL DEFAULT 'ru',
  created_at         TEXT NOT NULL,
  last_seen_at       TEXT,
  daily_usage_count  INTEGER NOT NULL DEFAULT 0,
  daily_usage_date   TEXT,
  total_actions      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS telegram_items (
  id                 TEXT PRIMARY KEY,
  telegram_user_id   INTEGER NOT NULL,
  source_type        TEXT NOT NULL,              -- 'forward' | 'direct'
  source_text        TEXT,                        -- cleared after expires_at
  source_language    TEXT,                        -- best-effort guess: ru | uz | other
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tg_items_user ON telegram_items (telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_tg_items_expires ON telegram_items (expires_at);

CREATE TABLE IF NOT EXISTS telegram_results (
  id                 TEXT PRIMARY KEY,
  item_id            TEXT NOT NULL,
  action             TEXT NOT NULL,               -- reply | explain | summarize | translate
  modifier           TEXT,                        -- shorter | politer | variant | translate | null
  result_text        TEXT,
  provider           TEXT,
  model              TEXT,
  prompt_version     TEXT,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tg_results_item ON telegram_results (item_id);

-- update_id is globally unique per bot; the UNIQUE PK dedupes retries.
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id          INTEGER PRIMARY KEY,
  processed_at       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'ok'
);

-- Pseudonymous, text-free product analytics. pseudo_user = SHA-256(user_id+salt).
CREATE TABLE IF NOT EXISTS telegram_events (
  id                 TEXT PRIMARY KEY,
  event              TEXT NOT NULL,
  pseudo_user        TEXT,
  meta_json          TEXT,                        -- locale/source/action only, never message text
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tg_events_created ON telegram_events (created_at, event);
