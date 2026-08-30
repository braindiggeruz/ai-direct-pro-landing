import {
  ownerError,
  ownerJson,
  readOwnerBody,
  type OwnerHandlerContext,
} from '../../../platform/admin';
import {
  assertLeadRadarRuntimeSchema,
  authorizeTelegramCampaignContact,
  createApprovedTelegramCampaign,
  createTelegramUserAccountPending,
  completeTelegramUserAccountConnection,
  enqueueDueTelegramCampaignsForOrganization,
  getTelegramCampaign,
  getTelegramCampaignDataKeyIdentityState,
  getTelegramCampaignRecovery,
  getTelegramUserAccount,
  getTelegramUserAccountGatewayBinding,
  getTelegramUserAccountByAuthRequest,
  hasTelegramCampaignSchema,
  isTelegramCampaignContactBasis,
  isTelegramCampaignDataKeyValid,
  LeadRadarSchemaUnavailableError,
  LeadRadarStore,
  LeadRadarTelegramCampaignError,
  prepareTelegramCampaign,
  revokeTelegramUserAccount,
  setTelegramUserAccountStatus,
  stageTelegramUserAccountConnection,
  transitionTelegramCampaign,
  type TelegramAccountReadModel,
  type TelegramCampaignQueueSender,
  type TelegramCampaignReadModel,
  type TelegramCampaignSelectionEvaluation,
} from '../../../platform/lead-radar';
import { LeadRadarTelegramCampaignStore } from '../../../platform/lead-radar/telegram-campaign-store';
import { AudienceError,AudienceStore,requireAudienceSchema } from '../../../platform/lead-radar/audiences';
import type { AudienceScope } from '../../../../src/shared/lead-radar-audiences';
import { checkCorporateTelegramContact } from '../../../platform/lead-radar/contact-resolution';
import { evaluateTelegramCampaignSelection } from '../../../platform/lead-radar/telegram-campaign';
import {
  adoptTelegramAccountConnection,
  beginTelegramAccountPhoneConnection,
  beginTelegramAccountConnection,
  cancelTelegramAccountConnection,
  createTelegramBridgePairing,
  disconnectTelegramAccountService,
  finalizeTelegramAccountConnection,
  getActiveTelegramAccountConnection,
  getTelegramAccountRoutePresence,
  getTelegramBridgeStatus,
  hasPrivateTelegramAccountService,
  pollTelegramAccountConnection,
  probeTelegramAccountGatewayConfiguration,
  revokeTelegramBridge,
  resolveTelegramContact,
  submitTelegramAccountPassword,
  submitTelegramAccountAuthInput,
  TelegramAccountServiceError,
  checkTelegramCampaignMedia,
  type TelegramAccountConnectChallenge,
  type TelegramAccountConnectionPoll,
} from '../../../platform/lead-radar/telegram-account-service';
import type {
  LeadRadarApiCapabilities,
  LeadRadarTelegramAccountReadiness,
  LeadRadarTelegramAccountReadinessBlocker,
} from '../../../../src/shared/lead-radar';
import { parseLeadRadarTelegramCampaignMinimumIntervalSeconds } from '../../../../src/shared/lead-radar-telegram-campaign-policy';
import {
  isLeadRadarTelegramBridgeE2eEnvelope,
  LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_ID_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN,
  LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS,
  LEAD_RADAR_TELEGRAM_BRIDGE_SECRET_PATTERN,
  type LeadRadarTelegramBridgeE2eEnvelope,
} from '../../../../src/shared/lead-radar-telegram-bridge';
import {
  isTelegramCampaignAttachmentReference,
  LeadRadarTelegramCampaignMediaStore,
  TelegramCampaignMediaError,
  type TelegramCampaignAttachmentReference,
  type TelegramCampaignUploadedMedia,
} from '../../../platform/lead-radar/telegram-campaign-media';

const ENTITY_ID_PATTERN = /^[A-Za-z0-9:_-]{1,80}$/u;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{8,160}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
// Telegram counts the 4096 limit in UTF-16 code units (audit CP-4).
const MAX_TEMPLATE_UTF16_UNITS = 4_096;

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}
const MAX_TEMPLATE_BYTES = 16_384;
const campaignSchemaPass = new WeakMap<D1Database, Promise<boolean>>();

type CampaignContext = OwnerHandlerContext & {
  env: OwnerHandlerContext['env'] & {
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE?: Fetcher;
    LEAD_RADAR_CAMPAIGN_MEDIA?: R2Bucket;
  };
};

interface AccountState {
  status:
    | 'unconfigured'
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'restricted'
    | 'reauth_required'
    | 'revoked'
    | 'paused'
    | 'error';
  connectionId: string | null;
  displayName: string | null;
  username: null;
  phoneMasked: null;
  connectedAt: string | null;
  lastHealthAt: string | null;
  qr: {
    authId: string;
    orgId: string;
    bridgeCommandId: string;
    deviceId: string;
    qrEnvelope: LeadRadarTelegramBridgeE2eEnvelope | null;
    inputCommandId: string | null;
    inputAction: 'phone' | 'code' | null;
    passwordCommandId: string | null;
    bridgeEncryptionKey: {
      alg: 'RSA-OAEP-256';
      keyId: string;
      spki: string;
    } | null;
    expiresAt: string;
  } | null;
  authState: TelegramAccountConnectChallenge['authState'] | 'finalizing' | 'connected' | null;
  authAttemptId?: string | null;
  pendingAction?: TelegramAccountConnectChallenge['pendingAction'];
  reasonCode: string | null;
  readiness?: LeadRadarTelegramAccountReadiness;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length
    && actual.every((key, index) => key === sorted[index]);
}

async function exactBody(
  ctx: CampaignContext,
  keys: readonly string[],
): Promise<Record<string, unknown> | null> {
  const body = record(await readOwnerBody(ctx.request));
  return body && exactKeys(body, keys) ? body : null;
}

async function exactBodyVariants(
  ctx: CampaignContext,
  variants: readonly (readonly string[])[],
): Promise<Record<string, unknown> | null> {
  const body = record(await readOwnerBody(ctx.request));
  return body && variants.some((keys) => exactKeys(body, keys)) ? body : null;
}

function browserKeyFromBody(value: unknown): {
  alg: 'RSA-OAEP-256'; keyId: string; spki: string; expiresAt: string;
} | null {
  const key = record(value);
  if (!key
    || !exactKeys(key, ['alg', 'expires_at', 'key_id', 'spki'])
    || key.alg !== 'RSA-OAEP-256'
    || typeof key.key_id !== 'string'
    || !/^[0-9a-f]{64}$/u.test(key.key_id)
    || typeof key.spki !== 'string'
    || !LEAD_RADAR_TELEGRAM_BRIDGE_RSA_SPKI_PATTERN.test(key.spki)
    || typeof key.expires_at !== 'string'
    || !Number.isFinite(Date.parse(key.expires_at))
    || Date.parse(key.expires_at) <= Date.now()
    || Date.parse(key.expires_at) > Date.now()
      + LEAD_RADAR_TELEGRAM_BRIDGE_RELAY_TTL_SECONDS * 1_000 + 5_000) return null;
  return { alg: 'RSA-OAEP-256', keyId: key.key_id, spki: key.spki, expiresAt: key.expires_at };
}

function attachmentFromBody(value: unknown): TelegramCampaignAttachmentReference | null | false {
  if (value === null || value === undefined) return null;
  return isTelegramCampaignAttachmentReference(value) ? value : false;
}

function idempotencyKey(ctx: CampaignContext): string | null {
  const value = ctx.request.headers.get('Idempotency-Key');
  return value && IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;
}

function requiredIdempotencyResponse(ctx: CampaignContext): Response {
  return ownerError('lead_radar_idempotency_key_required', ctx.requestId, 400);
}

function unavailable(code: string, ctx: CampaignContext): Response {
  const response = ownerError(code, ctx.requestId, 503);
  response.headers.set('Retry-After', '300');
  return response;
}

async function campaignSchemaResponse(ctx: CampaignContext): Promise<Response | null> {
  try {
    await assertLeadRadarRuntimeSchema(ctx.db);
    let verified = campaignSchemaPass.get(ctx.db);
    if (!verified) {
      verified = hasTelegramCampaignSchema(ctx.db);
      campaignSchemaPass.set(ctx.db, verified);
    }
    if (!await verified) {
      campaignSchemaPass.delete(ctx.db);
      return unavailable('telegram_campaign_schema_unavailable', ctx);
    }
    return null;
  } catch (error) {
    campaignSchemaPass.delete(ctx.db);
    if (error instanceof LeadRadarSchemaUnavailableError) {
      return unavailable(error.code, ctx);
    }
    throw error;
  }
}

function campaignDataKey(ctx: CampaignContext): string | null {
  const value = ctx.env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY;
  return isTelegramCampaignDataKeyValid(value) ? value.trim() : null;
}

