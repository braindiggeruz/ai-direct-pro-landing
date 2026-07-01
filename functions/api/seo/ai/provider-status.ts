// GET /api/seo/ai/provider-status
//
// Returns the configuration status for each provider supported by the
// AI SEO Autopilot. The frontend uses this to render the provider cards
// and dropdown options.
//
// Reads ONLY presence of env keys — never the values themselves.
//
//   Puter   : "available" by default (loaded client-side; backend cannot probe
//             the user's network — UI does its own runtime check).
//   Gemini  : "available" if GEMINI_API_KEY is set, otherwise "missing".
//   Mock    : always "available" — deterministic, useful for offline tests.
//   Serper  : P1 stub — reports whether SERPER_API_KEY is configured. Does
//             NOT call Serper; that lives in a separate branch.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { jsonResponse } from '../../../lib/api-errors';
import type { AiProviderStatus } from '../../../../src/shared/ai-seo';

interface AiEnv extends Env {
  GEMINI_API_KEY?: string;
  SERPER_API_KEY?: string;
}

export const onRequestGet: PagesFunction<AiEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const providers: AiProviderStatus[] = [
    {
      provider: 'puter',
      availability: 'available',
      note: 'Puter.js loads only inside admin AI Autopilot tab. No API key.',
    },
    {
      provider: 'gemini',
      availability: env.GEMINI_API_KEY ? 'available' : 'missing',
      note: env.GEMINI_API_KEY
        ? 'Gemini Free fallback configured (backend-only).'
        : 'Optional. Add GEMINI_API_KEY in Cloudflare Pages env to enable backend fallback.',
    },
    {
      provider: 'mock',
      availability: 'available',
      note: 'Deterministic mock provider for tests/offline mode.',
    },
  ];

  const serper = {
    configured: !!env.SERPER_API_KEY,
    note: env.SERPER_API_KEY
      ? 'SERPER_API_KEY configured. Full SERP Intelligence will land in a follow-up branch.'
      : 'Optional. Add SERPER_API_KEY in Cloudflare Pages env to enable SERP Intelligence (P1).',
  };

  return jsonResponse({ providers, serper, generatedAt: new Date().toISOString() });
};
