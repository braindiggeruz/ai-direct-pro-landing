-- GPTBot Javob — billing domain + reply-engine columns.
-- Extends 0009_telegram_assistant.sql. Applied at runtime by
-- functions/lib/telegram/schema.ts (idempotent); this file is the canonical
-- reference for `wrangler d1 migrations`.
--
-- Rollback notes: new tables can be DROPped safely (no existing writers before
-- this feature ships). The ALTER TABLE ADD COLUMN lines cannot be rolled back
-- in SQLite without a table rebuild — they are additive and nullable, so
-- leaving them in place is harmless.

-- ── Reply-engine columns on existing tables (additive, nullable) ──────────
ALTER TABLE telegram_items ADD COLUMN detected_context TEXT;
ALTER TABLE telegram_results ADD COLUMN output_language TEXT;
ALTER TABLE telegram_results ADD COLUMN latency_ms INTEGER;

-- ── Plan catalog (seeded below; edited via SQL, not code) ──────────────────
CREATE TABLE IF NOT EXISTS plans (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,           -- free | day_pass | plus | pro | team
  name_ru        TEXT NOT NULL,
  name_uz        TEXT NOT NULL,
  price_uzs      INTEGER NOT NULL DEFAULT 0,
  billing_type   TEXT NOT NULL,                  -- none | one_time | monthly
  duration_hours INTEGER,                        -- for one_time (Day Pass = 24)
  monthly_limit  INTEGER,                        -- main generations per period
  daily_limit    INTEGER,                        -- main generations per day (free tier)
  features_json  TEXT,
  is_active      INTEGER NOT NULL DEFAULT 0,     -- sellable right now
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT
);

-- ── Subscriptions (monthly plans) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                        TEXT PRIMARY KEY,
  telegram_user_id          INTEGER NOT NULL REFERENCES telegram_users(telegram_user_id),
  plan_code                 TEXT NOT NULL,
  status                    TEXT NOT NULL,        -- active | expired | cancelled
  starts_at                 TEXT NOT NULL,
  ends_at                   TEXT NOT NULL,
  renews_at                 TEXT,
  provider                  TEXT,                 -- click | payme | manual
  provider_subscription_id  TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions (telegram_user_id, status, ends_at);

-- ── Entitlements: the concrete "you may generate N replies until T" grants ──
CREATE TABLE IF NOT EXISTS entitlements (
  id                TEXT PRIMARY KEY,
  telegram_user_id  INTEGER NOT NULL REFERENCES telegram_users(telegram_user_id),
  entitlement_type  TEXT NOT NULL,               -- main_generations
  quantity          INTEGER NOT NULL,
  remaining         INTEGER NOT NULL,
  starts_at         TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  source            TEXT NOT NULL,               -- plan:free | order:day_pass | subscription:plus | referral
  source_id         TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ent_user ON entitlements (telegram_user_id, expires_at);

-- ── Usage ledger: idempotent, append-only source of truth ─────────────────
CREATE TABLE IF NOT EXISTS usage_ledger (
  id                TEXT PRIMARY KEY,
  telegram_user_id  INTEGER NOT NULL,
  usage_type        TEXT NOT NULL,               -- main_generation | modifier
  quantity          INTEGER NOT NULL DEFAULT 1,
  item_id           TEXT,
  result_id         TEXT,
  entitlement_id    TEXT,
  created_at        TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_ledger_user_date ON usage_ledger (telegram_user_id, created_at);

-- ── Payment orders + transactions (provider-neutral; adapters disabled) ────
CREATE TABLE IF NOT EXISTS payment_orders (
  id                TEXT PRIMARY KEY,
  telegram_user_id  INTEGER NOT NULL,
  plan_code         TEXT NOT NULL,
  amount_uzs        INTEGER NOT NULL,
  provider          TEXT NOT NULL,               -- click | payme
  status            TEXT NOT NULL,               -- created | pending | paid | failed | expired | cancelled
  external_order_id TEXT,
  idempotency_key   TEXT NOT NULL UNIQUE,
  created_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  paid_at           TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON payment_orders (telegram_user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_external ON payment_orders (provider, external_order_id);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                      TEXT PRIMARY KEY,
  payment_order_id        TEXT NOT NULL REFERENCES payment_orders(id),
  provider                TEXT NOT NULL,
  external_transaction_id TEXT NOT NULL,
  status                  TEXT NOT NULL,
  amount_uzs              INTEGER NOT NULL,
  raw_payload_hash        TEXT,                  -- SHA-256 of the callback body; raw payload is NOT stored
  created_at              TEXT NOT NULL,
  updated_at              TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_external ON payment_transactions (provider, external_transaction_id);

-- ── User preferences (Plus style profile lands later; columns ready) ──────
CREATE TABLE IF NOT EXISTS user_preferences (
  telegram_user_id  INTEGER PRIMARY KEY REFERENCES telegram_users(telegram_user_id),
  default_tone      TEXT,
  preferred_language TEXT,
  formality         TEXT,
  emoji_preference  TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT
);

-- ── Referrals (schema ready; feature ships DISABLED) ──────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id                TEXT PRIMARY KEY,
  referrer_user_id  INTEGER NOT NULL,
  referred_user_id  INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  reward_quantity   INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  activated_at      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_pair ON referrals (referrer_user_id, referred_user_id);

-- ── Seed the plan catalog (INSERT OR IGNORE keeps re-runs safe) ────────────
-- Launch scope: free + day_pass + plus active; pro/team catalogued, not sold.
INSERT OR IGNORE INTO plans (id, code, name_ru, name_uz, price_uzs, billing_type, duration_hours, monthly_limit, daily_limit, features_json, is_active, display_order, created_at) VALUES
  ('plan_free',     'free',     'Free',     'Free',     0,      'none',     NULL, 30,   3,    '{"modifiers":"basic"}',                 1, 1, '2026-07-16T00:00:00Z'),
  ('plan_day_pass', 'day_pass', 'Day Pass', 'Day Pass', 2900,   'one_time', 24,   25,   NULL, '{}',                                    1, 2, '2026-07-16T00:00:00Z'),
  ('plan_plus',     'plus',     'Plus',     'Plus',     24900,  'monthly',  NULL, 250,  NULL, '{"launch_price_uzs":19900,"styles":1}', 1, 3, '2026-07-16T00:00:00Z'),
  ('plan_pro',      'pro',      'Pro',      'Pro',      49900,  'monthly',  NULL, 800,  NULL, '{"styles":3,"coming_soon":true}',       0, 4, '2026-07-16T00:00:00Z'),
  ('plan_team',     'team',     'Team',     'Team',     199000, 'monthly',  NULL, 3000, NULL, '{"seats":5,"coming_soon":true}',        0, 5, '2026-07-16T00:00:00Z');
