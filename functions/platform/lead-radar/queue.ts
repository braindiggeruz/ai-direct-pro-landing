import type { LeadRadarSearchInput, LeadRadarSearchResult } from '../../../src/shared/lead-radar';
import { LeadRadarBusyError, mergeWebsiteFactsIntoLead, sourceCandidateToStoredLead } from './service';
import {
  enrichCompanyWebsiteDetailed,
  OpenStreetMapLeadSource,
  type ExpectedCompanyWebsiteIdentity,
  type WebsiteFacts,
} from './sources';
import { LeadRadarStore } from './store';
import type { WebsiteEnrichmentResult } from './firecrawl-enrichment';
import type {
  LeadRadarDiscoveryResult,
  LeadRadarDispatchReservation,
  LeadRadarJob,
  LeadRadarRequestIdentity,
  LeadRadarQueueMessage,
  LeadRadarQueueSender,
} from './types';

const QUEUE_SCHEMA = 'gptbot.lead-radar.job.v1' as const;
const JOB_ID_PATTERN = /^lrjob_[a-f0-9]{32}$/;
const MAX_QUEUE_BODY_BYTES = 256;
const DISPATCH_LEASE_MS = 30_000;
const DISPATCH_VISIBILITY_TIMEOUT_MS = 5 * 60_000;
// Child jobs are released in the same D1 transaction that completes their
// discovery parent. A distant sentinel prevents a half-built fan-out from
// becoming dispatchable after a worker crash.
const CHILD_DISPATCH_BARRIER = '9999-12-31T23:59:59.999Z';

export type LeadRadarQueueOutcome =
  | { outcome: 'completed' | 'duplicate' | 'invalid' }
  | { outcome: 'retry_wait'; delaySeconds: number; retryDelivery?: true; rescheduleDelivery?: true }
  | { outcome: 'dead_letter'; errorCode: string };

export interface LeadRadarQueueDependencies {
  resolveLeadContacts?: (job: LeadRadarJob, lead: import('./types').StoredLeadInput) => Promise<{ pending: boolean; retryAfterSeconds?: number; reason?: string }>;
  discoverLeadContactSources?: (job: LeadRadarJob, lead: import('./types').StoredLeadInput) => Promise<{ pending: boolean; reason?: string; retryAfterSeconds?: number }>;
  resolveMissingWebsites?: boolean;
  enrichLead?: (website: string | null, expected: ExpectedCompanyWebsiteIdentity, job: LeadRadarJob) => Promise<WebsiteEnrichmentResult>;
  discover?: (input: LeadRadarSearchInput) => Promise<LeadRadarDiscoveryResult>;
  enrichWebsite?: (website: string, expected: ExpectedCompanyWebsiteIdentity) => Promise<{
    facts: WebsiteFacts | null;
    reason: 'enriched' | 'no_relevant_evidence' | 'invalid_website' | 'robots_blocked' | 'http_blocked' | 'source_timeout' | 'source_unavailable';
    retryable: boolean;
  }>;
  now?: () => Date;
  /** Personal data is opt-in and defaults off even when enrichment runs. */
  personalDataEnabled?: boolean;
  /** Test override; production is clamped to a safe range. */
  leaseDurationMs?: number;
  /** Test override; the heartbeat always remains shorter than the lease. */
  heartbeatIntervalMs?: number;
}

export class LeadRadarRequestConflictError extends Error {
  constructor() {
    super('lead_radar_request_key_conflict');
    this.name = 'LeadRadarRequestConflictError';
  }
}

export class LeadRadarInvalidRequestKeyError extends Error {
  constructor() {
    super('lead_radar_request_key_invalid');
    this.name = 'LeadRadarInvalidRequestKeyError';
  }
}

function exactObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function parseLeadRadarQueueMessage(value: unknown): LeadRadarQueueMessage | null {
  let candidate = value;
  if (typeof candidate === 'string') {
    if (new TextEncoder().encode(candidate).byteLength > MAX_QUEUE_BODY_BYTES) return null;
    try { candidate = JSON.parse(candidate) as unknown; } catch { return null; }
  }
  if (!exactObject(candidate)) return null;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || keys[0] !== 'job_id' || keys[1] !== 'schema') return null;
  if (candidate.schema !== QUEUE_SCHEMA || typeof candidate.job_id !== 'string'
    || !JOB_ID_PATTERN.test(candidate.job_id)) return null;
  return { schema: QUEUE_SCHEMA, job_id: candidate.job_id };
}

