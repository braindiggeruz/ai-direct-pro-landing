// /api/admin/ai-drafts
//
//   POST  — n8n SEO Autopilot ingestion endpoint. Auth: Bearer N8N_INGEST_TOKEN.
//   GET   — admin list endpoint. Auth: JWT (existing admin auth).
//
// ALL incoming drafts are forced to status='pending_review' and never
// auto-publish. Repeated POST with the same bundle_id is idempotent.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { constantTimeEqual, listDrafts } from '../../../lib/ai-drafts/store';
import { ingestRawBundle } from '../../../lib/ai-drafts/ingest';
import type { AiDraftStatus } from '../../../../src/shared/ai-drafts';

const MAX_BODY_BYTES = 256 * 1024;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function extractBearer(req: Request): string | null {
  const h = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!h || !h.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return t || null;
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });

// -- POST = n8n ingestion (Bearer auth) ------------------------------------
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.N8N_INGEST_TOKEN) return json({ error: 'Ingestion endpoint not configured.' }, 503);
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Draft storage not configured.' }, 503);

  const token = extractBearer(request);
  if (!token) return json({ error: 'Missing Authorization bearer token' }, 401);
  if (!constantTimeEqual(token, env.N8N_INGEST_TOKEN)) {
    return json({ error: 'Invalid Authorization token' }, 401);
  }

  const ctype = request.headers.get('Content-Type') || '';
  if (!ctype.toLowerCase().includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 415);
  }

  const len = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    return json({ error: `Payload too large (>${MAX_BODY_BYTES} bytes)` }, 413);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: `Payload too large (>${MAX_BODY_BYTES} bytes)` }, 413);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const result = await ingestRawBundle(env, parsed);
  if (!result.ok) return json(result.body, result.http);
  return json(result.response, 200);
};

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
    return json({ error: (e as Error).message }, 500);
  }
};
