import type { LeadRadarTelegramContact, TelegramContactType } from './types';
import {
  buildVerifiedTelegramCorporateDraftLink,
  telegramIdentifierDigest,
} from './telegram-business';
import {
  LeadRadarTelegramCampaignStore,
  type TelegramCampaignContactBasis,
  type TelegramCampaignRow,
  type TelegramCampaignStatus,
  type TelegramUserAccountRow,
} from './telegram-campaign-store';
import {
  decryptTelegramCampaignSecret,
  encryptTelegramCampaignSecret,
} from './telegram-campaign-crypto';
import { hasExactTelegramCampaignSchema } from './telegram-campaign-schema';

export type { TelegramCampaignContactBasis } from './telegram-campaign-store';

const TEXT_ENCODER = new TextEncoder();
const MAX_SELECTION = 50;
const MAX_TEMPLATE_CODE_POINTS = 4_096;
const MAX_TEMPLATE_BYTES = 16_384;
const APPROVAL_TTL_MS = 10 * 60_000;
const CLAIM_LEASE_MS = 2 * 60_000;
const DEFAULT_INTERVAL_SECONDS = 60;
const MAX_FLOOD_WAIT_SECONDS = 24 * 60 * 60;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/u;
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
  | 'telegram_campaign_approval_required'
  | 'telegram_campaign_approval_expired_or_used'
  | 'telegram_campaign_campaign_not_found'
  | 'telegram_campaign_transition_invalid'
  | 'telegram_campaign_claim_invalid'
  | 'telegram_campaign_storage_conflict';

export class LeadRadarTelegramCampaignError extends Error {
  constructor(readonly code: TelegramCampaignErrorCode) {
    super(code);
    this.name = 'LeadRadarTelegramCampaignError';
  }
}

export type TelegramCampaignSelectionReason =
  | 'verified_corporate_endpoint'
  | 'personal_contact_manual_only'
  | 'bot_not_messageable'
  | 'channel_not_messageable'
  | 'group_not_messageable'
  | 'no_verified_corporate_endpoint'
  | 'corporate_endpoint_unverified'
  | 'do_not_contact'
  | 'company_not_found';

export interface TelegramCampaignSelectionItem {
  companyId: string;
  name: string | null;
  classification: 'automatic' | 'manual' | 'excluded';
  reasonCode: TelegramCampaignSelectionReason;
}

export interface TelegramCampaignSelectionEvaluation {
  selected: number;
  automatic: number;
  manual: number;
  excluded: number;
  automaticCompanyIds: string[];
  items: TelegramCampaignSelectionItem[];
}

interface VerifiedRecipient {
  companyId: string;
  name: string;
  username: string;
  contactJson: string;
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
      | 'paid_message_required'
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
    accountId: string;
    gatewayAccountRef: string;
    username: string;
    text: string;
    randomId: string;
  }): Promise<TelegramCampaignProviderResult>;
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