function configuredInterval(ctx: CampaignContext): number | null {
  return parseLeadRadarTelegramCampaignMinimumIntervalSeconds(
    ctx.env.LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS,
  );
}

async function finishCampaignMediaCheck(ctx: CampaignContext, orgId: string, stored: TelegramCampaignUploadedMedia): Promise<Response> {
  if (!ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA) return unavailable('telegram_campaign_media_storage_unavailable', ctx);
  const media = await new LeadRadarTelegramCampaignMediaStore(ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA).read(orgId, { mediaId: stored.mediaId, mediaDigest: stored.mediaDigest });
  const validation = await checkTelegramCampaignMedia({
    service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
    internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
    orgId, operationId: `media-check-${stored.mediaId}`, media,
  });
  if (validation.status === 'invalid') throw new TelegramCampaignMediaError('telegram_campaign_media_invalid');
  if (validation.status === 'valid') {
    const store = new LeadRadarTelegramCampaignStore(ctx.db);
    const now = new Date().toISOString();
    if (!await store.registerCampaignMediaObject(orgId, { mediaId: stored.mediaId, mediaDigest: stored.mediaDigest, expiresAt: stored.expiresAt, now })) {
      throw new TelegramCampaignMediaError('telegram_campaign_media_idempotency_conflict');
    }
    if (!await store.activateCampaignMediaQuota(orgId, { mediaId: stored.mediaId, mediaDigest: stored.mediaDigest, sizeBytes: stored.sizeBytes, now })) {
      throw new TelegramCampaignMediaError('telegram_campaign_media_storage_unavailable');
    }
  }
  return ownerJson({ mediaId: stored.mediaId, mediaDigest: stored.mediaDigest, filename: stored.filename,
    mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, validation }, ctx.requestId, validation.status === 'pending' ? 202 : 201);
}

function disconnectedAccount(
  status: AccountState['status'] = 'disconnected',
  reasonCode: string | null = null,
  readiness?: LeadRadarTelegramAccountReadiness,
): AccountState {
  return {
    status,
    connectionId: null,
    displayName: null,
    username: null,
    phoneMasked: null,
    connectedAt: null,
    lastHealthAt: null,
    qr: null,
    authState: null,
    reasonCode,
    ...(readiness ? { readiness } : {}),
  };
}

function accountState(
  account: TelegramAccountReadModel,
  options: {
    challenge?: TelegramAccountConnectChallenge;
    orgId?: string;
    serviceStatus?: TelegramAccountConnectionPoll['status'];
    reasonCode?: string | null;
    readiness?: LeadRadarTelegramAccountReadiness;
    finalizingAuthId?: string;
  } = {},
): AccountState {
  const status = options.serviceStatus ?? (
    account.status === 'pending'
      ? 'connecting'
      : account.status
  );
  const challenge = options.challenge;
  if (challenge && !options.orgId) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  return {
    status,
    connectionId: account.id,
    displayName: account.maskedLabel,
    username: null,
    phoneMasked: null,
    connectedAt: account.connectedAt,
    lastHealthAt: account.lastHealthAt,
    qr: challenge ? {
      authId: challenge.authId,
      orgId: options.orgId!,
      bridgeCommandId: challenge.bridgeCommandId,
      deviceId: challenge.deviceId,
      qrEnvelope: challenge.qrEnvelope,
      inputCommandId: challenge.inputCommandId,
      inputAction: challenge.inputAction,
      passwordCommandId: challenge.passwordCommandId,
      bridgeEncryptionKey: challenge.bridgeEncryptionKey ? {
        alg: challenge.bridgeEncryptionKey.alg,
        keyId: challenge.bridgeEncryptionKey.key_id,
        spki: challenge.bridgeEncryptionKey.spki,
      } : null,
      expiresAt: challenge.expiresAt,
    } : null,
    authState: challenge?.authState ?? (status === 'connected' ? 'connected'
      : options.finalizingAuthId ? 'finalizing' : null),
    authAttemptId: challenge?.authId ?? (status === 'connecting' ? options.finalizingAuthId ?? null : null),
    pendingAction: challenge?.pendingAction ?? null,
    reasonCode: options.reasonCode ?? challenge?.reasonCode ?? null,
    ...(options.readiness ? { readiness: options.readiness } : {}),
  };
}

function uniqueReadinessBlockers(
  blockers: readonly LeadRadarTelegramAccountReadinessBlocker[],
): LeadRadarTelegramAccountReadinessBlocker[] {
  return [...new Set(blockers)];
}

async function telegramAccountReadiness(
  ctx: CampaignContext,
  capabilities: LeadRadarApiCapabilities,
  orgId: string,
): Promise<{
  readiness: LeadRadarTelegramAccountReadiness;
  routingKeyFingerprint: string | null;
}> {
  const local = capabilities.telegramAccountReadiness ?? {
    status: capabilities.telegramAccountEnabled ? 'probe_required' : 'blocked',
    blockers: capabilities.telegramAccountEnabled ? [] : ['feature_disabled'],
  } satisfies LeadRadarTelegramAccountReadiness;
  if (local.blockers.length > 0) {
    return { readiness: local, routingKeyFingerprint: null };
  }
  const gateway = await probeTelegramAccountGatewayConfiguration(
    ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
    ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
  );
  const bridgeBlockers: LeadRadarTelegramAccountReadinessBlocker[] = [];
  if (gateway.readiness.blockers.length === 0) {
    try {
      const bridge = await getTelegramBridgeStatus({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
        orgId,
      });
      if (bridge.status === 'unpaired' || bridge.status === 'revoked') {
        bridgeBlockers.push('bridge_not_paired');
      } else if (bridge.status === 'offline') {
        bridgeBlockers.push('bridge_offline');
      } else if (bridge.status === 'pending_revocation') {
        bridgeBlockers.push('bridge_revocation_pending');
      }
    } catch {
      bridgeBlockers.push('gateway_unavailable');
    }
  }
  const blockers = uniqueReadinessBlockers([
    ...local.blockers,
    ...gateway.readiness.blockers,
    ...bridgeBlockers,
  ]);
  return {
    readiness: {
      status: blockers.length > 0
        ? 'blocked'
        : (gateway.readiness.status === 'ready' ? 'ready' : 'probe_required'),
      blockers,
    },
    routingKeyFingerprint: gateway.routingKeyFingerprint,
  };
}

async function withCampaignDataKeyReadiness(
  ctx: CampaignContext,
  orgId: string,
  dataKey: string,
  readiness: LeadRadarTelegramAccountReadiness,
  routingKeyFingerprint: string | null,
  bindRoutingKey: boolean,
): Promise<LeadRadarTelegramAccountReadiness> {
  const identity = await getTelegramCampaignDataKeyIdentityState({
    db: ctx.db,
    orgId,
    dataKey,
  });
  const identityBlocker = identity === 'mismatch'
    ? 'campaign_data_key_mismatch' as const
    : identity === 'legacy_unbound'
      ? 'legacy_binding_required' as const
      : null;
  const blockers = [...readiness.blockers];
  if (identityBlocker) blockers.push(identityBlocker);
  if (!identityBlocker && readiness.status !== 'blocked') {
    if (!routingKeyFingerprint) {
      blockers.push('gateway_unavailable');
    } else {
      const store = new LeadRadarTelegramCampaignStore(ctx.db);
      const routingState = bindRoutingKey
        ? await store.ensureRoutingKeyFingerprint(
            orgId,
            routingKeyFingerprint,
            new Date().toISOString(),
          )
        : await store.getRoutingKeyFingerprintState(orgId, routingKeyFingerprint);
      if (routingState === 'mismatch') blockers.push('gateway_routing_key_mismatch');
      if (routingState === 'legacy_unbound') blockers.push('gateway_routing_legacy_unbound');
      if (bindRoutingKey && routingState === 'uninitialized') blockers.push('gateway_unavailable');
    }
  }
  if (blockers.length === 0) return readiness;
  return {
    status: 'blocked',
    blockers: uniqueReadinessBlockers(blockers),
  };
}

const OPERATIONALLY_READY = {
  status: 'ready',
  blockers: [],
} satisfies LeadRadarTelegramAccountReadiness;

function readinessResponse(
  readiness: LeadRadarTelegramAccountReadiness,
  ctx: CampaignContext,
): Response {
  const code = readiness.blockers[0] ?? 'telegram_campaign_gateway_unavailable';
  return code === 'feature_disabled' || code === 'tenant_not_allowed'
    ? ownerError(code, ctx.requestId, 409)
    : unavailable(code, ctx);
}

function missingConnection(error: unknown): boolean {
  return error instanceof TelegramAccountServiceError
    && error.code === 'telegram_campaign_gateway_not_found';
}

