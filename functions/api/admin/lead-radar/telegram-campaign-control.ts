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
  getTelegramCampaignRecovery,
  getTelegramUserAccount,
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
  transitionTelegramCampaign,
  type TelegramAccountReadModel,
  type TelegramCampaignQueueSender,
  type TelegramCampaignReadModel,
  type TelegramCampaignSelectionEvaluation,
} from '../../../platform/lead-radar';
import {
  beginTelegramAccountConnection,
  disconnectTelegramAccountService,
  getActiveTelegramAccountConnection,
  hasPrivateTelegramAccountService,
  pollTelegramAccountConnection,
  TelegramAccountServiceError,
  type TelegramAccountConnectChallenge,
  type TelegramAccountConnectionPoll,
} from '../../../platform/lead-radar/telegram-account-service';
import type { LeadRadarApiCapabilities } from '../../../../src/shared/lead-radar';

const ENTITY_ID_PATTERN = /^[A-Za-z0-9:_-]{1,80}$/u;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{8,160}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_TEMPLATE_CODE_POINTS = 4_096;
const MAX_TEMPLATE_BYTES = 16_384;
const campaignSchemaPass = new WeakMap<D1Database, Promise<boolean>>();

type CampaignContext = OwnerHandlerContext & {
  env: OwnerHandlerContext['env'] & {
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE?: Fetcher;
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
    qrCodeDataUrl: string | null;
    qrLoginUrl: string | null;
    expiresAt: string;
  } | null;
  reasonCode: string | null;
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
  const parsed = Number(ctx.env.LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS);
  return Number.isInteger(parsed) && parsed >= 30 && parsed <= 3_600 ? parsed : null;
}

function disconnectedAccount(
  status: AccountState['status'] = 'disconnected',
  reasonCode: string | null = null,
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
    reasonCode,
  };
}

