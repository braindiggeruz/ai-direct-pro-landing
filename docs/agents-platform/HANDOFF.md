# GPTBot Agents — handoff

## State

- Date: 2026-07-31.
- Canonical repository:
  `F:\Claude\gptbot-repo-clean-20260729-1140`.
- Branch: `main`.
- Released code:
  `e8b2bd73092758cc83ad25a4ed2ca95b7b239cb9`.
- Production deployment:
  `226d65cc-5be9-4c5e-ba30-93af250b34df`.
- Immutable deployment:
  `https://226d65cc.ai-direct-pro-landing.pages.dev`.
- Telegram bot: `@gptbot_market_bot`.
- Stage: R1.1 released; post-fix owner latency canary pending.

Never develop or deploy from the recovery repository
`F:\Claude\gptbot-repo`. Do not read or index its audit directory. Never put a
token, webhook secret, credential fragment, hash or length into chat, logs or
governance. The current bot credentials are DPAPI-protected outside Git in:

`F:\Claude\gptbot-secure-owner-kit\20260730-201941\r1-vault.json`

Use the owner-kit helpers only in-process and clear temporary environment
variables afterwards. Do not print the vault.

## What is already complete

R1.1 upgraded the synthetic technical canary into a controlled
pilot-quality Telegram commerce product:

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

## Release evidence

- Main feature merge:
  `a1ae79719fc6a2bf90a2a6986ad894fe66ef6a2b`.
- Latency fix commit:
  `f3e15b53e0621c433295a0053c91231edaf2c493`.
- Latency fix merge/deployed source:
  `e8b2bd73092758cc83ad25a4ed2ca95b7b239cb9`.
- Previous rollback deployment:
  `51320b3e-fe86-4bb2-9f7c-cf7cec371bf8` at source `a1ae797`.
- Current deployment:
  `226d65cc-5be9-4c5e-ba30-93af250b34df`.
- D1 backup:
  `F:\Claude\gptbot-r1.1-production-backups\20260731-092128\gptbot-ai-drafts-production.sql`.
- Restore-ready derivative:
  `F:\Claude\gptbot-r1.1-production-backups\20260731-092128\gptbot-ai-drafts-production.restore-ready.sql`.
- Full tests: 981/981 across 35 suites.
- Root/Functions TypeScript, root/backend/Pages builds, scoped ESLint, agent
  boundaries, migration rehearsal and fixture checks: PASS.
- Root/backend production audits: 0/0 findings.
- Secret scan: clean over 2,676 files.

Cloudflare automatic deployment did not run after either main push. The
current deployment was manual and carries source `e8b2bd7`. Railway did not
deploy. No migration or D1 mutation was needed for the latency fix.

## Production state

- One active controlled synthetic pilot store.
- 48 synthetic products; zero real stores or real products.
- Zero orders, handoffs, seller notifications, automation jobs and DLQ jobs.
- Telegram webhook expected URL matches, pending updates 0, last error none.
- HTTP canary: root/RU/UZ/deployment 200, webhook GET 405, unauthorized POST
  401.
- n8n retired; first-party automation is the only production path.
- Automatic publication and SEO scheduler disabled.
- Payments, escrow and public marketplace disabled.

## Latency incident and fix

The owner's successful walkthrough exposed a P1/P2 product latency defect.
The baseline from four completed production interactions is:

- minimum 4,019 ms;
- maximum 13,629 ms;
- average 8,849 ms;
- four of four above three seconds;
- duplicates 0.

The primary amplification was sequential delivery of four Telegram product
cards. Callback acknowledgement also serialized a Telegram round trip before
Runtime. The deployed fix changes the first page to three cards with existing
pagination, adds non-blocking fail-fast typing feedback, and runs the
Worker-tracked callback acknowledgement concurrently with Runtime. Callback
and typing feedback use a two-second/no-retry budget; domain message delivery
keeps its existing reliability behavior.

## Remaining canary

Ask the owner for exactly one action:

1. open `@gptbot_market_bot`;
2. send `Нужен подарок до 50 000 сум` or an equivalent Uzbek Latin request;
3. report only whether the first response feels faster.

Then query only aggregate privacy-safe D1 telemetry. Do not query or print raw
Telegram identifiers or messages. Compare the newest completed
`processing_ms` with the 8,849 ms baseline and verify that orders, handoffs,
notifications, automation jobs and DLQ jobs remain zero.

If latency is materially improved and the grounded three-card result is
correct, set:

```text
R1_1_MARKET_PRODUCT_POLISH=COMPLETE
TELEGRAM_UX_CANARY=PASS
NEXT_STAGE=R1_STORE_PILOT_1
```

If it is still slow, do not add concurrent unordered `sendMessage` calls:
Telegram delivery order is not guaranteed. First capture phase-level
runtime/delivery timing with privacy-safe telemetry, then optimize the
dominant phase. Keep order, tenant, inventory and deduplication invariants
unchanged.

## Start commands

```powershell
Set-Location F:\Claude\gptbot-repo-clean-20260729-1140
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
