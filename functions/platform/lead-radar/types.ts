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

export interface LeadRadarSource {
  readonly id: string;
  discover(input: LeadRadarSearchInput): Promise<LeadRadarDiscoveryResult>;
}
