import type {
  LeadRadarEvidence,
  LeadRadarLead,
  LeadRadarLifecycle,
  LeadRadarOverview,
  LeadRadarSearchPhase,
  LeadRadarSearchInput,
  LeadRadarSearchResult,
  LeadRadarSearchStatus,
  LeadRadarSearchSummary,
} from '../../../src/shared/lead-radar';
import {
  TELEGRAM_CONTACT_TYPES,
  type LeadRadarDispatchReservation,
  type LeadRadarDecisionMaker,
  type LeadRadarJob,
  type LeadRadarJobEffect,
  type LeadRadarJobStage,
  type LeadRadarRequestIdentity,
  type LeadRadarSearchAdmission,
  type LeadRadarTelegramContact,
  type StoredLeadInput,
  type TelegramContactType,
} from './types';
import { normalizeCompanyKey, safePublicHttpUrl } from './validation';
import { scoreLead } from './scoring';
import { resolveLeadRadarIntent } from './intent';

export interface LeadRadarSuppressionFingerprint {
  canonicalKey: string;
  domain: string | null;
  phoneDigits: string | null;
  nameCityKey: string | null;
}

interface SearchRow {
  id: string;
  input_json: string;
  status: LeadRadarSearchStatus;
  candidate_count: number;
  verified_count: number;
  p1_count: number;
  p2_count: number;
  p3_count: number;
  telegram_count: number;
  error_code: string | null;
  phase: LeadRadarSearchPhase;
  raw_discovered_count: number;
  processed_count: number;
  pending_count: number;
  website_count: number;
  enriched_count: number;
  decision_maker_count: number;
  company_telegram_count: number;
  personal_telegram_count: number;
  excluded_count: number;
  warnings_json: string;
  created_at: string;
  completed_at: string | null;
}

interface LeadRow {
  id: string;
  search_id: string;
  canonical_key: string;
  name: string;
  category: string;
  city: string;
  country: string;
  address: string | null;
  website: string | null;
  domain: string | null;
  phone_digits: string | null;
  name_city_key: string | null;
  phone: string | null;
  generic_email: string | null;
  telegram_url: string | null;
  telegram_contact_json: string;
  decision_makers_json: string;
  score: number;
  confidence: number;
  priority: LeadRadarLead['priority'];
  lifecycle: LeadRadarLifecycle;
  suppressed: number;
  score_components_json: string;
  signals_json: string;
  discovered_at: string;
  last_verified_at: string;
  enrichment_status: LeadRadarLead['enrichmentStatus'];
  enrichment_reason: LeadRadarLead['enrichmentReason'];
  enrichment_attempts: number;
}

interface SuppressionRow {
  canonical_key: string;
  domain: string | null;
  phone_digits: string | null;
  name_city_key: string | null;
}

interface EvidenceRow {
  id: string;
  company_id: string;
  field_path: string;
  value: string;
  source_url: string;
  source_type: LeadRadarEvidence['sourceType'];
  observed_at: string;
  confidence: number;
  classification: LeadRadarEvidence['classification'];
}

interface JobRow {
  id: string;
  org_id: string;
  search_id: string;
  company_id: string | null;
  stage: LeadRadarJobStage;
  status: LeadRadarJob['status'];
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  created_at: string;
  last_error_code: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  lease_generation: number;
  dispatch_status: LeadRadarJob['dispatchStatus'];
  dispatch_attempt_count: number;
  next_dispatch_at: string | null;
  dispatch_lease_owner: string | null;
  dispatch_lease_expires_at: string | null;
  dispatched_at: string | null;
}

interface DncClosureRow {
  id: string;
  search_id: string;
  canonical_key: string;
  domain: string | null;
  phone_digits: string | null;
  name_city_key: string | null;
}

const DNC_MAX_CLOSURE_ROWS = 128;
const DNC_MAX_CLOSURE_HOPS = 8;
const DNC_LOOKUP_CHUNK = 40;
const DNC_WRITE_CHUNK = 8;
const DISCOVERY_FANOUT_MAX_LEADS = 50;
const DISCOVERY_FANOUT_MAX_JSON_BYTES = 1_500_000;

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function mapJob(row: JobRow): LeadRadarJob {
  return {
    id: row.id,
    orgId: row.org_id,
    searchId: row.search_id,
    companyId: row.company_id,
    stage: row.stage,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    availableAt: row.available_at,
    createdAt: row.created_at,
    lastErrorCode: row.last_error_code,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    leaseGeneration: Number(row.lease_generation ?? 0),
    dispatchStatus: row.dispatch_status ?? 'pending',
    dispatchAttemptCount: Number(row.dispatch_attempt_count ?? 0),
    nextDispatchAt: row.next_dispatch_at,
    dispatchLeaseOwner: row.dispatch_lease_owner,
    dispatchLeaseExpiresAt: row.dispatch_lease_expires_at,
    dispatchedAt: row.dispatched_at,
  };
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function validRequestIdentity(value: LeadRadarRequestIdentity): boolean {
  return value.requestKey.length >= 1
    && value.requestKey.length <= 160
    && value.requestKey.trim() === value.requestKey
    && !hasControlCharacters(value.requestKey)
    && /^[a-f0-9]{64}$/.test(value.requestFingerprint);
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

const TELEGRAM_CONTACT_TYPE_SET = new Set<string>(TELEGRAM_CONTACT_TYPES);

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const printable = [...value].map((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  const normalized = printable.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function boundedConfidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function boundedEvidenceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(item))
    .slice(0, 32))];
}

function telegramLocator(value: unknown): { url: string; username: string } | null {
  if (typeof value !== 'string') return null;
  const url = safePublicHttpUrl(value);
  if (!url || !['t.me', 'telegram.me'].includes(url.hostname.toLowerCase())) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const username = segments[0] ?? '';
  if (segments.length !== 1 || !/^[A-Za-z0-9_]{5,32}$/.test(username)) return null;
  return { url: `https://t.me/${username}`, username };
}

