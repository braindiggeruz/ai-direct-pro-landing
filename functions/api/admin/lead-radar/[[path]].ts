import {
  methodNotAllowed,
  ownerError,
  ownerJson,
  readOwnerBody,
  withOwnerRole,
} from '../../../platform/admin';
import {
  assertLeadRadarRuntimeSchema,
  buildVerifiedTelegramCorporateDraftLink,
  createTelegramBusinessSendApproval,
  createTelegramBusinessConnectLink,
  enqueueLeadRadarSearch,
  getTelegramBusinessCompanyEligibility,
  getTelegramBusinessConnectionStatus,
  isTelegramBusinessConfigurationValid,
  LeadRadarBusyError,
  LeadRadarInvalidRequestKeyError,
  LeadRadarRequestConflictError,
  LeadRadarSchemaUnavailableError,
  LeadRadarService,
  LeadRadarStore,
  LeadRadarTelegramBusinessError,
  LeadRadarValidationError,
  ownerOrgId,
  parseContactReviewStatus,
  parseLifecycle,
  parseSearchInput,
  presentLeadRadarOverview,
  presentLeadRadarSearchResult,
  purgeTelegramBusinessCompanyContact,
  purgeTelegramBusinessOrganization,
  resolveLeadRadarCapabilities,
  sendApprovedTelegramBusinessMessage,
  type LeadRadarQueueSender,
  type LeadRadarTelegramBusinessEnv,
} from '../../../platform/lead-radar';
import {
  handleTelegramCampaignDelete,
  handleTelegramCampaignGet,
  handleTelegramCampaignPost,
  isTelegramCampaignControlPath,
} from './telegram-campaign-control';

type LeadRadarTelegramPagesEnv = Parameters<typeof resolveLeadRadarCapabilities>[0]
  & LeadRadarTelegramBusinessEnv;

function pathParts(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => item.split('/')).filter(Boolean);
  return (value ?? '').split('/').filter(Boolean);
}

function validationResponse(error: unknown, requestId: string): Response | null {
  return error instanceof LeadRadarValidationError
    ? ownerError(error.code, requestId, 400)
    : null;
}

function telegramBusinessConfigured(env: LeadRadarTelegramPagesEnv): boolean {
  return isTelegramBusinessConfigurationValid(env);
}

function bodyRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedTelegramText(value: unknown): string | null {
  if (typeof value !== 'string' || value.includes('\u0000')) return null;
  const length = [...value].length;
  return value.trim().length >= 1 && length <= 4096 ? value : null;
}

function telegramErrorResponse(error: unknown, requestId: string): Response | null {
  if (!(error instanceof LeadRadarTelegramBusinessError)) return null;
  const code = error.code;
  if (code === 'telegram_business_invalid_input') return ownerError(code, requestId, 400);
  if (code === 'telegram_business_company_unmatched') return ownerError(code, requestId, 404);
  if (code === 'telegram_business_not_configured') {
    const unavailable = ownerError(code, requestId, 503);
    unavailable.headers.set('Retry-After', '300');
    return unavailable;
  }
  if (code === 'telegram_business_provider_failed') return ownerError(code, requestId, 502);
  const conflict = ownerError(code, requestId, 409);
  if (code === 'telegram_business_send_in_flight') conflict.headers.set('Retry-After', '3');
  if (code === 'telegram_business_rate_limited') conflict.headers.set('Retry-After', '30');
  return conflict;
}

