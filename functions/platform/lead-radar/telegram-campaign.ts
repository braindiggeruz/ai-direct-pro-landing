import type { LeadRadarTelegramContact, TelegramContactType } from './types';
import type { AudienceScope } from '../../../src/shared/lead-radar-audiences';
import { telegramContactEndpoint } from '../../../src/shared/lead-radar-telegram-endpoint';
import { AudienceStore,requireAudienceSchema } from './audiences';
import {
  buildVerifiedTelegramCorporateDraftLink,
  telegramIdentifierDigest,
  verifiedTelegramCampaignBusinessCompanyIds,
} from './telegram-business';
import {
  LeadRadarTelegramCampaignStore,
  TELEGRAM_CAMPAIGN_EVIDENCE_VERSION,
  type TelegramAccountSafetyRow,
  type TelegramContactAuthorizationRow,
  type TelegramContactHistoryRow,
  type TelegramCampaignContactBasis,
  type TelegramCampaignCompanyRow,
  type TelegramCampaignRow,
  type TelegramCampaignStatus,
  type TelegramUserAccountRow,
} from './telegram-campaign-store';
import {
  decryptTelegramCampaignSecret,
  encryptTelegramCampaignSecret,
} from './telegram-campaign-crypto';
import { hasRuntimeTelegramCampaignSchema } from './telegram-campaign-schema';
import {
  LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT,
  LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS,
} from '../../../src/shared/lead-radar-telegram-campaign-policy';
import {
  isTelegramCampaignAttachmentReference,
  type TelegramCampaignAttachmentReference,
  type TelegramCampaignResolvedMedia,
} from './telegram-campaign-media';

export type { TelegramCampaignContactBasis } from './telegram-campaign-store';

const TEXT_ENCODER = new TextEncoder();
const MAX_SELECTION = 50;
const MAX_TEMPLATE_UTF16_UNITS = 4_096;
const MAX_TEMPLATE_BYTES = 16_384;
const MAX_MEDIA_CAPTION_UTF16_UNITS = 1_024;
const APPROVAL_TTL_MS = 10 * 60_000;
// The dispatch lease must outlive the whole send boundary (gateway request
// budget is 125 s, plus decrypt/DNC/media work) so lease recovery can never
// mark an in-flight send ambiguous and start a competing request.
const CLAIM_LEASE_MS = 3 * 60_000;
const DEFAULT_INTERVAL_SECONDS = LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS;
const MAX_PROVIDER_WAIT_SECONDS = 2_147_483_647;
const ACCOUNT_ID_PATTERN = /^lrtgua_[0-9a-f]{32}$/u;
const CAMPAIGN_ID_PATTERN = /^lrtgcp_[0-9a-f]{32}$/u;
const APPROVAL_TOKEN_PATTERN = /^lrtgca_[A-Za-z0-9_-]{43}$/u;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9:_-]{1,80}$/u;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9:_-]{8,160}$/u;
const GATEWAY_REF_PATTERN = /^[A-Za-z0-9:_-]{16,160}$/u;
const CONTACT_TYPES = new Set<TelegramContactType>([
  'human', 'bot', 'channel', 'group', 'business', 'unknown',
]);
const CONTACT_BASES = new Set<TelegramCampaignContactBasis>([
  'documented_consent',
  'inbound_request',
  'existing_relationship',
  'contractual_relationship',
]);

export type TelegramCampaignErrorCode =
  | 'telegram_campaign_invalid_input'
  | 'telegram_campaign_not_configured'
  | 'telegram_campaign_account_exists'
  | 'telegram_campaign_account_not_found'
  | 'telegram_campaign_account_not_connected'
  | 'telegram_campaign_account_state_conflict'
  | 'telegram_campaign_idempotency_conflict'
  | 'telegram_campaign_no_eligible_recipients'
  | 'telegram_campaign_eligibility_required'
  | 'telegram_campaign_active_exists'
  | 'telegram_campaign_approval_required'
  | 'telegram_campaign_approval_expired_or_used'
  | 'telegram_campaign_campaign_not_found'
  | 'telegram_campaign_transition_invalid'
  | 'telegram_campaign_resume_cooldown'
  | 'telegram_campaign_resume_review_required'
  | 'telegram_campaign_resume_ambiguous_delivery'
  | 'telegram_campaign_resume_account_restricted'
  | 'telegram_campaign_resume_account_disconnected'
  | 'telegram_campaign_claim_invalid'
  | 'telegram_campaign_storage_conflict';

export class LeadRadarTelegramCampaignError extends Error {
  constructor(readonly code: TelegramCampaignErrorCode) {
    super(code);
    this.name = 'LeadRadarTelegramCampaignError';
  }
}

export type TelegramCampaignSelectionReason =
  | 'verified_corporate_authorized'
  | 'documented_basis_required'
  | 'personal_contact_manual_only'
  | 'bot_not_messageable'
  | 'channel_not_messageable'
  | 'group_not_messageable'
  | 'no_verified_corporate_endpoint'
  | 'corporate_endpoint_unverified'
  | 'do_not_contact'
  | 'already_contacted'
  | 'previous_delivery_uncertain'
  | 'company_not_found';

export interface TelegramCampaignSelectionItem {
  companyId: string;
  name: string | null;
  classification: 'automatic' | 'manual' | 'excluded';
  reasonCode: TelegramCampaignSelectionReason;
  authorization: {
    basis: TelegramCampaignContactBasis;
    evidenceVersion: string;
    verifiedAt: string;
    expiresAt: string;
    reviewer: 'owner_verified';
  } | null;
}

export interface TelegramCampaignSelectionEvaluation {
  selected: number;
  automatic: number;
  manual: number;
  excluded: number;
  /** Fresh, current-account Bridge proof; still not outreach authorization. */
  verified: number;
  verifiedCompanyIds: string[];
  automaticCompanyIds: string[];
  items: TelegramCampaignSelectionItem[];
}

interface VerifiedRecipient {
  companyId: string;
  name: string;
  username: string;
  contactJson: string;
  businessIdentities: ReadonlyArray<{
    kind: 'canonical' | 'domain' | 'phone';
    digest: string;
  }>;
  authorization: TelegramContactAuthorizationRow;
}

export type TelegramCampaignResumeBlockedReason =
  | 'cooldown'
  | 'review_required'
  | 'ambiguous_delivery'
  | 'account_restricted'
  | 'account_disconnected';

function resumeBlockedError(
  reason: TelegramCampaignResumeBlockedReason,
): TelegramCampaignErrorCode {
  switch (reason) {
    case 'cooldown': return 'telegram_campaign_resume_cooldown';
    case 'review_required': return 'telegram_campaign_resume_review_required';
    case 'ambiguous_delivery': return 'telegram_campaign_resume_ambiguous_delivery';
    case 'account_restricted': return 'telegram_campaign_resume_account_restricted';
    case 'account_disconnected': return 'telegram_campaign_resume_account_disconnected';
  }
}

interface InternalSelection extends TelegramCampaignSelectionEvaluation {
  verifiedRecipients: VerifiedRecipient[];
}

function publicSelection(selection: InternalSelection): TelegramCampaignSelectionEvaluation {
  return {
    selected: selection.selected,
    automatic: selection.automatic,
    manual: selection.manual,
    excluded: selection.excluded,
    verified: selection.verified,
    verifiedCompanyIds: [...selection.verifiedCompanyIds],
    automaticCompanyIds: [...selection.automaticCompanyIds],
    items: selection.items.map((item) => ({ ...item })),
  };
}

export interface TelegramAccountReadModel {
  id: string;
  status: TelegramUserAccountRow['status'];
  maskedLabel: string;
  connectedAt: string | null;
  lastHealthAt: string | null;
  stateVersion: number;
}

export interface TelegramCampaignPrepareResult {
  approvalToken: string;
  expiresAt: string;
  selectionDigest: string;
  contentDigest: string;
  recipientCount: number;
  selection: TelegramCampaignSelectionEvaluation;
  attachment: TelegramCampaignAttachmentReference | null;
}

export interface TelegramCampaignReadModel {
  id: string;
  accountId: string;
  status: TelegramCampaignStatus;
  contactBasis: TelegramCampaignContactBasis;
  pauseReason: string | null;
  lastErrorCode: string | null;
  counts: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    ambiguous: number;
    skipped: number;
  };
  minIntervalSeconds: number;
  nextSendAt: string;
  approvedAt: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canResume: boolean;
  resumeBlockedReason: TelegramCampaignResumeBlockedReason | null;
  pausedUntil: string | null;
  attachment: TelegramCampaignAttachmentReference | null;
}

export interface TelegramCampaignClaim {
  campaignId: string;
  recipientId: string;
  claimToken: string;
  leaseExpiresAt: string;
}

export type TelegramCampaignProviderResult =
  | { kind: 'sent'; providerMessageId: string }
  | {
    kind: 'rejected';
    code:
      | 'peer_invalid'
      | 'privacy_restricted'
      | 'flood_wait'
      | 'flood_premium_wait'
      | 'slow_mode'
      | 'account_restricted'
      | 'account_session_missing'
      | 'paid_message_required'
      | 'media_invalid'
      | 'provider_rejected';
    retryAfterSeconds?: number;
  }
  | { kind: 'ambiguous' };

export interface TelegramCampaignSender {
  /**
   * The adapter may return `rejected` only when the provider guarantees that
   * no message was accepted. Timeouts, disconnects and uncertain responses
   * must return/throw as ambiguous; the domain will never retry that recipient.
   */
  send(input: {
    orgId: string;
    accountId: string;
    gatewayAccountRef: string;
    username: string;
    text: string;
    randomId: string;
    media: TelegramCampaignResolvedMedia | null;
  }): Promise<TelegramCampaignProviderResult>;
}

export interface TelegramCampaignMediaReader {
  read(
    orgId: string,
    attachment: TelegramCampaignAttachmentReference,
  ): Promise<TelegramCampaignResolvedMedia>;
}

export interface TelegramCampaignQueueMessage {
  schema: 'gptbot.lead-radar.telegram-campaign.v1';
  campaign_id: string;
  org_id: string;
  state_version: number;
}

export interface TelegramCampaignQueueSender {
  send(
    message: TelegramCampaignQueueMessage,
    options?: { delaySeconds?: number },
  ): Promise<void>;
}

function fail(code: TelegramCampaignErrorCode): never {
  throw new LeadRadarTelegramCampaignError(code);
}

export function isTelegramCampaignContactBasis(value: unknown): value is TelegramCampaignContactBasis {
  return typeof value === 'string' && CONTACT_BASES.has(value as TelegramCampaignContactBasis);
}

