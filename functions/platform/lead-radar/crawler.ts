import { CRAWLER_LIMITS, CRAWLER_REASONS, LEAD_RADAR_CRAWLER_SCHEMA, LEAD_RADAR_CRAWLER_EXTRACTOR,
  type LeadRadarCrawlerClaim, type LeadRadarCrawlerJobState, type LeadRadarCrawlerJobSummary,
  type LeadRadarCrawlerResult, type LeadRadarCrawlerStatus } from '../../../src/shared/lead-radar-crawler';
import type { LeadRadarEvidence } from '../../../src/shared/lead-radar';
import { safePublicHttpUrl } from './validation';
import { normalizeSchemaSql } from './schema-sql';

export const CRAWLER_MIGRATION = '0056_lead_radar_crawler.sql';
export const CRAWLER_SCHEMA_FINGERPRINT = '2bbde4f8d40f001d7e9174ffbf422a221961ead0098965ad6cb79e0db65e7d8a';
const TABLES = ['lead_radar_crawler_workers', 'lead_radar_crawler_jobs',
  'lead_radar_crawler_receipts', 'lead_radar_crawler_hosts'];
const JSON_BYTES = 64 * 1024;
const LEASE_MS = 180_000;
const DEADLINE_MS = 120_000;
const MAX_AGE_MS = 24 * 60 * 60_000;
const HEX = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
export async function crawlerDigest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class CrawlerError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); }
}
export interface CrawlerEnvironment { LEAD_RADAR_CRAWLER_ENABLED?: string; LEAD_RADAR_ALLOWED_ORGS?: string }
export function crawlerEnabled(env: CrawlerEnvironment, orgId: string): boolean {
  return env.LEAD_RADAR_CRAWLER_ENABLED === 'true'
    && (env.LEAD_RADAR_ALLOWED_ORGS ?? '').split(',').map(x => x.trim()).includes(orgId);
}
export async function crawlerSchemaFingerprint(db: D1Database): Promise<string> {
  const rows = (await db.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master
    WHERE tbl_name IN (SELECT value FROM json_each(?)) ORDER BY name`).bind(JSON.stringify(TABLES))
    .all<{ type: string; name: string; tbl_name: string; sql: string | null }>()).results ?? [];
  return crawlerDigest(JSON.stringify(rows.map(row => [row.type, row.name, row.tbl_name,
    typeof row.sql === 'string' ? normalizeSchemaSql(row.sql) : null])));
}
export async function crawlerSchemaReady(db: D1Database): Promise<boolean> {
  try {
    const ledger = await db.prepare('SELECT name FROM d1_migrations WHERE name=?').bind(CRAWLER_MIGRATION).first();
    return Boolean(ledger) && await crawlerSchemaFingerprint(db) === CRAWLER_SCHEMA_FINGERPRINT;
  } catch { return false; }
}
export async function requireCrawlerSchema(db: D1Database): Promise<void> {
  if (!await crawlerSchemaReady(db)) throw new CrawlerError('crawler_schema_unavailable', 503);
}

/** Every collector body is bounded while reading, including absent Content-Length. */
export async function readCrawlerBody(request: Request, maxBytes = JSON_BYTES): Promise<unknown> {
  if (request.headers.get('content-encoding') && request.headers.get('content-encoding') !== 'identity') {
    throw new CrawlerError('crawler_invalid_body', 400);
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new CrawlerError('crawler_invalid_body', 415);
  }
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new CrawlerError('crawler_payload_too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new CrawlerError('crawler_invalid_body', 400);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0; let raw = '';
  const timer = setTimeout(() => { void reader.cancel().catch(() => undefined); }, 15_000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new CrawlerError('crawler_payload_too_large', 413);
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if (error instanceof CrawlerError) throw error;
    throw new CrawlerError('crawler_invalid_body', 400);
  } finally { clearTimeout(timer); await reader.cancel().catch(() => undefined); }
}
export function crawlerRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CrawlerError('crawler_invalid_body', 400);
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function sameOriginUrl(value: unknown, origin?: string): URL | null {
  if (typeof value !== 'string' || value.length > 2048
    || [...value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null;
  const url = safePublicHttpUrl(value);
  if (!url || url.username || url.password || url.hash || (url.port && !['80', '443'].includes(url.port))) return null;
  return !origin || url.origin === origin ? url : null;
}
/** A cheap wire-format check, not Telegram account resolution or phone ownership. */
function canonicalTelegram(value: string): boolean {
  const path = value.startsWith('https://t.me/') ? value.slice(13) : '';
  if (/^\+[1-9][0-9]{7,14}$/.test(path) || /^m\/[A-Za-z0-9_-]{4,128}$/.test(path)) return true;
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(path)
    && !['share', 'joinchat', 'login', 'proxy', 'socks', 'addstickers', 'addemoji', 'invoice', 'contact'].includes(path.toLowerCase());
}
export function parseCrawlerResult(input: unknown): LeadRadarCrawlerResult {
  const value = crawlerRecord(input);
  if (value.schema !== LEAD_RADAR_CRAWLER_SCHEMA || typeof value.jobId !== 'string' || !ID.test(value.jobId)
    || typeof value.receiptId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(value.receiptId)
    || !Number.isSafeInteger(value.leaseGeneration) || Number(value.leaseGeneration) < 1
    || typeof value.identityDigest !== 'string' || !HEX.test(value.identityDigest)
    || !['completed', 'partial', 'deferred', 'failed'].includes(String(value.status))
    || !CRAWLER_REASONS.includes(value.reason as typeof CRAWLER_REASONS[number])
    || !Array.isArray(value.pages) || value.pages.length > CRAWLER_LIMITS.maxPages
    || value.extractorVersion !== LEAD_RADAR_CRAWLER_EXTRACTOR
    || !Array.isArray(value.evidence) || value.evidence.length > 55
    || !Array.isArray(value.resumeUrls) || value.resumeUrls.length > CRAWLER_LIMITS.maxPages
    || (value.retryAt !== null && !timestamp(value.retryAt))) throw new CrawlerError('crawler_invalid_result', 400);
  let bytes = 0;
  const urls = new Set<string>();
  for (const inputPage of value.pages) {
    const page = crawlerRecord(inputPage);
    if (page.status !== 200 || !sameOriginUrl(page.url) || !sameOriginUrl(page.requestedUrl)
      || 'html' in page || !Number.isSafeInteger(page.bytes) || Number(page.bytes) < 1
      || !timestamp(page.fetchedAt) || typeof page.sha256 !== 'string' || !HEX.test(page.sha256)) {
      throw new CrawlerError('crawler_invalid_result', 400);
    }
    const size = Number(page.bytes);
    bytes += size;
    if (size > CRAWLER_LIMITS.maxPageBytes || bytes > CRAWLER_LIMITS.maxTotalBytes || urls.has(String(page.url))) {
      throw new CrawlerError('crawler_invalid_result', 400);
    }
    urls.add(String(page.url));
  }
  let binding: LeadRadarCrawlerResult['binding'] = null;
  if (value.binding !== null) {
    const b = crawlerRecord(value.binding);
    if (!['phone', 'company_name'].includes(String(b.method)) || !Number.isSafeInteger(b.pageIndex)
      || Number(b.pageIndex) < 0 || Number(b.pageIndex) >= value.pages.length) throw new CrawlerError('crawler_invalid_result', 400);
    binding = { method: b.method as 'phone' | 'company_name', pageIndex: Number(b.pageIndex) };
  }
  if (!binding && value.evidence.length) throw new CrawlerError('crawler_invalid_result', 400);
  const pageCount = value.pages.length;
  const evidence = value.evidence.map(inputFact => {
    const f = crawlerRecord(inputFact);
    if (!Number.isSafeInteger(f.pageIndex) || Number(f.pageIndex) < 0 || Number(f.pageIndex) >= pageCount
      || typeof f.value !== 'string' || !f.value || f.value.length > 512
      || [...f.value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
      || typeof f.confidence !== 'number' || !Number.isFinite(f.confidence) || f.confidence < 0 || f.confidence > 1) {
      throw new CrawlerError('crawler_invalid_result', 400);
    }
    let valid = false;
    if (f.fieldPath === 'company_contacts.phone') valid = /^\+[1-9][0-9]{7,14}$/.test(f.value);
    else if (f.fieldPath === 'company_contacts.generic_email') valid = f.value.length <= 254
      && f.value === f.value.toLowerCase() && /^(info|sales|office|hello|contact|support|admin|marketing|reception|booking|zakaz|order|mail)@[^\s@]+\.[^\s@]+$/.test(f.value);
    else if (typeof f.fieldPath === 'string' && /^web\.telegram\.(human|bot|channel|group|business|unknown)$/.test(f.fieldPath)) {
      const path = f.value.slice(13);
      valid = canonicalTelegram(f.value) && (!(path.indexOf('/') < 0 && /bot$/i.test(path)) || f.fieldPath === 'web.telegram.bot');
    }
    if (!valid) throw new CrawlerError('crawler_invalid_result', 400);
    return { pageIndex: Number(f.pageIndex), fieldPath: f.fieldPath as LeadRadarCrawlerResult['evidence'][number]['fieldPath'],
      value: f.value, confidence: Math.min(0.98, f.confidence) };
  });
  if (value.resumeUrls.some(url => !sameOriginUrl(url))
    || (['completed', 'partial'].includes(String(value.status)) && value.pages.length === 0)
    || (value.status === 'failed' && value.pages.length > 0)
    || (value.status === 'deferred' && (!timestamp(value.retryAt) || value.resumeUrls.length === 0))
    || (value.status !== 'deferred' && (value.retryAt !== null || value.resumeUrls.length > 0))) {
    throw new CrawlerError('crawler_invalid_result', 400);
  }
  // Unknown fields are discarded before hashing so callers cannot attach trust flags.
  return { schema: LEAD_RADAR_CRAWLER_SCHEMA, jobId: value.jobId, receiptId: value.receiptId,
    leaseGeneration: Number(value.leaseGeneration), identityDigest: value.identityDigest,
    status: value.status as LeadRadarCrawlerResult['status'], reason: value.reason as LeadRadarCrawlerResult['reason'],
    pages: value.pages.map(inputPage => { const p = crawlerRecord(inputPage); return {
      requestedUrl: String(p.requestedUrl), url: String(p.url), bytes: Number(p.bytes), status: 200 as const,
      fetchedAt: String(p.fetchedAt), sha256: String(p.sha256) }; }),
    retryAt: value.retryAt as string | null, resumeUrls: value.resumeUrls as string[],
    extractorVersion: LEAD_RADAR_CRAWLER_EXTRACTOR, binding, evidence };
}

/** Compact authenticated observations; this is NOT independent source attestation.
 * Full parsing and person/footer guards run in the pinned local extractor. No
 * worker-provided evidence ID, sourceType, classification or send flag is used. */
export async function crawlerEvidence(result: LeadRadarCrawlerResult, orgId: string, companyId: string): Promise<LeadRadarEvidence[]> {
  if (!result.binding) return [];
  const facts = [
    ...result.pages.map((page, pageIndex) => ({ pageIndex, fieldPath: 'web.website', value: new URL(page.url).origin, confidence: 0.94 })),
    ...result.evidence,
  ];
  const admitted = new Map<string, LeadRadarEvidence>();
  for (const fact of facts) {
    const page = result.pages[fact.pageIndex];
    const key = JSON.stringify([orgId, companyId, fact.fieldPath, fact.value, page.url]);
    admitted.set(key, { id: `ev_crc_${(await crawlerDigest(key)).slice(0, 56)}`, fieldPath: fact.fieldPath,
      value: fact.value, sourceUrl: page.url, sourceType: 'company_website',
      classification: fact.fieldPath === 'web.website' ? 'fact' : 'company_data',
      confidence: fact.confidence, observedAt: page.fetchedAt });
  }
  return [...admitted.values()];
}

interface Company { id: string; org_id: string; name: string; phone: string | null; address: string | null;
  city: string; website: string; canonical_key: string; domain: string | null;
  phone_digits: string | null; name_city_key: string | null }
interface JobRow { id: string; org_id: string; company_id: string; request_hash: string;
  identity_digest: string; identity_json: string; url: string; host: string; status: LeadRadarCrawlerJobState;
  reason: string | null; available_at: string; created_at: string; updated_at: string; expires_at: string;
  attempts: number; lease_owner: string | null; lease_generation: number; lease_expires_at: string | null;
  deadline_at: string | null; resume_urls_json: string; pages_accepted: number; contacts_found: number }
export interface CrawlerWorker { id: string; org_id: string }
function summary(row: JobRow): LeadRadarCrawlerJobSummary {
  return { id: row.id, companyId: row.company_id, status: row.status, reason: row.reason,
    availableAt: row.available_at, updatedAt: row.updated_at,
    pagesAccepted: row.pages_accepted, contactsFound: row.contacts_found };
}
const NOT_SUPPRESSED = `c.suppressed=0 AND c.lifecycle<>'do_not_contact' AND NOT EXISTS (
  SELECT 1 FROM lead_radar_suppressions s WHERE s.org_id=c.org_id AND (s.canonical_key=c.canonical_key
    OR (s.domain IS NOT NULL AND s.domain=c.domain)
    OR (s.phone_digits IS NOT NULL AND s.phone_digits=c.phone_digits)
    OR (s.name_city_key IS NOT NULL AND s.name_city_key=c.name_city_key)))`;
const IDENTITY_CURRENT = `EXISTS (SELECT 1 FROM lead_radar_companies c
  WHERE c.org_id=j.org_id AND c.id=j.company_id AND ${NOT_SUPPRESSED}
    AND c.name=json_extract(j.identity_json,'$.name') AND c.phone IS json_extract(j.identity_json,'$.phone')
    AND c.address IS json_extract(j.identity_json,'$.address') AND c.city=json_extract(j.identity_json,'$.city')
    AND c.website=json_extract(j.identity_json,'$.website')
    AND c.canonical_key=json_extract(j.identity_json,'$.canonical_key'))`;
function identity(company: Company): string {
  return JSON.stringify({ name: company.name, phone: company.phone, address: company.address,
    city: company.city, website: company.website, canonical_key: company.canonical_key });
}

export class CrawlerStore {
  constructor(readonly db: D1Database) {}
  async company(orgId: string, companyId: string): Promise<Company | null> {
    return this.db.prepare(`SELECT c.* FROM lead_radar_companies c WHERE c.org_id=? AND c.id=?
      AND c.website IS NOT NULL AND ${NOT_SUPPRESSED}`).bind(orgId, companyId).first<Company>();
  }
  async registerWorker(orgId: string, workerId: string, tokenHash: string, name: string, now: string): Promise<void> {
    if (!/^lrcw_[a-f0-9]{32}$/.test(workerId) || !HEX.test(tokenHash) || !name.trim() || name.length > 80) {
      throw new CrawlerError('crawler_invalid_worker', 400);
    }
    const existing = await this.db.prepare('SELECT org_id,token_hash,revoked FROM lead_radar_crawler_workers WHERE id=?')
      .bind(workerId).first<{ org_id: string; token_hash: string; revoked: number }>();
    if (existing) {
      if (existing.org_id !== orgId || existing.token_hash !== tokenHash || existing.revoked) {
        throw new CrawlerError('crawler_worker_conflict');
      }
      return;
    }
    const result = await this.db.prepare(`INSERT OR IGNORE INTO lead_radar_crawler_workers
      (id,org_id,token_hash,name,created_at) SELECT ?,?,?,?,? WHERE
      (SELECT COUNT(*) FROM lead_radar_crawler_workers WHERE org_id=? AND revoked=0)<3`)
      .bind(workerId, orgId, tokenHash, name.trim(), now, orgId).run();
    if (Number(result.meta.changes) !== 1) throw new CrawlerError('crawler_worker_conflict');
  }
  async authenticate(token: string): Promise<CrawlerWorker | null> {
    if (!/^lrcr_[a-f0-9]{64}$/.test(token)) return null;
    return this.db.prepare('SELECT id,org_id FROM lead_radar_crawler_workers WHERE token_hash=? AND revoked=0')
      .bind(await crawlerDigest(token)).first<CrawlerWorker>();
  }
  async status(orgId: string, companyId: string, now: string): Promise<LeadRadarCrawlerStatus> {
    const worker = await this.db.prepare(`SELECT MAX(last_seen_at) AS last_seen_at,COUNT(*) AS count
      FROM lead_radar_crawler_workers WHERE org_id=? AND revoked=0`).bind(orgId)
      .first<{ last_seen_at: string | null; count: number }>();
    const rows = (await this.db.prepare(`SELECT * FROM lead_radar_crawler_jobs WHERE org_id=? AND company_id=?
      ORDER BY created_at DESC,id DESC LIMIT 10`).bind(orgId, companyId).all<JobRow>()).results ?? [];
    return { enabled: true, ready: Boolean(worker?.count),
      ...(!worker?.count ? { reason: 'crawler_not_configured' } : {}),
      worker: worker?.count ? { online: Boolean(worker.last_seen_at && Date.parse(worker.last_seen_at) > Date.parse(now) - 90_000),
        lastSeenAt: worker.last_seen_at } : null, jobs: rows.map(summary) };
  }
  async job(orgId: string, jobId: string): Promise<JobRow | null> {
    return this.db.prepare('SELECT * FROM lead_radar_crawler_jobs WHERE org_id=? AND id=?')
      .bind(orgId, jobId).first<JobRow>();
  }
  async enqueue(orgId: string, companyId: string, key: string, now: string): Promise<{ job: LeadRadarCrawlerJobSummary; replayed: boolean }> {
    if (!ID.test(companyId) || !/^[A-Za-z0-9_:.-]{8,160}$/.test(key)) throw new CrawlerError('crawler_invalid_input', 400);
    const hash = await crawlerDigest(JSON.stringify({ companyId }));
    const previous = await this.db.prepare('SELECT * FROM lead_radar_crawler_jobs WHERE org_id=? AND request_key=?')
      .bind(orgId, key).first<JobRow>();
    if (previous) {
      if (previous.request_hash !== hash) throw new CrawlerError('crawler_idempotency_conflict');
      return { job: summary(previous), replayed: true };
    }
    const company = await this.company(orgId, companyId);
    if (!company) throw new CrawlerError('crawler_company_unavailable', 404);
    const url = sameOriginUrl(company.website);
    if (!url) throw new CrawlerError('crawler_invalid_website', 400);
    const worker = await this.db.prepare('SELECT id FROM lead_radar_crawler_workers WHERE org_id=? AND revoked=0 LIMIT 1').bind(orgId).first();
    if (!worker) throw new CrawlerError('crawler_not_configured', 503);
    const input = identity(company);
    const id = `lrcj_${crypto.randomUUID().replaceAll('-', '')}`;
    const expires = new Date(Date.parse(now) + MAX_AGE_MS).toISOString();
    const inserted = await this.db.prepare(`INSERT OR IGNORE INTO lead_radar_crawler_jobs
      (id,org_id,company_id,request_key,request_hash,identity_digest,identity_json,url,host,status,available_at,created_at,updated_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,?, 'queued',?,?,?,? FROM lead_radar_companies c
      WHERE c.org_id=? AND c.id=? AND ${NOT_SUPPRESSED} AND c.name=? AND c.phone IS ?
        AND c.address IS ? AND c.city=? AND c.website=? AND c.canonical_key=?
        AND (SELECT COUNT(*) FROM lead_radar_crawler_jobs WHERE org_id=? AND status IN ('queued','running','deferred'))<25`)
      .bind(id, orgId, companyId, key, hash, await crawlerDigest(input), input, url.href, url.hostname,
        now, now, now, expires, orgId, companyId, company.name, company.phone, company.address, company.city,
        company.website, company.canonical_key, orgId).run();
    if (Number(inserted.meta.changes) !== 1) {
      const replay = await this.db.prepare('SELECT * FROM lead_radar_crawler_jobs WHERE org_id=? AND request_key=?').bind(orgId, key).first<JobRow>();
      if (replay && replay.request_hash === hash) return { job: summary(replay), replayed: true };
      throw new CrawlerError(replay ? 'crawler_idempotency_conflict' : 'crawler_busy');
    }
    return { job: summary((await this.job(orgId, id))!), replayed: false };
  }
  async cancel(orgId: string, jobId: string, now: string): Promise<LeadRadarCrawlerJobSummary> {
    await this.db.prepare(`UPDATE lead_radar_crawler_jobs SET status='cancelled',reason='cancelled',updated_at=?,
      lease_owner=NULL,lease_expires_at=NULL WHERE org_id=? AND id=? AND status IN ('queued','running','deferred')`)
      .bind(now, orgId, jobId).run();
    const row = await this.job(orgId, jobId);
    if (!row) throw new CrawlerError('crawler_job_not_found', 404);
    return summary(row);
  }
  async claim(worker: CrawlerWorker, now: string): Promise<LeadRadarCrawlerClaim | null> {
    await this.db.batch([
      this.db.prepare('UPDATE lead_radar_crawler_workers SET last_seen_at=? WHERE org_id=? AND id=? AND revoked=0')
        .bind(now, worker.org_id, worker.id),
      this.db.prepare(`UPDATE lead_radar_crawler_jobs AS j SET status='failed',reason=CASE WHEN NOT ${IDENTITY_CURRENT}
        THEN 'identity_changed' ELSE 'deadline_exceeded' END,updated_at=?,lease_owner=NULL,lease_expires_at=NULL
        WHERE org_id=? AND status IN ('queued','running','deferred')
          AND (expires_at<=? OR (attempts>=12 AND (status<>'running' OR lease_expires_at<=?))
            OR NOT ${IDENTITY_CURRENT})`).bind(now, worker.org_id, now, now),
    ]);
    const deadline = new Date(Date.parse(now) + DEADLINE_MS).toISOString();
    const expiry = new Date(Date.parse(now) + LEASE_MS).toISOString();
    const row = await this.db.prepare(`UPDATE lead_radar_crawler_jobs AS j SET status='running',reason=NULL,
      lease_owner=?,lease_generation=lease_generation+1,lease_expires_at=?,deadline_at=?,attempts=attempts+1,updated_at=?
      WHERE id=(SELECT j.id FROM lead_radar_crawler_jobs j
        WHERE j.org_id=? AND j.expires_at>? AND j.attempts<12 AND ${IDENTITY_CURRENT}
          AND ((j.status IN ('queued','deferred') AND j.available_at<=?) OR (j.status='running' AND j.lease_expires_at<=?))
          AND NOT EXISTS (SELECT 1 FROM lead_radar_crawler_hosts h WHERE h.host=j.host AND h.next_allowed_at>?)
          AND NOT EXISTS (SELECT 1 FROM lead_radar_crawler_jobs other WHERE other.host=j.host AND other.status='running'
            AND other.lease_expires_at>? AND other.id<>j.id)
        ORDER BY j.available_at,j.created_at,j.id LIMIT 1)
      AND EXISTS (SELECT 1 FROM lead_radar_crawler_workers WHERE org_id=? AND id=? AND revoked=0)
      RETURNING *`).bind(worker.id, expiry, deadline, now, worker.org_id, now, now, now, now, now, worker.org_id, worker.id).first<JobRow>();
    if (!row) return null;
    return { schema: LEAD_RADAR_CRAWLER_SCHEMA, id: row.id, orgId: row.org_id, companyId: row.company_id,
      identityDigest: row.identity_digest, url: row.url, leaseGeneration: row.lease_generation,
      leaseExpiresAt: expiry, deadlineAt: deadline, limits: CRAWLER_LIMITS, resumeUrls: JSON.parse(row.resume_urls_json),
      identity: JSON.parse(row.identity_json) as LeadRadarCrawlerClaim['identity'] };
  }
  async heartbeat(worker: CrawlerWorker, jobId: string, generation: number, now: string): Promise<string> {
    const row = await this.db.prepare(`UPDATE lead_radar_crawler_jobs AS j SET updated_at=?,
      lease_expires_at=MIN(?,strftime('%Y-%m-%dT%H:%M:%fZ',deadline_at,'+60 seconds'))
      WHERE org_id=? AND id=? AND status='running' AND lease_owner=? AND lease_generation=?
        AND lease_expires_at>? AND deadline_at>? AND ${IDENTITY_CURRENT}
        AND EXISTS (SELECT 1 FROM lead_radar_crawler_workers WHERE org_id=? AND id=? AND revoked=0)
      RETURNING lease_expires_at`).bind(now, new Date(Date.parse(now) + LEASE_MS).toISOString(), worker.org_id,
        jobId, worker.id, generation, now, now, worker.org_id, worker.id).first<{ lease_expires_at: string }>();
    if (!row) throw new CrawlerError('crawler_lease_lost');
    await this.db.prepare('UPDATE lead_radar_crawler_workers SET last_seen_at=? WHERE org_id=? AND id=? AND revoked=0')
      .bind(now, worker.org_id, worker.id).run();
    return row.lease_expires_at;
  }
  async accept(worker: CrawlerWorker, result: LeadRadarCrawlerResult, now: string): Promise<{
    ok: true; receiptId: string; accepted: true; replayed: boolean; job: LeadRadarCrawlerJobSummary }> {
    const digest = await crawlerDigest(JSON.stringify(result));
    const receipt = await this.db.prepare(`SELECT worker_id,payload_digest,summary_json FROM lead_radar_crawler_receipts
      WHERE org_id=? AND job_id=? AND receipt_id=?`).bind(worker.org_id, result.jobId, result.receiptId)
      .first<{ worker_id: string; payload_digest: string; summary_json: string }>();
    if (receipt) {
      if (receipt.worker_id !== worker.id || receipt.payload_digest !== digest) throw new CrawlerError('crawler_receipt_conflict');
      return { ok: true, receiptId: result.receiptId, accepted: true, replayed: true, job: JSON.parse(receipt.summary_json) };
    }
    const row = await this.job(worker.org_id, result.jobId);
    if (!row || row.status !== 'running' || row.lease_owner !== worker.id || row.lease_generation !== result.leaseGeneration
      || !row.lease_expires_at || row.lease_expires_at <= now) throw new CrawlerError('crawler_lease_lost');
    const company = await this.company(worker.org_id, row.company_id);
    if (!company || row.identity_digest !== result.identityDigest || await crawlerDigest(identity(company)) !== row.identity_digest) {
      throw new CrawlerError('crawler_identity_changed');
    }
    const origin = new URL(row.url).origin;
    if (result.resumeUrls.some(url => !sameOriginUrl(url, origin))
      || (result.retryAt && Date.parse(result.retryAt) < Date.parse(row.deadline_at!) - DEADLINE_MS)) {
      throw new CrawlerError('crawler_invalid_result', 400);
    }
    for (const page of result.pages) {
      if (!sameOriginUrl(page.url, origin) || !sameOriginUrl(page.requestedUrl, origin)
        || Date.parse(page.fetchedAt) < Date.parse(row.deadline_at!) - DEADLINE_MS
        || Date.parse(page.fetchedAt) > Date.parse(now) + 30_000
        || page.fetchedAt > row.deadline_at!) {
        throw new CrawlerError('crawler_invalid_result', 400);
      }
    }
    const evidence = await crawlerEvidence(result, worker.org_id, row.company_id);
    const previousFacts = (await this.db.prepare(`SELECT DISTINCT field_path,value FROM lead_radar_evidence e
      WHERE org_id=? AND company_id=? AND EXISTS (SELECT 1 FROM json_each(?) f
        WHERE e.field_path=json_extract(f.value,'$.fieldPath') AND e.value=json_extract(f.value,'$.value'))`)
      .bind(worker.org_id, row.company_id, JSON.stringify(evidence.map(f => ({ fieldPath: f.fieldPath, value: f.value }))))
      .all<{ field_path: string; value: string }>()).results ?? [];
    const oldContacts = new Set(previousFacts.map(f => `${f.field_path}:${f.value}`));
    const newContacts = new Set(evidence.filter(f => f.fieldPath !== 'web.website' && !oldContacts.has(`${f.fieldPath}:${f.value}`))
      .map(f => `${f.fieldPath}:${f.value}`));
    const next: LeadRadarCrawlerJobSummary = { ...summary(row), status: result.status,
      reason: result.status === 'completed' && !evidence.length ? 'no_relevant_evidence' : result.reason,
      availableAt: result.retryAt && result.retryAt > now ? result.retryAt : now, updatedAt: now,
      pagesAccepted: row.pages_accepted + result.pages.length, contactsFound: row.contacts_found + Math.min(40, newContacts.size) };
    const guard = `j.org_id=? AND j.id=? AND j.status='running' AND j.lease_owner=?
      AND j.lease_generation=? AND j.lease_expires_at>? AND ${IDENTITY_CURRENT}
      AND EXISTS (SELECT 1 FROM lead_radar_crawler_workers w WHERE w.org_id=j.org_id AND w.id=j.lease_owner AND w.revoked=0)`;
    const fence = [worker.org_id, row.id, worker.id, result.leaseGeneration, now];
    const receiptGuard = `EXISTS (SELECT 1 FROM lead_radar_crawler_receipts r WHERE r.org_id=? AND r.job_id=?
      AND r.receipt_id=? AND r.payload_digest=? AND r.worker_id=?)`;
    const receiptBindings = [worker.org_id, row.id, result.receiptId, digest, worker.id];
    const statements = [this.db.prepare(`INSERT OR IGNORE INTO lead_radar_crawler_receipts
      (org_id,job_id,receipt_id,worker_id,generation,payload_digest,accepted_at,summary_json)
      SELECT ?,?,?,?,?,?,?,? FROM lead_radar_crawler_jobs j WHERE ${guard}`)
      .bind(worker.org_id, row.id, result.receiptId, worker.id, result.leaseGeneration, digest, now, JSON.stringify(next), ...fence)];
    // One set-based statement, not one D1 query per fact: the full request must
    // fit the free-tier query budget even when all 60 evidence slots are used.
    if (evidence.length) statements.push(this.db.prepare(`INSERT INTO lead_radar_evidence
      (id,org_id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification)
      SELECT json_extract(f.value,'$.id'),?,?,json_extract(f.value,'$.fieldPath'),
        json_extract(f.value,'$.value'),json_extract(f.value,'$.sourceUrl'),json_extract(f.value,'$.sourceType'),
        json_extract(f.value,'$.observedAt'),json_extract(f.value,'$.confidence'),json_extract(f.value,'$.classification')
      FROM json_each(?) f WHERE ${receiptGuard}
        AND EXISTS (SELECT 1 FROM lead_radar_crawler_jobs j WHERE ${guard})
      ON CONFLICT(id) DO UPDATE SET observed_at=excluded.observed_at,confidence=excluded.confidence,
        classification=excluded.classification WHERE lead_radar_evidence.org_id=excluded.org_id
        AND lead_radar_evidence.company_id=excluded.company_id AND lead_radar_evidence.observed_at<excluded.observed_at`)
      .bind(worker.org_id, row.company_id, JSON.stringify(evidence), ...receiptBindings, ...fence));
    if (result.retryAt) statements.push(this.db.prepare(`INSERT INTO lead_radar_crawler_hosts
      (host,next_allowed_at,reason,updated_at) SELECT ?,?,?,? WHERE ${receiptGuard}
        AND EXISTS (SELECT 1 FROM lead_radar_crawler_jobs j WHERE ${guard})
      ON CONFLICT(host) DO UPDATE SET next_allowed_at=MAX(next_allowed_at,excluded.next_allowed_at),
        reason=excluded.reason,updated_at=excluded.updated_at`)
      .bind(row.host, result.retryAt, result.reason, now, ...receiptBindings, ...fence));
    statements.push(this.db.prepare(`UPDATE lead_radar_crawler_jobs AS j SET status=?,reason=?,available_at=?,updated_at=?,
      pages_accepted=?,contacts_found=?,resume_urls_json=?,lease_owner=NULL,lease_expires_at=NULL
      WHERE ${guard} AND ${receiptGuard}`)
      .bind(next.status, next.reason, next.availableAt, now, next.pagesAccepted, next.contactsFound, JSON.stringify(result.resumeUrls),
        ...fence, ...receiptBindings));
    const changes = await this.db.batch(statements);
    if (Number(changes[0].meta.changes) !== 1) {
      const concurrent = await this.db.prepare(`SELECT payload_digest,worker_id,summary_json FROM lead_radar_crawler_receipts
        WHERE org_id=? AND job_id=? AND receipt_id=?`).bind(worker.org_id, row.id, result.receiptId)
        .first<{ payload_digest: string; worker_id: string; summary_json: string }>();
      if (concurrent?.payload_digest === digest && concurrent.worker_id === worker.id) {
        return { ok: true, receiptId: result.receiptId, accepted: true, replayed: true, job: JSON.parse(concurrent.summary_json) };
      }
      throw new CrawlerError('crawler_lease_lost');
    }
    return { ok: true, receiptId: result.receiptId, accepted: true, replayed: false, job: next };
  }
}
