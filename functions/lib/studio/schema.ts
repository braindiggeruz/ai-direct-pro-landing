// Studio tables (migrations/0073_studio.sql) and their runtime bootstrap.
//
// The migration is the documented copy; STUDIO_DDL below is the same DDL
// without comments, statement for statement (tests/studio-schema.test.ts
// compares the two and the schema they build). Every statement is
// CREATE … IF NOT EXISTS, so the bootstrap and the migration may run in
// either order and any number of times. A release still applies 0073 before
// the code that reads it: previews share the production database.
//
// Additive only. No existing table is altered: the chat's gpt_payment_orders
// and gpt_uzum_orders keep CHECK(amount=2000000). Reused unchanged:
// gpt_payment_journal, gpt_payment_consents, gpt_fiscal_receipts (order_id
// 'stu_…'), gpt_model_spend (buckets 'studio_free', 'studio_paid'),
// gpt_rate_limits, gpt_ui_events, gpt_accounts / gpt_auth_sessions (the
// studio account through IdentityStore, unchanged).
//
// No text, photo, contact or IP hash is ever stored here (spec §4.1).
//
// The paid studio (migrations/0075_studio_payments.sql) adds two tables in
// the same way: studio_orders_v2 (orders Payme or Click take; 0073's
// studio_orders accepts Click only and is never altered, read or written)
// and studio_refunds. STUDIO_PAYMENTS_DDL is that file's DDL; the paid
// paths run ensureStudioPaymentsSchema, the free ones never do.

/**
 * The org of every studio row: the consumer billing org, so the shared Click
 * receipt queue (gpt_fiscal_receipts, fiscal-store.ts) reads 'stu_' orders in
 * the same org as the chat's 'pay_' ones. Same value as BILLING_ORG.
 */
export const STUDIO_ORG = "gptbot-consumer";

export const STUDIO_TABLES = [
  "studio_orders",
  "studio_entitlements",
  "studio_unit_ledger",
  "studio_free_usage",
] as const;
export type StudioTable = (typeof STUDIO_TABLES)[number];

