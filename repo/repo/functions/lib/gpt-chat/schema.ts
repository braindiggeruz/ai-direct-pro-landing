// Idempotent D1 schema bootstrap for the consumer AI-chat tables.
//
// The canonical schema lives in migrations/0008_gpt_chat.sql. Because Pages
// Functions cannot run wrangler migrations at request time, we also apply
// CREATE TABLE IF NOT EXISTS here on first use so the feature works the
// moment the D1 binding is present — with or without a manual migration.
// Memoised per isolate so it runs at most once per warm worker.

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    telegram_id TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    locale TEXT NOT NULL DEFAULT 'ru',
    created_at TEXT NOT NULL,
    last_seen_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS gpt_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    anon_token TEXT,
    hashed_ip TEXT,
    locale TEXT NOT NULL DEFAULT 'ru',
    source TEXT,
    created_at TEXT NOT NULL,
    last_activity_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS gpt_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model_used TEXT,
    token_in INTEGER,
    token_out INTEGER,
    cost_usd REAL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gpt_usage_daily (
    date_utc TEXT NOT NULL,
    hashed_ip TEXT NOT NULL,
    user_id TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    token_in INTEGER NOT NULL DEFAULT 0,
    token_out INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (date_utc, hashed_ip)
  )`,
  `CREATE TABLE IF NOT EXISTS gpt_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    provider TEXT,
    provider_customer_id TEXT,
    provider_subscription_id TEXT,
    plan TEXT,
    status TEXT,
    current_period_end TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS gpt_leads (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    user_id TEXT,
    contact_type TEXT,
    contact_value TEXT,
    name TEXT,
    phone TEXT,
    telegram TEXT,
    intent TEXT,
    utm_json TEXT,
    source TEXT,
    page_url TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gpt_events (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    user_id TEXT,
    event_name TEXT NOT NULL,
    payload_json TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payment_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    provider TEXT,
    provider_checkout_id TEXT,
    amount REAL,
    currency TEXT,
    status TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_sessions_hashed_ip ON gpt_sessions (hashed_ip)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_messages_session ON gpt_messages (session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_usage_date_ip ON gpt_usage_daily (date_utc, hashed_ip)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_usage_date_user ON gpt_usage_daily (date_utc, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_subscriptions_user ON gpt_subscriptions (user_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_leads_created ON gpt_leads (created_at, source)`,
];

const _bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureSchema(db: D1Database): Promise<void> {
  let p = _bootstrapped.get(db);
  if (!p) {
    p = (async () => {
      for (const stmt of DDL) {
        await db.prepare(stmt).run();
      }
    })().catch((e) => {
      // Reset so a transient failure can be retried on the next request.
      _bootstrapped.delete(db);
      throw e;
    });
    _bootstrapped.set(db, p);
  }
  return p;
}
