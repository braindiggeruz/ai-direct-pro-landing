# Lead Radar isolated collector and historical benchmark

`collector/` is the opt-in HTTP-only acquisition foundation. `benchmarks/` is
the existing isolated comparison; its scripts are **not** safe production URL
services and must not be exposed remotely.

## Collector v2 scope

- Python uses **Scrapling 0.4.15 Selector for offline contact-link discovery**.
  Network I/O uses the pinned-IP transport, **not** stock Scrapling Fetcher,
  Spider, Stealth, Playwright or a browser. Runtime refuses a different Scrapling
  version. The same canonical TypeScript contact extractor now runs as a bundled
  Node helper under the isolated collector identity, not inside the Pages request.
- Collects the server-selected official-site URL and a bounded number of
  same-origin contact pages, including `contacts`, `aloqa`, and Russian labels.
  No search engine, arbitrary remote URL endpoint, private groups, account
  discovery, Telegram resolution, send authorization or message sending.
- One explicitly requested job per invocation; 120-second job deadline,
  maximum five page attempts, 128 KiB decoded UTF-8 per page and 512 KiB total
  HTML in memory. The server receives at most 64 KiB of compact metadata/facts,
  never raw HTML. Robots
  is an additional bounded request. Redirects are limited to three per page.
- Every redirect gets a fresh all-addresses-public DNS check. A numeric socket
  connects to the validated IP; TLS verifies the **original hostname** with
  normal system roots and SNI. No proxy environment, cookies, login, CAPTCHA
  service, LLM, browser profile or adaptive contact-ownership guess.
- Rejects private/mixed DNS answers, IP URL literals, alternate ports, URL
  credentials, cross-origin redirects (including HTTP→HTTPS and www changes),
  unsupported encodings, oversized streamed headers/wire/decompressed bodies.
  Missing approved redirect mappings may reduce coverage; failures do not
  broaden origin authority automatically.
- Robots parsing uses the pinned Protego dependency. Explicit 404/410 means
  absent; 401/403 denies; other failures defer. Robots guards cover redirect
  destinations, not just the first URL. Successful policy is cached for six
  hours. Robots crawl delay, full `Retry-After` and host deadlines survive
  restart. An unavailable host does not spin or wait out its cooldown.
  Ordinary robots/inter-request pacing waits cooperatively in slices of at
  most ten seconds, with heartbeat opportunities, only when it fits the
  120-second job deadline. External rate-limit/unavailability deadlines remain
  deferred. This allows a healthy `Crawl-delay: 30` site to yield both a fresh
  homepage and contact page instead of repeatedly refreshing only the homepage.
- After canonical identity/contact extraction, compact observations and the stable receipt enter a synchronous SQLite outbox **before**
  delivery. Only an explicit matching server ACK clears pending. Network
  failure retries the same saved body/receipt without refetching; terminal
  lease/identity/receipt conflicts quarantine that execution. A local fenced
  run lease prevents concurrent invocations sharing this state file.
- Continuation is always `deferred`, including already collected pages;
  terminal `partial` never carries retry instructions. Each resumed execution
  fetches the original homepage again before contact pages, within the same
  five-attempt budget, so the server receives a fresh ownership anchor rather
  than treating checkpoint HTML as current evidence. The helper retains all
  canonical phone-conflict, named-person and footer exclusions. The server
  checks org/lease/current identity/DNC/origin/time/field shape; it assigns IDs,
  classification and source metadata. Neither extractorVersion nor source hash
  is remote attestation. This trusts authenticated collector observations,
  NOT worker-provided Telegram verification, consent or send permission.

## Local verification (no external collection)

Use the already isolated, hash-locked Scrapling environment described below:

```powershell
Set-Location F:\Claude\gptbot-lead-radar-integration-20260827
npm run test:lead-radar-crawler
```

Tests use owned in-memory HTTP/HTML fixtures, mocked DNS/connections, and
temporary SQLite databases. They do not connect to a company site or the live
control API, use a real token, invoke a browser, or send messages.
`tests/fixtures/crawler-protocol.json` contains deterministic real-engine
envelopes for TypeScript acceptance tests. Python tests reconstruct and compare
them, including a two-generation rate-limit/resume case with newly fetched HTML.

## Explicit activation boundary

No credentials, Windows service, task schedule or deployment is created by
this package. Before live activation, an operator must provision a **separate
least-privileged Windows identity/environment**, prevent that identity from
reading the Telegram Bridge vault, and restrict this directory/state-file ACLs
to that identity. A Python virtualenv alone is **not** OS isolation. Do not run
it under the Bridge identity or reuse owner/Bridge credentials.

