// Supabase server client (secret key, server-only) + Supabase JWT verification
// via JWKS. Client is created lazily so the service can boot with Supabase
// unconfigured (health reports configured=false instead of crashing).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { BackendConfig } from './env.js';

let _client: SupabaseClient | null = null;

/** Server client using the SECRET key. Bypasses RLS — used only server-side. */
export function getSupabase(cfg: BackendConfig): SupabaseClient | null {
  if (!cfg.supabase.url || !cfg.supabase.secretKey) return null;
  if (!_client) {
    _client = createClient(cfg.supabase.url, cfg.supabase.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

// JWKS cache for token verification (Supabase JWT signing keys).
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function jwks(cfg: BackendConfig) {
  if (!_jwks) {
    const url = cfg.supabase.jwksUrl || (cfg.supabase.url ? `${cfg.supabase.url}/auth/v1/.well-known/jwks.json` : undefined);
    if (!url) return null;
    _jwks = createRemoteJWKSet(new URL(url));
  }
  return _jwks;
}

export interface AuthedUser {
  id: string;
  email?: string;
}

/**
 * Verify a Supabase access token. Returns the user (sub/email) or null.
 * NEVER trusts a client-supplied user_id — identity comes only from a
 * cryptographically verified JWT.
 */
export async function verifySupabaseJwt(cfg: BackendConfig, token: string | undefined): Promise<AuthedUser | null> {
  if (!token) return null;
  const set = jwks(cfg);
  if (!set) return null;
  try {
    const { payload } = await jwtVerify(token, set, {
      // Supabase tokens use aud "authenticated".
      audience: 'authenticated',
    });
    if (!payload.sub) return null;
    return { id: String(payload.sub), email: typeof payload.email === 'string' ? payload.email : undefined };
  } catch {
    return null;
  }
}
