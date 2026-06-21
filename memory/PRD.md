# GPTBot.uz — Product Requirements (Live)

## Original problem statement

Connect the existing **n8n SEO Autopilot** (`GPTBot SEO Topic Hunter MVP` on `braindigger.app.n8n.cloud`) to the **GPTBot admin panel** (`https://gptbot.uz/admin-tools/`) so generated bilingual RU/UZ article packages automatically arrive in the admin as **unpublished AI drafts**.

Hard rules:

* Nothing auto-publishes.
* No incoming draft commits to GitHub.
* No incoming draft pings IndexNow.
* No incoming draft triggers a Cloudflare deployment.
* The reviewer manually imports each side into the existing Blog Editor.
* The existing **Publish to GitHub** flow remains the only path that puts an article live.

## Users

* **GPTBot owner / SEO operator** — uses `https://gptbot.uz/admin-tools/` to review drafts, edit/publish blog and money pages, and monitor SEO health.
* **n8n SEO Autopilot** — automated workflow that delivers RU/UZ article bundles to the admin via the new ingestion API.
* **Cloudflare Pages** — hosts the static landing + admin SPA + Pages Functions API.

## Architecture (current)

* Vite + React 19 + TypeScript SPA (`/`, `/ru/*`, `/uz/*`, `/admin-tools/*`).
* Cloudflare Pages Functions (`functions/api/**`) provide the API surface.
* GitHub Contents API for production content storage (`/content/pages/**`, `/content/blog/**`, etc.).
* JWT-based single-admin auth (existing).
* OpenRouter for in-editor AI fill (existing).
* Serper for SERP intelligence (existing).
* **New:** Cloudflare D1 (`gptbot-ai-drafts`) for the AI Draft Inbox.

## What has been implemented

### 2026-06-21 — GPTBot Control Center (Runable removed)
* New admin page `/admin-tools/seo-autopilot` with the "Запустить SEO Автопилот" button, schedule picker (disabled / weekly / twice weekly), KPI tiles, and live-polled "Recent runs" table.
* New endpoints (JWT-authenticated):
  * `POST /api/admin/seo-autopilot/run` — manual launch. Browser never touches the n8n secret; server attaches `x-runable-secret: $N8N_WEBHOOK_SECRET` server-to-server.
  * `GET /api/admin/seo-autopilot/jobs` — recent runs + system flags.
  * `GET/POST /api/admin/seo-autopilot/schedule` — read / update the schedule mode.
* New scheduled endpoint `POST /api/internal/seo-autopilot/scheduled-run` (Bearer `CRON_SECRET`) called by GitHub Actions cron (Mon + Thu 09:00 UTC). Reads schedule mode from `system_settings` D1 and decides whether to launch — so the owner can change frequency from the admin UI without editing cron.
* GitHub Actions workflow `.github/workflows/seo-autopilot-scheduler.yml` calls the scheduled endpoint twice weekly. CRON_SECRET pre-set as a repo secret.
* Shared launch service `functions/lib/seo-autopilot/launch.ts` — single code path for manual + scheduled + (legacy) external. Enforces overlap guard, missing-secret check, and source/requested_by audit fields.
* Public `/api/seo-autopilot/run` endpoint now **deprecated and disabled by default** via `EXTERNAL_AUTOPILOT_TRIGGER_ENABLED=false`; returns 404 when off. Code path kept for backwards compatibility.
* New D1 migration `0003_seo_autopilot_control_center.sql` adds `source` + `requested_by` columns to `seo_autopilot_jobs` and a new `system_settings` table.
* New Cloudflare env vars: `CRON_SECRET` (set), `EXTERNAL_AUTOPILOT_TRIGGER_ENABLED=false` (set). `N8N_WEBHOOK_SECRET` is the **one-time owner input** still required (UI surfaces a clear actionable warning until set).
* 24 new unit tests for the schedule + payload builder (58 total green: 15 ai-drafts + 19 bridge + 24 control-center).
* Full end-to-end smoke verified twice on production: (1) preflight refused launch when N8N_WEBHOOK_SECRET unset (clear 503 with actionable message); (2) with a placeholder secret + active schedule, scheduled-run launched a job, forwarded to n8n, captured the 404 (workflow inactive), recorded `source='schedule'` `requested_by='system:schedule'`, and created **zero drafts**. Smoke artifacts cleaned up; placeholder secret removed.

### 2026-06-21 — SEO Autopilot Bridge (zero-n8n-edit)
* New endpoint `POST /api/seo-autopilot/run`:
  * 401 if `x-runable-secret` header missing.
  * Returns HTTP 202 + `job_id` immediately (<200 ms).
  * Spawns `ctx.waitUntil` background task that forwards the body to `https://braindigger.app.n8n.cloud/webhook/runable-seo-autopilot` with the same `x-runable-secret` (byte-for-byte, never logged), normalises n8n's response, and ingests via the shared `ingestRawBundle` service. Idempotent on bundle_id derived from n8n's execution_id.
