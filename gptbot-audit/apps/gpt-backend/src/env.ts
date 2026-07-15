// Env mapping + resolved config. Pure (reads process.env, no I/O, no logging
// of values). Supports the Railway variable names AND legacy aliases.
// NEVER logs or returns secret VALUES — only booleans of presence.

export interface BackendConfig {
  nodeEnv: string;
  port: number;
  allowedOrigins: string[];
  hashSalt: string;
  internalSecret: string | undefined;
  adminKey: string | undefined;
  supabase: {
    url: string | undefined;
    secretKey: string | undefined;      // server-only
    publishableKey: string | undefined; // frontend/auth
    jwksUrl: string | undefined;
  };
  openrouter: {
    apiKey: string | undefined;
    modelFree: string;
    modelFreeFallbacks: string[];
    modelPaid: string;
    modelPaidFallbacks: string[];
    allowPaidFallbackForFree: boolean;
  };
  siteUrl: string;
}

function list(v: string | undefined): string[] {
  return (v || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  return {
    nodeEnv: env.NODE_ENV || 'development',
    port: parseInt(env.PORT || '8080', 10) || 8080,
    allowedOrigins: list(env.ALLOWED_ORIGINS).length
      ? list(env.ALLOWED_ORIGINS)
      : ['https://gptbot.uz'],
    hashSalt: env.GPT_HASH_SALT || '',
    internalSecret: env.GPTBOT_INTERNAL_API_SECRET || undefined,
    adminKey: env.ADMIN_API_KEY || env.GPTBOT_INTERNAL_API_SECRET || undefined,
    supabase: {
      url: env.SUPABASE_URL || undefined,
      secretKey: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || undefined,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || undefined,
      jwksUrl: env.SUPABASE_JWKS_URL || undefined,
    },
    openrouter: {
      apiKey: env.OPENROUTER_API_KEY || undefined,
      modelFree: env.OPENROUTER_MODEL_FREE || 'nvidia/nemotron-3-super-120b-a12b:free',
      modelFreeFallbacks: list(env.OPENROUTER_MODEL_FREE_FALLBACKS).length
        ? list(env.OPENROUTER_MODEL_FREE_FALLBACKS)
        : ['qwen/qwen3-235b-a22b-2507:free', 'deepseek/deepseek-chat-v3-0324:free'],
      modelPaid: env.OPENROUTER_MODEL_PAID || 'mistralai/mistral-small-3.2-24b-instruct',
      modelPaidFallbacks: list(env.OPENROUTER_MODEL_PAID_FALLBACKS).length
        ? list(env.OPENROUTER_MODEL_PAID_FALLBACKS)
        : ['meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'],
      allowPaidFallbackForFree: (env.ALLOW_PAID_FALLBACK_FOR_FREE || '').toLowerCase() === 'true',
    },
    siteUrl: env.SITE_URL || 'https://gptbot.uz',
  };
}

/** Presence-only status — safe to return from /health. No secret values. */
export function configStatus(cfg: BackendConfig) {
  return {
    supabaseConfigured: !!(cfg.supabase.url && cfg.supabase.secretKey),
    supabaseAuthConfigured: !!(cfg.supabase.jwksUrl || cfg.supabase.url),
    openrouterConfigured: !!cfg.openrouter.apiKey,
    internalSecretConfigured: !!cfg.internalSecret,
    hashSaltConfigured: !!cfg.hashSalt,
  };
}
