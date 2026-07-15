// Cloudflare → Railway gateway helper.
//
// When RAILWAY_GPT_API_URL + GPTBOT_INTERNAL_API_SECRET are configured, the
// /api/gpt/* Functions forward the request to the Railway backend and return
// its response verbatim. On ANY failure (unset, network, 5xx) the caller falls
// back to the existing D1 implementation so production chat never fully breaks.
//
// The internal secret + the client IP + the user's Authorization header are
// forwarded; the secret NEVER reaches the browser.
import type { Env } from '../../_types';

export function gatewayConfigured(env: Env): boolean {
  return !!(env.RAILWAY_GPT_API_URL && env.GPTBOT_INTERNAL_API_SECRET);
}

export interface GatewayResult {
  proxied: boolean;
  response?: Response;
}

/**
 * Forward a request to the Railway backend. Returns { proxied:false } when the
 * gateway is not configured OR the upstream call fails/times out — signalling
 * the caller to run the local D1 fallback. A 4xx from Railway IS returned
 * (it's a valid business response like quota/validation), only transport
 * failures and 5xx trigger fallback.
 */
export async function proxyToRailway(
  env: Env,
  request: Request,
  path: string,
  init?: { method?: string; bodyText?: string | null },
): Promise<GatewayResult> {
  if (!gatewayConfigured(env)) return { proxied: false };

  const base = env.RAILWAY_GPT_API_URL!.replace(/\/+$/, '');
  const url = `${base}${path}`;
  const method = init?.method || request.method;

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('X-Internal-Secret', env.GPTBOT_INTERNAL_API_SECRET!);
  // Forward the real client IP so the backend hashes the correct address.
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.set('CF-Connecting-IP', ip);
  const auth = request.headers.get('Authorization');
  if (auth) headers.set('Authorization', auth);
  // Preserve the browser Origin so the backend's allow-list check passes.
  const origin = request.headers.get('Origin');
  if (origin) headers.set('Origin', origin);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const upstream = await fetch(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : (init?.bodyText ?? (await request.clone().text())),
      signal: controller.signal,
    });
    clearTimeout(timer);
    // 5xx from Railway → treat as unavailable, fall back to D1.
    if (upstream.status >= 500) return { proxied: false };
    return { proxied: true, response: upstream };
  } catch {
    clearTimeout(timer);
    return { proxied: false }; // network/timeout → fallback
  }
}

/** Copy an upstream Response into a new one with no-store headers. */
export async function relay(upstream: Response): Promise<Response> {
  const body = await upstream.text();
  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(body, { status: upstream.status, headers });
}
