// GET /api/seo/ai/logs
//
// Returns the AI Autopilot ledger from content/seo/ai-runs.json.
// Never includes full prompts or provider raw text — only the recorded run
// metadata + approved field SUMMARIES. Safe to surface to admin UI.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { readLedger } from '../../../lib/ai-seo/store';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const ledger = await readLedger(env);
  return new Response(JSON.stringify({ runs: ledger.runs }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};
