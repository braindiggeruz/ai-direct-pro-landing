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
import type { SearchPulseRunResult } from '../../../../src/shared/search-pulse';

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

export function scheduledSearchPulseStatus(
  result: Pick<SearchPulseRunResult, 'ok' | 'indexNowConfigured'>,
): number {
  if (!result.indexNowConfigured) return 424;
  return result.ok ? 200 : 502;
}

export function cronSecretMatches(token: string | null, configured: string): boolean {
  // Wrangler's non-interactive `secret put` path may preserve the line ending
  // written to stdin. Normalise only surrounding whitespace; the secret body
  // is still compared in constant time.
  const expectedToken = configured.trim();
  return Boolean(expectedToken && token && constantTimeEqual(token, expectedToken));
}

export const onRequestPost: PagesFunction<SearchPulseEnv> = async ({ request, env }) => {
  if (!env.CRON_SECRET) {
    return json({ ok: false, error: 'CRON_SECRET is not configured.' }, 503);
  }
  const token = bearer(request);
  if (!cronSecretMatches(token, env.CRON_SECRET)) {
    return json({ ok: false, error: 'Unauthorized.' }, 401);
  }

  const result = await runSearchPulse(env, 'system:daily-search-pulse');
  // IndexNow is the required automated notification path. Google OAuth is an
  // optional sitemap re-submission enhancement: without it Google continues
  // discovering the accurate sitemap and the response carries a visible
  // `gscConfigured: false` state for the workflow warning.
  const status = scheduledSearchPulseStatus(result);
  return json({
    ...result,
    scheduled: true,
    source: 'github-actions',
  }, status);
};

export const onRequestGet: PagesFunction<Env> = async () =>
  json({ ok: false, error: 'Method Not Allowed' }, 405);
