// P3.1 platform-role authorization.
//
// One entry point, `requirePlatformRole`, so no endpoint can invent its own
// notion of "is this the owner". It fails closed: an unknown, absent or
// misspelled role is denied, never treated as read-only and never treated as
// owner.
//
// The role comes from the signed JWT claim only. There is deliberately no
// query parameter, header or body field that can select a role or an org, so
// a support user cannot escalate and an owner cannot impersonate a seller.
import type { Env } from '../../_types';
import * as jose from 'jose';

export const PLATFORM_ROLES = ['platform_owner', 'support_readonly'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Roles allowed to mutate. Everything else is read-only at most. */
const MUTATING_ROLES: ReadonlySet<PlatformRole> = new Set<PlatformRole>(['platform_owner']);
const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'gptbot-seo-admin';
const MAX_ACTOR_EMAIL_LENGTH = 200;

// Backward compatibility: tokens minted before P3.1 carry `role: 'admin'`.
// That is the single-admin owner, so it maps to platform_owner. The mapping is
// explicit rather than a fallback, so a future role cannot slip through by
// accident.
const ROLE_ALIASES: Readonly<Record<string, PlatformRole>> = {
  admin: 'platform_owner',
  platform_owner: 'platform_owner',
  support_readonly: 'support_readonly',
};

export interface PlatformActor {
  email: string;
  role: PlatformRole;
}

async function verifyPlatformToken(
  env: Env,
  token: string,
): Promise<{ email: unknown; role: unknown } | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      algorithms: [JWT_ALGORITHM],
    });
    return { email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export type PlatformAuthFailure =
  | 'missing_token'
  | 'invalid_token'
  | 'unknown_role'
  | 'insufficient_role';

function deny(code: PlatformAuthFailure, requestId: string): Response {
  // 401 when we cannot establish who the caller is, 403 when we can but they
  // are not allowed. Both bodies are closed-list tokens with no detail.
  const status = code === 'missing_token' || code === 'invalid_token' ? 401 : 403;
  return new Response(JSON.stringify({ error: code, request_id: requestId }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'x-request-id': requestId,
    },
  });
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID().replaceAll('-', '')}`;
}

/**
 * Resolve the caller's platform role, or return the response to send.
 *
 * `minimum` is the weakest role that may proceed. Pass 'platform_owner' for any
 * mutation; pass 'support_readonly' for a read.
 */
export async function requirePlatformRole(
  request: Request,
  env: Env,
  minimum: PlatformRole,
  requestId: string = newRequestId(),
): Promise<PlatformActor | Response> {
  const header = request.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return deny('missing_token', requestId);

  // verifyToken enforces the issuer, the HS256 algorithm and the expiry, and
  // returns null on any failure, so a malformed, expired or foreign-issuer
  // token lands in the same closed branch.
  const claims = await verifyPlatformToken(env, token);
  if (
    !claims
    || typeof claims.email !== 'string'
    || !claims.email
    || claims.email.length > MAX_ACTOR_EMAIL_LENGTH
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)
  ) {
    return deny('invalid_token', requestId);
  }

  const role = ROLE_ALIASES[String(claims.role)];
  if (!role) return deny('unknown_role', requestId);

  if (minimum === 'platform_owner' && !MUTATING_ROLES.has(role)) {
    return deny('insufficient_role', requestId);
  }

  return { email: claims.email, role };
}

export function canMutate(role: PlatformRole): boolean {
  return MUTATING_ROLES.has(role);
}
