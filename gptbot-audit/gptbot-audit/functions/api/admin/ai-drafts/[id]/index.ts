// /api/admin/ai-drafts/[id]
//
//   GET     — fetch full draft + audit trail. Auth: JWT.
//   DELETE  — remove a draft permanently (audit row preserved by writing audit
//             BEFORE the DELETE). Auth: JWT.
//
// Status changes and import marking are handled by sibling routes:
//   POST /api/admin/ai-drafts/[id]/status
//   POST /api/admin/ai-drafts/[id]/import

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { deleteDraft, getAuditTrail, getDraft } from '../../../../lib/ai-drafts/store';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Draft storage not configured.' }, 503);
  try {
    const draft = await getDraft(env, id);
    if (!draft) return json({ error: 'Draft not found' }, 404);
    const audit = await getAuditTrail(env, id);
    return json({ draft, audit });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Draft storage not configured.' }, 503);
  const draft = await getDraft(env, id);
  if (!draft) return json({ error: 'Draft not found' }, 404);
  // Safety: only allow delete when status is rejected OR pending_review with
  // no per-locale import recorded. Imported drafts MUST stay for traceability.
  if (draft.status === 'imported' || draft.ru_imported_at || draft.uz_imported_at) {
    return json({ error: 'Cannot delete: bundle was already imported. Mark as rejected instead.' }, 409);
  }
  try {
    const ok = await deleteDraft(env, id, auth.email);
    return json({ ok });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};