async function schemaResponse(db: D1Database, requestId: string): Promise<Response | null> {
  try {
    await assertLeadRadarRuntimeSchema(db);
    return null;
  } catch (error) {
    if (error instanceof LeadRadarSchemaUnavailableError) {
      const response = ownerError(error.code, requestId, 503);
      response.headers.set('Retry-After', '300');
      return response;
    }
    throw error;
  }
}

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const orgId = await ownerOrgId(ctx.actor.email);
  const capabilities = resolveLeadRadarCapabilities(ctx.env, orgId);
  const parts = pathParts(ctx.params.path);
  if (isTelegramCampaignControlPath(parts)) {
    return handleTelegramCampaignGet(ctx, parts, orgId, capabilities);
  }
  if (parts.length === 1 && parts[0] === 'telegram-business') {
    if (!capabilities.contactEnabled) {
      return ownerJson({
        status: 'paused', canReply: false, connectedAt: null, activeCompanyChats: 0,
      }, ctx.requestId);
    }
    if (!telegramBusinessConfigured(ctx.env)) {
      return ownerJson({
        status: 'unconfigured', canReply: false, connectedAt: null, activeCompanyChats: 0,
      }, ctx.requestId);
    }
    const unavailable = await schemaResponse(ctx.db, ctx.requestId);
    if (unavailable) return unavailable;
    const status = await getTelegramBusinessConnectionStatus(ctx.db, orgId, new Date(), ctx.env);
    return ownerJson(
      status.status === 'unconfigured' ? { ...status, status: 'configured' as const } : status,
      ctx.requestId,
    );
  }
  const unavailable = await schemaResponse(ctx.db, ctx.requestId);
  if (unavailable) return unavailable;
  const store = new LeadRadarStore(ctx.db);
  const service = new LeadRadarService(store);
  if (parts.length === 0) {
    return ownerJson(
      presentLeadRadarOverview(await store.listOverview(orgId), capabilities),
      ctx.requestId,
    );
  }
  if (parts.length === 2 && parts[0] === 'searches') {
    const result = await service.get(orgId, parts[1]);
    return result
      ? ownerJson(presentLeadRadarSearchResult(result, capabilities), ctx.requestId)
      : ownerError('search_not_found', ctx.requestId, 404);
  }
  return ownerError('route_not_found', ctx.requestId, 404);
});

