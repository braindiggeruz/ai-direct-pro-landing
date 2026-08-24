import type {
  LeadRadarLead,
  LeadRadarSearchInput,
  LeadRadarSearchResult,
} from '../../../src/shared/lead-radar';
import { scoreLead } from './scoring';
import { OpenStreetMapLeadSource } from './sources';
import { LeadRadarStore, type LeadRadarSuppressionFingerprint } from './store';
import { LeadRadarSourceError, type LeadRadarSource, type SourceCandidate, type StoredLeadInput } from './types';
import { normalizeCompanyKey } from './validation';

export class LeadRadarBusyError extends Error {
  readonly code = 'search_rate_limited';

  constructor(readonly retryAfterSeconds: number) {
    super('search_rate_limited');
    this.name = 'LeadRadarBusyError';
  }
}

function canonicalKey(candidate: SourceCandidate): string {
  if (candidate.website) {
    try { return `domain:${new URL(candidate.website).hostname.replace(/^www\./, '').toLowerCase()}`; } catch { /* use fallback */ }
  }
  if (candidate.phone) return `phone:${candidate.phone.replace(/\D/g, '')}`;
  return `name:${normalizeCompanyKey(candidate.name)}:${normalizeCompanyKey(candidate.address ?? candidate.city)}`;
}
function toLead(candidate: SourceCandidate, now: string): StoredLeadInput {
  const scored = scoreLead(candidate);
  return {
    canonicalKey: canonicalKey(candidate),
    name: candidate.name,
    category: candidate.category,
    city: candidate.city,
    country: candidate.country,
    address: candidate.address,
    website: candidate.website,
    phone: candidate.phone,
    genericEmail: candidate.genericEmail,
    telegramUrl: candidate.telegramUrl,
    telegramContact: candidate.telegramContact,
    decisionMakers: candidate.decisionMakers,
    score: scored.score,
    confidence: scored.confidence,
    priority: scored.priority,
    lifecycle: 'new',
    suppressed: false,
    scoreComponents: scored.components,
    signals: candidate.signals,
    evidence: candidate.evidence,
    discoveredAt: now,
    lastVerifiedAt: now,
  };
}

function hasVerifiedPersonalTelegram(lead: StoredLeadInput): boolean {
  const contact = lead.telegramContact;
  if (!contact || contact.type !== 'human' || !contact.messageable) return false;
  return lead.decisionMakers.some((person) => (
    person.contactType === 'human'
    && person.telegramUrl === contact.url
    && Boolean(person.telegramUsername)
  ));
}

function isSuppressed(lead: StoredLeadInput, suppressions: LeadRadarSuppressionFingerprint[]): boolean {
  let domain: string | null = null;
  try { domain = lead.website ? new URL(lead.website).hostname.replace(/^www\./, '').toLowerCase() : null; } catch { domain = null; }
  const phoneDigits = lead.phone?.replace(/\D/g, '') || null;
  const nameCityKey = `${normalizeCompanyKey(lead.name)}:${normalizeCompanyKey(lead.city)}`;
  return suppressions.some((item) => (
    item.canonicalKey === lead.canonicalKey
    || (domain !== null && item.domain === domain)
    || (phoneDigits !== null && item.phoneDigits === phoneDigits)
    || (item.nameCityKey !== null && item.nameCityKey === nameCityKey)
  ));
}

function failureCode(error: unknown): string {
  if (error instanceof LeadRadarSourceError) return error.code;
  const value = error instanceof Error ? error.message : '';
  if (value.includes('city_not_found')) return 'city_not_found';
  if (value.includes('nominatim')) return 'geocoder_unavailable';
  if (value.includes('overpass')) return 'discovery_source_unavailable';
  if (value.includes('abort')) return 'source_timeout';
  return 'discovery_failed';
}

export class LeadRadarService {
  private readonly sources: LeadRadarSource[];

  constructor(
    private readonly store: LeadRadarStore,
    sources?: LeadRadarSource[],
  ) {
    this.sources = sources ?? [new OpenStreetMapLeadSource(store)];
  }

