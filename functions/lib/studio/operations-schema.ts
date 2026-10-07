// Additive 0076. No content, raw challenge token, contact, or card data.
export const STUDIO_OPERATIONS_DDL = [
  `CREATE TABLE IF NOT EXISTS studio_verifications (org_id TEXT NOT NULL,id TEXT NOT NULL,address TEXT NOT NULL,token_hash TEXT NOT NULL,lease_until INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(org_id,id),UNIQUE(org_id,token_hash))`,
  `CREATE INDEX IF NOT EXISTS idx_studio_verification_active ON studio_verifications(org_id,lease_until,address)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_verification_expiry ON studio_verifications(org_id,expires_at)`,
  `CREATE TABLE IF NOT EXISTS studio_refund_requests (org_id TEXT NOT NULL,order_id TEXT NOT NULL,presentations_unused INTEGER NOT NULL,photos_unused INTEGER NOT NULL,requested_at INTEGER NOT NULL,PRIMARY KEY(org_id,order_id))`,
  `CREATE TABLE IF NOT EXISTS studio_credit_grants (org_id TEXT NOT NULL,order_id TEXT NOT NULL,request_id TEXT NOT NULL,entitlement_id TEXT NOT NULL,unit TEXT NOT NULL CHECK(unit IN ('presentation_full','photo_task')),reason TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(org_id,order_id,request_id),UNIQUE(org_id,entitlement_id))`,
  `CREATE TABLE IF NOT EXISTS studio_extensions (org_id TEXT NOT NULL,entitlement_id TEXT NOT NULL,from_at INTEGER NOT NULL,to_at INTEGER NOT NULL,delta_ms INTEGER NOT NULL,applied_at INTEGER NOT NULL,PRIMARY KEY(org_id,entitlement_id,from_at,to_at))`,
  `CREATE INDEX IF NOT EXISTS idx_studio_extensions_window ON studio_extensions(org_id,from_at,to_at,entitlement_id)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_extensions_pending ON studio_extensions(org_id,from_at,to_at,applied_at,entitlement_id)`,
  `CREATE TABLE IF NOT EXISTS studio_extension_windows (org_id TEXT NOT NULL,from_at INTEGER NOT NULL,to_at INTEGER NOT NULL,cursor TEXT NOT NULL DEFAULT '',done INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(org_id,from_at,to_at))`,
  `CREATE TABLE IF NOT EXISTS studio_reversal_attempts (org_id TEXT NOT NULL,order_id TEXT NOT NULL,request_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','confirmed','unknown','failed')),payment_id TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(org_id,order_id),UNIQUE(org_id,request_id))`,
] as const;
export const STUDIO_PAID_OPERATIONS_DDL = [
  `CREATE INDEX IF NOT EXISTS idx_studio_ledger_terminal_gc ON studio_unit_ledger(org_id,created_at) WHERE state IN ('done','released','refused')`,
  `CREATE INDEX IF NOT EXISTS idx_studio_ent_extension ON studio_entitlements(org_id,mode,ends_at,id)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_ent_cursor ON studio_entitlements(org_id,mode,id)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_budget_report ON studio_orders_v2(org_id,owner_test,created_at,id)`,
] as const;

const bootstraps = new WeakMap<D1Database, Promise<void>>();
export function ensureStudioOperationsSchema(db: D1Database): Promise<void> {
  let result = bootstraps.get(db);
  if (!result) {
    result = db.batch(STUDIO_OPERATIONS_DDL.map(sql => db.prepare(sql))).then(() => undefined).catch((e: unknown) => { bootstraps.delete(db); throw e; });
    bootstraps.set(db, result);
  }
  return result;
}
const paidBootstraps = new WeakMap<D1Database,Promise<void>>();
export async function ensureStudioPaidOperationsSchema(db:D1Database):Promise<void> {
  await ensureStudioOperationsSchema(db);
  let p=paidBootstraps.get(db);
  if(!p) { p=db.batch(STUDIO_PAID_OPERATIONS_DDL.map(sql=>db.prepare(sql))).then(()=>undefined).catch((e:unknown)=>{paidBootstraps.delete(db);throw e;});paidBootstraps.set(db,p); }
  await p;
}
