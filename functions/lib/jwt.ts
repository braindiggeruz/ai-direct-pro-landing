// JWT signing / verification using `jose` (Web-Crypto compatible).
import * as jose from 'jose';
import type { Env } from '../_types';

const ALG = 'HS256';
const ISSUER = 'gptbot-seo-admin';
const EXP = '12h';

export async function signToken(env: Env, payload: { email: string; role: string }): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXP)
    .sign(secret);
}

export async function verifyToken(env: Env, token: string): Promise<{ email: string; role: string } | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret, { issuer: ISSUER });
    return { email: payload.email as string, role: payload.role as string };
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, env: Env): Promise<{ email: string; role: string } | Response> {
  const auth = req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return new Response(JSON.stringify({ error: 'Missing token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const claims = await verifyToken(env, token);
  if (!claims) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  return claims;
}
