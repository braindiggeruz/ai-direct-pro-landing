/** All amounts are conservative reservations, not a claimed provider invoice. */
export interface FirecrawlLimits {
  dailyCredits: number;
  searchCredits: number;
  domainCredits: number;
  companyCredits: number;
}

export interface FirecrawlJobContext {
  orgId: string;
  searchId: string;
  jobId: string;
  companyId: string;
  leaseOwner: string;
  leaseGeneration: number;
}

export interface FirecrawlRequestRow {
  id: string;
  attempt: number;
  state: 'started' | 'completed' | 'failed' | 'unknown';
  error_code: string | null;
  retry_at: string | null;
  result_json: string | null;
  result_expires_at: string | null;
  created_at: string;
}

export class FirecrawlStore {
  constructor(private readonly db: D1Database) {}

  async available(): Promise<boolean> {
    try {
      const contract = await this.db.prepare(`SELECT
        (SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'lead_radar_firecrawl_requests') AS sql,
        (SELECT COUNT(*) FROM pragma_table_info('lead_radar_firecrawl_requests') WHERE name IN
          ('id','org_id','job_id','search_id','request_key','attempt','operation','domain','credits','state','error_code','retry_at','result_json','result_expires_at','created_at','updated_at')) AS requests,
        (SELECT COUNT(*) FROM pragma_table_info('lead_radar_firecrawl_control') WHERE name IN ('id','error_code','blocked_until','updated_at')) AS control,
        (SELECT COUNT(*) FROM pragma_table_info('lead_radar_firecrawl_reports') WHERE name IN
          ('org_id','job_id','search_id','company_id','mode','status','pages','contacts','direct_contacts','updated_at')) AS reports`)
        .first<{ sql: string | null; requests: number; control: number; reports: number }>();
      return !!contract?.sql && contract.requests === 16 && contract.control === 4 && contract.reports === 10
        && /UNIQUE\s*\(\s*org_id\s*,\s*request_key\s*,\s*attempt\s*\)/i.test(contract.sql);
    } catch { return false; }
  }

  async completedResults(ctx: FirecrawlJobContext, now: string): Promise<Map<string, unknown>> {
    const rows = await this.db.prepare(`SELECT request_key, result_json FROM lead_radar_firecrawl_requests
      WHERE org_id = ? AND job_id = ? AND state = 'completed' AND result_json IS NOT NULL AND result_expires_at > ? LIMIT 14`)
      .bind(ctx.orgId, ctx.jobId, now).all<{ request_key: string; result_json: string }>();
    return new Map((rows.results ?? []).map((row) => [row.request_key, JSON.parse(row.result_json) as unknown]));
  }

  async latest(orgId: string, key: string): Promise<FirecrawlRequestRow | null> {
    return this.db.prepare(`SELECT * FROM lead_radar_firecrawl_requests
      WHERE org_id = ? AND request_key = ? ORDER BY attempt DESC LIMIT 1`)
      .bind(orgId, key).first<FirecrawlRequestRow>();
  }

  async preflight(orgId: string, key: string, now: string) {
    return this.db.prepare(`SELECT r.*,
      (SELECT error_code FROM lead_radar_firecrawl_control WHERE id = 'account' AND blocked_until > ?) AS blocked,
      (SELECT COUNT(*) FROM lead_radar_firecrawl_requests WHERE created_at > ?) AS recent,
      (SELECT COUNT(*) FROM lead_radar_firecrawl_requests WHERE state = 'started' AND created_at > ?) AS active
      FROM (SELECT 1) seed LEFT JOIN lead_radar_firecrawl_requests r ON r.org_id = ? AND r.request_key = ?
      ORDER BY r.attempt DESC LIMIT 1`)
      .bind(now, new Date(Date.parse(now) - 60_000).toISOString(), new Date(Date.parse(now) - 40_000).toISOString(), orgId, key)
      .first<FirecrawlRequestRow & { blocked: string | null; recent: number; active: number }>();
  }

