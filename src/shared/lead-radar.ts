export const LEAD_RADAR_SEARCH_STATUSES = [
  'running',
  'ready',
  'partial',
  'failed',
  'insufficient_results',
] as const;

export type LeadRadarSearchStatus = (typeof LEAD_RADAR_SEARCH_STATUSES)[number];

export const LEAD_RADAR_SEARCH_PHASES = [
  'queued',
  'discovering',
  'enriching',
  'finalizing',
  'completed',
] as const;
export type LeadRadarSearchPhase = (typeof LEAD_RADAR_SEARCH_PHASES)[number];

export const LEAD_RADAR_ENRICHMENT_STATUSES = [
  'pending',
  'queued',
  'processing',
  'enriched',
  'terminal',
] as const;
export type LeadRadarEnrichmentStatus = (typeof LEAD_RADAR_ENRICHMENT_STATUSES)[number];

export const LEAD_RADAR_ENRICHMENT_REASONS = [
  'no_website',
  'enriched',
  'no_relevant_evidence',
  'robots_blocked',
  'http_blocked',
  'source_timeout',
  'source_unavailable',
  'invalid_website',
  'payload_invalid',
  'retry_exhausted',
  'suppressed',
] as const;
export type LeadRadarEnrichmentReason = (typeof LEAD_RADAR_ENRICHMENT_REASONS)[number];

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

export interface LeadRadarSearchInterpretation {
  canonicalCategory: string;
  matchKind: 'exact' | 'alias' | 'semantic' | 'fuzzy' | 'fallback';
  confidence: number;
  expanded: boolean;
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

export const LEAD_RADAR_CONTACT_REVIEW_STATUSES = ['unreviewed', 'approved', 'rejected'] as const;
export type LeadRadarContactReviewStatus = (typeof LEAD_RADAR_CONTACT_REVIEW_STATUSES)[number];

/**
 * A public Telegram reference observed in source evidence. `messageable` is
 * deliberately false until an operator approves a fresh username bound to a
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
  sourceClaim: 'official_site_proximity' | 'json_ld_same_as';
  contactReviewStatus: LeadRadarContactReviewStatus;
  contactReviewedAt: string | null;
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
  enrichmentStatus: LeadRadarEnrichmentStatus;
  enrichmentReason: LeadRadarEnrichmentReason | null;
  enrichmentAttempts: number;
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
  /** Deterministic interpretation derived from the immutable submitted input. */
  interpretation?: LeadRadarSearchInterpretation;
  status: LeadRadarSearchStatus;
  candidateCount: number;
  verifiedCount: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
  telegramCount: number;
  errorCode: string | null;
  phase: LeadRadarSearchPhase;
  funnel: {
    rawDiscoveredCount: number;
    candidateCount: number;
    processedCount: number;
    pendingCount: number;
    websiteCount: number;
    enrichedCount: number;
    decisionMakerCount: number;
    companyTelegramCount: number;
    personalTelegramCount: number;
    excludedCount: number;
  };
  warnings: string[];
  createdAt: string;
  completedAt: string | null;
}

export interface LeadRadarSearchResult {
  search: LeadRadarSearchSummary;
  leads: LeadRadarLead[];
  /** Server-authoritative capability state; absent only in internal fixtures. */
  capabilities?: LeadRadarApiCapabilities;
}

export interface LeadRadarApiCapabilities {
  admissionEnabled: boolean;
  processingEnabled: boolean;
  contactEnabled: boolean;
  mode: 'paused' | 'research' | 'contact';
}

export type LeadRadarTelegramBusinessConnectionStatus =
  | 'unconfigured'
  | 'configured'
  | 'pending'
  | 'connected'
  | 'paused'
  | 'error';

/** Non-secret connection summary safe for the owner UI. */
export interface LeadRadarTelegramBusinessStatus {
  status: LeadRadarTelegramBusinessConnectionStatus;
  canReply: boolean;
  connectedAt: string | null;
  activeCompanyChats: number;
}

export interface LeadRadarTelegramBusinessConnectLink {
  url: string;
  expiresAt: string;
}

export interface LeadRadarTelegramOutreachEndpoint {
  kind: LeadRadarTelegramContactType;
  verification: 'verified' | 'unverified';
  ownership: 'corporate' | 'personal' | 'unknown';
  doNotContact: boolean;
}

/** Server-authoritative eligibility and manual Telegram draft for one company. */
export interface LeadRadarTelegramOutreachPreparation {
  endpoint: LeadRadarTelegramOutreachEndpoint;
  manualDraftUrl: string | null;
  activeChatEligible: boolean;
  bindingId: string | null;
  lastInboundAt: string | null;
}

/** One-time, server-minted approval bound to the exact company, chat and text. */
export interface LeadRadarTelegramBusinessApproval {
  approvalToken: string;
  expiresAt: string;
}

export interface LeadRadarTelegramBusinessSendResponse {
  /** `ambiguous` is terminal for automatic UI retries; the operator must inspect the chat. */
  status: 'sent' | 'replayed' | 'ambiguous';
  effectId: string;
}

export interface LeadRadarOverview {
  /** Server-authoritative capability state; absent only in internal fixtures. */
  capabilities?: LeadRadarApiCapabilities;
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