function verifiedAt(value: unknown): string | null {
  const text = boundedText(value, 64);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

const PERSONAL_CONTACT_TTL_MS = 30 * 24 * 60 * 60_000;

function isFreshPersonalContact(value: string, now = Date.now()): boolean {
  const observed = Date.parse(value);
  return Number.isFinite(observed)
    && observed <= now + 5 * 60_000
    && now - observed <= PERSONAL_CONTACT_TTL_MS;
}

function contactForStorage(
  contact: LeadRadarTelegramContact | null,
  people: LeadRadarDecisionMaker[],
  now: number,
): LeadRadarTelegramContact | null {
  if (!contact) return null;
  return {
    ...contact,
    messageable: contact.type === 'human'
      && isFreshPersonalContact(contact.verifiedAt, now)
      && people.some((person) => (
        person.contactType === 'human'
        && telegramLocator(person.telegramUrl)?.username.toLowerCase() === contact.username.toLowerCase()
        && person.contactReviewStatus === 'approved'
        && isFreshPersonalContact(person.verifiedAt, now)
      )),
  };
}

function telegramContactFromJson(value: string): LeadRadarTelegramContact | null {
  const raw = parseJson<unknown>(value, null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const locator = telegramLocator(item.url);
  const username = boundedText(item.username, 32);
  const type = typeof item.type === 'string' && TELEGRAM_CONTACT_TYPE_SET.has(item.type)
    ? item.type as TelegramContactType
    : null;
  const confidence = boundedConfidence(item.confidence);
  const reason = boundedText(item.reason, 240);
  const checkedAt = verifiedAt(item.verifiedAt);
  if (!locator || !username || username.toLowerCase() !== locator.username.toLowerCase()
    || !type || confidence === null || !reason || !checkedAt) return null;
  return {
    url: locator.url,
    username: locator.username,
    type,
    confidence,
    reason,
    evidenceIds: boundedEvidenceIds(item.evidenceIds),
    verifiedAt: checkedAt,
    messageable: type === 'human' && item.messageable === true,
  };
}

function decisionMakersFromJson(value: string): LeadRadarDecisionMaker[] {
  const raw = parseJson<unknown>(value, []);
  if (!Array.isArray(raw)) return [];
  const result: LeadRadarDecisionMaker[] = [];
  for (const entry of raw.slice(0, 12)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const id = boundedText(item.id, 80);
    const name = boundedText(item.name, 120);
    const role = boundedText(item.role, 120);
    const type = typeof item.contactType === 'string' && TELEGRAM_CONTACT_TYPE_SET.has(item.contactType)
      ? item.contactType as TelegramContactType
      : null;
    const confidence = boundedConfidence(item.confidence);
    const source = typeof item.sourceUrl === 'string' ? safePublicHttpUrl(item.sourceUrl) : null;
    const evidence = boundedText(item.evidence, 360);
    const checkedAt = verifiedAt(item.verifiedAt);
    const sourceClaim = item.sourceClaim === 'json_ld_same_as' || item.sourceClaim === 'official_site_proximity'
      ? item.sourceClaim
      : 'official_site_proximity';
    const contactReviewStatus = item.contactReviewStatus === 'approved' || item.contactReviewStatus === 'rejected'
      ? item.contactReviewStatus
      : 'unreviewed';
    const contactReviewedAt = contactReviewStatus === 'unreviewed' ? null : verifiedAt(item.contactReviewedAt);
    if (!id || !name || !role || !type || confidence === null || !source || !evidence || !checkedAt
      || (contactReviewStatus !== 'unreviewed' && !contactReviewedAt)) continue;
    const locator = type === 'human' ? telegramLocator(item.telegramUrl) : null;
    const rawUsername = boundedText(item.telegramUsername, 32);
    const hasBoundTelegram = Boolean(locator && rawUsername
      && rawUsername.toLowerCase() === locator?.username.toLowerCase());
    result.push({
      id,
      name,
      role,
      telegramUrl: hasBoundTelegram ? locator?.url ?? null : null,
      telegramUsername: hasBoundTelegram ? locator?.username ?? null : null,
      contactType: hasBoundTelegram ? 'human' : (type === 'human' ? 'unknown' : type),
      confidence,
      evidenceIds: boundedEvidenceIds(item.evidenceIds),
      sourceUrl: source.toString(),
      evidence,
      verifiedAt: checkedAt,
      sourceClaim,
      contactReviewStatus,
      contactReviewedAt,
    });
  }
  return result;
}

function mapSearch(row: SearchRow): LeadRadarSearchSummary {
  const input = parseJson<LeadRadarSearchInput>(row.input_json, {
    niche: '', city: '', country: 'UZ', offer: '', desiredCount: 20,
    telegramRequired: false, languages: ['ru', 'uz'],
  });
  const resolvedIntent = resolveLeadRadarIntent(input.niche);
  return {
    id: row.id,
    input,
    interpretation: {
      canonicalCategory: resolvedIntent.canonicalLabel,
      matchKind: resolvedIntent.matchKind,
      confidence: resolvedIntent.confidence,
      expanded: resolvedIntent.expanded,
    },
    status: row.status,
    candidateCount: Number(row.candidate_count),
    verifiedCount: Number(row.verified_count),
    p1Count: Number(row.p1_count),
    p2Count: Number(row.p2_count),
    p3Count: Number(row.p3_count),
    telegramCount: Number(row.telegram_count),
    errorCode: row.error_code,
    phase: row.phase ?? 'completed',
    funnel: {
      rawDiscoveredCount: Number(row.raw_discovered_count ?? 0),
      candidateCount: Number(row.candidate_count ?? 0),
      processedCount: Number(row.processed_count ?? row.verified_count ?? 0),
      pendingCount: Number(row.pending_count ?? 0),
      websiteCount: Number(row.website_count ?? 0),
      enrichedCount: Number(row.enriched_count ?? 0),
      decisionMakerCount: Number(row.decision_maker_count ?? 0),
      companyTelegramCount: Number(row.company_telegram_count ?? 0),
      personalTelegramCount: Number(row.personal_telegram_count ?? row.telegram_count ?? 0),
      excludedCount: Number(row.excluded_count ?? 0),
    },
    warnings: parseJson<string[]>(row.warnings_json ?? '[]', []).filter((item) => typeof item === 'string').slice(0, 20),
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapEvidence(row: EvidenceRow): LeadRadarEvidence {
  return {
    id: row.id,
    fieldPath: row.field_path,
    value: row.value,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    observedAt: row.observed_at,
    confidence: Number(row.confidence),
    classification: row.classification,
  };
}

function domainFromWebsite(website: string | null): string | null {
  if (!website) return null;
  try { return new URL(website).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

function fingerprint(input: {
  canonicalKey: string;
  website: string | null;
  phone: string | null;
  name: string;
  city: string;
}): LeadRadarSuppressionFingerprint {
  return {
    canonicalKey: input.canonicalKey,
    domain: domainFromWebsite(input.website),
    phoneDigits: input.phone?.replace(/\D/g, '') || null,
    nameCityKey: `${normalizeCompanyKey(input.name)}:${normalizeCompanyKey(input.city)}`,
  };
}

function matchesSuppression(
  value: LeadRadarSuppressionFingerprint,
  suppressions: LeadRadarSuppressionFingerprint[],
): boolean {
  return suppressions.some((item) => (
    item.canonicalKey === value.canonicalKey
    || (value.domain !== null && item.domain === value.domain)
    || (value.phoneDigits !== null && item.phoneDigits === value.phoneDigits)
    || (value.nameCityKey !== null && item.nameCityKey === value.nameCityKey)
  ));
}

export class LeadRadarStore {
  constructor(private readonly db: D1Database) {}

  async acquireSearchLease(
    orgId: string,
    leaseId: string,
    now: string,
    activeUntil: string,
    nextAllowedAt: string,
  ): Promise<{ acquired: boolean; retryAfterSeconds: number }> {
    const result = await this.db.prepare(`INSERT INTO lead_radar_search_leases (
      org_id, lease_id, active_until, next_allowed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(org_id) DO UPDATE SET
      lease_id = excluded.lease_id,
      active_until = excluded.active_until,
      next_allowed_at = excluded.next_allowed_at,
      updated_at = excluded.updated_at
    WHERE lead_radar_search_leases.active_until <= excluded.updated_at
      AND lead_radar_search_leases.next_allowed_at <= excluded.updated_at`)
      .bind(orgId, leaseId, activeUntil, nextAllowedAt, now).run();
    if (Number(result.meta.changes ?? 0) === 1) return { acquired: true, retryAfterSeconds: 0 };
    const existing = await this.db.prepare(`SELECT active_until, next_allowed_at
      FROM lead_radar_search_leases WHERE org_id = ? LIMIT 1`).bind(orgId).first<{
        active_until: string; next_allowed_at: string;
      }>();
    const blockedUntil = Math.max(
      Date.parse(existing?.active_until ?? now),
      Date.parse(existing?.next_allowed_at ?? now),
    );
    return {
      acquired: false,
      retryAfterSeconds: Math.max(1, Math.min(180, Math.ceil((blockedUntil - Date.parse(now)) / 1_000))),
    };
  }

  async releaseSearchLease(orgId: string, leaseId: string, now: string, nextAllowedAt: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_search_leases SET
      active_until = ?, next_allowed_at = ?, updated_at = ?
      WHERE org_id = ? AND lease_id = ?`).bind(now, nextAllowedAt, now, orgId, leaseId).run();
  }

  async getGeocodeBounds(cacheKey: string, now: string): Promise<[number, number, number, number] | null> {
    const row = await this.db.prepare(`SELECT bounds_json FROM lead_radar_geocode_cache
      WHERE cache_key = ? AND expires_at > ? LIMIT 1`).bind(cacheKey, now).first<{ bounds_json: string }>();
    if (!row) return null;
    const bounds = parseJson<unknown>(row.bounds_json, null);
    if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some((value) => !Number.isFinite(value))) return null;
    return bounds.map(Number) as [number, number, number, number];
  }

  async putGeocodeBounds(
    cacheKey: string,
    bounds: [number, number, number, number],
    observedAt: string,
    expiresAt: string,
  ): Promise<void> {
    await this.db.prepare(`INSERT INTO lead_radar_geocode_cache (
      cache_key, bounds_json, observed_at, expires_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      bounds_json = excluded.bounds_json,
      observed_at = excluded.observed_at,
      expires_at = excluded.expires_at`).bind(cacheKey, JSON.stringify(bounds), observedAt, expiresAt).run();
  }

  async acquireGeocoderSlot(now: string, nextAllowedAt: string): Promise<boolean> {
    const result = await this.db.prepare(`INSERT INTO lead_radar_source_throttles (
      source_key, next_allowed_at, updated_at
    ) VALUES ('nominatim', ?, ?)
    ON CONFLICT(source_key) DO UPDATE SET
      next_allowed_at = excluded.next_allowed_at,
      updated_at = excluded.updated_at
    WHERE lead_radar_source_throttles.next_allowed_at <= excluded.updated_at`)
      .bind(nextAllowedAt, now).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async listSuppressions(orgId: string): Promise<LeadRadarSuppressionFingerprint[]> {
    const result = await this.db.prepare(`SELECT canonical_key, domain, phone_digits, name_city_key
      FROM lead_radar_suppressions WHERE org_id = ?`).bind(orgId).all<SuppressionRow>();
    return (result.results ?? []).map((row) => ({
      canonicalKey: row.canonical_key,
      domain: row.domain,
      phoneDigits: row.phone_digits,
      nameCityKey: row.name_city_key,
    }));
  }

  async createSearch(orgId: string, input: LeadRadarSearchInput, now: string): Promise<string> {
    const id = `search_${crypto.randomUUID().replaceAll('-', '')}`;
    await this.db.prepare(`INSERT INTO lead_radar_searches (
      id, org_id, input_json, status, phase, created_at
    ) VALUES (?, ?, ?, 'running', 'queued', ?)`).bind(id, orgId, JSON.stringify(input), now).run();
    return id;
  }

  async findSearchByRequest(
    orgId: string,
    requestKey: string,
  ): Promise<{ id: string; requestFingerprint: string } | null> {
    if (requestKey.length < 1 || requestKey.length > 160
      || requestKey.trim() !== requestKey || hasControlCharacters(requestKey)) return null;
    const row = await this.db.prepare(`SELECT id, request_fingerprint
      FROM lead_radar_searches
      WHERE org_id = ? AND request_key = ? LIMIT 1`).bind(orgId, requestKey).first<{
        id: string;
        request_fingerprint: string;
      }>();
    return row ? { id: row.id, requestFingerprint: row.request_fingerprint } : null;
  }

  async createSearchIfAdmitted(
    orgId: string,
    input: LeadRadarSearchInput,
    at: Date,
    request: LeadRadarRequestIdentity | null = null,
  ): Promise<LeadRadarSearchAdmission> {
    if (request && !validRequestIdentity(request)) {
      throw new Error('lead_radar_request_identity_invalid');
    }
    const id = `search_${crypto.randomUUID().replaceAll('-', '')}`;
    const now = at.toISOString();
    const hourAgo = new Date(at.getTime() - 60 * 60_000).toISOString();
    const dayAgo = new Date(at.getTime() - 24 * 60 * 60_000).toISOString();
    const inserted = await this.db.prepare(`INSERT INTO lead_radar_searches (
      id, org_id, input_json, status, phase, request_key, request_fingerprint, created_at
    ) SELECT ?, ?, ?, 'running', 'queued', ?, ?, ?
    WHERE (SELECT COUNT(*) FROM lead_radar_searches
      WHERE org_id = ? AND status = 'running') < 2
      AND (SELECT COUNT(*) FROM lead_radar_searches
        WHERE org_id = ? AND created_at >= ?) < 10
      AND (SELECT COUNT(*) FROM lead_radar_searches
        WHERE org_id = ? AND created_at >= ?) < 50
    ON CONFLICT(org_id, request_key) WHERE request_key IS NOT NULL DO NOTHING`).bind(
      id, orgId, JSON.stringify(input), request?.requestKey ?? null,
      request?.requestFingerprint ?? null, now,
      orgId, orgId, hourAgo, orgId, dayAgo,
    ).run();
    if (Number(inserted.meta.changes ?? 0) === 1) {
      return { id, retryAfterSeconds: 0, disposition: 'created' };
    }
    if (request) {
      const existing = await this.findSearchByRequest(orgId, request.requestKey);
      if (existing) {
        return existing.requestFingerprint === request.requestFingerprint
          ? { id: existing.id, retryAfterSeconds: 0, disposition: 'replayed' }
          : { id: null, retryAfterSeconds: 0, disposition: 'conflict' };
      }
    }
    const counts = await this.db.prepare(`SELECT
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS hour_count,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS day_count,
      MIN(CASE WHEN created_at >= ? THEN created_at END) AS oldest_hour,
      MIN(CASE WHEN created_at >= ? THEN created_at END) AS oldest_day
      FROM lead_radar_searches WHERE org_id = ?`).bind(
      hourAgo, dayAgo, hourAgo, dayAgo, orgId,
    ).first<{
      active_count: number | null; hour_count: number | null; day_count: number | null;
      oldest_hour: string | null; oldest_day: string | null;
    }>();
    let retryAfterSeconds = 60;
    if (Number(counts?.day_count ?? 0) >= 50 && counts?.oldest_day) {
      retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(counts.oldest_day) + 24 * 60 * 60_000 - at.getTime()) / 1_000));
    } else if (Number(counts?.hour_count ?? 0) >= 10 && counts?.oldest_hour) {
      retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(counts.oldest_hour) + 60 * 60_000 - at.getTime()) / 1_000));
    }
    return { id: null, retryAfterSeconds, disposition: 'throttled' };
  }

  async getSearchInput(orgId: string, searchId: string): Promise<LeadRadarSearchInput | null> {
    const row = await this.db.prepare(`SELECT input_json FROM lead_radar_searches
      WHERE org_id = ? AND id = ? LIMIT 1`).bind(orgId, searchId).first<{ input_json: string }>();
    return row ? parseJson<LeadRadarSearchInput | null>(row.input_json, null) : null;
  }

  async setSearchPhase(
    orgId: string,
    searchId: string,
    phase: LeadRadarSearchPhase,
    now: string,
  ): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_searches SET phase = ?, status = 'running',
      completed_at = NULL, state_version = state_version + 1
      WHERE org_id = ? AND id = ? AND phase <> 'completed'`).bind(phase, orgId, searchId).run();
    void now;
  }

  async recordDiscoveryTelemetry(
    orgId: string,
    searchId: string,
    parentJobId: string,
    leaseOwner: string,
    leaseGeneration: number,
    rawDiscoveredCount: number,
    warnings: string[],
    now: string,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_searches SET
      raw_discovered_count = ?, warnings_json = ?, phase = 'enriching',
      state_version = state_version + 1
      WHERE org_id = ? AND id = ? AND phase <> 'completed'
        AND EXISTS (SELECT 1 FROM lead_radar_jobs parent
          WHERE parent.org_id = ? AND parent.search_id = ? AND parent.id = ?
            AND parent.stage = 'discovery' AND parent.status = 'running'
            AND parent.lease_owner = ? AND parent.lease_generation = ?
            AND parent.lease_expires_at > ?)`).bind(
      Math.max(0, Math.trunc(rawDiscoveredCount)),
      JSON.stringify([...new Set(warnings)].slice(0, 20)),
      orgId,
      searchId,
      orgId,
      searchId,
      parentJobId,
      leaseOwner,
      leaseGeneration,
      now,
    ).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async incrementExcluded(orgId: string, searchId: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_searches SET excluded_count = excluded_count + 1
      WHERE org_id = ? AND id = ?`).bind(orgId, searchId).run();
  }

  async failInterruptedSearches(orgId: string, staleBefore: string, now: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_searches SET
      status = 'failed', phase = 'completed', error_code = 'search_interrupted', completed_at = ?
      WHERE org_id = ? AND status = 'running' AND created_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM lead_radar_jobs job
          WHERE job.org_id = lead_radar_searches.org_id
            AND job.search_id = lead_radar_searches.id
            AND job.status IN ('queued', 'running', 'retry_wait')
        )`)
      .bind(now, orgId, staleBefore).run();
  }

  async finishSearch(
    orgId: string,
    searchId: string,
    update: {
      status: LeadRadarSearchStatus;
      candidateCount: number;
      verifiedCount: number;
      p1Count: number;
      p2Count: number;
      p3Count: number;
      telegramCount: number;
      errorCode: string | null;
      completedAt: string;
    },
  ): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_searches SET
      status = ?, candidate_count = ?, verified_count = ?, p1_count = ?,
      p2_count = ?, p3_count = ?, telegram_count = ?, error_code = ?, completed_at = ?,
      phase = 'completed', processed_count = ?, pending_count = 0,
      personal_telegram_count = ?
      WHERE org_id = ? AND id = ?`).bind(
      update.status, update.candidateCount, update.verifiedCount, update.p1Count,
      update.p2Count, update.p3Count, update.telegramCount, update.errorCode,
      update.completedAt, update.verifiedCount, update.telegramCount, orgId, searchId,
    ).run();
  }

  async failSearchStart(orgId: string, searchId: string, errorCode: string, now: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_searches SET
      status = 'failed', phase = 'completed', error_code = ?, completed_at = ?
      WHERE org_id = ? AND id = ? AND status = 'running'
        AND NOT EXISTS (
          SELECT 1 FROM lead_radar_jobs job
          WHERE job.org_id = ? AND job.search_id = ?
        )`).bind(errorCode, now, orgId, searchId, orgId, searchId).run();
  }

  async insertLead(orgId: string, searchId: string, lead: StoredLeadInput): Promise<string | null> {
    const id = `lead_${crypto.randomUUID().replaceAll('-', '')}`;
    const identity = fingerprint(lead);
    const storedContact = contactForStorage(
      lead.telegramContact,
      lead.decisionMakers ?? [],
      Date.parse(lead.lastVerifiedAt),
    );
    const statements: D1PreparedStatement[] = [this.db.prepare(`INSERT INTO lead_radar_companies (
      id, org_id, search_id, canonical_key, name, category, city, country,
      address, website, domain, phone_digits, name_city_key,
      phone, generic_email, telegram_url, telegram_contact_json,
      decision_makers_json, score, confidence,
      priority, lifecycle, suppressed, score_components_json, signals_json,
      discovered_at, last_verified_at, updated_at,
      enrichment_status, enrichment_reason, enrichment_attempts
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM lead_radar_suppressions suppression
      WHERE suppression.org_id = ? AND (
        suppression.canonical_key = ?
        OR (? IS NOT NULL AND suppression.domain = ?)
        OR (? IS NOT NULL AND suppression.phone_digits = ?)
        OR (? IS NOT NULL AND suppression.name_city_key = ?)
      )
    )`)
      .bind(
        id, orgId, searchId, lead.canonicalKey, lead.name, lead.category,
        lead.city, lead.country, lead.address, lead.website,
        identity.domain, identity.phoneDigits, identity.nameCityKey, lead.phone,
        lead.genericEmail, lead.telegramUrl, JSON.stringify(storedContact),
        JSON.stringify(lead.decisionMakers ?? []), lead.score, lead.confidence,
        lead.priority, lead.lifecycle, lead.suppressed ? 1 : 0,
        JSON.stringify(lead.scoreComponents), JSON.stringify(lead.signals),
        lead.discoveredAt, lead.lastVerifiedAt, lead.lastVerifiedAt,
        lead.enrichmentStatus ?? (lead.website ? 'pending' : 'terminal'),
        lead.enrichmentReason ?? (lead.website ? null : 'no_website'),
        lead.enrichmentAttempts ?? 0,
        orgId, identity.canonicalKey,
        identity.domain, identity.domain,
        identity.phoneDigits, identity.phoneDigits,
        identity.nameCityKey, identity.nameCityKey,
      )];
    for (const evidence of lead.evidence) {
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO lead_radar_evidence (
        id, org_id, company_id, field_path, value, source_url, source_type,
        observed_at, confidence, classification
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM lead_radar_companies WHERE org_id = ? AND id = ?
      )`)
        .bind(
          evidence.id, orgId, id, evidence.fieldPath, evidence.value,
          evidence.sourceUrl, evidence.sourceType, evidence.observedAt,
          evidence.confidence, evidence.classification,
          orgId, id,
        ));
    }
    const results = await this.db.batch(statements);
    return Number(results[0]?.meta.changes ?? 0) === 1 ? id : null;
  }

  async insertOrGetLead(
    orgId: string,
    searchId: string,
    lead: StoredLeadInput,
  ): Promise<{ id: string | null; inserted: boolean }> {
    const existing = await this.db.prepare(`SELECT id FROM lead_radar_companies
      WHERE org_id = ? AND search_id = ? AND canonical_key = ? LIMIT 1`)
      .bind(orgId, searchId, lead.canonicalKey).first<{ id: string }>();
    if (existing) return { id: existing.id, inserted: false };
    const id = await this.insertLead(orgId, searchId, lead);
    if (id) return { id, inserted: true };
    const raced = await this.db.prepare(`SELECT id FROM lead_radar_companies
      WHERE org_id = ? AND search_id = ? AND canonical_key = ? LIMIT 1`)
      .bind(orgId, searchId, lead.canonicalKey).first<{ id: string }>();
    return { id: raced?.id ?? null, inserted: false };
  }

  /**
   * Persists a complete discovery fan-out in five fixed D1 statements.
   * Every statement is tenant-scoped and fenced by the active discovery
   * lease. The batch is atomic: child jobs stay behind `nextDispatchAt` until
   * the parent is completed by `completeDiscoveryJobAndReleaseFanout`.
   */
  async persistDiscoveryFanout(
    orgId: string,
    searchId: string,
    parentJobId: string,
    leaseOwner: string,
    leaseGeneration: number,
    leads: StoredLeadInput[],
    now: string,
    nextDispatchAt: string,
    resolveMissingWebsites = false,
  ): Promise<boolean> {
    if (leads.length > DISCOVERY_FANOUT_MAX_LEADS) {
      throw new Error('lead_radar_discovery_fanout_too_large');
    }
    const canonicalKeys = new Set(leads.map((lead) => lead.canonicalKey));
    if (canonicalKeys.size !== leads.length) {
      throw new Error('lead_radar_discovery_fanout_duplicate');
    }
    const payload = leads.map((lead) => {
      const identity = fingerprint(lead);
      const storedContact = contactForStorage(
        lead.telegramContact,
        lead.decisionMakers ?? [],
        Date.parse(lead.lastVerifiedAt),
      );
      return {
        companyId: `lead_${crypto.randomUUID().replaceAll('-', '')}`,
        jobId: `lrjob_${crypto.randomUUID().replaceAll('-', '')}`,
        canonicalKey: lead.canonicalKey,
        name: lead.name,
        category: lead.category,
        city: lead.city,
        country: lead.country,
        address: lead.address,
        website: lead.website,
        enrichWebsite: Boolean(lead.website) || resolveMissingWebsites,
        domain: identity.domain,
        phoneDigits: identity.phoneDigits,
        nameCityKey: identity.nameCityKey,
        phone: lead.phone,
        genericEmail: lead.genericEmail,
        telegramUrl: lead.telegramUrl,
        telegramContactJson: JSON.stringify(storedContact),
        decisionMakersJson: JSON.stringify(lead.decisionMakers ?? []),
        score: lead.score,
        confidence: lead.confidence,
        priority: lead.priority,
        lifecycle: lead.lifecycle,
        suppressed: lead.suppressed ? 1 : 0,
        scoreComponentsJson: JSON.stringify(lead.scoreComponents),
        signalsJson: JSON.stringify(lead.signals),
        discoveredAt: lead.discoveredAt,
        lastVerifiedAt: lead.lastVerifiedAt,
        enrichmentAttempts: lead.enrichmentAttempts ?? 0,
        evidence: lead.evidence,
      };
    });
    const payloadJson = JSON.stringify(payload);
    if (new TextEncoder().encode(payloadJson).byteLength > DISCOVERY_FANOUT_MAX_JSON_BYTES) {
      throw new Error('lead_radar_discovery_fanout_payload_too_large');
    }
    const parentFence = `EXISTS (
      SELECT 1 FROM lead_radar_jobs parent
      WHERE parent.org_id = ? AND parent.id = ? AND parent.search_id = ?
        AND parent.stage = 'discovery' AND parent.status = 'running'
        AND parent.lease_owner = ? AND parent.lease_generation = ?
        AND parent.lease_expires_at > ?
    )`;
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`WITH payload AS (
        SELECT value AS item FROM json_each(?)
      )
      INSERT OR IGNORE INTO lead_radar_companies (
        id, org_id, search_id, canonical_key, name, category, city, country,
        address, website, domain, phone_digits, name_city_key,
        phone, generic_email, telegram_url, telegram_contact_json,
        decision_makers_json, score, confidence,
        priority, lifecycle, suppressed, score_components_json, signals_json,
        discovered_at, last_verified_at, updated_at,
        enrichment_status, enrichment_reason, enrichment_attempts
      )
      SELECT
        json_extract(item, '$.companyId'), ?, ?,
        json_extract(item, '$.canonicalKey'), json_extract(item, '$.name'),
        json_extract(item, '$.category'), json_extract(item, '$.city'),
        json_extract(item, '$.country'), json_extract(item, '$.address'),
        json_extract(item, '$.website'), json_extract(item, '$.domain'),
        json_extract(item, '$.phoneDigits'), json_extract(item, '$.nameCityKey'),
        json_extract(item, '$.phone'), json_extract(item, '$.genericEmail'),
        json_extract(item, '$.telegramUrl'), json_extract(item, '$.telegramContactJson'),
        json_extract(item, '$.decisionMakersJson'), json_extract(item, '$.score'),
        json_extract(item, '$.confidence'), json_extract(item, '$.priority'),
        json_extract(item, '$.lifecycle'), json_extract(item, '$.suppressed'),
        json_extract(item, '$.scoreComponentsJson'), json_extract(item, '$.signalsJson'),
        json_extract(item, '$.discoveredAt'), json_extract(item, '$.lastVerifiedAt'), ?,
        CASE WHEN json_extract(item, '$.enrichWebsite') = 1 THEN 'pending' ELSE 'terminal' END,
        CASE WHEN json_extract(item, '$.enrichWebsite') = 1 THEN NULL ELSE 'no_website' END,
        json_extract(item, '$.enrichmentAttempts')
      FROM payload
      WHERE json_extract(item, '$.suppressed') = 0
        AND ${parentFence}
        AND NOT EXISTS (
          SELECT 1 FROM lead_radar_suppressions suppression
          WHERE suppression.org_id = ? AND (
            suppression.canonical_key = json_extract(item, '$.canonicalKey')
            OR (json_type(item, '$.domain') = 'text'
              AND suppression.domain = json_extract(item, '$.domain'))
            OR (json_type(item, '$.phoneDigits') = 'text'
              AND suppression.phone_digits = json_extract(item, '$.phoneDigits'))
            OR (json_type(item, '$.nameCityKey') = 'text'
              AND suppression.name_city_key = json_extract(item, '$.nameCityKey'))
          )
        )`).bind(
        payloadJson, orgId, searchId, now,
        orgId, parentJobId, searchId, leaseOwner, leaseGeneration, now,
        orgId,
      ),
      this.db.prepare(`WITH payload AS (
        SELECT value AS item FROM json_each(?)
      ), payload_evidence AS (
        SELECT payload.item, evidence.value AS evidence
        FROM payload JOIN json_each(payload.item, '$.evidence') evidence
      )
      INSERT OR IGNORE INTO lead_radar_evidence (
        id, org_id, company_id, field_path, value, source_url, source_type,
        observed_at, confidence, classification
      )
      SELECT
        json_extract(payload_evidence.evidence, '$.id'), ?, company.id,
        json_extract(payload_evidence.evidence, '$.fieldPath'),
        json_extract(payload_evidence.evidence, '$.value'),
        json_extract(payload_evidence.evidence, '$.sourceUrl'),
        json_extract(payload_evidence.evidence, '$.sourceType'),
        json_extract(payload_evidence.evidence, '$.observedAt'),
        json_extract(payload_evidence.evidence, '$.confidence'),
        json_extract(payload_evidence.evidence, '$.classification')
      FROM payload_evidence
      JOIN lead_radar_companies company
        ON company.org_id = ? AND company.search_id = ?
        AND company.canonical_key = json_extract(payload_evidence.item, '$.canonicalKey')
      WHERE company.suppressed = 0 AND ${parentFence}
        AND NOT EXISTS (
          SELECT 1 FROM lead_radar_suppressions suppression
          WHERE suppression.org_id = ? AND (
            suppression.canonical_key = company.canonical_key
            OR (company.domain IS NOT NULL AND suppression.domain = company.domain)
            OR (company.phone_digits IS NOT NULL AND suppression.phone_digits = company.phone_digits)
            OR (company.name_city_key IS NOT NULL AND suppression.name_city_key = company.name_city_key)
          )
        )`).bind(
        payloadJson, orgId, orgId, searchId,
        orgId, parentJobId, searchId, leaseOwner, leaseGeneration, now,
        orgId,
      ),
      this.db.prepare(`WITH payload AS (
        SELECT value AS item FROM json_each(?)
      )
      INSERT OR IGNORE INTO lead_radar_jobs (
        id, org_id, search_id, company_id, idempotency_key, stage, status,
        attempt_count, max_attempts, available_at, dispatch_status,
        next_dispatch_at, created_at, updated_at
      )
      SELECT
        json_extract(item, '$.jobId'), ?, ?, company.id,
        'enrichment:' || company.id, 'enrichment', 'queued',
        0, 3, ?, 'pending', ?, ?, ?
      FROM payload
      JOIN lead_radar_companies company
        ON company.org_id = ? AND company.search_id = ?
        AND company.canonical_key = json_extract(item, '$.canonicalKey')
      WHERE json_extract(item, '$.enrichWebsite') = 1
        AND company.suppressed = 0
        AND company.enrichment_status IN ('pending', 'queued', 'processing')
        AND ${parentFence}
        AND NOT EXISTS (
          SELECT 1 FROM lead_radar_suppressions suppression
          WHERE suppression.org_id = ? AND (
            suppression.canonical_key = company.canonical_key
            OR (company.domain IS NOT NULL AND suppression.domain = company.domain)
            OR (company.phone_digits IS NOT NULL AND suppression.phone_digits = company.phone_digits)
            OR (company.name_city_key IS NOT NULL AND suppression.name_city_key = company.name_city_key)
          )
        )`).bind(
        payloadJson, orgId, searchId, now, nextDispatchAt, now, now,
        orgId, searchId,
        orgId, parentJobId, searchId, leaseOwner, leaseGeneration, now,
        orgId,
      ),
      this.db.prepare(`WITH payload AS (
        SELECT value AS item FROM json_each(?)
      )
      UPDATE lead_radar_companies SET
        enrichment_status = 'queued', enrichment_reason = NULL, updated_at = ?
      WHERE org_id = ? AND search_id = ? AND suppressed = 0
        AND enrichment_status IN ('pending', 'queued', 'processing')
        AND canonical_key IN (SELECT json_extract(item, '$.canonicalKey') FROM payload
          WHERE json_extract(item, '$.enrichWebsite') = 1)
        AND ${parentFence}
        AND EXISTS (
          SELECT 1 FROM lead_radar_jobs child
          WHERE child.org_id = ? AND child.search_id = ?
            AND child.company_id = lead_radar_companies.id
            AND child.stage = 'enrichment'
            AND child.status IN ('queued', 'running', 'retry_wait')
        )`).bind(
        payloadJson, now, orgId, searchId,
        orgId, parentJobId, searchId, leaseOwner, leaseGeneration, now,
        orgId, searchId,
      ),
      this.db.prepare(`WITH payload AS (
        SELECT value AS item FROM json_each(?)
      )
      UPDATE lead_radar_searches SET excluded_count = (
        SELECT COUNT(*) FROM payload
        WHERE NOT EXISTS (
          SELECT 1 FROM lead_radar_companies company
          WHERE company.org_id = ? AND company.search_id = ?
            AND company.canonical_key = json_extract(item, '$.canonicalKey')
            AND company.suppressed = 0
        )
      ), state_version = state_version + 1
      WHERE org_id = ? AND id = ? AND ${parentFence}`).bind(
        payloadJson, orgId, searchId, orgId, searchId,
        orgId, parentJobId, searchId, leaseOwner, leaseGeneration, now,
      ),
    ];
    const results = await this.db.batch(statements);
    return Number(results[4]?.meta.changes ?? 0) === 1;
  }

  async getLeadForEnrichment(
    orgId: string,
    leadId: string,
  ): Promise<{ searchId: string; lead: StoredLeadInput } | null> {
    const row = await this.db.prepare(`SELECT * FROM lead_radar_companies
      WHERE org_id = ? AND id = ? AND suppressed = 0 LIMIT 1`)
      .bind(orgId, leadId).first<LeadRow>();
    if (!row) return null;
    const evidenceResult = await this.db.prepare(`SELECT * FROM lead_radar_evidence
      WHERE org_id = ? AND company_id = ? ORDER BY field_path, id`)
      .bind(orgId, leadId).all<EvidenceRow>();
    return {
      searchId: row.search_id,
      lead: {
        canonicalKey: row.canonical_key,
        name: row.name,
        category: row.category,
        city: row.city,
        country: row.country,
        address: row.address,
        website: row.website,
        phone: row.phone,
        genericEmail: row.generic_email,
        telegramUrl: row.telegram_url,
        telegramContact: telegramContactFromJson(row.telegram_contact_json),
        decisionMakers: decisionMakersFromJson(row.decision_makers_json),
        enrichmentStatus: row.enrichment_status,
        enrichmentReason: row.enrichment_reason,
        enrichmentAttempts: Number(row.enrichment_attempts ?? 0),
        score: Number(row.score),
        confidence: Number(row.confidence),
        priority: row.priority,
        lifecycle: row.lifecycle,
        suppressed: false,
        scoreComponents: parseJson(row.score_components_json, []),
        signals: parseJson(row.signals_json, []),
        evidence: (evidenceResult.results ?? []).map(mapEvidence),
        discoveredAt: row.discovered_at,
        lastVerifiedAt: row.last_verified_at,
      },
    };
  }

  async markLeadEnrichmentProcessing(
    orgId: string, leadId: string, jobId: string, leaseOwner: string, attempts: number, now: string,
    leaseGeneration?: number,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_companies SET
      enrichment_status = 'processing', enrichment_reason = NULL,
      enrichment_attempts = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND suppressed = 0
        AND enrichment_status IN ('pending', 'queued', 'processing')
        AND EXISTS (SELECT 1 FROM lead_radar_jobs job
          WHERE job.org_id = ? AND job.id = ? AND job.status = 'running'
            AND job.lease_owner = ? AND job.lease_expires_at > ?
            AND (? IS NULL OR job.lease_generation = ?))`)
      .bind(Math.max(0, Math.trunc(attempts)), now, orgId, leadId,
        orgId, jobId, leaseOwner, now,
        leaseGeneration ?? null, leaseGeneration ?? null).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async markLeadEnrichmentTerminal(
    orgId: string,
    leadId: string,
    jobId: string,
    leaseOwner: string,
    reason: LeadRadarLead['enrichmentReason'],
    attempts: number,
    now: string,
    leaseGeneration?: number,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_companies SET
      enrichment_status = 'terminal', enrichment_reason = ?,
      enrichment_attempts = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND suppressed = 0
        AND EXISTS (SELECT 1 FROM lead_radar_jobs job
          WHERE job.org_id = ? AND job.id = ? AND job.status = 'running'
            AND job.lease_owner = ? AND job.lease_expires_at > ?
            AND (? IS NULL OR job.lease_generation = ?))`)
      .bind(reason, Math.max(0, Math.trunc(attempts)), now, orgId, leadId,
        orgId, jobId, leaseOwner, now,
        leaseGeneration ?? null, leaseGeneration ?? null).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async markLeadEnrichmentQueued(
    orgId: string, leadId: string, jobId: string, leaseOwner: string, now: string,
    leaseGeneration?: number,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_companies SET
      enrichment_status = 'queued', enrichment_reason = NULL, updated_at = ?
      WHERE org_id = ? AND id = ? AND suppressed = 0
        AND enrichment_status IN ('pending', 'queued', 'processing')
        AND EXISTS (SELECT 1 FROM lead_radar_jobs job
          WHERE job.org_id = ? AND job.id = ? AND job.status = 'running'
            AND job.lease_owner = ? AND job.lease_expires_at > ?
            AND (? IS NULL OR job.lease_generation = ?))`)
      .bind(now, orgId, leadId, orgId, jobId, leaseOwner, now,
        leaseGeneration ?? null, leaseGeneration ?? null).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async markLeadEnrichmentTerminalFromDeadLetter(
    orgId: string,
    leadId: string,
    jobId: string,
    reason: LeadRadarLead['enrichmentReason'],
    attempts: number,
    now: string,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_companies SET
      enrichment_status = 'terminal', enrichment_reason = ?, enrichment_attempts = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND suppressed = 0
        AND enrichment_status <> 'enriched'
        AND EXISTS (SELECT 1 FROM lead_radar_jobs job
          WHERE job.org_id = ? AND job.id = ? AND job.company_id = ? AND job.status = 'dead_letter')`)
      .bind(reason, Math.max(0, Math.trunc(attempts)), now,
        orgId, leadId, orgId, jobId, leadId).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async purgeLeadForExistingSuppression(orgId: string, leadId: string, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(`DELETE FROM lead_radar_evidence
        WHERE org_id = ? AND company_id = ?`).bind(orgId, leadId),
      this.db.prepare(`UPDATE lead_radar_companies SET
        lifecycle = 'do_not_contact', suppressed = 1,
        phone = NULL, phone_digits = NULL, generic_email = NULL,
        telegram_url = NULL, telegram_contact_json = 'null', decision_makers_json = '[]',
        enrichment_status = 'terminal', enrichment_reason = 'suppressed', updated_at = ?
        WHERE org_id = ? AND id = ?`).bind(now, orgId, leadId),
    ]);
  }

  async hasSuppressionForLead(orgId: string, lead: StoredLeadInput): Promise<boolean> {
    return matchesSuppression(fingerprint(lead), await this.listSuppressions(orgId));
  }

  async applyLeadEnrichment(
    orgId: string,
    leadId: string,
    jobId: string,
    leaseOwner: string,
    lead: StoredLeadInput,
    now: string,
    leaseGeneration?: number,
    effect?: LeadRadarJobEffect,
  ): Promise<boolean> {
    if (effect && (leaseGeneration === undefined
      || effect.effectKey.length < 1 || effect.effectKey.length > 160
      || !/^[a-f0-9]{64}$/.test(effect.payloadDigest))) {
      throw new Error('lead_radar_job_effect_invalid');
    }
    const identity = fingerprint(lead);
    const storedContact = contactForStorage(
      lead.telegramContact,
      lead.decisionMakers ?? [],
      Date.parse(now),
    );
    const statements: D1PreparedStatement[] = [];
    const effectGuard = effect
      ? `AND NOT EXISTS (
          SELECT 1 FROM lead_radar_job_effects effect
          WHERE effect.org_id = ? AND effect.job_id = ?
            AND effect.effect_key = ? AND effect.payload_digest <> ?
        )`
      : '';
    statements.push(this.db.prepare(`UPDATE lead_radar_companies SET
      website = ?, domain = ?, phone = ?, phone_digits = ?, generic_email = ?,
      telegram_url = ?, telegram_contact_json = ?, decision_makers_json = ?,
      score = ?, confidence = ?, priority = ?, score_components_json = ?, signals_json = ?,
      last_verified_at = ?, updated_at = ?, enrichment_status = 'enriched',
      enrichment_reason = 'enriched', enrichment_attempts = ?
      WHERE org_id = ? AND id = ? AND suppressed = 0
        AND enrichment_status = 'processing'
        AND EXISTS (
          SELECT 1 FROM lead_radar_jobs job
          WHERE job.org_id = ? AND job.id = ? AND job.status = 'running'
            AND job.lease_owner = ? AND job.lease_expires_at > ?
            AND (? IS NULL OR job.lease_generation = ?)
        )
        AND NOT EXISTS (
          SELECT 1 FROM lead_radar_suppressions suppression
          WHERE suppression.org_id = ? AND (
            suppression.canonical_key = ?
            OR (? IS NOT NULL AND suppression.domain = ?)
            OR (? IS NOT NULL AND suppression.phone_digits = ?)
            OR (? IS NOT NULL AND suppression.name_city_key = ?)
          )
        )
        ${effectGuard}`).bind(
      lead.website, identity.domain, lead.phone, identity.phoneDigits, lead.genericEmail,
      lead.telegramUrl, JSON.stringify(storedContact), JSON.stringify(lead.decisionMakers ?? []),
      lead.score, lead.confidence, lead.priority, JSON.stringify(lead.scoreComponents), JSON.stringify(lead.signals),
      lead.lastVerifiedAt, now, lead.enrichmentAttempts ?? 0,
      orgId, leadId, orgId, jobId, leaseOwner, now,
      leaseGeneration ?? null, leaseGeneration ?? null,
      orgId, identity.canonicalKey,
      identity.domain, identity.domain, identity.phoneDigits, identity.phoneDigits,
      identity.nameCityKey, identity.nameCityKey,
      ...(effect ? [orgId, jobId, effect.effectKey, effect.payloadDigest] : []),
    ));
    for (const item of lead.evidence) {
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO lead_radar_evidence (
        id, org_id, company_id, field_path, value, source_url, source_type,
        observed_at, confidence, classification
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM lead_radar_companies company
        WHERE company.org_id = ? AND company.id = ? AND company.suppressed = 0
          AND company.enrichment_status IN ('processing', 'enriched')
      ) AND EXISTS (
        SELECT 1 FROM lead_radar_jobs job
        WHERE job.org_id = ? AND job.id = ? AND job.status = 'running'
          AND job.lease_owner = ? AND job.lease_expires_at > ?
          AND (? IS NULL OR job.lease_generation = ?)
      ) AND NOT EXISTS (
        SELECT 1 FROM lead_radar_suppressions suppression
        WHERE suppression.org_id = ? AND (
          suppression.canonical_key = ?
          OR (? IS NOT NULL AND suppression.domain = ?)
          OR (? IS NOT NULL AND suppression.phone_digits = ?)
          OR (? IS NOT NULL AND suppression.name_city_key = ?)
        )
      )
      ${effectGuard}`).bind(
        item.id, orgId, leadId, item.fieldPath, item.value, item.sourceUrl,
        item.sourceType, item.observedAt, item.confidence, item.classification,
        orgId, leadId,
        orgId, jobId, leaseOwner, now,
        leaseGeneration ?? null, leaseGeneration ?? null,
        orgId, identity.canonicalKey,
        identity.domain, identity.domain, identity.phoneDigits, identity.phoneDigits,
        identity.nameCityKey, identity.nameCityKey,
        ...(effect ? [orgId, jobId, effect.effectKey, effect.payloadDigest] : []),
      ));
    }
    if (effect) {
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO lead_radar_job_effects (
        org_id, job_id, effect_key, payload_digest, applied_at
      ) SELECT ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM lead_radar_jobs job
        WHERE job.org_id = ? AND job.id = ? AND job.status = 'running'
          AND job.lease_owner = ? AND job.lease_generation = ?
          AND job.lease_expires_at > ?
      ) AND EXISTS (
        SELECT 1 FROM lead_radar_companies company
        WHERE company.org_id = ? AND company.id = ? AND company.suppressed = 0
          AND company.enrichment_status = 'enriched'
          AND company.website IS ? AND company.phone IS ?
          AND company.generic_email IS ? AND company.last_verified_at = ?
          AND company.enrichment_attempts = ?
      )`).bind(
        orgId, jobId, effect.effectKey, effect.payloadDigest, now,
        orgId, jobId, leaseOwner, leaseGeneration, now,
        orgId, leadId, lead.website, lead.phone, lead.genericEmail,
        lead.lastVerifiedAt, lead.enrichmentAttempts ?? 0,
      ));
    }
    const results = await this.db.batch(statements);
    return Number(results[0]?.meta.changes ?? 0) === 1;
  }

  async createJob(
    orgId: string,
    searchId: string,
    companyId: string | null,
    stage: LeadRadarJobStage,
    idempotencyKey: string,
    now: string,
    maxAttempts = 3,
    nextDispatchAt = now,
  ): Promise<LeadRadarJob> {
    const id = `lrjob_${crypto.randomUUID().replaceAll('-', '')}`;
    await this.db.prepare(`INSERT INTO lead_radar_jobs (
      id, org_id, search_id, company_id, idempotency_key, stage, status,
      attempt_count, max_attempts, available_at, dispatch_status,
      next_dispatch_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, 'pending', ?, ?, ?)
    ON CONFLICT(org_id, idempotency_key) DO NOTHING`).bind(
      id, orgId, searchId, companyId, idempotencyKey, stage,
      Math.max(1, Math.min(5, Math.trunc(maxAttempts))), now, nextDispatchAt, now, now,
    ).run();
    const row = await this.db.prepare(`SELECT * FROM lead_radar_jobs
      WHERE org_id = ? AND idempotency_key = ? LIMIT 1`)
      .bind(orgId, idempotencyKey).first<JobRow>();
    if (!row) throw new Error('lead_radar_job_persistence_failed');
    return mapJob(row);
  }

  async getJob(jobId: string): Promise<LeadRadarJob | null> {
    const row = await this.db.prepare(`SELECT * FROM lead_radar_jobs WHERE id = ? LIMIT 1`)
      .bind(jobId).first<JobRow>();
    return row ? mapJob(row) : null;
  }

  async getJobEffectDigest(
    orgId: string,
    jobId: string,
    effectKey: string,
  ): Promise<string | null> {
    const row = await this.db.prepare(`SELECT payload_digest
      FROM lead_radar_job_effects
      WHERE org_id = ? AND job_id = ? AND effect_key = ? LIMIT 1`)
      .bind(orgId, jobId, effectKey).first<{ payload_digest: string }>();
    return row?.payload_digest ?? null;
  }

  async claimJob(orgId: string, jobId: string, now: string, leaseExpiresAt: string): Promise<LeadRadarJob | null> {
    const leaseOwner = `lease_${crypto.randomUUID().replaceAll('-', '')}`;
    const result = await this.db.prepare(`UPDATE lead_radar_jobs SET
      status = 'running', attempt_count = attempt_count + 1,
      lease_owner = ?, lease_expires_at = ?, lease_generation = lease_generation + 1,
      updated_at = ?
      WHERE org_id = ? AND id = ? AND (
        (status IN ('queued', 'retry_wait') AND available_at <= ?)
        OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
      ) AND attempt_count < max_attempts`)
      .bind(leaseOwner, leaseExpiresAt, now, orgId, jobId, now, now).run();
    if (Number(result.meta.changes ?? 0) !== 1) return null;
    const row = await this.db.prepare(`SELECT * FROM lead_radar_jobs
      WHERE org_id = ? AND id = ? AND lease_owner = ? LIMIT 1`)
      .bind(orgId, jobId, leaseOwner).first<JobRow>();
    return row ? mapJob(row) : null;
  }

  async extendJobLease(
    orgId: string,
    jobId: string,
    leaseOwner: string,
    leaseGeneration: number,
    now: string,
    leaseExpiresAt: string,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_jobs SET
      lease_expires_at = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND status = 'running'
        AND lease_owner = ? AND lease_generation = ? AND lease_expires_at > ?`)
      .bind(leaseExpiresAt, now, orgId, jobId, leaseOwner, leaseGeneration, now).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async completeJob(
    orgId: string,
    jobId: string,
    leaseOwner: string,
    now: string,
    leaseGeneration?: number,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_jobs SET status = 'completed',
      lease_owner = NULL, lease_expires_at = NULL, last_error_code = NULL,
      completed_at = ?, updated_at = ? WHERE org_id = ? AND id = ?
        AND status = 'running' AND lease_owner = ? AND lease_expires_at > ?
        AND (? IS NULL OR lease_generation = ?)`)
      .bind(now, now, orgId, jobId, leaseOwner, now,
        leaseGeneration ?? null, leaseGeneration ?? null).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async completeDiscoveryJobAndReleaseFanout(
    orgId: string,
    searchId: string,
    jobId: string,
    leaseOwner: string,
    now: string,
    leaseGeneration: number,
  ): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_jobs SET
        status = 'completed', lease_owner = NULL, lease_expires_at = NULL,
        last_error_code = NULL, completed_at = ?, updated_at = ?
        WHERE org_id = ? AND search_id = ? AND id = ? AND stage = 'discovery'
          AND status = 'running' AND lease_owner = ?
          AND lease_expires_at > ? AND lease_generation = ?`).bind(
        now, now, orgId, searchId, jobId, leaseOwner, now, leaseGeneration,
      ),
      this.db.prepare(`UPDATE lead_radar_jobs SET
        next_dispatch_at = ?, updated_at = ?
        WHERE org_id = ? AND search_id = ? AND stage = 'enrichment'
          AND status = 'queued'
          AND dispatch_status = 'pending'
          AND EXISTS (SELECT 1 FROM lead_radar_jobs parent
            WHERE parent.org_id = ? AND parent.search_id = ? AND parent.id = ?
              AND parent.stage = 'discovery' AND parent.status = 'completed')`).bind(
        now, now, orgId, searchId, orgId, searchId, jobId,
      ),
    ]);
    return Number(results[0]?.meta.changes ?? 0) === 1;
  }

  async retryJob(
    orgId: string,
    jobId: string,
    leaseOwner: string,
    errorCode: string,
    availableAt: string,
    now: string,
    leaseGeneration?: number,
    preserveAttemptBudget = false,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_jobs SET status = 'retry_wait',
      attempt_count = CASE WHEN ? = 1 AND stage = 'enrichment'
        AND created_at > ? THEN MAX(0, attempt_count - 1) ELSE attempt_count END,
      lease_owner = NULL, lease_expires_at = NULL, last_error_code = ?,
      available_at = ?, dispatch_status = 'pending', next_dispatch_at = ?,
      dispatch_lease_owner = NULL, dispatch_lease_expires_at = NULL,
      dispatched_at = NULL, updated_at = ?
      WHERE org_id = ? AND id = ? AND status = 'running' AND lease_owner = ?
        AND lease_expires_at > ? AND (? IS NULL OR lease_generation = ?)`)
      .bind(preserveAttemptBudget ? 1 : 0, new Date(Date.parse(now) - 30 * 60_000).toISOString(),
        errorCode, availableAt, availableAt, now, orgId, jobId, leaseOwner, now,
        leaseGeneration ?? null, leaseGeneration ?? null).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async deadLetterJob(
    orgId: string,
    jobId: string,
    leaseOwner: string,
    errorCode: string,
    now: string,
    leaseGeneration?: number,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_jobs SET status = 'dead_letter',
      lease_owner = NULL, lease_expires_at = NULL, last_error_code = ?,
      completed_at = ?, updated_at = ? WHERE org_id = ? AND id = ?
        AND status = 'running' AND lease_owner = ? AND lease_expires_at > ?
        AND (? IS NULL OR lease_generation = ?)`)
      .bind(errorCode, now, now, orgId, jobId, leaseOwner, now,
        leaseGeneration ?? null, leaseGeneration ?? null).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async deadLetterExpiredJob(
    orgId: string,
    jobId: string,
    errorCode: string,
    now: string,
    leaseGeneration?: number,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_jobs SET status = 'dead_letter',
      lease_owner = NULL, lease_expires_at = NULL, last_error_code = ?,
      completed_at = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND status = 'running'
        AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
        AND attempt_count >= max_attempts AND (? IS NULL OR lease_generation = ?)`)
      .bind(errorCode, now, now, orgId, jobId, now,
        leaseGeneration ?? null, leaseGeneration ?? null).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async deadLetterDiscoveryChildren(
    orgId: string,
    searchId: string,
    now: string,
  ): Promise<number> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_jobs SET
        status = 'dead_letter', lease_owner = NULL, lease_expires_at = NULL,
        dispatch_lease_owner = NULL, dispatch_lease_expires_at = NULL,
        last_error_code = 'discovery_failed', completed_at = ?, updated_at = ?
        WHERE org_id = ? AND search_id = ? AND stage = 'enrichment'
          AND status IN ('queued', 'retry_wait')`).bind(now, now, orgId, searchId),
      this.db.prepare(`UPDATE lead_radar_companies SET
        enrichment_status = 'terminal', enrichment_reason = 'source_unavailable', updated_at = ?
        WHERE org_id = ? AND search_id = ? AND suppressed = 0
          AND enrichment_status IN ('pending', 'queued', 'processing')
          AND EXISTS (SELECT 1 FROM lead_radar_jobs child
            WHERE child.org_id = ? AND child.search_id = ?
              AND child.company_id = lead_radar_companies.id
              AND child.stage = 'enrichment' AND child.status = 'dead_letter'
              AND child.last_error_code = 'discovery_failed')`).bind(
        now, orgId, searchId, orgId, searchId,
      ),
    ]);
    return Number(results[0]?.meta.changes ?? 0);
  }

  async recoverExpiredJob(
    job: LeadRadarJob,
    availableAt: string,
    now: string,
  ): Promise<'retry_wait' | 'completed' | 'dead_letter' | null> {
    if (job.status !== 'running' || !job.leaseExpiresAt || job.leaseExpiresAt > now) return null;
    if (job.companyId && await this.getJobEffectDigest(
      job.orgId, job.id, 'company_enrichment:v1',
    )) {
      const completed = await this.db.prepare(`UPDATE lead_radar_jobs SET
        status = 'completed', lease_owner = NULL, lease_expires_at = NULL,
        last_error_code = NULL, completed_at = ?, updated_at = ?
        WHERE org_id = ? AND id = ? AND status = 'running'
          AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
          AND lease_generation = ?`).bind(
        now, now, job.orgId, job.id, now, job.leaseGeneration,
      ).run();
      return Number(completed.meta.changes ?? 0) === 1 ? 'completed' : null;
    }
    if (job.attemptCount >= job.maxAttempts) {
      const transitioned = await this.deadLetterExpiredJob(
        job.orgId, job.id, 'retry_exhausted', now, job.leaseGeneration,
      );
      if (!transitioned) return null;
      if (job.companyId) {
        await this.markLeadEnrichmentTerminalFromDeadLetter(
          job.orgId, job.companyId, job.id, 'retry_exhausted', job.attemptCount, now,
        );
      }
      if (job.stage === 'discovery') {
        await this.deadLetterDiscoveryChildren(job.orgId, job.searchId, now);
      }
      return 'dead_letter';
    }
    const statements: D1PreparedStatement[] = [this.db.prepare(`UPDATE lead_radar_jobs SET
      status = 'retry_wait', lease_owner = NULL, lease_expires_at = NULL,
      last_error_code = 'lease_expired', available_at = ?, dispatch_status = 'pending',
      next_dispatch_at = ?, dispatch_lease_owner = NULL,
      dispatch_lease_expires_at = NULL, dispatched_at = NULL, updated_at = ?
      WHERE org_id = ? AND id = ? AND status = 'running'
        AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
        AND attempt_count < max_attempts AND lease_generation = ?`).bind(
      availableAt, availableAt, now, job.orgId, job.id, now, job.leaseGeneration,
    )];
    if (job.companyId) {
      statements.push(this.db.prepare(`UPDATE lead_radar_companies SET
        enrichment_status = 'queued', enrichment_reason = NULL, updated_at = ?
        WHERE org_id = ? AND id = ? AND suppressed = 0
          AND enrichment_status IN ('pending', 'queued', 'processing')
          AND EXISTS (SELECT 1 FROM lead_radar_jobs recovered
            WHERE recovered.org_id = ? AND recovered.id = ?
              AND recovered.company_id = ? AND recovered.status = 'retry_wait'
              AND recovered.lease_generation = ?)`).bind(
        now, job.orgId, job.companyId, job.orgId, job.id, job.companyId, job.leaseGeneration,
      ));
    }
    const results = await this.db.batch(statements);
    return Number(results[0]?.meta.changes ?? 0) === 1 ? 'retry_wait' : null;
  }

  async deferQueuedJob(orgId: string, jobId: string, availableAt: string, now: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_jobs SET available_at = ?,
      dispatch_status = 'pending', next_dispatch_at = ?, dispatched_at = NULL, updated_at = ?
      WHERE org_id = ? AND id = ? AND status IN ('queued', 'retry_wait')`)
      .bind(availableAt, availableAt, now, orgId, jobId).run();
  }

  async listExpiredJobs(now: string, limit = 2): Promise<LeadRadarJob[]> {
    const result = await this.db.prepare(`SELECT * FROM lead_radar_jobs
      WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
      ORDER BY lease_expires_at, org_id, id LIMIT ?`).bind(
      now, Math.max(1, Math.min(2, Math.trunc(limit))),
    ).all<JobRow>();
    return (result.results ?? []).map(mapJob);
  }

  async observeJobDispatch(jobId: string, now: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_jobs SET
      dispatch_status = 'sent', dispatched_at = COALESCE(dispatched_at, ?),
      dispatch_lease_owner = NULL, dispatch_lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND status IN ('queued', 'running', 'retry_wait')
        AND available_at <= ? AND dispatch_status = 'pending'`).bind(now, now, jobId, now).run();
  }

  async requeueStaleSentDispatches(
    staleBefore: string,
    now: string,
    allowOrganization: (orgId: string) => boolean = () => true,
    limit = 5,
  ): Promise<number> {
    const stale = await this.db.prepare(`SELECT * FROM lead_radar_jobs
      WHERE status IN ('queued', 'retry_wait') AND available_at <= ?
        AND dispatch_status = 'sent' AND dispatched_at IS NOT NULL
        AND dispatched_at <= ?
      ORDER BY dispatched_at, org_id, id LIMIT ?`).bind(
      now, staleBefore, Math.max(1, Math.min(5, Math.trunc(limit))),
    ).all<JobRow>();
    let requeued = 0;
    for (const row of stale.results ?? []) {
      if (!allowOrganization(row.org_id)) continue;
      const result = await this.db.prepare(`UPDATE lead_radar_jobs SET
        dispatch_status = 'pending', next_dispatch_at = ?, dispatched_at = NULL,
        dispatch_lease_owner = NULL, dispatch_lease_expires_at = NULL, updated_at = ?
        WHERE org_id = ? AND id = ? AND status IN ('queued', 'retry_wait')
          AND available_at <= ? AND dispatch_status = 'sent'
          AND dispatched_at IS NOT NULL AND dispatched_at <= ?`).bind(
        now, now, row.org_id, row.id, now, staleBefore,
      ).run();
      requeued += Number(result.meta.changes ?? 0);
    }
    return requeued;
  }

  async reserveJobDispatch(
    orgId: string,
    jobId: string,
    now: string,
    leaseExpiresAt: string,
  ): Promise<LeadRadarDispatchReservation | null> {
    const dispatchLeaseOwner = `dispatch_${crypto.randomUUID().replaceAll('-', '')}`;
    const reserved = await this.db.prepare(`UPDATE lead_radar_jobs SET
      dispatch_lease_owner = ?, dispatch_lease_expires_at = ?,
      dispatch_attempt_count = dispatch_attempt_count + 1, updated_at = ?
      WHERE org_id = ? AND id = ? AND status IN ('queued', 'retry_wait')
        AND available_at <= ? AND dispatch_status = 'pending'
        AND COALESCE(next_dispatch_at, available_at) <= ?
        AND (dispatch_lease_owner IS NULL OR dispatch_lease_expires_at <= ?)`)
      .bind(dispatchLeaseOwner, leaseExpiresAt, now, orgId, jobId, now, now, now).run();
    if (Number(reserved.meta.changes ?? 0) !== 1) return null;
    const row = await this.db.prepare(`SELECT * FROM lead_radar_jobs
      WHERE org_id = ? AND id = ? AND dispatch_status = 'pending'
        AND dispatch_lease_owner = ? LIMIT 1`).bind(
      orgId, jobId, dispatchLeaseOwner,
    ).first<JobRow>();
    return row ? {
      job: mapJob(row),
      dispatchLeaseOwner,
      dispatchLeaseExpiresAt: leaseExpiresAt,
    } : null;
  }

  async reserveDueJobDispatches(
    now: string,
    leaseExpiresAt: string,
    limit = 5,
    allowOrganization: (orgId: string) => boolean = () => true,
  ): Promise<LeadRadarDispatchReservation[]> {
    const boundedLimit = Math.max(1, Math.min(5, Math.trunc(limit)));
    const scanLimit = 100;
    const candidates = await this.db.prepare(`WITH stage_ranked AS (
      SELECT jobs.*,
        COALESCE(next_dispatch_at, available_at) AS due_at,
        ROW_NUMBER() OVER (
          PARTITION BY org_id, stage
          ORDER BY COALESCE(next_dispatch_at, available_at), available_at, id
        ) AS stage_rank
      FROM lead_radar_jobs jobs
      WHERE status IN ('queued', 'retry_wait') AND available_at <= ?
        AND dispatch_status = 'pending'
        AND COALESCE(next_dispatch_at, available_at) <= ?
        AND (dispatch_lease_owner IS NULL OR dispatch_lease_expires_at <= ?)
    ), tenant_ranked AS (
      SELECT stage_ranked.*,
        ROW_NUMBER() OVER (
          PARTITION BY org_id
          ORDER BY stage_rank, due_at,
            CASE stage WHEN 'discovery' THEN 0 ELSE 1 END, id
        ) AS tenant_rank,
        MIN(due_at) OVER (PARTITION BY org_id) AS tenant_due_at
      FROM stage_ranked
    )
    SELECT * FROM tenant_ranked
    ORDER BY tenant_rank, tenant_due_at, org_id, stage_rank,
      CASE stage WHEN 'discovery' THEN 0 ELSE 1 END, due_at, id
    LIMIT ?`).bind(now, now, now, scanLimit).all<JobRow>();
    const reservations: LeadRadarDispatchReservation[] = [];
    for (const candidate of candidates.results ?? []) {
      if (reservations.length >= boundedLimit) break;
      if (!allowOrganization(candidate.org_id)) continue;
      const reservation = await this.reserveJobDispatch(
        candidate.org_id, candidate.id, now, leaseExpiresAt,
      );
      if (reservation) reservations.push(reservation);
    }
    return reservations;
  }

  async markJobDispatchSent(
    orgId: string,
    jobId: string,
    dispatchLeaseOwner: string,
    now: string,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_jobs SET
      dispatch_status = 'sent', dispatched_at = ?, dispatch_lease_owner = NULL,
      dispatch_lease_expires_at = NULL, updated_at = ?
      WHERE org_id = ? AND id = ? AND status IN ('queued', 'retry_wait')
        AND dispatch_status = 'pending' AND dispatch_lease_owner = ?`)
      .bind(now, now, orgId, jobId, dispatchLeaseOwner).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async releaseJobDispatch(
    orgId: string,
    jobId: string,
    dispatchLeaseOwner: string,
    nextDispatchAt: string,
    now: string,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_jobs SET
      dispatch_lease_owner = NULL, dispatch_lease_expires_at = NULL,
      next_dispatch_at = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND status IN ('queued', 'retry_wait')
        AND dispatch_status = 'pending' AND dispatch_lease_owner = ?`)
      .bind(nextDispatchAt, now, orgId, jobId, dispatchLeaseOwner).run();
    return Number(result.meta.changes ?? 0) === 1;
  }

  async purgeExpiredPersonalContacts(cutoff: string, now: string): Promise<number> {
    const maxFuture = new Date(Date.parse(now) + 5 * 60_000).toISOString();
    // The CASE wrappers are deliberate: json_each/json_extract must never see
    // malformed legacy JSON. Missing, malformed and implausibly-future personal
    // timestamps are expired fail-closed, while non-human corporate endpoints
    // are outside this short personal-data retention policy.
    const affected = await this.db.prepare(`SELECT id, org_id, search_id, telegram_url,
        telegram_contact_json, decision_makers_json
      FROM lead_radar_companies
      WHERE suppressed = 0 AND (
        NOT json_valid(telegram_contact_json)
        OR json_type(CASE WHEN json_valid(telegram_contact_json)
          THEN telegram_contact_json ELSE 'null' END) NOT IN ('object', 'null')
        OR (
          json_extract(CASE WHEN json_valid(telegram_contact_json)
            THEN telegram_contact_json ELSE 'null' END, '$.type') = 'human'
          AND (
            typeof(json_extract(CASE WHEN json_valid(telegram_contact_json)
              THEN telegram_contact_json ELSE 'null' END, '$.verifiedAt')) <> 'text'
            OR unixepoch(json_extract(CASE WHEN json_valid(telegram_contact_json)
              THEN telegram_contact_json ELSE 'null' END, '$.verifiedAt')) IS NULL
            OR unixepoch(json_extract(CASE WHEN json_valid(telegram_contact_json)
              THEN telegram_contact_json ELSE 'null' END, '$.verifiedAt')) < unixepoch(?)
            OR unixepoch(json_extract(CASE WHEN json_valid(telegram_contact_json)
              THEN telegram_contact_json ELSE 'null' END, '$.verifiedAt')) > unixepoch(?)
          )
        )
        OR NOT json_valid(decision_makers_json)
        OR json_type(CASE WHEN json_valid(decision_makers_json)
          THEN decision_makers_json ELSE '[]' END) <> 'array'
        OR EXISTS (
          SELECT 1 FROM json_each(CASE WHEN json_valid(decision_makers_json)
            THEN CASE WHEN json_type(decision_makers_json) = 'array'
              THEN decision_makers_json ELSE '[]' END
            ELSE '[]' END) person
          WHERE typeof(json_extract(person.value, '$.verifiedAt')) <> 'text'
            OR unixepoch(json_extract(person.value, '$.verifiedAt')) IS NULL
            OR unixepoch(json_extract(person.value, '$.verifiedAt')) < unixepoch(?)
            OR unixepoch(json_extract(person.value, '$.verifiedAt')) > unixepoch(?)
        )
      )
      -- Five rows expand to at most ten batch statements. Together with the
      -- exact cold schema audit, Telegram retention and five-job dispatcher,
      -- this keeps the 15-minute cron invocation below D1's Free 50-query cap.
      ORDER BY org_id, id LIMIT 5`).bind(
      cutoff, maxFuture, cutoff, maxFuture,
    ).all<{
      id: string;
      org_id: string;
      search_id: string;
      telegram_url: string | null;
      telegram_contact_json: string;
      decision_makers_json: string;
    }>();
    const rows = affected.results ?? [];
    if (rows.length === 0) return 0;
    const statements: D1PreparedStatement[] = [];
    const nowMs = Date.parse(now);
    for (const row of rows) {
      const retainedPeople = decisionMakersFromJson(row.decision_makers_json)
        .filter((person) => isFreshPersonalContact(person.verifiedAt, nowMs));
      const rawContact = parseJson<unknown>(row.telegram_contact_json, undefined);
      const parsedContact = telegramContactFromJson(row.telegram_contact_json);
      const retainedContact = parsedContact?.type === 'human'
        ? (isFreshPersonalContact(parsedContact.verifiedAt, nowMs)
            ? contactForStorage(parsedContact, retainedPeople, nowMs)
            : null)
        : parsedContact;
      const malformedContact = rawContact === undefined
        || (rawContact !== null && (!rawContact || typeof rawContact !== 'object' || Array.isArray(rawContact)))
        || (rawContact !== null && parsedContact === null);
      const removeTelegramUrl = malformedContact
        || (parsedContact?.type === 'human' && retainedContact === null);
      const retainedEvidenceIds = [...new Set([
        ...(retainedContact?.type === 'human' ? retainedContact.evidenceIds : []),
        ...retainedPeople.flatMap((person) => person.evidenceIds),
      ])];
      const placeholders = retainedEvidenceIds.map(() => '?').join(', ');
      statements.push(this.db.prepare(`UPDATE lead_radar_companies SET
        telegram_url = ?, telegram_contact_json = ?, decision_makers_json = ?, updated_at = ?
        WHERE org_id = ? AND id = ? AND suppressed = 0`).bind(
        removeTelegramUrl ? null : row.telegram_url,
        retainedContact ? JSON.stringify(retainedContact) : 'null',
        JSON.stringify(retainedPeople),
        now,
        row.org_id,
        row.id,
      ));
      statements.push(this.db.prepare(`DELETE FROM lead_radar_evidence
        WHERE org_id = ? AND company_id = ?
          AND (field_path LIKE 'decision_makers.%' OR field_path LIKE 'web.telegram.human%')
          ${retainedEvidenceIds.length > 0 ? `AND id NOT IN (${placeholders})` : ''}`).bind(
        row.org_id,
        row.id,
        ...retainedEvidenceIds,
      ));
      // If the raw array was malformed, every well-formed retained entry is
      // still serialized above and all orphaned personal evidence is removed.
    }
    const results = await this.db.batch(statements);
    let purged = 0;
    for (let index = 0; index < results.length; index += 2) {
      purged += Number(results[index]?.meta.changes ?? 0);
    }
    return purged;
  }

  async refreshSearchFunnel(orgId: string, searchId: string, now: string): Promise<void> {
    const search = await this.db.prepare(`SELECT input_json, raw_discovered_count, excluded_count, warnings_json
      FROM lead_radar_searches WHERE org_id = ? AND id = ? LIMIT 1`)
      .bind(orgId, searchId).first<{
        input_json: string; raw_discovered_count: number; excluded_count: number; warnings_json: string;
      }>();
    if (!search) return;
    const rowsResult = await this.db.prepare(`SELECT company.priority, company.website,
      company.telegram_contact_json, company.decision_makers_json,
      company.enrichment_status, company.suppressed,
      EXISTS (
        SELECT 1 FROM lead_radar_evidence identity_evidence
        WHERE identity_evidence.org_id = company.org_id
          AND identity_evidence.company_id = company.id
          AND identity_evidence.field_path = 'company.name'
          AND identity_evidence.classification <> 'model_inference'
          AND identity_evidence.confidence >= 0.7
      ) AS verified_identity,
      EXISTS (
        SELECT 1 FROM lead_radar_evidence anchor_evidence
        WHERE anchor_evidence.org_id = company.org_id
          AND anchor_evidence.company_id = company.id
          AND anchor_evidence.classification <> 'model_inference'
          AND anchor_evidence.confidence >= 0.7
          AND (
            anchor_evidence.field_path LIKE 'locations.%'
            OR anchor_evidence.field_path LIKE 'company_contacts.%'
            OR (
              anchor_evidence.field_path = 'web.website'
              AND anchor_evidence.source_type = 'company_website'
              AND anchor_evidence.classification = 'fact'
            )
          )
      ) AS verified_anchor,
      EXISTS (
        SELECT 1 FROM lead_radar_evidence website_evidence
        WHERE website_evidence.org_id = company.org_id
          AND website_evidence.company_id = company.id
          AND website_evidence.field_path = 'web.website'
          AND website_evidence.source_type = 'company_website'
          AND website_evidence.classification = 'fact'
          AND website_evidence.confidence >= 0.7
      ) AS verified_website
      FROM lead_radar_companies company
      WHERE company.org_id = ? AND company.search_id = ?`).bind(orgId, searchId).all<Pick<LeadRow,
        'priority' | 'website' | 'telegram_contact_json' | 'decision_makers_json' | 'enrichment_status' | 'suppressed'
      > & { verified_identity: number; verified_anchor: number; verified_website: number }>();
    const jobsResult = await this.db.prepare(`SELECT stage, status, last_error_code FROM lead_radar_jobs
      WHERE org_id = ? AND search_id = ?`).bind(orgId, searchId).all<{
        stage: LeadRadarJobStage; status: LeadRadarJob['status']; last_error_code: string | null;
      }>();
    const rows = (rowsResult.results ?? []).filter((row) => row.suppressed !== 1);
    const jobs = jobsResult.results ?? [];
    const activeJobs = jobs.filter((job) => ['queued', 'running', 'retry_wait'].includes(job.status));
    const discoveryActive = activeJobs.some((job) => job.stage === 'discovery');
    const decisionMakers = rows.flatMap((row) => decisionMakersFromJson(row.decision_makers_json));
    const personalTelegramCount = rows.filter((row) => {
      const contact = telegramContactFromJson(row.telegram_contact_json);
      const people = decisionMakersFromJson(row.decision_makers_json);
      return Boolean(contact && contact.type === 'human' && isFreshPersonalContact(contact.verifiedAt, Date.parse(now))
          && people.some((person) => person.contactType === 'human'
          && telegramLocator(person.telegramUrl)?.username.toLowerCase() === contact.username.toLowerCase()
          && person.contactReviewStatus === 'approved'
          && isFreshPersonalContact(person.verifiedAt, Date.parse(now))));
    }).length;
    const companyTelegramCount = rows.filter((row) => telegramContactFromJson(row.telegram_contact_json)?.type === 'business').length;
    const processedCount = rows.filter((row) => ['enriched', 'terminal'].includes(row.enrichment_status)).length;
    const verifiedCount = rows.filter((row) => row.verified_identity === 1 && row.verified_anchor === 1).length;
    const websiteCount = rows.filter((row) => row.verified_website === 1).length;
    const pendingCount = rows.length - processedCount;
    const input = parseJson<LeadRadarSearchInput>(search.input_json, {
      niche: '', city: '', country: 'UZ', offer: '', desiredCount: 20,
      telegramRequired: false, languages: ['ru', 'uz'],
    });
    const deadJobs = jobs.filter((job) => job.status === 'dead_letter');
    const discoveryFailure = deadJobs.find((job) => job.stage === 'discovery');
    const warnings = [...new Set([
      ...parseJson<string[]>(search.warnings_json ?? '[]', []),
      ...deadJobs.map((job) => job.last_error_code).filter((item): item is string => Boolean(item)),
    ])].slice(0, 20);
    const terminal = activeJobs.length === 0 && jobs.some((job) => job.stage === 'discovery');
    const status: LeadRadarSearchStatus = !terminal
      ? 'running'
      : (discoveryFailure ? 'failed' : (rows.length === 0 ? 'insufficient_results'
        : (deadJobs.length > 0 || rows.length < input.desiredCount ? 'partial' : 'ready')));
    const phase: LeadRadarSearchPhase = terminal ? 'completed' : (discoveryActive ? 'discovering' : 'enriching');
    await this.db.prepare(`UPDATE lead_radar_searches SET
      status = ?, phase = ?, candidate_count = ?, verified_count = ?,
      processed_count = ?, pending_count = ?, website_count = ?, enriched_count = ?,
      decision_maker_count = ?, company_telegram_count = ?, personal_telegram_count = ?,
      p1_count = ?, p2_count = ?, p3_count = ?, telegram_count = ?,
      warnings_json = ?, error_code = ?, completed_at = ?,
      state_version = state_version + 1
      WHERE org_id = ? AND id = ?
        AND (phase <> 'completed' OR ? = 'completed')`).bind(
      status, phase, rows.length, verifiedCount, processedCount, pendingCount,
      websiteCount,
      rows.filter((row) => row.enrichment_status === 'enriched').length,
      decisionMakers.length, companyTelegramCount, personalTelegramCount,
      rows.filter((row) => row.priority === 'P1').length,
      rows.filter((row) => row.priority === 'P2').length,
      rows.filter((row) => row.priority === 'P3').length,
      personalTelegramCount, JSON.stringify(warnings),
      discoveryFailure?.last_error_code ?? (deadJobs.length > 0 ? 'partial_enrichment_failure' : null),
      terminal ? now : null, orgId, searchId, phase,
    ).run();
  }

  async clearSearchLeads(orgId: string, searchId: string): Promise<void> {
    const leadRows = await this.db.prepare(`SELECT id FROM lead_radar_companies
      WHERE org_id = ? AND search_id = ?`).bind(orgId, searchId).all<{ id: string }>();
    const ids = (leadRows.results ?? []).map((row) => row.id);
    const statements: D1PreparedStatement[] = [];
    for (const id of ids) {
      statements.push(this.db.prepare(`DELETE FROM lead_radar_evidence
        WHERE org_id = ? AND company_id = ?`).bind(orgId, id));
    }
    statements.push(this.db.prepare(`DELETE FROM lead_radar_companies
      WHERE org_id = ? AND search_id = ?`).bind(orgId, searchId));
    await this.db.batch(statements);
  }

  async getSearch(orgId: string, searchId: string): Promise<LeadRadarSearchResult | null> {
    const search = await this.db.prepare(`SELECT * FROM lead_radar_searches
      WHERE org_id = ? AND id = ? LIMIT 1`).bind(orgId, searchId).first<SearchRow>();
    if (!search) return null;
    const leadsResult = await this.db.prepare(`SELECT * FROM lead_radar_companies
      WHERE org_id = ? AND search_id = ?
      ORDER BY CASE priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, score DESC, name ASC`)
      .bind(orgId, searchId).all<LeadRow>();
    const leadRows = leadsResult.results ?? [];
    const suppressions = await this.listSuppressions(orgId);
    const evidenceResult = await this.db.prepare(`SELECT evidence.* FROM lead_radar_evidence evidence
      INNER JOIN lead_radar_companies company ON company.id = evidence.company_id
      WHERE evidence.org_id = ? AND company.org_id = ? AND company.search_id = ?
      ORDER BY evidence.company_id, evidence.field_path, evidence.id`)
      .bind(orgId, orgId, searchId).all<EvidenceRow>();
    const evidenceByLead = new Map<string, LeadRadarEvidence[]>();
    for (const row of evidenceResult.results ?? []) {
      const values = evidenceByLead.get(row.company_id) ?? [];
      values.push(mapEvidence(row));
      evidenceByLead.set(row.company_id, values);
    }
    return {
      search: mapSearch(search),
      leads: leadRows.map((row) => {
        const suppressed = row.suppressed === 1 || matchesSuppression({
          canonicalKey: row.canonical_key,
          domain: row.domain ?? domainFromWebsite(row.website),
          phoneDigits: row.phone_digits ?? row.phone?.replace(/\D/g, '') ?? null,
          nameCityKey: row.name_city_key ?? `${normalizeCompanyKey(row.name)}:${normalizeCompanyKey(row.city)}`,
        }, suppressions);
        const evidence = (evidenceByLead.get(row.id) ?? []).filter((item) => (
          !suppressed || !(
            item.fieldPath === 'company_contacts.phone'
            || item.fieldPath === 'company_contacts.generic_email'
            || item.fieldPath.startsWith('web.telegram')
            || item.fieldPath.startsWith('decision_makers')
          )
        ));
        const decisionMakers = suppressed ? [] : decisionMakersFromJson(row.decision_makers_json);
        const parsedTelegramContact = suppressed ? null : telegramContactFromJson(row.telegram_contact_json);
        const telegramContact = parsedTelegramContact
          ? {
              ...parsedTelegramContact,
              messageable: parsedTelegramContact.type === 'human'
                && isFreshPersonalContact(parsedTelegramContact.verifiedAt)
                && decisionMakers.some((person) => (
                  person.contactType === 'human'
                  && telegramLocator(person.telegramUrl)?.username.toLowerCase()
                    === parsedTelegramContact.username.toLowerCase()
                  && person.contactReviewStatus === 'approved'
                  && isFreshPersonalContact(person.verifiedAt)
                )),
            }
          : null;
        return {
          id: row.id,
          searchId: row.search_id,
          name: row.name,
          category: row.category,
          city: row.city,
          country: row.country,
          address: row.address,
          website: row.website,
          phone: suppressed ? null : row.phone,
          genericEmail: suppressed ? null : row.generic_email,
          telegramUrl: suppressed ? null : row.telegram_url,
          telegramContact,
          decisionMakers,
          enrichmentStatus: suppressed ? 'terminal' : row.enrichment_status,
          enrichmentReason: suppressed ? 'suppressed' : row.enrichment_reason,
          enrichmentAttempts: Number(row.enrichment_attempts ?? 0),
          score: Number(row.score),
          confidence: Number(row.confidence),
          priority: row.priority,
          lifecycle: row.lifecycle,
          suppressed,
          scoreComponents: parseJson(row.score_components_json, []),
          signals: parseJson(row.signals_json, []),
          evidence,
          discoveredAt: row.discovered_at,
          lastVerifiedAt: row.last_verified_at,
        };
      }),
    };
  }

  async listOverview(orgId: string): Promise<LeadRadarOverview> {
    const searchesResult = await this.db.prepare(`SELECT * FROM lead_radar_searches
      WHERE org_id = ? ORDER BY created_at DESC, id DESC LIMIT 12`).bind(orgId).all<SearchRow>();
    const searches = (searchesResult.results ?? []).map(mapSearch);
    const totals = await this.db.prepare(`SELECT
      (SELECT COUNT(*) FROM lead_radar_searches WHERE org_id = ?) AS searches,
      COUNT(*) AS leads,
      SUM(CASE WHEN priority = 'P1' THEN 1 ELSE 0 END) AS p1,
      SUM(CASE WHEN json_valid(telegram_contact_json)
        AND json_extract(telegram_contact_json, '$.type') = 'human'
        AND json_extract(telegram_contact_json, '$.messageable') = 1
        AND json_extract(telegram_contact_json, '$.verifiedAt') >= ?
        THEN 1 ELSE 0 END) AS telegram,
      SUM(CASE WHEN lifecycle IN ('replied','qualified','meeting','won') THEN 1 ELSE 0 END) AS replies,
      SUM(CASE WHEN lifecycle IN ('qualified','meeting','won') THEN 1 ELSE 0 END) AS qualified
      FROM lead_radar_companies WHERE org_id = ? AND suppressed = 0`).bind(
      orgId,
      new Date(Date.now() - PERSONAL_CONTACT_TTL_MS).toISOString(),
      orgId,
    ).first<Record<string, number | null>>();
    const latestEvidence = searches[0]
      ? await this.db.prepare(`SELECT
          SUM(CASE WHEN evidence.source_type = 'openstreetmap' THEN 1 ELSE 0 END) AS osm,
          SUM(CASE WHEN evidence.source_type = 'company_website' THEN 1 ELSE 0 END) AS sites
        FROM lead_radar_evidence evidence
        INNER JOIN lead_radar_companies company ON company.id = evidence.company_id
        WHERE evidence.org_id = ? AND company.org_id = ? AND company.search_id = ?`)
        .bind(orgId, orgId, searches[0].id).first<{ osm: number | null; sites: number | null }>()
      : null;
    const osmReady = Number(latestEvidence?.osm ?? 0) > 0;
    const sitesReady = Number(latestEvidence?.sites ?? 0) > 0;
    return {
      searches,
      totals: {
        searches: Number(totals?.searches ?? 0),
        leads: Number(totals?.leads ?? 0),
        p1: Number(totals?.p1 ?? 0),
        telegram: Number(totals?.telegram ?? 0),
        replies: Number(totals?.replies ?? 0),
        qualified: Number(totals?.qualified ?? 0),
      },
      sourceHealth: [
        {
          source: 'OpenStreetMap',
          status: osmReady ? 'ready' : 'limited',
          note: searches[0]?.status === 'failed'
            ? 'Последний discovery не завершён; доступен безопасный повтор'
            : (osmReady ? 'Последний запуск получил проверяемые записи каталога' : 'Доступность подтвердится при первом успешном запуске'),
          checkedAt: searches[0]?.completedAt ?? null,
          errorCode: searches[0]?.status === 'failed' ? searches[0].errorCode : null,
        },
        {
          source: 'Сайты компаний',
          status: sitesReady ? 'ready' : 'limited',
          note: searches[0]?.status === 'failed'
            ? 'Обогащение не запускалось, потому что discovery не вернул кандидатов'
            : (sitesReady ? 'Последний запуск подтвердил факты на сайтах компаний' : 'В последнем запуске факты с сайтов не подтверждены'),
          checkedAt: searches[0]?.completedAt ?? null,
          errorCode: searches[0]?.status === 'failed' ? searches[0].errorCode : null,
        },
        {
          source: 'Открытые реестры',
          status: 'limited',
          note: 'Не подключены до появления проверенного официального API',
          checkedAt: null,
          errorCode: null,
        },
      ],
    };
  }

  async reviewDecisionMaker(
    orgId: string,
    leadId: string,
    decisionMakerId: string,
    status: 'approved' | 'rejected',
    now: string,
  ): Promise<{
    contactReviewStatus: 'approved' | 'rejected';
    contactReviewedAt: string;
    searchId: string;
  } | null> {
    const row = await this.db.prepare(`SELECT search_id, category, website, phone, generic_email,
      telegram_url, telegram_contact_json, decision_makers_json, signals_json
      FROM lead_radar_companies
      WHERE org_id = ? AND id = ? AND suppressed = 0 LIMIT 1`)
      .bind(orgId, leadId).first<{
        search_id: string; category: string; website: string | null; phone: string | null;
        generic_email: string | null; telegram_url: string | null;
        telegram_contact_json: string; decision_makers_json: string; signals_json: string;
      }>();
    if (!row) return null;
    const people = decisionMakersFromJson(row.decision_makers_json);
    const person = people.find((item) => item.id === decisionMakerId);
    const parsedContact = telegramContactFromJson(row.telegram_contact_json);
    const personLocator = telegramLocator(person?.telegramUrl);
    if (!person || person.contactType !== 'human' || !personLocator
      || !parsedContact || parsedContact.type !== 'human'
      || parsedContact.username.toLowerCase() !== personLocator.username.toLowerCase()
      || !isFreshPersonalContact(person.verifiedAt, Date.parse(now))
      || !isFreshPersonalContact(parsedContact.verifiedAt, Date.parse(now))) return null;
    person.contactReviewStatus = status;
    person.contactReviewedAt = now;
    const contact = parsedContact
      ? {
          ...parsedContact,
          messageable: parsedContact.type === 'human'
            && isFreshPersonalContact(parsedContact.verifiedAt, Date.parse(now))
            && people.some((candidate) => (
              candidate.contactType === 'human'
              && telegramLocator(candidate.telegramUrl)?.username.toLowerCase()
                === parsedContact.username.toLowerCase()
              && candidate.contactReviewStatus === 'approved'
              && isFreshPersonalContact(candidate.verifiedAt, Date.parse(now))
            )),
        }
      : null;
    const evidenceResult = await this.db.prepare(`SELECT * FROM lead_radar_evidence
      WHERE org_id = ? AND company_id = ? ORDER BY field_path, id`)
      .bind(orgId, leadId).all<EvidenceRow>();
    const scored = scoreLead({
      category: row.category,
      website: row.website,
      phone: row.phone,
      genericEmail: row.generic_email,
      telegramUrl: row.telegram_url,
      telegramContact: contact,
      decisionMakers: people,
      evidence: (evidenceResult.results ?? []).map(mapEvidence),
      signals: parseJson(row.signals_json, []),
    });
    const result = await this.db.prepare(`UPDATE lead_radar_companies SET
      decision_makers_json = ?, telegram_contact_json = ?, score = ?, confidence = ?,
      priority = ?, score_components_json = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND suppressed = 0`)
      .bind(
        JSON.stringify(people), JSON.stringify(contact), scored.score, scored.confidence,
        scored.priority, JSON.stringify(scored.components), now, orgId, leadId,
      ).run();
    if (Number(result.meta.changes ?? 0) !== 1) return null;
    await this.refreshSearchFunnel(orgId, row.search_id, now);
    return { contactReviewStatus: status, contactReviewedAt: now, searchId: row.search_id };
  }

  private async resolveDncClosure(orgId: string, seed: DncClosureRow): Promise<DncClosureRow[]> {
    const known = new Map<string, DncClosureRow>([[seed.id, seed]]);
    let frontier = [seed];
    const columns = [
      ['canonical_key', (row: DncClosureRow) => row.canonical_key],
      ['domain', (row: DncClosureRow) => row.domain],
      ['phone_digits', (row: DncClosureRow) => row.phone_digits],
      ['name_city_key', (row: DncClosureRow) => row.name_city_key],
    ] as const;

    const expand = async (rows: DncClosureRow[]): Promise<DncClosureRow[]> => {
      const found = new Map<string, DncClosureRow>();
      for (const [column, pick] of columns) {
        const values = [...new Set(rows.map(pick).filter((value): value is string => Boolean(value)))];
        for (const chunk of chunksOf(values, DNC_LOOKUP_CHUNK)) {
          if (chunk.length === 0) continue;
          const placeholders = chunk.map(() => '?').join(', ');
          const result = await this.db.prepare(`SELECT id, search_id, canonical_key, domain,
            phone_digits, name_city_key FROM lead_radar_companies
            WHERE org_id = ? AND ${column} IN (${placeholders})
            ORDER BY id LIMIT ?`).bind(
            orgId,
            ...chunk,
            DNC_MAX_CLOSURE_ROWS + 1,
          ).all<DncClosureRow>();
          for (const item of result.results ?? []) found.set(item.id, item);
        }
      }
      return [...found.values()];
    };

    for (let hop = 0; hop < DNC_MAX_CLOSURE_HOPS; hop += 1) {
      const next = (await expand(frontier)).filter((row) => !known.has(row.id));
      if (next.length === 0) return [...known.values()];
      if (known.size + next.length > DNC_MAX_CLOSURE_ROWS) {
        throw new Error('dnc_identity_closure_too_large');
      }
      for (const row of next) known.set(row.id, row);
      frontier = next;
    }
    const overflow = (await expand(frontier)).some((row) => !known.has(row.id));
    if (overflow) throw new Error('dnc_identity_closure_too_deep');
    return [...known.values()];
  }

  async updateLifecycle(orgId: string, leadId: string, lifecycle: LeadRadarLifecycle, now: string): Promise<boolean> {
    const lead = await this.db.prepare(`SELECT search_id, canonical_key, website, domain, phone, phone_digits,
      name, city, name_city_key, suppressed
      FROM lead_radar_companies WHERE org_id = ? AND id = ? LIMIT 1`)
      .bind(orgId, leadId).first<{
        search_id: string; canonical_key: string; website: string | null; domain: string | null;
        phone: string | null; phone_digits: string | null; name: string;
        city: string; name_city_key: string | null; suppressed: number;
      }>();
    if (!lead) return false;
    const identity: LeadRadarSuppressionFingerprint = {
      canonicalKey: lead.canonical_key,
      domain: lead.domain ?? domainFromWebsite(lead.website),
      phoneDigits: lead.phone_digits ?? lead.phone?.replace(/\D/g, '') ?? null,
      nameCityKey: lead.name_city_key ?? `${normalizeCompanyKey(lead.name)}:${normalizeCompanyKey(lead.city)}`,
    };
    const alreadySuppressed = lead.suppressed === 1
      || matchesSuppression(identity, await this.listSuppressions(orgId));
    if (alreadySuppressed && lifecycle !== 'do_not_contact') return false;

    if (lifecycle === 'do_not_contact') {
      const matches = await this.resolveDncClosure(orgId, {
        id: leadId,
        search_id: lead.search_id,
        canonical_key: identity.canonicalKey,
        domain: identity.domain,
        phone_digits: identity.phoneDigits,
        name_city_key: identity.nameCityKey,
      });
      const statements: D1PreparedStatement[] = [];
      const aliases = new Map<string, LeadRadarSuppressionFingerprint>();
      const rememberAlias = (alias: LeadRadarSuppressionFingerprint): void => {
        if (!aliases.has(alias.canonicalKey)) aliases.set(alias.canonicalKey, alias);
        if (alias.domain) aliases.set(`suppression:domain:${alias.domain}`, {
          canonicalKey: `suppression:domain:${alias.domain}`,
          domain: alias.domain,
          phoneDigits: null,
          nameCityKey: null,
        });
        if (alias.phoneDigits) aliases.set(`suppression:phone:${alias.phoneDigits}`, {
          canonicalKey: `suppression:phone:${alias.phoneDigits}`,
          domain: null,
          phoneDigits: alias.phoneDigits,
          nameCityKey: null,
        });
        if (alias.nameCityKey) aliases.set(`suppression:name-city:${alias.nameCityKey}`, {
          canonicalKey: `suppression:name-city:${alias.nameCityKey}`,
          domain: null,
          phoneDigits: null,
          nameCityKey: alias.nameCityKey,
        });
      };
      rememberAlias(identity);
      for (const item of matches) {
        rememberAlias({
          canonicalKey: item.canonical_key,
          domain: item.domain,
          phoneDigits: item.phone_digits,
          nameCityKey: item.name_city_key,
        });
      }
      for (const chunk of chunksOf([...aliases.values()], DNC_WRITE_CHUNK)) {
        const valuesSql = chunk.map(() => `(?, ?, ?, ?, ?, ?, 'do_not_contact')`).join(', ');
        statements.push(this.db.prepare(`INSERT INTO lead_radar_suppressions (
          org_id, canonical_key, domain, phone_digits, name_city_key, suppressed_at, reason
        ) VALUES ${valuesSql}
        ON CONFLICT(org_id, canonical_key) DO UPDATE SET
          domain = COALESCE(lead_radar_suppressions.domain, excluded.domain),
          phone_digits = COALESCE(lead_radar_suppressions.phone_digits, excluded.phone_digits),
          name_city_key = COALESCE(lead_radar_suppressions.name_city_key, excluded.name_city_key),
          suppressed_at = excluded.suppressed_at,
          reason = excluded.reason`).bind(...chunk.flatMap((alias) => [
          orgId,
          alias.canonicalKey,
          alias.domain,
          alias.phoneDigits,
          alias.nameCityKey,
          now,
        ])));
      }
      const updateIndexes: number[] = [];
      for (const idChunk of chunksOf(matches.map((item) => item.id), DNC_LOOKUP_CHUNK)) {
        const placeholders = idChunk.map(() => '?').join(', ');
        statements.push(this.db.prepare(`DELETE FROM lead_radar_evidence
          WHERE org_id = ? AND company_id IN (${placeholders})`).bind(orgId, ...idChunk));
        updateIndexes.push(statements.length);
        statements.push(this.db.prepare(`UPDATE lead_radar_companies SET
          lifecycle = 'do_not_contact', suppressed = 1,
          phone = NULL, phone_digits = NULL, generic_email = NULL,
          telegram_url = NULL, telegram_contact_json = 'null', decision_makers_json = '[]',
          enrichment_status = 'terminal', enrichment_reason = 'suppressed', updated_at = ?
          WHERE org_id = ? AND id IN (${placeholders})`).bind(now, orgId, ...idChunk));
      }
      const results = await this.db.batch(statements);
      const changed = updateIndexes.reduce(
        (sum, index) => sum + Number(results[index]?.meta.changes ?? 0),
        0,
      ) >= 1;
      if (changed) {
        for (const searchId of [...new Set(matches.map((item) => item.search_id))]) {
          await this.refreshSearchFunnel(orgId, searchId, now);
        }
      }
      return changed;
    }
    const result = await this.db.prepare(`UPDATE lead_radar_companies
      SET lifecycle = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND suppressed = 0`).bind(lifecycle, now, orgId, leadId).run();
    return Number(result.meta.changes ?? 0) === 1;
  }
}