function accountState(
  account: TelegramAccountReadModel,
  options: {
    challenge?: TelegramAccountConnectChallenge;
    serviceStatus?: TelegramAccountConnectionPoll['status'];
    reasonCode?: string | null;
  } = {},
): AccountState {
  const status = options.serviceStatus ?? (
    account.status === 'pending'
      ? 'connecting'
      : account.status
  );
  const challenge = options.challenge;
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
      qrCodeDataUrl: challenge.qrCodeDataUrl,
      qrLoginUrl: challenge.qrLoginUrl,
      expiresAt: challenge.expiresAt,
    } : null,
    reasonCode: options.reasonCode ?? null,
  };
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
    && !rendered.includes('\u0000')
    && [...rendered].length <= MAX_TEMPLATE_CODE_POINTS
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
  if (error instanceof TelegramAccountServiceError) {
    if (error.code === 'telegram_campaign_gateway_unavailable') {
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

export async function handleTelegramCampaignGet(
  rawContext: OwnerHandlerContext,
  parts: readonly string[],
  orgId: string,
  capabilities: LeadRadarApiCapabilities,
): Promise<Response> {
  const ctx = rawContext as CampaignContext;
  try {
    if (parts.length === 1 && parts[0] === 'telegram-account') {
      if (!capabilities.telegramAccountEnabled) {
        return ownerJson(disconnectedAccount('unconfigured', 'telegram_account_disabled'), ctx.requestId);
      }
      const dataKey = campaignDataKey(ctx);
      if (!dataKey) {
        return ownerJson(disconnectedAccount('unconfigured', 'campaign_data_key_missing'), ctx.requestId);
      }
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const account = await getTelegramUserAccount(ctx.db, orgId);
      if (!account) return ownerJson(disconnectedAccount(), ctx.requestId);
      if (account.status !== 'pending') return ownerJson(accountState(account), ctx.requestId);
      if (!hasPrivateTelegramAccountService(ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)) {
        return unavailable('telegram_campaign_gateway_unavailable', ctx);
      }
      const challenge = await getActiveTelegramAccountConnection({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        orgId,
      });
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
      return ownerJson(accountState(account, { challenge }), ctx.requestId);
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
      const polled = await pollTelegramAccountConnection({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        orgId,
        authId: parts[2],
      });
      if (polled.status === 'connecting') {
        return ownerJson(accountState(account, { challenge: polled }), ctx.requestId);
      }
      if (polled.status === 'connected') {
        const connected = account.status === 'connected'
          ? account
          : await completeTelegramUserAccountConnection({
            db: ctx.db,
            dataKey: key,
            orgId,
            accountId: account.id,
            gatewayAccountRef: polled.accountRef,
            expectedVersion: account.stateVersion,
            maskedLabel: polled.maskedLabel,
          });
        return ownerJson(accountState(connected), ctx.requestId);
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
      const searchId = new URL(ctx.request.url).searchParams.get('searchId');
      if (!searchId || !ENTITY_ID_PATTERN.test(searchId)) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const recovery = await getTelegramCampaignRecovery({
        db: ctx.db,
        orgId,
        searchId,
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
    if (parts.length === 2
      && parts[0] === 'telegram-account'
      && parts[1] === 'connect') {
      if (!capabilities.telegramAccountEnabled) {
        return ownerError('lead_radar_telegram_account_paused', ctx.requestId, 409);
      }
      const requestKey = idempotencyKey(ctx);
      if (!requestKey) return requiredIdempotencyResponse(ctx);
      if (!await exactBody(ctx, [])) {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const dataKey = campaignDataKey(ctx);
      if (!dataKey) return unavailable('telegram_campaign_not_configured', ctx);
      const schema = await campaignSchemaResponse(ctx);
      if (schema) return schema;
      const existing = await getTelegramUserAccount(ctx.db, orgId);
      if (existing) {
        if (existing.status !== 'pending' && existing.status !== 'error') {
          return ownerError('telegram_campaign_account_exists', ctx.requestId, 409);
        }
        if (!hasPrivateTelegramAccountService(ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)) {
          return unavailable('telegram_campaign_gateway_unavailable', ctx);
        }
        if (existing.status === 'pending') {
          const activeChallenge = await getActiveTelegramAccountConnection({
            service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
            orgId,
          });
          const matched = await getTelegramUserAccountByAuthRequest({
            db: ctx.db,
            dataKey,
            orgId,
            authRequestReference: activeChallenge.authId,
          });
          if (!matched || matched.id !== existing.id) {
            return ownerError('telegram_campaign_gateway_conflict', ctx.requestId, 409);
          }
          return ownerJson(accountState(existing, { challenge: activeChallenge }), ctx.requestId);
        }
        // An error account may represent a half-finished login or an unhealthy
        // durable session. Reconnect first makes the private state terminal,
        // then revokes the local reference, and only then starts a new login.
        await disconnectTelegramAccountService({
          service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
          orgId,
          operationId: requestKey,
        });
        await revokeTelegramUserAccount({ db: ctx.db, orgId, accountId: existing.id });
      }
      if (!hasPrivateTelegramAccountService(ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)) {
        return unavailable('telegram_campaign_gateway_unavailable', ctx);
      }
      const challenge = await beginTelegramAccountConnection({
        service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
        orgId,
        operationId: requestKey,
      });
      const created = await createTelegramUserAccountPending({
        db: ctx.db,
        dataKey,
        orgId,
        authRequestReference: challenge.authId,
        idempotencyKey: requestKey,
      });
      return ownerJson(accountState(created.account, { challenge }), ctx.requestId, 201);
    }

    if (parts.length === 2
      && parts[0] === 'telegram-campaigns'
      && parts[1] === 'prepare') {
      if (!capabilities.campaignOutreachEnabled) {
        return ownerError('lead_radar_campaign_paused', ctx.requestId, 409);
      }
      const requestKey = idempotencyKey(ctx);
      if (!requestKey) return requiredIdempotencyResponse(ctx);
      const body = await exactBody(ctx, [
        'accountId', 'searchId', 'leadIds', 'template', 'contactBasis',
      ]);
      if (!body
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
      const membership = await validateSearchSelection(
        ctx, orgId, body.searchId, body.leadIds,
      );
      if (membership === 'search_not_found') {
        return ownerError('search_not_found', ctx.requestId, 404);
      }
      if (membership !== 'ok') {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const prepared = await prepareTelegramCampaign({
        db: ctx.db,
        dataKey,
        orgId,
        accountId: body.accountId,
        searchId: body.searchId as string,
        companyIds: body.leadIds as string[],
        template: body.template,
        operatorId: ctx.actor.email,
        idempotencyKey: requestKey,
        minIntervalSeconds,
        contactBasis: body.contactBasis,
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
      const body = await exactBody(ctx, [
        'accountId', 'searchId', 'leadIds', 'template', 'contactBasis', 'approvalToken',
        'selectionDigest', 'contentDigest',
      ]);
      if (!body
        || typeof body.accountId !== 'string'
        || typeof body.searchId !== 'string'
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
      const membership = await validateSearchSelection(
        ctx, orgId, body.searchId, body.leadIds,
      );
      if (membership === 'search_not_found') {
        return ownerError('search_not_found', ctx.requestId, 404);
      }
      if (membership !== 'ok') {
        return ownerError('telegram_campaign_invalid_input', ctx.requestId, 400);
      }
      const created = await createApprovedTelegramCampaign({
        db: ctx.db,
        dataKey,
        orgId,
        accountId: body.accountId,
        searchId: body.searchId,
        companyIds: body.leadIds as string[],
        template: body.template,
        operatorId: ctx.actor.email,
        approvalToken: body.approvalToken,
        expectedSelectionDigest: body.selectionDigest,
        expectedContentDigest: body.contentDigest,
        idempotencyKey: requestKey,
        minIntervalSeconds,
        contactBasis: body.contactBasis,
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
): Promise<Response> {
  const ctx = rawContext as CampaignContext;
  try {
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
    await disconnectTelegramAccountService({
      service: ctx.env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
      orgId,
      operationId: requestKey,
    });
    await revokeTelegramUserAccount({ db: ctx.db, orgId, accountId: account.id });
    return ownerJson(disconnectedAccount('revoked', 'operator_disconnected'), ctx.requestId);
  } catch (error) {
    return campaignErrorResponse(error, ctx) ?? ownerError('internal_error', ctx.requestId, 500);
  }
}
