import {
  methodNotAllowed,
  ownerError,
  ownerJson,
  readOwnerBody,
  withOwnerRole,
} from '../../../platform/admin';
import {
  ensureLeadRadarSchema,
  LeadRadarBusyError,
  LeadRadarService,
  LeadRadarStore,
  LeadRadarValidationError,
  ownerOrgId,
  parseLifecycle,
  parseSearchInput,
} from '../../../platform/lead-radar';

function pathParts(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => item.split('/')).filter(Boolean);
  return (value ?? '').split('/').filter(Boolean);
}

function validationResponse(error: unknown, requestId: string): Response | null {
  return error instanceof LeadRadarValidationError
    ? ownerError(error.code, requestId, 400)
    : null;
}

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  await ensureLeadRadarSchema(ctx.db);
  const orgId = await ownerOrgId(ctx.actor.email);
  const store = new LeadRadarStore(ctx.db);
  const service = new LeadRadarService(store);
  const parts = pathParts(ctx.params.path);
  if (parts.length === 0) return ownerJson(await store.listOverview(orgId), ctx.requestId);
  if (parts.length === 2 && parts[0] === 'searches') {
    const result = await service.get(orgId, parts[1]);
    return result
      ? ownerJson(result, ctx.requestId)
      : ownerError('search_not_found', ctx.requestId, 404);
  }
  return ownerError('route_not_found', ctx.requestId, 404);
});

export const onRequestPost = withOwnerRole('platform_owner', async (ctx) => {
  await ensureLeadRadarSchema(ctx.db);
  const parts = pathParts(ctx.params.path);
  if (parts.length !== 1 || parts[0] !== 'searches') {
    return ownerError('route_not_found', ctx.requestId, 404);
  }
  try {
    const input = parseSearchInput(await readOwnerBody(ctx.request));
    const orgId = await ownerOrgId(ctx.actor.email);
    const result = await new LeadRadarService(new LeadRadarStore(ctx.db)).run(orgId, input);
    return ownerJson(result, ctx.requestId, 201);
  } catch (error) {
    const response = validationResponse(error, ctx.requestId);
    if (response) return response;
    if (error instanceof LeadRadarBusyError) {
      const busy = ownerError(error.code, ctx.requestId, 429);
      busy.headers.set('Retry-After', String(error.retryAfterSeconds));
      return busy;
    }
    throw error;
  }
});

export const onRequestPatch = withOwnerRole('platform_owner', async (ctx) => {
  await ensureLeadRadarSchema(ctx.db);
  const parts = pathParts(ctx.params.path);
  if (parts.length !== 2 || parts[0] !== 'leads') {
    return ownerError('route_not_found', ctx.requestId, 404);
  }
  try {
    const body = await readOwnerBody(ctx.request) as Record<string, unknown>;
    const lifecycle = parseLifecycle(body.lifecycle);
    const orgId = await ownerOrgId(ctx.actor.email);
    const updated = await new LeadRadarService(new LeadRadarStore(ctx.db))
      .updateLifecycle(orgId, parts[1], lifecycle);
    return updated
      ? ownerJson({ ok: true, lifecycle }, ctx.requestId)
      : ownerError('lead_not_found', ctx.requestId, 404);
  } catch (error) {
    const response = validationResponse(error, ctx.requestId);
    if (response) return response;
    throw error;
  }
});

export const onRequestDelete = methodNotAllowed('GET, POST, PATCH');
export const onRequestPut = methodNotAllowed('GET, POST, PATCH');
