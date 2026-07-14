// GET /api/indexnow/key — public key file route.
//
// IndexNow protocol requires a publicly reachable file containing the
// API key. The doc example uses /<key>.txt at the host root, but the
// spec actually accepts any URL via the keyLocation field. By serving
// the key from a Pages Function we keep the value in Cloudflare
// secrets only — the repo never sees it.
//
// The caller (api.indexnow.org) will GET this URL with no auth and
// expects a plain-text response equal to the key. We return 503 when
// INDEXNOW_KEY is missing so search engines retry rather than cache a
// 200 with empty body.
//
// IMPORTANT: this route must remain public (no JWT). Bing/Yandex
// crawlers are unauthenticated.

import type { Env } from '../../_types';

interface IndexNowEnv extends Env {
  INDEXNOW_KEY?: string;
}

export const onRequestGet: PagesFunction<IndexNowEnv> = async ({ env }) => {
  const key = env.INDEXNOW_KEY;
  if (!key || !/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    return new Response('INDEXNOW_KEY not configured', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  // Plain text body must equal the key, byte-for-byte. No leading/trailing
  // whitespace. Cache for 1 day to spare CPU; key rotation requires a
  // deploy anyway.
  return new Response(key, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'X-Robots-Tag': 'noindex',
    },
  });
};
