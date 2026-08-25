import type { LeadRadarLead } from '../../shared/lead-radar';

export const LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT = 50;
export const LEAD_RADAR_CAMPAIGN_MESSAGE_LIMIT = 4_096;

export type LeadRadarTelegramAccountConnectionStatus =
  | 'unconfigured'
  | 'disconnected'
  | 'pending'
  | 'connecting'
  | 'connected'
  | 'restricted'
  | 'reauth_required'
  | 'revoked'
  | 'paused'
  | 'error';

export interface LeadRadarTelegramAccountQr {
  authId: string;
  qrCodeDataUrl: string | null;
  /** Short-lived Telegram deep link; never persist it in browser storage. */
  qrLoginUrl: string | null;
  expiresAt: string;
}

/** Browser-safe account projection. It never contains a phone, OTP or auth session. */
export interface LeadRadarTelegramAccountState {
  status: LeadRadarTelegramAccountConnectionStatus;
  connectionId: string | null;
  /** Domain-native aliases accepted by the UI facade. */
  id?: string;
  maskedLabel?: string;
  stateVersion?: number;
  displayName: string | null;
  username: string | null;
  phoneMasked: string | null;
  connectedAt: string | null;
  lastHealthAt: string | null;
  qr: LeadRadarTelegramAccountQr | null;
  reasonCode: string | null;
  /** Optional server attestation for the identity shown to the operator. */
  identityVerifiedAt?: string | null;
  identityReviewRequired?: boolean;
  identityReviewReason?: string | null;
}

export type LeadRadarCampaignRecipientClassification = 'automatic' | 'manual' | 'excluded';

export interface LeadRadarCampaignEligibilitySummary {
  selected: number;
  automatic: number;
  manual: number;
  excluded: number;
}

export interface LeadRadarCampaignRecipientPreview {
  leadId: string;
  companyName: string;
  classification: LeadRadarCampaignRecipientClassification;
  reasonCode: string;
  preview: string | null;
  authorization?: LeadRadarCampaignRecipientAuthorization | null;
}

export interface LeadRadarCampaignRecipientAuthorization {
  basis: LeadRadarCampaignContactBasis;
  evidenceVersion: string;
  verifiedAt: string;
  expiresAt: string;
  reviewer: 'owner_verified';
}

export interface LeadRadarTelegramContactAuthorizationReadModel
  extends LeadRadarCampaignRecipientAuthorization {
  companyId: string;
}

export interface LeadRadarTelegramContactAuthorizationInput {
  searchId: string;
  leadId: string;
  contactBasis: LeadRadarCampaignContactBasis;
  evidenceReference: string;
  expiresAt: string;
}

export interface LeadRadarTelegramCampaignPreparation {
  approvalToken: string;
  expiresAt: string;
  selectionDigest: string;
  contentDigest: string;
  /** `selection` is the domain read model; `summary` is accepted for older facade adapters. */
  selection?: LeadRadarCampaignEligibilitySummary & {
    automaticCompanyIds?: string[];
    items?: Array<{
      companyId: string;
      name: string | null;
      classification: LeadRadarCampaignRecipientClassification;
      reasonCode: string;
      authorization?: LeadRadarCampaignRecipientAuthorization | null;
    }>;
  };
  summary?: LeadRadarCampaignEligibilitySummary;
  recipients?: LeadRadarCampaignRecipientPreview[];
  previews?: Array<{ leadId: string; companyName: string; text: string }>;
}

export type LeadRadarTelegramCampaignStatus =
  | 'draft'
  | 'approved'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed';

export interface LeadRadarTelegramCampaignCounts {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  ambiguous: number;
  skipped: number;
}

export interface LeadRadarTelegramCampaignReadModel {
  id: string;
  status: LeadRadarTelegramCampaignStatus;
  counts: LeadRadarTelegramCampaignCounts;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  pausedUntil: string | null;
  reasonCode: string | null;
  pauseReason?: string | null;
  lastErrorCode?: string | null;
  nextSendAt?: string;
  updatedAt?: string;
  /** Authoritative resume guard returned by newer control-plane versions. */
  canResume?: boolean;
  resumeBlockedReason?: LeadRadarTelegramCampaignResumeBlockReason | null;
  operatorReviewRequired?: boolean;
}