export function isTelegramCampaignDataKeyValid(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value.trim())) return false;
  try {
    const normalized = value.trim().replaceAll('-', '+').replaceAll('_', '/');
    return atob(`${normalized}=`).length === 32;
  } catch {
    return false;
  }
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function randomHex(length: number): string {
  return [...randomBytes(length)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function randomBase64Url(length: number): string {
  let binary = '';
  for (const byte of randomBytes(length)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function hexDigestToBase64Url(value: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) fail('telegram_campaign_not_configured');
  let binary = '';
  for (let index = 0; index < value.length; index += 2) {
    binary += String.fromCharCode(Number.parseInt(value.slice(index, index + 2), 16));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function entityId(
  prefix: 'lrtgua_' | 'lrtgau_' | 'lrtgap_' | 'lrtgcp_' | 'lrtgcr_' | 'lrtgce_' | 'lrtgop_',
): string {
  return `${prefix}${randomHex(16)}`;
}

function assertOrgId(orgId: string): void {
  if (!ENTITY_ID_PATTERN.test(orgId)) fail('telegram_campaign_invalid_input');
}

function assertOperator(operatorId: string): string {
  const normalized = operatorId.trim().toLowerCase();
  if (normalized.length < 3
    || normalized.length > 254
    || [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })) fail('telegram_campaign_invalid_input');
  return normalized;
}

function assertIdempotencyKey(value: string): void {
  if (!IDEMPOTENCY_PATTERN.test(value)) fail('telegram_campaign_invalid_input');
}

function boundedTemplate(value: string, maxCodePoints = MAX_TEMPLATE_UTF16_UNITS): string {
  const bytes = TEXT_ENCODER.encode(value);
  // Telegram's documented 4096/1024 limits count UTF-16 code units, so the
  // length check must too (audit CP-4): counting code points let emoji-heavy
  // text pass locally and be rejected by the provider mid-campaign.
  if (value.trim().length === 0
    || value.length > maxCodePoints
    || bytes.byteLength > MAX_TEMPLATE_BYTES
    || [...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (code < 32 && character !== '\n' && character !== '\t')
        || code === 127
        || (code >= 0xd800 && code <= 0xdfff);
    })
    || [...value.matchAll(/\{([^{}]+)\}/gu)]
      .some((match) => match[1] !== 'company_name')) fail('telegram_campaign_invalid_input');
  return value;
}

function renderedTemplate(
  template: string,
  companyName: string,
  maxCodePoints = MAX_TEMPLATE_UTF16_UNITS,
): string {
  return boundedTemplate(template.replaceAll('{company_name}', companyName), maxCodePoints);
}

function intervalSeconds(value: number | undefined): number {
  const parsed = value ?? DEFAULT_INTERVAL_SECONDS;
  if (!Number.isInteger(parsed)
    || parsed < LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS
    || parsed > 3_600) {
    fail('telegram_campaign_invalid_input');
  }
  return parsed;
}

function dailyLimit(value: number | undefined): number {
  const parsed = value ?? LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT;
  if (!Number.isInteger(parsed)
    || parsed < 1
    || parsed > LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT) {
    fail('telegram_campaign_invalid_input');
  }
  return parsed;
}

function nextUtcDay(now: Date): string {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  )).toISOString();
}

function selectedCompanyIds(input: readonly string[]): string[] {
  if (input.length < 1 || input.length > MAX_SELECTION) fail('telegram_campaign_invalid_input');
  const selected = input.map((value) => value.trim());
  if (selected.some((value) => !ENTITY_ID_PATTERN.test(value))
    || new Set(selected).size !== selected.length) fail('telegram_campaign_invalid_input');
  return selected;
}

function safeMaskedLabel(value: string): string {
  const label = value.trim();
  const maskedUsername = /^@[A-Za-z0-9_]{1,2}•{3,5}[A-Za-z0-9_]{1,2}$/u.test(label);
  if (label.length < 1
    || label.length > 40
    || (label.includes('@') && !maskedUsername)
    || /[+]|https?:|t\.me|\d{5,}/iu.test(label)
    || [...label].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })) fail('telegram_campaign_invalid_input');
  return label;
}

function accountReadModel(row: TelegramUserAccountRow): TelegramAccountReadModel {
  return {
    id: row.id,
    status: row.status,
    maskedLabel: row.masked_label,
    connectedAt: row.connected_at,
    lastHealthAt: row.last_health_at,
    stateVersion: row.state_version,
  };
}

function campaignReadModel(
  row: TelegramCampaignRow,
  accountSafety: TelegramAccountSafetyRow | null,
  now: Date,
): TelegramCampaignReadModel {
  const terminal = row.sent_count + row.failed_count + row.ambiguous_count + row.skipped_count;
  let canResume = false;
  let resumeBlockedReason: TelegramCampaignResumeBlockedReason | null = null;
  let pausedUntil: string | null = null;
  if (row.status === 'paused') {
    pausedUntil = row.pause_reason === 'flood_wait' || row.pause_reason === 'cooldown'
      ? row.next_send_at
      : null;
    if (accountSafety?.state === 'disconnected') {
      resumeBlockedReason = 'account_disconnected';
    } else if (accountSafety?.state === 'restricted') {
      resumeBlockedReason = 'account_restricted';
    } else if (accountSafety?.state === 'review_required') {
      resumeBlockedReason = accountSafety.reason_code === 'ambiguous_delivery'
        ? 'ambiguous_delivery'
        : 'review_required';
    } else if (accountSafety?.state === 'cooldown'
      && accountSafety.blocked_until !== null
      && accountSafety.blocked_until > now.toISOString()) {
      resumeBlockedReason = 'cooldown';
      pausedUntil = accountSafety.blocked_until;
    } else if (row.pause_reason === 'ambiguous_delivery') {
      resumeBlockedReason = 'ambiguous_delivery';
    } else if (row.pause_reason === 'account_restricted') {
      resumeBlockedReason = 'account_restricted';
    } else if (row.pause_reason === 'provider_error') {
      resumeBlockedReason = 'review_required';
    } else if ((row.pause_reason === 'flood_wait' || row.pause_reason === 'cooldown')
      && row.next_send_at > now.toISOString()) {
      resumeBlockedReason = 'cooldown';
    } else {
      canResume = true;
    }
  }
  return {
    id: row.id,
    accountId: row.account_id,
    status: row.status,
    contactBasis: row.contact_basis,
    pauseReason: row.pause_reason,
    lastErrorCode: row.last_error_code,
    counts: {
      total: row.recipient_count,
      pending: Math.max(0, row.recipient_count - terminal),
      sent: row.sent_count,
      failed: row.failed_count,
      ambiguous: row.ambiguous_count,
      skipped: row.skipped_count,
    },
    minIntervalSeconds: row.min_interval_seconds,
    nextSendAt: row.next_send_at,
    approvedAt: row.approved_at,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canResume,
    resumeBlockedReason,
    pausedUntil,
    attachment: row.attachment_id && row.attachment_digest
      ? { mediaId: row.attachment_id, mediaDigest: row.attachment_digest }
      : null,
  };
}

async function campaignModel(
  store: LeadRadarTelegramCampaignStore,
  orgId: string,
  row: TelegramCampaignRow,
  now: Date,
): Promise<TelegramCampaignReadModel> {
  return campaignReadModel(row, await store.getAccountSafety(orgId, row.account_id), now);
}

function parseContact(value: string): LeadRadarTelegramContact | null {
  try {
    const parsed = JSON.parse(value) as Partial<LeadRadarTelegramContact> | null;
    if (!parsed || typeof parsed !== 'object'
      || typeof parsed.url !== 'string'
      || typeof parsed.username !== 'string'
      || typeof parsed.type !== 'string'
      || !CONTACT_TYPES.has(parsed.type as TelegramContactType)
      || typeof parsed.confidence !== 'number'
      || typeof parsed.reason !== 'string'
      || !Array.isArray(parsed.evidenceIds)
      || parsed.evidenceIds.some((item) => typeof item !== 'string')
      || typeof parsed.verifiedAt !== 'string'
      || typeof parsed.messageable !== 'boolean') return null;
    return parsed as LeadRadarTelegramContact;
  } catch {
    return null;
  }
}

function nonBusinessReason(type: TelegramContactType | null): {
  classification: 'manual' | 'excluded';
  reasonCode: TelegramCampaignSelectionReason;
} {
  if (type === 'human') {
    return { classification: 'manual', reasonCode: 'personal_contact_manual_only' };
  }
  if (type === 'bot') return { classification: 'excluded', reasonCode: 'bot_not_messageable' };
  if (type === 'channel') return { classification: 'excluded', reasonCode: 'channel_not_messageable' };
  if (type === 'group') return { classification: 'excluded', reasonCode: 'group_not_messageable' };
  return { classification: 'excluded', reasonCode: 'no_verified_corporate_endpoint' };
}

const GENERIC_BUSINESS_HOSTS = [
  't.me',
  'telegram.me',
  'instagram.com',
  'facebook.com',
  'fb.com',
  'linktr.ee',
  'wa.me',
  'youtube.com',
  'youtu.be',
  'google.com',
  'goo.gl',
  '2gis.com',
  '2gis.uz',
  'yandex.com',
  'yandex.ru',
  'yelp.com',
  'yellowpages.com',
  'tripadvisor.com',
  'zoon.ru',
] as const;

function normalizedCorporateDomain(company: TelegramCampaignCompanyRow): string | null {
  if (company.verified_website !== 1) return null;
  let hostname = company.domain?.trim().toLowerCase().replace(/^www\./u, '').replace(/\.$/u, '')
    ?? null;
  if (!hostname && company.website) {
    try {
      hostname = new URL(company.website).hostname.toLowerCase()
        .replace(/^www\./u, '').replace(/\.$/u, '');
    } catch {
      hostname = null;
    }
  }
  if (!hostname
    || hostname.length > 253
    || !hostname.includes('.')
    || GENERIC_BUSINESS_HOSTS.some((generic) => (
      hostname === generic || hostname?.endsWith(`.${generic}`)
    ))) return null;
  return hostname;
}

async function frozenBusinessIdentities(
  dataKey: string,
  orgId: string,
  company: TelegramCampaignCompanyRow,
): Promise<Array<{ kind: 'canonical' | 'domain' | 'phone'; digest: string }>> {
  const aliases: Array<{ kind: 'canonical' | 'domain' | 'phone'; value: string }> = [];
  const canonical = company.canonical_key.normalize('NFKC').trim().toLowerCase();
  if (canonical.length >= 1 && canonical.length <= 260) {
    aliases.push({ kind: 'canonical', value: canonical });
  }
  const domain = normalizedCorporateDomain(company);
  if (domain) aliases.push({ kind: 'domain', value: domain });
  const phone = company.verified_phone === 1
    ? (company.phone_digits ?? '').replace(/\D/gu, '')
    : '';
  if (/^[0-9]{7,15}$/u.test(phone)) aliases.push({ kind: 'phone', value: phone });
  if (aliases.length < 1) fail('telegram_campaign_invalid_input');
  return Promise.all(aliases.map(async (alias) => ({
    kind: alias.kind,
    digest: await digest(dataKey, 'campaign-business-identity-v1', [
      orgId,
      alias.kind,
      alias.value,
    ]),
  })));
}

function parseFrozenBusinessIdentityDigests(value: string): string[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)
      || parsed.length < 1
      || parsed.length > 3
      || parsed.some((item) => typeof item !== 'string' || !/^[0-9a-f]{64}$/u.test(item))) {
      return null;
    }
    const digests = [...new Set(parsed)].sort();
    return digests.length === parsed.length ? digests : null;
  } catch {
    return null;
  }
}

