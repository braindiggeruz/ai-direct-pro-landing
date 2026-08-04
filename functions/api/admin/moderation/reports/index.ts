/**
 * GET /api/admin/moderation/reports — the report queue.
 *
 * Read-only. The projection carries no reporter identity, no session reference
 * and no report note: a moderator acts on what was reported, not on who.
 */
import {
  methodNotAllowed,
  ownerJson,
  parseEnumFilter,
  parsePagination,
  withOwnerRole,
} from '../../../../platform/admin';
import { listReports } from '../../../../platform/admin/moderation';

const REPORT_STATUSES = ['open', 'triaged', 'resolved', 'dismissed'] as const;

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const page = parsePagination(ctx.url);
  const requested = ctx.url.searchParams.get('status');
  const status = requested === null
    ? 'open'
    : parseEnumFilter(ctx.url, 'status', REPORT_STATUSES);

  const reports = await listReports(ctx.db, { status, ...page });
  return ownerJson({
    generated_at: new Date().toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    page,
    filters: { status },
    count: reports.length,
    reports,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');
