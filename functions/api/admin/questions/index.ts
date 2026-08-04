/**
 * GET /api/admin/questions — one bounded page of the buyer-to-seller queue.
 *
 * A "question" is a `sotuvchi_handoffs` row: the escalation the agent opens
 * when it cannot answer a buyer itself. The owner sees that one exists, who it
 * is waiting on and for how long. The owner does not see what was asked or what
 * was answered — `question_text` and `reply_text` are the only free-form buyer
 * and seller words the marketplace stores, and no statement behind this route
 * selects either column.
 *
 * Read-only. There is no reply, no close and no delete: an owner answering on a
 * seller's behalf would be the platform impersonating a shop to its customer.
 */
import {
  methodNotAllowed,
  ownerJson,
  parseEnumFilter,
  parsePagination,
  withOwnerRole,
} from '../../../platform/admin';
import {
  countQuestions,
  listQuestionRows,
  operationsSummary,
  QUESTION_STATUSES,
  requireStoreFilter,
  type QuestionStatus,
} from '../../../platform/admin/operations';

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const page = parsePagination(ctx.url);
  const filters = {
    status: parseEnumFilter(ctx.url, 'status', QUESTION_STATUSES) as QuestionStatus | null,
    storeId: requireStoreFilter(ctx.url.searchParams.get('store')),
  };
  const now = new Date();

  const [questions, total, summary] = await Promise.all([
    listQuestionRows(ctx.db, { ...filters, ...page }, now),
    countQuestions(ctx.db, filters),
    operationsSummary(ctx.db),
  ]);

  return ownerJson({
    generated_at: now.toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    page,
    total,
    count: questions.length,
    read_only: true,
    sort: 'created_desc',
    filters: { status: filters.status, store: filters.storeId },
    summary,
    questions,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');
