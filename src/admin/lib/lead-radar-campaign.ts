import type { LeadRadarLead, LeadRadarTelegramAccountReadiness } from '../../shared/lead-radar';

import type {
  LeadRadarTelegramBridgeE2eEnvelope,
} from '../../shared/lead-radar-telegram-bridge';

export const LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT = 50;
export const LEAD_RADAR_CAMPAIGN_MESSAGE_LIMIT = 4_096;
export const LEAD_RADAR_CAMPAIGN_CAPTION_LIMIT = 1_024;
export const LEAD_RADAR_CAMPAIGN_IMAGE_MAX_BYTES = 5_000_000;
export const LEAD_RADAR_CAMPAIGN_IMAGE_MAX_DIMENSION_SUM = 10_000;
export const LEAD_RADAR_CAMPAIGN_IMAGE_MAX_ASPECT_RATIO = 20;
export const LEAD_RADAR_CAMPAIGN_IMAGE_MAX_PIXELS = 4_000_000;
export const LEAD_RADAR_CAMPAIGN_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type LeadRadarCampaignImageMimeType = typeof LEAD_RADAR_CAMPAIGN_IMAGE_MIME_TYPES[number];

/** Opaque media identity. It never exposes a bucket key or a public URL. */
export interface LeadRadarTelegramCampaignAttachmentReference {
  mediaId: string;
  mediaDigest: string;
}

/** Browser-safe upload result used to render file metadata, not a storage address. */
export interface LeadRadarTelegramCampaignMediaUpload
  extends LeadRadarTelegramCampaignAttachmentReference {
  filename: string;
  mimeType: LeadRadarCampaignImageMimeType;
  sizeBytes: number;
}

export interface LeadRadarCampaignImageCandidate {
  name: string;
  type: string;
  size: number;
}

export type LeadRadarCampaignImageValidationCode =
  | 'empty'
  | 'unsupported_type'
  | 'too_large'
  | 'invalid_dimensions'
  | 'animated';

export function validateCampaignImage(
  file: LeadRadarCampaignImageCandidate,
): LeadRadarCampaignImageValidationCode | null {
  if (file.size < 1) return 'empty';
  if (file.size > LEAD_RADAR_CAMPAIGN_IMAGE_MAX_BYTES) return 'too_large';
  if (!(LEAD_RADAR_CAMPAIGN_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'unsupported_type';
  }
  return null;
}

export function validateCampaignImageDimensions(
  width: number,
  height: number,
): LeadRadarCampaignImageValidationCode | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return 'invalid_dimensions';
  }
  if (width * height > LEAD_RADAR_CAMPAIGN_IMAGE_MAX_PIXELS) return 'invalid_dimensions';
  if (width + height > LEAD_RADAR_CAMPAIGN_IMAGE_MAX_DIMENSION_SUM) return 'invalid_dimensions';
  if (Math.max(width, height) / Math.min(width, height) > LEAD_RADAR_CAMPAIGN_IMAGE_MAX_ASPECT_RATIO) {
    return 'invalid_dimensions';
  }
  return null;
}

function asciiAt(bytes: Uint8Array, offset: number, value: string): boolean {
  if (offset < 0 || offset + value.length > bytes.length) return false;
  return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

/** Fast client hint only; the server remains authoritative for decoded frames. */
export function hasCampaignImageAnimationMarker(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = ((bytes[offset] << 24) >>> 0)
        + (bytes[offset + 1] << 16)
        + (bytes[offset + 2] << 8)
        + bytes[offset + 3];
      if (asciiAt(bytes, offset + 4, 'acTL')) return true;
      if (length > bytes.length - offset - 12) return false;
      offset += length + 12;
    }
    return false;
  }
  if (mimeType === 'image/webp') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const length = bytes[offset + 4]
        + (bytes[offset + 5] << 8)
        + (bytes[offset + 6] << 16)
        + ((bytes[offset + 7] << 24) >>> 0);
      if (asciiAt(bytes, offset, 'ANIM')) return true;
      if (asciiAt(bytes, offset, 'VP8X') && length >= 1 && (bytes[offset + 8] & 0x02) !== 0) return true;
      if (length > bytes.length - offset - 8) return false;
      offset += 8 + length + (length % 2);
    }
  }
  return false;
}