function entityId(prefix: 'lrtgua_' | 'lrtgap_' | 'lrtgcp_' | 'lrtgcr_' | 'lrtgce_' | 'lrtgop_'): string {
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

function boundedTemplate(value: string): string {
  const bytes = TEXT_ENCODER.encode(value);
  if (value.trim().length === 0
    || [...value].length > MAX_TEMPLATE_CODE_POINTS
    || bytes.byteLength > MAX_TEMPLATE_BYTES
    || value.includes('\u0000')
    || [...value.matchAll(/\{([^{}]+)\}/gu)]
      .some((match) => match[1] !== 'company_name')) fail('telegram_campaign_invalid_input');
  return value;
}

function renderedTemplate(template: string, companyName: string): string {
  return boundedTemplate(template.replaceAll('{company_name}', companyName));
}

function intervalSeconds(value: number | undefined): number {
  const parsed = value ?? DEFAULT_INTERVAL_SECONDS;
  if (!Number.isInteger(parsed) || parsed < 30 || parsed > 3_600) {
    fail('telegram_campaign_invalid_input');
  }
  return parsed;
}

function dailyLimit(value: number | undefined): number {
  const parsed = value ?? 10;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
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
  if (label.length < 1
    || label.length > 40
    || /[@+]|https?:|t\.me|\d{5,}/iu.test(label)
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

function campaignReadModel(row: TelegramCampaignRow): TelegramCampaignReadModel {
  const terminal = row.sent_count + row.failed_count + row.ambiguous_count + row.skipped_count;
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
  };
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

async function evaluateSelectionInternal(input: {
  db: D1Database;
  orgId: string;
  companyIds: readonly string[];
  now: Date;
}): Promise<InternalSelection> {
  const ids = selectedCompanyIds(input.companyIds);
  const store = new LeadRadarTelegramCampaignStore(input.db);
  const rows = await store.findCompanies(input.orgId, ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
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
      });
      continue;
    }
    if (company.suppressed === 1 || company.lifecycle === 'do_not_contact') {
      items.push({
        companyId,
        name: company.name,
        classification: 'excluded',
        reasonCode: 'do_not_contact',
      });
      continue;
    }
    const contact = parseContact(company.telegram_contact_json);
    if (contact?.type !== 'business') {
      const reason = nonBusinessReason(contact?.type ?? null);
      items.push({ companyId, name: company.name, ...reason });
      continue;
    }
    const verifiedLink = await buildVerifiedTelegramCorporateDraftLink({
      db: input.db,
      orgId: input.orgId,
      companyId,
      website: company.website,
      contact,
      draft: 'verification',
      now: input.now,
    });
    if (verifiedLink === null || !USERNAME_PATTERN.test(contact.username)) {
      items.push({
        companyId,
        name: company.name,
        classification: 'excluded',
        reasonCode: 'corporate_endpoint_unverified',
      });
      continue;
    }
    items.push({
      companyId,
      name: company.name,
      classification: 'automatic',
      reasonCode: 'verified_corporate_endpoint',
    });
    verifiedRecipients.push({
      companyId,
      name: company.name,
      username: contact.username.toLowerCase(),
      contactJson: company.telegram_contact_json,
    });
  }
  const automatic = verifiedRecipients.length;
  const manual = items.filter((item) => item.classification === 'manual').length;
  const excluded = items.length - automatic - manual;
  return {
    selected: items.length,
    automatic,
    manual,
    excluded,
    automaticCompanyIds: verifiedRecipients.map((item) => item.companyId),
    items,
    verifiedRecipients,
  };
}

export async function evaluateTelegramCampaignSelection(input: {
  db: D1Database;
  orgId: string;
  companyIds: readonly string[];
  now?: Date;
}): Promise<TelegramCampaignSelectionEvaluation> {
  assertOrgId(input.orgId);
  const result = await evaluateSelectionInternal({
    db: input.db,
    orgId: input.orgId,
    companyIds: input.companyIds,
    now: input.now ?? new Date(),
  });
  return publicSelection(result);
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

async function approvalBindings(input: {
  dataKey: string;
  orgId: string;
  accountId: string;
  automaticCompanyIds: readonly string[];
  template: string;
  operatorId: string;
  minIntervalSeconds: number;
  contactBasis: TelegramCampaignContactBasis;
}): Promise<{
  selectionDigest: string;
  contentDigest: string;
  operatorDigest: string;
  requestFingerprint: string;
}> {
  const [selectionDigest, contentDigest, operatorDigest] = await Promise.all([
    digest(input.dataKey, 'campaign-selection', [input.orgId, input.automaticCompanyIds]),
    digest(input.dataKey, 'campaign-content', [input.orgId, input.template]),
    digest(input.dataKey, 'campaign-operator', [input.orgId, input.operatorId]),
  ]);
  const requestFingerprint = await digest(input.dataKey, 'campaign-approval-request', [
    input.orgId,
    input.accountId,
    selectionDigest,
    contentDigest,
    operatorDigest,
    input.minIntervalSeconds,
    input.contactBasis,
  ]);
  return { selectionDigest, contentDigest, operatorDigest, requestFingerprint };
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
  const [authRequestDigest, requestIdempotencyDigest, requestFingerprint] = await Promise.all([
    digest(input.dataKey, 'campaign-account-auth-request', [input.orgId, input.authRequestReference]),
    digest(input.dataKey, 'campaign-account-idempotency', [input.orgId, input.idempotencyKey]),
    digest(input.dataKey, 'campaign-account-request', [input.orgId, input.authRequestReference, label]),
  ]);
  const store = new LeadRadarTelegramCampaignStore(input.db);
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
  const gatewayAccountRefDigest = await digest(
    input.dataKey,
    'campaign-gateway-account-ref',
    [input.orgId, input.gatewayAccountRef],
  );
  const store = new LeadRadarTelegramCampaignStore(input.db);
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
  const authRequestDigest = await digest(
    input.dataKey,
    'campaign-account-auth-request',
    [input.orgId, input.authRequestReference],
  );
  const account = await new LeadRadarTelegramCampaignStore(input.db)
    .findAccountByAuthRequest(input.orgId, authRequestDigest);
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

export async function prepareTelegramCampaign(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  accountId: string;
  companyIds: readonly string[];
  template: string;
  operatorId: string;
  idempotencyKey: string;
  minIntervalSeconds?: number;
  contactBasis: TelegramCampaignContactBasis;
  now?: Date;
}): Promise<TelegramCampaignPrepareResult> {
  assertOrgId(input.orgId);
  if (!ACCOUNT_ID_PATTERN.test(input.accountId)) fail('telegram_campaign_invalid_input');
  assertIdempotencyKey(input.idempotencyKey);
  const template = boundedTemplate(input.template);
  const operatorId = assertOperator(input.operatorId);
  const minIntervalSeconds = intervalSeconds(input.minIntervalSeconds);
  if (!isTelegramCampaignContactBasis(input.contactBasis)) {
    fail('telegram_campaign_invalid_input');
  }
  const now = input.now ?? new Date();
  const store = new LeadRadarTelegramCampaignStore(input.db);
  const account = await store.getAccount(input.orgId, input.accountId);
  if (!account) fail('telegram_campaign_account_not_found');
  if (account.status !== 'connected' || account.gateway_account_ref === null) {
    fail('telegram_campaign_account_not_connected');
  }
  const selection = await evaluateSelectionInternal({
    db: input.db,
    orgId: input.orgId,
    companyIds: input.companyIds,
    now,
  });
  if (selection.automatic === 0) fail('telegram_campaign_no_eligible_recipients');
  const bindings = await approvalBindings({
    dataKey: input.dataKey,
    orgId: input.orgId,
    accountId: input.accountId,
    automaticCompanyIds: selection.automaticCompanyIds,
    template,
    operatorId,
    minIntervalSeconds,
    contactBasis: input.contactBasis,
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
    };
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
      };
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
  };
}

