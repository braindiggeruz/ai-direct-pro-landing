// Additive sidecars: legacy REAL/USD attempts and nullable users are not an
// authority for UZS money or identity. No old rows are rewritten or promoted.
export const BILLING_DDL = [
  `CREATE TABLE IF NOT EXISTS gpt_payment_consents (org_id TEXT NOT NULL, order_id TEXT NOT NULL, user_id TEXT NOT NULL, version TEXT NOT NULL, url TEXT NOT NULL, locale TEXT NOT NULL, accepted_at INTEGER NOT NULL, PRIMARY KEY(org_id,order_id))`,
  `CREATE TABLE IF NOT EXISTS gpt_accounts (org_id TEXT NOT NULL, id TEXT NOT NULL, identity_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, PRIMARY KEY(org_id,id), UNIQUE(org_id,identity_hash))`,
  `CREATE TABLE IF NOT EXISTS gpt_auth_sessions (org_id TEXT NOT NULL, token_hash TEXT NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(org_id,token_hash))`,
  `CREATE TABLE IF NOT EXISTS gpt_auth_challenges (org_id TEXT NOT NULL, state_hash TEXT NOT NULL, verifier TEXT NOT NULL, locale TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(org_id,state_hash))`,
  `CREATE TABLE IF NOT EXISTS gpt_payment_orders (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL, id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider IN ('click','payme')),
    mode TEXT NOT NULL CHECK(mode IN ('test','live')), request_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount=2000000), currency TEXT NOT NULL CHECK(currency='UZS'),
    state TEXT NOT NULL CHECK(state IN ('pending','prepared','paid','cancelled','refunded')),
    external_id TEXT, provider_time INTEGER, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    create_time INTEGER NOT NULL DEFAULT 0, perform_time INTEGER NOT NULL DEFAULT 0,
    cancel_time INTEGER NOT NULL DEFAULT 0, reason INTEGER, version INTEGER NOT NULL DEFAULT 0,
    UNIQUE(org_id,user_id,request_id), UNIQUE(org_id,provider,mode,external_id))`,
  `CREATE TABLE IF NOT EXISTS gpt_payment_journal (org_id TEXT NOT NULL, id TEXT PRIMARY KEY, order_id TEXT NOT NULL, actor TEXT NOT NULL, method TEXT NOT NULL, from_state TEXT, to_state TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS gpt_access_periods (org_id TEXT NOT NULL, order_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, mode TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, message_limit INTEGER NOT NULL, revoked_at INTEGER, refund_requested_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS gpt_billing_outbox (org_id TEXT NOT NULL, id TEXT PRIMARY KEY, order_id TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL, available_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT, attempts INTEGER NOT NULL DEFAULT 0, delivered_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS gpt_turn_reservations (org_id TEXT NOT NULL, id TEXT NOT NULL, subject TEXT NOT NULL, ip_hash TEXT NOT NULL, period_id TEXT, status TEXT NOT NULL CHECK(status IN ('reserved','done','released')), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(org_id,id))`,
  `CREATE TABLE IF NOT EXISTS gpt_model_health (org_id TEXT NOT NULL, model TEXT NOT NULL, blocked_until INTEGER NOT NULL, code TEXT NOT NULL, PRIMARY KEY(org_id,model))`,
  `CREATE TABLE IF NOT EXISTS gpt_model_attempts (org_id TEXT NOT NULL, id TEXT PRIMARY KEY, period_id TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_model_attempt_period ON gpt_model_attempts(org_id,period_id)`,
  `CREATE TABLE IF NOT EXISTS gpt_service_alerts (org_id TEXT NOT NULL, id TEXT PRIMARY KEY, code TEXT NOT NULL, created_at INTEGER NOT NULL, delivered_at INTEGER, lease_until INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS gpt_fiscal_receipts (org_id TEXT NOT NULL, order_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('PERFORM','CANCEL')), receipt_url TEXT, status_code INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(org_id,order_id,kind))`,
  `CREATE TABLE IF NOT EXISTS gpt_billing_ops (org_id TEXT NOT NULL, task TEXT NOT NULL, next_at INTEGER NOT NULL, PRIMARY KEY(org_id,task))`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_auth_expiry ON gpt_auth_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_orders_user ON gpt_payment_orders(org_id,user_id,created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_gpt_orders_pending ON gpt_payment_orders(org_id,user_id,provider,mode) WHERE state IN ('pending','prepared')`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_orders_statement ON gpt_payment_orders(org_id,provider,mode,provider_time)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_periods_user ON gpt_access_periods(org_id,user_id,mode,ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_turn_subject ON gpt_turn_reservations(org_id,subject,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_turn_period ON gpt_turn_reservations(org_id,period_id,status)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_turn_ip ON gpt_turn_reservations(org_id,ip_hash,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_billing_delivery ON gpt_billing_outbox(org_id,delivered_at,available_at)`,
];
// Chat runtime (migrations/0066): how each turn settled, without any text, so
// the watchdog, the admin and the daily budget read one ledger. All nullable:
// rows settled before 0066 keep NULL, and the status CHECK is not touched.
export const CHAT_RUNTIME_COLUMNS: ReadonlyArray<readonly [string, "TEXT" | "INTEGER"]> = [
  ["outcome", "TEXT"],
  ["charged", "INTEGER"],
  ["model", "TEXT"],
  ["finish_reason", "TEXT"],
  ["cancel_reason", "TEXT"],
  ["ttft_ms", "INTEGER"],
  ["total_ms", "INTEGER"],
  ["tokens_in", "INTEGER"],
  ["tokens_out", "INTEGER"],
  ["reasoning_tokens", "INTEGER"],
  ["cost_micro_usd", "INTEGER"],
  ["attempts", "INTEGER"],
];
export const CHAT_RUNTIME_DDL = [
  // The free tier's daily spend on paid models (model-spend-store.ts); day is
  // the UTC day, like the quotas.
  `CREATE TABLE IF NOT EXISTS gpt_model_spend (org_id TEXT NOT NULL, day TEXT NOT NULL, bucket TEXT NOT NULL, reserved_micro INTEGER NOT NULL DEFAULT 0, actual_micro INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(org_id,day,bucket))`,
  // One counter per limit reason, subject and UTC day (written by plan WP-05).
  `CREATE TABLE IF NOT EXISTS gpt_limit_hits (org_id TEXT NOT NULL, day TEXT NOT NULL, reason TEXT NOT NULL, tier TEXT NOT NULL, subject TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, first_at INTEGER NOT NULL, PRIMARY KEY(org_id,day,reason,subject))`,
  // Time windows of the watchdog, the diagnostics and the admin.
  `CREATE INDEX IF NOT EXISTS idx_gpt_turn_created ON gpt_turn_reservations(org_id,created_at)`,
  // deliverServiceAlerts claims undelivered rows of the last 24 hours.
  `CREATE INDEX IF NOT EXISTS idx_gpt_service_alerts_pending ON gpt_service_alerts(org_id,delivered_at,created_at)`,
];
/**
 * Add the 0066 columns a database without the migration lacks: one PRAGMA
 * per bootstrap, an ALTER only for a missing column. Another isolate may add
 * the same column in between; its duplicate is not an error.
 */
async function addChatRuntimeColumns(db: D1Database): Promise<void> {
  const info = await db
    .prepare("PRAGMA table_info('gpt_turn_reservations')")
    .all<{ name: string }>();
  const present = new Set((info.results ?? []).map((column) => column.name));
  for (const [name, type] of CHAT_RUNTIME_COLUMNS) {
    if (present.has(name)) continue;
    try {
      await db
        .prepare(`ALTER TABLE gpt_turn_reservations ADD COLUMN ${name} ${type}`)
        .run();
    } catch (error) {
      if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error)))
        throw error;
    }
  }
}
// Uzum Bank orders (migrations/0065). gpt_payment_orders cannot take a third
// provider (its CHECK is fixed), so Uzum rows live in a sibling table with the
// same ledger columns; gpt_payment_orders_all is the cross-provider read path.
export const UZUM_BILLING_DDL = [
  `CREATE TABLE IF NOT EXISTS gpt_uzum_orders (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL, id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider='uzum'),
    mode TEXT NOT NULL CHECK(mode IN ('test','live')), request_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount=2000000), currency TEXT NOT NULL CHECK(currency='UZS'),
    state TEXT NOT NULL CHECK(state IN ('pending','prepared','paid','cancelled','refunded')),
    external_id TEXT, provider_time INTEGER, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    create_time INTEGER NOT NULL DEFAULT 0, perform_time INTEGER NOT NULL DEFAULT 0,
    cancel_time INTEGER NOT NULL DEFAULT 0, reason INTEGER, version INTEGER NOT NULL DEFAULT 0,
    api TEXT NOT NULL DEFAULT 'checkout' CHECK(api IN ('checkout','merchant')),
    redirect_url TEXT, refund_operation_id TEXT, refund_requested_at INTEGER,
    UNIQUE(org_id,user_id,request_id), UNIQUE(org_id,provider,mode,external_id))`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_uzum_orders_user ON gpt_uzum_orders(org_id,user_id,created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_gpt_uzum_orders_pending ON gpt_uzum_orders(org_id,user_id,provider,mode) WHERE state IN ('pending','prepared')`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_uzum_orders_statement ON gpt_uzum_orders(org_id,provider,mode,provider_time)`,
  `CREATE VIEW IF NOT EXISTS gpt_payment_orders_all AS
    SELECT seq,org_id,id,user_id,provider,mode,request_id,amount,currency,state,external_id,provider_time,created_at,expires_at,create_time,perform_time,cancel_time,reason,version FROM gpt_payment_orders
    UNION ALL
    SELECT seq,org_id,id,user_id,provider,mode,request_id,amount,currency,state,external_id,provider_time,created_at,expires_at,create_time,perform_time,cancel_time,reason,version FROM gpt_uzum_orders`,
];
// One bootstrap per binding; a failed one is forgotten so the next request
// retries it instead of replaying the error.
function once(
  cache: WeakMap<D1Database, Promise<void>>,
  db: D1Database,
  create: () => Promise<unknown>,
): Promise<void> {
  let pending = cache.get(db);
  if (!pending) {
    pending = create()
      .then(() => undefined)
      .catch((error) => {
        cache.delete(db);
        throw error;
      });
    cache.set(db, pending);
  }
  return pending;
}
const billingBootstraps = new WeakMap<D1Database, Promise<void>>();
const uzumBootstraps = new WeakMap<D1Database, Promise<void>>();
/**
 * The 0064 ledger and the 0066 chat runtime objects. Every billing path runs
 * it, the chat turn included. A release applies migrations/0066 first; this
 * bootstrap then only confirms it.
 */
export function ensureBillingSchema(db: D1Database): Promise<void> {
  return once(billingBootstraps, db, async () => {
    await db.batch(BILLING_DDL.map((sql) => db.prepare(sql)));
    await addChatRuntimeColumns(db);
    await db.batch(CHAT_RUNTIME_DDL.map((sql) => db.prepare(sql)));
  });
}
/**
 * The 0065 objects, bootstrapped on Uzum paths only: payments/uzum*,
 * internal/gpt-uzum-refund and the Uzum branches of gpt/account and
 * gpt/subscribe while UZUM_API is set. A chat turn never runs this DDL, so a
 * failure here cannot take the chat down. The other readers of the view rely
 * on migrations/0065, which a release applies before the code that reads it.
 */
export function ensureUzumSchema(db: D1Database): Promise<void> {
  // 0064 first: the view reads gpt_payment_orders.
  return once(uzumBootstraps, db, () =>
    ensureBillingSchema(db).then(() =>
      db.batch(UZUM_BILLING_DDL.map((sql) => db.prepare(sql))),
    ),
  );
}
