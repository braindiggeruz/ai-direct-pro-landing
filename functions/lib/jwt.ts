// JWT signing / verification using `jose` (Web-Crypto compatible).
import * as jose from 'jose';
import type { Env } from '../_types';

const ALG = 'HS256';
const ISSUER = 'gptbot-seo-admin';
const EXP = '12h';
const ADMIN_ROLES = new Set(['admin', 'platform_owner']);
const SESSION_ROLES = new Set([...ADMIN_ROLES, 'support_readonly']);

export interface AdminAuthClaims {
  email: string;
  role: string;
}

function authError(error: string, status: 401 | 403): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function signToken(env: Env, payload: { email: string; role: string }): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXP)
    .sign(secret);
}

export async function verifyToken(env: Env, token: string): Promise<AdminAuthClaims | null> {
  try {
    if (typeof env.JWT_SECRET !== 'string' || !env.JWT_SECRET) return null;
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret, { issuer: ISSUER, algorithms: [ALG] });
    if (
      typeof payload.email !== 'string'
      || !payload.email
      || typeof payload.role !== 'string'
      || !payload.role
    ) {
      return null;
    }
    return { email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

async function requireRole(
  req: Request,
  env: Env,
  roles: ReadonlySet<string>,
): Promise<AdminAuthClaims | Response> {
  const auth = req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return authError('Missing token', 401);
  const claims = await verifyToken(env, token);
  if (!claims) return authError('Invalid token', 401);
  if (!roles.has(claims.role)) return authError('Insufficient role', 403);
  return claims;
}

/**
 * Privileged legacy SEO-admin authorization. The explicit compatibility role
 * and the canonical owner role are allowed; read-only and seller roles fail
 * closed before any legacy endpoint can read or mutate state.
 */
export async function requireAuth(req: Request, env: Env): Promise<AdminAuthClaims | Response> {
  return requireRole(req, env, ADMIN_ROLES);
}

/**
 * Authenticate the shared admin shell without granting legacy mutation
 * authority. Owner Control Center endpoints still enforce their own role.
 */
export async function requireAdminSession(
  req: Request,
  env: Env,
): Promise<AdminAuthClaims | Response> {
  return requireRole(req, env, SESSION_ROLES);
}