export const STUDIO_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS studio_orders (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('kunlik','oylik')),
  plan_version TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('click')),
  click_service_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  request_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 100000000),
  currency TEXT NOT NULL CHECK(currency='UZS'),
  state TEXT NOT NULL CHECK(state IN ('pending','prepared','paid','cancelled','refunded')),
  external_id TEXT,
  provider_doc_id TEXT,
  provider_time INTEGER,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  perform_time INTEGER NOT NULL DEFAULT 0, cancel_time INTEGER NOT NULL DEFAULT 0,
  reason INTEGER, version INTEGER NOT NULL DEFAULT 0,
  owner_test INTEGER NOT NULL DEFAULT 0 CHECK(owner_test IN (0,1)),
  restored_at INTEGER,
  touch TEXT CHECK(touch IN ('last','first') OR touch IS NULL),
  gclid TEXT, gbraid TEXT, wbraid TEXT, yclid TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
  landing_path TEXT,
  referrer_host TEXT, first_seen_at TEXT,
  ga_client_id TEXT, ga_session_id TEXT, ym_client_id TEXT,
  attrib_purged_at INTEGER,
  ga4_state TEXT NOT NULL DEFAULT 'none' CHECK(ga4_state IN ('none','pending','sent','failed','skipped')),
  ga4_attempts INTEGER NOT NULL DEFAULT 0, ga4_next_at INTEGER NOT NULL DEFAULT 0, ga4_sent_at INTEGER,
  ga4_refund_state TEXT NOT NULL DEFAULT 'none' CHECK(ga4_refund_state IN ('none','pending','sent','failed','skipped')),
  UNIQUE(org_id,user_id,request_id),
  UNIQUE(org_id,provider,mode,external_id)
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_orders_open ON studio_orders(org_id,user_id,mode) WHERE state IN ('pending','prepared')`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_user ON studio_orders(org_id,user_id,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_report ON studio_orders(org_id,mode,state,perform_time)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_ga4 ON studio_orders(org_id,ga4_state,ga4_next_at)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_doc ON studio_orders(org_id,provider_doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_attrib ON studio_orders(org_id,attrib_purged_at,created_at)`,
  `CREATE TABLE IF NOT EXISTS studio_entitlements (
  org_id TEXT NOT NULL,
  id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  plan TEXT NOT NULL CHECK(plan IN ('kunlik','oylik','credit')),
  plan_version TEXT NOT NULL,
  starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
  presentations_limit INTEGER NOT NULL, presentations_used INTEGER NOT NULL DEFAULT 0,
  photos_limit INTEGER NOT NULL, photos_used INTEGER NOT NULL DEFAULT 0,
  extended_ms INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  PRIMARY KEY(org_id,id),
  CHECK(presentations_used >= 0 AND presentations_used <= presentations_limit),
  CHECK(photos_used >= 0 AND photos_used <= photos_limit)
)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_ent_user ON studio_entitlements(org_id,user_id,mode,ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_ent_active ON studio_entitlements(org_id,mode,ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_ent_order ON studio_entitlements(org_id,order_id)`,
  `CREATE TABLE IF NOT EXISTS studio_unit_ledger (
  org_id TEXT NOT NULL,
  id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  tool TEXT NOT NULL CHECK(tool IN ('presentation','photo')),
  unit TEXT NOT NULL CHECK(unit IN ('presentation_full','presentation_free','photo_task')),
  source TEXT NOT NULL CHECK(source IN ('free','entitlement','regen')),
  entitlement_id TEXT,
  subject TEXT NOT NULL,
  regen_of TEXT,
  input_mac TEXT NOT NULL,
  consent_version TEXT,
  state TEXT NOT NULL CHECK(state IN ('reserved','delivering','done','released','refused')),
  fault TEXT,
  reason TEXT,
  parts_total INTEGER NOT NULL DEFAULT 1,
  parts_done INTEGER NOT NULL DEFAULT 0,
  steps INTEGER NOT NULL DEFAULT 0, images INTEGER NOT NULL DEFAULT 0,
  shape TEXT,
  model TEXT, tokens_in INTEGER, tokens_out INTEGER, reasoning_tokens INTEGER,
  cost_micro INTEGER NOT NULL DEFAULT 0,
  reserved_micro INTEGER NOT NULL DEFAULT 0, reserve_day TEXT,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, settled_at INTEGER, total_ms INTEGER,
  PRIMARY KEY(org_id,id),
  UNIQUE(org_id,subject,request_id)
)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_ledger_ent ON studio_unit_ledger(org_id,entitlement_id,state)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_ledger_subject ON studio_unit_ledger(org_id,subject,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_ledger_due ON studio_unit_ledger(org_id,state,expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_ledger_created ON studio_unit_ledger(org_id,created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_ledger_one_regen
  ON studio_unit_ledger(org_id,regen_of) WHERE regen_of IS NOT NULL AND state IN ('reserved','delivering','done')`,
  `CREATE TABLE IF NOT EXISTS studio_free_usage (
  org_id TEXT NOT NULL, day TEXT NOT NULL, subject TEXT NOT NULL,
  unit TEXT NOT NULL CHECK(unit IN ('presentation_free','photo_task','returned')),
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(org_id,day,subject,unit)
)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_free_day ON studio_free_usage(org_id,day)`,
];

/** The tables of 0075: the paid studio's orders and refunds. */
export const STUDIO_PAYMENT_TABLES = ["studio_orders_v2", "studio_refunds"] as const;
export type StudioPaymentTable = (typeof STUDIO_PAYMENT_TABLES)[number];