async function evaluateSelectionInternal(input: {
  db: D1Database;
  orgId: string;
  companyIds: readonly string[];
  now: Date;
  dataKey?: string;
  contactBasis?: TelegramCampaignContactBasis;
  readOnly?: boolean;
  includeBridgeVerification?: boolean;
}): Promise<InternalSelection> {
  const ids = selectedCompanyIds(input.companyIds);
  const store = new LeadRadarTelegramCampaignStore(input.db);
  if (input.dataKey && input.readOnly) {
    const identity = await getTelegramCampaignDataKeyIdentityState({ db: input.db, orgId: input.orgId, dataKey: input.dataKey });
    if (identity === 'mismatch' || identity === 'legacy_unbound') fail('telegram_campaign_not_configured');
  } else if (input.dataKey) {
    await requireCampaignDataKeyIdentity(
      store,
      input.orgId,
      input.dataKey,
      input.now.toISOString(),
    );
  }
  const rows = await store.findCompanies(input.orgId, ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const contactsById = new Map(rows.map((row) => [row.id, parseContact(row.telegram_contact_json)]));
  const verifiedBusinessCompanyIds = await verifiedTelegramCampaignBusinessCompanyIds({
    db: input.db,
    orgId: input.orgId,
    companies: rows.flatMap((company) => {
      const contact = contactsById.get(company.id);
      return contact?.type === 'business'
        ? [{ companyId: company.id, website: company.website, contact }]
        : [];
    }),
    now: input.now,
    requireBridge: input.includeBridgeVerification,
  });
  const bridgeVerifiedBusinessCompanyIds = input.includeBridgeVerification
    ? verifiedBusinessCompanyIds
    : new Set<string>();
  const selectionCandidates = input.contactBasis && input.dataKey
    ? await Promise.all(rows.flatMap((company) => {
      const contact = contactsById.get(company.id);
      return contact?.type === 'business'
        && telegramContactEndpoint(contact)
        && verifiedBusinessCompanyIds.has(company.id)
        && (!input.includeBridgeVerification
          || bridgeVerifiedBusinessCompanyIds.has(company.id))
        && company.suppressed !== 1
        && company.lifecycle !== 'do_not_contact'
        ? [Promise.all([
          digest(
            input.dataKey as string,
            'campaign-endpoint',
            [input.orgId, telegramContactEndpoint(contact)!],
          ),
          frozenBusinessIdentities(input.dataKey as string, input.orgId, company),
        ]).then(([endpointDigest, businessIdentities]) => ({
          companyId: company.id,
          endpointDigest,
          businessIdentities,
        }))]
        : [];
    }))
    : [];
  const candidateById = new Map(selectionCandidates.map((candidate) => [
    candidate.companyId,
    candidate,
  ]));
  const [historyByCompanyId, authorizationByCompanyId] = input.contactBasis
    ? await Promise.all([
      store.findContactHistoryForSelections(
        input.orgId,
        selectionCandidates.map((candidate) => ({
          companyId: candidate.companyId,
          endpointDigest: candidate.endpointDigest,
          businessIdentityDigests: candidate.businessIdentities.map((identity) => identity.digest),
        })),
      ),
      store.getActiveContactAuthorizationsForSelections(
        input.orgId,
        selectionCandidates.map((candidate) => ({
          companyId: candidate.companyId,
          endpointDigest: candidate.endpointDigest,
        })),
        input.contactBasis,
        input.now.toISOString(),
      ),
    ])
    : [new Map<string, TelegramContactHistoryRow>(), new Map<string, TelegramContactAuthorizationRow>()];
  const items: TelegramCampaignSelectionItem[] = [];
  const verifiedRecipients: VerifiedRecipient[] = [];
  for (const companyId of ids) {
    const company = byId.get(companyId);
    if (!company) {
      items.push({
        companyId,
        name: null,
        classification: 'excluded',
        reasonCode: 'company_not_found',
        authorization: null,
      });
      continue;
    }
    if (company.suppressed === 1 || company.lifecycle === 'do_not_contact') {
      items.push({
        companyId,
        name: company.name,
        classification: 'excluded',
        reasonCode: 'do_not_contact',
        authorization: null,
      });
      continue;
    }
    const contact = contactsById.get(companyId) ?? null;
    if (contact?.type !== 'business') {
      const reason = nonBusinessReason(contact?.type ?? null);
      items.push({ companyId, name: company.name, ...reason, authorization: null });
      continue;
    }
    if (!verifiedBusinessCompanyIds.has(companyId)
      || !telegramContactEndpoint(contact)) {
      items.push({
        companyId,
        name: company.name,
        classification: 'excluded',
        reasonCode: 'corporate_endpoint_unverified',
        authorization: null,
      });
      continue;
    }
    if (input.includeBridgeVerification
      && !bridgeVerifiedBusinessCompanyIds.has(companyId)) {
      items.push({
        companyId,
        name: company.name,
        classification: 'excluded',
        reasonCode: 'corporate_endpoint_unverified',
        authorization: null,
      });
      continue;
    }
    if (!input.contactBasis || !input.dataKey) {
      items.push({
        companyId,
        name: company.name,
        classification: 'manual',
        reasonCode: 'documented_basis_required',
        authorization: null,
      });
      continue;
    }
    const candidate = candidateById.get(companyId);
    if (!candidate) fail('telegram_campaign_invalid_input');
    const { businessIdentities } = candidate;
    const history = historyByCompanyId.get(companyId) ?? null;
    if (history) {
      items.push({
        companyId,
        name: company.name,
        classification: 'excluded',
        reasonCode: history.state === 'sent'
          ? 'already_contacted'
          : 'previous_delivery_uncertain',
        authorization: null,
      });
      continue;
    }
    const authorization = authorizationByCompanyId.get(companyId) ?? null;
    if (!authorization) {
      items.push({
        companyId,
        name: company.name,
        classification: 'manual',
        reasonCode: 'documented_basis_required',
        authorization: null,
      });
      continue;
    }
    const publicAuthorization = {
      basis: authorization.contact_basis,
      evidenceVersion: authorization.evidence_version,
      verifiedAt: authorization.verified_at,
      expiresAt: authorization.expires_at,
      reviewer: 'owner_verified' as const,
    };
    items.push({
      companyId,
      name: company.name,
      classification: 'automatic',
      reasonCode: 'verified_corporate_authorized',
      authorization: publicAuthorization,
    });
    verifiedRecipients.push({
      companyId,
      name: company.name,
      username: telegramContactEndpoint(contact)!,
      contactJson: company.telegram_contact_json,
      businessIdentities,
      authorization,
    });
  }
  const automatic = verifiedRecipients.length;
  const manual = items.filter((item) => item.classification === 'manual').length;
  const excluded = items.length - automatic - manual;
  const verifiedCompanyIds = items.filter((item) => item.classification !== 'excluded'
    && bridgeVerifiedBusinessCompanyIds.has(item.companyId)).map((item) => item.companyId);
  return {
    selected: items.length,
    automatic,
    manual,
    excluded,
    verified: verifiedCompanyIds.length,
    verifiedCompanyIds,
    automaticCompanyIds: verifiedRecipients.map((item) => item.companyId),
    items,
    verifiedRecipients,
  };
}

export async function evaluateTelegramCampaignSelection(input: {
  db: D1Database;
  orgId: string;
  companyIds: readonly string[];
  dataKey?: string;
  contactBasis?: TelegramCampaignContactBasis;
  now?: Date;
  readOnly?: boolean;
}): Promise<TelegramCampaignSelectionEvaluation> {
  assertOrgId(input.orgId);
  const result = await evaluateSelectionInternal({
    db: input.db,
    orgId: input.orgId,
    companyIds: input.companyIds,
    now: input.now ?? new Date(),
    dataKey: input.dataKey,
    contactBasis: input.contactBasis,
    readOnly: input.readOnly,
    includeBridgeVerification: true,
  });
  return publicSelection(result);
}

export interface TelegramContactAuthorizationReadModel {
  companyId: string;
  basis: TelegramCampaignContactBasis;
  evidenceVersion: string;
  verifiedAt: string;
  expiresAt: string;
  reviewer: 'owner_verified';
}

function contactAuthorizationReadModel(
  row: TelegramContactAuthorizationRow,
): TelegramContactAuthorizationReadModel {
  return {
    companyId: row.company_id,
    basis: row.contact_basis,
    evidenceVersion: row.evidence_version,
    verifiedAt: row.verified_at,
    expiresAt: row.expires_at,
    reviewer: 'owner_verified',
  };
}

export async function authorizeTelegramCampaignContact(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  companyId: string;
  contactBasis: TelegramCampaignContactBasis;
  evidenceReference: string;
  expiresAt: string;
  reviewerId: string;
  idempotencyKey: string;
  now?: Date;
}): Promise<{ authorization: TelegramContactAuthorizationReadModel; replayed: boolean }> {
  assertOrgId(input.orgId);
  assertIdempotencyKey(input.idempotencyKey);
  if (!ENTITY_ID_PATTERN.test(input.companyId)
    || !isTelegramCampaignContactBasis(input.contactBasis)) {
    fail('telegram_campaign_invalid_input');
  }
  const evidenceReference = input.evidenceReference.trim();
  if (evidenceReference.length < 8
    || evidenceReference.length > 200
    || [...evidenceReference].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })) fail('telegram_campaign_invalid_input');
  const reviewerId = assertOperator(input.reviewerId);
  const now = input.now ?? new Date();
  const expiresAt = new Date(input.expiresAt);
  if (Number.isNaN(expiresAt.getTime())
    || expiresAt.getTime() <= now.getTime()
    || expiresAt.getTime() > now.getTime() + 366 * 24 * 60 * 60_000
    || expiresAt.toISOString() !== input.expiresAt) {
    fail('telegram_campaign_invalid_input');
  }
  const store = new LeadRadarTelegramCampaignStore(input.db);
  await requireCampaignDataKeyIdentity(
    store,
    input.orgId,
    input.dataKey,
    now.toISOString(),
  );
  const company = (await store.findCompanies(input.orgId, [input.companyId]))[0];
  if (!company || company.suppressed === 1 || company.lifecycle === 'do_not_contact') {
    fail('telegram_campaign_eligibility_required');
  }
  const contact = parseContact(company.telegram_contact_json);
  if (!contact || !telegramContactEndpoint(contact)) {
    fail('telegram_campaign_eligibility_required');
  }
  const verified = contact.peerRef ? (await verifiedTelegramCampaignBusinessCompanyIds({
    db:input.db,orgId:input.orgId,companies:[{companyId:company.id,website:company.website,contact}],now,
  })).has(company.id) : await buildVerifiedTelegramCorporateDraftLink({
    db: input.db,
    orgId: input.orgId,
    companyId: input.companyId,
    website: company.website,
    contact,
    draft: 'verification',
    now,
  });
  if (!verified) fail('telegram_campaign_eligibility_required');
  const [
    endpointDigest,
    evidenceReferenceDigest,
    reviewerDigest,
    idempotencyKeyDigest,
  ] = await Promise.all([
    digest(input.dataKey, 'campaign-endpoint', [input.orgId, telegramContactEndpoint(contact)!]),
    digest(input.dataKey, 'campaign-evidence-reference', [input.orgId, evidenceReference]),
    digest(input.dataKey, 'campaign-reviewer', [input.orgId, reviewerId]),
    digest(input.dataKey, 'campaign-authorization-idempotency', [
      input.orgId,
      input.idempotencyKey,
    ]),
  ]);
  const requestFingerprint = await digest(input.dataKey, 'campaign-authorization-request', [
    input.orgId,
    input.companyId,
    endpointDigest,
    input.contactBasis,
    evidenceReferenceDigest,
    reviewerDigest,
    TELEGRAM_CAMPAIGN_EVIDENCE_VERSION,
    expiresAt.toISOString(),
  ]);
  const existing = await store.getContactAuthorizationByIdempotency(
    input.orgId,
    idempotencyKeyDigest,
  );
  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) {
      fail('telegram_campaign_idempotency_conflict');
    }
    return { authorization: contactAuthorizationReadModel(existing), replayed: true };
  }
  const created = await store.createContactAuthorization(input.orgId, {
    id: entityId('lrtgau_'),
    companyId: input.companyId,
    endpointDigest,
    contactBasis: input.contactBasis,
    evidenceReferenceDigest,
    reviewerDigest,
    idempotencyKeyDigest,
    requestFingerprint,
    evidenceVersion: TELEGRAM_CAMPAIGN_EVIDENCE_VERSION,
    verifiedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    expectedContactJson: company.telegram_contact_json,
    now: now.toISOString(),
  });
  if (!created) {
    const concurrent = await store.getContactAuthorizationByIdempotency(
      input.orgId,
      idempotencyKeyDigest,
    );
    if (concurrent?.request_fingerprint === requestFingerprint) {
      return { authorization: contactAuthorizationReadModel(concurrent), replayed: true };
    }
    fail(concurrent ? 'telegram_campaign_idempotency_conflict' : 'telegram_campaign_storage_conflict');
  }
  const authorization = await store.getContactAuthorizationByIdempotency(
    input.orgId,
    idempotencyKeyDigest,
  );
  if (!authorization) fail('telegram_campaign_storage_conflict');
  return { authorization: contactAuthorizationReadModel(authorization), replayed: false };
}

async function digest(
  dataKey: string,
  purpose: string,
  value: unknown,
): Promise<string> {
  try {
    return await telegramIdentifierDigest(dataKey, purpose, JSON.stringify(value));
  } catch {
    return fail('telegram_campaign_not_configured');
  }
}

async function requireCampaignDataKeyIdentity(
  store: LeadRadarTelegramCampaignStore,
  orgId: string,
  dataKey: string,
  now: string,
): Promise<void> {
  const fingerprint = await digest(
    dataKey,
    'campaign-data-key-fingerprint-v1',
    [orgId],
  );
  const state = await store.ensureDataKeyFingerprint(orgId, fingerprint, now);
  if (state !== 'ready') fail('telegram_campaign_not_configured');
}

export async function getTelegramCampaignDataKeyIdentityState(input: {
  db: D1Database;
  orgId: string;
  dataKey: string;
}): Promise<'uninitialized' | 'ready' | 'mismatch' | 'legacy_unbound'> {
  assertOrgId(input.orgId);
  const fingerprint = await digest(
    input.dataKey,
    'campaign-data-key-fingerprint-v1',
    [input.orgId],
  );
  return new LeadRadarTelegramCampaignStore(input.db)
    .getDataKeyFingerprintState(input.orgId, fingerprint);
}

