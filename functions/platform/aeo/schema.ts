export const AEO_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS aeo_runs (
    org_id TEXT NOT NULL, id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('analysis','measurement')),
    status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
    result_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(org_id,id), UNIQUE(org_id,idempotency_key)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_aeo_runs_org_date ON aeo_runs(org_id,created_at DESC)",
  `CREATE TABLE IF NOT EXISTS aeo_reviews (
    org_id TEXT NOT NULL, run_id TEXT NOT NULL, finding_id TEXT NOT NULL,
    revision INTEGER NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
    review_json TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(org_id,run_id,finding_id)
  )`,
];
export async function ensureAeoSchema(db: D1Database): Promise<void> {
  await db.batch(AEO_SCHEMA.map((sql) => db.prepare(sql)));
}
