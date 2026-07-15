// Shared per-process context + per-request identity resolution.
import type { FastifyRequest } from 'fastify';
import { loadConfig, type BackendConfig } from './env.js';
import { getSupabase, verifySupabaseJwt, type AuthedUser } from './supabase.js';
import { Store } from './store.js';
import { bearer } from './auth.js';

export interface AppContext {
  cfg: BackendConfig;
  store: Store;
}

export function buildContext(): AppContext {
  const cfg = loadConfig();
  const store = new Store(getSupabase(cfg));
  return { cfg, store };
}

/** Resolve the authenticated user from a verified Supabase JWT (never from body). */
export async function resolveUser(ctx: AppContext, req: FastifyRequest): Promise<AuthedUser | null> {
  return verifySupabaseJwt(ctx.cfg, bearer(req));
}
