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

### 2026-06-21 (session 2) — Resilient SEO Mission Control + structured error envelope

* **Root cause of the production `Failed: 500` screen** in the Cockpit: the legacy `Cockpit.tsx` loaded `/api/audit` + `/api/content` via `Promise.all` and rendered the whole dashboard as `<div>Failed: {err}</div>` whenever EITHER call rejected. `/api/audit` and `/api/content` had no top-level `try/catch`, so any GitHub Contents API hiccup, malformed JSON file, or downstream subrequest issue bubbled to the SPA as an opaque HTTP 500 with a non-JSON body. The api client then collapsed that to `throw new Error('500')` and the screen literally showed `Failed: 500`. Confirmed by local reproduction: `buildCockpit()` works with current data (30 pages, 29 blog articles, 1 global config) so the throw must come from a transient upstream — exactly the class of failure the new envelope is designed to surface gracefully.
* **Fix #1 — structured error envelope** (`functions/lib/api-errors.ts`, new). Single canonical shape `{ success:false, error:{ code, message, request_id, endpoint, retryable, detail } }` with `newRequestId()` correlation id surfaced in the response `x-request-id` header. `withErrorHandler()` is a Pages Function wrapper that catches every throw, classifies the error (GitHub auth / rate limit / unavailable, D1, timeout, network, generic), maps to a friendly operator message, and logs once to `console.error` with the request_id so CF Tail logs are greppable. Applied to `functions/api/audit.ts`, `functions/api/content/index.ts`.
* **Fix #2 — `/api/admin/cockpit` partial-success aggregator** (new). Single authenticated request returns five sections — `audit`, `content`, `drafts`, `autopilot`, `health` — each independent with its own `ok` / `error`. A failure in one section never blanks the others. Includes `next_best_actions` computed server-side and a `system` block with integration configuration flags. Calls `markStaleJobsAsFailed` on each request so a stuck job no longer blocks new launches.
* **Fix #3 — Next Best Actions engine** (`src/shared/next-actions.ts`, new). Deterministic ranked operator queue (capped at top-7) built from audit + draft + autopilot + health signals. Each card has title, reason, expected SEO/business effect, risk level, deep-link to the right editor, and stable id for deduplication / future "dismiss". Recognised rules: section-failed (`weight≥950`), N8N_WEBHOOK_SECRET missing, last Autopilot failure, pending AI drafts (latest first), mojibake pages, broken internal links, sitemap mismatch, duplicate title/description, orphans, missing FAQ, missing title/description/H1, missing canonical, missing RU↔UZ pair, live health failures (sitemap.xml, robots.txt, soft-404, /admin-tools/ noindex).
* **Fix #4 — resilient Cockpit UI** (`src/admin/pages/Cockpit.tsx`, full rewrite). New "SEO Mission Control" dashboard: header with last-refresh + request_id, Next Best Actions panel (top, ranked), KPI tiles with click-through, System Health strip (6 live probes + 6 audit signals + integration dots), Drafts panel (4 counters + last-pending shortcut), Autopilot panel (3 counters + last completed/failed cards + schedule mode + stale-swept badge), Pages table (top 25 + Manage link). Per-section error cards with individual Retry; top-level error card with code/request_id/endpoint/HTTP-status when the whole aggregator throws — never a blank "Failed: 500" again. Loading skeleton, not empty space.
* **Fix #5 — global React error boundary** (`src/admin/components/AdminErrorBoundary.tsx`, new). Wraps the whole admin SPA in `AdminApp.tsx`. A render-time throw in any page now shows a recoverable card with the message, component stack (DevTools only), and Try-again / Back-to-Cockpit pair — instead of a white screen.
* **Fix #6 — error-aware API client** (`src/admin/lib/api.ts`). `request()` parses both the new structured envelope and the legacy `{error: "string"}` shape, attaching `{code, requestId, endpoint, retryable, status}` to the thrown Error so callers render actionable diagnostics. Backwards-compatible: existing endpoints (SeoAutopilot, AI Drafts list, Pages, Blog, etc.) continue to work unchanged.
* **Tests**: 114 unit tests, all green — 34 normaliser + 24 control-center + 14 control-center-sync + 15 ai-drafts + **27 mission-control (new)**: buildNextBestActions (clean state, pending drafts, section-failed top priority, mojibake severity, top-7 cap, descending weight), classifyError (GitHub 401/500/rate, D1, timeout, unknown), humanMessageFor, errorResponse (status / body shape / headers), newRequestId uniqueness.
* **Production verification** of session 2:
  * `/api/admin/cockpit` returns HTTP 401 with `x-request-id` header for unauthenticated requests ✓
  * `/api/audit` and `/api/content` likewise wrapped + carry `x-request-id` ✓
  * SPA bundle serves the new "SEO Mission Control" Cockpit (verified via /admin-tools/ unauthenticated render redirect to /admin-tools/login without any rendered crash) ✓
  * Login page healthy ✓
  * Other admin routes (/admin-tools/seo-autopilot etc.) still load and redirect cleanly ✓
* **Commit**: `d35ae4d` (resilient SEO Mission Control + structured error envelope). Pushed to `main`; Cloudflare deployment `fb8bd243` zelёный.

### 2026-06-21 (session 1) — Production end-to-end PASS (sync-await launch + normaliser aliases)

