import type {
  LeadRadarCrawlerJobMutationResponse,
  LeadRadarCrawlerJobReadModel,
  LeadRadarCrawlerJobStatus,
  LeadRadarCrawlerStatusResponse,
} from '../../../src/shared/lead-radar-crawler';
import type { LeadRadarContactCandidate } from '../../../src/shared/lead-radar-contacts';
import type { LeadRadarContactSource } from '../../../src/shared/lead-radar-contact-sources';
import { contactIdentityDigest } from './contact-source-store';
import { safePublicHttpUrl } from './validation';

const TEXT = new TextEncoder();
const ONLINE_MS = 150_000;
const LEASE_MS = 180_000;
const JOB_TTL_MS = 7 * 86_400_000;
const MAX_BODY_BYTES = 200_000;
const MAX_RESUME_URLS = 60;

interface WorkerRow {
  id: string;
  org_id: string;
  name: string;
  last_seen_at: string | null;
}

interface JobRow {
  id: string;
  org_id: string;
  company_id: string;
  request_key: string;
  request_hash: string;
  identity_digest: string;
  identity_json: string;
  url: string;
  host: string;
  status: LeadRadarCrawlerJobStatus;
  reason: string | null;
  available_at: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  attempts: number;
  lease_owner: string | null;
  lease_generation: number;
  lease_expires_at: string | null;
  deadline_at: string | null;
  resume_urls_json: string;
  pages_accepted: number;
  contacts_found: number;
}

export interface LeadRadarCrawlerEnv {
  LEAD_RADAR_CRAWLER_ENABLED?: string;
}

export class LeadRadarCrawlerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'LeadRadarCrawlerError';
  }
}

function iso(date: Date): string {
  return date.toISOString();
}

function future(now: Date, milliseconds: number): string {
  return iso(new Date(now.getTime() + milliseconds));
}

async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', TEXT.encode(value));
  return [...new Uint8Array(hash)]
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.includes('\0')) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RESUME_URLS)
      : [];
  } catch {
    return [];
  }
}

function mapJob(row: JobRow): LeadRadarCrawlerJobReadModel {
  return {
    id: row.id,
    companyId: row.company_id,
    status: row.status,
    reason: row.reason,
    availableAt: row.available_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    pagesAccepted: Number(row.pages_accepted),
    contactsFound: Number(row.contacts_found),
  };
}

function crawlerEnabled(env: LeadRadarCrawlerEnv): boolean {
  return env.LEAD_RADAR_CRAWLER_ENABLED === 'true';
}

function workerOnline(lastSeenAt: string | null, now: Date): boolean {
  if (!lastSeenAt) return false;
  const timestamp = Date.parse(lastSeenAt);
  return Number.isFinite(timestamp)
    && timestamp >= now.getTime() - ONLINE_MS
    && timestamp <= now.getTime() + 30_000;
}

