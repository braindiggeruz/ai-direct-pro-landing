# SEO Autopilot Bridge — Runable → GPTBot → n8n (zero-n8n-edit)

Production-ready bridge that lets the existing n8n workflow `GPTBot SEO
Topic Hunter MVP` deliver bilingual RU/UZ article packages into the AI
Draft Inbox **without modifying anything in n8n**. The only change the
owner makes is repointing Runable's webhook URL.

> The bridge never auto-publishes. Every draft lands as
> `pending_review` and is only ever turned into a live article by a
> human reviewer clicking "Publish to GitHub" in the existing Blog
> Editor.

## Why this exists

The first iteration (`/api/admin/ai-drafts`) requires modifying the live
n8n workflow to add `Build GPTBot Draft Payload` + `Send Draft to GPTBot
Admin` nodes. n8n cloud's free plan blocks programmatic workflow edits,
so this bridge avoids the n8n edit entirely:

```
Runable
  └─ POST https://gptbot.uz/api/seo-autopilot/run   (header: x-runable-secret)
       └─ GPTBot bridge creates a job row, returns 202 + job_id
       └─ ctx.waitUntil (background, up to 4 min):
            └─ POST https://braindigger.app.n8n.cloud/webhook/runable-seo-autopilot
                 └─ existing n8n workflow runs unmodified
                 └─ Respond Success returns the article package
            └─ bridge normalises into gptbot.article-draft.v1
            └─ bridge ingests via the SAME service that backs /api/admin/ai-drafts
            └─ bridge marks the job completed with draft_id + admin_url
  └─ Runable polls GET /api/seo-autopilot/jobs/<id> until is_terminal=true
```

## The one-line Runable change

| Setting        | Old value                                                        | New value                                  |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| Webhook URL    | `https://braindigger.app.n8n.cloud/webhook/runable-seo-autopilot` | `https://gptbot.uz/api/seo-autopilot/run` |
| Method         | `POST`                                                           | (unchanged)                                |
| Headers        | `Content-Type: application/json`, `x-runable-secret: <value>`    | (unchanged)                                |
| Body           | Same SEO Autopilot brief envelope Runable sends today            | (unchanged)                                |

Nothing else needs to change. Both the existing n8n webhook and the new
bridge live side-by-side; if you ever want to revert, point Runable back
at the n8n URL.

## API surface

### `POST /api/seo-autopilot/run`

Request:

```http
POST /api/seo-autopilot/run HTTP/1.1
Host: gptbot.uz
Content-Type: application/json
x-runable-secret: <runable's existing secret>
x-request-id: <optional client correlation id>

{ ...the same JSON Runable currently POSTs to n8n... }
```

Response (HTTP 202):

```json
{
  "success": true,
  "accepted": true,
  "job_id": "job_<22 hex>",
  "request_id": "<echoed or generated>",
  "status": "pending",
  "status_url": "/api/seo-autopilot/jobs/job_<…>",
  "polling": {
    "retry_after_seconds": 30,
    "max_polls": 30,
    "expected_completion_seconds": 120
  },
  "manual_approval_required": true,
  "ready_for_publish": false,
  "note": "AI Draft Inbox bridge accepted the request. Poll status_url for the final draft_id."
}
```

Error codes:

| Status | Meaning |
| ------ | ------- |
| 400 | Empty body |
| 401 | `x-runable-secret` header missing |
| 405 | Method not POST |
| 413 | Body > 256 KB |
| 415 | Content-Type is not `application/json` |
| 503 | D1 binding `GPTBOT_DRAFTS_DB` not configured |

### `GET /api/seo-autopilot/jobs/[id]`

Capability-based: anyone with the `job_id` can read its status (the id
is cryptographically random — Runable holds it).

```json
{
  "success": true,
  "job_id": "job_…",
  "request_id": "…",
  "status": "completed",
  "is_terminal": true,
  "n8n_status": 200,
  "n8n_execution_id": "<from n8n>",
  "generation_status": "manual_approval_required",
  "validation_status": "passed",
  "validation_passed": true,
  "validation_issue_count": 0,
  "ingestion_success": true,
  "deduplicated": false,
  "draft_id": "draft_<22 hex>",
  "bundle_id": "n8n-bridge-<…>",
  "admin_url": "/admin-tools/ai-drafts/draft_<…>",
  "manual_approval_required": true,
  "ready_for_publish": false,
  "error_code": null,
  "error_message": null,
  "error_detail": null,
  "created_at": "2026-06-21T…",
  "updated_at": "2026-06-21T…",
  "finished_at": "2026-06-21T…",
  "duration_ms": 84231,
  "next_action": "Open admin_url to review the draft. …"
}
```

Status values: `pending` → `forwarding` → `normalising` → `ingesting` →
`completed | failed`. The job is terminal once `is_terminal=true`.

Failure shape (example):

```json
{
  "success": false,
  "status": "failed",
  "is_terminal": true,
  "error_code": "n8n_http_401",
  "error_message": "n8n returned HTTP 401",
  "error_detail": { "excerpt": "{\"code\":401,\"message\":\"Authorization data is wrong!\"}" },
  "next_action": "Inspect error_code/error_message. Re-trigger Runable after fixing root cause."
}
```

