import type { Env } from '../../../_types';
import { sameOrigin } from '../../../lib/gpt-chat/identity-store';
import { withOwnerRole } from '../../../platform/admin';
import { documentFailure, documentGate, handlePublicDocuments } from '../../../platform/documents/http';
import { DocumentError } from '../../../platform/documents/types';
import { hashDocument } from '../../../platform/documents/validation';

const guarded = withOwnerRole('platform_owner', async ({ request, env, actor }) => {
  if (request.method !== 'GET' && !sameOrigin(request)) return documentFailure(new DocumentError('forbidden', 403));
  return handlePublicDocuments(request, env, `owner:${await hashDocument(actor.email.toLowerCase())}`, true);
});
export const onRequest: PagesFunction<Env> = async context => {
  try { documentGate(context.env); return await guarded(context); }
  catch (error) { return documentFailure(error); }
};