  async blocked(now: string): Promise<string | null> {
    const row = await this.db.prepare(`SELECT error_code FROM lead_radar_firecrawl_control
      WHERE id = 'account' AND blocked_until > ?`).bind(now).first<{ error_code: string }>();
    return row?.error_code ?? null;
  }

  async throttled(now: string): Promise<boolean> {
    const row = await this.db.prepare(`SELECT COUNT(*) AS recent,
      SUM(CASE WHEN state = 'started' AND created_at > ? THEN 1 ELSE 0 END) AS active
      FROM lead_radar_firecrawl_requests WHERE created_at > ?`)
      .bind(new Date(Date.parse(now) - 40_000).toISOString(), new Date(Date.parse(now) - 60_000).toISOString())
      .first<{ recent: number; active: number }>();
    return (row?.recent ?? 0) >= 10 || (row?.active ?? 0) >= 2;
  }

  async reserve(
    ctx: FirecrawlJobContext, key: string, operation: 'search' | 'map' | 'scrape',
    domain: string, attempt: number, limits: FirecrawlLimits, now: string,
  ): Promise<string | null> {
    const id = `fc_${crypto.randomUUID().replaceAll('-', '')}`;
    const credits = operation === 'search' ? 2 : 1;
    const day = `${now.slice(0, 10)}T00:00:00.000Z`;
    // A SINGLE INSERT…SELECT is the budget CAS. No read-then-increment race.
    // The lease fence also stops a stale consumer making new paid requests.
    const result = await this.db.prepare(`INSERT OR IGNORE INTO lead_radar_firecrawl_requests
      (id, org_id, job_id, search_id, request_key, attempt, operation, domain, credits,
       state, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'started', ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM lead_radar_firecrawl_control WHERE id = 'account' AND blocked_until > ?)
        AND EXISTS (SELECT 1 FROM lead_radar_jobs WHERE id = ? AND org_id = ? AND search_id = ?
          AND company_id = ? AND status = 'running' AND lease_owner = ? AND lease_generation = ? AND lease_expires_at > ?)
        AND EXISTS (SELECT 1 FROM lead_radar_companies WHERE id = ? AND org_id = ? AND suppressed = 0)
        AND (SELECT COALESCE(SUM(credits),0) FROM lead_radar_firecrawl_requests WHERE created_at >= ?) + ? <= ?
        AND (SELECT COALESCE(SUM(credits),0) FROM lead_radar_firecrawl_requests WHERE org_id = ? AND search_id = ?) + ? <= ?
        AND (SELECT COALESCE(SUM(credits),0) FROM lead_radar_firecrawl_requests WHERE org_id = ? AND domain = ? AND created_at >= ?) + ? <= ?
        AND (SELECT COALESCE(SUM(r.credits),0) FROM lead_radar_firecrawl_requests r
          JOIN lead_radar_jobs j ON j.org_id=r.org_id AND j.id=r.job_id WHERE r.org_id=? AND j.company_id=?) + ? <= ?
        AND (SELECT COUNT(*) FROM lead_radar_firecrawl_requests WHERE created_at > ?) < 10
        AND (SELECT COUNT(*) FROM lead_radar_firecrawl_requests WHERE state = 'started' AND created_at > ?) < 2
        AND (? = 1 OR EXISTS (SELECT 1 FROM lead_radar_firecrawl_requests WHERE org_id = ? AND request_key = ?
          AND attempt = 1 AND state = 'failed' AND error_code = 'rate_limited' AND retry_at <= ?))`)
      .bind(id, ctx.orgId, ctx.jobId, ctx.searchId, key, attempt, operation, domain, credits, now, now,
        now, ctx.jobId, ctx.orgId, ctx.searchId, ctx.companyId, ctx.leaseOwner, ctx.leaseGeneration, now,
        ctx.companyId, ctx.orgId, day, credits, limits.dailyCredits,
        ctx.orgId, ctx.searchId, credits, limits.searchCredits,
        ctx.orgId, domain, day, credits, limits.domainCredits,
        ctx.orgId, ctx.companyId, credits, limits.companyCredits,
        new Date(Date.parse(now) - 60_000).toISOString(), new Date(Date.parse(now) - 40_000).toISOString(),
        attempt, ctx.orgId, key, now).run();
    return result.meta.changes === 1 ? id : null;
  }

