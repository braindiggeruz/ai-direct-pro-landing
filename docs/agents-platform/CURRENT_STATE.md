# CURRENT_STATE — 2026-07-31

## Current production state

GPTBot Market R1.1 is implemented, migrated and deployed to the controlled
synthetic pilot. One post-fix owner latency canary remains before the sprint is
marked complete.

- Canonical repository:
  `F:\Claude\gptbot-repo-clean-20260729-1140`.
- Branch and remote authority: `main`.
- Released merge:
  `e8b2bd73092758cc83ad25a4ed2ca95b7b239cb9`.
- Cloudflare Pages deployment:
  `226d65cc-5be9-4c5e-ba30-93af250b34df`.
- Immutable URL:
  `https://226d65cc.ai-direct-pro-landing.pages.dev`.
- Canonical URL: `https://gptbot.uz`.
- Telegram identity: `@gptbot_market_bot`.
- Webhook: configured at the isolated Agents endpoint, expected URL matches,
  zero pending updates and no current provider error.

The production HTTP canary passes: root, RU Sotuvchi, UZ Sotuvchi and the
immutable deployment return 200; webhook GET returns 405 and an unauthorized
POST returns 401.

## R1.1 product result

The bot now provides one concise start screen, RU/Uzbek Latin navigation,
grounded catalog search, budget normalization, details, similar products,
two-to-three-product comparison, idempotent single-product checkout, buyer
order history, store-scoped seller actions, human handoff, privacy-safe
analytics and Owner Control Center visibility.

Migrations `0026`–`0030` are applied. The controlled store contains 48 clearly
synthetic products. Production still has zero real stores, orders, handoffs,
seller notifications, automation jobs and dead-letter jobs. Payments,
custody, escrow and public marketplace launch remain disabled.

The pre-migration backup is outside Git at:

`F:\Claude\gptbot-r1.1-production-backups\20260731-092128\gptbot-ai-drafts-production.sql`

Cloudflare's export orders one existing parent-table index after child-table
inserts. The original export is preserved; a restore-ready derivative that
moves only that existing index before the child DDL is stored beside it and
passes `integrity_check=ok`, foreign-key validation and control counts.

## Latency remediation

The owner walkthrough passed the functional flow but reported that the bot
felt slow. Production telemetry confirmed four completed interactions at
4,019–13,629 ms, averaging 8,849 ms; all four exceeded three seconds.

The deployed remediation:

- reduces first-page search/category/similar output from four to three
  grounded cards while preserving deterministic pagination;
- emits a best-effort `typing` action for text updates without adding a
  serialized network round trip;
- bounds `typing` and callback acknowledgement to a two-second, no-retry
  feedback budget;
- keeps callback acknowledgement in the Worker lifecycle while allowing
  Runtime work to proceed concurrently.

No order, inventory, tenant, grounding, rate-limit or deduplication boundary
was changed.

## Release gates

- Full repository: 981/981 tests across 35 suites.
- Root and Functions TypeScript: PASS.
- Scoped ESLint for the latency slice: PASS.
- Root production build: PASS; 113 pages, 112 articles, 228 sitemap entries.
- Backend typecheck/build: PASS/PASS.
- Pages Functions compile: PASS.
- Agent boundary checker: zero violations.
- Root/backend production dependency audits: 0/0 findings.
- Secret scan: clean over 2,676 files.
- `git diff --check`: PASS.
- `git fsck --full`: no corruption; only unreachable dangling objects.

## Operational invariants

- Tenant isolation, order idempotency and inventory idempotency remain PASS.
- Catalog and inventory databases remain the source of truth.
- No price, stock, specification or delivery promise is invented.
- n8n is retired; first-party Cloudflare automation is the sole path.
- Automatic publication and the SEO scheduler are disabled.
- Cloudflare automatic deployment is disabled.
- Railway's GitHub deployment trigger is disconnected.

## Exact next action

The owner sends one ordinary product request to `@gptbot_market_bot`, for
example `Нужен подарок до 50 000 сум`, and reports only whether the first
response feels faster. After the new processing metric is compared with the
8,849 ms baseline, governance can mark R1.1 complete and advance to Store
Pilot #1 with one verified seller and 10–30 approved real products.
