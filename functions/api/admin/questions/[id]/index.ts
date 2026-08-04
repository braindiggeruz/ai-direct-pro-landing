/**
 * GET /api/admin/questions/:id — one handoff, still without its words.
 *
 * The detail adds delivery bookkeeping — when the seller was notified, how many
 * attempts each direction took, whether the content window has already cleared
 * — because that is what distinguishes "the seller is ignoring this" from "the
 * notification never arrived", and those two need different responses from an
 * owner. It adds no message text, no buyer identity and no channel address.
 */
import {
  firstParam,
  methodNotAllowed,
  ownerError,
  ownerJson,
  requireIdentifier,
  withOwnerRole,
} from '../../../../platform/admin';
import { getQuestionDetail } from '../../../../platform/admin/operations';

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const id = requireIdentifier(firstParam(ctx.params, 'id'), 'invalid_question_id');
  const question = await getQuestionDetail(ctx.db, id, new Date());
  if (!question) return ownerError('question_not_found', ctx.requestId, 404);
  return ownerJson({
    generated_at: new Date().toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    read_only: true,
    question,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');
