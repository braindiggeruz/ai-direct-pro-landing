// POST /api/internal/search-pulse/daily
//
// Authenticated daily entry point for GitHub Actions. The shared Search Pulse
// service remains version-aware and idempotent: unchanged URLs are a no-op.

import type { Env } from '../../../_types';
import { constantTimeEqual } from '../../../lib/ai-drafts/store';
import {
  runSearchPulse,
  type SearchPulseEnv,
} from '../../../lib/search-pulse/service';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export const onRequestPost: PagesFunction<SearchPulseEnv> = async ({ request, env }) => {
  if (!env.CRON_SECRET) {
    return json({ ok: false, error: 'CRON_SECRET is not configured.' }, 503);
  }
  const token = bearer(request);
  if (!token || !constantTimeEqual(token, env.CRON_SECRET)) {
    return json({ ok: false, error: 'Unauthorized.' }, 401);
  }

  const result = await runSearchPulse(env, 'system:daily-search-pulse');
  // Yandex/IndexNow still runs when GSC OAuth is missing, but the scheduler
  // stays red so the owner cannot mistake a partial setup for full automation.
  const status = !result.gscConfigured || !result.indexNowConfigured
    ? 424
    : result.ok ? 200 : 502;
  return json({
    ...result,
    scheduled: true,
    source: 'github-actions',
  }, status);
};

export const onRequestGet: PagesFunction<Env> = async () =>
  json({ ok: false, error: 'Method Not Allowed' }, 405);