function messageFor(job: LeadRadarJob): LeadRadarQueueMessage {
  return { schema: QUEUE_SCHEMA, job_id: job.id };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createLeadRadarRequestIdentity(
  requestKey: string,
  input: LeadRadarSearchInput,
): Promise<LeadRadarRequestIdentity> {
  if (requestKey.length < 1 || requestKey.length > 160
    || requestKey.trim() !== requestKey || hasControlCharacters(requestKey)) {
    throw new LeadRadarInvalidRequestKeyError();
  }
  return {
    requestKey,
    requestFingerprint: await sha256Hex(canonicalJson({
      schema: 'gptbot.lead-radar.search-request.v1',
      input,
    })),
  };
}

function dispatchRetryDelaySeconds(attempt: number): number {
  return Math.min(5 * 60, 5 * (2 ** Math.max(0, attempt - 1)));
}

async function dispatchReservation(
  store: LeadRadarStore,
  queue: LeadRadarQueueSender,
  reservation: LeadRadarDispatchReservation,
  at: Date,
): Promise<boolean> {
  try {
    const delaySeconds = Math.max(0, Math.ceil((Date.parse(reservation.job.availableAt) - at.getTime()) / 1_000));
    await queue.send(messageFor(reservation.job), delaySeconds > 0 ? { delaySeconds } : undefined);
    // A consumer may observe and clear this reservation before this CAS. That
    // is a successful dispatch too; a false CAS must never regress it.
    await store.markJobDispatchSent(
      reservation.job.orgId,
      reservation.job.id,
      reservation.dispatchLeaseOwner,
      at.toISOString(),
    );
    return true;
  } catch (error) {
    const retryAt = new Date(at.getTime()
      + dispatchRetryDelaySeconds(reservation.job.dispatchAttemptCount) * 1_000).toISOString();
    await store.releaseJobDispatch(
      reservation.job.orgId,
      reservation.job.id,
      reservation.dispatchLeaseOwner,
      retryAt,
      at.toISOString(),
    );
    console.warn('lead_radar.queue_dispatch_deferred', {
      stage: reservation.job.stage,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return false;
  }
}

async function dispatchSpecificJob(
  store: LeadRadarStore,
  queue: LeadRadarQueueSender,
  job: LeadRadarJob,
  at: Date,
  allowDelayed = false,
): Promise<boolean> {
  const reservation = await store.reserveJobDispatch(
    job.orgId,
    job.id,
    at.toISOString(),
    new Date(at.getTime() + DISPATCH_LEASE_MS).toISOString(),
    allowDelayed ? new Date(at.getTime() + 900_000).toISOString() : undefined,
  );
  return reservation ? dispatchReservation(store, queue, reservation, at) : false;
}

export async function enqueueLeadRadarSearch(
  store: LeadRadarStore,
  orgId: string,
  input: LeadRadarSearchInput,
  queue: LeadRadarQueueSender,
  at = new Date(),
  requestKey: string | null = null,
): Promise<LeadRadarSearchResult> {
  const now = at.toISOString();
  if (input.searchGoal === 'telegram_contacts' && !await store.supportsContactDiscovery()) {
    throw new Error('contact_discovery_unavailable');
  }
  const request = requestKey ? await createLeadRadarRequestIdentity(requestKey, input) : null;
  if (request) {
    const existing = await store.findSearchByRequest(orgId, request.requestKey);
    if (existing) {
      if (existing.requestFingerprint !== request.requestFingerprint) {
        throw new LeadRadarRequestConflictError();
      }
      const replayed = await store.getSearch(orgId, existing.id);
      if (!replayed) throw new Error('lead_radar_search_persistence_failed');
      return replayed;
    }
  }
  const leaseId = `lease_${crypto.randomUUID().replaceAll('-', '')}`;
  const lease = await store.acquireSearchLease(
    orgId,
    leaseId,
    now,
    new Date(at.getTime() + 30_000).toISOString(),
    now,
  );
  if (!lease.acquired) {
    if (request) {
      const raced = await store.findSearchByRequest(orgId, request.requestKey);
      if (raced) {
        if (raced.requestFingerprint !== request.requestFingerprint) {
          throw new LeadRadarRequestConflictError();
        }
        const replayed = await store.getSearch(orgId, raced.id);
        if (replayed) return replayed;
      }
    }
    throw new LeadRadarBusyError(lease.retryAfterSeconds);
  }
  let admittedSearchId: string | null = null;
  try {
    const admitted = await store.createSearchIfAdmitted(orgId, input, at, request);
    if (admitted.disposition === 'conflict') throw new LeadRadarRequestConflictError();
    if (!admitted.id) throw new LeadRadarBusyError(admitted.retryAfterSeconds);
    const searchId = admitted.id;
    if (admitted.disposition === 'replayed') {
      const replayed = await store.getSearch(orgId, searchId);
      if (!replayed) throw new Error('lead_radar_search_persistence_failed');
      return replayed;
    }
    admittedSearchId = searchId;
    const job = await store.createJob(orgId, searchId, null, 'discovery', `discovery:${searchId}`, now, 3);
    await dispatchSpecificJob(store, queue, job, at);
    const result = await store.getSearch(orgId, searchId);
    if (!result) throw new Error('lead_radar_search_persistence_failed');
    return result;
  } catch (error) {
    if (admittedSearchId) {
      await store.failSearchStart(orgId, admittedSearchId, 'queue_start_failed', new Date().toISOString());
    }
    throw error;
  } finally {
    await store.releaseSearchLease(
      orgId,
      leaseId,
      new Date(at.getTime() + 1).toISOString(),
      new Date(at.getTime() + 3_000).toISOString(),
    );
  }
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(15 * 60, 45 * (2 ** Math.max(0, attempt - 1)));
}

// Transient target outages (site down, HTTP 5xx, timeout, transport error)
// get a bounded long backoff inside the enrichment job — 15 min, 1 h, 4 h —
// so a temporarily down website is not written off as terminal within minutes.
// Deliberately terminal causes (robots_blocked, invalid_website, http_blocked)
// are never retried and keep their immediate terminal path.
const TRANSIENT_ENRICHMENT_CODES = new Set(['source_unavailable', 'source_timeout']);
const TRANSIENT_ENRICHMENT_BACKOFF_SECONDS = [15 * 60, 60 * 60, 4 * 60 * 60];

// A contact-resolution job that outlives its in-window waits (offline Bridge,
// parked budget, transient provider errors) regenerates on the same idempotency
// row instead of dead-lettering: each cycle requeues for a fresh 30-minute
// window. The job's immutable created_at is the bound — after 48 hours the
// terminal trace path takes over, so nothing loops forever.
const CONTACT_RESOLUTION_REGENERATION_MS = 48 * 60 * 60_000;
const CONTACT_RESOLUTION_REGENERATION_DELAY_SECONDS = 30 * 60;


function safeFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/city_not_found/.test(message)) return 'city_not_found';
  if (/timeout|abort/i.test(message)) return 'source_timeout';
  if (/payload/i.test(message)) return 'payload_invalid';
  return 'source_unavailable';
}

function researchOnlyWebsiteFacts(facts: WebsiteFacts): WebsiteFacts {
  const humanContact = facts.telegramContact?.type === 'human';
  return {
    ...facts,
    telegramUrl: humanContact ? null : facts.telegramUrl,
    telegramContact: humanContact ? null : facts.telegramContact,
    telegramContacts: facts.telegramContacts?.filter((contact) => contact.type !== 'human'),
    decisionMakers: [],
    evidence: facts.evidence.filter((item) => (
      !item.fieldPath.startsWith('decision_makers.')
      && !item.fieldPath.startsWith('web.telegram.human')
    )),
  };
}

async function retryOrDeadLetter(
  store: LeadRadarStore,
  job: LeadRadarJob,
  code: string,
  at: Date,
  deferUntil?: string,
  continueContacts = false,
): Promise<LeadRadarQueueOutcome> {
  const now = at.toISOString();
  if (!job.leaseOwner) return { outcome: 'duplicate' };
  const created = Date.parse(job.createdAt ?? '');
  const resume = Date.parse(deferUntil ?? '');
  // A successful chunk or capacity wait must not exhaust network-error retries.
  // Immutable creation time prevents endless continuation, even after restart.
  const defer = job.stage === 'enrichment' && Number.isFinite(created)
    && resume > at.getTime() && resume <= created + 30 * 60_000;
  if (job.attemptCount < job.maxAttempts || defer) {
    const transientBackoff = !defer && job.stage === 'enrichment' && TRANSIENT_ENRICHMENT_CODES.has(code)
      ? TRANSIENT_ENRICHMENT_BACKOFF_SECONDS[Math.min(Math.max(job.attemptCount, 1), TRANSIENT_ENRICHMENT_BACKOFF_SECONDS.length) - 1]
      : null;
    const delaySeconds = defer ? Math.max(5, Math.min(900, Math.ceil((resume - at.getTime()) / 1_000)))
      : (transientBackoff ?? retryDelaySeconds(job.attemptCount));
    if (job.companyId) {
      const transitioned = await store.markLeadEnrichmentQueued(
        job.orgId, job.companyId, job.id, job.leaseOwner, now, job.leaseGeneration,
      );
      if (!transitioned) return { outcome: 'retry_wait', delaySeconds: 30 };
    }
    const retried = await store.retryJob(
      job.orgId,
      job.id,
      job.leaseOwner,
      code,
      new Date(at.getTime() + delaySeconds * 1_000).toISOString(),
      now,
      job.leaseGeneration,
      defer,
    );
    if (!retried) return { outcome: 'retry_wait', delaySeconds: 30 };
    await store.refreshSearchFunnel(job.orgId, job.searchId, now);
    return { outcome: 'retry_wait', delaySeconds, retryDelivery: true, ...(defer ? { rescheduleDelivery: true as const } : {}) };
  }
  if (job.companyId) {
    const transitioned = await store.markLeadEnrichmentTerminal(
      job.orgId, job.companyId, job.id, job.leaseOwner,
      'retry_exhausted', job.attemptCount, now,
      job.leaseGeneration,
    );
    if (!transitioned) return { outcome: 'retry_wait', delaySeconds: 30 };
  }
  if (continueContacts && job.companyId) await store.ensureContactResolutionJob(job,now);
  const dead = await store.deadLetterJob(
    job.orgId, job.id, job.leaseOwner, code, now, job.leaseGeneration,
  );
  if (!dead) return { outcome: 'retry_wait', delaySeconds: 30 };
  if (job.stage === 'discovery') {
    if (await store.supportsContactDiscovery()) await store.contactDiscovery.unreserveBatch(job.orgId, job.searchId, job.id, now);
    await store.deadLetterDiscoveryChildren(job.orgId, job.searchId, now);
  }
  await store.refreshSearchFunnel(job.orgId, job.searchId, now);
  return { outcome: 'dead_letter', errorCode: code };
}

async function processDiscovery(
  store: LeadRadarStore,
  job: LeadRadarJob,
  dependencies: LeadRadarQueueDependencies,
  at: Date,
): Promise<LeadRadarQueueOutcome> {
  const now = at.toISOString();
  const input = await store.getSearchInput(job.orgId, job.searchId);
  if (!input) {
    if (job.leaseOwner) {
      const dead = await store.deadLetterJob(
        job.orgId, job.id, job.leaseOwner, 'search_not_found', now, job.leaseGeneration,
      );
      if (dead) await store.deadLetterDiscoveryChildren(job.orgId, job.searchId, now);
    }
    return { outcome: 'dead_letter', errorCode: 'search_not_found' };
  }
  await store.setSearchPhase(job.orgId, job.searchId, 'discovering', now);
  const contactMode = input.searchGoal === 'telegram_contacts';
  if (contactMode && !await store.supportsContactDiscovery()) {
    return retryOrDeadLetter(store, job, 'contact_discovery_unavailable', at);
  }
  const existingPool = contactMode ? await store.contactDiscovery.getPool(job.orgId, job.searchId) : null;
  // A pool left empty by a resume (candidate_count=0) must be re-discovered
  // and re-initialized exactly like a pool that never existed.
  const needsInit = !existingPool || existingPool.candidate_count === 0;
  let discovery: LeadRadarDiscoveryResult = { candidates: [], sourceWarnings: [] };
  try {
    if (needsInit) discovery = dependencies.discover
      ? await dependencies.discover(input)
      : await new OpenStreetMapLeadSource(store).discoverRaw(input);
  } catch (error) {
    return retryOrDeadLetter(store, job, safeFailureCode(error), at);
  }
  const candidates = new Map<string, ReturnType<typeof sourceCandidateToStoredLead>>();
  for (const candidate of discovery.candidates) {
    const humanContact = candidate.telegramContact?.type === 'human';
    const admissibleCandidate = dependencies.personalDataEnabled ? candidate : {
      ...candidate,
      telegramUrl: humanContact ? null : candidate.telegramUrl,
      telegramContact: humanContact ? null : candidate.telegramContact,
      decisionMakers: [],
      evidence: candidate.evidence.filter((item) => (
        !item.fieldPath.startsWith('decision_makers.')
        && !item.fieldPath.startsWith('web.telegram.human')
      )),
    };
    const lead = sourceCandidateToStoredLead(admissibleCandidate, now);
    const existing = candidates.get(lead.canonicalKey);
    if (!existing || lead.evidence.length > existing.evidence.length) candidates.set(lead.canonicalKey, lead);
  }
  if (contactMode && needsInit) {
    const ranked = [...candidates.values()].sort((a, b) =>
      Number(Boolean(b.telegramContact)) * 4 + Number(Boolean(b.website)) * 2 + Number(Boolean(b.phone))
      - Number(Boolean(a.telegramContact)) * 4 - Number(Boolean(a.website)) * 2 - Number(Boolean(a.phone)));
    const { dropped } = await store.contactDiscovery.initialize(job, ranked.slice(0, input.maxCandidates ?? 250), input.desiredCount, now);
    if (dropped > 0) discovery.sourceWarnings = [...discovery.sourceWarnings, 'contact_candidates_capped'];
  }
  const fanout = contactMode ? await store.contactDiscovery.reserveBatch(job, now) : [...candidates.values()].slice(
    0,
    Math.max(1, Math.min(50, Math.trunc(input.desiredCount))),
  );
  if (!job.leaseOwner || !await store.persistDiscoveryFanout(
    job.orgId,
    job.searchId,
    job.id,
    job.leaseOwner,
    job.leaseGeneration,
    fanout,
    now,
    CHILD_DISPATCH_BARRIER,
    dependencies.resolveMissingWebsites === true || Boolean(dependencies.resolveLeadContacts || dependencies.discoverLeadContactSources),
  )) return { outcome: 'retry_wait', delaySeconds: 30 };
  if (needsInit && !await store.recordDiscoveryTelemetry(
    job.orgId,
    job.searchId,
    job.id,
    job.leaseOwner,
    job.leaseGeneration,
    discovery.rawDiscoveredCount ?? discovery.candidates.length,
    discovery.sourceWarnings,
    now,
  )) return { outcome: 'retry_wait', delaySeconds: 30 };
  if (!job.leaseOwner || !await store.completeDiscoveryJobAndReleaseFanout(
    job.orgId,
    job.searchId,
    job.id,
    job.leaseOwner,
    now,
    job.leaseGeneration,
  )) {
    return { outcome: 'retry_wait', delaySeconds: 30 };
  }
  await store.refreshSearchFunnel(job.orgId, job.searchId, now);
  return { outcome: 'completed' };
}

async function runWithJobHeartbeat<T>(
  store: LeadRadarStore,
  job: LeadRadarJob,
  dependencies: LeadRadarQueueDependencies,
  task: () => Promise<T>,
): Promise<{ leaseHeld: boolean; value?: T; error?: unknown }> {
  if (!job.leaseOwner) return { leaseHeld: false };
  const leaseDurationMs = Math.max(60_000, Math.min(10 * 60_000,
    Math.trunc(dependencies.leaseDurationMs ?? 2 * 60_000)));
  const heartbeatIntervalMs = Math.max(1_000, Math.min(
    Math.trunc(dependencies.heartbeatIntervalMs ?? 30_000),
    Math.floor(leaseDurationMs / 3),
  ));
  let leaseHeld = true;
  let heartbeatChain: Promise<void> = Promise.resolve();
  const heartbeat = (): Promise<void> => {
    heartbeatChain = heartbeatChain.then(async () => {
      if (!leaseHeld) return;
      const heartbeatAt = dependencies.now?.() ?? new Date();
      try {
        leaseHeld = await store.extendJobLease(
          job.orgId,
          job.id,
          job.leaseOwner ?? '',
          job.leaseGeneration,
          heartbeatAt.toISOString(),
          new Date(heartbeatAt.getTime() + leaseDurationMs).toISOString(),
        );
      } catch {
        leaseHeld = false;
      }
    });
    return heartbeatChain;
  };
  await heartbeat();
  if (!leaseHeld) return { leaseHeld: false };
  const timer = setInterval(() => { void heartbeat(); }, heartbeatIntervalMs);
  let value: T | undefined;
  let error: unknown;
  try {
    value = await task();
  } catch (caught) {
    error = caught;
  } finally {
    clearInterval(timer);
  }
  await heartbeat();
  return { leaseHeld, value, error };
}

async function processEnrichment(
  store: LeadRadarStore,
  job: LeadRadarJob,
  dependencies: LeadRadarQueueDependencies,
  at: Date,
): Promise<LeadRadarQueueOutcome> {
  const now = at.toISOString();
  if (!job.companyId) {
    if (job.leaseOwner) {
      await store.deadLetterJob(
        job.orgId, job.id, job.leaseOwner, 'company_not_found', now, job.leaseGeneration,
      );
    }
    return { outcome: 'dead_letter', errorCode: 'company_not_found' };
  }
  const stored = await store.getLeadForEnrichment(job.orgId, job.companyId);
  if (!stored) {
    if (!job.leaseOwner || !await store.completeJob(
      job.orgId, job.id, job.leaseOwner, now, job.leaseGeneration,
    )) return { outcome: 'retry_wait', delaySeconds: 30 };
    await store.refreshSearchFunnel(job.orgId, job.searchId, now);
    return { outcome: 'completed' };
  }
  if (job.purpose === 'contact_resolution') {
    let pending: boolean;
    let delaySeconds=15;
    let waitingReason='contact_check_pending';
    try {
      const discovery = dependencies.discoverLeadContactSources
        ? await runWithJobHeartbeat(store,job,dependencies,() => dependencies.discoverLeadContactSources!(job,stored.lead)) : null;
      if (discovery && !discovery.leaseHeld) return {outcome:'retry_wait',delaySeconds:30};
      if (discovery?.error) throw discovery.error;
      const result = discovery?.value?.pending ? {reason:'contact_sources_pending',...discovery.value} : dependencies.resolveLeadContacts
        ? await dependencies.resolveLeadContacts(job, stored.lead) : {pending:true,reason:'contact_checker_unavailable',retryAfterSeconds:60};
      pending=result?.pending ?? false;
      if (result?.reason && /^[a-z][a-z0-9_]{2,79}$/.test(result.reason)) waitingReason=result.reason;
      if (result && 'retryAfterSeconds' in result && typeof result.retryAfterSeconds==='number') delaySeconds=Math.min(900,Math.max(15,result.retryAfterSeconds));
    }
    catch { pending = true; waitingReason='contact_check_unavailable'; } // Never restart website enrichment.
    // The check itself expires after 3 minutes; allow queue delay and short
    // account-wide cooldowns without dropping a fresh check on an older job.
    const waitingForDailyBudget=/^contact_sources_(daily|domain)_budget_exhausted$/.test(waitingReason);
    const freePage=/^contact_sources_free_catalog_page_(\d+)$/.exec(waitingReason);
    const previousFreePage=/^contact_sources_free_catalog_page_(\d+)$/.exec(job.lastErrorCode ?? '');
    // A successfully parsed page advances the bounded (40-page) free catalog.
    // It is not a stalled Telegram check: preserve its requested short delay
    // and durable Queue continuation even when this job began hours ago.
    // Repeated/failed/out-of-range pages keep the existing conservative path.
    const advancingFreeCatalog = freePage && Number(freePage[1]) <= 40
      && Number(freePage[1]) > Math.max(1, Number(previousFreePage?.[1] ?? 1));
    const waitWindowMs=advancingFreeCatalog ? CONTACT_RESOLUTION_REGENERATION_MS
      : waitingForDailyBudget ? 36*60*60_000 : 30*60_000;
    if (pending && Date.parse(now) - Date.parse(job.createdAt ?? now) < waitWindowMs && job.leaseOwner) {
      const transitionNow=dependencies.now?.() ?? new Date();
      const retried = await store.retryJob(job.orgId,job.id,job.leaseOwner,waitingReason,
        new Date(transitionNow.getTime()+delaySeconds*1000).toISOString(),transitionNow.toISOString(),job.leaseGeneration,true);
      return retried ? { outcome: 'retry_wait', delaySeconds, retryDelivery: true, rescheduleDelivery: true }
        : { outcome: 'retry_wait', delaySeconds: 30 };
    }
    if (pending) {
      // Bounded waiting must not turn an unperformed check into "completed".
      // Regeneration first: a young job whose window expired (Bridge offline
      // overnight, budget parked past the 36h daily-budget window) returns to
      // the queue on the same idempotency row, so the company is not silently
      // written off while its check is still performable.
      const jobAgeMs = Date.parse(now) - Date.parse(job.createdAt ?? now);
      if (job.leaseOwner && Number.isFinite(jobAgeMs) && jobAgeMs < CONTACT_RESOLUTION_REGENERATION_MS) {
        const regenerateAt = new Date(Date.parse(now) + CONTACT_RESOLUTION_REGENERATION_DELAY_SECONDS * 1000).toISOString();
        if (await store.requeueContactResolutionJob(job.orgId, job.id, job.leaseOwner, waitingReason, regenerateAt, now, job.leaseGeneration)) {
          await store.refreshSearchFunnel(job.orgId, job.searchId, now);
          return { outcome: 'retry_wait', delaySeconds: 30 };
        }
      }
      if (!job.leaseOwner || !await store.deadLetterJob(job.orgId,job.id,job.leaseOwner,waitingReason,now,job.leaseGeneration)) return {outcome:'retry_wait',delaySeconds:30};
      // Leave a visible terminal trace on the company; a later enrichment cycle
      // re-creates the contact-resolution job (terminal status is re-eligible).
      // Reason must stay within the 0043 CHECK constraint on enrichment_reason.
      await store.markLeadEnrichmentTerminalFromDeadLetter(job.orgId,job.companyId,job.id,'retry_exhausted',job.attemptCount,now);
      await store.refreshSearchFunnel(job.orgId,job.searchId,now);
      return {outcome:'dead_letter',errorCode:waitingReason};
    }
    if (!job.leaseOwner || !await store.completeJob(job.orgId,job.id,job.leaseOwner,now,job.leaseGeneration)) return { outcome: 'retry_wait', delaySeconds: 30 };
    await store.refreshSearchFunnel(job.orgId,job.searchId,now);
    return { outcome: 'completed' };
  }
  const committedEffect = await store.getJobEffectDigest(
    job.orgId, job.id, 'company_enrichment:v1',
  );
  if (committedEffect) {
    if (dependencies.resolveLeadContacts || dependencies.discoverLeadContactSources) await store.ensureContactResolutionJob(job, now);
    if (!job.leaseOwner || !await store.completeJob(
      job.orgId, job.id, job.leaseOwner, now, job.leaseGeneration,
    )) return { outcome: 'retry_wait', delaySeconds: 30 };
    await store.refreshSearchFunnel(job.orgId, job.searchId, now);
    return { outcome: 'completed' };
  }
  if (!stored.lead.website && !dependencies.enrichLead) {
    if (!job.leaseOwner || !await store.markLeadEnrichmentTerminal(
      job.orgId, job.companyId, job.id, job.leaseOwner, 'no_website', job.attemptCount, now,
      job.leaseGeneration,
    )) return { outcome: 'retry_wait', delaySeconds: 30 };
    if (dependencies.resolveLeadContacts || dependencies.discoverLeadContactSources) await store.ensureContactResolutionJob(job, now);
    if (!await store.completeJob(
      job.orgId, job.id, job.leaseOwner, now, job.leaseGeneration,
    )) {
      return { outcome: 'retry_wait', delaySeconds: 30 };
    }
    await store.refreshSearchFunnel(job.orgId, job.searchId, now);
    return { outcome: 'completed' };
  }
  if (!job.leaseOwner || !await store.markLeadEnrichmentProcessing(
    job.orgId, job.companyId, job.id, job.leaseOwner, job.attemptCount, now,
    job.leaseGeneration,
  )) return { outcome: 'retry_wait', delaySeconds: 30 };
  const expected = {
    name: stored.lead.name,
    phone: stored.lead.phone,
    address: stored.lead.address,
  } satisfies ExpectedCompanyWebsiteIdentity;
  const website = stored.lead.website;
  const heartbeatResult = await runWithJobHeartbeat(store, job, dependencies, async () => (
    dependencies.enrichLead
      ? await dependencies.enrichLead(website, { ...expected, city: stored.lead.city }, job)
      : dependencies.enrichWebsite
        ? await dependencies.enrichWebsite(website!, expected)
        : await enrichCompanyWebsiteDetailed(website!, expected)
  ));
  if (!heartbeatResult.leaseHeld) return { outcome: 'retry_wait', delaySeconds: 30 };
  const transitionAt = dependencies.now?.() ?? new Date();
  if (heartbeatResult.error) {
    return retryOrDeadLetter(store, job, safeFailureCode(heartbeatResult.error), transitionAt,undefined,
      Boolean(dependencies.resolveLeadContacts || dependencies.discoverLeadContactSources));
  }
  const result = heartbeatResult.value;
  if (!result) return retryOrDeadLetter(store, job, 'source_unavailable', transitionAt,undefined,
    Boolean(dependencies.resolveLeadContacts || dependencies.discoverLeadContactSources));
  const transitionNow = transitionAt.toISOString();
  if (!result.facts) {
    if (result.retryable) return retryOrDeadLetter(store, job, result.reason, transitionAt,
      'deferUntil' in result && typeof result.deferUntil === 'string' ? result.deferUntil : undefined,
      Boolean(dependencies.resolveLeadContacts || dependencies.discoverLeadContactSources));
    if (!job.leaseOwner || !await store.markLeadEnrichmentTerminal(
      job.orgId, job.companyId, job.id, job.leaseOwner, result.reason, job.attemptCount,
      transitionNow, job.leaseGeneration,
    )) return { outcome: 'retry_wait', delaySeconds: 30 };
    if (dependencies.resolveLeadContacts || dependencies.discoverLeadContactSources) await store.ensureContactResolutionJob(job, transitionNow);
    if (!await store.completeJob(
      job.orgId, job.id, job.leaseOwner, transitionNow, job.leaseGeneration,
    )) {
      return { outcome: 'retry_wait', delaySeconds: 30 };
    }
    await store.refreshSearchFunnel(job.orgId, job.searchId, transitionNow);
    return { outcome: 'completed' };
  }
  const facts = dependencies.personalDataEnabled
    ? result.facts
    : researchOnlyWebsiteFacts(result.facts);
  const mutationNow = transitionNow;
  const enriched = mergeWebsiteFactsIntoLead(stored.lead, facts, mutationNow, job.attemptCount);
  const payloadDigest = await sha256Hex(canonicalJson({
    schema: 'gptbot.lead-radar.company-enrichment.v1',
    companyId: job.companyId,
    lead: enriched,
  }));
  const applied = job.leaseOwner
    ? await store.applyLeadEnrichment(
        job.orgId,
        job.companyId,
        job.id,
        job.leaseOwner,
        enriched,
        mutationNow,
        job.leaseGeneration,
        { effectKey: 'company_enrichment:v1', payloadDigest },
      )
    : false;
  if (!applied && await store.hasSuppressionForLead(job.orgId, enriched)) {
    await store.purgeLeadForExistingSuppression(job.orgId, job.companyId, mutationNow);
  }
  if (applied && result.reason === 'no_relevant_evidence' && job.leaseOwner) {
    const transitioned = await store.markLeadEnrichmentTerminal(
      job.orgId,
      job.companyId,
      job.id,
      job.leaseOwner,
      'no_relevant_evidence',
      job.attemptCount,
      mutationNow,
      job.leaseGeneration,
    );
    if (!transitioned) return { outcome: 'retry_wait', delaySeconds: 30 };
  }
  if (!applied && !await store.hasSuppressionForLead(job.orgId, enriched)) {
    return { outcome: 'retry_wait', delaySeconds: 30 };
  }
  if (applied && (dependencies.resolveLeadContacts || dependencies.discoverLeadContactSources)) await store.ensureContactResolutionJob(job, mutationNow);
  if (!job.leaseOwner || !await store.completeJob(
    job.orgId, job.id, job.leaseOwner, mutationNow, job.leaseGeneration,
  )) {
    return { outcome: 'retry_wait', delaySeconds: 30 };
  }
  await store.refreshSearchFunnel(job.orgId, job.searchId, mutationNow);
  return { outcome: 'completed' };
}

export async function consumeLeadRadarQueueMessage(
  db: D1Database,
  raw: unknown,
  queue: LeadRadarQueueSender,
  dependencies: LeadRadarQueueDependencies = {},
): Promise<LeadRadarQueueOutcome> {
  // Queue delivery is intentionally at-least-once. Job CAS/fencing and the
  // D1 effect ledger make the database mutation idempotent; they do not claim
  // exactly-once execution for arbitrary external systems.
  const message = parseLeadRadarQueueMessage(raw);
  if (!message) return { outcome: 'invalid' };
  const store = new LeadRadarStore(db);
  const known = await store.getJob(message.job_id);
  if (!known) return { outcome: 'invalid' };
  const at = dependencies.now?.() ?? new Date();
  if (known.status === 'completed') return { outcome: 'duplicate' };
  if (known.status === 'dead_letter') {
    // Keep returning a terminal result until the main Queue delivery is
    // acknowledged. If the explicit DLQ send fails, Cloudflare retries this
    // message and the Worker gets another chance to persist the DLQ copy.
    return { outcome: 'dead_letter', errorCode: known.lastErrorCode ?? 'dead_letter' };
  }
  await store.observeJobDispatch(known.id, at.toISOString());
  if (known.status === 'running' && known.leaseExpiresAt
    && known.leaseExpiresAt <= at.toISOString()) {
    const delaySeconds = retryDelaySeconds(known.attemptCount);
    const recovered = await store.recoverExpiredJob(
      known,
      new Date(at.getTime() + delaySeconds * 1_000).toISOString(),
      at.toISOString(),
    );
    if (recovered) await store.refreshSearchFunnel(known.orgId, known.searchId, at.toISOString());
    if (recovered === 'completed') return { outcome: 'completed' };
    if (recovered === 'retry_wait') {
      return { outcome: 'retry_wait', delaySeconds, retryDelivery: true };
    }
    if (recovered === 'dead_letter') {
      // Audit LR-F-7: a discovery parent that exhausted its attempts while
      // holding a reserved candidate window must not take that window with
      // it — hand it back so a replenish job re-serves it.
      if (known.stage === 'discovery' && await store.supportsContactDiscovery()) {
        await store.contactDiscovery.unreserveBatch(known.orgId, known.searchId, known.id, at.toISOString());
      }
      return { outcome: 'dead_letter', errorCode: 'retry_exhausted' };
    }
    return { outcome: 'duplicate' };
  }
  const claimed = await store.claimJob(
    known.orgId,
    known.id,
    at.toISOString(),
    new Date(at.getTime() + Math.max(60_000, Math.min(10 * 60_000,
      Math.trunc(dependencies.leaseDurationMs ?? 2 * 60_000)))).toISOString(),
  );
  if (!claimed) return { outcome: 'retry_wait', delaySeconds: 30 };
  if (claimed.stage === 'discovery') {
    const outcome = await processDiscovery(store, claimed, dependencies, at);
    if (outcome.outcome === 'completed') {
      // A fixed priming tick preserves low-latency single-lead behaviour while
      // keeping a 50-lead fan-out inside the Workers Free D1 ceiling. Later
      // completions replace one slot at a time; cron remains the durable fallback.
      const dispatchAt = dependencies.now?.() ?? new Date();
      await enqueueDueLeadRadarJobs(
        db, queue, dispatchAt, 5, (orgId) => orgId === claimed.orgId,
      );
    }
    return outcome;
  }
  let outcome = await processEnrichment(store, claimed, dependencies, at);
  let continuationScheduled = false;
  if (outcome.outcome === 'retry_wait' && outcome.rescheduleDelivery) {
    // A fresh delayed envelope keeps scheduling out of Queue max_retries=3.
    // Its D1 outbox CAS remains authoritative if Queue accepts then times out.
    const dispatchAt = dependencies.now?.() ?? new Date();
    continuationScheduled = await dispatchSpecificJob(store, queue, claimed, dispatchAt, true);
    if (continuationScheduled) outcome = { outcome: 'retry_wait', delaySeconds: outcome.delaySeconds };
  }
  if (outcome.outcome === 'completed' || outcome.outcome === 'dead_letter'
    || continuationScheduled || (outcome.outcome === 'retry_wait' && outcome.retryDelivery)) {
    // One terminal or durably deferred child releases exactly one processing
    // slot. Replacing only that slot keeps the Queue work-conserving without
    // turning a large discovery fan-out into an unbounded burst. Reservation
    // CAS makes concurrent completions select distinct due jobs.
    const dispatchAt = dependencies.now?.() ?? new Date();
    try {
      const reservations = await store.reserveDueJobDispatches(
        dispatchAt.toISOString(),
        new Date(dispatchAt.getTime() + DISPATCH_LEASE_MS).toISOString(),
        1,
        (orgId) => orgId === claimed.orgId,
      );
      if (reservations[0]) {
        await dispatchReservation(store, queue, reservations[0], dispatchAt);
      }
    } catch (error) {
      // The authoritative pending outbox row remains available to the cron
      // dispatcher. A refill failure must not regress an already committed
      // enrichment result or cause the current delivery to be retried.
      console.warn('lead_radar.queue_refill_deferred', {
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  return outcome;
}

export async function enqueueDueLeadRadarJobs(
  db: D1Database,
  queue: LeadRadarQueueSender,
  at = new Date(),
  limit = 5,
  allowOrganization: (orgId: string) => boolean = () => true,
): Promise<number> {
  const store = new LeadRadarStore(db);
  const now = at.toISOString();
  await store.requeueStaleSentDispatches(
    new Date(at.getTime() - DISPATCH_VISIBILITY_TIMEOUT_MS).toISOString(),
    now,
    allowOrganization,
    5,
  );
  // Recovery touches one row per expired lease; the funnel refresh is the
  // expensive part, so it runs once per affected search (bounded to two)
  // instead of once per job. Ten recoveries per tick keep a post-deploy
  // backlog from crawling at two jobs per 15 minutes (audit QR-5).
  const expiredJobs = (await store.listExpiredJobs(now, 10))
    .filter((job) => allowOrganization(job.orgId));
  const dirtySearches = new Map<string, { orgId: string; searchId: string }>();
  for (const expired of expiredJobs) {
    const delaySeconds = retryDelaySeconds(expired.attemptCount);
    const recovered = await store.recoverExpiredJob(
      expired,
      new Date(at.getTime() + delaySeconds * 1_000).toISOString(),
      now,
    );
    if (recovered) dirtySearches.set(`${expired.orgId}:${expired.searchId}`, { orgId: expired.orgId, searchId: expired.searchId });
  }
  for (const dirty of [...dirtySearches.values()].slice(0, 2)) {
    await store.refreshSearchFunnel(dirty.orgId, dirty.searchId, now);
  }
  const reservations = await store.reserveDueJobDispatches(
    now,
    new Date(at.getTime() + DISPATCH_LEASE_MS).toISOString(),
    Math.max(1, Math.min(5, Math.trunc(limit))),
    allowOrganization,
  );
  let sent = 0;
  for (const reservation of reservations) {
    if (await dispatchReservation(store, queue, reservation, at)) sent += 1;
  }
  return sent;
}

/** Cron-only watchdog (audit QR-2 class, "stuck at 10 of 186"): a running
 * contact-mode search whose jobs are all parked hours ahead must still
 * advance. refreshSearchFunnel re-evaluates the pool under current limits
 * and mints a due replenish/resume discovery job. Runs in the scheduled
 * handler's own invocation budget; two searches per 15-minute tick. */
export async function resumeStalledLeadRadarSearches(
  db: D1Database,
  now: Date,
  allowOrganization: (orgId: string) => boolean = () => true,
): Promise<number> {
  const store = new LeadRadarStore(db);
  let resumed = 0;
  for (const stalled of await store.listRunningSearchesWithPools(2, allowOrganization)) {
    // Per-search isolation (audit LR-F-14): one failing search must not
    // abort the sweep for the remaining stalled searches on this tick.
    try {
      // Dead replenish rows from an older code generation would deadlock the
      // funnel; revive them into a fresh queued generation before re-evaluating.
      // Audit LR-F-2: the same UPDATE once revives dead contact-resolution
      // rows created BEFORE the QR-1 regeneration fix — they used to be
      // uncreatable (ON CONFLICT DO NOTHING) and silently dropped their
      // companies from the funnel. Resetting created_at re-arms the bounded
      // 48h window. Rows created after the fix never need revival: they
      // regenerate on the same row for 48h before dead-lettering, so the
      // cutoff keeps this strictly one-time without an endless revive loop.
      await db.prepare(`UPDATE lead_radar_jobs SET status='queued', attempt_count=0,
        available_at=?, lease_owner=NULL, lease_expires_at=NULL,
        dispatch_status='pending', next_dispatch_at=?, completed_at=NULL,
        created_at=?, last_error_code=NULL, updated_at=?
        WHERE org_id=? AND search_id=? AND status='dead_letter'
          AND (idempotency_key LIKE 'contact-pool:%'
            OR (idempotency_key LIKE 'contact-resolve:%'
              AND created_at < '2026-08-30T00:00:00.000Z'))`)
        .bind(now.toISOString(), now.toISOString(), now.toISOString(), now.toISOString(),
          stalled.orgId, stalled.searchId).run();
      await store.refreshSearchFunnel(stalled.orgId, stalled.searchId, now.toISOString());
      resumed += 1;
    } catch {
      // The next tick retries this search; the sweep must keep going.
    } finally {
      // A blocked/failed funnel also needs to rotate. Touching only successful
      // pool mutations let the same two blocked searches monopolize the sweep.
      try {
        await db.prepare('UPDATE lead_radar_candidate_pools SET updated_at=? WHERE org_id=? AND search_id=?')
          .bind(now.toISOString(), stalled.orgId, stalled.searchId).run();
      } catch { /* Keep another tenant's sweep independent of this failure. */ }
    }
  }
  return resumed;
}