export function isValidCampaignMediaUpload(
  value: unknown,
): value is LeadRadarTelegramCampaignMediaUpload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const media = value as Partial<LeadRadarTelegramCampaignMediaUpload>;
  return typeof media.mediaId === 'string'
    && /^lrtgcm_[0-9a-f]{32}$/u.test(media.mediaId)
    && typeof media.mediaDigest === 'string'
    && /^[0-9a-f]{64}$/u.test(media.mediaDigest)
    && typeof media.filename === 'string'
    && media.filename.length >= 1
    && media.filename.length <= 255
    && typeof media.mimeType === 'string'
    && (LEAD_RADAR_CAMPAIGN_IMAGE_MIME_TYPES as readonly string[]).includes(media.mimeType)
    && typeof media.sizeBytes === 'number'
    && Number.isInteger(media.sizeBytes)
    && media.sizeBytes >= 1
    && media.sizeBytes <= LEAD_RADAR_CAMPAIGN_IMAGE_MAX_BYTES;
}

export function campaignMessageLimit(hasAttachment: boolean): number {
  return hasAttachment ? LEAD_RADAR_CAMPAIGN_CAPTION_LIMIT : LEAD_RADAR_CAMPAIGN_MESSAGE_LIMIT;
}

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

export type LeadRadarTelegramAccountAuthState =
  | 'starting'
  | 'awaiting_phone'
  | 'awaiting_qr'
  | 'awaiting_code'
  | 'awaiting_password'
  | 'finalizing'
  | 'connected';

export interface LeadRadarTelegramBridgeEncryptionKey {
  alg: 'RSA-OAEP-256';
  keyId: string;
  spki: string;
}

export type LeadRadarTelegramBridgeDeviceStatus =
  | 'unpaired'
  | 'online'
  | 'offline'
  | 'pending_revocation'
  | 'revoked';

export interface LeadRadarTelegramBridgeDeviceState {
  status: LeadRadarTelegramBridgeDeviceStatus;
  deviceId: string | null;
  label: string | null;
  version: string | null;
  lastSeenAt: string | null;
}

export interface LeadRadarTelegramBridgePairing {
  pairingId: string;
  expiresAt: string;
}

export interface LeadRadarTelegramAccountQr {
  authId: string;
  /** Command/context ids are non-secret and bind the E2E payload to this login. */
  orgId: string;
  bridgeCommandId: string;
  deviceId: string;
  /** Ciphertext only. The private QR key never leaves React memory. */
  qrEnvelope: LeadRadarTelegramBridgeE2eEnvelope | null;
  /** One-use encrypted phone/code relay owned by the local Bridge. */
  inputCommandId: string | null;
  inputAction: 'phone' | 'code' | null;
  /** Present only while the Bridge is waiting for Telegram 2FA. */
  passwordCommandId: string | null;
  bridgeEncryptionKey: LeadRadarTelegramBridgeEncryptionKey | null;
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
  /** Non-secret TDLib authorization step; password values never enter this model. */
  authState?: LeadRadarTelegramAccountAuthState | null;
  authAttemptId?: string | null;
  pendingAction?: 'phone' | 'code' | 'password' | null;
  reasonCode: string | null;
  /** Optional server attestation for the identity shown to the operator. */
  identityVerifiedAt?: string | null;
  identityReviewRequired?: boolean;
  identityReviewReason?: string | null;
  /** Closed-list, non-secret infrastructure readiness returned by the owner API. */
  readiness?: LeadRadarTelegramAccountReadiness;
}

export type LeadRadarTelegramAccountQuickAction =
  | 'connect'
  | 'inspect'
  | 'blocked_feature'
  | 'blocked_unconfigured'
  | 'blocked_restricted'
  | 'blocked_unknown';

