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
  resolveLeadContacts?: (job: LeadRadarJob, lead: import('./types').StoredLeadInput) => Promise<{ pending: boolean }>;
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
    const delaySeconds = defer ? Math.max(5, Math.min(900, Math.ceil((resume - at.getTime()) / 1_000)))
      : retryDelaySeconds(job.attemptCount);
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
  const dead = await store.deadLetterJob(
    job.orgId, job.id, job.leaseOwner, code, now, job.leaseGeneration,
  );
  if (!dead) return { outcome: 'retry_wait', delaySeconds: 30 };
  if (job.stage === 'discovery') {
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
  let discovery: LeadRadarDiscoveryResult = { candidates: [], sourceWarnings: [] };
  try {
    if (!existingPool) discovery = dependencies.discover
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
  if (contactMode && !existingPool) {
    const ranked = [...candidates.values()].sort((a, b) =>
      Number(Boolean(b.telegramContact)) * 4 + Number(Boolean(b.website)) * 2 + Number(Boolean(b.phone))
      - Number(Boolean(a.telegramContact)) * 4 - Number(Boolean(a.website)) * 2 - Number(Boolean(a.phone)));
    await store.contactDiscovery.initialize(job, ranked.slice(0, input.maxCandidates ?? 250), input.desiredCount, now);
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
    dependencies.resolveMissingWebsites === true,
  )) return { outcome: 'retry_wait', delaySeconds: 30 };
  if (!existingPool && !await store.recordDiscoveryTelemetry(
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
    try { pending = (await dependencies.resolveLeadContacts?.(job, stored.lead))?.pending ?? false; }
    catch { pending = true; } // Keep a durable bounded retry; never restart website enrichment.
    // The check itself expires after 3 minutes; allow queue delay and short
    // account-wide cooldowns without dropping a fresh check on an older job.
    if (pending && Date.parse(now) - Date.parse(job.createdAt ?? now) < 30 * 60_000 && job.leaseOwner) {
      const retried = await store.retryJob(job.orgId,job.id,job.leaseOwner,'contact_check_pending',
        new Date(at.getTime()+15_000).toISOString(),now,job.leaseGeneration,true);
      return retried ? { outcome: 'retry_wait', delaySeconds: 15, retryDelivery: true, rescheduleDelivery: true }
        : { outcome: 'retry_wait', delaySeconds: 30 };
    }
    if (!job.leaseOwner || !await store.completeJob(job.orgId,job.id,job.leaseOwner,now,job.leaseGeneration)) return { outcome: 'retry_wait', delaySeconds: 30 };
    await store.refreshSearchFunnel(job.orgId,job.searchId,now);
    return { outcome: 'completed' };
  }
  const committedEffect = await store.getJobEffectDigest(
    job.orgId, job.id, 'company_enrichment:v1',
  );
  if (committedEffect) {
    if (dependencies.resolveLeadContacts) await store.ensureContactResolutionJob(job, now);
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
    return retryOrDeadLetter(store, job, safeFailureCode(heartbeatResult.error), transitionAt);
  }
  const result = heartbeatResult.value;
  if (!result) return retryOrDeadLetter(store, job, 'source_unavailable', transitionAt);
  const transitionNow = transitionAt.toISOString();
  if (!result.facts) {
    if (result.retryable) return retryOrDeadLetter(store, job, result.reason, transitionAt,
      'deferUntil' in result && typeof result.deferUntil === 'string' ? result.deferUntil : undefined);
    if (!job.leaseOwner || !await store.markLeadEnrichmentTerminal(
      job.orgId, job.companyId, job.id, job.leaseOwner, result.reason, job.attemptCount,
      transitionNow, job.leaseGeneration,
    )) return { outcome: 'retry_wait', delaySeconds: 30 };
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
  if (applied && dependencies.resolveLeadContacts) await store.ensureContactResolutionJob(job, mutationNow);
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
    return recovered === 'dead_letter'
      ? { outcome: 'dead_letter', errorCode: 'retry_exhausted' }
      : { outcome: 'duplicate' };
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
  // Recovery can touch an effect, terminal state and funnel. Keep it small so
  // the combined recovery + dispatch tick remains under the Free D1 ceiling.
  const expiredJobs = (await store.listExpiredJobs(now, 2))
    .filter((job) => allowOrganization(job.orgId));
  for (const expired of expiredJobs) {
    const delaySeconds = retryDelaySeconds(expired.attemptCount);
    const recovered = await store.recoverExpiredJob(
      expired,
      new Date(at.getTime() + delaySeconds * 1_000).toISOString(),
      now,
    );
    if (recovered) await store.refreshSearchFunnel(expired.orgId, expired.searchId, now);
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