  async run(orgId: string, input: LeadRadarSearchInput): Promise<LeadRadarSearchResult> {
    const started = new Date();
    const now = started.toISOString();
    await this.store.failInterruptedSearches(
      orgId,
      new Date(started.getTime() - 3 * 60_000).toISOString(),
      now,
    );
    const leaseId = `lease_${crypto.randomUUID().replaceAll('-', '')}`;
    const lease = await this.store.acquireSearchLease(
      orgId,
      leaseId,
      now,
      new Date(started.getTime() + 3 * 60_000).toISOString(),
      now,
    );
    if (!lease.acquired) throw new LeadRadarBusyError(lease.retryAfterSeconds);

    try {
      const searchId = await this.store.createSearch(orgId, input, now);
      try {
        const discoveries = await Promise.allSettled(this.sources.map((source) => source.discover(input)));
      const candidates = discoveries.flatMap((result) => result.status === 'fulfilled' ? result.value.candidates : []);
      const warnings = discoveries.flatMap((result) => result.status === 'fulfilled' ? result.value.sourceWarnings : []);
      if (warnings.length > 0) {
        console.info('lead_radar.discovery_fallback', { searchId, warnings: warnings.slice(0, 8) });
      }
      if (candidates.length === 0 && discoveries.every((result) => result.status === 'rejected')) {
        const firstFailure = discoveries.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        throw firstFailure?.reason ?? new Error('discovery_failed');
      }

      const unique = new Map<string, StoredLeadInput>();
      for (const candidate of candidates) {
        const lead = toLead(candidate, now);
        const existing = unique.get(lead.canonicalKey);
        if (
          !existing
          || lead.decisionMakers.length > existing.decisionMakers.length
          || (
            lead.decisionMakers.length === existing.decisionMakers.length
            && lead.evidence.length > existing.evidence.length
          )
        ) unique.set(lead.canonicalKey, lead);
      }
      const suppressions = await this.store.listSuppressions(orgId);
      const eligible = [...unique.values()].filter((lead) => !isSuppressed(lead, suppressions));
      const ranked = eligible
        .filter((lead) => !input.telegramRequired || hasVerifiedPersonalTelegram(lead))
        .sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.name.localeCompare(b.name, 'ru'))
        .slice(0, input.desiredCount);
      const persisted: StoredLeadInput[] = [];
      for (const lead of ranked) {
        if (await this.store.insertLead(orgId, searchId, lead)) persisted.push(lead);
      }

      const status = persisted.length === 0
        ? 'insufficient_results'
        : (persisted.length < input.desiredCount ? 'partial' : 'ready');
      await this.store.finishSearch(orgId, searchId, {
        status,
        candidateCount: eligible.length,
        verifiedCount: persisted.length,
        p1Count: persisted.filter((lead) => lead.priority === 'P1').length,
        p2Count: persisted.filter((lead) => lead.priority === 'P2').length,
        p3Count: persisted.filter((lead) => lead.priority === 'P3').length,
        telegramCount: persisted.filter(hasVerifiedPersonalTelegram).length,
        errorCode: null,
        completedAt: new Date().toISOString(),
      });
      } catch (error) {
        const code = failureCode(error);
        console.warn('lead_radar.search_failed', {
          searchId,
          code,
          diagnostics: error instanceof LeadRadarSourceError ? error.diagnostics.slice(0, 8) : [],
        });
        try { await this.store.clearSearchLeads(orgId, searchId); } catch { console.warn('lead_radar.partial_cleanup_failed', { searchId }); }
        await this.store.finishSearch(orgId, searchId, {
          status: 'failed',
          candidateCount: 0,
          verifiedCount: 0,
          p1Count: 0,
          p2Count: 0,
          p3Count: 0,
          telegramCount: 0,
          errorCode: code,
          completedAt: new Date().toISOString(),
        });
      }
      const result = await this.store.getSearch(orgId, searchId);
      if (!result) throw new Error('search_persistence_failed');
      return result;
    } finally {
      const releasedAt = new Date();
      try {
        await this.store.releaseSearchLease(
          orgId,
          leaseId,
          releasedAt.toISOString(),
          new Date(releasedAt.getTime() + 3_000).toISOString(),
        );
      } catch {
        console.warn('lead_radar.lease_release_failed');
      }
    }
  }

  async get(orgId: string, searchId: string): Promise<LeadRadarSearchResult | null> {
    const now = new Date();
    await this.store.failInterruptedSearches(
      orgId,
      new Date(now.getTime() - 3 * 60_000).toISOString(),
      now.toISOString(),
    );
    return this.store.getSearch(orgId, searchId);
  }

  async updateLifecycle(orgId: string, leadId: string, lifecycle: LeadRadarLead['lifecycle']): Promise<boolean> {
    return this.store.updateLifecycle(orgId, leadId, lifecycle, new Date().toISOString());
  }
}