/** Only provider-acknowledged states may say that a code was requested. */
export function telegramAuthProgress(account: LeadRadarTelegramAccountState | null): string | null {
  if (!account) return null;
  if (account.pendingAction === 'phone') return 'Команда принята. Bridge запрашивает код у Telegram; подтверждения ещё нет.';
  if (account.pendingAction === 'code') return 'Команда принята. Telegram проверяет код.';
  if (account.pendingAction === 'password') return 'Команда принята. Telegram проверяет пароль двухэтапной защиты.';
  const errors: Record<string, string> = {
    phone_invalid: 'Telegram отклонил номер. Проверьте номер и код страны.',
    code_invalid: 'Telegram отклонил код. Введите последний полученный код.',
    password_invalid: 'Telegram отклонил пароль двухэтапной защиты. Проверьте его и повторите ввод.',
    code_expired: 'Код истёк. Начните новое подключение.',
    auth_expired: 'Время входа истекло. Начните новое подключение.',
    telegram_timeout: 'Telegram не ответил вовремя. Код не подтверждён. Проверьте сеть компьютера и начните новое подключение.',
    auth_input_outcome_unknown: 'Нет подтверждения Telegram. Запрос не повторяется автоматически; обновите статус перед новой попыткой.',
    auth_outcome_unknown: 'Нет подтверждения Telegram. Запрос не повторяется автоматически; обновите статус перед новой попыткой.',
  };
  if (account.reasonCode && errors[account.reasonCode]) return errors[account.reasonCode];
  if (account.authState === 'finalizing') return 'Telegram принял вход. Bridge подтверждает сохранение сессии; отправка пока закрыта.';
  if (account.authState === 'awaiting_code') return 'Telegram подтвердил запрос кода. Проверьте служебный чат Telegram на уже подключённом устройстве или SMS.';
  if (account.authState === 'awaiting_password') return 'Код принят. Введите пароль двухэтапной защиты Telegram.';
  return null;
}

export function telegramAccountQuickAction(
  status: LeadRadarTelegramAccountConnectionStatus | null,
  featureEnabled: boolean,
): LeadRadarTelegramAccountQuickAction {
  if (!featureEnabled) return 'blocked_feature';
  if (status === 'disconnected'
    || status === 'error'
    || status === 'revoked'
    || status === 'reauth_required') return 'connect';
  if (status === 'pending'
    || status === 'connecting'
    || status === 'connected'
    || status === 'paused') return 'inspect';
  if (status === 'unconfigured') return 'blocked_unconfigured';
  if (status === 'restricted') return 'blocked_restricted';
  return 'blocked_unknown';
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
  attachment: LeadRadarTelegramCampaignAttachmentReference | null;
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
  attachment: LeadRadarTelegramCampaignAttachmentReference | null;
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

function isSafeCampaignTextScalar(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return !((code < 32 && character !== '\n' && character !== '\t')
    || code === 127
    || (code >= 0xd800 && code <= 0xdfff));
}

export function boundCampaignTemplate(value: string): string {
  return [...value]
    .filter(isSafeCampaignTextScalar)
    .slice(0, LEAD_RADAR_CAMPAIGN_MESSAGE_LIMIT)
    .join('');
}

export function isCampaignTemplateReady(value: string, hasAttachment = false): boolean {
  const length = [...value].length;
  const hasUnsupportedVariable = [...value.matchAll(/\{([^{}]+)\}/gu)]
    .some((match) => match[1] !== 'company_name');
  return [...value].every(isSafeCampaignTextScalar)
    && value.trim().length > 0
    && length <= campaignMessageLimit(hasAttachment)
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

/**
 * A discovery result may be kept in the campaign draft even when Telegram has
 * not been found yet. This never makes it delivery-eligible: preparation and
 * dispatch still require a verified corporate endpoint and repeat DNC checks.
 */
export function isCampaignDraftCandidateLead(lead: LeadRadarLead): boolean {
  return !lead.suppressed && lead.lifecycle !== 'do_not_contact';
}

export function campaignDraftCandidateLeadIds(leads: readonly LeadRadarLead[]): string[] {
  const ids = new Set<string>();
  for (const lead of leads) {
    if (isCampaignDraftCandidateLead(lead)) ids.add(lead.id);
  }
  return [...ids];
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