export async function createApprovedTelegramCampaign(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  accountId: string;
  companyIds: readonly string[];
  template: string;
  operatorId: string;
  approvalToken: string;
  expectedSelectionDigest: string;
  expectedContentDigest: string;
  idempotencyKey: string;
  minIntervalSeconds?: number;
  contactBasis: TelegramCampaignContactBasis;
  now?: Date;
}): Promise<{
  campaign: TelegramCampaignReadModel;
  selection: TelegramCampaignSelectionEvaluation;
  replayed: boolean;
}> {
  assertOrgId(input.orgId);
  if (!ACCOUNT_ID_PATTERN.test(input.accountId)
    || !APPROVAL_TOKEN_PATTERN.test(input.approvalToken)
    || !/^[0-9a-f]{64}$/u.test(input.expectedSelectionDigest)
    || !/^[0-9a-f]{64}$/u.test(input.expectedContentDigest)) {
    fail('telegram_campaign_invalid_input');
  }
  assertIdempotencyKey(input.idempotencyKey);
  const template = boundedTemplate(input.template);
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
  });
  if (selection.automatic === 0) fail('telegram_campaign_no_eligible_recipients');
  const bindings = await approvalBindings({
    dataKey: input.dataKey,
    orgId: input.orgId,
    accountId: input.accountId,
    automaticCompanyIds: selection.automaticCompanyIds,
    template,
    operatorId,
    minIntervalSeconds,
    contactBasis: input.contactBasis,
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
    if (previous.request_fingerprint !== bindings.requestFingerprint) {
      fail('telegram_campaign_idempotency_conflict');
    }
    return { campaign: campaignReadModel(previous), selection: selectionReadModel, replayed: true };
  }
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
    const rendered = renderedTemplate(template, recipient.name);
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
      expectedContactJson: recipient.contactJson,
      effectId,
      effectKeyDigest,
      payloadDigest,
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
    templateCiphertext: templateEncrypted.ciphertext,
    templateIv: templateEncrypted.iv,
    minIntervalSeconds,
    now: now.toISOString(),
    recipients,
  });
  if (!created) {
    const concurrent = await store.findCampaignByIdempotency(input.orgId, idempotencyKeyDigest);
    if (concurrent) {
      if (concurrent.request_fingerprint !== bindings.requestFingerprint) {
        fail('telegram_campaign_idempotency_conflict');
      }
      return { campaign: campaignReadModel(concurrent), selection: selectionReadModel, replayed: true };
    }
    const freshApproval = await store.getApprovalByToken(input.orgId, approvalTokenDigest);
    if (freshApproval?.consumed_at !== null) fail('telegram_campaign_approval_expired_or_used');
    fail('telegram_campaign_storage_conflict');
  }
  const campaign = await store.getCampaign(input.orgId, campaignId);
  if (!campaign) fail('telegram_campaign_storage_conflict');
  return { campaign: campaignReadModel(campaign), selection: selectionReadModel, replayed: false };
}