async function approvalBindings(input: {
  dataKey: string;
  orgId: string;
  accountId: string;
  searchId: string;
  audience?: AudienceScope;
  automaticRecipients: ReadonlyArray<{
    companyId: string;
    businessIdentityDigests: readonly string[];
  }>;
  template: string;
  operatorId: string;
  minIntervalSeconds: number;
  contactBasis: TelegramCampaignContactBasis;
  attachment: TelegramCampaignAttachmentReference | null;
}): Promise<{
  selectionDigest: string;
  contentDigest: string;
  operatorDigest: string;
  requestFingerprint: string;
}> {
  const [selectionDigest, contentDigest, operatorDigest] = await Promise.all([
    digest(input.dataKey, 'campaign-selection', [input.orgId, input.automaticRecipients]),
    digest(input.dataKey, 'campaign-content', [input.orgId, input.template, input.attachment]),
    digest(input.dataKey, 'campaign-operator', [input.orgId, input.operatorId]),
  ]);
  const requestFingerprint = await digest(input.dataKey, 'campaign-approval-request', [
    input.orgId,
    input.accountId,
    input.audience ?? input.searchId,
    selectionDigest,
    contentDigest,
    operatorDigest,
    input.minIntervalSeconds,
    input.contactBasis,
  ]);
  return { selectionDigest, contentDigest, operatorDigest, requestFingerprint };
}

function attachmentReference(
  value: TelegramCampaignAttachmentReference | null | undefined,
): TelegramCampaignAttachmentReference | null {
  if (value === null || value === undefined) return null;
  if (!isTelegramCampaignAttachmentReference(value)) {
    fail('telegram_campaign_invalid_input');
  }
  return { mediaId: value.mediaId, mediaDigest: value.mediaDigest };
}

export async function createTelegramUserAccountPending(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  authRequestReference: string;
  idempotencyKey: string;
  maskedLabel?: string;
  now?: Date;
}): Promise<{ account: TelegramAccountReadModel; replayed: boolean }> {
  assertOrgId(input.orgId);
  assertIdempotencyKey(input.idempotencyKey);
  if (!GATEWAY_REF_PATTERN.test(input.authRequestReference)) {
    fail('telegram_campaign_invalid_input');
  }
  const label = safeMaskedLabel(input.maskedLabel ?? 'Подключённый аккаунт');
  const now = input.now ?? new Date();
  const store = new LeadRadarTelegramCampaignStore(input.db);
  await requireCampaignDataKeyIdentity(
    store,
    input.orgId,
    input.dataKey,
    now.toISOString(),
  );
  const [authRequestDigest, requestIdempotencyDigest, requestFingerprint] = await Promise.all([
    digest(input.dataKey, 'campaign-account-auth-request', [input.orgId, input.authRequestReference]),
    digest(input.dataKey, 'campaign-account-idempotency', [input.orgId, input.idempotencyKey]),
    digest(input.dataKey, 'campaign-account-request', [input.orgId, input.authRequestReference, label]),
  ]);
  const existing = await store.findAccountByRequest(input.orgId, requestIdempotencyDigest);
  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) {
      fail('telegram_campaign_idempotency_conflict');
    }
    return { account: accountReadModel(existing), replayed: true };
  }
  const active = await store.getActiveAccount(input.orgId);
  if (active) fail('telegram_campaign_account_exists');
  const accountId = entityId('lrtgua_');
  const created = await store.createPendingAccount(input.orgId, {
    id: accountId,
    authRequestDigest,
    requestIdempotencyDigest,
    requestFingerprint,
    maskedLabel: label,
    now: now.toISOString(),
  });
  if (!created) {
    const concurrent = await store.findAccountByRequest(input.orgId, requestIdempotencyDigest);
    if (concurrent?.request_fingerprint === requestFingerprint) {
      return { account: accountReadModel(concurrent), replayed: true };
    }
    fail(active ? 'telegram_campaign_account_exists' : 'telegram_campaign_storage_conflict');
  }
  const account = await store.getAccount(input.orgId, accountId);
  if (!account) fail('telegram_campaign_storage_conflict');
  return { account: accountReadModel(account), replayed: false };
}

/**
 * Durably stages the opaque provider binding while the public account remains
 * pending. This is the first half of the cross-system finalize barrier: a
 * process crash after this write can safely retry Bridge finalization without
 * ever exposing a false-connected D1 account.
 */
export async function stageTelegramUserAccountConnection(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  accountId: string;
  gatewayAccountRef: string;
  expectedVersion: number;
  maskedLabel?: string;
  providerConnectedAt: string;
  now?: Date;
}): Promise<TelegramAccountReadModel> {
  assertOrgId(input.orgId);
  const providerConnectedAtMs = Date.parse(input.providerConnectedAt);
  if (!ACCOUNT_ID_PATTERN.test(input.accountId)
    || !GATEWAY_REF_PATTERN.test(input.gatewayAccountRef)
    || !Number.isInteger(input.expectedVersion)
    || input.expectedVersion < 0
    || input.providerConnectedAt.length < 20
    || input.providerConnectedAt.length > 64
    || !Number.isFinite(providerConnectedAtMs)) fail('telegram_campaign_invalid_input');
  const label = safeMaskedLabel(input.maskedLabel ?? 'Подключённый аккаунт');
  const now = (input.now ?? new Date()).toISOString();
  const store = new LeadRadarTelegramCampaignStore(input.db);
  await requireCampaignDataKeyIdentity(store, input.orgId, input.dataKey, now);
  const gatewayAccountRefDigest = await digest(
    input.dataKey,
    'campaign-gateway-account-ref',
    [input.orgId, input.gatewayAccountRef],
  );
  const staged = await store.stageAccountFinalization(input.orgId, {
    accountId: input.accountId,
    expectedVersion: input.expectedVersion,
    gatewayAccountRef: input.gatewayAccountRef,
    gatewayAccountRefDigest,
    maskedLabel: label,
    providerConnectedAt: input.providerConnectedAt,
    now,
  });
  if (!staged) fail('telegram_campaign_account_state_conflict');
  const account = await store.getAccount(input.orgId, input.accountId);
  if (!account || account.status !== 'pending'
    || account.state_version !== input.expectedVersion) {
    fail('telegram_campaign_account_state_conflict');
  }
  return accountReadModel(account);
}

/**
 * Commits the staged binding only after the private gateway confirms that its
 * local custody is finalized. The store requires the exact staged digest and
 * account version, so callers cannot skip the first half of the barrier.
 */
export async function completeTelegramUserAccountConnection(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  accountId: string;
  gatewayAccountRef: string;
  expectedVersion: number;
  maskedLabel?: string;
  now?: Date;
}): Promise<TelegramAccountReadModel> {
  assertOrgId(input.orgId);
  if (!ACCOUNT_ID_PATTERN.test(input.accountId)
    || !GATEWAY_REF_PATTERN.test(input.gatewayAccountRef)
    || !Number.isInteger(input.expectedVersion)
    || input.expectedVersion < 0) fail('telegram_campaign_invalid_input');
  const label = safeMaskedLabel(input.maskedLabel ?? 'Подключённый аккаунт');
  const now = (input.now ?? new Date()).toISOString();
  const store = new LeadRadarTelegramCampaignStore(input.db);
  await requireCampaignDataKeyIdentity(store, input.orgId, input.dataKey, now);
  const gatewayAccountRefDigest = await digest(
    input.dataKey,
    'campaign-gateway-account-ref',
    [input.orgId, input.gatewayAccountRef],
  );
  const connected = await store.completeAccountConnection(input.orgId, {
    accountId: input.accountId,
    expectedVersion: input.expectedVersion,
    gatewayAccountRef: input.gatewayAccountRef,
    gatewayAccountRefDigest,
    maskedLabel: label,
    now,
  });
  if (!connected) {
    const existing = await store.getAccount(input.orgId, input.accountId);
    if (!existing) fail('telegram_campaign_account_not_found');
    if (existing.status === 'connected'
      && existing.gateway_account_ref === input.gatewayAccountRef
      && existing.gateway_account_ref_digest === gatewayAccountRefDigest) {
      return accountReadModel(existing);
    }
    fail('telegram_campaign_account_state_conflict');
  }
  const account = await store.getAccount(input.orgId, input.accountId);
  if (!account) fail('telegram_campaign_account_not_found');
  return accountReadModel(account);
}

export async function getTelegramUserAccount(
  db: D1Database,
  orgId: string,
  accountId?: string,
): Promise<TelegramAccountReadModel | null> {
  assertOrgId(orgId);
  if (accountId !== undefined && !ACCOUNT_ID_PATTERN.test(accountId)) {
    fail('telegram_campaign_invalid_input');
  }
  const store = new LeadRadarTelegramCampaignStore(db);
  const account = accountId
    ? await store.getAccount(orgId, accountId)
    : await store.getActiveAccount(orgId);
  return account ? accountReadModel(account) : null;
}

/**
 * Resolves the opaque private Durable Object route held by D1 and verifies its
 * keyed digest before a health/disconnect call. The reference is server-only;
 * browser read models deliberately never expose it.
 */
export async function getTelegramUserAccountGatewayBinding(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  accountId: string;
}): Promise<{ account: TelegramAccountReadModel; gatewayAccountRef: string } | null> {
  assertOrgId(input.orgId);
  if (!ACCOUNT_ID_PATTERN.test(input.accountId)) fail('telegram_campaign_invalid_input');
  const row = await new LeadRadarTelegramCampaignStore(input.db)
    .getAccount(input.orgId, input.accountId);
  if (!row) return null;
  if (row.gateway_account_ref === null || row.gateway_account_ref_digest === null) {
    return null;
  }
  if (!GATEWAY_REF_PATTERN.test(row.gateway_account_ref)) {
    fail('telegram_campaign_account_state_conflict');
  }
  const expectedDigest = await digest(
    input.dataKey,
    'campaign-gateway-account-ref',
    [input.orgId, row.gateway_account_ref],
  );
  if (expectedDigest !== row.gateway_account_ref_digest) {
    fail('telegram_campaign_account_state_conflict');
  }
  return {
    account: accountReadModel(row),
    gatewayAccountRef: row.gateway_account_ref,
  };
}

export async function getTelegramUserAccountByAuthRequest(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  authRequestReference: string;
}): Promise<TelegramAccountReadModel | null> {
  assertOrgId(input.orgId);
  if (!GATEWAY_REF_PATTERN.test(input.authRequestReference)) {
    fail('telegram_campaign_invalid_input');
  }
  const store = new LeadRadarTelegramCampaignStore(input.db);
  await requireCampaignDataKeyIdentity(
    store,
    input.orgId,
    input.dataKey,
    new Date().toISOString(),
  );
  const authRequestDigest = await digest(
    input.dataKey,
    'campaign-account-auth-request',
    [input.orgId, input.authRequestReference],
  );
  const account = await store.findAccountByAuthRequest(input.orgId, authRequestDigest);
  return account ? accountReadModel(account) : null;
}

export async function setTelegramUserAccountStatus(input: {
  db: D1Database;
  orgId: string;
  accountId: string;
  expectedVersion: number;
  status: 'connected' | 'paused' | 'error';
  healthy?: boolean;
  now?: Date;
}): Promise<TelegramAccountReadModel> {
  assertOrgId(input.orgId);
  if (!ACCOUNT_ID_PATTERN.test(input.accountId)
    || !Number.isInteger(input.expectedVersion)
    || input.expectedVersion < 0) fail('telegram_campaign_invalid_input');
  const store = new LeadRadarTelegramCampaignStore(input.db);
  const updated = await store.updateAccountStatus(input.orgId, {
    accountId: input.accountId,
    expectedVersion: input.expectedVersion,
    status: input.status,
    now: (input.now ?? new Date()).toISOString(),
    healthy: input.healthy ?? input.status === 'connected',
  });
  if (!updated) {
    if (!await store.getAccount(input.orgId, input.accountId)) {
      fail('telegram_campaign_account_not_found');
    }
    fail('telegram_campaign_account_state_conflict');
  }
  const account = await store.getAccount(input.orgId, input.accountId);
  if (!account) fail('telegram_campaign_account_not_found');
  return accountReadModel(account);
}

