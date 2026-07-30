// /api/admin/ai-drafts
//
//   GET  — admin list endpoint. Auth: JWT (existing admin auth).
//   POST — permanently gone (410). This used to be the n8n SEO Autopilot
//          ingestion endpoint, authenticated with a Bearer N8N_INGEST_TOKEN.
//          n8n was retired in R0.4: drafts are now produced only by the
//          first-party pipeline, which calls the shared ingest service
//          in-process. There is no token, no feature flag and no environment
//          variable that can bring this producer back — the code is gone.
//
// Drafts still always land as status='pending_review' and never auto-publish.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { listDrafts } from '../../../lib/ai-drafts/store';
import { redactedInternalError } from '../../../lib/api-errors';
import type { AiDraftStatus } from '../../../../src/shared/ai-drafts';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });

// -- POST = retired external ingest ----------------------------------------
// 410 rather than 404: the route existed, it is deliberately withdrawn, and a
// permanent status stops any surviving external caller from retrying.
export const onRequestPost: PagesFunction<Env> = async () =>
  json({ error: 'Gone', detail: 'External draft ingestion was retired. Drafts are produced by the first-party automation pipeline only.' }, 410);

// -- GET = admin list (JWT auth) -------------------------------------------
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB) {
    return json({ drafts: [], error: 'Draft storage not configured.' }, 200);
  }
  const url = new URL(request.url);
  const status = (url.searchParams.get('status') || 'all') as AiDraftStatus | 'all';
  const locale = (url.searchParams.get('locale') || 'all') as 'ru' | 'uz' | 'all';
  const source = url.searchParams.get('source') || undefined;
  const limit = Number(url.searchParams.get('limit') || '100');
  try {
    const drafts = await listDrafts(env, { status, locale, source, limit });
    return json({ drafts });
  } catch (e) {
    return redactedInternalError('admin.ai-drafts.list', e);
  }
};