export async function crawlerSchemaReady(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare(`SELECT name FROM sqlite_master
      WHERE type='table' AND name='lead_radar_crawler_jobs'
        AND EXISTS (SELECT 1 FROM d1_migrations WHERE name='0056_lead_radar_crawler.sql')`).first();
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function crawlerOwnerStatus(
  db: D1Database,
  env: LeadRadarCrawlerEnv,
  orgId: string,
  companyId: string,
  now = new Date(),
): Promise<LeadRadarCrawlerStatusResponse> {
  const enabled = crawlerEnabled(env) && await crawlerSchemaReady(db);
  const worker = enabled
    ? await db.prepare(`SELECT id,org_id,name,last_seen_at FROM lead_radar_crawler_workers
        WHERE org_id=? AND revoked=0 ORDER BY COALESCE(last_seen_at,created_at) DESC LIMIT 1`)
      .bind(orgId).first<WorkerRow>()
    : null;
  const jobs = enabled
    ? (await db.prepare(`SELECT * FROM lead_radar_crawler_jobs
        WHERE org_id=? AND company_id=? ORDER BY created_at DESC LIMIT 10`)
      .bind(orgId, companyId).all<JobRow>()).results ?? []
    : [];
  const online = worker ? workerOnline(worker.last_seen_at, now) : false;
  return {
    enabled,
    ready: enabled && online,
    reason: !enabled
      ? 'crawler_disabled'
      : !worker
        ? 'crawler_not_configured'
        : !online
          ? 'crawler_offline'
          : null,
    worker: worker
      ? { id: worker.id, name: worker.name, online, lastSeenAt: worker.last_seen_at }
      : null,
    jobs: jobs.map(mapJob),
  };
}

export async function createCrawlerJob(
  db: D1Database,
  env: LeadRadarCrawlerEnv,
  orgId: string,
  companyId: string,
  requestKey: string,
  lead: {
    name: string;
    phone: string | null;
    address?: string | null;
    city: string;
    website: string | null;
    suppressed?: boolean;
    lifecycle?: string;
  },
  now = new Date(),
): Promise<LeadRadarCrawlerJobMutationResponse> {
  if (!crawlerEnabled(env) || !await crawlerSchemaReady(db)) {
    throw new LeadRadarCrawlerError('crawler_disabled', 503);
  }
  if (lead.suppressed || lead.lifecycle === 'do_not_contact') {
    throw new LeadRadarCrawlerError('crawler_company_suppressed', 409);
  }
  const key = boundedText(requestKey, 160);
  if (!key || key.length < 8) throw new LeadRadarCrawlerError('crawler_request_key_invalid');
  const website = safePublicHttpUrl(lead.website);
  if (!website) throw new LeadRadarCrawlerError('crawler_website_required', 409);
  website.search = '';
  website.hash = '';

  const identity = {
    name: lead.name,
    phone: lead.phone,
    address: lead.address ?? null,
    city: lead.city,
  };
  const identityJson = JSON.stringify(identity);
  if (TEXT.encode(identityJson).byteLength > 8_000) {
    throw new LeadRadarCrawlerError('crawler_identity_too_large');
  }
  const requestHash = await sha256(JSON.stringify([companyId, website.href, identityJson]));
  const existing = await db.prepare(`SELECT * FROM lead_radar_crawler_jobs
    WHERE org_id=? AND request_key=? LIMIT 1`).bind(orgId, key).first<JobRow>();
  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new LeadRadarCrawlerError('crawler_request_key_conflict', 409);
    }
    return { job: mapJob(existing) };
  }

  const active = await db.prepare(`SELECT * FROM lead_radar_crawler_jobs
    WHERE org_id=? AND company_id=? AND status IN ('queued','running','deferred')
    ORDER BY created_at DESC LIMIT 1`).bind(orgId, companyId).first<JobRow>();
  if (active) return { job: mapJob(active) };

  const id = `lrcj_${crypto.randomUUID().replace(/-/g, '')}`;
  const at = iso(now);
  try {
    await db.prepare(`INSERT INTO lead_radar_crawler_jobs
      (id,org_id,company_id,request_key,request_hash,identity_digest,identity_json,url,host,
       status,reason,available_at,created_at,updated_at,expires_at,attempts,lease_owner,
       lease_generation,lease_expires_at,deadline_at,resume_urls_json,pages_accepted,contacts_found)
      VALUES (?,?,?,?,?,?,?,?,?,'queued',NULL,?,?,?,?,0,NULL,0,NULL,NULL,'[]',0,0)`)
      .bind(
        id,
        orgId,
        companyId,
        key,
        requestHash,
        await contactIdentityDigest(identity),
        identityJson,
        website.href,
        website.hostname.toLowerCase(),
        at,
        at,
        at,
        future(now, JOB_TTL_MS),
      ).run();
  } catch (error) {
    const concurrent = await db.prepare(`SELECT * FROM lead_radar_crawler_jobs
      WHERE org_id=? AND company_id=? AND status IN ('queued','running','deferred')
      ORDER BY created_at DESC LIMIT 1`).bind(orgId, companyId).first<JobRow>();
    if (concurrent) return { job: mapJob(concurrent) };
    throw error;
  }

  const created = await db.prepare(`SELECT * FROM lead_radar_crawler_jobs
    WHERE org_id=? AND id=?`).bind(orgId, id).first<JobRow>();
  if (!created) throw new LeadRadarCrawlerError('crawler_job_create_failed', 503);
  return { job: mapJob(created) };
}