export async function revokeTelegramUserAccount(input: {
  db: D1Database;
  orgId: string;
  accountId: string;
  now?: Date;
}): Promise<boolean> {
  assertOrgId(input.orgId);
  if (!ACCOUNT_ID_PATTERN.test(input.accountId)) fail('telegram_campaign_invalid_input');
  const store = new LeadRadarTelegramCampaignStore(input.db);
  const existing = await store.getAccount(input.orgId, input.accountId);
  if (!existing) fail('telegram_campaign_account_not_found');
  if (existing.status === 'revoked') return false;
  return store.revokeAccount(input.orgId, input.accountId, (input.now ?? new Date()).toISOString());
}

export interface TelegramCampaignPrepareInput {
  db: D1Database;
  dataKey: string;
  orgId: string;
  accountId: string;
  searchId: string;
  audience?: AudienceScope;
  companyIds: readonly string[];
  template: string;
  operatorId: string;
  idempotencyKey: string;
  minIntervalSeconds?: number;
  contactBasis: TelegramCampaignContactBasis;
  attachment?: TelegramCampaignAttachmentReference | null;
  now?: Date;
}

async function prepareTelegramCampaignInternal(
  input: TelegramCampaignPrepareInput,
  replayOnly: boolean,
): Promise<TelegramCampaignPrepareResult | null> {
  assertOrgId(input.orgId);
  if (!ACCOUNT_ID_PATTERN.test(input.accountId) || !ENTITY_ID_PATTERN.test(input.searchId)) {
    fail('telegram_campaign_invalid_input');
  }
  assertIdempotencyKey(input.idempotencyKey);
  if (input.audience) {
    await requireAudienceSchema(input.db);
    if (await new AudienceStore(input.db).resolveScope(input.orgId,input.audience,input.companyIds) !== input.searchId) fail('telegram_campaign_invalid_input');
  }
  const template = boundedTemplate(input.template);
  const attachment = attachmentReference(input.attachment);
  const operatorId = assertOperator(input.operatorId);
  const minIntervalSeconds = intervalSeconds(input.minIntervalSeconds);
  if (!isTelegramCampaignContactBasis(input.contactBasis)) {
    fail('telegram_campaign_invalid_input');
  }
  const now = input.now ?? new Date();
  const store = new LeadRadarTelegramCampaignStore(input.db);
  const selection = await evaluateSelectionInternal({
    db: input.db,
    orgId: input.orgId,
    companyIds: input.companyIds,
    now,
    dataKey: input.dataKey,
    contactBasis: input.contactBasis,
    includeBridgeVerification: true,
  });
  if (selection.automatic === 0) fail('telegram_campaign_eligibility_required');
  if (attachment) {
    for (const recipient of selection.verifiedRecipients) {
      renderedTemplate(template, recipient.name, MAX_MEDIA_CAPTION_UTF16_UNITS);
    }
  }
  const bindings = await approvalBindings({
    dataKey: input.dataKey,
    orgId: input.orgId,
    accountId: input.accountId,
    searchId: input.searchId,
    audience: input.audience,
    automaticRecipients: selection.verifiedRecipients.map((recipient) => ({
      companyId: recipient.companyId,
      businessIdentityDigests: recipient.businessIdentities.map((identity) => identity.digest),
    })),
    template,
    operatorId,
    minIntervalSeconds,
    contactBasis: input.contactBasis,
    attachment,
  });
  const [tokenMaterial, idempotencyKeyDigest] = await Promise.all([
    digest(input.dataKey, 'campaign-approval-token-material', [input.orgId, input.idempotencyKey]),
    digest(input.dataKey, 'campaign-approval-idempotency', [input.orgId, input.idempotencyKey]),
  ]);
  const approvalToken = `lrtgca_${hexDigestToBase64Url(tokenMaterial)}`;
  const tokenDigest = await digest(input.dataKey, 'campaign-approval-token', [
    input.orgId,
    approvalToken,
  ]);
  const existing = await store.getApprovalByIdempotency(input.orgId, idempotencyKeyDigest);
  if (existing) {
    if (existing.request_fingerprint !== bindings.requestFingerprint) {
      fail('telegram_campaign_idempotency_conflict');
    }
    if (existing.consumed_at !== null || existing.expires_at <= now.toISOString()) {
      fail('telegram_campaign_approval_expired_or_used');
    }
    return {
      approvalToken,
      expiresAt: existing.expires_at,
      selectionDigest: existing.selection_digest,
      contentDigest: existing.content_digest,
      recipientCount: existing.recipient_count,
      selection: publicSelection(selection),
      attachment,
    };
  }
  if (replayOnly) return null;
  // Account/safety/activity are live mutation gates. They intentionally run
  // after the exact idempotency lookup so a committed preparation remains
  // replayable even if the account becomes unavailable immediately after the
  // first response was persisted.
  const account = await store.getAccount(input.orgId, input.accountId);
  if (!account) fail('telegram_campaign_account_not_found');
  if (account.status !== 'connected' || account.gateway_account_ref === null) {
    fail('telegram_campaign_account_not_connected');
  }
  const accountSafety = await store.getAccountSafety(input.orgId, input.accountId);
  if (accountSafety && accountSafety.state !== 'ready') {
    fail('telegram_campaign_account_not_connected');
  }
  if (await store.getActiveCampaignForAccount(input.orgId, input.accountId)) {
    fail('telegram_campaign_active_exists');
  }
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS).toISOString();
  const created = await store.createApproval(input.orgId, {
    id: entityId('lrtgap_'),
    accountId: input.accountId,
    tokenDigest,
    idempotencyKeyDigest,
    selectionDigest: bindings.selectionDigest,
    contentDigest: bindings.contentDigest,
    requestFingerprint: bindings.requestFingerprint,
    operatorDigest: bindings.operatorDigest,
    contactBasis: input.contactBasis,
    recipientCount: selection.automatic,
    expiresAt,
    now: now.toISOString(),
    attachment,
  });
  if (!created) {
    const concurrent = await store.getApprovalByIdempotency(input.orgId, idempotencyKeyDigest);
    if (concurrent?.request_fingerprint === bindings.requestFingerprint
      && concurrent.consumed_at === null
      && concurrent.expires_at > now.toISOString()) {
      return {
        approvalToken,
        expiresAt: concurrent.expires_at,
        selectionDigest: concurrent.selection_digest,
        contentDigest: concurrent.content_digest,
        recipientCount: concurrent.recipient_count,
        selection: publicSelection(selection),
        attachment,
      };
    }
    if (attachment && !await store.isCampaignMediaActive(
      input.orgId,
      attachment.mediaId,
      attachment.mediaDigest,
      now.toISOString(),
    )) {
      fail('telegram_campaign_storage_conflict');
    }
    fail(concurrent ? 'telegram_campaign_idempotency_conflict' : 'telegram_campaign_account_not_connected');
  }
  return {
    approvalToken,
    expiresAt,
    selectionDigest: bindings.selectionDigest,
    contentDigest: bindings.contentDigest,
    recipientCount: selection.automatic,
    selection: publicSelection(selection),
    attachment,
  };
}

/** Returns only an already-committed exact preparation; never creates one. */
export async function getTelegramCampaignPreparationReplay(
  input: TelegramCampaignPrepareInput,
): Promise<TelegramCampaignPrepareResult | null> {
  return prepareTelegramCampaignInternal(input, true);
}

export async function prepareTelegramCampaign(
  input: TelegramCampaignPrepareInput,
): Promise<TelegramCampaignPrepareResult> {
  const prepared = await prepareTelegramCampaignInternal(input, false);
  if (!prepared) fail('telegram_campaign_storage_conflict');
  return prepared;
}

