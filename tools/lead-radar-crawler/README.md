# Lead Radar crawler benchmark

This directory is an isolated, read-only benchmark for choosing a free local
website crawler. It is **not** a production URL-fetching service.

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