export const onRequestPost = withOwnerRole('platform_owner', async (ctx) => {
  const parts = pathParts(ctx.params.path);
  if (isTelegramCampaignControlPath(parts)) {
    const orgId = await ownerOrgId(ctx.actor.email);
    return handleTelegramCampaignPost(
      ctx,
      parts,
      orgId,
      resolveLeadRadarCapabilities(ctx.env, orgId),
    );
  }
  const searchRoute = parts.length === 1 && parts[0] === 'searches';
  const connectRoute = parts.length === 2
    && parts[0] === 'telegram-business' && parts[1] === 'connect';
  const prepareRoute = parts.length === 4
    && parts[0] === 'leads' && parts[2] === 'telegram' && parts[3] === 'prepare';
  const approveRoute = parts.length === 4
    && parts[0] === 'leads' && parts[2] === 'telegram' && parts[3] === 'approve';
  const sendRoute = parts.length === 4
    && parts[0] === 'leads' && parts[2] === 'telegram' && parts[3] === 'send';
  if (!searchRoute && !connectRoute && !prepareRoute && !approveRoute && !sendRoute) {
    return ownerError('route_not_found', ctx.requestId, 404);
  }
  try {
    const orgId = await ownerOrgId(ctx.actor.email);
    const capabilities = resolveLeadRadarCapabilities(ctx.env, orgId);
    if (searchRoute) {
      if (!capabilities.admissionEnabled) {
        const paused = ownerError('lead_radar_admission_paused', ctx.requestId, 503);
        paused.headers.set('Retry-After', '300');
        return paused;
      }
      const unavailable = await schemaResponse(ctx.db, ctx.requestId);
      if (unavailable) return unavailable;
      const requestKey = ctx.request.headers.get('Idempotency-Key');
      if (!requestKey) return ownerError('lead_radar_idempotency_key_required', ctx.requestId, 400);
      const input = parseSearchInput(await readOwnerBody(ctx.request));
      if (!ctx.env.AUTOMATION_QUEUE) return ownerError('automation_queue_unavailable', ctx.requestId, 503);
      const result = await enqueueLeadRadarSearch(
        new LeadRadarStore(ctx.db),
        orgId,
        input,
        ctx.env.AUTOMATION_QUEUE as unknown as LeadRadarQueueSender,
        new Date(),
        requestKey,
      );
      return ownerJson(presentLeadRadarSearchResult(result, capabilities), ctx.requestId, 202);
    }

    if (!capabilities.contactEnabled) {
      return ownerError('lead_radar_contact_paused', ctx.requestId, 409);
    }
    if (connectRoute && !telegramBusinessConfigured(ctx.env)) {
      return ownerError('telegram_business_not_configured', ctx.requestId, 503);
    }
    const unavailable = await schemaResponse(ctx.db, ctx.requestId);
    if (unavailable) return unavailable;
    if (connectRoute) {
      const requestKey = ctx.request.headers.get('Idempotency-Key');
      if (!requestKey) return ownerError('lead_radar_idempotency_key_required', ctx.requestId, 400);
      return ownerJson(
        await createTelegramBusinessConnectLink(ctx.db, ctx.env, orgId, new Date(), {
          actorId: ctx.actor.email,
          idempotencyKey: requestKey,
        }),
        ctx.requestId,
        201,
      );
    }

    const body = bodyRecord(await readOwnerBody(ctx.request));
    const text = boundedTelegramText(body?.text);
    if (!body || !text) return ownerError('telegram_business_invalid_input', ctx.requestId, 400);
    const leadId = parts[1] ?? '';
    if (prepareRoute) {
      const stored = await new LeadRadarStore(ctx.db).getLeadForEnrichment(orgId, leadId);
      if (!stored) return ownerError('lead_not_found', ctx.requestId, 404);
      const contact = stored.lead.telegramContact;
      const doNotContact = stored.lead.suppressed || stored.lead.lifecycle === 'do_not_contact';
      const manualDraftUrl = !doNotContact && contact
        ? await buildVerifiedTelegramCorporateDraftLink({
            db: ctx.db,
            orgId,
            companyId: leadId,
            website: stored.lead.website,
            contact,
            draft: text,
          })
        : null;
      const eligibility = manualDraftUrl && telegramBusinessConfigured(ctx.env)
        ? await getTelegramBusinessCompanyEligibility({
            db: ctx.db, env: ctx.env, orgId, companyId: leadId,
          })
        : { bindingId: null, activeChatEligible: false, lastInboundAt: null };
      const kind = contact?.type ?? 'unknown';
      return ownerJson({
        endpoint: {
          kind,
          verification: manualDraftUrl ? 'verified' : 'unverified',
          ownership: kind === 'business' ? 'corporate' : kind === 'human' ? 'personal' : 'unknown',
          doNotContact,
        },
        manualDraftUrl,
        ...eligibility,
      }, ctx.requestId);
    }

    if (!telegramBusinessConfigured(ctx.env)) {
      return ownerError('telegram_business_not_configured', ctx.requestId, 503);
    }
    if (typeof body.bindingId !== 'string') {
      return ownerError('telegram_business_invalid_input', ctx.requestId, 400);
    }
    if (approveRoute) {
      return ownerJson(await createTelegramBusinessSendApproval({
        db: ctx.db,
        env: ctx.env,
        orgId,
        companyId: leadId,
        bindingId: body.bindingId,
        text,
        operatorId: ctx.actor.email,
      }), ctx.requestId, 201);
    }
    const requestKey = ctx.request.headers.get('Idempotency-Key');
    if (!requestKey) return ownerError('lead_radar_idempotency_key_required', ctx.requestId, 400);
    if (typeof body.approvalToken !== 'string') {
      return ownerError('telegram_business_invalid_input', ctx.requestId, 400);
    }
    const sent = await sendApprovedTelegramBusinessMessage({
      db: ctx.db,
      env: ctx.env,
      orgId,
      companyId: leadId,
      bindingId: body.bindingId,
      text,
      idempotencyKey: requestKey,
      approvalToken: body.approvalToken,
      operatorId: ctx.actor.email,
    });
    return ownerJson(sent, ctx.requestId);
  } catch (error) {
    const response = validationResponse(error, ctx.requestId);
    if (response) return response;
    const telegramResponse = telegramErrorResponse(error, ctx.requestId);
    if (telegramResponse) return telegramResponse;
    if (error instanceof LeadRadarInvalidRequestKeyError) {
      return ownerError('lead_radar_request_key_invalid', ctx.requestId, 400);
    }
    if (error instanceof LeadRadarRequestConflictError) {
      return ownerError('lead_radar_request_key_conflict', ctx.requestId, 409);
    }
    if (error instanceof LeadRadarBusyError) {
      const busy = ownerError(error.code, ctx.requestId, 429);
      busy.headers.set('Retry-After', String(error.retryAfterSeconds));
      return busy;
    }
    throw error;
  }
});