async function finalizeConnectedTelegramAccount(
  ctx: CampaignContext,
  orgId: string,
  connection: Extract<TelegramAccountConnectionPoll, { status: 'connected' }>,
  account: TelegramAccountReadModel,
): Promise<TelegramAccountReadModel> {
  const staged = account.status === 'connected'
    ? account
    : await stageTelegramUserAccountConnection({
      db: ctx.db,
      dataKey: campaignDataKey(ctx) ?? '',
      orgId,
      accountId: account.id,
      gatewayAccountRef: connection.accountRef,
      expectedVersion: account.stateVersion,
      maskedLabel: connection.maskedLabel,
      providerConnectedAt: connection.connectedAt,
    });
  const finalized = await finalizeTelegramAccountConnection({
    service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
    internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
    orgId,
    authId: connection.authId,
  });
  if (!finalized) return staged;
  return staged.status === 'connected'
    ? staged
    : completeTelegramUserAccountConnection({
      db: ctx.db,
      dataKey: campaignDataKey(ctx) ?? '',
      orgId,
      accountId: staged.id,
      gatewayAccountRef: connection.accountRef,
      expectedVersion: staged.stateVersion,
      maskedLabel: connection.maskedLabel,
    });
}

function campaignState(campaign: TelegramCampaignReadModel): {
  id: string;
  status: TelegramCampaignReadModel['status'];
  counts: TelegramCampaignReadModel['counts'];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  pausedUntil: string | null;
  reasonCode: string | null;
  canResume: boolean;
  attachment: TelegramCampaignAttachmentReference | null;
  resumeBlockedReason:
    | 'cooldown'
    | 'review_required'
    | 'ambiguous_delivery'
    | 'account_restricted'
    | 'account_disconnected'
    | 'campaign_disabled'
    | null;
} {
  return {
    id: campaign.id,
    status: campaign.status,
    counts: campaign.counts,
    createdAt: campaign.createdAt,
    startedAt: campaign.startedAt,
    completedAt: campaign.completedAt,
    pausedUntil: campaign.pausedUntil,
    reasonCode: campaign.lastErrorCode ?? campaign.pauseReason,
    canResume: campaign.canResume,
    attachment: campaign.attachment,
    resumeBlockedReason: campaign.resumeBlockedReason,
  };
}

function campaignStateWithCapabilities(
  campaign: TelegramCampaignReadModel,
  capabilities: LeadRadarApiCapabilities,
): ReturnType<typeof campaignState> {
  const state = campaignState(campaign);
  if (campaign.status === 'paused'
    && (!capabilities.campaignOutreachEnabled || !capabilities.campaignAutoSendEnabled)) {
    return { ...state, canResume: false, resumeBlockedReason: 'campaign_disabled' };
  }
  return state;
}

function renderTemplate(template: string, companyName: string): string | null {
  const rendered = template.replaceAll('{company_name}', companyName);
  return rendered.trim().length >= 1
    && ![...rendered].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (code < 32 && character !== '\n' && character !== '\t')
        || code === 127
        || (code >= 0xd800 && code <= 0xdfff);
    })
    && rendered.length <= MAX_TEMPLATE_UTF16_UNITS
    && new TextEncoder().encode(rendered).byteLength <= MAX_TEMPLATE_BYTES
    ? rendered
    : null;
}

function preparationState(
  prepared: {
    approvalToken: string;
    expiresAt: string;
    selectionDigest: string;
    contentDigest: string;
    selection: TelegramCampaignSelectionEvaluation;
    attachment: TelegramCampaignAttachmentReference | null;
  },
  template: string,
): Record<string, unknown> | null {
  const recipients = prepared.selection.items.map((item) => {
    const companyName = item.name ?? 'Компания';
    const preview = item.classification === 'automatic'
      ? renderTemplate(template, companyName)
      : null;
    return {
      leadId: item.companyId,
      companyName,
      classification: item.classification,
      reasonCode: item.reasonCode,
      authorization: item.authorization,
      preview,
    };
  });
  if (recipients.some((item) => item.classification === 'automatic' && item.preview === null)) {
    return null;
  }
  return {
    approvalToken: prepared.approvalToken,
    expiresAt: prepared.expiresAt,
    selectionDigest: prepared.selectionDigest,
    contentDigest: prepared.contentDigest,
    attachment: prepared.attachment,
    summary: {
      selected: prepared.selection.selected,
      automatic: prepared.selection.automatic,
      manual: prepared.selection.manual,
      excluded: prepared.selection.excluded,
    },
    recipients,
    previews: recipients
      .filter((item) => item.classification === 'automatic' && item.preview !== null)
      .map((item) => ({
        leadId: item.leadId,
        companyName: item.companyName,
        text: item.preview,
      })),
  };
}

async function validateSearchSelection(
  ctx: CampaignContext,
  orgId: string,
  searchId: unknown,
  leadIds: unknown,
): Promise<'ok' | 'invalid' | 'search_not_found'> {
  if (typeof searchId !== 'string'
    || !ENTITY_ID_PATTERN.test(searchId)
    || !Array.isArray(leadIds)
    || leadIds.length < 1
    || leadIds.length > 50
    || leadIds.some((value) => typeof value !== 'string' || !ENTITY_ID_PATTERN.test(value))
    || new Set(leadIds).size !== leadIds.length) return 'invalid';
  const search = await new LeadRadarStore(ctx.db).getSearch(orgId, searchId);
  if (!search) return 'search_not_found';
  const available = new Set(search.leads.map((lead) => lead.id));
  return leadIds.every((leadId) => available.has(leadId)) ? 'ok' : 'invalid';
}

function campaignErrorResponse(error: unknown, ctx: CampaignContext): Response | null {
  if (error instanceof AudienceError) return ownerError(error.code,ctx.requestId,error.status);
  if (error instanceof TelegramCampaignMediaError) {
    if (error.code === 'telegram_campaign_media_too_large') {
      return ownerError(error.code, ctx.requestId, 413);
    }
    if (error.code === 'telegram_campaign_media_not_found') {
      return ownerError(error.code, ctx.requestId, 404);
    }
    if (error.code === 'telegram_campaign_media_storage_unavailable') {
      return unavailable(error.code, ctx);
    }
    if (error.code === 'telegram_campaign_media_idempotency_conflict'
      || error.code === 'telegram_campaign_media_digest_mismatch'
      || error.code === 'telegram_campaign_media_in_use'
      || error.code === 'telegram_campaign_media_quota_exceeded') {
      return ownerError(error.code, ctx.requestId, 409);
    }
    return ownerError(error.code, ctx.requestId, 400);
  }
  if (error instanceof TelegramAccountServiceError) {
    if (error.code === 'telegram_campaign_auth_rate_limited') {
      return ownerError(error.code, ctx.requestId, 429);
    }
    if (error.code === 'telegram_campaign_gateway_unavailable'
      || error.code === 'telegram_campaign_bridge_offline'
      || error.code === 'telegram_campaign_media_validation_failed'
      || error.code === 'telegram_campaign_gateway_not_configured') {
      return unavailable(error.code, ctx);
    }
    if (error.code === 'telegram_campaign_gateway_invalid_response') {
      return ownerError(error.code, ctx.requestId, 502);
    }
    return ownerError(
      error.code,
      ctx.requestId,
      error.code === 'telegram_campaign_gateway_not_found' ? 404 : 409,
    );
  }
  if (!(error instanceof LeadRadarTelegramCampaignError)) return null;
  if (error.code === 'telegram_campaign_invalid_input') {
    return ownerError(error.code, ctx.requestId, 400);
  }
  if (error.code === 'telegram_campaign_not_configured') {
    return unavailable(error.code, ctx);
  }
  if (error.code === 'telegram_campaign_account_not_found'
    || error.code === 'telegram_campaign_campaign_not_found') {
    return ownerError(error.code, ctx.requestId, 404);
  }
  return ownerError(error.code, ctx.requestId, 409);
}

export function isTelegramCampaignControlPath(parts: readonly string[]): boolean {
  return parts[0] === 'telegram-account' || parts[0] === 'telegram-campaigns';
}

async function resolveCampaignSource(ctx: CampaignContext, orgId: string, body: Record<string,unknown>): Promise<{searchId:string;audience?:AudienceScope}> {
  if ('audienceId' in body) {
    if (typeof body.audienceId!=='string' || typeof body.audienceVersion!=='number'
      || !Array.isArray(body.leadIds) || body.leadIds.some((id)=>typeof id!=='string')) throw new AudienceError('audience_invalid_input');
    await requireAudienceSchema(ctx.db);
    const audience={audienceId:body.audienceId,audienceVersion:body.audienceVersion};
    return {searchId:await new AudienceStore(ctx.db).resolveScope(orgId,audience,body.leadIds as string[]),audience};
  }
  const membership=await validateSearchSelection(ctx,orgId,body.searchId,body.leadIds);
  if (membership!=='ok') throw new AudienceError(membership==='search_not_found'?'search_not_found':'telegram_campaign_invalid_input',membership==='search_not_found'?404:400);
  return {searchId:body.searchId as string};
}