export async function cancelCrawlerJob(
  db: D1Database,
  env: LeadRadarCrawlerEnv,
  orgId: string,
  jobId: string,
  now = new Date(),
): Promise<LeadRadarCrawlerJobMutationResponse> {
  if (!crawlerEnabled(env) || !await crawlerSchemaReady(db)) {
    throw new LeadRadarCrawlerError('crawler_disabled', 503);
  }
  const id = boundedText(jobId, 80);
  if (!id) throw new LeadRadarCrawlerError('crawler_job_not_found', 404);
  await db.prepare(`UPDATE lead_radar_crawler_jobs
    SET status='cancelled',reason='owner_cancelled',updated_at=?,lease_owner=NULL,
        lease_expires_at=NULL,deadline_at=NULL
    WHERE org_id=? AND id=? AND status IN ('queued','running','deferred')`)
    .bind(iso(now), orgId, id).run();
  const row = await db.prepare(`SELECT * FROM lead_radar_crawler_jobs
    WHERE org_id=? AND id=?`).bind(orgId, id).first<JobRow>();
  if (!row) throw new LeadRadarCrawlerError('crawler_job_not_found', 404);
  return { job: mapJob(row) };
}

export async function authenticateCrawlerWorker(
  db: D1Database,
  request: Request,
  now = new Date(),
): Promise<WorkerRow> {
  const match = /^Bearer ([A-Za-z0-9._~-]{24,512})$/.exec(request.headers.get('Authorization') ?? '');
  if (!match) throw new LeadRadarCrawlerError('crawler_unauthorized', 401);
  const worker = await db.prepare(`SELECT id,org_id,name,last_seen_at
    FROM lead_radar_crawler_workers WHERE token_hash=? AND revoked=0 LIMIT 1`)
    .bind(await sha256(match[1])).first<WorkerRow>();
  if (!worker) throw new LeadRadarCrawlerError('crawler_unauthorized', 401);
  const at = iso(now);
  await db.prepare(`UPDATE lead_radar_crawler_workers SET last_seen_at=?
    WHERE org_id=? AND id=? AND revoked=0`).bind(at, worker.org_id, worker.id).run();
  return { ...worker, last_seen_at: at };
}

export async function crawlerHeartbeat(
  db: D1Database,
  worker: WorkerRow,
  bodyValue: unknown,
  now = new Date(),
): Promise<Record<string, unknown>> {
  const body = asRecord(bodyValue);
  const jobId = boundedText(body.jobId ?? body.job_id, 80);
  const generation = boundedInteger(
    body.generation ?? body.leaseGeneration ?? body.lease_generation,
    1,
    1_000_000,
  );
  if (jobId && generation) {
    await db.prepare(`UPDATE lead_radar_crawler_jobs
      SET lease_expires_at=?,deadline_at=?,updated_at=?
      WHERE org_id=? AND id=? AND status='running' AND lease_owner=? AND lease_generation=?`)
      .bind(
        future(now, LEASE_MS),
        future(now, LEASE_MS - 30_000),
        iso(now),
        worker.org_id,
        jobId,
        worker.id,
        generation,
      ).run();
  }
  return {
    ok: true,
    workerId: worker.id,
    workerName: worker.name,
    serverTime: iso(now),
  };
}

