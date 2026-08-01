# GPTBot Agents — handoff

## State

- Date: 2026-08-01.
- Canonical repository:
  `F:\Claude\gptbot-repo-clean-20260801`.
- Branch: `main`.
- Released code:
  `41ec9e3401b3e974edf8d97480695e9845a4924f`.
- Production deployment:
  `ede1d0f4-6a06-40e2-9b6c-dee2a7812c69`.
- Immutable deployment:
  `https://ede1d0f4.ai-direct-pro-landing.pages.dev`.
- Rollback target: `af73edd9-1c90-418d-83d7-c79d81ae2888` at source `a542052`.
- Telegram bot: `@gptbot_market_bot`.
- Stage: R1.1 complete. Next stage is Store Pilot #1 preparation, blocked only
  on owner business inputs.

The older clone `F:\Claude\gptbot-repo-clean-20260729-1140` is no longer the
canonical development repository. It still holds the original interrupted
latency WIP on `fix/r1.1-start-latency`; that work is now recovered, merged and
deployed, and a full backup of the dirty tree lives outside Git at
`F:\Claude\gptbot-market-wip-backups\20260801-174139-r1-start-latency`.

Never develop or deploy from the recovery repository `F:\Claude\gptbot-repo`.
Do not read or index its audit directory. Never put a token, webhook secret,
credential fragment, hash or length into chat, logs or governance. The current
bot credentials are DPAPI-protected outside Git in:

`F:\Claude\gptbot-secure-owner-kit\20260730-201941\r1-vault.json`

Use the owner-kit helpers only in-process and clear temporary environment
variables afterwards. Do not print the vault.

## What is already complete

R1.1 upgraded the synthetic technical canary into a controlled pilot-quality
Telegram commerce product:

- concise `/start` and stable home/back/catalog navigation;
- RU, Uzbek Latin and mixed-language deterministic paths;
- grounded category, alias, typo and budget search;
- verified product cards, details and similar products;
- comparison of two or three products with unknown fields kept unknown;
- idempotent single-product order flow and buyer order history;
- store-scoped seller status actions and exactly-once inventory decrement;
- explicit human handoff and seller notification;
- privacy-safe funnel analytics, Telegram reliability metrics and Owner
  Control Center projections;
- rate limits, bounded retries, secret/body validation and provider-independent
  deterministic catalog fallback;
- 36 additional synthetic fixture products across six bilingual categories.

Migrations `0026`–`0030`, the fixture and Telegram RU/UZ metadata are already
applied. Do not reapply or regenerate them without a new justified change.

Do not run `wrangler d1 migrations apply --remote`. The production ledger still
ends at `0025` while `0026`–`0030` are physically present, because they were
applied one by one with `wrangler d1 execute --remote --file`. A ledger-managed
replay would attempt non-idempotent `ALTER TABLE ADD COLUMN` statements.

## Release evidence

- Main feature merge:
  `a1ae79719fc6a2bf90a2a6986ad894fe66ef6a2b`.
- First latency fix merge:
  `e8b2bd73092758cc83ad25a4ed2ca95b7b239cb9`.
- Second latency fix commits:
  `3b631a7` (implementation) and `ffc6284` (tests) on
  `fix/r1.1-start-latency-current`.
- Second latency fix merge and deployed source:
  `41ec9e3401b3e974edf8d97480695e9845a4924f`.
- Current deployment: `ede1d0f4-6a06-40e2-9b6c-dee2a7812c69`.
- Previous rollback deployment: `af73edd9-1c90-418d-83d7-c79d81ae2888` at
  source `a542052`.
- D1 backup:
  `F:\Claude\gptbot-r1.1-production-backups\20260731-092128\gptbot-ai-drafts-production.sql`.
- Restore-ready derivative:
  `F:\Claude\gptbot-r1.1-production-backups\20260731-092128\gptbot-ai-drafts-production.restore-ready.sql`.
- Full tests: 1051/1055 across 46 suites; the four failures are pre-existing on
  clean `origin/main` and tracked in `KNOWN_ISSUES.md`.
- Root/Functions TypeScript, root/backend/Pages builds, scoped ESLint, agent
  boundaries, migration rehearsal and fixture checks: PASS.
- Root/backend production audits: 0/0 findings.
- Secret scan: clean over 2,700 files.

Cloudflare automatic deployment did not run after the `main` push. The current
deployment was a manual exact-SHA upload carrying source `41ec9e3`. Railway did
not deploy. No migration or D1 mutation was needed for either latency fix.

## Production state

- One active controlled synthetic pilot store.
- 48 synthetic products; zero real stores or real products.
- Zero orders, handoffs, seller notifications, automation jobs and DLQ jobs.
- Telegram webhook expected URL matches, pending updates 0, last error none.
- HTTP canary: root/RU/UZ/deployment 200, webhook GET 405, unauthorized POST
  401, malformed unauthorized POST 401, unknown route 404, Owner Control
  Center 401 without a session, GPT Chat 200.
- n8n retired; first-party automation is the only production path.
- Automatic publication and SEO scheduler disabled.
- Payments, escrow and public marketplace disabled.

## Latency incident and resolution

The owner's successful walkthrough exposed a P1/P2 product latency defect.

The first fix targeted Telegram message serialization and shipped at
`e8b2bd7`. It did not solve `/start`, which renders a single card, so message
count was never that path's dominant cost. A repeat owner canary measured
12,451 ms of server-side processing.

The dominant cost was the cold-isolate runtime bootstrap cascade: every schema
module protects fresh and test databases with idempotent DDL and none could
tell that production is already migrated, so a cold Worker isolate ran dozens
of sequential `CREATE TABLE`, `CREATE INDEX` and `ALTER TABLE ADD COLUMN`
probes before the buyer saw anything. A synchronous post-turn block came
second: workflow analytics and the notification outbox flush ran before the
Runtime result returned even when there was nothing to dispatch.

The second fix, merged at `41ec9e3`, replaces the cascade with one read-only
fail-closed runtime schema contract per Worker isolate, and moves the
best-effort post-turn work onto the Cloudflare request lifecycle. Details and
the exact contract surface are in
`docs/agents-platform/release/R1_1_START_LATENCY_EVIDENCE.md`.

Measured result: 2,564 ms of server-side processing on a cold isolate against a
12,451 ms newest baseline, with the owner confirming the first response feels
fast and production carrying no order, handoff, notification or inventory side
effect.

One cold-isolate observation closes the stage but does not establish a stable
p95. Warm-path and repeated cold-start behaviour remain unmeasured; treat any
future latency claim beyond this as requiring a fresh sample.

## Next stage

Store Pilot #1 preparation. Engineering is unblocked. The stage waits on owner
business inputs only:

1. one consented, verified seller and their Telegram identity;
2. 10–30 approved real products with integer UZS prices, inventory and images;
3. signed-off SLA, support owner and incident owner.

Do not create a real store, import real products, enable payments, launch the
public marketplace, reconnect Railway, enable an automatic deployment or start
a scheduler without explicit owner authorization.

## Start commands

```powershell
Set-Location F:\Claude\gptbot-repo-clean-20260801
git status --short --branch
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
```

The governance follow-up commit must not trigger a Cloudflare or Railway
deployment. Do not redeploy unchanged application bytes merely for
documentation.