export async function createApprovedTelegramCampaign(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  accountId: string;
  searchId: string;
  audience?: AudienceScope;
  companyIds: readonly string[];
  template: string;
  operatorId: string;
  approvalToken: string;
  expectedSelectionDigest: string;
  expectedContentDigest: string;
  idempotencyKey: string;
  minIntervalSeconds?: number;
  contactBasis: TelegramCampaignContactBasis;
  attachment?: TelegramCampaignAttachmentReference | null;
  now?: Date;
}): Promise<{
  campaign: TelegramCampaignReadModel;
  selection: TelegramCampaignSelectionEvaluation;
  replayed: boolean;
}> {
  assertOrgId(input.orgId);
  if (!ACCOUNT_ID_PATTERN.test(input.accountId)
    || !ENTITY_ID_PATTERN.test(input.searchId)
    || !APPROVAL_TOKEN_PATTERN.test(input.approvalToken)
    || !/^[0-9a-f]{64}$/u.test(input.expectedSelectionDigest)
    || !/^[0-9a-f]{64}$/u.test(input.expectedContentDigest)) {
    fail('telegram_campaign_invalid_input');
  }
  assertIdempotencyKey(input.idempotencyKey);
  if (input.audience) {
    await requireAudienceSchema(input.db);
    if (await new AudienceStore(input.db).resolveScope(input.orgId,input.audience,input.companyIds) !== input.searchId) fail('telegram_campaign_invalid_input');
  }
  const template = boundedTemplate(input.template);
  const attachment = attachmentReference(input.attachment);
  const operatorId = assertOperator(input.operatorId);
  const minIntervalSeconds = intervalSeconds(input.minIntervalSeconds);
  if (!isTelegramCampaignContactBasis(input.contactBasis)) {
    fail('telegram_campaign_invalid_input');
  }
  const now = input.now ?? new Date();
  const selection = await evaluateSelectionInternal({
    db: input.db,
    orgId: input.orgId,
    companyIds: input.companyIds,
    now,
    dataKey: input.dataKey,
    contactBasis: input.contactBasis,
    includeBridgeVerification: true,
  });
  if (selection.automatic === 0) fail('telegram_campaign_eligibility_required');
  if (attachment) {
    for (const recipient of selection.verifiedRecipients) {
      renderedTemplate(template, recipient.name, MAX_MEDIA_CAPTION_UTF16_UNITS);
    }
  }
  const bindings = await approvalBindings({
    dataKey: input.dataKey,
    orgId: input.orgId,
    accountId: input.accountId,
    searchId: input.searchId,
    audience: input.audience,
    automaticRecipients: selection.verifiedRecipients.map((recipient) => ({
      companyId: recipient.companyId,
      businessIdentityDigests: recipient.businessIdentities.map((identity) => identity.digest),
    })),
    template,
    operatorId,
    minIntervalSeconds,
    contactBasis: input.contactBasis,
    attachment,
  });
  const [approvalTokenDigest, idempotencyKeyDigest] = await Promise.all([
    digest(input.dataKey, 'campaign-approval-token', [input.orgId, input.approvalToken]),
    digest(input.dataKey, 'campaign-idempotency', [input.orgId, input.idempotencyKey]),
  ]);
  if (bindings.selectionDigest !== input.expectedSelectionDigest
    || bindings.contentDigest !== input.expectedContentDigest) {
    fail('telegram_campaign_approval_required');
  }
  const store = new LeadRadarTelegramCampaignStore(input.db);
  const previous = await store.findCampaignByIdempotency(input.orgId, idempotencyKeyDigest);
  const selectionReadModel = publicSelection(selection);
  if (previous) {
    if (previous.request_fingerprint !== bindings.requestFingerprint
      || previous.attachment_id !== (attachment?.mediaId ?? null)
      || previous.attachment_digest !== (attachment?.mediaDigest ?? null)) {
      fail('telegram_campaign_idempotency_conflict');
    }
    return {
      campaign: await campaignModel(store, input.orgId, previous, now),
      selection: selectionReadModel,
      replayed: true,
    };
  }
  const activeCampaign = await store.getActiveCampaignForAccount(input.orgId, input.accountId);
  if (activeCampaign) fail('telegram_campaign_active_exists');
  const approval = await store.getApprovalByToken(input.orgId, approvalTokenDigest);
  if (!approval) fail('telegram_campaign_approval_required');
  if (approval.consumed_at !== null || approval.expires_at <= now.toISOString()) {
    fail('telegram_campaign_approval_expired_or_used');
  }
  if (approval.account_id !== input.accountId
    || approval.selection_digest !== bindings.selectionDigest
    || approval.content_digest !== bindings.contentDigest
    || approval.operator_digest !== bindings.operatorDigest
    || approval.contact_basis !== input.contactBasis
    || approval.attachment_id !== (attachment?.mediaId ?? null)
    || approval.attachment_digest !== (attachment?.mediaDigest ?? null)
    || approval.request_fingerprint !== bindings.requestFingerprint
    || approval.recipient_count !== selection.automatic) {
    fail('telegram_campaign_approval_required');
  }
  const campaignId = entityId('lrtgcp_');
  let templateEncrypted;
  try {
    templateEncrypted = await encryptTelegramCampaignSecret(
      input.dataKey,
      `${input.orgId}:${campaignId}:template`,
      template,
      MAX_TEMPLATE_BYTES,
    );
  } catch {
    fail('telegram_campaign_not_configured');
  }
  const recipients = await Promise.all(selection.verifiedRecipients.map(async (recipient, index) => {
    const recipientId = entityId('lrtgcr_');
    const rendered = renderedTemplate(
      template,
      recipient.name,
      attachment ? MAX_MEDIA_CAPTION_UTF16_UNITS : MAX_TEMPLATE_UTF16_UNITS,
    );
    const [
      endpointEncrypted,
      payloadEncrypted,
      endpointDigest,
      renderedContentDigest,
      contactFingerprint,
    ] = await Promise.all([
      encryptTelegramCampaignSecret(
        input.dataKey,
        `${input.orgId}:${campaignId}:${recipientId}:endpoint`,
        recipient.username,
        64,
      ),
      encryptTelegramCampaignSecret(
        input.dataKey,
        `${input.orgId}:${campaignId}:${recipientId}:payload`,
        rendered,
        MAX_TEMPLATE_BYTES,
      ),
      digest(input.dataKey, 'campaign-endpoint', [input.orgId, recipient.username]),
      digest(input.dataKey, 'campaign-rendered-content', [
        input.orgId,
        recipient.companyId,
        rendered,
      ]),
      digest(input.dataKey, 'campaign-contact-snapshot', [
        input.orgId,
        recipient.companyId,
        recipient.contactJson,
      ]),
    ]);
    const effectId = entityId('lrtgce_');
    const [effectKeyDigest, payloadDigest] = await Promise.all([
      digest(input.dataKey, 'campaign-effect-key', [input.orgId, campaignId, recipientId]),
      digest(input.dataKey, 'campaign-effect-payload', [
        input.orgId,
        campaignId,
        recipientId,
        renderedContentDigest,
        endpointDigest,
        attachment,
      ]),
    ]);
    return {
      id: recipientId,
      companyId: recipient.companyId,
      sequenceNo: index + 1,
      endpointCiphertext: endpointEncrypted.ciphertext,
      endpointIv: endpointEncrypted.iv,
      endpointDigest,
      payloadCiphertext: payloadEncrypted.ciphertext,
      payloadIv: payloadEncrypted.iv,
      renderedContentDigest,
      contactFingerprint,
      businessIdentities: recipient.businessIdentities,
      expectedContactJson: recipient.contactJson,
      effectId,
      effectKeyDigest,
      payloadDigest,
      eligibilityAuthorizationId: recipient.authorization.id,
      eligibilityEvidenceDigest: recipient.authorization.evidence_reference_digest,
      eligibilityReviewerDigest: recipient.authorization.reviewer_digest,
      eligibilityEvidenceVersion: recipient.authorization.evidence_version,
      eligibilityVerifiedAt: recipient.authorization.verified_at,
      eligibilityExpiresAt: recipient.authorization.expires_at,
    };
  }));
  const created = await store.createApprovedCampaign(input.orgId, {
    id: campaignId,
    accountId: input.accountId,
    approval,
    idempotencyKeyDigest,
    requestFingerprint: bindings.requestFingerprint,
    selectionDigest: bindings.selectionDigest,
    contentDigest: bindings.contentDigest,
    operatorDigest: bindings.operatorDigest,
    contactBasis: input.contactBasis,
    searchId: input.searchId,
    audience: input.audience,
    audienceCompanyIds: [...input.companyIds].sort(),
    templateCiphertext: templateEncrypted.ciphertext,
    templateIv: templateEncrypted.iv,
    minIntervalSeconds,
    now: now.toISOString(),
    recipients,
  });
  if (!created) {
    const concurrent = await store.findCampaignByIdempotency(input.orgId, idempotencyKeyDigest);
    if (concurrent) {
      if (concurrent.request_fingerprint !== bindings.requestFingerprint
        || concurrent.attachment_id !== (attachment?.mediaId ?? null)
        || concurrent.attachment_digest !== (attachment?.mediaDigest ?? null)) {
        fail('telegram_campaign_idempotency_conflict');
      }
      return {
        campaign: await campaignModel(store, input.orgId, concurrent, now),
        selection: selectionReadModel,
        replayed: true,
      };
    }
    if (await store.getActiveCampaignForAccount(input.orgId, input.accountId)) {
      fail('telegram_campaign_active_exists');
    }
    if (attachment && !await store.isCampaignMediaActive(
      input.orgId,
      attachment.mediaId,
      attachment.mediaDigest,
      now.toISOString(),
    )) {
      fail('telegram_campaign_storage_conflict');
    }
    const freshApproval = await store.getApprovalByToken(input.orgId, approvalTokenDigest);
    if (freshApproval?.consumed_at !== null) fail('telegram_campaign_approval_expired_or_used');
    fail('telegram_campaign_storage_conflict');
  }
  const campaign = await store.getCampaign(input.orgId, campaignId);
  if (!campaign) fail('telegram_campaign_storage_conflict');
  return {
    campaign: await campaignModel(store, input.orgId, campaign, now),
    selection: selectionReadModel,
    replayed: false,
  };
}

export async function getTelegramCampaign(
  db: D1Database,
  orgId: string,
  campaignId: string,
): Promise<TelegramCampaignReadModel | null> {
  assertOrgId(orgId);
  if (!CAMPAIGN_ID_PATTERN.test(campaignId)) fail('telegram_campaign_invalid_input');
  const store = new LeadRadarTelegramCampaignStore(db);
  const row = await store.getCampaign(orgId, campaignId);
  return row ? campaignModel(store, orgId, row, new Date()) : null;
}

export async function getTelegramCampaignRecovery(input: {
  db: D1Database;
  orgId: string;
  searchId?: string;
  audienceId?: string;
  now?: Date;
}): Promise<{
  active: TelegramCampaignReadModel | null;
  latest: TelegramCampaignReadModel | null;
}> {
  assertOrgId(input.orgId);
  if ((!input.searchId === !input.audienceId)
    || !ENTITY_ID_PATTERN.test(input.searchId ?? input.audienceId ?? '')) fail('telegram_campaign_invalid_input');
  if (input.audienceId) await requireAudienceSchema(input.db);
  const store = new LeadRadarTelegramCampaignStore(input.db);
  const rows = await store.getCampaignRecovery(input.orgId, input.searchId ?? null, input.audienceId);
  const now = input.now ?? new Date();
  return {
    active: rows.active ? await campaignModel(store, input.orgId, rows.active, now) : null,
    latest: rows.latest ? await campaignModel(store, input.orgId, rows.latest, now) : null,
  };
}

export interface TelegramCampaignTransitionInput {
  db: D1Database;
  dataKey: string;
  orgId: string;
  campaignId: string;
  action: 'start' | 'pause' | 'resume' | 'stop';
  operatorId: string;
  idempotencyKey: string;
  now?: Date;
}

async function telegramCampaignTransitionContext(input: TelegramCampaignTransitionInput): Promise<{
  store: LeadRadarTelegramCampaignStore;
  now: Date;
  operationDigest: string;
  operatorDigest: string;
  requestFingerprint: string;
}> {
  assertOrgId(input.orgId);
  if (!CAMPAIGN_ID_PATTERN.test(input.campaignId)) fail('telegram_campaign_invalid_input');
  assertIdempotencyKey(input.idempotencyKey);
  const operatorId = assertOperator(input.operatorId);
  const now = input.now ?? new Date();
  const store = new LeadRadarTelegramCampaignStore(input.db);
  await requireCampaignDataKeyIdentity(
    store,
    input.orgId,
    input.dataKey,
    now.toISOString(),
  );
  const [operationDigest, operatorDigest, requestFingerprint] = await Promise.all([
    digest(input.dataKey, 'campaign-operation-idempotency', [input.orgId, input.idempotencyKey]),
    digest(input.dataKey, 'campaign-operator', [input.orgId, operatorId]),
    digest(input.dataKey, 'campaign-operation-request', [
      input.orgId,
      input.campaignId,
      input.action,
      operatorId,
    ]),
  ]);
  return { store, now, operationDigest, operatorDigest, requestFingerprint };
}

/** Returns only an exact committed transition; never applies a transition. */
export async function getTelegramCampaignTransitionReplay(
  input: TelegramCampaignTransitionInput,
): Promise<{ campaign: TelegramCampaignReadModel; replayed: true } | null> {
  const {
    store,
    now,
    operationDigest,
    requestFingerprint,
  } = await telegramCampaignTransitionContext(input);
  const replay = await store.findOperation(input.orgId, operationDigest);
  if (!replay) return null;
  if (replay.campaign_id !== input.campaignId
    || replay.action !== input.action
    || replay.request_fingerprint !== requestFingerprint) {
    fail('telegram_campaign_idempotency_conflict');
  }
  const campaign = await store.getCampaign(input.orgId, input.campaignId);
  if (!campaign) fail('telegram_campaign_campaign_not_found');
  return { campaign: await campaignModel(store, input.orgId, campaign, now), replayed: true };
}

export async function transitionTelegramCampaign(
  input: TelegramCampaignTransitionInput,
): Promise<{ campaign: TelegramCampaignReadModel; replayed: boolean }> {
  const {
    store,
    now,
    operationDigest,
    operatorDigest,
    requestFingerprint,
  } = await telegramCampaignTransitionContext(input);
  const replay = await store.findOperation(input.orgId, operationDigest);
  if (replay) {
    if (replay.campaign_id !== input.campaignId
      || replay.action !== input.action
      || replay.request_fingerprint !== requestFingerprint) {
      fail('telegram_campaign_idempotency_conflict');
    }
    const campaign = await store.getCampaign(input.orgId, input.campaignId);
    if (!campaign) fail('telegram_campaign_campaign_not_found');
    return { campaign: await campaignModel(store, input.orgId, campaign, now), replayed: true };
  }
  if (input.action === 'resume') {
    const candidate = await store.getCampaign(input.orgId, input.campaignId);
    if (!candidate) fail('telegram_campaign_campaign_not_found');
    await store.clearExpiredAccountCooldown(
      input.orgId,
      candidate.account_id,
      now.toISOString(),
    );
    const refreshed = await store.getCampaign(input.orgId, input.campaignId);
    if (!refreshed) fail('telegram_campaign_campaign_not_found');
    const resumability = await campaignModel(store, input.orgId, refreshed, now);
    if (resumability.status === 'paused'
      && !resumability.canResume
      && resumability.resumeBlockedReason !== null) {
      fail(resumeBlockedError(resumability.resumeBlockedReason));
    }
  }
  const applied = await store.applyTransition(input.orgId, {
    operationId: entityId('lrtgop_'),
    campaignId: input.campaignId,
    operationDigest,
    requestFingerprint,
    operatorDigest,
    action: input.action,
    errorCode: null,
    now: now.toISOString(),
  });
  if (!applied) {
    const concurrent = await store.findOperation(input.orgId, operationDigest);
    if (concurrent?.campaign_id === input.campaignId
      && concurrent.action === input.action
      && concurrent.request_fingerprint === requestFingerprint) {
      const campaign = await store.getCampaign(input.orgId, input.campaignId);
      if (!campaign) fail('telegram_campaign_campaign_not_found');
      return { campaign: await campaignModel(store, input.orgId, campaign, now), replayed: true };
    }
    if (!await store.getCampaign(input.orgId, input.campaignId)) {
      fail('telegram_campaign_campaign_not_found');
    }
    fail('telegram_campaign_transition_invalid');
  }
  const campaign = await store.getCampaign(input.orgId, input.campaignId);
  if (!campaign) fail('telegram_campaign_campaign_not_found');
  return { campaign: await campaignModel(store, input.orgId, campaign, now), replayed: false };
}

