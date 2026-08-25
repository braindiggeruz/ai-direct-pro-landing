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
}

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
  return classifyCampaignLeadLocally(lead).reason !== 'do_not_contact';
}

export function selectableCampaignLeadIds(leads: readonly LeadRadarLead[]): string[] {
  const ids = new Set<string>();
  for (const lead of leads) {
    if (isSelectableCampaignLead(lead)) ids.add(lead.id);
  }
  return [...ids];
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

export function renderCampaignPreview(template: string, companyName: string): string {
  return template.replaceAll('{company_name}', companyName);
}
