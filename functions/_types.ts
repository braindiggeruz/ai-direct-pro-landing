// Cloudflare Pages Functions environment bindings.
// All values come from env vars configured in Cloudflare Pages → Settings → Environment.
//
//   GITHUB_TOKEN            PAT with `repo` scope (write access)
//   GITHUB_OWNER            e.g. "braindiggeruz"
//   GITHUB_REPO             e.g. "ai-direct-pro-landing"
//   GITHUB_BRANCH           e.g. "main"
//   ADMIN_EMAIL             single-user admin email
//   ADMIN_PASSWORD_HASH     PBKDF2-SHA256 PHC string. Preferred.
//   ADMIN_PASSWORD          fallback plain password (DEV ONLY, do NOT set in prod).
//   JWT_SECRET              random >=32-char string for HS256 signing
//   TURNSTILE_SECRET_KEY    optional. Server side. Skips verify if unset.
//   TURNSTILE_SITE_KEY      optional. Public. Exposed by /api/auth/config to the SPA.
//
// Optional bindings (set under Settings → Functions):
//   LOGIN_ATTEMPTS          KV namespace for durable lockout (recommended).
export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_PASSWORD?: string;
  JWT_SECRET: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  LOGIN_ATTEMPTS?: KVNamespace;
}
