// Idempotent D1 bootstrap for the Telegram assistant tables. Mirrors the
// gpt-chat pattern: Pages Functions cannot run wrangler migrations at request
// time, so CREATE TABLE IF NOT EXISTS runs once per warm isolate. Canonical
// DDL lives in migrations/0009_telegram_assistant.sql.

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS telegram_users (
    telegram_user_id INTEGER PRIMARY KEY,
    locale TEXT NOT NULL DEFAULT 'ru',
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    daily_usage_count INTEGER NOT NULL DEFAULT 0,
    daily_usage_date TEXT,
    total_actions INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS telegram_items (
    id TEXT PRIMARY KEY,
    telegram_user_id INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_text TEXT,
    source_language TEXT,
    voice_duration_sec INTEGER,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS telegram_results (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    action TEXT NOT NULL,
    modifier TEXT,
    result_text TEXT,
    provider TEXT,
    model TEXT,
    prompt_version TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS telegram_updates (
    update_id INTEGER PRIMARY KEY,
    processed_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ok'
  )`,
  `CREATE TABLE IF NOT EXISTS telegram_events (
    id TEXT PRIMARY KEY,
    event TEXT NOT NULL,
    pseudo_user TEXT,
    meta_json TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tg_items_user ON telegram_items (telegram_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tg_items_expires ON telegram_items (expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tg_results_item ON telegram_results (item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tg_events_created ON telegram_events (created_at, event)`,
  // ── 0010: Javob billing domain ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name_ru TEXT NOT NULL, name_uz TEXT NOT NULL,
    price_uzs INTEGER NOT NULL DEFAULT 0, billing_type TEXT NOT NULL, duration_hours INTEGER,
    monthly_limit INTEGER, daily_limit INTEGER, features_json TEXT,
    is_active INTEGER NOT NULL DEFAULT 0, display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL, plan_code TEXT NOT NULL,
    status TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, renews_at TEXT,
    provider TEXT, provider_subscription_id TEXT, created_at TEXT NOT NULL, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS entitlements (
    id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL, entitlement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL, remaining INTEGER NOT NULL, starts_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS usage_ledger (
    id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL, usage_type TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1, item_id TEXT, result_id TEXT, entitlement_id TEXT,
    created_at TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS payment_orders (
    id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL, plan_code TEXT NOT NULL,
    amount_uzs INTEGER NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL,
    external_order_id TEXT, idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, paid_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY, payment_order_id TEXT NOT NULL, provider TEXT NOT NULL,
    external_transaction_id TEXT NOT NULL, status TEXT NOT NULL, amount_uzs INTEGER NOT NULL,
    raw_payload_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS user_preferences (
    telegram_user_id INTEGER PRIMARY KEY, default_tone TEXT, preferred_language TEXT,
    formality TEXT, emoji_preference TEXT, created_at TEXT NOT NULL, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY, referrer_user_id INTEGER NOT NULL, referred_user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', reward_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, activated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions (telegram_user_id, status, ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_ent_user ON entitlements (telegram_user_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_user_date ON usage_ledger (telegram_user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_user ON payment_orders (telegram_user_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_external ON payment_orders (provider, external_order_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_external ON payment_transactions (provider, external_transaction_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_pair ON referrals (referrer_user_id, referred_user_id)`,
  `INSERT OR IGNORE INTO plans (id, code, name_ru, name_uz, price_uzs, billing_type, duration_hours, monthly_limit, daily_limit, features_json, is_active, display_order, created_at) VALUES
    ('plan_free','free','Free','Free',0,'none',NULL,30,3,'{"modifiers":"basic"}',1,1,'2026-07-16T00:00:00Z'),
    ('plan_day_pass','day_pass','Day Pass','Day Pass',2900,'one_time',24,25,NULL,'{}',1,2,'2026-07-16T00:00:00Z'),
    ('plan_plus','plus','Plus','Plus',24900,'monthly',NULL,250,NULL,'{"launch_price_uzs":19900,"styles":1}',1,3,'2026-07-16T00:00:00Z'),
    ('plan_pro','pro','Pro','Pro',49900,'monthly',NULL,800,NULL,'{"styles":3,"coming_soon":true}',0,4,'2026-07-16T00:00:00Z'),
    ('plan_team','team','Team','Team',199000,'monthly',NULL,3000,NULL,'{"seats":5,"coming_soon":true}',0,5,'2026-07-16T00:00:00Z')`,
];

// ALTER TABLE ADD COLUMN throws if the column already exists — applied
// separately with per-statement tolerance (SQLite has no IF NOT EXISTS here).
const DDL_ALTERS: string[] = [
  `ALTER TABLE telegram_items ADD COLUMN detected_context TEXT`,
  `ALTER TABLE telegram_items ADD COLUMN voice_duration_sec INTEGER`,
  `ALTER TABLE telegram_results ADD COLUMN output_language TEXT`,
  `ALTER TABLE telegram_results ADD COLUMN latency_ms INTEGER`,
];

const _bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureTelegramSchema(db: D1Database): Promise<void> {
  let p = _bootstrapped.get(db);
  if (!p) {
    p = (async () => {
      for (const stmt of DDL) await db.prepare(stmt).run();
      for (const stmt of DDL_ALTERS) {
        try { await db.prepare(stmt).run(); } catch { /* column already exists */ }
      }
    })().catch((e) => {
      _bootstrapped.delete(db);
      throw e;
    });
    _bootstrapped.set(db, p);
  }
  return p;
}
