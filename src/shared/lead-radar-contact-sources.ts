import type { LeadRadarContactCandidate } from './lead-radar-contacts';

/** Separate from first-party website evidence. A listing is not an official site. */
export interface LeadRadarContactSource {
  id: string;
  kind: 'business_listing' | 'telegram_profile';
  url: string;
  observedAt: string;
  candidates: LeadRadarContactCandidate[];
}

export interface LeadRadarContactEnrichment {
  status: 'complete' | 'limited' | 'unavailable';
  reason: string;
  sources: LeadRadarContactSource[];
  checkedAt: string;
  expiresAt: string;
}