  async finish(id: string, state: 'completed' | 'failed' | 'unknown', value: unknown,
    code: string | null, retryAt: string | null, now: string): Promise<void> {
    const serialized = value === null ? null : JSON.stringify(value);
    if (serialized && new TextEncoder().encode(serialized).byteLength > 90_000) throw new Error('firecrawl_result_too_large');
    await this.db.prepare(`UPDATE lead_radar_firecrawl_requests SET state = ?, error_code = ?, retry_at = ?,
      result_json = ?, result_expires_at = ?, updated_at = ? WHERE id = ? AND state = 'started'`)
      .bind(state, code, retryAt, serialized, new Date(Date.parse(now) + 86_400_000).toISOString(), now, id).run();
  }

  async trip(code: string, now: string, retryAt?: string): Promise<void> {
    // Auth/billing needs an explicit operator reset; UTC midnight cannot resume it.
    await this.db.prepare(`INSERT INTO lead_radar_firecrawl_control (id,error_code,blocked_until,updated_at)
      VALUES ('account',?,?,?) ON CONFLICT(id) DO UPDATE SET
        error_code = excluded.error_code, blocked_until = excluded.blocked_until, updated_at = excluded.updated_at
      WHERE excluded.blocked_until > lead_radar_firecrawl_control.blocked_until`)
      .bind(code, retryAt ?? '9999-12-31T23:59:59.999Z', now).run();
  }

  async report(ctx: FirecrawlJobContext, mode: 'shadow' | 'fallback', status: string,
    pages: number, contacts: number, directContacts: number, now: string): Promise<void> {
    await this.db.prepare(`INSERT INTO lead_radar_firecrawl_reports
      (org_id, job_id, search_id, company_id, mode, status, pages, contacts, direct_contacts, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(org_id,job_id) DO UPDATE SET
        status = excluded.status, pages = excluded.pages, contacts = excluded.contacts,
        direct_contacts = excluded.direct_contacts, updated_at = excluded.updated_at`)
      .bind(ctx.orgId, ctx.jobId, ctx.searchId, ctx.companyId, mode, status, pages, contacts, directContacts, now).run();
  }

  async diagnostics(orgId: string, searchId: string) {
    const [rows, usage] = await Promise.all([
      this.db.prepare(`SELECT company_id, mode, status, pages, contacts, direct_contacts, updated_at
        FROM lead_radar_firecrawl_reports WHERE org_id = ? AND search_id = ? ORDER BY updated_at DESC LIMIT 50`)
        .bind(orgId, searchId).all(),
      this.db.prepare(`SELECT COALESCE(SUM(credits),0) AS reserved_credits,
        SUM(CASE WHEN state IN ('started','unknown') THEN 1 ELSE 0 END) AS uncertain_requests
        FROM lead_radar_firecrawl_requests WHERE org_id = ? AND search_id = ?`).bind(orgId, searchId).first(),
    ]);
    return { reports: rows.results ?? [], usage };
  }

  async purgeResults(now: string): Promise<void> {
    // Retain amounts/idempotency tombstones, never raw HTML; bounded cleanup.
    await this.db.prepare(`UPDATE lead_radar_firecrawl_requests SET result_json = NULL
      WHERE id IN (SELECT id FROM lead_radar_firecrawl_requests WHERE result_json IS NOT NULL
        AND result_expires_at <= ? LIMIT 100)`).bind(now).run();
  }
}
