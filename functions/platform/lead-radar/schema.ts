const bootstrapped = new WeakMap<D1Database, Promise<void>>();

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS lead_radar_searches (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, input_json TEXT NOT NULL,
    status TEXT NOT NULL, candidate_count INTEGER NOT NULL DEFAULT 0,
    verified_count INTEGER NOT NULL DEFAULT 0, p1_count INTEGER NOT NULL DEFAULT 0,
    p2_count INTEGER NOT NULL DEFAULT 0, p3_count INTEGER NOT NULL DEFAULT 0,
    telegram_count INTEGER NOT NULL DEFAULT 0, error_code TEXT,
    created_at TEXT NOT NULL, completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS lead_radar_companies (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, search_id TEXT NOT NULL,
    canonical_key TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
    city TEXT NOT NULL, country TEXT NOT NULL, address TEXT, website TEXT,
    phone TEXT, generic_email TEXT, telegram_url TEXT, score INTEGER NOT NULL,
    confidence REAL NOT NULL, priority TEXT NOT NULL, lifecycle TEXT NOT NULL DEFAULT 'new',
    suppressed INTEGER NOT NULL DEFAULT 0, score_components_json TEXT NOT NULL,
    signals_json TEXT NOT NULL, discovered_at TEXT NOT NULL,
    last_verified_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (org_id, search_id, canonical_key),
    FOREIGN KEY (search_id) REFERENCES lead_radar_searches(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS lead_radar_evidence (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, company_id TEXT NOT NULL,
    field_path TEXT NOT NULL, value TEXT NOT NULL, source_url TEXT NOT NULL,
    source_type TEXT NOT NULL, observed_at TEXT NOT NULL, confidence REAL NOT NULL,
    classification TEXT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES lead_radar_companies(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lead_radar_searches_org_recent
    ON lead_radar_searches (org_id, created_at DESC, id)`,
  `CREATE INDEX IF NOT EXISTS idx_lead_radar_companies_search_priority
    ON lead_radar_companies (org_id, search_id, priority, score DESC, id)`,
  `CREATE INDEX IF NOT EXISTS idx_lead_radar_companies_pipeline
    ON lead_radar_companies (org_id, lifecycle, suppressed, updated_at DESC, id)`,
  `CREATE INDEX IF NOT EXISTS idx_lead_radar_evidence_company
    ON lead_radar_evidence (org_id, company_id, field_path, id)`,
] as const;

export function ensureLeadRadarSchema(db: D1Database): Promise<void> {
  const existing = bootstrapped.get(db);
  if (existing) return existing;
  const pending = db.batch(STATEMENTS.map((sql) => db.prepare(sql))).then(() => undefined);
  bootstrapped.set(db, pending);
  return pending.catch((error) => {
    bootstrapped.delete(db);
    throw error;
  });
}
