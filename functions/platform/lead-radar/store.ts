import type {
  LeadRadarEvidence,
  LeadRadarLead,
  LeadRadarLifecycle,
  LeadRadarOverview,
  LeadRadarSearchInput,
  LeadRadarSearchResult,
  LeadRadarSearchStatus,
  LeadRadarSearchSummary,
} from '../../../src/shared/lead-radar';
import {
  TELEGRAM_CONTACT_TYPES,
  type LeadRadarDecisionMaker,
  type LeadRadarTelegramContact,
  type StoredLeadInput,
  type TelegramContactType,
} from './types';
import { normalizeCompanyKey, safePublicHttpUrl } from './validation';

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
    if (!id || !name || !role || !type || confidence === null || !source || !evidence || !checkedAt) continue;
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
    });
  }
  return result;
}

function mapSearch(row: SearchRow): LeadRadarSearchSummary {
  return {
    id: row.id,
    input: parseJson<LeadRadarSearchInput>(row.input_json, {
      niche: '', city: '', country: 'UZ', offer: '', desiredCount: 20,
      telegramRequired: false, languages: ['ru', 'uz'],
    }),
    status: row.status,
    candidateCount: Number(row.candidate_count),
    verifiedCount: Number(row.verified_count),
    p1Count: Number(row.p1_count),
    p2Count: Number(row.p2_count),
    p3Count: Number(row.p3_count),
    telegramCount: Number(row.telegram_count),
    errorCode: row.error_code,
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
      id, org_id, input_json, status, created_at
    ) VALUES (?, ?, ?, 'running', ?)`).bind(id, orgId, JSON.stringify(input), now).run();
    return id;
  }

  async failInterruptedSearches(orgId: string, staleBefore: string, now: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_searches SET
      status = 'failed', error_code = 'search_interrupted', completed_at = ?
      WHERE org_id = ? AND status = 'running' AND created_at < ?`)
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
      p2_count = ?, p3_count = ?, telegram_count = ?, error_code = ?, completed_at = ?
      WHERE org_id = ? AND id = ?`).bind(
      update.status, update.candidateCount, update.verifiedCount, update.p1Count,
      update.p2Count, update.p3Count, update.telegramCount, update.errorCode,
      update.completedAt, orgId, searchId,
    ).run();
  }

  async insertLead(orgId: string, searchId: string, lead: StoredLeadInput): Promise<string | null> {
    const id = `lead_${crypto.randomUUID().replaceAll('-', '')}`;
    const identity = fingerprint(lead);
    const statements: D1PreparedStatement[] = [this.db.prepare(`INSERT INTO lead_radar_companies (
      id, org_id, search_id, canonical_key, name, category, city, country,
      address, website, domain, phone_digits, name_city_key,
      phone, generic_email, telegram_url, telegram_contact_json,
      decision_makers_json, score, confidence,
      priority, lifecycle, suppressed, score_components_json, signals_json,
      discovered_at, last_verified_at, updated_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
        lead.genericEmail, lead.telegramUrl, JSON.stringify(lead.telegramContact ?? null),
        JSON.stringify(lead.decisionMakers ?? []), lead.score, lead.confidence,
        lead.priority, lead.lifecycle, lead.suppressed ? 1 : 0,
        JSON.stringify(lead.scoreComponents), JSON.stringify(lead.signals),
        lead.discoveredAt, lead.lastVerifiedAt, lead.lastVerifiedAt,
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
          telegramContact: suppressed
            ? null
            : telegramContactFromJson(row.telegram_contact_json),
          decisionMakers: suppressed
            ? []
            : decisionMakersFromJson(row.decision_makers_json),
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
        THEN 1 ELSE 0 END) AS telegram,
      SUM(CASE WHEN lifecycle IN ('replied','qualified','meeting','won') THEN 1 ELSE 0 END) AS replies,
      SUM(CASE WHEN lifecycle IN ('qualified','meeting','won') THEN 1 ELSE 0 END) AS qualified
      FROM lead_radar_companies WHERE org_id = ? AND suppressed = 0`).bind(orgId, orgId).first<Record<string, number | null>>();
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

  async updateLifecycle(orgId: string, leadId: string, lifecycle: LeadRadarLifecycle, now: string): Promise<boolean> {
    const lead = await this.db.prepare(`SELECT canonical_key, website, domain, phone, phone_digits,
      name, city, name_city_key, suppressed
      FROM lead_radar_companies WHERE org_id = ? AND id = ? LIMIT 1`)
      .bind(orgId, leadId).first<{
        canonical_key: string; website: string | null; domain: string | null;
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
      const results = await this.db.batch([
        this.db.prepare(`INSERT INTO lead_radar_suppressions (
        org_id, canonical_key, domain, phone_digits, name_city_key, suppressed_at, reason
      ) VALUES (?, ?, ?, ?, ?, ?, 'do_not_contact')
      ON CONFLICT(org_id, canonical_key) DO UPDATE SET
        domain = COALESCE(lead_radar_suppressions.domain, excluded.domain),
        phone_digits = COALESCE(lead_radar_suppressions.phone_digits, excluded.phone_digits),
        name_city_key = COALESCE(lead_radar_suppressions.name_city_key, excluded.name_city_key),
        suppressed_at = excluded.suppressed_at,
        reason = excluded.reason`).bind(
          orgId, identity.canonicalKey, identity.domain,
          identity.phoneDigits, identity.nameCityKey, now,
        ),
        this.db.prepare(`UPDATE lead_radar_companies SET
          lifecycle = 'do_not_contact', suppressed = 1, updated_at = ?
          WHERE org_id = ? AND (
            id = ? OR canonical_key = ?
            OR (? IS NOT NULL AND domain = ?)
            OR (? IS NOT NULL AND phone_digits = ?)
            OR (? IS NOT NULL AND name_city_key = ?)
          )`).bind(
          now, orgId, leadId, identity.canonicalKey,
          identity.domain, identity.domain,
          identity.phoneDigits, identity.phoneDigits,
          identity.nameCityKey, identity.nameCityKey,
        ),
      ]);
      return Number(results[1]?.meta.changes ?? 0) >= 1;
    }
    const result = await this.db.prepare(`UPDATE lead_radar_companies
      SET lifecycle = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND suppressed = 0`).bind(lifecycle, now, orgId, leadId).run();
    return Number(result.meta.changes ?? 0) === 1;
  }
}
