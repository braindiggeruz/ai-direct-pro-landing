import type { Env } from '../../../_types';
import { sameOrigin } from '../../../lib/gpt-chat/identity-store';
import { buyerSubject, hasBuyerCookie, readBuyer } from '../../../lib/studio/full-deck';
import { readIdentity } from '../../../lib/studio/identity';
import { documentFailure, documentGate, handlePublicDocuments } from '../../../platform/documents/http';
import { DocumentError } from '../../../platform/documents/types';

export const onRequest: PagesFunction<Env & { GPT_IDENTITY_SECRET?: string }> = async ({ request, env }) => {
  try {
    documentGate(env);
    if (request.method !== 'GET' && !sameOrigin(request)) throw new DocumentError('forbidden', 403);
    const buyer = hasBuyerCookie(request) ? await readBuyer(request, env.GPTBOT_DRAFTS_DB!, Date.now()) : null;
    const subject = buyer ? buyerSubject(buyer) : (await readIdentity(request, env))?.subject;
    if (!subject) throw new DocumentError('identity_required', 401);
    return handlePublicDocuments(request, env, `studio:${subject}`, false);
  } catch (error) { return documentFailure(error); }
};