export type LeadRadarTelegramCampaignResumeBlockReason =
  | 'cooldown'
  | 'review_required'
  | 'ambiguous_delivery'
  | 'account_restricted'
  | 'account_disconnected'
  | 'campaign_disabled';

export interface LeadRadarTelegramCampaignRecovery {
  active: LeadRadarTelegramCampaignReadModel | null;
  latest?: LeadRadarTelegramCampaignReadModel | null;
}

export type LeadRadarTelegramCampaignRecoveryResponse =
  | LeadRadarTelegramCampaignRecovery
  | LeadRadarTelegramCampaignReadModel
  | null;

export type LeadRadarTelegramCampaignMutationResponse =
  | LeadRadarTelegramCampaignReadModel
  | {
    campaign: LeadRadarTelegramCampaignReadModel;
    replayed: boolean;
  };

export type LeadRadarCampaignContactBasis =
  | 'documented_consent'
  | 'inbound_request'
  | 'existing_relationship'
  | 'contractual_relationship';

export interface LeadRadarTelegramCampaignPrepareInput {
  accountId: string;
  searchId: string;
  leadIds: string[];
  template: string;
  contactBasis: LeadRadarCampaignContactBasis;
}

export interface LeadRadarTelegramCampaignCreateInput {
  accountId: string;
  searchId: string;
  leadIds: string[];
  template: string;
  contactBasis: LeadRadarCampaignContactBasis;
  approvalToken: string;
  selectionDigest: string;
  contentDigest: string;
}

export type LocalCampaignEligibilityReason =
  | 'candidate_verified_corporate'
  | 'manual_personal_or_unknown'
  | 'missing_telegram'
  | 'unsupported_telegram_type'
  | 'do_not_contact';

export interface LocalCampaignEligibility {
  classification: LeadRadarCampaignRecipientClassification;
  reason: LocalCampaignEligibilityReason;
}

export function boundCampaignTemplate(value: string): string {
  return [...value.replaceAll('\u0000', '')].slice(0, LEAD_RADAR_CAMPAIGN_MESSAGE_LIMIT).join('');
}

export function isCampaignTemplateReady(value: string): boolean {
  const length = [...value].length;
  const hasUnsupportedVariable = [...value.matchAll(/\{([^{}]+)\}/gu)]
    .some((match) => match[1] !== 'company_name');
  return !value.includes('\u0000')
    && value.trim().length > 0
    && length <= LEAD_RADAR_CAMPAIGN_MESSAGE_LIMIT
    && !hasUnsupportedVariable;
}

/**
 * This is display-only pre-classification. The server repeats eligibility and
 * DNC checks when the draft is prepared and immediately before dispatch.
 */
export function classifyCampaignLeadLocally(lead: LeadRadarLead): LocalCampaignEligibility {
  if (lead.suppressed || lead.lifecycle === 'do_not_contact') {
    return { classification: 'excluded', reason: 'do_not_contact' };
  }
  const contact = lead.telegramContact;
  if (!contact && !lead.telegramUrl) {
    return { classification: 'excluded', reason: 'missing_telegram' };
  }
  if (!contact || contact.type === 'human' || contact.type === 'unknown') {
    return { classification: 'manual', reason: 'manual_personal_or_unknown' };
  }
  if (contact.type !== 'business') {
    return { classification: 'excluded', reason: 'unsupported_telegram_type' };
  }
  if (!contact.username || contact.evidenceIds.length === 0 || !contact.verifiedAt) {
    return { classification: 'manual', reason: 'manual_personal_or_unknown' };
  }
  return { classification: 'automatic', reason: 'candidate_verified_corporate' };
}

export function isSelectableCampaignLead(lead: LeadRadarLead): boolean {
  return classifyCampaignLeadLocally(lead).classification !== 'excluded';
}

export function selectableCampaignLeadIds(leads: readonly LeadRadarLead[]): string[] {
  const ids = new Set<string>();
  for (const lead of leads) {
    if (isSelectableCampaignLead(lead)) ids.add(lead.id);
  }
  return [...ids];
}