export async function claimNextTelegramCampaignRecipient(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  campaignId: string;
  now?: Date;
}): Promise<TelegramCampaignClaim | null> {
  assertOrgId(input.orgId);
  if (!CAMPAIGN_ID_PATTERN.test(input.campaignId)) fail('telegram_campaign_invalid_input');
  const now = input.now ?? new Date();
  const store = new LeadRadarTelegramCampaignStore(input.db);
  await requireCampaignDataKeyIdentity(
    store,
    input.orgId,
    input.dataKey,
    now.toISOString(),
  );
  const claimToken = `lrtg_claim_${randomBase64Url(24)}`;
  const claimDigest = await digest(
    input.dataKey,
    'campaign-claim',
    [input.orgId, input.campaignId, claimToken],
  );
  const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS).toISOString();
  const recipient = await store.claimNextRecipient(
    input.orgId,
    {
      campaignId: input.campaignId,
      claimDigest,
      now: now.toISOString(),
      leaseExpiresAt,
    },
  );
  return recipient ? {
    campaignId: input.campaignId,
    recipientId: recipient.id,
    claimToken,
    leaseExpiresAt,
  } : null;
}

function contactUsername(contactJson: string): string | null {
  const contact = parseContact(contactJson);
  return telegramContactEndpoint(contact);
}

function safeProviderErrorCode(value: string): string {
  return /^[a-z][a-z0-9_]{2,79}$/u.test(value) ? value : 'provider_rejected';
}

export async function dispatchClaimedTelegramCampaignRecipient(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  claim: TelegramCampaignClaim;
  sender: TelegramCampaignSender;
  mediaReader?: TelegramCampaignMediaReader;
  dailyLimit?: number;
  minimumIntervalSeconds?: number;
  now?: Date;
}): Promise<{
  status: 'sent' | 'failed' | 'ambiguous' | 'skipped_dnc' | 'skipped_stale' | 'paused';
  campaign: TelegramCampaignReadModel;
}> {
  assertOrgId(input.orgId);
  if (!CAMPAIGN_ID_PATTERN.test(input.claim.campaignId)
    || !/^lrtgcr_[0-9a-f]{32}$/u.test(input.claim.recipientId)
    || !/^lrtg_claim_[A-Za-z0-9_-]{32}$/u.test(input.claim.claimToken)) {
    fail('telegram_campaign_invalid_input');
  }
  const now = input.now ?? new Date();
  const campaignDailyLimit = dailyLimit(input.dailyLimit);
  const nowIso = now.toISOString();
  const store = new LeadRadarTelegramCampaignStore(input.db);
  await requireCampaignDataKeyIdentity(store, input.orgId, input.dataKey, nowIso);
  const claimDigest = await digest(input.dataKey, 'campaign-claim', [
    input.orgId,
    input.claim.campaignId,
    input.claim.claimToken,
  ]);
  const context = await store.getDispatchContext(input.orgId, {
    campaignId: input.claim.campaignId,
    recipientId: input.claim.recipientId,
    claimDigest,
  });
  if (!context) fail('telegram_campaign_claim_invalid');

  const finish = async (
    status: 'sent' | 'failed' | 'ambiguous' | 'skipped_dnc' | 'skipped_stale' | 'paused',
  ) => {
    const campaign = await store.getCampaign(input.orgId, input.claim.campaignId);
    if (!campaign) fail('telegram_campaign_campaign_not_found');
    return { status, campaign: await campaignModel(store, input.orgId, campaign, now) };
  };

  if (context.company_suppressed === 1 || context.company_lifecycle === 'do_not_contact') {
    await store.markRecipientSkipped(input.orgId, {
      campaignId: input.claim.campaignId,
      recipientId: input.claim.recipientId,
      claimDigest,
      status: 'skipped_dnc',
      errorCode: 'do_not_contact',
      now: nowIso,
    });
    return finish('skipped_dnc');
  }
  if (context.account_status !== 'connected' || context.gateway_account_ref === null) {
    await store.releaseClaimBeforeDispatch(input.orgId, {
      campaignId: input.claim.campaignId,
      recipientId: input.claim.recipientId,
      claimDigest,
      now: nowIso,
    });
    await store.pauseCampaignSystem(input.orgId, {
      campaignId: input.claim.campaignId,
      reason: 'account_restricted',
      errorCode: 'account_not_connected',
      nextSendAt: nowIso,
      now: nowIso,
    });
    return finish('paused');
  }
  const currentContact = parseContact(context.company_telegram_contact_json);
  const currentUsername = contactUsername(context.company_telegram_contact_json);
  const verifiedLink = currentContact && currentUsername
    ? await buildVerifiedTelegramCorporateDraftLink({
      db: input.db,
      orgId: input.orgId,
      companyId: context.company_id,
      website: context.company_website,
      contact: currentContact,
      draft: 'verification',
      now,
    })
    : null;
  const [currentEndpointDigest, currentContactFingerprint] = currentUsername
    ? await Promise.all([
      digest(input.dataKey, 'campaign-endpoint', [input.orgId, currentUsername]),
      digest(input.dataKey, 'campaign-contact-snapshot', [
        input.orgId,
        context.company_id,
        context.company_telegram_contact_json,
      ]),
    ])
    : [null, null];
  const frozenBusinessIdentityDigests = parseFrozenBusinessIdentityDigests(
    context.business_identity_digests_json,
  );
  let currentBusinessIdentityDigests: string[] | null = null;
  try {
    currentBusinessIdentityDigests = (await frozenBusinessIdentities(
      input.dataKey,
      input.orgId,
      {
        id: context.company_id,
        name: '',
        canonical_key: context.company_canonical_key,
        website: context.company_website,
        domain: context.company_domain,
        phone_digits: context.company_phone_digits,
        verified_website: Number(context.company_verified_website),
        verified_phone: Number(context.company_verified_phone),
        telegram_contact_json: context.company_telegram_contact_json,
        suppressed: context.company_suppressed,
        lifecycle: context.company_lifecycle,
      },
    )).map((identity) => identity.digest).sort();
  } catch {
    currentBusinessIdentityDigests = null;
  }
  const businessIdentityStale = frozenBusinessIdentityDigests === null
    || currentBusinessIdentityDigests === null
    || frozenBusinessIdentityDigests.length !== currentBusinessIdentityDigests.length
    || frozenBusinessIdentityDigests.some(
      (identity, index) => identity !== currentBusinessIdentityDigests?.[index],
    );
  const currentAuthorization = currentEndpointDigest
    ? await store.getActiveContactAuthorization(input.orgId, {
      companyId: context.company_id,
      endpointDigest: currentEndpointDigest,
      contactBasis: context.eligibility_contact_basis,
      now: nowIso,
    })
    : null;
  if (!verifiedLink
    || currentEndpointDigest !== context.endpoint_digest
    || currentContactFingerprint !== context.contact_fingerprint
    || businessIdentityStale
    || context.eligibility_contact_basis !== context.campaign_contact_basis
    || context.eligibility_evidence_version !== TELEGRAM_CAMPAIGN_EVIDENCE_VERSION
    || context.eligibility_verified_at > nowIso
    || context.eligibility_expires_at <= nowIso
    || currentAuthorization?.id !== context.eligibility_authorization_id
    || currentAuthorization.evidence_reference_digest !== context.eligibility_evidence_digest
    || currentAuthorization.reviewer_digest !== context.eligibility_reviewer_digest
    || currentAuthorization.evidence_version !== context.eligibility_evidence_version
    || currentAuthorization.verified_at !== context.eligibility_verified_at
    || currentAuthorization.expires_at !== context.eligibility_expires_at) {
    await store.markRecipientSkipped(input.orgId, {
      campaignId: input.claim.campaignId,
      recipientId: input.claim.recipientId,
      claimDigest,
      status: 'skipped_stale',
      errorCode: businessIdentityStale
        ? 'business_identity_stale'
        : currentContactFingerprint === context.contact_fingerprint
          ? 'eligibility_expired_or_changed'
          : 'endpoint_stale',
      now: nowIso,
    });
    return finish('skipped_stale');
  }

  let username: string;
  let text: string;
  try {
    [username, text] = await Promise.all([
      decryptTelegramCampaignSecret(
        input.dataKey,
        `${input.orgId}:${input.claim.campaignId}:${input.claim.recipientId}:endpoint`,
        { ciphertext: context.endpoint_ciphertext, iv: context.endpoint_iv },
        64,
      ),
      decryptTelegramCampaignSecret(
        input.dataKey,
        `${input.orgId}:${input.claim.campaignId}:${input.claim.recipientId}:payload`,
        {
          ciphertext: context.payload_ciphertext,
          iv: context.payload_iv,
        },
        MAX_TEMPLATE_BYTES,
      ),
    ]);
  } catch {
    await store.releaseClaimBeforeDispatch(input.orgId, {
      campaignId: input.claim.campaignId,
      recipientId: input.claim.recipientId,
      claimDigest,
      now: nowIso,
    });
    await store.pauseCampaignSystem(input.orgId, {
      campaignId: input.claim.campaignId,
      reason: 'provider_error',
      errorCode: 'campaign_secret_invalid',
      nextSendAt: nowIso,
      now: nowIso,
      accountSafetyReason: 'provider_error',
    });
    return finish('paused');
  }
  const attachment = context.campaign_attachment_id && context.campaign_attachment_digest
    ? {
      mediaId: context.campaign_attachment_id,
      mediaDigest: context.campaign_attachment_digest,
    }
    : null;
  let media: TelegramCampaignResolvedMedia | null = null;
  if (attachment) {
    if (!input.mediaReader) {
      await store.releaseClaimBeforeDispatch(input.orgId, {
        campaignId: input.claim.campaignId,
        recipientId: input.claim.recipientId,
        claimDigest,
        now: nowIso,
      });
      await store.pauseCampaignSystem(input.orgId, {
        campaignId: input.claim.campaignId,
        reason: 'provider_error',
        errorCode: 'campaign_media_unavailable',
        nextSendAt: nowIso,
        now: nowIso,
        accountSafetyReason: 'provider_error',
      });
      return finish('paused');
    }
    try {
      media = await input.mediaReader.read(input.orgId, attachment);
    } catch {
      await store.releaseClaimBeforeDispatch(input.orgId, {
        campaignId: input.claim.campaignId,
        recipientId: input.claim.recipientId,
        claimDigest,
        now: nowIso,
      });
      await store.pauseCampaignSystem(input.orgId, {
        campaignId: input.claim.campaignId,
        reason: 'provider_error',
        errorCode: 'campaign_media_unavailable',
        nextSendAt: nowIso,
        now: nowIso,
        accountSafetyReason: 'provider_error',
      });
      return finish('paused');
    }
  }
  const [decryptedEndpointDigest, decryptedContentDigest, effectPayloadDigest] = await Promise.all([
    digest(input.dataKey, 'campaign-endpoint', [input.orgId, username.toLowerCase()]),
    digest(input.dataKey, 'campaign-rendered-content', [
      input.orgId,
      context.company_id,
      text,
    ]),
    digest(input.dataKey, 'campaign-effect-payload', [
      input.orgId,
      input.claim.campaignId,
      input.claim.recipientId,
      context.rendered_content_digest,
      context.endpoint_digest,
      attachment,
    ]),
  ]);
  if (decryptedEndpointDigest !== context.endpoint_digest
    || decryptedContentDigest !== context.rendered_content_digest
    || effectPayloadDigest !== context.effect_payload_digest) {
    await store.releaseClaimBeforeDispatch(input.orgId, {
      campaignId: input.claim.campaignId,
      recipientId: input.claim.recipientId,
      claimDigest,
      now: nowIso,
    });
    await store.pauseCampaignSystem(input.orgId, {
      campaignId: input.claim.campaignId,
      reason: 'provider_error',
      errorCode: 'campaign_secret_digest_mismatch',
      nextSendAt: nowIso,
      now: nowIso,
      accountSafetyReason: 'provider_error',
    });
    return finish('paused');
  }
  const effectiveIntervalSeconds = Math.max(
    context.min_interval_seconds,
    input.minimumIntervalSeconds === undefined
      ? context.min_interval_seconds
      : intervalSeconds(input.minimumIntervalSeconds),
  );
  const nextAccountDispatchAt = new Date(
    now.getTime() + effectiveIntervalSeconds * 1_000,
  ).toISOString();
  const began = await store.beginDispatch(input.orgId, {
    campaignId: input.claim.campaignId,
    recipientId: input.claim.recipientId,
    companyId: context.company_id,
    endpointDigest: context.endpoint_digest,
    businessIdentityDigests: frozenBusinessIdentityDigests,
    effectId: context.effect_id,
    claimDigest,
    expectedContactJson: context.company_telegram_contact_json,
    quotaDay: nowIso.slice(0, 10),
    dailyLimit: campaignDailyLimit,
    nextAccountDispatchAt,
    now: nowIso,
  });
  if (began === 'quota_exhausted') {
    await store.releaseClaimBeforeDispatch(input.orgId, {
      campaignId: input.claim.campaignId,
      recipientId: input.claim.recipientId,
      claimDigest,
      now: nowIso,
    });
    const resumeAt = nextUtcDay(now);
    await store.pauseCampaignSystem(input.orgId, {
      campaignId: input.claim.campaignId,
      reason: 'cooldown',
      errorCode: 'daily_limit_exhausted',
      nextSendAt: resumeAt,
      now: nowIso,
      accountSafetyReason: 'daily_limit',
    });
    return finish('paused');
  }
  if (began === 'contact_already_sent' || began === 'contact_delivery_uncertain') {
    await store.markRecipientSkipped(input.orgId, {
      campaignId: input.claim.campaignId,
      recipientId: input.claim.recipientId,
      claimDigest,
      status: 'skipped_stale',
      errorCode: began === 'contact_already_sent'
        ? 'already_contacted'
        : 'previous_delivery_uncertain',
      now: nowIso,
    });
    return finish('skipped_stale');
  }
  if (began !== 'started') {
    const latestCompany = (await store.findCompanies(input.orgId, [context.company_id]))[0];
    const dnc = !latestCompany
      || latestCompany.suppressed === 1
      || latestCompany.lifecycle === 'do_not_contact';
    if (dnc) {
      await store.markRecipientSkipped(input.orgId, {
        campaignId: input.claim.campaignId,
        recipientId: input.claim.recipientId,
        claimDigest,
        status: 'skipped_dnc',
        errorCode: 'do_not_contact',
        now: nowIso,
      });
      return finish('skipped_dnc');
    }
    fail('telegram_campaign_claim_invalid');
  }

  // Close the last practical DNC race after the durable effect reservation
  // and immediately before crossing the provider boundary. If suppression
  // arrived in that window, cancel the effect and release the quota/lease.
  const beforeProvider = (await store.findCompanies(input.orgId, [context.company_id]))[0];
  if (!beforeProvider
    || beforeProvider.suppressed === 1
    || beforeProvider.lifecycle === 'do_not_contact') {
    await store.cancelDispatchBeforeProvider(input.orgId, {
      campaignId: input.claim.campaignId,
      recipientId: input.claim.recipientId,
      claimDigest,
      now: nowIso,
    });
    return finish('skipped_dnc');
  }

  let providerResult: TelegramCampaignProviderResult;
  try {
    providerResult = await input.sender.send({
      orgId: input.orgId,
      accountId: context.account_id ?? '',
      gatewayAccountRef: context.gateway_account_ref,
      username,
      text,
      randomId: context.effect_id,
      media,
    });
  } catch {
    providerResult = { kind: 'ambiguous' };
  }
  if (providerResult.kind === 'sent') {
    const providerMessageId = providerResult.providerMessageId;
    if (providerMessageId.length < 1 || providerMessageId.length > 256) {
      providerResult = { kind: 'ambiguous' };
    } else {
      const providerMessageDigest = await digest(
        input.dataKey,
        'campaign-provider-message',
        [input.orgId, providerMessageId],
      );
      const nextSendAt = nextAccountDispatchAt;
      const recorded = await store.markRecipientSent(input.orgId, {
        campaignId: input.claim.campaignId,
        recipientId: input.claim.recipientId,
        claimDigest,
        providerMessageDigest,
        now: nowIso,
        nextSendAt,
      });
      if (recorded) return finish('sent');
      providerResult = { kind: 'ambiguous' };
    }
  }
  if (providerResult.kind === 'ambiguous') {
    await store.markRecipientAmbiguous(input.orgId, {
      campaignId: input.claim.campaignId,
      recipientId: input.claim.recipientId,
      claimDigest,
      now: nowIso,
    });
    return finish('ambiguous');
  }

  const errorCode = safeProviderErrorCode(providerResult.code);
  const floodWait = providerResult.code === 'flood_wait'
    || providerResult.code === 'flood_premium_wait'
    || providerResult.code === 'slow_mode';
  const accountRestricted = providerResult.code === 'account_restricted';
  const accountSessionMissing = providerResult.code === 'account_session_missing';
  const campaignMediaInvalid = providerResult.code === 'media_invalid';
  const providerWaitSeconds = providerResult.retryAfterSeconds;
  const retryAfterSeconds = floodWait
    ? Math.max(
      30,
      Math.min(
        MAX_PROVIDER_WAIT_SECONDS,
        Number.isFinite(providerWaitSeconds)
          ? Math.ceil(providerWaitSeconds as number)
          : context.min_interval_seconds,
      ),
    )
    : effectiveIntervalSeconds;
  const nextSendAt = new Date(now.getTime() + retryAfterSeconds * 1_000).toISOString();
  await store.markRecipientFailed(input.orgId, {
    campaignId: input.claim.campaignId,
    recipientId: input.claim.recipientId,
    claimDigest,
    errorCode,
    now: nowIso,
    nextSendAt,
    pauseReason: floodWait
      ? 'flood_wait'
      : accountRestricted || accountSessionMissing
        ? 'account_restricted'
        : campaignMediaInvalid
          ? 'provider_error'
          : null,
    compensateQuota: campaignMediaInvalid || accountSessionMissing,
    pauseAccountSafety: !campaignMediaInvalid,
  });
  return finish('failed');
}

