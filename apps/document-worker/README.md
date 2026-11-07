# GPTBot.uz document worker

One-purpose Node >=22 service in the existing monorepo. It claims one D1 document job through the existing Cloudflare application, renders a PDF, uploads it through that application to private R2, and exits the rendering child. The web/chat backend stays on Cloudflare. There is no local queue, database credential, Railway account token, user cookie, or AI generation in this process.

Supported jobs: `proposal_pdf` (owner-entered custom terms, A4) and `presentation_pdf` (RU/UZ, landscape). Only bounded structured text is accepted. Prices, dates, promises and case-study results are never added by the renderer.

## Run locally

```powershell
npm ci --prefix apps/document-worker --ignore-scripts
# Enter the shared worker secret locally; do not put it in source or shell history.
$env:DOCUMENT_API_BASE_URL = 'https://gptbot.uz'
$env:DOCUMENT_CHROMIUM_EXECUTABLE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node apps/document-worker/src/index.mjs
```

The API must be enabled and have its D1 schema and private `DOCUMENT_ARTIFACTS` bucket configured. `DOCUMENT_WORKER_SECRET` must be the same random value in both services (32–256 non-whitespace characters). No browser is installed or downloaded at startup. The Docker image bundles a matching Chromium.

## Environment

| Variable | Value / bounds |
| --- | --- |
| `DOCUMENT_API_BASE_URL` | Required HTTPS origin, e.g. `https://gptbot.uz`; no path, credentials, non-default port, query or fragment |
| `DOCUMENT_WORKER_SECRET` | Required shared service secret; only sent to the configured API origin |
| `DOCUMENT_API_ALLOWED_HOSTS` | Exact comma-separated hostnames; defaults `gptbot.uz,www.gptbot.uz`. Explicitly add a controlled preview hostname when testing |
| `PORT` | Railway-provided port; default 3000; binds `0.0.0.0` |
| `DOCUMENT_POLL_SECONDS` | Default/minimum 20, maximum 300 |
| `DOCUMENT_JOB_TIMEOUT_SECONDS` | Default/maximum 90; includes upload; 15 seconds reserved for upload |
| `DOCUMENT_SHUTDOWN_SECONDS` | Default 25; stop claiming immediately, allow current job this long, then abort/requeue |
| `DOCUMENT_CHROMIUM_EXECUTABLE` | Optional local browser path; omit in Docker |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | Set **45** in Railway to cover 25-second shutdown plus a bounded 15-second failure report |
| `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` | Set **0** |

## Railway configuration

Use the same repository, a separate service and **one replica**. Apply explicit settings through the Railway service API: root directory `/apps/document-worker`, Dockerfile builder with `Dockerfile` relative to the service source root, start command `node src/index.mjs`, health path `/healthz`, health timeout 30 seconds, restart `ON_FAILURE` up to three times. `infrastructure-settings.json` records these non-secret settings for reproducible provisioning; it is a reference manifest, not Railway Config-as-Code. The provider rejects new-service opt-in to the deprecated `railway.json` workflow, so this app does not ship that configuration file. Preserve the monorepo directory structure when uploading source. No persistent volume or public user endpoint is required. `/healthz` returns only status and busy state, with no secrets or document data. A healthy idle process does not prove that Cloudflare is reachable; safe structured logs show upstream failures.

`Dockerfile` pins `mcr.microsoft.com/playwright:v1.61.1-noble`; `package.json` and `package-lock.json` pin `playwright-core` 1.61.1. The version matches the monorepo's existing dependency. The lock integrity comes from the repository's existing `yarn.lock`. Fonts are vendored from the approved proposals project, with the Manrope OFL license included. Chromium runs as the image's `pwuser`.

```sh
docker build -t gptbot-document-worker apps/document-worker
docker run --rm --env-file /secure/path/document-worker.env -p 3000:3000 gptbot-document-worker
```