export const onRequestPatch = withOwnerRole('platform_owner', async (ctx) => {
  const unavailable = await schemaResponse(ctx.db, ctx.requestId);
  if (unavailable) return unavailable;
  const parts = pathParts(ctx.params.path);
  if (parts[0] !== 'leads') {
    return ownerError('route_not_found', ctx.requestId, 404);
  }
  try {
    const body = await readOwnerBody(ctx.request) as Record<string, unknown>;
    const orgId = await ownerOrgId(ctx.actor.email);
    const capabilities = resolveLeadRadarCapabilities(ctx.env, orgId);
    if (parts.length === 4 && parts[2] === 'decision-makers') {
      const contactReviewStatus = parseContactReviewStatus(body.contactReviewStatus);
      if (!capabilities.contactEnabled && contactReviewStatus !== 'rejected') {
        return ownerError('lead_radar_contact_paused', ctx.requestId, 409);
      }
      const reviewed = await new LeadRadarStore(ctx.db).reviewDecisionMaker(
        orgId,
        parts[1],
        parts[3],
        contactReviewStatus,
        new Date().toISOString(),
      );
      return reviewed
        ? ownerJson({
            ok: true,
            contactReviewStatus: reviewed.contactReviewStatus,
            contactReviewedAt: reviewed.contactReviewedAt,
          }, ctx.requestId)
        : ownerError('decision_maker_not_found', ctx.requestId, 404);
    }
    if (parts.length !== 2) return ownerError('route_not_found', ctx.requestId, 404);
    const lifecycle = parseLifecycle(body.lifecycle);
    if (!capabilities.contactEnabled && lifecycle !== 'do_not_contact') {
      return ownerError('lead_radar_contact_paused', ctx.requestId, 409);
    }
    const updated = await new LeadRadarService(new LeadRadarStore(ctx.db))
      .updateLifecycle(orgId, parts[1], lifecycle);
    if (updated && lifecycle === 'do_not_contact') {
      await purgeTelegramBusinessCompanyContact(ctx.db, orgId, parts[1]);
    }
    return updated
      ? ownerJson({ ok: true, lifecycle }, ctx.requestId)
      : ownerError('lead_not_found', ctx.requestId, 404);
  } catch (error) {
    const response = validationResponse(error, ctx.requestId);
    if (response) return response;
    throw error;
  }
});

export const onRequestDelete = withOwnerRole('platform_owner', async (ctx) => {
  const parts = pathParts(ctx.params.path);
  if (isTelegramCampaignControlPath(parts)) {
    const orgId = await ownerOrgId(ctx.actor.email);
    return handleTelegramCampaignDelete(
      ctx,
      parts,
      orgId,
      resolveLeadRadarCapabilities(ctx.env, orgId),
    );
  }
  if (parts.length !== 1 || parts[0] !== 'telegram-business') {
    return ownerError('route_not_found', ctx.requestId, 404);
  }
  const unavailable = await schemaResponse(ctx.db, ctx.requestId);
  if (unavailable) return unavailable;
  await purgeTelegramBusinessOrganization(
    ctx.db,
    await ownerOrgId(ctx.actor.email),
  );
  return ownerJson({ ok: true }, ctx.requestId);
});
export const onRequestPut = methodNotAllowed('GET, POST, PATCH, DELETE');
