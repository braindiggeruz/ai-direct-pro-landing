# Test Credentials
# Agent writes here when creating/modifying auth credentials (admin accounts, test users).
# Testing agent reads this before auth tests. Fork/continuation agents read on startup.

## GPTBot.uz admin

| Field | Value |
| ----- | ----- |
| Admin URL | https://gptbot.uz/admin-tools/login |
| Email | `admin@gptbot.uz` |
| Password | **OWNER-OWNED** — stored only as `ADMIN_PASSWORD_HASH` in the Cloudflare Pages env. This agent did NOT change it and did NOT receive it. |
| Auth | Single-admin JWT (12h sessions), 5-attempt IP lockout via `LOGIN_ATTEMPTS` KV. |
| Password rotation | `yarn hash-password "<new-password>"` → paste the PHC string into `ADMIN_PASSWORD_HASH` env var. |

## AI Draft Inbox

| Field | Value |
| ----- | ----- |
| Ingestion endpoint | `POST https://gptbot.uz/api/admin/ai-drafts` |
| Auth method | `Authorization: Bearer <N8N_INGEST_TOKEN>` |
| `N8N_INGEST_TOKEN` | Generated server-side this session (32 random bytes hex). Configured as `secret_text` env var on the Cloudflare Pages production + preview deployment configs. **NOT** echoed in chat, logs, or repo. n8n must store it as a Header Auth credential `GPTBot Ingest Bearer`. |
| Admin inbox URL | https://gptbot.uz/admin-tools/ai-drafts |
| D1 binding | `GPTBOT_DRAFTS_DB` → database `gptbot-ai-drafts` (uuid `97ef0372-d937-406f-8871-755368d9afff`) |

## SEO Autopilot Control Center

| Field | Value |
| ----- | ----- |
| Admin launch URL | https://gptbot.uz/admin-tools/seo-autopilot |
| Launch endpoint | `POST /api/admin/seo-autopilot/run` (admin JWT) |
| Schedule endpoint | `POST /api/admin/seo-autopilot/schedule` (admin JWT) |
| Scheduled-run endpoint | `POST /api/internal/seo-autopilot/scheduled-run` (Bearer `CRON_SECRET`) |
| External Runable-compatible endpoint | `POST /api/seo-autopilot/run` — **deprecated and DISABLED by default** (gated by `EXTERNAL_AUTOPILOT_TRIGGER_ENABLED`) |
| `N8N_WEBHOOK_SECRET` | **One-time owner input.** Set in Cloudflare Pages → ai-direct-pro-landing → Settings → Environment variables. Value = whatever the n8n `Validate Safety Rules` node expects (same as the legacy `x-runable-secret`). |
| `CRON_SECRET` | Generated server-side this session. Configured as `secret_text` env var on Cloudflare Pages production + preview, and as a GitHub Actions repository secret on `braindiggeruz/ai-direct-pro-landing`. |
| `EXTERNAL_AUTOPILOT_TRIGGER_ENABLED` | `plain_text` env var, default `false`. Flip to `true` only if you must keep the legacy public bridge open. |

## Token rotation

1. Generate a new value: `openssl rand -hex 32`.
2. Update the Cloudflare Pages env var via the dashboard or the API:
   `PATCH /accounts/.../pages/projects/ai-direct-pro-landing` with
   `deployment_configs.production.env_vars.N8N_INGEST_TOKEN.value`.
3. Retrigger a Pages deployment so the new secret takes effect.
4. Update the `GPTBot Ingest Bearer` Header Auth credential in
   https://braindigger.app.n8n.cloud → Credentials.
5. The old token stops working as soon as the new Pages deployment is live.
