# Test Credentials
# Agent writes here when creating/modifying auth credentials (admin accounts, test users).
# Testing agent reads this before auth tests. Fork/continuation agents read on startup.

## GPTBot.uz admin

| Field | Value |
| ----- | ----- |
| Admin URL | https://gptbot.uz/admin-tools/login |
| Email | `admin@gptbot.uz` |
| Password | **`tja358iGCYicxr7e`** — set by agent on 2026-06-22 at owner request (previous hash was unknown / forgotten). 16 chars, no ambiguous glyphs (no `0/O`, `1/l/I`). Verified working: production login `POST /api/auth/login` returns a JWT. |
| Auth | Single-admin JWT (12 h sessions), 5-attempt IP lockout via `LOGIN_ATTEMPTS` KV. |
| Password rotation | `yarn hash-password "<new-password>"` → paste the PHC string into Cloudflare Pages env var `ADMIN_PASSWORD_HASH` (production + preview). DELETE any `ADMIN_PASSWORD` plaintext env var if present. Owner is encouraged to rotate this in the dashboard within 24 h of receiving it from the agent. |

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

## Token rotation (recommended after the 2026-06-21 production PASS)

The Cloudflare full-access tokens and the GitHub PAT supplied during this run were used **only** via server-side environment variables — never echoed in chat, logs, commits, scripts, or screenshots. After the production end-to-end PASS (`draft_f88ade213e744f1c99397b` ingested, no auto-publish), the safe rotation order is:

1. **GitHub PAT** (`braindiggeruz` → Developer settings → Personal access tokens → Tokens (classic) → Generate new token).
   * New PAT scope: `repo` is enough; `workflow` only if you want it to keep dispatching the SEO Autopilot scheduler from the API.
   * Update the Cloudflare Pages env var `GITHUB_TOKEN` with the new value, trigger a redeploy, then revoke the old PAT.
2. **N8N_INGEST_TOKEN** (Cloudflare Pages → Settings → Environment variables).
   * Generate: `openssl rand -hex 32`.
   * Update the env var, redeploy, then update the `GPTBot Ingest Bearer` Header Auth credential on n8n in the same window so there's no gap.
3. **N8N_WEBHOOK_SECRET** (the value the n8n `Validate Safety Rules` node expects).
   * Coordinate with n8n: change the n8n side first (or simultaneously), then the Cloudflare env var. Run one SEO Autopilot afterwards to prove the new secret end-to-end.
4. **CRON_SECRET** (also lives as a GitHub Actions repo secret on `braindiggeruz/ai-direct-pro-landing`).
   * Generate, update Cloudflare Pages env, update GitHub Actions secret, run one workflow_dispatch to prove it.
5. **Cloudflare API tokens** (the two `cfut_…` values supplied with this run).
   * Once everything else is done, rotate these last. The CF dashboard lets you delete a token immediately after creating a replacement.
6. **JWT_SECRET** and **ADMIN_PASSWORD_HASH**: do NOT rotate as part of this maintenance unless you also want every existing admin session invalidated. The owner password is OWNER-OWNED — this run did not change it.

Do not include the new values in the PRD, commit messages, chat transcripts, or screenshots.
