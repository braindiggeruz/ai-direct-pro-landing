// GET /api/seo/ai/logs
//
// Returns the AI Autopilot ledger from content/seo/ai-runs.json.
// Never includes full prompts or provider raw text — only the recorded run
// metadata + approved field SUMMARIES. Safe to surface to admin UI.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { jsonResponse } from '../../../lib/api-errors';
import { readLedger } from '../../../lib/ai-seo/store';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const ledger = await readLedger(env);
  return jsonResponse({ runs: ledger.runs });
};
