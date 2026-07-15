// Request-level guards: origin allow-list, internal gateway secret, admin key,
// and bearer-token extraction. PURE checks where possible (unit-tested).
import type { FastifyRequest } from 'fastify';
import type { BackendConfig } from './env.js';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Origin is allowed when it matches ALLOWED_ORIGINS, or when absent (server-to-server). */
export function originAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true; // server-to-server (Cloudflare gateway) has no browser Origin
  return allowed.includes(origin);
}

/** True when the request carries the shared internal secret (from CF gateway). */
export function hasInternalSecret(headerVal: string | undefined, secret: string | undefined): boolean {
  if (!secret) return false;
  if (!headerVal) return false;
  return timingSafeEqual(headerVal, secret);
}

export function isAdmin(headerVal: string | undefined, adminKey: string | undefined): boolean {
  if (!adminKey || !headerVal) return false;
  return timingSafeEqual(headerVal, adminKey);
}

export function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers['authorization'];
  if (typeof h !== 'string') return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : undefined;
}

export function internalHeader(req: FastifyRequest): string | undefined {
  const v = req.headers['x-internal-secret'];
  return Array.isArray(v) ? v[0] : v;
}

export function adminHeader(req: FastifyRequest): string | undefined {
  const v = req.headers['x-admin-key'] ?? req.headers['x-internal-secret'];
  return Array.isArray(v) ? v[0] : v;
}

/** Guard for public browser-facing routes: origin must be allowed. */
export function assertOrigin(req: FastifyRequest, cfg: BackendConfig): boolean {
  const origin = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) as string | undefined;
  return originAllowed(origin, cfg.allowedOrigins);
}
