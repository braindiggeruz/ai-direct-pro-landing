// GET /api/seo/serper/status — admin JWT.
//
// Reports whether SERPER_API_KEY is configured + a small summary of cache /
// runs. NEVER reads the key value itself.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { readCache, readRuns, countQueriesToday } from '../../../lib/serper/store';
import type { SerperProviderStatus } from '../../../../src/shared/serp';

function json(d: unknown, status = 200): Response {
  return new Response(JSON.stringify(d), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const configured = !!env.SERPER_API_KEY;
  const [cache, runs] = await Promise.all([readCache(env), readRuns(env)]);
  const last = runs.runs[0]?.createdAt;
  const out: SerperProviderStatus = {
    configured,
    cachedSnapshots: cache.entries.length,
    totalRuns: runs.runs.length,
    lastCheckAt: last,
    queriesToday: countQueriesToday(runs.runs),
    note: configured
      ? 'Serper configured. Manual checks only — cached 7d to save credits.'
      : 'SERPER_API_KEY missing. Add it in Cloudflare Pages env to enable SERP Intelligence.',
  };
  return json(out);
};
