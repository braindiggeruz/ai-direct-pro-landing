import type {
  LeadRadarEnrichmentReason,
  LeadRadarEnrichmentStatus,
  LeadRadarEvidence,
  LeadRadarLead,
  LeadRadarSearchInput,
  LeadRadarSignal,
} from '../../../src/shared/lead-radar';

export const TELEGRAM_CONTACT_TYPES = [
  'human',
  'bot',
  'channel',
  'group',
  'business',
  'unknown',
] as const;

export type TelegramContactType = (typeof TELEGRAM_CONTACT_TYPES)[number];

/**
 * A single, evidence-backed Telegram endpoint selected for the company.
 * `messageable` is deliberately fail-closed: only a Telegram profile bound
 * to a named human may be true. Unknown endpoints are never treated as people.
 */
export interface LeadRadarTelegramContact {
  url: string;
  username: string;
  type: TelegramContactType;
  confidence: number;
  reason: string;
  evidenceIds: string[];
  verifiedAt: string;
  messageable: boolean;
}

/** A named person and role extracted from first-party website evidence. */
export interface LeadRadarDecisionMaker {
  id: string;
  name: string;
  role: string;
  telegramUrl: string | null;
  telegramUsername: string | null;
  contactType: TelegramContactType;
  confidence: number;
  evidenceIds: string[];
  sourceUrl: string;
  evidence: string;
  verifiedAt: string;
  sourceClaim: 'official_site_proximity' | 'json_ld_same_as';
  contactReviewStatus: 'unreviewed' | 'approved' | 'rejected';
  contactReviewedAt: string | null;
}

export interface SourceCandidate {
  sourceId: string;
  sourceUrl: string;
  name: string;
  category: string;
  city: string;
  country: string;
  address: string | null;
  website: string | null;
  phone: string | null;
  genericEmail: string | null;
  telegramUrl: string | null;
  telegramContact: LeadRadarTelegramContact | null;
  decisionMakers: LeadRadarDecisionMaker[];
  enrichmentStatus?: LeadRadarEnrichmentStatus;
  enrichmentReason?: LeadRadarEnrichmentReason | null;
  enrichmentAttempts?: number;
  evidence: LeadRadarEvidence[];
  signals: LeadRadarSignal[];
}
export interface StoredLeadInput extends Omit<LeadRadarLead, 'id' | 'searchId' | 'enrichmentStatus' | 'enrichmentReason' | 'enrichmentAttempts'> {
  canonicalKey: string;
  telegramContact: LeadRadarTelegramContact | null;
  decisionMakers: LeadRadarDecisionMaker[];
  enrichmentStatus?: LeadRadarEnrichmentStatus;
  enrichmentReason?: LeadRadarEnrichmentReason | null;
  enrichmentAttempts?: number;
}

export interface LeadRadarDiscoveryResult {
  candidates: SourceCandidate[];
  sourceWarnings: string[];
  rawDiscoveredCount?: number;
}

export type LeadRadarJobStage = 'discovery' | 'enrichment';
export type LeadRadarJobStatus = 'queued' | 'running' | 'retry_wait' | 'completed' | 'dead_letter';
export type LeadRadarJobDispatchStatus = 'pending' | 'sent';

export interface LeadRadarRequestIdentity {
  requestKey: string;
  requestFingerprint: string;
}

export type LeadRadarSearchAdmission =
  | { id: string; retryAfterSeconds: 0; disposition: 'created' | 'replayed' }
  | { id: null; retryAfterSeconds: 0; disposition: 'conflict' }
  | { id: null; retryAfterSeconds: number; disposition: 'throttled' };

export interface LeadRadarQueueMessage {
  schema: 'gptbot.lead-radar.job.v1';
  job_id: string;
}

export interface LeadRadarQueueSender {
  send(message: LeadRadarQueueMessage, options?: { delaySeconds?: number }): Promise<void>;
  sendBatch?(messages: Array<{ body: LeadRadarQueueMessage; delaySeconds?: number }>): Promise<void>;
}

export interface LeadRadarJob {
  id: string;
  orgId: string;
  searchId: string;
  companyId: string | null;
  stage: LeadRadarJobStage;
  status: LeadRadarJobStatus;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  /** Immutable job age bounds non-failure provider continuations. */
  createdAt?: string;
  lastErrorCode: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  /** Monotonic fencing token. Every successful claim increments it. */
  leaseGeneration: number;
  dispatchStatus: LeadRadarJobDispatchStatus;
  dispatchAttemptCount: number;
  nextDispatchAt: string | null;
  dispatchLeaseOwner: string | null;
  dispatchLeaseExpiresAt: string | null;
  dispatchedAt: string | null;
}

export interface LeadRadarDispatchReservation {
  job: LeadRadarJob;
  dispatchLeaseOwner: string;
  dispatchLeaseExpiresAt: string;
}

export interface LeadRadarJobEffect {
  effectKey: string;
  payloadDigest: string;
}

/**
 * Closed-list failure from an external discovery source. `diagnostics` may be
 * written to operator logs, but must never be returned to the browser.
 */
export class LeadRadarSourceError extends Error {
  constructor(
    readonly code: 'city_not_found' | 'geocoder_unavailable' | 'discovery_source_unavailable' | 'source_timeout' | 'upstream_payload_invalid',
    readonly diagnostics: string[] = [],
  ) {
    super(code);
    this.name = 'LeadRadarSourceError';
  }
}

export interface LeadRadarGeocodeStore {
  getGeocodeBounds(cacheKey: string, now: string): Promise<[number, number, number, number] | null>;
  putGeocodeBounds(
    cacheKey: string,
    bounds: [number, number, number, number],
    observedAt: string,
    expiresAt: string,
  ): Promise<void>;
  acquireGeocoderSlot(now: string, nextAllowedAt: string): Promise<boolean>;
}

export interface LeadRadarSource {
  readonly id: string;
  discover(input: LeadRadarSearchInput): Promise<LeadRadarDiscoveryResult>;
}
