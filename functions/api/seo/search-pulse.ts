// GET/POST /api/seo/search-pulse
//
// Admin surface for the shared, version-aware Search Pulse service.
// GET is a dry preview; POST performs the audited one-click run.

import { requireAuth } from '../../lib/jwt';
import {
  previewSearchPulse,
  runSearchPulse,
  type SearchPulseEnv,
} from '../../lib/search-pulse/service';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const onRequestGet: PagesFunction<SearchPulseEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  return json(await previewSearchPulse(env));
};

export const onRequestPost: PagesFunction<SearchPulseEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  return json(await runSearchPulse(env, auth.email));
};
