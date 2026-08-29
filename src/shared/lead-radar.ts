import type { LeadRadarContactCandidate } from './lead-radar-contacts';
import type { LeadRadarContactEnrichment } from './lead-radar-contact-sources';

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
  searchGoal?: 'companies' | 'telegram_contacts';
  /** Bounded discovery pool, not the maximum number of campaign recipients. */
  maxCandidates?: number;
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
  /** Protected local-Bridge identity, not a fabricated username. */
  peerRef?: string;
  /** Exact evidence-bound candidate that the local Bridge resolved. */
  sourceKey?: string;
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
  /** Multiple sourced contacts, independent of permission to send. */
  contactCandidates?: LeadRadarContactCandidate[];
  contactEnrichment?: LeadRadarContactEnrichment;
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
    contactTarget?: number;
    resolvedTelegramCount?: number;
    candidateLimit?: number;
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

/**
 * Closed-list, non-secret setup blockers for the isolated Telegram account
 * transport. These values are safe to expose only on the authenticated owner
 * API; they report which class of infrastructure is absent, never a secret
 * value, account identifier or provider response.
 */
export type LeadRadarTelegramAccountReadinessBlocker =
  | 'tenant_not_allowed'
  | 'feature_disabled'
  | 'campaign_data_key_missing'
  | 'campaign_data_key_mismatch'
  | 'legacy_binding_required'
  | 'gateway_binding_missing'
  | 'gateway_unavailable'
  | 'gateway_credentials_missing'
  | 'gateway_account_keys_missing'
  | 'gateway_routing_key_mismatch'
  | 'gateway_routing_legacy_unbound'
  | 'gateway_account_session_missing'
  | 'gateway_storage_missing'
  | 'gateway_runtime_config_invalid'
  | 'gateway_internal_token_missing'
  | 'bridge_transport_mode_invalid'
  | 'bridge_not_paired'
  | 'bridge_offline'
  | 'bridge_revocation_pending';

export interface LeadRadarTelegramAccountReadiness {
  status: 'blocked' | 'probe_required' | 'ready';
  blockers: LeadRadarTelegramAccountReadinessBlocker[];
}

export interface LeadRadarApiCapabilities {
  admissionEnabled: boolean;
  processingEnabled: boolean;
  contactEnabled: boolean;
  /** Corporate Telegram discovery/ranking in research mode; no personal data or send authority. */
  telegramDiscoveryEnabled?: boolean;
  /** Visibility of fresh, reviewed personal contacts. Kept optional for older snapshots. */
  personalContactsEnabled?: boolean;
  /** Permission for the existing one-company outreach flow. */
  individualOutreachEnabled?: boolean;
  /** Permission to start the isolated user-account QR connection flow. */
  telegramAccountEnabled?: boolean;
  /** Local, non-secret readiness. `probe_required` needs the private health check. */
  telegramAccountReadiness?: LeadRadarTelegramAccountReadiness;
  /** Permission to create and dispatch campaigns through a dedicated user account. */
  campaignOutreachEnabled?: boolean;
  /** Final provider-side send gate; campaign drafting can remain available while false. */
  campaignAutoSendEnabled?: boolean;
  /** Server-resolved per-account UTC-day campaign quota; safe to expose. */
  telegramCampaignDailyLimit?: number;
  /** Server-resolved minimum delay between account campaign sends. */
  telegramCampaignMinimumIntervalSeconds?: number;
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