Official references checked during implementation: [Playwright image tag](https://mcr.microsoft.com/en-us/artifact/mar/playwright/tag/v1.61.1-noble), [Railway infrastructure configuration](https://docs.railway.com/infrastructure-as-code), [Railway shutdown draining](https://docs.railway.com/deployments/deployment-teardown). Railway's default drain time is zero, so the drain variable above is necessary.

## API contract

All requests use `Authorization: Bearer DOCUMENT_WORKER_SECRET`, omit cookies and refuse redirects. Each request has a 15-second timeout. Claims and JSON responses are streamed with a 1 MiB payload plus small envelope bound.

* `POST /api/internal/documents/claim`, JSON `{}` → `{ok:true,job:null}` or `{ok:true,job:{id,type,payload,leaseToken,leaseExpiresAt,attempt}}`. Lease expiry is epoch milliseconds; attempts are 1–3. No heartbeat: the worker keeps a five-second lease margin.
* `POST /api/internal/documents/{id}/complete`, `Content-Type: application/pdf`, `X-Document-Lease` → `{ok:true,status:'ready',replay:boolean}`. Maximum PDF size 10 MiB.
* `POST /api/internal/documents/{id}/fail`, same lease header, JSON `{reason:'invalid_payload'|'timeout'|'render_failed'}`. Ledger owns retries and the three-attempt limit. A 409 is a stale lease and is not retried locally.
* `POST /api/internal/documents/maintenance`, JSON `{}` or `{cursor}` → `{ok:true,expired,orphanObjectsDeleted,cursor}`. One page runs at startup and every 60 seconds, retaining the opaque cursor. A separate serial maintenance loop cannot hold up a render/claim. Errors back off to five minutes; shutdown aborts its request. Physical cleanup resumes after restart; the API independently enforces access expiry.

An ambiguous completion response can be followed by a fail request, but the server conditionally checks the same active lease and must not overwrite a committed `ready` result. Durable D1 state handles process/container crashes and restarts; temporary PDFs exist only in memory. Polling defaults to 20 seconds and backs off to five minutes on upstream errors. An API outage cannot create a busy retry loop.

## Rendering and privacy

The renderer rejects unknown fields, uploaded HTML, scripts and remote-document types. All content becomes escaped text. Browser JavaScript and service workers are disabled; CSP denies scripts, images, connections and remote fonts; routing aborts every external request; browser networking is offline. Manrope Latin, Latin Extended, Cyrillic and Cyrillic Extended fonts are embedded as data URLs. Browser launch also disables background network services and DNS resolution.

Long text is measured in the print layout and split into continuation pages; the renderer verifies every source text character is preserved and rejects overflow. It does not shrink content to unreadable type or silently clip it. A separate render child and browser are created for each job and terminated on completion/deadline. Linux process-group termination also removes Chromium descendants. No browser runs between jobs. Logs contain event, reason, document type, attempt, duration, PDF size/page count and explicitly labelled **Node RSS**, never payloads, company/contact names, job IDs, tokens or response bodies. Node RSS excludes Chromium's native-process memory; use Railway/container memory for total resource usage.

## Verification

```powershell
node --test tests/document-worker.test.mjs tests/document-worker-health.test.mjs
$env:DOCUMENT_TEST_CHROMIUM = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node --test tests/document-worker-render.test.mjs
```

The browser suite runs only when the executable is explicitly supplied. It generates ignored `.artifacts/` PDFs/screenshots for RU, Uzbek Latin/Cyrillic, hostile-markup-as-text and long-text pagination, then exercises the isolated child. Unit tests cover strict payloads, HTTPS/host configuration, bearer/lease transport, response bounds, serial processing, stale leases, offline backoff, safe metrics and graceful shutdown.

Local verification on 2026-11-07: 15 unit tests, one real HTTP health/privacy test and 2 real Edge rendering tests pass. The representative proposal is one page; Uzbek presentation one page; long-text fixture fourteen pages, with zero overflow or text loss. Docker is unavailable in the local environment: image build, Railway deployment, real D1→R2 export and production resource usage require the deployment verification step; they are not claimed by local tests.
