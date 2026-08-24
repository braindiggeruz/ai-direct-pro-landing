import type {
  LeadRadarEvidence,
  LeadRadarLead,
  LeadRadarSearchInput,
  LeadRadarSignal,
} from '../../../src/shared/lead-radar';

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
  evidence: LeadRadarEvidence[];
  signals: LeadRadarSignal[];
}
export interface StoredLeadInput extends Omit<LeadRadarLead, 'id' | 'searchId'> {
  canonicalKey: string;
}

export interface LeadRadarDiscoveryResult {
  candidates: SourceCandidate[];
  sourceWarnings: string[];
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