export async function claimCrawlerJob(
  db: D1Database,
  worker: WorkerRow,
  now = new Date(),
): Promise<Record<string, unknown>> {
  const at = iso(now);
  await db.prepare(`UPDATE lead_radar_crawler_jobs
    SET status='deferred',reason='worker_lease_expired',available_at=?,updated_at=?,
        lease_owner=NULL,lease_expires_at=NULL,deadline_at=NULL
    WHERE org_id=? AND status='running' AND lease_expires_at IS NOT NULL
      AND lease_expires_at<=? AND attempts<12`).bind(at, at, worker.org_id, at).run();
  await db.prepare(`UPDATE lead_radar_crawler_jobs
    SET status='failed',reason='attempt_limit',updated_at=?,lease_owner=NULL,
        lease_expires_at=NULL,deadline_at=NULL
    WHERE org_id=? AND status IN ('queued','deferred','running') AND attempts>=12`)
    .bind(at, worker.org_id).run();

  const row = await db.prepare(`SELECT job.* FROM lead_radar_crawler_jobs job
    LEFT JOIN lead_radar_crawler_hosts host ON host.host=job.host
    WHERE job.org_id=? AND job.status IN ('queued','deferred')
      AND job.available_at<=? AND job.expires_at>? AND job.attempts<12
      AND (host.host IS NULL OR host.next_allowed_at<=?)
    ORDER BY job.available_at,job.created_at LIMIT 1`)
    .bind(worker.org_id, at, at, at).first<JobRow>();
  if (!row) return { ok: true, job: null, retryAfterSeconds: 15, serverTime: at };

  const generation = Number(row.lease_generation) + 1;
  const leaseExpiresAt = future(now, LEASE_MS);
  const deadlineAt = future(now, LEASE_MS - 30_000);
  const result = await db.prepare(`UPDATE lead_radar_crawler_jobs
    SET status='running',reason=NULL,attempts=attempts+1,lease_owner=?,
        lease_generation=?,lease_expires_at=?,deadline_at=?,updated_at=?
    WHERE org_id=? AND id=? AND status IN ('queued','deferred')
      AND available_at<=? AND expires_at>?`)
    .bind(
      worker.id,
      generation,
      leaseExpiresAt,
      deadlineAt,
      at,
      worker.org_id,
      row.id,
      at,
      at,
    ).run();
  if (Number(result.meta.changes) !== 1) {
    return { ok: true, job: null, retryAfterSeconds: 2, serverTime: at };
  }

  return {
    ok: true,
    job: {
      id: row.id,
      jobId: row.id,
      companyId: row.company_id,
      orgId: row.org_id,
      url: row.url,
      host: row.host,
      identity: JSON.parse(row.identity_json) as Record<string, unknown>,
      identityDigest: row.identity_digest,
      generation,
      leaseGeneration: generation,
      leaseExpiresAt,
      deadlineAt,
      expiresAt: row.expires_at,
      resumeUrls: parseStringArray(row.resume_urls_json),
      maxPages: 60,
      maxContacts: 480,
    },
    serverTime: at,
  };
}

function normalizeCandidate(
  value: unknown,
  sourceUrl: string,
  observedAt: string,
): LeadRadarContactCandidate | null {
  const row = asRecord(value);
  const kind = row.kind === 'telegram' || row.kind === 'phone' ? row.kind : null;
  const rawValue = boundedText(row.value ?? row.url ?? row.username, 512);
  const ownership = row.ownership === 'company' || row.ownership === 'unconfirmed'
    ? row.ownership
    : null;
  if (!kind || !rawValue || !ownership) return null;
  const key = boundedText(row.key, 160) ?? `${kind}:${rawValue}`.slice(0, 160);
  return {
    key,
    kind,
    value: rawValue,
    phoneType: kind === 'phone' && typeof row.phoneType === 'string'
      ? row.phoneType as LeadRadarContactCandidate['phoneType']
      : null,
    ownership,
    lookupEligible: row.lookupEligible === true,
    reason: boundedText(row.reason, 160) ?? 'crawler_public_source',
    sourceUrl,
    evidenceIds: Array.isArray(row.evidenceIds)
      ? row.evidenceIds.filter((item): item is string => typeof item === 'string').slice(0, 12)
      : [],
    observedAt: boundedText(row.observedAt, 64) ?? observedAt,
  };
}

function sanitizeSources(
  value: unknown,
  expectedHost: string,
  now: Date,
): LeadRadarContactSource[] {
  if (!Array.isArray(value)) return [];
  const sources: LeadRadarContactSource[] = [];
  for (const item of value.slice(0, 8)) {
    const source = asRecord(item);
    const rawUrl = boundedText(source.url ?? source.sourceUrl, 2_048);
    const url = safePublicHttpUrl(rawUrl);
    if (!url) continue;
    const host = url.hostname.toLowerCase();
    if (host !== expectedHost && !host.endsWith(`.${expectedHost}`)) continue;
    const observedAt = boundedText(source.observedAt, 64) ?? iso(now);
    const candidates = Array.isArray(source.candidates)
      ? source.candidates
        .slice(0, 24)
        .map((candidate) => normalizeCandidate(candidate, url.href, observedAt))
        .filter((candidate): candidate is LeadRadarContactCandidate => Boolean(candidate))
      : [];
    if (!candidates.length) continue;
    sources.push({
      id: boundedText(source.id, 120) ?? `lrcs_${sources.length + 1}_${awaitableDigestKey(url.href)}`,
      kind: source.kind === 'telegram_profile' ? 'telegram_profile' : 'business_listing',
      url: url.href,
      observedAt,
      candidates,
    });
  }
  return TEXT.encode(JSON.stringify(sources)).byteLength <= 80_000 ? sources : [];
}

function awaitableDigestKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeResumeUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const url = safePublicHttpUrl(typeof item === 'string' ? item : null);
    if (url) unique.add(url.href);
    if (unique.size >= MAX_RESUME_URLS) break;
  }
  return [...unique];
}

export async function acceptCrawlerReceipt(
  db: D1Database,
  worker: WorkerRow,
  bodyValue: unknown,
  now = new Date(),
): Promise<Record<string, unknown>> {
  const body = asRecord(bodyValue);
  const jobId = boundedText(body.jobId ?? body.job_id ?? body.id, 80);
  const receiptId = boundedText(
    body.receiptId ?? body.receipt_id ?? body.idempotencyKey ?? body.idempotency_key,
    80,
  );
  const generation = boundedInteger(
    body.generation ?? body.leaseGeneration ?? body.lease_generation,
    1,
    1_000_000,
  );
  if (!jobId || !receiptId || receiptId.length < 8 || !generation) {
    throw new LeadRadarCrawlerError('crawler_receipt_invalid');
  }

  const job = await db.prepare(`SELECT * FROM lead_radar_crawler_jobs
    WHERE org_id=? AND id=? LIMIT 1`).bind(worker.org_id, jobId).first<JobRow>();
  if (!job) throw new LeadRadarCrawlerError('crawler_job_not_found', 404);
  const payloadDigest = await sha256(JSON.stringify(body));
  const existing = await db.prepare(`SELECT payload_digest FROM lead_radar_crawler_receipts
    WHERE org_id=? AND job_id=? AND receipt_id=? LIMIT 1`)
    .bind(worker.org_id, jobId, receiptId).first<{ payload_digest: string }>();
  if (existing) {
    if (existing.payload_digest !== payloadDigest) {
      throw new LeadRadarCrawlerError('crawler_receipt_conflict', 409);
    }
    return { ok: true, replayed: true, job: mapJob(job) };
  }
  if (job.status !== 'running'
    || job.lease_owner !== worker.id
    || Number(job.lease_generation) !== generation) {
    throw new LeadRadarCrawlerError('crawler_lease_conflict', 409);
  }

  const requested = String(body.status ?? body.outcome ?? '').toLowerCase();
  const status: LeadRadarCrawlerJobStatus = ['completed', 'complete', 'success'].includes(requested)
    ? 'completed'
    : requested === 'partial'
      ? 'partial'
      : ['deferred', 'retry', 'retry_wait'].includes(requested)
        ? 'deferred'
        : requested === 'cancelled'
          ? 'cancelled'
          : 'failed';
  const reason = boundedText(body.reason ?? body.errorCode ?? body.error_code, 80)
    ?? (status === 'completed'
      ? 'public_contacts_checked'
      : status === 'partial'
        ? 'partial_results'
        : status === 'deferred'
          ? 'source_deferred'
          : 'crawler_failed');
  const pagesAccepted = boundedInteger(
    body.pagesAccepted ?? body.pages_accepted ?? body.pages,
    0,
    60,
  ) ?? Number(job.pages_accepted);
  const contactsFound = boundedInteger(
    body.contactsFound ?? body.contacts_found ?? body.contacts,
    0,
    480,
  ) ?? Number(job.contacts_found);
  const resumeUrls = normalizeResumeUrls(body.resumeUrls ?? body.resume_urls);
  const retryAfterSeconds = boundedInteger(
    body.retryAfterSeconds ?? body.retry_after_seconds,
    5,
    86_400,
  ) ?? 60;
  const acceptedAt = iso(now);
  const sources = sanitizeSources(
    body.sources ?? body.contactSources ?? body.contact_sources,
    job.host,
    now,
  );

  if (sources.length > 0) {
    const identity = JSON.parse(job.identity_json) as {
      name: string;
      phone: string | null;
      address?: string | null;
      city: string;
    };
    const reportStatus = status === 'completed'
      ? 'complete'
      : status === 'partial'
        ? 'limited'
        : 'unavailable';
    await db.prepare(`INSERT INTO lead_radar_contact_enrichments
      (org_id,company_id,job_id,identity_digest,status,reason,sources_json,checked_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (
        SELECT 1 FROM lead_radar_companies
        WHERE org_id=? AND id=? AND suppressed=0 AND lifecycle<>'do_not_contact'
          AND name=? AND phone IS ? AND address IS ? AND city=?
      )
      ON CONFLICT(org_id,company_id) DO UPDATE SET
        job_id=excluded.job_id,
        identity_digest=excluded.identity_digest,
        status=excluded.status,
        reason=excluded.reason,
        sources_json=excluded.sources_json,
        checked_at=excluded.checked_at,
        expires_at=excluded.expires_at`)
      .bind(
        worker.org_id,
        job.company_id,
        job.id,
        job.identity_digest,
        reportStatus,
        reason,
        JSON.stringify(sources),
        acceptedAt,
        future(now, 86_400_000),
        worker.org_id,
        job.company_id,
        identity.name,
        identity.phone,
        identity.address ?? null,
        identity.city ?? '',
      ).run();
  }

  const summaryJson = JSON.stringify({
    status,
    reason,
    pagesAccepted,
    contactsFound,
    resumeUrlCount: resumeUrls.length,
  });
  await db.prepare(`INSERT INTO lead_radar_crawler_receipts
    (org_id,job_id,receipt_id,worker_id,generation,payload_digest,accepted_at,summary_json)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(
      worker.org_id,
      jobId,
      receiptId,
      worker.id,
      generation,
      payloadDigest,
      acceptedAt,
      summaryJson,
    ).run();

  const availableAt = status === 'deferred'
    ? future(now, retryAfterSeconds * 1_000)
    : acceptedAt;
  const update = await db.prepare(`UPDATE lead_radar_crawler_jobs
    SET status=?,reason=?,available_at=?,updated_at=?,lease_owner=NULL,
        lease_expires_at=NULL,deadline_at=NULL,resume_urls_json=?,pages_accepted=?,contacts_found=?
    WHERE org_id=? AND id=? AND status='running' AND lease_owner=? AND lease_generation=?`)
    .bind(
      status,
      reason,
      availableAt,
      acceptedAt,
      JSON.stringify(resumeUrls),
      pagesAccepted,
      contactsFound,
      worker.org_id,
      jobId,
      worker.id,
      generation,
    ).run();
  if (Number(update.meta.changes) !== 1) {
    throw new LeadRadarCrawlerError('crawler_lease_conflict', 409);
  }

  if (status === 'deferred') {
    await db.prepare(`INSERT INTO lead_radar_crawler_hosts(host,next_allowed_at,reason,updated_at)
      VALUES(?,?,?,?)
      ON CONFLICT(host) DO UPDATE SET
        next_allowed_at=excluded.next_allowed_at,
        reason=excluded.reason,
        updated_at=excluded.updated_at`)
      .bind(job.host, availableAt, reason, acceptedAt).run();
  }
  const updated = await db.prepare(`SELECT * FROM lead_radar_crawler_jobs
    WHERE org_id=? AND id=?`).bind(worker.org_id, jobId).first<JobRow>();
  return { ok: true, replayed: false, job: updated ? mapJob(updated) : mapJob(job) };
}

export async function readCrawlerBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new LeadRadarCrawlerError('crawler_payload_too_large', 413);
  }
  const value = await request.text();
  if (TEXT.encode(value).byteLength > MAX_BODY_BYTES) {
    throw new LeadRadarCrawlerError('crawler_payload_too_large', 413);
  }
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new LeadRadarCrawlerError('crawler_payload_invalid');
  }
}

export function crawlerErrorResponse(error: unknown, requestId = crypto.randomUUID()): Response {
  const value = error instanceof LeadRadarCrawlerError
    ? error
    : new LeadRadarCrawlerError('crawler_internal_error', 500);
  return Response.json({ error: value.code, request_id: requestId }, {
    status: value.status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
    },
  });
}