export async function getTelegramCampaign(
  db: D1Database,
  orgId: string,
  campaignId: string,
): Promise<TelegramCampaignReadModel | null> {
  assertOrgId(orgId);
  if (!CAMPAIGN_ID_PATTERN.test(campaignId)) fail('telegram_campaign_invalid_input');
  const row = await new LeadRadarTelegramCampaignStore(db).getCampaign(orgId, campaignId);
  return row ? campaignReadModel(row) : null;
}

export async function transitionTelegramCampaign(input: {
  db: D1Database;
  dataKey: string;
  orgId: string;
  campaignId: string;
  action: 'start' | 'pause' | 'resume' | 'stop';
  operatorId: string;
  idempotencyKey: string;
  now?: Date;
}): Promise<{ campaign: TelegramCampaignReadModel; replayed: boolean }> {
  assertOrgId(input.orgId);
  if (!CAMPAIGN_ID_PATTERN.test(input.campaignId)) fail('telegram_campaign_invalid_input');
  assertIdempotencyKey(input.idempotencyKey);
  const operatorId = assertOperator(input.operatorId);
  const now = input.now ?? new Date();
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
  const store = new LeadRadarTelegramCampaignStore(input.db);
  const replay = await store.findOperation(input.orgId, operationDigest);
  if (replay) {
    if (replay.campaign_id !== input.campaignId
      || replay.action !== input.action
      || replay.request_fingerprint !== requestFingerprint) {
      fail('telegram_campaign_idempotency_conflict');
    }
    const campaign = await store.getCampaign(input.orgId, input.campaignId);
    if (!campaign) fail('telegram_campaign_campaign_not_found');
    return { campaign: campaignReadModel(campaign), replayed: true };
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
      return { campaign: campaignReadModel(campaign), replayed: true };
    }
    if (!await store.getCampaign(input.orgId, input.campaignId)) {
      fail('telegram_campaign_campaign_not_found');
    }
    fail('telegram_campaign_transition_invalid');
  }
  const campaign = await store.getCampaign(input.orgId, input.campaignId);
  if (!campaign) fail('telegram_campaign_campaign_not_found');
  return { campaign: campaignReadModel(campaign), replayed: false };
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
  const claimToken = `lrtg_claim_${randomBase64Url(24)}`;
  const claimDigest = await digest(
    input.dataKey,
    'campaign-claim',
    [input.orgId, input.campaignId, claimToken],
  );
  const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS).toISOString();
  const recipient = await new LeadRadarTelegramCampaignStore(input.db).claimNextRecipient(
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
  return contact?.type === 'business' && USERNAME_PATTERN.test(contact.username)
    ? contact.username.toLowerCase()
    : null;
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
  const claimDigest = await digest(input.dataKey, 'campaign-claim', [
    input.orgId,
    input.claim.campaignId,
    input.claim.claimToken,
  ]);
  const store = new LeadRadarTelegramCampaignStore(input.db);
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
    return { status, campaign: campaignReadModel(campaign) };
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
  if (!verifiedLink
    || currentEndpointDigest !== context.endpoint_digest
    || currentContactFingerprint !== context.contact_fingerprint) {
    await store.markRecipientSkipped(input.orgId, {
      campaignId: input.claim.campaignId,
      recipientId: input.claim.recipientId,
      claimDigest,
      status: 'skipped_stale',
      errorCode: 'endpoint_stale',
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
    });
    return finish('paused');
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
    });
    return finish('paused');
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

  let providerResult: TelegramCampaignProviderResult;
  try {
    providerResult = await input.sender.send({
      accountId: context.account_id ?? '',
      gatewayAccountRef: context.gateway_account_ref,
      username,
      text,
      randomId: context.effect_id,
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
  const retryAfterSeconds = floodWait
    ? Math.min(
      Math.max(Math.ceil(providerResult.retryAfterSeconds ?? context.min_interval_seconds), 30),
      MAX_FLOOD_WAIT_SECONDS,
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
      : accountRestricted
        ? 'account_restricted'
        : null,
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
  return hasExactTelegramCampaignSchema(db);
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
