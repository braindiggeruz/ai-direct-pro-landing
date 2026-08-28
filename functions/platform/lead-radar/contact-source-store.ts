import type { LeadRadarContactEnrichment } from '../../../src/shared/lead-radar-contact-sources';
import type { LeadRadarJob } from './types';
import { firecrawlDigest } from './firecrawl-client';
import type { ExpectedCompanyWebsiteIdentity } from './sources';

const ready = new WeakSet<object>();
export async function contactSourceSchemaReady(db: D1Database): Promise<boolean> {
  if (ready.has(db)) return true;
  try {
    const table = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='lead_radar_contact_enrichments'
      AND EXISTS (SELECT 1 FROM d1_migrations WHERE name='0052_lead_radar_contact_sources.sql')`).first();
    if (!table) return false;
    await db.prepare('SELECT org_id,company_id,job_id,identity_digest,status,reason,sources_json,checked_at,expires_at FROM lead_radar_contact_enrichments LIMIT 0').all();
    ready.add(db); return true;
  } catch { return false; }
}
export function contactIdentityDigest(identity: ExpectedCompanyWebsiteIdentity): Promise<string> {
  return firecrawlDigest(JSON.stringify([identity.name, identity.phone, identity.address ?? null, identity.city ?? null]));
}
interface Row { company_id: string; identity_digest: string; status: LeadRadarContactEnrichment['status']; reason: string; sources_json: string; checked_at: string; expires_at: string }

export async function loadContactEnrichments(db: D1Database, orgId: string,
  companies: ReadonlyArray<ExpectedCompanyWebsiteIdentity & { id: string }>, now: string): Promise<Map<string, LeadRadarContactEnrichment>> {
  const result = new Map<string, LeadRadarContactEnrichment>();
  if (!companies.length || !await contactSourceSchemaReady(db)) return result;
  const rows = (await db.prepare(`SELECT company_id,identity_digest,status,reason,sources_json,checked_at,expires_at
    FROM lead_radar_contact_enrichments WHERE org_id=? AND company_id IN (SELECT value FROM json_each(?)) AND expires_at>?`)
    .bind(orgId,JSON.stringify(companies.map((c) => c.id).slice(0,500)),now).all<Row>()).results ?? [];
  for (const row of rows) {
    const company = companies.find((c) => c.id === row.company_id);
    if (!company || await contactIdentityDigest(company) !== row.identity_digest || Date.parse(row.checked_at) > Date.parse(now)+300_000) continue;
    try {
      const sources: LeadRadarContactEnrichment['sources'] = JSON.parse(row.sources_json);
      if (!Array.isArray(sources) || sources.length>4 || sources.some((s) => !s.id || !s.url || !Array.isArray(s.candidates))) continue;
      result.set(row.company_id,{status:row.status,reason:row.reason,sources,checkedAt:row.checked_at,expiresAt:row.expires_at});
    } catch { /* A corrupt proof is never sendable. */ }
  }
  return result;
}
export async function saveContactEnrichment(db: D1Database, job: LeadRadarJob,
  identity: ExpectedCompanyWebsiteIdentity, report: LeadRadarContactEnrichment): Promise<boolean> {
  if (!job.companyId || !job.leaseOwner) return false;
  const result = await db.prepare(`INSERT INTO lead_radar_contact_enrichments
    (org_id,company_id,job_id,identity_digest,status,reason,sources_json,checked_at,expires_at)
    SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM lead_radar_jobs WHERE id=? AND org_id=? AND company_id=?
      AND status='running' AND lease_owner=? AND lease_generation=? AND lease_expires_at>?)
    AND EXISTS (SELECT 1 FROM lead_radar_companies WHERE org_id=? AND id=? AND suppressed=0 AND lifecycle<>'do_not_contact'
      AND name=? AND phone IS ? AND address IS ? AND city=?)
    ON CONFLICT(org_id,company_id) DO UPDATE SET job_id=excluded.job_id,identity_digest=excluded.identity_digest,
      status=excluded.status,reason=excluded.reason,sources_json=excluded.sources_json,checked_at=excluded.checked_at,expires_at=excluded.expires_at`)
    .bind(job.orgId,job.companyId,job.id,await contactIdentityDigest(identity),report.status,report.reason,JSON.stringify(report.sources),report.checkedAt,report.expiresAt,
      job.id,job.orgId,job.companyId,job.leaseOwner,job.leaseGeneration,report.checkedAt,
      job.orgId,job.companyId,identity.name,identity.phone,identity.address ?? null,identity.city ?? '').run();
  return Number(result.meta.changes) === 1;
}
