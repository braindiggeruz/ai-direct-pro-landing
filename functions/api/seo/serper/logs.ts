// GET /api/seo/serper/logs — admin JWT.
//
// Returns the SerpRunLog ledger (last 200 entries, newest first).

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { jsonResponse } from '../../../lib/api-errors';
import { readRuns } from '../../../lib/serper/store';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const { runs } = await readRuns(env);
  return jsonResponse({ runs });
};
