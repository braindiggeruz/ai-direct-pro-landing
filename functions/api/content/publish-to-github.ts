// POST /api/content/publish-to-github
//
// Background:
//   The admin UI exposes a "Publish to GitHub" button that historically
//   batch-committed any local content/*.json edits to the repo. With the
//   current architecture every save (POST /api/content) already commits the
//   single file directly via the GitHub Contents API — so there is no local
//   queue to flush. This endpoint therefore returns a no-op success response,
//   which keeps the UI button working without re-introducing a stale cache.
//
//   We still require auth so an unauthenticated client cannot probe it.
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  // No-op: per-save commits already go through /api/content POST. There is
  // nothing local to flush, so report committed=0 and ok=true so the admin
  // UI confirms the action succeeded.
  return json({ ok: true, committed: 0 });
};