function sourceBodyVariants(keys: string[]): string[][] {
  const audienceKeys=keys.flatMap((key)=>key==='searchId'?['audienceId','audienceVersion']:[key]);
  return [keys,[...keys,'attachment'],audienceKeys,[...audienceKeys,'attachment']];
}

export async function handleTelegramCampaignGet(
  rawContext: OwnerHandlerContext,
  parts: readonly string[],
  orgId: string,
  capabilities: LeadRadarApiCapabilities,
): Promise<Response> {
  const ctx = rawContext as CampaignContext;
  try {
    if (parts.length === 2
      && parts[0] === 'telegram-account'
      && parts[1] === 'bridge') {
      if (!capabilities.telegramAccountEnabled) {
        return ownerError('lead_radar_telegram_account_paused', ctx.requestId, 409);
      }
      const bridge = await getTelegramBridgeStatus({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
        orgId,
      });
      return ownerJson({
        status: bridge.status,
        deviceId: bridge.deviceId,
        label: bridge.label,
        version: bridge.version,
        lastSeenAt: bridge.lastSeenAt,
      }, ctx.requestId);
    }
    if (parts.length === 1 && parts[0] === 'telegram-account') {
      const gatewayProbe = await telegramAccountReadiness(ctx, capabilities, orgId);
      let readiness = gatewayProbe.readiness;
      if (readiness.status === 'blocked' || readiness.blockers.length > 0) {
        return ownerJson(disconnectedAccount(
          'unconfigured',
          readiness.blockers[0] ?? 'telegram_account_disabled',
          readiness,
        ), ctx.requestId);
      }
      const dataKey = campaignDataKey(ctx);
      if (!dataKey) {
        return ownerJson(disconnectedAccount('unconfigured', 'campaign_data_key_missing'), ctx.requestId);
      }
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      readiness = await withCampaignDataKeyReadiness(
        ctx,
        orgId,
        dataKey,
        readiness,
        gatewayProbe.routingKeyFingerprint,
        false,
      );
      const account = await getTelegramUserAccount(ctx.db, orgId);
      if (readiness.status === 'blocked' || readiness.blockers.length > 0) {
        return ownerJson(account
          ? accountState(account, {
              reasonCode: readiness.blockers[0] ?? 'telegram_account_disabled',
              readiness,
            })
          : disconnectedAccount(
              'unconfigured',
              readiness.blockers[0] ?? 'telegram_account_disabled',
              readiness,
            ), ctx.requestId);
      }
      if (!account) return ownerJson(disconnectedAccount('disconnected', null, readiness), ctx.requestId);
      if (account.status !== 'pending') {
        const binding = await getTelegramUserAccountGatewayBinding({
          db: ctx.db,
          dataKey,
          orgId,
          accountId: account.id,
        });
        if (!binding) {
          const blocked: LeadRadarTelegramAccountReadiness = {
            status: 'blocked',
            blockers: ['gateway_account_session_missing'],
          };
          return ownerJson(accountState(account, {
            reasonCode: blocked.blockers[0],
            readiness: blocked,
          }), ctx.requestId);
        }
        try {
          const presence = await getTelegramAccountRoutePresence({
            service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
            internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
            orgId,
            gatewayAccountRef: binding.gatewayAccountRef,
          });
          if (presence === 'missing') {
            const blocked: LeadRadarTelegramAccountReadiness = {
              status: 'blocked',
              blockers: ['gateway_account_session_missing'],
            };
            return ownerJson(accountState(account, {
              reasonCode: blocked.blockers[0],
              readiness: blocked,
            }), ctx.requestId);
          }
        } catch {
          const blocked: LeadRadarTelegramAccountReadiness = {
            status: 'blocked',
            blockers: ['gateway_unavailable'],
          };
          return ownerJson(accountState(account, {
            reasonCode: blocked.blockers[0],
            readiness: blocked,
          }), ctx.requestId);
        }
        return ownerJson(accountState(account, { readiness }), ctx.requestId);
      }
      if (!hasPrivateTelegramAccountService(ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)) {
        return unavailable('telegram_campaign_gateway_unavailable', ctx);
      }
      let challenge: TelegramAccountConnectionPoll;
      try {
        challenge = await getActiveTelegramAccountConnection({
          service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
          internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
          orgId,
        });
      } catch (error) {
        if (missingConnection(error)) {
          return ownerJson(accountState(account, {
            serviceStatus: 'error',
            reasonCode: 'auth_expired',
            readiness,
          }), ctx.requestId);
        }
        throw error;
      }
      // The private service is allowed to return an auth reference, but it is
      // exposed only after its keyed digest resolves to this tenant's pending
      // D1 account. The plaintext reference never enters D1 or browser storage.
      const matched = await getTelegramUserAccountByAuthRequest({
        db: ctx.db,
        dataKey,
        orgId,
        authRequestReference: challenge.authId,
      });
      if (!matched || matched.id !== account.id) {
        return ownerError('telegram_campaign_gateway_conflict', ctx.requestId, 409);
      }
      if (challenge.status === 'connected') {
        const connected = await finalizeConnectedTelegramAccount(ctx, orgId, challenge, account);
        return ownerJson(accountState(connected, { readiness: OPERATIONALLY_READY, finalizingAuthId: challenge.authId }), ctx.requestId);
      }
      if (challenge.status !== 'connecting') {
        if (challenge.status === 'revoked') {
          await revokeTelegramUserAccount({ db: ctx.db, orgId, accountId: account.id });
        }
        return ownerJson(accountState(account, {
          serviceStatus: challenge.status,
          reasonCode: challenge.reasonCode,
          readiness,
        }), ctx.requestId);
      }
      await adoptTelegramAccountConnection({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
        orgId,
        authId: challenge.authId,
      });
      return ownerJson(accountState(account, {
        challenge,
        orgId,
        readiness: OPERATIONALLY_READY,
      }), ctx.requestId);
    }

    if (parts.length === 3
      && parts[0] === 'telegram-account'
      && parts[1] === 'connect') {
      if (!capabilities.telegramAccountEnabled) {
        return ownerError('lead_radar_telegram_account_paused', ctx.requestId, 409);
      }
      const key = campaignDataKey(ctx);
      if (!key) return unavailable('telegram_campaign_not_configured', ctx);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const account = await getTelegramUserAccountByAuthRequest({
        db: ctx.db,
        dataKey: key,
        orgId,
        authRequestReference: parts[2],
      });
      if (!account) return ownerError('telegram_campaign_gateway_not_found', ctx.requestId, 404);
      let polled: TelegramAccountConnectionPoll;
      try {
        polled = await pollTelegramAccountConnection({
          service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
          internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
          orgId,
          authId: parts[2],
        });
      } catch (error) {
        if (missingConnection(error)) {
          return ownerJson(accountState(account, {
            serviceStatus: 'error',
            reasonCode: 'auth_expired',
          }), ctx.requestId);
        }
        throw error;
      }
      if (polled.status === 'connecting') {
        return ownerJson(accountState(account, { challenge: polled, orgId }), ctx.requestId);
      }
      if (polled.status === 'connected') {
        const connected = await finalizeConnectedTelegramAccount(ctx, orgId, polled, account);
        return ownerJson(accountState(connected, { finalizingAuthId: polled.authId }), ctx.requestId);
      }
      if (polled.status === 'revoked') {
        await revokeTelegramUserAccount({ db: ctx.db, orgId, accountId: account.id });
      }
      const terminalAccount = polled.status !== 'revoked' && account.status === 'pending'
        ? await setTelegramUserAccountStatus({
          db: ctx.db,
          orgId,
          accountId: account.id,
          expectedVersion: account.stateVersion,
          status: 'error',
          healthy: false,
        })
        : account;
      return ownerJson(accountState(terminalAccount, {
        serviceStatus: polled.status,
        reasonCode: polled.reasonCode,
      }), ctx.requestId);
    }

    if (parts.length === 1 && parts[0] === 'telegram-campaigns') {
      const key = campaignDataKey(ctx);
      if (!key) return unavailable('telegram_campaign_not_configured', ctx);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const query = new URL(ctx.request.url).searchParams;
      const searchId = query.get('searchId');
      const audienceId = query.get('audienceId');
      if ((!searchId === !audienceId) || !ENTITY_ID_PATTERN.test(searchId ?? audienceId ?? '')) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const recovery = await getTelegramCampaignRecovery({
        db: ctx.db,
        orgId,
        searchId:searchId ?? undefined,
        audienceId:audienceId ?? undefined,
      });
      return ownerJson({
        active: recovery.active
          ? campaignStateWithCapabilities(recovery.active, capabilities)
          : null,
        latest: recovery.latest
          ? campaignStateWithCapabilities(recovery.latest, capabilities)
          : null,
      }, ctx.requestId);
    }

    if (parts.length === 2 && parts[0] === 'telegram-campaigns') {
      const key = campaignDataKey(ctx);
      if (!key) return unavailable('telegram_campaign_not_configured', ctx);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const campaign = await getTelegramCampaign(ctx.db, orgId, parts[1]);
      return campaign
        ? ownerJson(campaignStateWithCapabilities(campaign, capabilities), ctx.requestId)
        : ownerError('telegram_campaign_campaign_not_found', ctx.requestId, 404);
    }
    return ownerError('route_not_found', ctx.requestId, 404);
  } catch (error) {
    return campaignErrorResponse(error, ctx) ?? ownerError('internal_error', ctx.requestId, 500);
  }
}

