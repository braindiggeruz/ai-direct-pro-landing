import type { LeadRadarLead } from './lead-radar';

/** Research selection; each approved campaign remains limited to 50. */
export const AUDIENCE_LIMIT = 500;
export const AUDIENCE_ID_PATTERN = /^aud_[0-9a-f]{32}$/u;
export interface LeadRadarAudience {
  id: string;
  name: string;
  version: number;
  companyIds: string[];
  createdAt: string;
  updatedAt: string;
}
export interface AudienceScope { audienceId: string; audienceVersion: number }
export type ContactDirectoryStatus = 'verified' | 'review' | 'conflict' | 'contacted' | 'blocked';
export interface ContactDirectoryRow {
  key: string;
  lead: LeadRadarLead;
  status: ContactDirectoryStatus;
  sources: Array<{ companyId: string; searchId: string; name: string; category: string; city: string }>;
  occurrences: number;
  memberIds?: string[];
}
export interface ContactDirectoryPage {
  rows: ContactDirectoryRow[];
  total: number;
  offset: number;
  limit: number;
}
export interface AudienceDetail {
  audience: LeadRadarAudience;
  leads: LeadRadarLead[];
  missingCompanyIds: string[];
  excludedRecipientIds?: string[];
}
