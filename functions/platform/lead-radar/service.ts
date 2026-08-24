import type {
  LeadRadarLead,
  LeadRadarSearchInput,
  LeadRadarSearchResult,
} from '../../../src/shared/lead-radar';
import { scoreLead } from './scoring';
import { OpenStreetMapLeadSource } from './sources';
import { LeadRadarStore } from './store';
import type { LeadRadarSource, SourceCandidate, StoredLeadInput } from './types';
import { normalizeCompanyKey } from './validation';

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

function failureCode(error: unknown): string {
  const value = error instanceof Error ? error.message : '';
  if (value.includes('city_not_found')) return 'city_not_found';
  if (value.includes('nominatim')) return 'geocoder_unavailable';
  if (value.includes('overpass')) return 'discovery_source_unavailable';
  if (value.includes('abort')) return 'source_timeout';
  return 'discovery_failed';
}

export class LeadRadarService {
  constructor(
    private readonly store: LeadRadarStore,
    private readonly sources: LeadRadarSource[] = [new OpenStreetMapLeadSource()],
  ) {}

  async run(orgId: string, input: LeadRadarSearchInput): Promise<LeadRadarSearchResult> {
    const now = new Date().toISOString();
    const searchId = await this.store.createSearch(orgId, input, now);
    try {
      const discoveries = await Promise.allSettled(this.sources.map((source) => source.discover(input)));
      const candidates = discoveries.flatMap((result) => result.status === 'fulfilled' ? result.value.candidates : []);
      if (candidates.length === 0 && discoveries.every((result) => result.status === 'rejected')) {
        const firstFailure = discoveries.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        throw firstFailure?.reason ?? new Error('discovery_failed');
      }

      const unique = new Map<string, StoredLeadInput>();
      for (const candidate of candidates) {
        const lead = toLead(candidate, now);
        const existing = unique.get(lead.canonicalKey);
        if (!existing || lead.evidence.length > existing.evidence.length) unique.set(lead.canonicalKey, lead);
      }
      const ranked = [...unique.values()]
        .filter((lead) => !input.telegramRequired || Boolean(lead.telegramUrl))
        .sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.name.localeCompare(b.name, 'ru'))
        .slice(0, input.desiredCount);
      for (const lead of ranked) await this.store.insertLead(orgId, searchId, lead);

      const status = ranked.length === 0
        ? 'insufficient_results'
        : (ranked.length < input.desiredCount ? 'partial' : 'ready');
      await this.store.finishSearch(orgId, searchId, {
        status,
        candidateCount: unique.size,
        verifiedCount: ranked.length,
        p1Count: ranked.filter((lead) => lead.priority === 'P1').length,
        p2Count: ranked.filter((lead) => lead.priority === 'P2').length,
        p3Count: ranked.filter((lead) => lead.priority === 'P3').length,
        telegramCount: ranked.filter((lead) => lead.telegramUrl).length,
        errorCode: null,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      await this.store.finishSearch(orgId, searchId, {
        status: 'failed',
        candidateCount: 0,
        verifiedCount: 0,
        p1Count: 0,
        p2Count: 0,
        p3Count: 0,
        telegramCount: 0,
        errorCode: failureCode(error),
        completedAt: new Date().toISOString(),
      });
    }
    const result = await this.store.getSearch(orgId, searchId);
    if (!result) throw new Error('search_persistence_failed');
    return result;
  }

  async get(orgId: string, searchId: string): Promise<LeadRadarSearchResult | null> {
    return this.store.getSearch(orgId, searchId);
  }

  async updateLifecycle(orgId: string, leadId: string, lifecycle: LeadRadarLead['lifecycle']): Promise<boolean> {
    return this.store.updateLifecycle(orgId, leadId, lifecycle, new Date().toISOString());
  }
}