/** migrations/0075_studio_payments.sql without its comments, statement for statement. */
export const STUDIO_PAYMENTS_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS studio_orders_v2 (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('kunlik','oylik')),
  plan_version TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('payme','click')),
  service_id TEXT,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  request_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 100000000),
  currency TEXT NOT NULL CHECK(currency='UZS'),
  state TEXT NOT NULL CHECK(state IN ('pending','prepared','paid','cancelled','refunded')),
  external_id TEXT,
  provider_doc_id TEXT,
  provider_time INTEGER,
  create_time INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  perform_time INTEGER NOT NULL DEFAULT 0, cancel_time INTEGER NOT NULL DEFAULT 0,
  reason INTEGER, version INTEGER NOT NULL DEFAULT 0,
  event_id TEXT,
  owner_test INTEGER NOT NULL DEFAULT 0 CHECK(owner_test IN (0,1)),
  restored_at INTEGER,
  touch TEXT CHECK(touch IN ('last','first') OR touch IS NULL),
  gclid TEXT, gbraid TEXT, wbraid TEXT, yclid TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
  landing_path TEXT,
  referrer_host TEXT, first_seen_at TEXT,
  ga_client_id TEXT, ga_session_id TEXT, ym_client_id TEXT,
  attrib_purged_at INTEGER,
  ga4_state TEXT NOT NULL DEFAULT 'none' CHECK(ga4_state IN ('none','pending','sent','failed','skipped')),
  ga4_attempts INTEGER NOT NULL DEFAULT 0, ga4_next_at INTEGER NOT NULL DEFAULT 0, ga4_sent_at INTEGER,
  ga4_refund_state TEXT NOT NULL DEFAULT 'none' CHECK(ga4_refund_state IN ('none','pending','sent','failed','skipped')),
  UNIQUE(org_id,user_id,request_id),
  UNIQUE(org_id,provider,mode,external_id)
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_orders_v2_open ON studio_orders_v2(org_id,user_id,mode) WHERE state IN ('pending','prepared')`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_user ON studio_orders_v2(org_id,user_id,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_statement ON studio_orders_v2(org_id,provider,mode,provider_time)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_report ON studio_orders_v2(org_id,mode,state,perform_time)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_due ON studio_orders_v2(org_id,state,expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_ga4 ON studio_orders_v2(org_id,ga4_state,ga4_next_at)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_doc ON studio_orders_v2(org_id,provider_doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_attrib ON studio_orders_v2(org_id,attrib_purged_at,created_at)`,
  `CREATE TABLE IF NOT EXISTS studio_refunds (
  org_id TEXT NOT NULL,
  id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 100000000),
  method TEXT NOT NULL CHECK(method IN ('payme_cancel','click_reversal','click_cabinet','transfer')),
  reference TEXT,
  presentations_unused INTEGER NOT NULL DEFAULT 0 CHECK(presentations_unused >= 0),
  photos_unused INTEGER NOT NULL DEFAULT 0 CHECK(photos_unused >= 0),
  receipt_state TEXT NOT NULL CHECK(receipt_state IN ('provider','due','printed')),
  requested_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(org_id,id),
  UNIQUE(org_id,order_id)
)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_refunds_receipt ON studio_refunds(org_id,receipt_state,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_refunds_created ON studio_refunds(org_id,created_at)`,
];

// One bootstrap per binding and isolate; a failed one is forgotten, so the
// next request retries it instead of replaying the error.
const bootstraps = new WeakMap<D1Database, Promise<void>>();
const paymentBootstraps = new WeakMap<D1Database, Promise<void>>();

/**
 * The 0073 objects, in one batch. Idempotent: run it as often as you like,
 * before or after the migration. Studio paths call it only after their flag
 * check, so a studio that is switched off never reaches D1.
 */
export function ensureStudioSchema(db: D1Database): Promise<void> {
  let pending = bootstraps.get(db);
  if (!pending) {
    pending = db
      .batch(STUDIO_DDL.map((sql) => db.prepare(sql)))
      .then(() => undefined)
      .catch((error: unknown) => {
        bootstraps.delete(db);
        throw error;
      });
    bootstraps.set(db, pending);
  }
  return pending;
}

/**
 * The 0073 objects and then the 0075 ones (the paid studio's orders and
 * refunds), each in one batch. Idempotent, in either order with the
 * migrations. Only the paid paths call it (checkout, /me's paid part, the
 * order and restore endpoints, the payment callbacks), after their switch
 * check or their signature.
 */
export function ensureStudioPaymentsSchema(db: D1Database): Promise<void> {
  let pending = paymentBootstraps.get(db);
  if (!pending) {
    pending = ensureStudioSchema(db)
      .then(() => db.batch(STUDIO_PAYMENTS_DDL.map((sql) => db.prepare(sql))))
      .then(() => undefined)
      .catch((error: unknown) => {
        paymentBootstraps.delete(db);
        throw error;
      });
    paymentBootstraps.set(db, pending);
  }
  return pending;
}
