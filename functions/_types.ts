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
  // Feature-specific OpenRouter model overrides (router picks these when
  // OPENROUTER_API_KEY is configured). Operators can swap models without
  // a code redeploy. Defaults live in functions/lib/llm/model-registry.ts.
  OPENROUTER_MODEL_ARTICLE?: string;
  OPENROUTER_MODEL_UZ?: string;
  OPENROUTER_MODEL_OPTIMIZER?: string;
  OPENROUTER_MODEL_RETARGET?: string;
  OPENROUTER_MODEL_JUDGE?: string;
  // Per-call wallclock cap for OpenRouter requests (ms). Defaults to 75 000.
  OPENROUTER_TIMEOUT_MS?: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_APP_TITLE?: string;
  // AI SEO Autopilot — Free LLM stack. Puter loads client-side and needs no key.
  // GEMINI_API_KEY is declared lower (with full Gemini Flash documentation).
  // SERPER_API_KEY is reserved for the upcoming SERP Intelligence layer.
  SERPER_API_KEY?: string;
  LOGIN_ATTEMPTS?: KVNamespace;
  // AI Draft Inbox — n8n SEO Autopilot delivers RU/UZ article packages here.
  // The shared secret bearer the n8n HTTP node must send in Authorization.
  // Server-only. NEVER referenced from the SPA bundle.
  N8N_INGEST_TOKEN?: string;
  // D1 database that stores incoming drafts pending human review.
  // See /app/migrations/0001_ai_drafts.sql for the schema.
  GPTBOT_DRAFTS_DB?: D1Database;
  // Server-side secret the bridge attaches as `x-runable-secret` when
  // calling the existing n8n production webhook. Set this to the same value
  // the n8n `Validate Safety Rules` node expects.
  N8N_WEBHOOK_SECRET?: string;
  // Bearer for the GitHub Actions cron worker. Authenticates
  // /api/internal/seo-autopilot/scheduled-run.
  CRON_SECRET?: string;
  // Feature flag — when "true" the public Runable-compatible bridge
  // POST /api/seo-autopilot/run remains callable. Default and recommended
  // value is "false" since the GPTBot Control Center now drives runs
  // server-to-server.
  EXTERNAL_AUTOPILOT_TRIGGER_ENABLED?: string;
  // ─── Direct AI generation (replaces n8n for SEO Autopilot) ──────────────
  // When "true" (default), the SEO Autopilot launcher generates RU+UZ
  // articles directly via Cloudflare Workers AI instead of forwarding to
  // n8n. This removes the n8n validation contract surface that was
  // rejecting the single-topic "Run one" payload with HTTP 400.
  // The n8n bridge code remains intact and is selected by setting this
  // flag to "false".
  SEO_AUTOPILOT_USE_DIRECT_AI?: string;
  // Optional Workers AI binding (Cloudflare Pages → Settings → Functions
  // → AI binding). Set to "AI". When absent, direct generation is
  // refused with a clear error message.
  AI?: Ai;
  // Model identifier passed to env.AI.run(). Defaults to a long-context
  // llama-3.3-70b instance suitable for full SEO articles.
  //
  // NOTE: CF_AI_MODEL and the env.AI binding are kept for backwards
  // compatibility (Llama path) but are no longer the default route.
  // The direct-generator now calls Google Gemini Flash via the Emergent
  // integrations proxy. See GEMINI_MODEL / EMERGENT_LLM_KEY below.
  CF_AI_MODEL?: string;
  // ─── Gemini Flash via Google Generative Language API (direct REST) ─
  // Google AI Studio API key (free tier: 15 RPM, 1500 RPD, 1M ctx on
  // gemini-2.5-flash). Server-only. Required for the direct-generator.
  // Configured in Cloudflare Pages → Settings → Environment variables
  // as GEMINI_API_KEY (secret_text). Generate at
  // https://aistudio.google.com/app/apikey.
  GEMINI_API_KEY?: string;
  // Primary Gemini model id. Defaults to "gemini-2.5-flash" — the best
  // free-tier balance of quality, speed (~30-40 s/article), 1M ctx,
  // strict JSON (responseMimeType=application/json), Russian + Uzbek
  // Latin fluency.
  GEMINI_MODEL?: string;
  // Fallback model used on timeout / 5xx / 429 from the primary.
  // Defaults to "gemini-2.5-flash-lite".
  GEMINI_FALLBACK_MODEL?: string;

  // ─── Multi-provider LLM router (2026-06-23) ────────────────────────
  // The router (functions/lib/llm/router.ts) walks model-registry.ts in
  // priority order, skipping unconfigured providers (no key) and
  // unhealthy ones (circuit-breaker open). Each provider is independent
  // — adding/removing a key only changes routing, not behaviour.
  //
  // Mistral La Plateforme: server-only. Pay-as-you-go.
  // Generate the key at https://console.mistral.ai/api-keys/.
  MISTRAL_API_KEY?: string;
  /** Optional override of the default Mistral model id (default: registry pick). */
  MISTRAL_MODEL?: string;

  // Groq Cloud: server-only. Free tier with daily token caps.
  // Generate at https://console.groq.com/keys.
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  // Optional speech-to-text model override for Telegram Voice-to-Reply.
  GROQ_STT_MODEL?: string;
  // Optional secondary speech-to-text provider. Not used for chat routing.
  OPENAI_API_KEY?: string;
  OPENAI_STT_MODEL?: string;

  // Cerebras Inference: server-only. Free tier.
  // Generate at https://cloud.cerebras.ai/.
  CEREBRAS_API_KEY?: string;
  CEREBRAS_MODEL?: string;

  // ─── xAI Grok (optional, OpenAI-compatible) ────────────────────────
  // When the operator provides an xAI key (https://x.ai/api), the multi-
  // provider router can pick Grok models for heavy generation. The router
  // skips this provider entirely when the key is absent.
  XAI_API_KEY?: string;
  XAI_MODEL?: string;

  // ─── Yandex Cloud Search API (Demand Intelligence layer) ───────────
  // Powers «Собрать темы из Яндекса» in the SEO Mission Control. Server-
  // only. Generate the key at https://console.yandex.cloud → Service
  // accounts → API keys.
  YANDEX_SEARCH_API_KEY?: string;
  // Optional folder scoping — when set, the Yandex client passes folderId
  // in the body so the call is billed against a specific folder.
  YANDEX_CLOUD_FOLDER_ID?: string;

  // ─── Consumer AI-chat (/ru/gpt-chat/, /uz/gpt-uzbek-tilida/) ───────────
  // Server-side OpenRouter proxy for the public AI-chat product. All model
  // routing lives in env so operators can swap models without a redeploy.
  // The OPENROUTER_API_KEY above is reused. Never exposed to the client.
  //
  // Free acquisition tier — primary + comma-separated fallbacks.
  OPENROUTER_MODEL_FREE?: string;
  OPENROUTER_MODEL_FREE_FALLBACKS?: string;
  // Paid tier (Plus/Business) — primary + comma-separated fallbacks.
  OPENROUTER_MODEL_PAID?: string;
  OPENROUTER_MODEL_PAID_FALLBACKS?: string;
  // Public canonical site URL (SITE_URL in the brief). Defaults to
  // https://gptbot.uz. Sent as OpenRouter HTTP-Referer attribution.
  SITE_URL?: string;
  // Anti-abuse quotas. Strings (env vars are strings); parsed with defaults.
  GPT_FREE_DAILY_LIMIT?: string;   // default 15
  GPT_FREE_HOURLY_LIMIT?: string;  // default 5
  GPT_PAID_MONTHLY_LIMIT?: string; // default 600
  GPT_MAX_INPUT_CHARS?: string;    // default 3000
  // Salt for SHA-256(CF-Connecting-IP + salt). NEVER store raw IPs.
  // If unset, hashing still runs with an empty salt (weaker; set in prod).
  GPT_HASH_SALT?: string;

  // ─── Railway backend gateway (optional) ───────────────────────────────
  // When BOTH are set, /api/gpt/* proxies to the Railway production backend
  // (Fastify + Supabase). When absent or the proxy fails, the Cloudflare
  // Functions fall back to the existing D1 implementation. The internal
  // secret authenticates the gateway → Railway hop; NEVER exposed to browser.
  RAILWAY_GPT_API_URL?: string;
  GPTBOT_INTERNAL_API_SECRET?: string;
  // Public Supabase values (safe to expose to the island for Auth later).
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;

  // ─── Telegram "Smart Forward" assistant (/api/telegram/assistant) ─────
  // Dedicated bot, SEPARATE from the lead-capture bot at /api/telegram/webhook
  // (which uses TELEGRAM_BOT_TOKEN). Server-only; never exposed to the client.
  // Set via `wrangler pages secret put`. Feature is dormant until the token
  // is present. Reuses OPENROUTER_API_KEY + GPT_HASH_SALT + SITE_URL above and
  // the GPTBOT_DRAFTS_DB D1 binding.
  TELEGRAM_ASSISTANT_BOT_TOKEN?: string;
  TELEGRAM_ASSISTANT_WEBHOOK_SECRET?: string;
  // Public bot @username (no secret). Used only for server-built share links;
  // the site reads its own build-time VITE_TELEGRAM_BOT_USERNAME.
  TELEGRAM_ASSISTANT_BOT_USERNAME?: string;
  TELEGRAM_FREE_DAILY_LIMIT?: string;   // default 20 (superseded by plan config for Javob)
  TELEGRAM_MAX_INPUT_CHARS?: string;    // default 4000
  TELEGRAM_MAX_OUTPUT_CHARS?: string;   // default 3000
  TELEGRAM_ITEM_TTL_HOURS?: string;     // default 24 (source-text retention)
  TELEGRAM_STT_TIMEOUT_MS?: string;     // default/max 10000 total across STT providers
  TELEGRAM_VOICE_MIN_SECONDS?: string;  // default 3
  TELEGRAM_VOICE_MAX_SECONDS?: string;  // default 300
  TELEGRAM_VOICE_MAX_BYTES?: string;    // default 20 MiB (Bot API limit)
  // GPTBot Javob billing feature flags — all default OFF. Payments stay
  // disabled until official Click/Payme merchant docs + credentials arrive.
  JAVOB_BILLING_ENABLED?: string;
  JAVOB_CLICK_ENABLED?: string;
  JAVOB_PAYME_ENABLED?: string;
  JAVOB_DAY_PASS_ENABLED?: string;
  JAVOB_PLUS_ENABLED?: string;

  // ─── Payments (subscription — scaffold only for MVP) ──────────────────
  // PAYMENT_PROVIDER selects the adapter: "lemonsqueezy" | "paddle" |
  // "globalpay" | "freedompay" | "" (manual mode — no live checkout).
  PAYMENT_PROVIDER?: string;
  PAYMENT_WEBHOOK_SECRET?: string;
  LEMONSQUEEZY_API_KEY?: string;
  PADDLE_API_KEY?: string;
  GLOBALPAY_API_KEY?: string;
  FREEDOMPAY_API_KEY?: string;
}
