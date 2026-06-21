// POST /api/admin/seo-autopilot/run
//
// GPTBot Control Center → SEO Autopilot launcher. Requires the existing
// admin JWT, builds the launch payload server-side, calls the existing n8n
// production webhook with the server-side `x-runable-secret` header (loaded
// from the N8N_WEBHOOK_SECRET env var), and stores the result in the AI
// Draft Inbox.
//
// The browser never sees N8N_WEBHOOK_SECRET — it lives only in
// Cloudflare Pages secrets and the server-to-server fetch.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { startSeoAutopilotJob } from '../../../lib/seo-autopilot/launch';
import { buildLaunchPayload } from '../../../lib/seo-autopilot/payload';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  // Optional payload overrides from the admin UI (e.g. topic_hint).
  let overrides: Record<string, unknown> = {};
  try {
    const ctype = request.headers.get('Content-Type') || '';
    if (ctype.toLowerCase().includes('application/json')) {
      const raw = await request.text();
      if (raw.trim()) overrides = JSON.parse(raw) as Record<string, unknown>;
    }
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // run_id is a per-launch correlation id surfaced into the n8n payload.
  const runId = `gptbot-admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = buildLaunchPayload({
    source: 'admin',
    requestedBy: auth.email,
    runId,
    overrides,
  });

  const result = await startSeoAutopilotJob({
    env,
    waitUntil,
    source: 'admin',
    requestedBy: auth.email,
    rawBody: JSON.stringify(payload),
    runableSecret: env.N8N_WEBHOOK_SECRET || '',
    requestId: runId,
    // Admins clicking the button override the overlap lock; the UI shows
    // the running job inline instead.
    blockOnOverlap: false,
  });

  if (!result.ok) {
    return json(
      {
        error: result.message,
        reason: result.reason,
        ...(result.reason === 'overlap_blocked' ? { conflicting_job_id: result.conflicting_job_id } : {}),
      },
      result.http,
    );
  }

  return json(
    {
      success: true,
      accepted: true,
      job_id: result.jobId,
      run_id: runId,
      status: result.status,
      status_url: `/api/seo-autopilot/jobs/${result.jobId}`,
      polling: {
        retry_after_seconds: 15,
        max_polls: 30,
        expected_completion_seconds: 120,
      },
      source: 'admin',
      requested_by: auth.email,
      manual_approval_required: true,
      ready_for_publish: false,
      note: 'SEO Autopilot launched. The draft will appear in /admin-tools/ai-drafts when n8n returns.',
    },
    202,
  );
};

export const onRequestGet: PagesFunction<Env> = async () =>
  json({ error: 'Method Not Allowed', detail: 'POST with admin JWT to launch.' }, 405);