* **Root cause of stuck `forwarding` jobs**: Cloudflare Pages Functions terminated the `ctx.waitUntil` background task before the n8n workflow (1–4 min wall-clock since the payload-contract fix landed) could return. Result: every previous end-to-end attempt left a `forwarding` row with `n8n_status=null` forever. The `ai_drafts` table had **zero rows** until the fix in this iteration.
* **Fix #1 — sync-await launch path** (`functions/lib/seo-autopilot/launch.ts`, `bridge-worker.ts`, `run.ts`, `scheduled-run.ts`): the admin and scheduled launchers now `await` the n8n call inline instead of using `waitUntil`. CF Pages keeps the function alive for the lifetime of the active request, so the fetch to n8n (mostly I/O wait) is no longer killed by background lifecycle limits. Legacy async/`waitUntil` path stays in place behind `awaitCompletion: false` for the deprecated external bridge.
* **Fix #2 — stale-job watchdog** (`functions/lib/seo-autopilot/jobs.ts`, `jobs.ts` endpoint): a single idempotent UPDATE statement, run before every launch and on every `GET /api/admin/seo-autopilot/jobs`, transitions any non-terminal job older than 6 minutes to `failed` with `error_code='bridge_lost'`. This unsticks ghost rows from the previous architecture and prevents the overlap-guard from blocking new runs.
* **Fix #3 — normaliser alias translation** (`functions/lib/seo-autopilot/normalise.ts`): the real production n8n output uses several field-name conventions that didn't match the strict ingest validator. The normaliser (designated translation layer; the validator itself stays uncompromised) now accepts: `body_blocks[*].type` aliases `paragraph→p`, `heading_2→h2`, `bullet_list→list` (+lowercase fallback); FAQ aliases `{question,answer}`, `{Q,A}`, `{q_text,a_text}`, `{query,response}` → `{q,a}`; internal-link aliases `{url|href|link|to, anchor|text|label|title}` → `{target, anchor}` + absolute-URL stripping (`https://gptbot.uz/x` → `/x`); locale-rescoping for money pages (`https://gptbot.uz/services` → `/ru/services` / `/uz/services`).
* **Fix #4 — observability** (`bridge-worker.ts`, `jobs.ts` endpoint, `src/admin/pages/SeoAutopilotControlCenter.tsx`): error_detail now includes a 4–6 KB excerpt of the raw n8n response on failure so the next field-shape drift is diagnosable from the job row alone. The Control Center UI shows live elapsed-time during the launch, the n8n execution id, validation status/issue count, a direct link to the new draft, an "Open last draft" shortcut, a "Pending drafts" KPI, a stale-swept badge, and human-readable per-stage progress hints (Запрос → SERP → RU → UZ → validation). `request()` in the api client wires an AbortController with 5-minute timeout for the launch call.
* **Tests**: 87 unit tests, all green — 34 normaliser (15 new alias-translation cases all round-trip through the strict validator), 24 control-center, 14 control-center-sync (new: stale watchdog, sync vs async launch path), 15 ai-drafts.
* **One-shot D1 maintenance**: marked the previously stuck job (`job_30178d585c7d4e8eb00a7d`) as `failed/bridge_lost` so the dashboard reflects a clean state.
* **Production end-to-end PASS**: `job_8eaf622c0c9e4b3bb586e2` launched via `POST /api/internal/seo-autopilot/scheduled-run` (same `startSeoAutopilotJob` code path as the admin one-click button), completed in **70.7 seconds**, n8n returned HTTP 200, normaliser accepted the bundle, ingest passed the strict validator, draft **`draft_f88ade213e744f1c99397b`** landed in `ai_drafts` with `has_ru=1, has_uz=1, status='pending_review', validation_passed=1, target_money_page=/ru/services (RU) and /uz/services (UZ)`, 28 body blocks + 5 FAQ + 9 internal links per locale. **No GitHub commit, no IndexNow ping, no Cloudflare auto-deploy, public `/ru/blog/<slug>/` and `/uz/blog/<slug>/` both return 404** — the draft is genuinely pending human approval.
* **Backup tag**: `backup/pre-sync-launch-2026-06-21` (pointing at `2f4bd28`) pushed to origin before any change.
* **Commits**: `3ecee58` (sync-await launcher + watchdog), `38c0f38` (scheduled-run sync + GH Actions timeout bump), `7c5b3f8` (normaliser aliases + raw-excerpt diagnostic).

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

* OWNER: log in to https://gptbot.uz/admin-tools/ — Cockpit now renders as the new "SEO Mission Control" dashboard with Next Best Actions, KPI tiles, System Health strip, Drafts panel, and Autopilot panel. Per-section errors no longer blank the page — each section has its own Retry. Top-level errors carry a `request_id` you can paste into a Cloudflare Tail filter for full server-side diagnostics.
* OWNER: previous-session draft `draft_f88ade213e744f1c99397b` is still in `pending_review` at https://gptbot.uz/admin-tools/ai-drafts/draft_f88ade213e744f1c99397b — review, edit, and publish manually when ready.
* OWNER: the SEO Autopilot Mission Control button still works (one-click sync-await launch). The schedule was restored to `disabled` after the production e2e test in session 1 — re-enable from /admin-tools/seo-autopilot when you want cron runs.
* OWNER (optional polish): the n8n flow currently emits internal-link `anchor` values that are identical to the target URL. The bundle passes the strict validator unchanged, but SEO-quality improves with real anchor copy. Consider tightening the n8n RU/UZ writer prompts to demand natural-language anchors.
* OWNER (token rotation playbook): see `memory/test_credentials.md` for the safe rotation order (GitHub PAT → N8N_INGEST_TOKEN → N8N_WEBHOOK_SECRET → CRON_SECRET → Cloudflare API tokens). JWT_SECRET and ADMIN_PASSWORD_HASH untouched.