* New endpoint `GET /api/seo-autopilot/jobs/[id]` for status polling. Job_id is a capability token.
* New D1 migration `0002_seo_autopilot_jobs.sql` — job state machine (`pending` → `forwarding` → `normalising` → `ingesting` → `completed`/`failed`).
* Shared ingestion service `functions/lib/ai-drafts/ingest.ts` — both `/api/admin/ai-drafts` and the bridge route through one validator + idempotent `insertOrReuseDraft` path. No duplication.
* n8n response normaliser tolerant of all common shape variants (ru_article/article_ru/articles[], package wrapper, title vs meta_title, body vs body_blocks).
* 19 new unit tests in `scripts/test-seo-autopilot.ts` (34 total: 15 existing + 19 new — all green).
* Production smoke test passed end-to-end: bridge accepted, n8n forwarded, response captured (404 since workflow currently inactive), job state machine recorded the failure with full diagnostic excerpt. No drafts created, sitemap unchanged.
* Docs: `docs/SEO_AUTOPILOT_BRIDGE.md` (architecture, contract, error codes, smoke-test, rollback, one-line Runable change).

**One-line Runable change required to activate the bridge**:
* Replace webhook URL `https://braindigger.app.n8n.cloud/webhook/runable-seo-autopilot` → `https://gptbot.uz/api/seo-autopilot/run`. Headers and body stay identical.

### 2026-06-21 — AI Draft Inbox (n8n → admin handoff)
* **D1 database** `gptbot-ai-drafts` (uuid `97ef0372-…`) with `ai_drafts` + `ai_draft_audit` tables (`migrations/0001_ai_drafts.sql`).
* **Ingestion API** `POST /api/admin/ai-drafts` (Bearer `N8N_INGEST_TOKEN`, constant-time compare, payload-size cap, schema validation, locale/slug/body-block/internal-link sanitisation, idempotent on `bundle_id`, forces `pending_review`).
* **Admin API**:
  * `GET /api/admin/ai-drafts` — list
  * `GET /api/admin/ai-drafts/[id]` — detail + audit
  * `POST /api/admin/ai-drafts/[id]/status` — `needs_revision|rejected|pending_review`
  * `POST /api/admin/ai-drafts/[id]/import` — per-locale import marker
  * `DELETE /api/admin/ai-drafts/[id]` — only when not imported
* **Admin SPA**:
  * `/admin-tools/ai-drafts` — list (filters: status, locale, source, search; KPI tiles).
  * `/admin-tools/ai-drafts/:id` — detail with RU/UZ tabs, validation banner, body/FAQ/links preview, SEO brief, audit trail, reviewer actions.
  * **Import → Blog Editor** bridge via `sessionStorage` handoff + `?aiDraftImport=...&aiDraftLocale=...` URL.
  * Sidebar nav entry "AI Draft Inbox".
  * Cockpit gains an "AI Draft Inbox" quick card with counts and deep link.
* **BlogEditor** consumes the handoff: pre-fills title/description/h1/excerpt/body/FAQ/internal-links/target money page/keywords/schemas, leaves status=`draft`, warns on duplicate slug, runs existing audit. Save flow unchanged.
* **Documentation**: `docs/AI_DRAFT_INBOX.md` + `docs/AI_DRAFT_INBOX/n8n-delivery-patch.json` + `docs/AI_DRAFT_INBOX/smoke-payload.json`.
* **Unit tests**: 15 validator cases in `scripts/test-ai-drafts.ts` (all green).
* **Production smoke test**: 2 POSTs to `/api/admin/ai-drafts` (success + idempotent) verified; row inspected via D1 API; row cleaned up after verification. No GitHub commit, no IndexNow, no Pages auto-deploy triggered.

### Cloudflare configuration
* New env var `N8N_INGEST_TOKEN` (`secret_text`) on production + preview.
* New D1 binding `GPTBOT_DRAFTS_DB` on production + preview.
* Existing env vars / KV binding (`LOGIN_ATTEMPTS`) preserved.

## Prioritized backlog

### P1 — Operational nice-to-haves
* Server-side per-bundle dedupe-by-slug check (block accepting a new bundle whose RU slug already exists in `/content/blog/ru/`). Currently the admin UI warns on duplicate slug at import time; an upstream gate would save reviewer time.
* In-app token rotation page (Settings → "Rotate N8N_INGEST_TOKEN") that calls a server endpoint to generate + persist a new secret. Today the rotation is done via the Cloudflare API.
* AI Draft Inbox export: XLSX/JSON download of a single draft (optional file fallback per the spec's Phase 8).
* Inbox bulk actions: select N drafts and bulk-reject.

### P2 — SEO Mission Control polish
* Cockpit live KPI: average time-to-import per bundle.
* Auto-archive of `imported` drafts older than 30 days into a separate `ai_drafts_archive` table.

## Hard safety guarantees (never to weaken)

* Ingest **forces** `status=pending_review`, `manual_approval_required=true`, `ready_for_publish=false`, `published=false` regardless of what the upstream sends.
* Ingest never writes to `/content/blog/**` and never commits to GitHub.
* Ingest never calls IndexNow.
* The bearer token is verified with a constant-time compare and never logged.
* The endpoint refuses non-JSON payloads, payloads > 256 KB, requests without a bearer.
* The `_routes.json` (existing) scopes Functions to `/api/*` and `/admin-tools/*` only.

## Next action items

* OWNER: verify the AI Draft Inbox list visually at `https://gptbot.uz/admin-tools/ai-drafts` after logging in.
* OWNER: paste the n8n nodes from `docs/AI_DRAFT_INBOX/n8n-delivery-patch.json` into `GPTBot SEO Topic Hunter MVP`, attach the `GPTBot Ingest Bearer` Header Auth credential, and run one production execution.
* OWNER: confirm the inbox now shows the bundle and import-to-Blog-Editor flow works as expected.
