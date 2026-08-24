import type {
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
  evidence: LeadRadarEvidence[];
  signals: LeadRadarSignal[];
}
export interface StoredLeadInput extends Omit<LeadRadarLead, 'id' | 'searchId'> {
  canonicalKey: string;
  telegramContact: LeadRadarTelegramContact | null;
  decisionMakers: LeadRadarDecisionMaker[];
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