The server must separately enable its collector feature and register a dedicated
org-scoped token hash. The protected wrapper supplies `CRAWLER_API_BASE` (the exact HTTPS
`https://gptbot.uz/api/lead-radar/crawler` prefix), `CRAWLER_TOKEN`, `CRAWLER_NODE`,
and `CRAWLER_EXTRACTOR`. The Node subprocess receives NO token or inherited user hooks.
Token syntax is exactly `lrcr_` followed by 64 lowercase hexadecimal characters.
The token must be injected securely into this worker's environment; never pass
it in command arguments, save it in this repo, or print it in logs.

Once these prerequisites are reviewed, an explicit invocation is:

```powershell
.\.venv-scrapling\Scripts\python.exe -m collector --once
```

`--state` may point to the isolated identity's private state location. Default
is this subtree's ignored `.collector-state/state.sqlite3`. The store contains
compact public contact observations (v2 never stores HTML): exclude it and its
WAL/SHM siblings from Git, shared folders and unapproved backup/export. Define
backup retention before unattended operation. Terminal ACK/rejection immediately
clears the row's observation payload while preserving receipt identity/digest. At each
explicit run, `StateStore.maintenance(now)` quarantines unresolved receipts older
than seven days and clears their payload **without** marking them accepted. Fresh
pending bytes stay unchanged for retries. Only already-expired robots cache and
source deadlines are pruned; future cooldowns are never shortened. These logical
deletions are not a claim of forensic disk/WAL erasure, so private ACLs and backup
policy remain mandatory. No implicit scheduler is installed;
`--once` exits after at most one claim (or pending-result delivery). A crash
may leave the local run lease until its ten-minute expiry; do not erase state
to bypass a source deadline. Multiple machines with different state files
still require the server's global source coordination.

**Not claimed verified:** live API receipt acceptance, Windows ACL/service
isolation, real-site coverage/performance, authenticated admin workflow, or
any sending readiness. Browser rendering remains disabled until subresource
egress and process isolation are implemented and tested independently.

The former v1 Pages HTML-parsing CPU blocker is addressed by v2 local extraction.
Offline Node benchmarks still do not certify Cloudflare CPU. Verify a bounded
live receipt before unattended use. See `windows/README.md` for the reviewed,
disabled-by-default Scheduled Task installer (not an SCM service), and
`scripts/lead-radar/benchmark-crawler-admission.ts` for reproducible v2 measurements.

## Reproducible Windows setup

Use CPython 3.12 and separate environments. The lock files contain hashes.

```powershell
uv venv --python 3.12 .venv-scrapling
uv pip sync --python .venv-scrapling/Scripts/python.exe benchmarks/requirements-scrapling.lock
.venv-scrapling/Scripts/python.exe -m playwright install chromium

uv venv --python 3.12 .venv-crawl4ai
uv pip sync --python .venv-crawl4ai/Scripts/python.exe benchmarks/requirements-crawl4ai.lock
```

Run the same curated one-page HTTP smoke test and the owned loopback-only JS
fixture:

```powershell
.venv-scrapling/Scripts/python.exe benchmarks/smoke.py --engine scrapling --limit 15
.venv-crawl4ai/Scripts/python.exe benchmarks/smoke.py --engine crawl4ai --limit 15
.venv-scrapling/Scripts/python.exe benchmarks/browser_fixture.py --engine scrapling
.venv-crawl4ai/Scripts/python.exe benchmarks/browser_fixture.py --engine crawl4ai
node --import tsx ../../scripts/lead-radar/summarize-crawler-smoke.ts
```

Generated HTML and reports stay under the ignored `results/` directory. They
must never be committed because public pages can contain personal data.

## Safety boundary

- Inputs are only the reviewed URLs in `benchmarks/sites.json`, maximum 15.
- No login, cookies, proxy, CAPTCHA service, LLM, Firecrawl or Telegram call.
- Robots, TLS, redirect count, original apex and a 900 kB post-download body
  limit are checked.
- The smoke script resolves public DNS before each top-level request, but does
  not pin the resolved address to the browser transport and does not inspect
  browser subresources. It also bounds the body after the library has received
  it. These gaps make the benchmark unsuitable as a remote arbitrary-URL API.
- A production runner needs pinned outbound resolution on every redirect and
  browser subresource, streamed response limits, domain pacing, leases,
  idempotent result receipts, a separate credential and OS-level isolation from
  the Telegram Bridge vault.

Current evidence and limitations are recorded in
`docs/lead-radar/CRAWLER_PILOT_20260829.md`.
