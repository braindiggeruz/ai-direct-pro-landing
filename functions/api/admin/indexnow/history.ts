// GET /api/admin/indexnow/history?limit=50 — admin JWT.
//
// Returns the most recent IndexNow submission rows from D1.
// Used by the /admin-tools/indexnow page to render the audit table
// underneath the bulk-submit checklist.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { readRecentHistory } from '../../../../lib/indexnow/audit';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const limitRaw = parseInt(url.searchParams.get('limit') || '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100;

  const rows = await readRecentHistory(env, limit).catch(() => []);
  // Group by batch_id so the UI can render "1 batch · N urls".
  const batches = new Map<string, {
    batch_id: string;
    submitted_at: string;
    actor_email: string;
    upstream_status: number;
    upstream_ok: boolean;
    duration_ms: number;
    url_count: number;
    error: string | null;
  }>();
  for (const r of rows) {
    const cur = batches.get(r.batch_id);
    if (!cur) {
      batches.set(r.batch_id, {
        batch_id: r.batch_id,
        submitted_at: r.submitted_at,
        actor_email: r.actor_email,
        upstream_status: r.upstream_status,
        upstream_ok: r.upstream_ok === 1,
        duration_ms: r.duration_ms,
        url_count: 1,
        error: r.error,
      });
    } else {
      cur.url_count++;
    }
  }
  const out = Array.from(batches.values()).sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));
  return json({ ok: true, total: out.length, batches: out });
};
