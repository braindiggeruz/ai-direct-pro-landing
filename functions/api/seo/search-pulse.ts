// GET/POST /api/seo/search-pulse
//
// Admin surface for the shared, version-aware Search Pulse service.
// GET is a dry preview; POST performs the audited one-click run.

import { requireAuth } from '../../lib/jwt';
import { jsonResponse } from '../../lib/api-errors';

import {
  previewSearchPulse,
  runSearchPulse,
  type SearchPulseEnv,
} from '../../lib/search-pulse/service';

export const onRequestGet: PagesFunction<SearchPulseEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  return jsonResponse(await previewSearchPulse(env));
};

export const onRequestPost: PagesFunction<SearchPulseEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  return jsonResponse(await runSearchPulse(env, auth.email));
};
