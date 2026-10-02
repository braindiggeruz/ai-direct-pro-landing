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
// Paid chat, release R4 (migrations/0068). Fiscal receipts (WP-14, WP-15):
// gpt_fiscal_receipts becomes a retry queue (fiscal-store.ts) for Click and
// for the Uzum Fiscalization API. The columns come after the six of 0064; a
// row written before keeps provider NULL and is never queued. operation_id is
// the Uzum receipt's own idempotency key, stored before the receipt is sent.
// Sign-in through the bot (WP-16): gpt_bot_logins in PAID_CHAT_DDL; the pack
// window's funnel counter (WP-17): gpt_ui_events.
export const FISCAL_RECEIPT_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["provider", "TEXT"],
  ["attempts", "INTEGER NOT NULL DEFAULT 0"],
  ["next_at", "INTEGER NOT NULL DEFAULT 0"],
  ["lease_until", "INTEGER NOT NULL DEFAULT 0"],
  ["payment_id", "TEXT"],
  ["last_error", "TEXT"],
  ["submitted_at", "INTEGER"],
  ["operation_id", "TEXT"],
];
export const PAID_CHAT_DDL = [
  // fiscal-store.ts claims due rows of one provider.
  `CREATE INDEX IF NOT EXISTS idx_gpt_fiscal_due ON gpt_fiscal_receipts(org_id,provider,status_code,next_at)`,
  // Sign-in through the bot @gptbotuz_bot (WP-16, bot-login-store.ts): one row
  // per attempt, for its 10 minutes and a day after. Hashes only: the nonce of
  // the deep link, the browser's cookie and the Telegram identity
  // (telegram-identity.ts); `client` is a browser family and OS such as
  // "Chrome, Android", shown in the bot. No IP, name or Telegram id.
  `CREATE TABLE IF NOT EXISTS gpt_bot_logins (org_id TEXT NOT NULL, id TEXT NOT NULL, nonce_hash TEXT NOT NULL, browser_hash TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('pick','code')), code TEXT NOT NULL, choices TEXT, locale TEXT NOT NULL, client TEXT, status TEXT NOT NULL CHECK(status IN ('pending','claimed','confirmed','rejected','consumed')), tg_hash TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, claimed_at INTEGER, decided_at INTEGER, consumed_at INTEGER, PRIMARY KEY(org_id,id), UNIQUE(org_id,nonce_hash))`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_bot_logins_browser ON gpt_bot_logins(org_id,browser_hash,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_bot_logins_expiry ON gpt_bot_logins(org_id,expires_at)`,
  // The pack window's funnel (WP-17, ui-event-store.ts): one row per event, a
  // closed type and qualifier, the browser tab's random id. No IP, account or
  // chat session; `id` is the browser's, so a resent event counts once.
  `CREATE TABLE IF NOT EXISTS gpt_ui_events (org_id TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, view_id TEXT, detail TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(org_id,id))`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_ui_events_created ON gpt_ui_events(org_id,created_at)`,
];
/**
 * Add the columns a database without the migration lacks: one PRAGMA per
 * table and bootstrap, an ALTER only for a missing column. Another isolate
 * may add the same column in between; its duplicate is not an error.
 */
async function addMissingColumns(
  db: D1Database,
  table: "gpt_turn_reservations" | "gpt_fiscal_receipts" | "gpt_uzum_orders",
  columns: ReadonlyArray<readonly [string, string]>,
): Promise<void> {
  const info = await db
    .prepare(`PRAGMA table_info('${table}')`)
    .all<{ name: string }>();
  const present = new Set((info.results ?? []).map((column) => column.name));
  for (const [name, type] of columns) {
    if (present.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
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
// Uzum, release R4 (migrations/0068, plan WP-15). Two columns of the 0065
// table: confirm_requested_at (a Merchant API /confirm arrived: Uzum has
// debited the payer, so /status finishes the payment instead of failing it)
// and autofiscal (1 = the Checkout registration carried the cart, so Uzum
// prints the receipts itself; otherwise the Fiscalization API prints them).
export const UZUM_ORDER_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["confirm_requested_at", "INTEGER"],
  ["autofiscal", "INTEGER"],
];
// The permanent payment code an account enters in the Uzum Bank app (Merchant
// API), with the terms its owner accepted when the site showed it; and the
// index of the maintenance scans of open and unreceipted Uzum orders.
export const UZUM_PAID_CHAT_DDL = [
  `CREATE TABLE IF NOT EXISTS gpt_payment_codes (org_id TEXT NOT NULL, code TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, terms_version TEXT, terms_url TEXT, terms_locale TEXT, terms_accepted_at INTEGER, PRIMARY KEY(org_id,code), UNIQUE(org_id,user_id))`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_uzum_orders_state ON gpt_uzum_orders(org_id,api,state)`,
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
 * The 0064 ledger, the 0066 chat runtime and the 0068 paid-chat objects.
 * Every billing path runs it, the chat turn included. A release applies the
 * migrations first; this bootstrap then only confirms them.
 */
export function ensureBillingSchema(db: D1Database): Promise<void> {
  return once(billingBootstraps, db, async () => {
    await db.batch(BILLING_DDL.map((sql) => db.prepare(sql)));
    await addMissingColumns(db, "gpt_turn_reservations", CHAT_RUNTIME_COLUMNS);
    await db.batch(CHAT_RUNTIME_DDL.map((sql) => db.prepare(sql)));
    await addMissingColumns(db, "gpt_fiscal_receipts", FISCAL_RECEIPT_COLUMNS);
    await db.batch(PAID_CHAT_DDL.map((sql) => db.prepare(sql)));
  });
}
/**
 * The 0065 objects and the Uzum part of 0068, bootstrapped on Uzum paths
 * only: payments/uzum*, internal/gpt-uzum-refund, the Uzum step of the
 * maintenance tick and the Uzum branches of gpt/account and gpt/subscribe
 * while UZUM_API is set. A chat turn never runs this DDL, so a failure here
 * cannot take the chat down. The other readers of the view rely on
 * migrations/0065, which a release applies before the code that reads it.
 */
export function ensureUzumSchema(db: D1Database): Promise<void> {
  // 0064 first: the view reads gpt_payment_orders.
  return once(uzumBootstraps, db, async () => {
    await ensureBillingSchema(db);
    await db.batch(UZUM_BILLING_DDL.map((sql) => db.prepare(sql)));
    await addMissingColumns(db, "gpt_uzum_orders", UZUM_ORDER_COLUMNS);
    await db.batch(UZUM_PAID_CHAT_DDL.map((sql) => db.prepare(sql)));
  });
}
