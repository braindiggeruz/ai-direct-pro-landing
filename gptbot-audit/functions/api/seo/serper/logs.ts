// GET /api/seo/serper/logs — admin JWT.
//
// Returns the SerpRunLog ledger (last 200 entries, newest first).

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { readRuns } from '../../../lib/serper/store';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const { runs } = await readRuns(env);
  return new Response(JSON.stringify({ runs }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};
