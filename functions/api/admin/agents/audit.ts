// GET /api/admin/agents/audit — the owner audit timeline.
//
// Read-only for both roles. There is no endpoint that edits or deletes an audit
// event: the table is append-only by contract, and nothing in this codebase
// issues an UPDATE or DELETE against it.
import {
  countOwnerAuditEvents,
  listOwnerAuditEvents,
  methodNotAllowed,
  OWNER_AUDIT_ACTIONS,
  ownerJson,
  parseEnumFilter,
  parsePagination,
  PLATFORM_ROLES,
  requireActorEmailFilter,
  requireIdentifier,
  withOwnerRole,
} from '../../../platform/admin';

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const page = parsePagination(ctx.url);
  const rawTarget = ctx.url.searchParams.get('target_id');
  const targetId = rawTarget ? requireIdentifier(rawTarget, 'invalid_target_id') : null;
  const rawActorEmail = ctx.url.searchParams.get('actor_email');
  const filters = {
    action: parseEnumFilter(ctx.url, 'action', OWNER_AUDIT_ACTIONS),
    targetId,
    actorEmail: rawActorEmail ? requireActorEmailFilter(rawActorEmail) : null,
    actorRole: parseEnumFilter(ctx.url, 'actor_role', PLATFORM_ROLES),
  };
  const events = await listOwnerAuditEvents(ctx.db, {
    ...page,
    ...filters,
  });
  return ownerJson({
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    page,
    total: await countOwnerAuditEvents(ctx.db, filters),
    count: events.length,
    append_only: true,
    events,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');
