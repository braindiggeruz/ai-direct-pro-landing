export const LEAD_RADAR_SEARCH_STATUSES = [
  'running',
  'ready',
  'partial',
  'failed',
  'insufficient_results',
] as const;

export type LeadRadarSearchStatus = (typeof LEAD_RADAR_SEARCH_STATUSES)[number];

export const LEAD_RADAR_PRIORITIES = ['P1', 'P2', 'P3'] as const;
export type LeadRadarPriority = (typeof LEAD_RADAR_PRIORITIES)[number];

export const LEAD_RADAR_LIFECYCLE = [
  'new',
  'contacted',
  'replied',
  'qualified',
  'meeting',
  'won',
  'lost',
  'do_not_contact',
] as const;

export type LeadRadarLifecycle = (typeof LEAD_RADAR_LIFECYCLE)[number];

export interface LeadRadarSearchInput {
  niche: string;
  city: string;
  country: string;
  offer: string;
  desiredCount: number;
  telegramRequired: boolean;
  languages: Array<'ru' | 'uz' | 'en'>;
}

export interface LeadRadarEvidence {
  id: string;
  fieldPath: string;
  value: string;
  sourceUrl: string;
  sourceType: 'openstreetmap' | 'company_website' | 'official_open_data';
  observedAt: string;
  confidence: number;
  classification: 'company_data' | 'fact' | 'model_inference';
}

export type LeadRadarSignalType =
  | 'messenger'
  | 'online_booking'
  | 'contact_form'
  | 'hiring'
  | 'tender'
  | 'new_branch'
  | 'active_website';

export interface LeadRadarSignal {
  type: LeadRadarSignalType;
  label: string;
  classification: 'fact' | 'model_inference';
  evidenceIds: string[];
  observedAt: string;
}

export const LEAD_RADAR_TELEGRAM_CONTACT_TYPES = [
  'human',
  'bot',
  'channel',
  'group',
  'business',
  'unknown',
] as const;

export type LeadRadarTelegramContactType = (typeof LEAD_RADAR_TELEGRAM_CONTACT_TYPES)[number];

/**
 * A public Telegram reference observed in source evidence. `messageable` is
 * deliberately false unless the discovery layer can bind the username to a
 * named human decision-maker. A t.me URL alone is never proof of a person.
 */
export interface LeadRadarTelegramContact {
  url: string;
  username: string;
  type: LeadRadarTelegramContactType;
  confidence: number;
  reason: string;
  evidenceIds: string[];
  verifiedAt: string;
  messageable: boolean;
}

/**
 * Public, evidence-bound business representative. Missing Telegram details are
 * represented as null rather than guessed. Every exported person carries the
 * exact official page and a short bounded evidence excerpt.
 */
export interface LeadRadarDecisionMaker {
  id: string;
  name: string;
  role: string;
  telegramUrl: string | null;
  telegramUsername: string | null;
  contactType: LeadRadarTelegramContactType;
  confidence: number;
  evidenceIds: string[];
  sourceUrl: string;
  evidence: string;
  verifiedAt: string;
}

export interface LeadRadarScoreComponent {
  key: 'niche_fit' | 'geo_fit' | 'digital_need' | 'intent' | 'contactability';
  label: string;
  score: number;
  max: number;
  reason: string;
  evidenceIds: string[];
}

export interface LeadRadarLead {
  id: string;
  searchId: string;
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
  score: number;
  confidence: number;
  priority: LeadRadarPriority;
  lifecycle: LeadRadarLifecycle;
  suppressed: boolean;
  scoreComponents: LeadRadarScoreComponent[];
  signals: LeadRadarSignal[];
  evidence: LeadRadarEvidence[];
  discoveredAt: string;
  lastVerifiedAt: string;
}

export interface LeadRadarSearchSummary {
  id: string;
  input: LeadRadarSearchInput;
  status: LeadRadarSearchStatus;
  candidateCount: number;
  verifiedCount: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
  telegramCount: number;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface LeadRadarSearchResult {
  search: LeadRadarSearchSummary;
  leads: LeadRadarLead[];
}

export interface LeadRadarOverview {
  searches: LeadRadarSearchSummary[];
  totals: {
    searches: number;
    leads: number;
    p1: number;
    telegram: number;
    replies: number;
    qualified: number;
  };
  sourceHealth: Array<{
    source: string;
    status: 'ready' | 'limited' | 'blocked';
    note: string;
    checkedAt: string | null;
    errorCode: string | null;
  }>;
}

export interface LeadRadarLifecycleInput {
  lifecycle: LeadRadarLifecycle;
}