export async function handleTelegramCampaignPost(
  rawContext: OwnerHandlerContext,
  parts: readonly string[],
  orgId: string,
  capabilities: LeadRadarApiCapabilities,
): Promise<Response> {
  const ctx = rawContext as CampaignContext;
  try {
    if (parts.length === 2 && parts[0] === 'telegram-campaigns' && parts[1] === 'preflight') {
      const body = await exactBody(ctx, ['companyIds', 'contactBasis']);
      if (!body || !Array.isArray(body.companyIds) || body.companyIds.length < 1 || body.companyIds.length > 50
        || !body.companyIds.every((id) => typeof id === 'string' && ENTITY_ID_PATTERN.test(id))
        || new Set(body.companyIds).size !== body.companyIds.length
        || !(body.contactBasis === null || isTelegramCampaignContactBasis(body.contactBasis))) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const dataKey = campaignDataKey(ctx);
      if (!dataKey) return unavailable('telegram_campaign_not_configured', ctx);
      const probe = await telegramAccountReadiness(ctx, capabilities, orgId);
      const readiness = await withCampaignDataKeyReadiness(ctx, orgId, dataKey, probe.readiness, probe.routingKeyFingerprint, false);
      const account = await getTelegramUserAccount(ctx.db, orgId);
      const blockers: string[] = [...readiness.blockers];
      if (!capabilities.campaignOutreachEnabled) blockers.push('campaign_paused');
      if (!capabilities.campaignAutoSendEnabled) blockers.push('autosend_paused');
      if (!account || account.status !== 'connected') blockers.push('account_not_connected');
      if (account?.status === 'connected' && !await getTelegramUserAccountGatewayBinding({ db: ctx.db, orgId, dataKey, accountId: account.id })) blockers.push('account_binding_missing');
      const store = new LeadRadarTelegramCampaignStore(ctx.db);
      const now = new Date().toISOString();
      const [row, active, safety] = account ? await Promise.all([store.getAccount(orgId, account.id),
        store.getActiveCampaignForAccount(orgId, account.id), store.getAccountSafety(orgId, account.id)]) : [null, null, null];
      const dailyLimit = capabilities.telegramCampaignDailyLimit ?? 30;
      const used = row?.quota_day === now.slice(0, 10) ? row.daily_reserved_count : 0;
      const remainingToday = Math.max(0, dailyLimit - used);
      if (active) blockers.push('active_campaign_exists');
      if (remainingToday === 0) blockers.push('daily_limit_exhausted');
      if (safety && safety.state !== 'ready' && !(safety.state === 'cooldown' && safety.blocked_until && safety.blocked_until <= now)) blockers.push(`account_safety_${safety.state}`);
      const selection = await evaluateTelegramCampaignSelection({ db: ctx.db, orgId, companyIds: body.companyIds,
        dataKey, contactBasis: body.contactBasis ?? undefined, readOnly: true });
      return ownerJson({ selection, blockers: [...new Set(blockers)], checkedAt: now,
        limits: { dailyLimit, remainingToday, minimumIntervalSeconds: capabilities.telegramCampaignMinimumIntervalSeconds ?? 120,
          nextDispatchAt: row?.next_dispatch_at ?? null } }, ctx.requestId);
    }
    if (parts.length === 2 && parts[0] === 'telegram-account' && parts[1] === 'resolve-contact') {
      if (!capabilities.telegramAccountEnabled) return ownerError('lead_radar_telegram_account_paused', ctx.requestId, 409);
      const body = await exactBody(ctx, ['searchId','companyId','candidateKey']);
      if (!body || typeof body.searchId !== 'string' || !ENTITY_ID_PATTERN.test(body.searchId)
        || typeof body.companyId !== 'string' || !ENTITY_ID_PATTERN.test(body.companyId)
        || typeof body.candidateKey !== 'string' || body.candidateKey.length > 450) return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const dataKey = campaignDataKey(ctx);
      if (!dataKey) return unavailable('telegram_campaign_not_configured', ctx);
      const account = await getTelegramUserAccount(ctx.db, orgId);
      if (!account || account.status !== 'connected') return ownerError('telegram_campaign_account_state_conflict', ctx.requestId, 409);
      const binding = await getTelegramUserAccountGatewayBinding({ db: ctx.db, dataKey, orgId, accountId: account.id });
      if (!binding) return ownerError('telegram_campaign_account_state_conflict', ctx.requestId, 409);
      const result = await checkCorporateTelegramContact({ db: ctx.db, orgId, searchId: body.searchId,
        companyId: body.companyId, candidateKey: body.candidateKey, accountId: account.id,
        resolve: (target, operationId) => resolveTelegramContact({ service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
          internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN, orgId, gatewayAccountRef: binding.gatewayAccountRef, operationId, target }),
      });
      return ownerJson(result, ctx.requestId);
    }
    if (parts.length === 3
      && parts[0] === 'telegram-account'
      && parts[1] === 'bridge'
      && parts[2] === 'pairings') {
      if (!capabilities.telegramAccountEnabled) {
        return ownerError('lead_radar_telegram_account_paused', ctx.requestId, 409);
      }
      const requestKey = idempotencyKey(ctx);
      if (!requestKey) return requiredIdempotencyResponse(ctx);
      const body = await exactBody(ctx, ['label', 'enrollmentCode']);
      if (!body
        || typeof body.label !== 'string'
        || body.label.trim() !== body.label
        || body.label.length < 1
        || body.label.length > 40
        || hasControlCharacters(body.label)
        || typeof body.enrollmentCode !== 'string'
        || !LEAD_RADAR_TELEGRAM_BRIDGE_SECRET_PATTERN.test(body.enrollmentCode)) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const pairing = await createTelegramBridgePairing({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
        orgId,
        operationId: requestKey,
        label: body.label,
        enrollmentCode: body.enrollmentCode,
      });
      return ownerJson({
        pairingId: pairing.pairingId,
        expiresAt: pairing.expiresAt,
      }, ctx.requestId, 201);
    }
    if (parts.length === 4
      && parts[0] === 'telegram-account'
      && parts[1] === 'connect'
      && parts[3] === 'input') {
      if (!capabilities.telegramAccountEnabled) {
        return ownerError('lead_radar_telegram_account_paused', ctx.requestId, 409);
      }
      const body = await exactBody(ctx, ['inputCommandId', 'inputAction', 'inputEnvelope']);
      if (!body
        || typeof body.inputCommandId !== 'string'
        || !LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN.test(body.inputCommandId)
        || (body.inputAction !== 'phone' && body.inputAction !== 'code')
        || !isLeadRadarTelegramBridgeE2eEnvelope(body.inputEnvelope)) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const dataKey = campaignDataKey(ctx);
      if (!dataKey) return unavailable('telegram_campaign_not_configured', ctx);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const account = await getTelegramUserAccountByAuthRequest({
        db: ctx.db,
        dataKey,
        orgId,
        authRequestReference: parts[2],
      });
      if (!account || account.status !== 'pending') {
        return ownerError('telegram_campaign_gateway_not_found', ctx.requestId, 404);
      }
      const polled = await submitTelegramAccountAuthInput({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
        orgId,
        authId: parts[2],
        inputCommandId: body.inputCommandId,
        inputAction: body.inputAction,
        inputEnvelope: body.inputEnvelope,
      });
      if (polled.status === 'connecting') {
        return ownerJson(accountState(account, { challenge: polled, orgId }), ctx.requestId);
      }
      if (polled.status === 'connected') {
        const connected = await finalizeConnectedTelegramAccount(ctx, orgId, polled, account);
        return ownerJson(accountState(connected, { finalizingAuthId: polled.authId }), ctx.requestId);
      }
      if (polled.status === 'revoked') {
        await revokeTelegramUserAccount({ db: ctx.db, orgId, accountId: account.id });
      }
      const terminalAccount = polled.status !== 'revoked'
        ? await setTelegramUserAccountStatus({
          db: ctx.db,
          orgId,
          accountId: account.id,
          expectedVersion: account.stateVersion,
          status: 'error',
          healthy: false,
        })
        : account;
      return ownerJson(accountState(terminalAccount, {
        serviceStatus: polled.status,
        reasonCode: polled.reasonCode,
      }), ctx.requestId);
    }

    if (parts.length === 4
      && parts[0] === 'telegram-account'
      && parts[1] === 'connect'
      && parts[3] === 'password') {
      if (!capabilities.telegramAccountEnabled) {
        return ownerError('lead_radar_telegram_account_paused', ctx.requestId, 409);
      }
      const body = await exactBody(ctx, ['passwordCommandId', 'passwordEnvelope']);
      if (!body
        || typeof body.passwordCommandId !== 'string'
        || !LEAD_RADAR_TELEGRAM_BRIDGE_COMMAND_ID_PATTERN.test(body.passwordCommandId)
        || !isLeadRadarTelegramBridgeE2eEnvelope(body.passwordEnvelope)) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const dataKey = campaignDataKey(ctx);
      if (!dataKey) return unavailable('telegram_campaign_not_configured', ctx);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const account = await getTelegramUserAccountByAuthRequest({
        db: ctx.db,
        dataKey,
        orgId,
        authRequestReference: parts[2],
      });
      if (!account || account.status !== 'pending') {
        return ownerError('telegram_campaign_gateway_not_found', ctx.requestId, 404);
      }
      const polled = await submitTelegramAccountPassword({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
        orgId,
        authId: parts[2],
        passwordCommandId: body.passwordCommandId,
        passwordEnvelope: body.passwordEnvelope,
      });
      // Pages receives only a short-lived browser-to-Bridge ciphertext. The
      // Telegram password is never parsed, retained or forwarded in plaintext.
      if (polled.status === 'connecting') {
        return ownerJson(accountState(account, { challenge: polled, orgId }), ctx.requestId);
      }
      if (polled.status === 'connected') {
        const connected = await finalizeConnectedTelegramAccount(ctx, orgId, polled, account);
        return ownerJson(accountState(connected, { finalizingAuthId: polled.authId }), ctx.requestId);
      }
      if (polled.status === 'revoked') {
        await revokeTelegramUserAccount({ db: ctx.db, orgId, accountId: account.id });
      }
      const terminalAccount = polled.status !== 'revoked'
        ? await setTelegramUserAccountStatus({
          db: ctx.db,
          orgId,
          accountId: account.id,
          expectedVersion: account.stateVersion,
          status: 'error',
          healthy: false,
        })
        : account;
      return ownerJson(accountState(terminalAccount, {
        serviceStatus: polled.status,
        reasonCode: polled.reasonCode,
      }), ctx.requestId);
    }

    if (parts.length === 2
      && parts[0] === 'telegram-campaigns'
      && parts[1] === 'media') {
      if (!capabilities.campaignOutreachEnabled) {
        return ownerError('lead_radar_campaign_paused', ctx.requestId, 409);
      }
      const requestKey = idempotencyKey(ctx);
      if (!requestKey) return requiredIdempotencyResponse(ctx);
      const dataKey = campaignDataKey(ctx);
      if (!dataKey || !ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA) {
        return unavailable('telegram_campaign_media_storage_unavailable', ctx);
      }
      if (!hasPrivateTelegramAccountService(ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)) {
        return unavailable('telegram_campaign_gateway_unavailable', ctx);
      }
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const now = new Date();
      const mediaStore = new LeadRadarTelegramCampaignMediaStore(
        ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA,
      );
      const campaignStore = new LeadRadarTelegramCampaignStore(ctx.db);
      const stored = await mediaStore.upload({
        request: ctx.request,
        dataKey,
        orgId,
        idempotencyKey: requestKey,
        now,
        reserveQuota: (reservation) => campaignStore.reserveCampaignMediaQuota(
          orgId,
          reservation,
        ),
      });
      return await finishCampaignMediaCheck(ctx, orgId, stored);
    }

    if (parts.length === 3 && parts[0] === 'telegram-campaigns' && parts[1] === 'media' && parts[2] === 'check') {
      if (!capabilities.campaignOutreachEnabled) return ownerError('lead_radar_campaign_paused', ctx.requestId, 409);
      if (!ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA) return unavailable('telegram_campaign_media_storage_unavailable', ctx);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const body = await exactBody(ctx, ['mediaId', 'mediaDigest']);
      if (!isTelegramCampaignAttachmentReference(body)) return ownerError('telegram_campaign_media_invalid', ctx.requestId, 400);
      const stored = await new LeadRadarTelegramCampaignMediaStore(ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA).inspect(orgId, body);
      return await finishCampaignMediaCheck(ctx, orgId, stored);
    }

    if (parts.length === 2
      && parts[0] === 'telegram-account'
      && parts[1] === 'connect') {
      const requestKey = idempotencyKey(ctx);
      if (!requestKey) return requiredIdempotencyResponse(ctx);
      const body = await exactBodyVariants(ctx, [[], ['browserKey']]);
      const browserKey = body && Object.hasOwn(body, 'browserKey')
        ? browserKeyFromBody(body.browserKey)
        : null;
      if (!body || (Object.hasOwn(body, 'browserKey') && !browserKey)) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const gatewayProbe = await telegramAccountReadiness(ctx, capabilities, orgId);
      const readiness = gatewayProbe.readiness;
      if (readiness.status === 'blocked' || readiness.blockers.length > 0) {
        return readinessResponse(readiness, ctx);
      }
      const dataKey = campaignDataKey(ctx);
      if (!dataKey) return unavailable('telegram_campaign_not_configured', ctx);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const keyedReadiness = await withCampaignDataKeyReadiness(
        ctx,
        orgId,
        dataKey,
        readiness,
        gatewayProbe.routingKeyFingerprint,
        true,
      );
      if (keyedReadiness.status === 'blocked' || keyedReadiness.blockers.length > 0) {
        return readinessResponse(keyedReadiness, ctx);
      }
      let existing = await getTelegramUserAccount(ctx.db, orgId);
      let recoverableChallenge: TelegramAccountConnectionPoll | null = null;
      if (existing) {
        const existingBinding = await getTelegramUserAccountGatewayBinding({
          db: ctx.db,
          dataKey,
          orgId,
          accountId: existing.id,
        });
        if (existing.status !== 'pending' && existing.status !== 'error') {
          return ownerError('telegram_campaign_account_exists', ctx.requestId, 409);
        }
        if (!hasPrivateTelegramAccountService(ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)) {
          return unavailable('telegram_campaign_gateway_unavailable', ctx);
        }
        if (existing.status === 'pending') {
          let activeChallenge: TelegramAccountConnectionPoll | null = null;
          try {
            activeChallenge = await getActiveTelegramAccountConnection({
              service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
              internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
              orgId,
            });
          } catch (error) {
            if (!missingConnection(error)) throw error;
          }
          if (activeChallenge) {
            const matched = await getTelegramUserAccountByAuthRequest({
              db: ctx.db,
              dataKey,
              orgId,
              authRequestReference: activeChallenge.authId,
            });
            if (!matched || matched.id !== existing.id) {
              return ownerError('telegram_campaign_gateway_conflict', ctx.requestId, 409);
            }
            if (activeChallenge.status === 'connected') {
              const connected = await finalizeConnectedTelegramAccount(
                ctx, orgId, activeChallenge, existing,
              );
              return ownerJson(accountState(connected, { finalizingAuthId: activeChallenge.authId }), ctx.requestId);
            }
            if (activeChallenge.status === 'connecting'
              && (browserKey || activeChallenge.authState !== 'awaiting_qr')) {
              await adoptTelegramAccountConnection({
                service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
                internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
                orgId,
                authId: activeChallenge.authId,
              });
              return ownerJson(accountState(existing, {
                challenge: activeChallenge,
                orgId,
                readiness: OPERATIONALLY_READY,
              }), ctx.requestId);
            }
          }
          // The private ten-minute challenge has disappeared while the local
          // row is still pending. First make any orphaned TDLib/DO state
          // terminal (404 is the idempotent already-absent result), then revoke
          // only that tenant-scoped stale row and continue with the operator's
          // explicit new connect request. No send or provider retry is reachable
          // from this recovery path.
          await disconnectTelegramAccountService({
            service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
            internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
            orgId,
            operationId: requestKey,
            ...(existingBinding
              ? { gatewayAccountRef: existingBinding.gatewayAccountRef }
              : {}),
          });
          const revoked = await revokeTelegramUserAccount({
            db: ctx.db,
            orgId,
            accountId: existing.id,
          });
          if (!revoked) {
            return ownerError('telegram_campaign_gateway_conflict', ctx.requestId, 409);
          }
          existing = null;
        }
        // An error account may represent a half-finished login or an unhealthy
        // durable session. Reconnect first makes the private state terminal,
        // then revokes the local reference, and only then starts a new login.
        if (existing) {
          await disconnectTelegramAccountService({
            service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
            internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
            orgId,
            operationId: requestKey,
            ...(existingBinding
              ? { gatewayAccountRef: existingBinding.gatewayAccountRef }
              : {}),
          });
          const revoked = await revokeTelegramUserAccount({
            db: ctx.db,
            orgId,
            accountId: existing.id,
          });
          if (!revoked) {
            return ownerError('telegram_campaign_gateway_conflict', ctx.requestId, 409);
          }
        }
      } else {
        // A previous request may have reached the private gateway but failed
        // before its D1 row committed. Adopt that exact tenant-scoped challenge
        // on the next explicit connect. This is concurrency-safe: two handlers
        // can race to persist the same auth reference, while the loser verifies
        // the winner below and must not revoke its challenge.
        try {
          recoverableChallenge = await getActiveTelegramAccountConnection({
            service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
            internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
            orgId,
          });
        } catch (error) {
          if (!missingConnection(error)) throw error;
        }
        // A terminal private auth is history, never a recoverable challenge.
        // Older gateway versions could return it from `/active`; do not create
        // and adopt a fresh D1 pending row that points straight back to a
        // cancelled/error attempt.
        if (recoverableChallenge
          && recoverableChallenge.status !== 'connecting'
          && recoverableChallenge.status !== 'connected') {
          recoverableChallenge = null;
        }
        if (!browserKey && recoverableChallenge?.status === 'connecting'
          && recoverableChallenge.authState === 'awaiting_qr') {
          await cancelTelegramAccountConnection({
            service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
            internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
            orgId,
            authId: recoverableChallenge.authId,
          });
          recoverableChallenge = null;
        }
      }
      if (!hasPrivateTelegramAccountService(ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)) {
        return unavailable('telegram_campaign_gateway_unavailable', ctx);
      }
      const challenge = recoverableChallenge ?? (browserKey
        ? await beginTelegramAccountConnection({
          service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
          internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
          orgId,
          operationId: requestKey,
          browserKey,
        })
        : await beginTelegramAccountPhoneConnection({
          service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
          internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
          orgId,
          operationId: requestKey,
        }));
      let created: Awaited<ReturnType<typeof createTelegramUserAccountPending>>;
      try {
        created = await createTelegramUserAccountPending({
          db: ctx.db,
          dataKey,
          orgId,
          authRequestReference: challenge.authId,
          idempotencyKey: requestKey,
        });
      } catch (error) {
        let concurrent: Awaited<ReturnType<typeof getTelegramUserAccountByAuthRequest>> = null;
        try {
          concurrent = await getTelegramUserAccountByAuthRequest({
            db: ctx.db,
            dataKey,
            orgId,
            authRequestReference: challenge.authId,
          });
        } catch {
          // A storage read failure cannot prove concurrent ownership. The
          // bounded private challenge remains available for explicit recovery.
        }
        if (concurrent) {
          created = { account: concurrent, replayed: true };
        } else {
          // Never compensate a failed cross-system D1 write by cancelling the
          // private auth challenge. Durable Object requests are serialized, so
          // a cancel that entered the object just before another request's
          // adopt could still revoke the winner. The tenant-scoped challenge is
          // bounded by its TTL and the next explicit connect adopts/reconciles
          // it before creating a new QR.
          throw error;
        }
      }
      await adoptTelegramAccountConnection({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
        orgId,
        authId: challenge.authId,
      });
      if (challenge.status === 'connected') {
        const connected = await finalizeConnectedTelegramAccount(
          ctx, orgId, challenge, created.account,
        );
        return ownerJson(accountState(connected, { finalizingAuthId: challenge.authId }), ctx.requestId, created.replayed ? 200 : 201);
      }
      if (challenge.status !== 'connecting') {
        return ownerError('telegram_campaign_gateway_conflict', ctx.requestId, 409);
      }
      return ownerJson(accountState(created.account, {
        challenge,
        orgId,
        readiness: OPERATIONALLY_READY,
      }), ctx.requestId, created.replayed ? 200 : 201);
    }

    if (parts.length === 2
      && parts[0] === 'telegram-campaigns'
      && parts[1] === 'prepare') {
      if (!capabilities.campaignOutreachEnabled) {
        return ownerError('lead_radar_campaign_paused', ctx.requestId, 409);
      }
      const requestKey = idempotencyKey(ctx);
      if (!requestKey) return requiredIdempotencyResponse(ctx);
      const prepareKeys = ['accountId', 'searchId', 'leadIds', 'template', 'contactBasis'];
      const body = await exactBodyVariants(ctx, sourceBodyVariants(prepareKeys));
      const attachment = attachmentFromBody(body?.attachment);
      if (!body
        || attachment === false
        || typeof body.accountId !== 'string'
        || typeof body.template !== 'string'
        || !isTelegramCampaignContactBasis(body.contactBasis)) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const dataKey = campaignDataKey(ctx);
      const minIntervalSeconds = configuredInterval(ctx);
      if (!dataKey || minIntervalSeconds === null) {
        return unavailable('telegram_campaign_not_configured', ctx);
      }
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const operationNow = new Date();
      if (attachment) {
        if (!ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA) {
          return unavailable('telegram_campaign_media_storage_unavailable', ctx);
        }
        if (!hasPrivateTelegramAccountService(ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)) {
          return unavailable('telegram_campaign_gateway_unavailable', ctx);
        }
        if (!await new LeadRadarTelegramCampaignStore(ctx.db).isCampaignMediaActive(
          orgId,
          attachment.mediaId,
          attachment.mediaDigest,
          operationNow.toISOString(),
        )) {
          throw new TelegramCampaignMediaError('telegram_campaign_media_not_found');
        }
        const resolved = await new LeadRadarTelegramCampaignMediaStore(
          ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA,
        ).read(orgId, attachment);
        const validation = await checkTelegramCampaignMedia({
          service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
          internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
          orgId,
          operationId: requestKey,
          media: resolved,
        });
        if (validation.status === 'pending') {
          const response = ownerError(validation.reason === 'bridge_offline' ? 'telegram_campaign_bridge_offline' : 'telegram_campaign_media_check_pending', ctx.requestId, 409);
          response.headers.set('Retry-After', String(validation.retryAfterSeconds));
          return response;
        }
        if (validation.status !== 'valid') {
          throw new TelegramCampaignMediaError('telegram_campaign_media_invalid');
        }
      }
      const source = await resolveCampaignSource(ctx,orgId,body);
      const prepared = await prepareTelegramCampaign({
        db: ctx.db,
        dataKey,
        orgId,
        accountId: body.accountId,
        ...source,
        companyIds: body.leadIds as string[],
        template: body.template,
        operatorId: ctx.actor.email,
        idempotencyKey: requestKey,
        minIntervalSeconds,
        contactBasis: body.contactBasis,
        attachment,
        now: operationNow,
      });
      const publicPrepared = preparationState(prepared, body.template);
      return publicPrepared
        ? ownerJson(publicPrepared, ctx.requestId, 201)
        : ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
    }

    if (parts.length === 2
      && parts[0] === 'telegram-campaigns'
      && parts[1] === 'eligibility') {
      if (!capabilities.campaignOutreachEnabled) {
        return ownerError('lead_radar_campaign_paused', ctx.requestId, 409);
      }
      const requestKey = idempotencyKey(ctx);
      if (!requestKey) return requiredIdempotencyResponse(ctx);
      const body = await exactBody(ctx, [
        'searchId', 'leadId', 'contactBasis', 'evidenceReference', 'expiresAt',
      ]);
      if (!body
        || typeof body.searchId !== 'string'
        || typeof body.leadId !== 'string'
        || typeof body.evidenceReference !== 'string'
        || typeof body.expiresAt !== 'string'
        || !isTelegramCampaignContactBasis(body.contactBasis)) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const dataKey = campaignDataKey(ctx);
      if (!dataKey) return unavailable('telegram_campaign_not_configured', ctx);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const membership = await validateSearchSelection(ctx, orgId, body.searchId, [body.leadId]);
      if (membership === 'search_not_found') {
        return ownerError('search_not_found', ctx.requestId, 404);
      }
      if (membership !== 'ok') {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const authorized = await authorizeTelegramCampaignContact({
        db: ctx.db,
        dataKey,
        orgId,
        companyId: body.leadId,
        contactBasis: body.contactBasis,
        evidenceReference: body.evidenceReference,
        expiresAt: body.expiresAt,
        reviewerId: ctx.actor.email,
        idempotencyKey: requestKey,
      });
      return ownerJson(
        authorized.authorization,
        ctx.requestId,
        authorized.replayed ? 200 : 201,
      );
    }

    if (parts.length === 1 && parts[0] === 'telegram-campaigns') {
      if (!capabilities.campaignOutreachEnabled) {
        return ownerError('lead_radar_campaign_paused', ctx.requestId, 409);
      }
      const requestKey = idempotencyKey(ctx);
      if (!requestKey) return requiredIdempotencyResponse(ctx);
      const createKeys = [
        'accountId', 'searchId', 'leadIds', 'template', 'contactBasis', 'approvalToken',
        'selectionDigest', 'contentDigest',
      ];
      const body = await exactBodyVariants(ctx, sourceBodyVariants(createKeys));
      const attachment = attachmentFromBody(body?.attachment);
      if (!body
        || attachment === false
        || typeof body.accountId !== 'string'
        || !Array.isArray(body.leadIds)
        || typeof body.template !== 'string'
        || typeof body.approvalToken !== 'string'
        || typeof body.selectionDigest !== 'string'
        || !DIGEST_PATTERN.test(body.selectionDigest)
        || typeof body.contentDigest !== 'string'
        || !DIGEST_PATTERN.test(body.contentDigest)
        || !isTelegramCampaignContactBasis(body.contactBasis)) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const dataKey = campaignDataKey(ctx);
      const minIntervalSeconds = configuredInterval(ctx);
      if (!dataKey || minIntervalSeconds === null) {
        return unavailable('telegram_campaign_not_configured', ctx);
      }
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const operationNow = new Date();
      if (attachment) {
        if (!ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA) {
          return unavailable('telegram_campaign_media_storage_unavailable', ctx);
        }
        if (!await new LeadRadarTelegramCampaignStore(ctx.db).isCampaignMediaActive(
          orgId,
          attachment.mediaId,
          attachment.mediaDigest,
          operationNow.toISOString(),
        )) {
          throw new TelegramCampaignMediaError('telegram_campaign_media_not_found');
        }
        await new LeadRadarTelegramCampaignMediaStore(
          ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA,
        ).inspect(orgId, attachment);
      }
      const source = await resolveCampaignSource(ctx,orgId,body);
      const created = await createApprovedTelegramCampaign({
        db: ctx.db,
        dataKey,
        orgId,
        accountId: body.accountId,
        ...source,
        companyIds: body.leadIds as string[],
        template: body.template,
        operatorId: ctx.actor.email,
        approvalToken: body.approvalToken,
        expectedSelectionDigest: body.selectionDigest,
        expectedContentDigest: body.contentDigest,
        idempotencyKey: requestKey,
        minIntervalSeconds,
        contactBasis: body.contactBasis,
        attachment,
        now: operationNow,
      });
      return ownerJson(
        campaignStateWithCapabilities(created.campaign, capabilities),
        ctx.requestId,
        created.replayed ? 200 : 201,
      );
    }

    if (parts.length === 3
      && parts[0] === 'telegram-campaigns'
      && (parts[2] === 'start' || parts[2] === 'pause'
        || parts[2] === 'resume' || parts[2] === 'stop')) {
      const action = parts[2];
      const requestKey = idempotencyKey(ctx);
      if (!requestKey) return requiredIdempotencyResponse(ctx);
      if (!await exactBody(ctx, [])) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      if ((action === 'start' || action === 'resume')
        && (!capabilities.campaignOutreachEnabled || !capabilities.campaignAutoSendEnabled)) {
        return ownerError('lead_radar_campaign_autosend_paused', ctx.requestId, 409);
      }
      if ((action === 'start' || action === 'resume')
        && (!ctx.env.AUTOMATION_QUEUE
          || !hasPrivateTelegramAccountService(ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE))) {
        return unavailable('telegram_campaign_gateway_unavailable', ctx);
      }
      const dataKey = campaignDataKey(ctx);
      if (!dataKey) return unavailable('telegram_campaign_not_configured', ctx);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const transitioned = await transitionTelegramCampaign({
        db: ctx.db,
        dataKey,
        orgId,
        campaignId: parts[1],
        action,
        operatorId: ctx.actor.email,
        idempotencyKey: requestKey,
      });
      if (action === 'start' || action === 'resume') {
        await enqueueDueTelegramCampaignsForOrganization({
          db: ctx.db,
          orgId,
          sender: ctx.env.AUTOMATION_QUEUE as unknown as TelegramCampaignQueueSender,
          limit: 10,
        });
      }
      return ownerJson(
        campaignStateWithCapabilities(transitioned.campaign, capabilities),
        ctx.requestId,
      );
    }

    return ownerError('route_not_found', ctx.requestId, 404);
  } catch (error) {
    return campaignErrorResponse(error, ctx) ?? ownerError('internal_error', ctx.requestId, 500);
  }
}

export async function handleTelegramCampaignDelete(
  rawContext: OwnerHandlerContext,
  parts: readonly string[],
  orgId: string,
  capabilities: LeadRadarApiCapabilities,
): Promise<Response> {
  const ctx = rawContext as CampaignContext;
  try {
    if (parts.length === 2
      && parts[0] === 'telegram-account'
      && parts[1] === 'bridge') {
      if (!capabilities.telegramAccountEnabled) {
        return ownerError('lead_radar_telegram_account_paused', ctx.requestId, 409);
      }
      const requestKey = idempotencyKey(ctx);
      if (!requestKey) return requiredIdempotencyResponse(ctx);
      const body = await exactBody(ctx, ['deviceId']);
      if (!body
        || typeof body.deviceId !== 'string'
        || !LEAD_RADAR_TELEGRAM_BRIDGE_DEVICE_ID_PATTERN.test(body.deviceId)) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      // Replacing a Bridge is deliberately separate from account revocation.
      // A live or uncertain Telegram custody record must first complete the
      // ordinary account disconnect flow; the gateway enforces the same rule.
      const account = await getTelegramUserAccount(ctx.db, orgId);
      if (account && account.status !== 'revoked') {
        return ownerError('telegram_campaign_account_state_conflict', ctx.requestId, 409);
      }
      await revokeTelegramBridge({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
        orgId,
        operationId: requestKey,
        deviceId: body.deviceId,
      });
      return new Response(null, {
        status: 204,
        headers: {
          'Cache-Control': 'no-store',
          'X-Request-ID': ctx.requestId,
        },
      });
    }
    if (parts.length === 3
      && parts[0] === 'telegram-campaigns'
      && parts[1] === 'media') {
      if (!ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA) {
        return unavailable('telegram_campaign_media_storage_unavailable', ctx);
      }
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const mediaId = parts[2];
      if (!isTelegramCampaignAttachmentReference({
        mediaId,
        mediaDigest: '0'.repeat(64),
      })) {
        return ownerError('telegram_campaign_media_invalid', ctx.requestId, 400);
      }
      const now = new Date().toISOString();
      const campaignStore = new LeadRadarTelegramCampaignStore(ctx.db);
      const deletion = await campaignStore.claimCampaignMediaDeletion(orgId, {
        mediaId,
        now,
      });
      if (deletion === 'in_use') {
        return ownerError('telegram_campaign_media_in_use', ctx.requestId, 409);
      }
      // `missing` is an idempotent 204 but must never touch R2: a first upload
      // may have completed its conditional PUT and still be validating before
      // the D1 registry row is created. Only the D1 active->deleting CAS owns a
      // physical delete. Deleted media ids are permanent tombstones, so an old
      // deleter can never remove a later live generation (ABA).
      if (deletion === 'claimed') {
        try {
          await new LeadRadarTelegramCampaignMediaStore(
            ctx.env.LEAD_RADAR_CAMPAIGN_MEDIA,
          ).delete(orgId, mediaId);
        } catch (error) {
          await campaignStore.restoreCampaignMediaDeletion(orgId, mediaId, now);
          throw error;
        }
        await campaignStore.completeCampaignMediaDeletion(orgId, mediaId, now);
      }
      return new Response(null, {
        status: 204,
        headers: {
          'Cache-Control': 'no-store',
          'X-Request-ID': ctx.requestId,
        },
      });
    }
    if (parts.length !== 1 || parts[0] !== 'telegram-account') {
      return ownerError('route_not_found', ctx.requestId, 404);
    }
    const requestKey = idempotencyKey(ctx);
    if (!requestKey) return requiredIdempotencyResponse(ctx);
    const dataKey = campaignDataKey(ctx);
    if (!dataKey) return unavailable('telegram_campaign_not_configured', ctx);
    const schema = await campaignSchemaResponse(ctx);
    if (schema) return schema;
    const account = await getTelegramUserAccount(ctx.db, orgId);
    if (!account) return ownerJson(disconnectedAccount(), ctx.requestId);
    if (!hasPrivateTelegramAccountService(ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)) {
      return unavailable('telegram_campaign_gateway_unavailable', ctx);
    }
    const binding = await getTelegramUserAccountGatewayBinding({
      db: ctx.db,
      dataKey,
      orgId,
      accountId: account.id,
    });
    if (account.status !== 'pending' && !binding) {
      return ownerError('telegram_campaign_account_state_conflict', ctx.requestId, 409);
    }
    await disconnectTelegramAccountService({
      service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
      internalServiceToken: ctx.env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
      orgId,
      operationId: requestKey,
      ...(binding ? { gatewayAccountRef: binding.gatewayAccountRef } : {}),
    });
    await revokeTelegramUserAccount({ db: ctx.db, orgId, accountId: account.id });
    return ownerJson(disconnectedAccount('revoked', 'operator_disconnected'), ctx.requestId);
  } catch (error) {
    return campaignErrorResponse(error, ctx) ?? ownerError('internal_error', ctx.requestId, 500);
  }
}
