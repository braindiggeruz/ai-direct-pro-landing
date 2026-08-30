import type { LeadRadarJob, StoredLeadInput } from './types';
import { contactSourceSchemaReady } from './contact-source-store';

const checkedBindings = new WeakSet<D1Database>();
export async function contactDiscoverySchemaReady(db: D1Database): Promise<boolean> {
  if (checkedBindings.has(db)) return true;
  try {
    const row = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name IN ('lead_radar_candidate_pools','lead_radar_contact_checks')) AS tables,
      (SELECT COUNT(*) FROM d1_migrations WHERE name='0050_lead_radar_contact_discovery.sql') AS ledger`).first<{ tables: number; ledger: number }>();
    if (row?.tables !== 2 || row.ledger !== 1) return false;
    // Verify critical columns without inspecting unrelated product tables.
    await db.prepare(`SELECT p.cursor, p.batch_job_id, p.stop_reason, p.resolved_count, p.resume_count, c.proof_digest, c.account_digest, c.status, c.attempts_today, c.attempt_day
      FROM lead_radar_candidate_pools p LEFT JOIN lead_radar_contact_checks c ON c.org_id=p.org_id AND c.search_id=p.search_id LIMIT 0`).all();
    checkedBindings.add(db);
    return true;
  } catch { return false; }
}

export interface ContactCandidatePool {
  candidates_json: string | null;
  candidate_count: number;
  cursor: number;
  batch_start: number;
  batch_job_id: string | null;
  target: number;
  resolved_count: number;
  stop_reason: string | null;
  expires_at: string;
  resume_count: number;
}

const parentFence = `EXISTS (SELECT 1 FROM lead_radar_jobs j WHERE j.org_id=? AND j.id=?
  AND j.search_id=? AND j.status='running' AND j.stage='discovery'
  AND j.lease_owner=? AND j.lease_generation=? AND j.lease_expires_at>?)`;

export class ContactDiscoveryStore {
  constructor(private readonly db: D1Database) {}
  async purgeExpired(now: string): Promise<void> {
    if (await contactSourceSchemaReady(this.db)) await this.db.prepare(`UPDATE lead_radar_contact_enrichments SET sources_json='[]' WHERE rowid IN (
      SELECT e.rowid FROM lead_radar_contact_enrichments e JOIN lead_radar_companies c ON c.org_id=e.org_id AND c.id=e.company_id
      WHERE e.sources_json<>'[]' AND (e.expires_at<=? OR c.suppressed=1 OR c.lifecycle='do_not_contact') LIMIT 100)`).bind(now).run();
    // Runs independently of feature flags. Keep idempotency/cost metadata, not
    // expired pool contents or resolved usernames, in bounded batches.
    await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_candidate_pools SET candidates_json=NULL,
        stop_reason=COALESCE(stop_reason,'time_limit'),updated_at=? WHERE rowid IN
        (SELECT rowid FROM lead_radar_candidate_pools WHERE expires_at<=? AND candidates_json IS NOT NULL LIMIT 25)`).bind(now,now),
      this.db.prepare(`UPDATE lead_radar_contact_checks SET result_json=NULL WHERE id IN
        (SELECT c.id FROM lead_radar_contact_checks c JOIN lead_radar_companies p ON p.org_id=c.org_id AND p.id=c.company_id
         WHERE c.result_json IS NOT NULL AND (c.expires_at<=? OR p.suppressed=1 OR p.lifecycle='do_not_contact') LIMIT 100)`).bind(now),
    ]);
  }
  async getPool(orgId: string, searchId: string): Promise<ContactCandidatePool | null> {
    return this.db.prepare(`SELECT candidates_json,candidate_count,cursor,batch_start,batch_job_id,target,resolved_count,stop_reason,expires_at,resume_count
      FROM lead_radar_candidate_pools WHERE org_id=? AND search_id=?`).bind(orgId, searchId).first<ContactCandidatePool>();
  }
  async recordResolvedCount(orgId: string, searchId: string, count: number): Promise<void> {
    await this.db.prepare('UPDATE lead_radar_candidate_pools SET resolved_count=? WHERE org_id=? AND search_id=?').bind(Math.min(250,count),orgId,searchId).run();
  }
  async initialize(job: LeadRadarJob, candidates: StoredLeadInput[], target: number, now: string): Promise<{ kept: number; dropped: number }> {
    const bounded: StoredLeadInput[] = [];
    let bytes = 2;
    for (const candidate of candidates.slice(0, 250)) {
      const compact = { ...candidate, evidence: candidate.evidence.slice(0, 16), decisionMakers: [], contactCandidates: [] };
      const size = new TextEncoder().encode(JSON.stringify(compact)).byteLength + 1;
      if (bytes + size > 1_400_000) break;
      bounded.push(compact); bytes += size;
    }
    // Re-initialization after a resume keeps created_at and resume_count while
    // replacing the candidate set and reopening the pool for a fresh round.
    await this.db.prepare(`INSERT INTO lead_radar_candidate_pools
      (org_id,search_id,candidates_json,candidate_count,target,created_at,expires_at,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE ${parentFence}
      ON CONFLICT(org_id,search_id) DO UPDATE SET candidates_json=excluded.candidates_json,
        candidate_count=excluded.candidate_count, cursor=0, batch_start=0, batch_job_id=NULL,
        target=excluded.target, stop_reason=NULL, expires_at=excluded.expires_at, updated_at=excluded.updated_at`).bind(
        job.orgId,job.searchId,JSON.stringify(bounded),bounded.length,target,now,
        new Date(Date.parse(now) + 60 * 60_000).toISOString(),now,
        job.orgId,job.id,job.searchId,job.leaseOwner,job.leaseGeneration,now,
      ).run();
    return { kept: bounded.length, dropped: candidates.length - bounded.length };
  }
  async markForResume(orgId: string, searchId: string, now: string): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_candidate_pools
      SET stop_reason=NULL, candidates_json=NULL, candidate_count=0, cursor=0, batch_start=0,
        batch_job_id=NULL, resume_count=resume_count+1, expires_at=?, updated_at=?
      WHERE org_id=? AND search_id=? AND stop_reason='time_limit'`).bind(
        new Date(Date.parse(now) + 60 * 60_000).toISOString(),now,orgId,searchId,
      ).run();
    return result.meta.changes === 1;
  }
  async reserveBatch(job: LeadRadarJob, now: string, batchSize = 10): Promise<StoredLeadInput[]> {
    await this.db.prepare(`UPDATE lead_radar_candidate_pools SET batch_job_id=?,batch_start=cursor,
      cursor=MIN(candidate_count,cursor+?),updated_at=?
      WHERE org_id=? AND search_id=? AND stop_reason IS NULL AND expires_at>?
        AND (batch_job_id IS NULL OR batch_job_id<>?) AND ${parentFence}`).bind(
        job.id,Math.max(1,Math.min(25,batchSize)),now,job.orgId,job.searchId,now,job.id,
        job.orgId,job.id,job.searchId,job.leaseOwner,job.leaseGeneration,now,
      ).run();
    const pool = await this.getPool(job.orgId, job.searchId);
    if (!pool || pool.batch_job_id !== job.id || pool.stop_reason || !pool.candidates_json || pool.expires_at <= now) return [];
    return (JSON.parse(pool.candidates_json) as StoredLeadInput[]).slice(pool.batch_start, pool.cursor);
  }
  /** Audit LR-F-7: a discovery parent that dead-letters while holding a
   * reserved-but-unpersisted candidate window must hand that window back,
   * otherwise a replenish job silently skips it. Re-fanout is safe: the
   * company upsert dedupes by canonical key. */
  async unreserveBatch(orgId: string, searchId: string, jobId: string, now: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_candidate_pools SET batch_job_id=NULL,
      cursor=batch_start, updated_at=?
      WHERE org_id=? AND search_id=? AND batch_job_id=?`).bind(now,orgId,searchId,jobId).run();
  }
  async stop(orgId: string, searchId: string, reason: string, now: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_candidate_pools SET stop_reason=?,candidates_json=NULL,updated_at=?
      WHERE org_id=? AND search_id=? AND stop_reason IS NULL`).bind(reason,now,orgId,searchId).run();
  }
}
