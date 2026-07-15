// POST /api/admin/ai-drafts/[id]/status
//
// Change draft status. Allowed transitions:
//   pending_review → needs_revision | rejected
//   needs_revision → pending_review | rejected
//   imported       → (no change)  // already terminal
//   rejected       → pending_review  (un-reject, e.g. ingested by mistake)
//
// Body: { status: 'needs_revision' | 'rejected' | 'pending_review', note?: string }
//
// Status='imported' MUST come from the /import endpoint only, never from
// here, so a reviewer can't fake an import.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft, updateDraftStatus } from '../../../../lib/ai-drafts/store';
import type { AiDraftStatus } from '../../../../../src/shared/ai-drafts';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const ALLOWED: Record<AiDraftStatus, AiDraftStatus[]> = {
  pending_review: ['needs_revision', 'rejected'],
  needs_revision: ['pending_review', 'rejected'],
  imported: [],
  rejected: ['pending_review'],
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Draft storage not configured.' }, 503);

  let body: { status?: string; note?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const next = body.status as AiDraftStatus;
  if (!next || !(['pending_review', 'needs_revision', 'rejected'] as const).includes(next)) {
    return json({ error: 'status must be pending_review | needs_revision | rejected' }, 400);
  }

  const current = await getDraft(env, id);
  if (!current) return json({ error: 'Draft not found' }, 404);
  const allowed = ALLOWED[current.status] || [];
  if (next !== current.status && !allowed.includes(next)) {
    return json({ error: `Transition not allowed: ${current.status} → ${next}` }, 409);
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : undefined;
  try {
    const updated = await updateDraftStatus(env, id, next, auth.email, note);
    return json({ draft: updated });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};
