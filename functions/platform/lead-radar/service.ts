import type {
  LeadRadarLead,
  LeadRadarSearchInput,
  LeadRadarSearchResult,
} from '../../../src/shared/lead-radar';
import { configuredLeadRadarSources, fanOutDiscovery, type LeadRadarSourceEnvironment } from './discovery-sources';
import { scoreLead } from './scoring';
import { type WebsiteFacts } from './sources';
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

/** A processed row is only verified when source facts prove identity plus a real-world/corporate anchor. */
export function isEvidenceVerifiedLead(lead: Pick<StoredLeadInput, 'evidence'>): boolean {
  const trusted = lead.evidence.filter((item) => (
    item.classification !== 'model_inference' && item.confidence >= 0.7
  ));
  const identity = trusted.some((item) => item.fieldPath === 'company.name');
  const anchored = trusted.some((item) => (
    item.fieldPath.startsWith('locations.')
    || item.fieldPath.startsWith('company_contacts.')
    || (
      item.fieldPath === 'web.website'
      && item.sourceType === 'company_website'
      && item.classification === 'fact'
    )
  ));
  return identity && anchored;
}

export function sourceCandidateCanonicalKey(candidate: SourceCandidate): string {
  const branchKey = `${normalizeCompanyKey(candidate.name)}:${normalizeCompanyKey(candidate.address ?? candidate.city)}`;
  const verifiedWebsite = candidate.evidence.some((item) => (
    item.fieldPath === 'web.website'
    && item.sourceType === 'company_website'
    && item.classification === 'fact'
  ));
  if (candidate.website && verifiedWebsite) {
    try {
      const domain = new URL(candidate.website).hostname.replace(/^www\./, '').toLowerCase();
      return `site:${domain}:branch:${branchKey}`;
    } catch { /* use a weaker public identity below */ }
  }
  if (candidate.phone) return `phone:${candidate.phone.replace(/\D/g, '')}:branch:${branchKey}`;
  return `name:${branchKey}`;
}
export function sourceCandidateToStoredLead(candidate: SourceCandidate, now: string): StoredLeadInput {
  const scored = scoreLead(candidate);
  return {
    canonicalKey: sourceCandidateCanonicalKey(candidate),
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
    enrichmentStatus: candidate.enrichmentStatus ?? (candidate.website ? 'pending' : 'terminal'),
    enrichmentReason: candidate.enrichmentReason ?? (candidate.website ? null : 'no_website'),
    enrichmentAttempts: candidate.enrichmentAttempts ?? 0,
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

export function mergeWebsiteFactsIntoLead(
  lead: StoredLeadInput,
  facts: WebsiteFacts,
  now: string,
  attempts: number,
): StoredLeadInput {
  // An unreviewed person must not hide a corporate endpoint found on the site.
  // Named people remain in decisionMakers with their separate review gate.
  const rank = { business: 6, human: 5, channel: 3, group: 2, unknown: 1, bot: 0 } as const;
  const telegramContact = [facts.telegramContact, lead.telegramContact]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({ ...item, messageable: false }))
    .sort((a, b) => rank[b.type] - rank[a.type] || b.confidence - a.confidence)[0] ?? null;
  const people = new Map<string, StoredLeadInput['decisionMakers'][number]>();
  for (const person of [...lead.decisionMakers, ...facts.decisionMakers]) {
    const key = `${normalizeCompanyKey(person.name)}:${normalizeCompanyKey(person.role)}`;
    const existing = people.get(key);
    if (!existing || person.confidence > existing.confidence || (!existing.telegramUrl && person.telegramUrl)) {
      people.set(key, { ...person, contactReviewStatus: 'unreviewed', contactReviewedAt: null });
    }
  }
  const decisionMakers = [...people.values()];
  const evidence = [...lead.evidence, ...facts.evidence].filter((item, index, all) => (
    all.findIndex((candidate) => candidate.id === item.id) === index
  ));
  const signals = [...lead.signals, ...facts.signals].filter((item, index, all) => (
    all.findIndex((candidate) => candidate.type === item.type) === index
  ));
  const candidate = {
    ...lead,
    website: facts.website,
    phone: facts.phone ?? lead.phone,
    genericEmail: facts.genericEmail ?? lead.genericEmail,
    telegramUrl: telegramContact && ['human', 'business'].includes(telegramContact.type)
      ? telegramContact.url
      : null,
    telegramContact,
    decisionMakers,
    evidence,
    signals,
  };
  const scored = scoreLead(candidate);
  return {
    ...candidate,
    score: scored.score,
    confidence: scored.confidence,
    priority: scored.priority,
    scoreComponents: scored.components,
    enrichmentStatus: 'enriched',
    enrichmentReason: 'enriched',
    enrichmentAttempts: attempts,
    lastVerifiedAt: now,
  };
}

export function hasVerifiedPersonalTelegram(lead: Pick<StoredLeadInput, 'telegramContact' | 'decisionMakers'>): boolean {
  const contact = lead.telegramContact;
  if (!contact || contact.type !== 'human' || !contact.messageable) return false;
  const now = Date.now();
  const contactObserved = Date.parse(contact.verifiedAt);
  if (!Number.isFinite(contactObserved) || now - contactObserved > 30 * 24 * 60 * 60_000) return false;
  return lead.decisionMakers.some((person) => (
    person.contactType === 'human'
    && person.telegramUrl === contact.url
    && Boolean(person.telegramUsername)
    && person.contactReviewStatus === 'approved'
    && Number.isFinite(Date.parse(person.verifiedAt))
    && now - Date.parse(person.verifiedAt) <= 30 * 24 * 60 * 60_000
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
    env: LeadRadarSourceEnvironment = {},
  ) {
    this.sources = sources ?? configuredLeadRadarSources(store, env);
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
        const discovery = await fanOutDiscovery(this.sources, input);
      const candidates = discovery.candidates;
      const warnings = discovery.warnings;
      if (warnings.length > 0) {
        console.info('lead_radar.discovery_fallback', { searchId, warnings: warnings.slice(0, 8) });
      }
      if (candidates.length === 0 && discovery.failures === this.sources.length) {
        throw discovery.errors[0] ?? new Error('discovery_failed');
      }

      const unique = new Map<string, StoredLeadInput>();
      for (const candidate of candidates) {
        const lead = sourceCandidateToStoredLead(candidate, now);
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
        verifiedCount: persisted.filter(isEvidenceVerifiedLead).length,
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
