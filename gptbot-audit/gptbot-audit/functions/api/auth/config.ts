// Public auth config — returns only non-secret values for the SPA login screen.
import type { Env } from '../../_types';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return new Response(JSON.stringify({
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
  }), { headers: { 'Content-Type': 'application/json' } });
};
