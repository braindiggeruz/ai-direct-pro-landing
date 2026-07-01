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
import { jsonResponse } from '../../../../lib/api-errors';

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
  if (!id) return jsonResponse({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ error: 'Draft storage not configured.' }, 503);

  let body: { status?: string; note?: string };
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const next = body.status as AiDraftStatus;
  if (!next || !(['pending_review', 'needs_revision', 'rejected'] as const).includes(next)) {
    return jsonResponse({ error: 'status must be pending_review | needs_revision | rejected' }, 400);
  }

  const current = await getDraft(env, id);
  if (!current) return jsonResponse({ error: 'Draft not found' }, 404);
  const allowed = ALLOWED[current.status] || [];
  if (next !== current.status && !allowed.includes(next)) {
    return jsonResponse({ error: `Transition not allowed: ${current.status} → ${next}` }, 409);
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : undefined;
  try {
    const updated = await updateDraftStatus(env, id, next, auth.email, note);
    return jsonResponse({ draft: updated });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
};
