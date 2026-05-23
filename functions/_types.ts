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
//   OPENROUTER_API_KEY      optional. Server-side LLM key for AI-fill (never exposed to client).
//   OPENROUTER_MODEL_ECONOMY  optional. Defaults to openai/gpt-4o-mini.
//   OPENROUTER_MODEL_QUALITY  optional. Defaults to anthropic/claude-sonnet-4.5.
//   OPENROUTER_SITE_URL     optional. Sent as HTTP-Referer attribution. Defaults to https://gptbot.uz.
//   OPENROUTER_APP_TITLE    optional. Sent as X-Title attribution. Defaults to "GPTBot SEO Cockpit".
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
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL_ECONOMY?: string;
  OPENROUTER_MODEL_QUALITY?: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_APP_TITLE?: string;
  LOGIN_ATTEMPTS?: KVNamespace;
}
