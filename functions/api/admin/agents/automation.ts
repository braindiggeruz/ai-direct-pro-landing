// GET /api/admin/agents/automation — automation job view for the owner.
//
// Reads the same D1 ledger the Worker writes. The queue itself is not readable,
// so the ledger is the source of truth for what is failing, retrying or
// dead-lettered.
import {
  listAutomationJobs,
  methodNotAllowed,
  ownerJson,
  parseEnumFilter,
  parsePagination,
  withOwnerRole,
} from '../../../platform/admin';

const JOB_STATUSES = [
  'queued', 'leased', 'running', 'retry_wait',
  'awaiting_review', 'completed', 'dead_letter', 'cancelled',
] as const;

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const page = parsePagination(ctx.url);
  const status = parseEnumFilter(ctx.url, 'status', JOB_STATUSES);
  const jobs = await listAutomationJobs(ctx.db, { ...page, status });

  const totals: Record<string, number> = {};
  const rows = await ctx.db.prepare(
    'SELECT status AS k, COUNT(*) AS n FROM automation_jobs GROUP BY status',
  ).all<{ k: string; n: number }>();
  for (const row of rows.results ?? []) totals[String(row.k)] = Number(row.n);

  return ownerJson({
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    first_party_automation_enabled:
      (ctx.env.FIRST_PARTY_AUTOMATION_ENABLED || 'false').toLowerCase() === 'true',
    page,
    totals,
    failed: (totals.dead_letter ?? 0),
    retrying: (totals.retry_wait ?? 0),
    count: jobs.length,
    jobs,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');