export async function recoverTelegramCampaignLease(input: {
  db: D1Database;
  orgId: string;
  campaignId: string;
  now?: Date;
}): Promise<{ released: number; ambiguous: number }> {
  assertOrgId(input.orgId);
  if (!CAMPAIGN_ID_PATTERN.test(input.campaignId)) fail('telegram_campaign_invalid_input');
  return new LeadRadarTelegramCampaignStore(input.db).recoverExpiredClaim(input.orgId, {
    campaignId: input.campaignId,
    now: (input.now ?? new Date()).toISOString(),
  });
}

export async function recoverExpiredTelegramCampaignLeasesForOrganization(input: {
  db: D1Database;
  orgId: string;
  now?: Date;
  limit?: number;
}): Promise<{ campaigns: number; released: number; ambiguous: number }> {
  assertOrgId(input.orgId);
  const now = input.now ?? new Date();
  const store = new LeadRadarTelegramCampaignStore(input.db);
  const campaignIds = await store.listExpiredLeaseCampaignIds(
    input.orgId,
    now.toISOString(),
    Math.max(1, Math.min(10, Math.trunc(input.limit ?? 5))),
  );
  let released = 0;
  let ambiguous = 0;
  for (const campaignId of campaignIds) {
    const recovered = await store.recoverExpiredClaim(input.orgId, {
      campaignId,
      now: now.toISOString(),
    });
    released += recovered.released;
    ambiguous += recovered.ambiguous;
  }
  return { campaigns: campaignIds.length, released, ambiguous };
}

export async function maintainTelegramCampaigns(input: {
  db: D1Database;
  orgId: string;
  now?: Date;
}): Promise<void> {
  assertOrgId(input.orgId);
  const now = input.now ?? new Date();
  await new LeadRadarTelegramCampaignStore(input.db).maintain(input.orgId, {
    now: now.toISOString(),
    approvalBefore: now.toISOString(),
    terminalBefore: new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString(),
  });
}

export async function hasTelegramCampaignSchema(db: D1Database): Promise<boolean> {
  return hasRuntimeTelegramCampaignSchema(db);
}

export function parseTelegramCampaignQueueMessage(raw: unknown): TelegramCampaignQueueMessage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('telegram_campaign_invalid_input');
  }
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'campaign_id,org_id,schema,state_version'
    || record.schema !== 'gptbot.lead-radar.telegram-campaign.v1'
    || typeof record.campaign_id !== 'string'
    || !CAMPAIGN_ID_PATTERN.test(record.campaign_id)
    || typeof record.org_id !== 'string'
    || !ENTITY_ID_PATTERN.test(record.org_id)
    || typeof record.state_version !== 'number'
    || !Number.isSafeInteger(record.state_version)
    || record.state_version < 0) fail('telegram_campaign_invalid_input');
  return record as unknown as TelegramCampaignQueueMessage;
}

export function telegramCampaignQueueMessage(
  row: Pick<TelegramCampaignRow, 'id' | 'org_id' | 'state_version'>,
): TelegramCampaignQueueMessage {
  return {
    schema: 'gptbot.lead-radar.telegram-campaign.v1',
    campaign_id: row.id,
    org_id: row.org_id,
    state_version: row.state_version,
  };
}

export async function enqueueDueTelegramCampaignsForOrganization(input: {
  db: D1Database;
  orgId: string;
  sender: TelegramCampaignQueueSender;
  now?: Date;
  limit?: number;
}): Promise<number> {
  assertOrgId(input.orgId);
  const limit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 10)));
  const due = await new LeadRadarTelegramCampaignStore(input.db).listDueCampaigns(
    input.orgId,
    (input.now ?? new Date()).toISOString(),
    limit,
  );
  for (const campaign of due) {
    await input.sender.send(telegramCampaignQueueMessage(campaign));
  }
  return due.length;
}

export async function consumeTelegramCampaignQueueMessage(input: {
  db: D1Database;
  dataKey: string;
  raw: unknown;
  sender: TelegramCampaignSender;
  mediaReader?: TelegramCampaignMediaReader;
  dailyLimit?: number;
  minimumIntervalSeconds?: number;
  now?: Date;
}): Promise<{
  disposition: 'stale' | 'idle' | 'processed';
  deliveryStatus?: 'sent' | 'failed' | 'ambiguous' | 'skipped_dnc' | 'skipped_stale' | 'paused';
  next: TelegramCampaignQueueMessage | null;
  delaySeconds: number;
}> {
  const message = parseTelegramCampaignQueueMessage(input.raw);
  const now = input.now ?? new Date();
  const store = new LeadRadarTelegramCampaignStore(input.db);
  const initial = await store.getCampaign(message.org_id, message.campaign_id);
  if (!initial
    || initial.state_version !== message.state_version
    || initial.status !== 'running') {
    return { disposition: 'stale', next: null, delaySeconds: 0 };
  }
  await store.recoverExpiredClaim(message.org_id, {
    campaignId: message.campaign_id,
    now: now.toISOString(),
  });
  const claim = await claimNextTelegramCampaignRecipient({
    db: input.db,
    dataKey: input.dataKey,
    orgId: message.org_id,
    campaignId: message.campaign_id,
    now,
  });
  if (!claim) {
    const campaign = await store.getCampaign(message.org_id, message.campaign_id);
    if (!campaign || campaign.status !== 'running') {
      return { disposition: 'idle', next: null, delaySeconds: 0 };
    }
    return {
      disposition: 'idle',
      next: telegramCampaignQueueMessage(campaign),
      delaySeconds: Math.max(
        1,
        Math.min(3_600, Math.ceil((Date.parse(campaign.next_send_at) - now.getTime()) / 1_000) || 30),
      ),
    };
  }
  const delivered = await dispatchClaimedTelegramCampaignRecipient({
    db: input.db,
    dataKey: input.dataKey,
    orgId: message.org_id,
    claim,
    sender: input.sender,
    mediaReader: input.mediaReader,
    dailyLimit: input.dailyLimit,
    minimumIntervalSeconds: input.minimumIntervalSeconds,
    now,
  });
  const campaign = await store.getCampaign(message.org_id, message.campaign_id);
  const next = campaign?.status === 'running'
    && campaign.recipient_count > (
      campaign.sent_count
      + campaign.failed_count
      + campaign.ambiguous_count
      + campaign.skipped_count
    )
    ? telegramCampaignQueueMessage(campaign)
    : null;
  const delaySeconds = next && campaign
    ? Math.max(1, Math.min(
      3_600,
      Math.ceil((Date.parse(campaign.next_send_at) - now.getTime()) / 1_000),
    ))
    : 0;
  return {
    disposition: 'processed',
    deliveryStatus: delivered.status,
    next,
    delaySeconds,
  };
}
