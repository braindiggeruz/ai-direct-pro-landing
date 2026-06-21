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