Common `error_code` values:

| Code | Meaning |
| ---- | ------- |
| `n8n_timeout` | n8n didn't respond within 240 s. |
| `n8n_fetch_failed` | Network/DNS failure reaching n8n. |
| `n8n_http_4xx` / `n8n_http_5xx` | n8n returned a non-2xx. Detail contains a 2 KB excerpt of n8n's body. |
| `n8n_invalid_json` | n8n returned a 2xx with a non-JSON body. |
| `n8n_response_invalid` | n8n's JSON didn't contain `ru_article` or `uz_article`. |
| `ingest_validation_failed` | The normalised bundle didn't pass the strict ingest validator. Detail contains field-level issues. |
| `bridge_internal_error` | Unexpected exception inside the bridge. |

## Architecture: why asynchronous

The n8n SEO Autopilot runs:

* Serper search × 1–3 (1–3 s)
* OpenRouter SEO Opportunity Analyzer (5–15 s)
* OpenRouter SEO Brief Generator (5–15 s)
* OpenRouter RU Article Writer (15–30 s)
* OpenRouter UZ Latin Adapter (10–20 s)
* Local quality validator (<1 s)

Realistic total: **30–120 s**. Cloudflare Pages Functions cap the
synchronous HTTP response at 30 s. So the bridge:

1. Returns HTTP 202 + `job_id` synchronously (<200 ms).
2. Schedules the n8n call inside `ctx.waitUntil(...)`, which keeps the
   worker running until the promise resolves — up to several minutes on
   the Standard plan.
3. Persists the job state machine in D1 so Runable can poll for the
   final outcome.

This is the **canonical Cloudflare pattern** for "kick off long work,
respond fast" (see "Lifecycle methods" in the Cloudflare Workers docs).

### Idempotency

`bundle_id` is deterministic from n8n's `execution_id` (which n8n emits
in the Respond Success body). Repeated jobs that reach the same n8n
execution produce the same `bundle_id` and the shared ingest dedupes
them. When n8n omits `execution_id`, the bridge falls back to
`n8n-bridge-<job_id>`.

### Forwarded headers

The bridge forwards only:

* `Content-Type: application/json`
* `x-runable-secret: <byte-for-byte from incoming request>`

Nothing else. Arbitrary header pass-through would be an open relay; the
n8n workflow only needs the Runable secret to authenticate.

### Storage

All bridge state lives in the existing D1 database `gptbot-ai-drafts`:

* `ai_drafts` — final drafts (shared with the `/api/admin/ai-drafts` path).
* `ai_draft_audit` — append-only audit; the bridge writes an extra
  `bridge_ingest` row alongside the `created` row.
* `seo_autopilot_jobs` — bridge job state machine (new in migration `0002_seo_autopilot_jobs.sql`).

## Safety guarantees

* `x-runable-secret` is forwarded but never stored, logged, or echoed.
* `manual_approval_required`, `ready_for_publish`, `published`, and
  `status` are forced to safe values by the normaliser AND the
  ingestion validator — n8n cannot override them.
* The bridge never writes to `/content/**`, never calls the GitHub
  Contents API, never pings IndexNow, never triggers a Pages deployment.
* Payload size cap: 256 KB (request body to bridge).
* n8n timeout: 240 s (`AbortController` releases the worker on stuck
  workflows).
* n8n response excerpts captured for diagnostics are capped at 2 KB so
  long workflow definitions don't bloat D1.

## Smoke test

Bridge accepts a request and returns 202 within ~200 ms:

```bash
curl -i -X POST https://gptbot.uz/api/seo-autopilot/run \
  -H 'Content-Type: application/json' \
  -H "x-runable-secret: <existing Runable secret>" \
  -d '{"smoke_test": true, "do_not_publish": true}'
```

Poll the job:

```bash
JOB_ID=<from-prior-response>
curl -s "https://gptbot.uz/api/seo-autopilot/jobs/$JOB_ID" | jq
```

If n8n is currently inactive (404), the job ends as:

```json
{ "status": "failed", "error_code": "n8n_http_404", ... }
```

When n8n is active and the Runable secret is valid, the job ends as:

```json
{
  "status": "completed",
  "draft_id": "draft_…",
  "bundle_id": "n8n-bridge-<execution>",
  "admin_url": "/admin-tools/ai-drafts/draft_…",
  "manual_approval_required": true,
  "ready_for_publish": false,
  ...
}
```

## Rollback

If you ever need to revert:

1. Point Runable's webhook URL back at the n8n production URL.
2. (Optionally) `DELETE FROM seo_autopilot_jobs` in D1.
3. Pages Functions still ship the bridge code — that's harmless.

## Reference

* `functions/api/seo-autopilot/run.ts` — main bridge endpoint.
* `functions/api/seo-autopilot/jobs/[id].ts` — status polling.
* `functions/lib/seo-autopilot/jobs.ts` — D1 helpers + state machine.
* `functions/lib/seo-autopilot/normalise.ts` — n8n → ingestion contract mapper.
* `functions/lib/ai-drafts/ingest.ts` — shared ingestion service (also
  used by `/api/admin/ai-drafts`).
* `migrations/0002_seo_autopilot_jobs.sql` — D1 schema for the jobs
  table.