/**
 * Display-only shortcut for the bulk-selection button. Individual manual-review
 * candidates remain selectable, but "select all" never implies that they are
 * eligible for automatic delivery.
 */
export function automaticCampaignLeadIds(leads: readonly LeadRadarLead[]): string[] {
  const ids = new Set<string>();
  for (const lead of leads) {
    if (classifyCampaignLeadLocally(lead).classification === 'automatic') ids.add(lead.id);
  }
  return [...ids];
}

export function campaignFromRecovery(
  value: LeadRadarTelegramCampaignRecoveryResponse,
): LeadRadarTelegramCampaignReadModel | null {
  if (!value) return null;
  if ('id' in value) return value;
  return value.active ?? value.latest ?? null;
}

export function isValidCampaignRecipientAuthorization(
  value: LeadRadarCampaignRecipientAuthorization | null | undefined,
  contactBasis: LeadRadarCampaignContactBasis | '',
  now = Date.now(),
): value is LeadRadarCampaignRecipientAuthorization {
  if (!value || !contactBasis || value.basis !== contactBasis || value.reviewer !== 'owner_verified') return false;
  const verifiedAt = Date.parse(value.verifiedAt);
  const validUntil = Date.parse(value.expiresAt);
  return typeof value.evidenceVersion === 'string'
    && value.evidenceVersion.length >= 1
    && value.evidenceVersion.length <= 64
    && Number.isFinite(verifiedAt)
    && verifiedAt <= now
    && Number.isFinite(validUntil)
    && validUntil > now;
}

export function campaignResumeBlockReason(input: {
  campaign: LeadRadarTelegramCampaignReadModel;
  account: LeadRadarTelegramAccountState | null;
  autoSendEnabled: boolean;
  identityConfirmed: boolean;
  now?: number;
}): LeadRadarTelegramCampaignResumeBlockReason | 'identity_confirmation_required' | null {
  const { campaign, account } = input;
  if (campaign.status !== 'paused') return null;
  if (!input.autoSendEnabled) return 'campaign_disabled';
  if (account?.status === 'restricted' || account?.identityReviewRequired) return 'account_restricted';
  if (account?.status !== 'connected') return 'account_disconnected';
  if (!input.identityConfirmed) return 'identity_confirmation_required';
  if (campaign.counts.ambiguous > 0) return 'ambiguous_delivery';
  if (campaign.operatorReviewRequired) return 'review_required';
  if (campaign.resumeBlockedReason) return campaign.resumeBlockedReason;
  if (campaign.canResume === false) return 'review_required';
  const until = Date.parse(campaign.pausedUntil ?? campaign.nextSendAt ?? '');
  if (Number.isFinite(until) && until > (input.now ?? Date.now())) return 'cooldown';
  const reason = `${campaign.resumeBlockedReason ?? ''} ${campaign.reasonCode ?? ''} ${campaign.pauseReason ?? ''}`.toLowerCase();
  if (/ambiguous/u.test(reason)) return 'ambiguous_delivery';
  if (/restrict|spam|peer_flood/u.test(reason)) return 'account_restricted';
  if (/review|manual/u.test(reason)) return 'review_required';
  if (/flood|cooldown|rate_limit/u.test(reason)) return 'cooldown';
  return null;
}

export function isTelegramAccountQrExpired(
  account: LeadRadarTelegramAccountState | null | undefined,
  now = Date.now(),
): boolean {
  if (account?.status !== 'connecting' && account?.status !== 'pending') return false;
  const expiresAt = Date.parse(account.qr?.expiresAt ?? '');
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

/** QR data stays in component memory and is rendered only as a bounded PNG. */
export function safeTelegramQrDataUrl(value?: string | null): string | null {
  if (!value || value.length > 350_000) return null;
  return /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(value) ? value : null;
}

/** Accept only Telegram's short-lived QR login deep-link shape. */
export function safeTelegramLoginUrl(value?: string | null): string | null {
  return value && /^tg:\/\/login\?token=[A-Za-z0-9_-]{16,512}={0,2}$/u.test(value)
    ? value
    : null;
}

export function renderCampaignPreview(template: string, companyName: string): string {
  return template.replaceAll('{company_name}', companyName);
}
