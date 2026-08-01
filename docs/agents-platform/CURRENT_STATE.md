# CURRENT_STATE — 2026-08-01

## Current production state

GPTBot Market R1.1 is implemented, migrated, deployed and closed. The start
latency that blocked the sprint is remediated and confirmed in production.

- Canonical repository:
  `F:\Claude\gptbot-repo-clean-20260801`.
- Branch and remote authority: `main`.
- Released merge:
  `41ec9e3401b3e974edf8d97480695e9845a4924f`.
- Cloudflare Pages deployment:
  `ede1d0f4-6a06-40e2-9b6c-dee2a7812c69`.
- Immutable URL:
  `https://ede1d0f4.ai-direct-pro-landing.pages.dev`.
- Rollback target: deployment `af73edd9-1c90-418d-83d7-c79d81ae2888`,
  source `a542052`.
- Canonical URL: `https://gptbot.uz`.
- Telegram identity: `@gptbot_market_bot`.
- Webhook: configured at the isolated Agents endpoint, expected URL matches,
  zero pending updates and no current provider error.

The production HTTP canary passes: root, RU Sotuvchi, UZ Sotuvchi and the
immutable deployment return 200; webhook GET returns 405, an unauthorized POST
returns 401, a malformed unauthorized POST also returns 401, an unknown route
returns 404, the Owner Control Center returns 401 without a session and GPT
Chat returns 200.

## R1.1 product result

The bot provides one concise start screen, RU/Uzbek Latin navigation, grounded
catalog search, budget normalization, details, similar products,
two-to-three-product comparison, idempotent single-product checkout, buyer
order history, store-scoped seller actions, human handoff, privacy-safe
analytics and Owner Control Center visibility.

Migrations `0026`–`0030` are applied. The controlled store contains 48 clearly
synthetic products. Production still has zero real stores, orders, handoffs,
seller notifications, automation jobs and dead-letter jobs. Payments, custody,
escrow and public marketplace launch remain disabled.

The pre-migration backup is outside Git at:

`F:\Claude\gptbot-r1.1-production-backups\20260731-092128\gptbot-ai-drafts-production.sql`

Cloudflare's export orders one existing parent-table index after child-table
inserts. The original export is preserved; a restore-ready derivative that
moves only that existing index before the child DDL is stored beside it and
passes `integrity_check=ok`, foreign-key validation and control counts.

## Latency remediation

### First fix — Telegram serialization

Deployed at `e8b2bd7`. It reduced first-page output from four to three grounded
cards, emitted best-effort `typing` without a serialized round trip, bounded
`typing` and callback acknowledgement to a two-second no-retry budget, and kept
callback acknowledgement in the Worker lifecycle.

It did not solve `/start`, because `/start` renders a single card, so message
serialization was never its dominant cost. A repeat owner canary measured
12,451 ms of server-side processing.

### Second fix — cold-start schema probes

The dominant cost was the runtime bootstrap cascade. Every module protects
fresh and test databases with idempotent DDL, and none of them could tell that
production is already migrated, so a cold Worker isolate ran dozens of
sequential `CREATE TABLE`, `CREATE INDEX` and `ALTER TABLE ADD COLUMN` probes
before the buyer saw anything. The second cost was a synchronous post-turn
block: workflow analytics and the notification outbox flush ran before the
Runtime result returned, even when there was nothing to dispatch.

The remediation, deployed at `41ec9e3`:

- replaces the cascade with one read-only, fail-closed runtime schema contract
  per Worker isolate;
- verifies the complete surface those bootstraps own — 32 tables, 12
  runtime-added columns and the 5 unique indexes that carry business
  invariants (one store per org, one active draft order, one item per order,
  one inventory move per order and movement type, one active handoff);
- keys the verified marker to the exact D1 binding object in an isolate-local
  `WeakSet`, so fresh and test databases keep their bootstrap and the
  migration suites keep working;
- runs the contract after Telegram secret verification and before body parse
  and reservation, so an unauthenticated request still costs no database work
  and a schema mismatch fails closed with a controlled 503 and an allowlisted
  log code;
- moves best-effort analytics and the outbox flush onto the Cloudflare request
  lifecycle, while callers without a lifecycle scheduler keep awaiting them so
  deterministic assertions are unchanged.

Unique indexes are part of the contract deliberately. Skipping a bootstrap
without them would let a partially migrated database lose the constraints that
back exactly-once inventory movement and order idempotency.

No order, inventory, tenant, grounding, rate-limit or deduplication boundary
was changed.

### Measured result

| Observation | Server-side processing |
| --- | ---: |
| Newest before the second fix | 12,451 ms |
| Earlier samples | 13,629 / 13,264 / 4,484 / 4,019 ms |
| Owner `/start` after `41ec9e3`, cold isolate | **2,564 ms** |

The owner confirmed the bot loaded fast. Production carried no side effect:
`telegram_agent_updates` moved 12 → 13, all completed with zero failed, and
orders, handoffs, notifications and inventory movements were unchanged.

One cold-isolate observation is enough to close the stage but not enough to
assert a stable p95. Warm-path and repeated cold-start behaviour remain
unmeasured.

## Release gates

- Full repository: 1051/1055 tests across 46 suites. The four failures are
  pre-existing on clean `origin/main` `a146413` and unrelated to this slice —
  the sitemap now emits 232 entries against a hard-coded 228, three new SEO
  release documents lack an n8n inventory classification, and one
  release-preparation checklist assertion. Reproduced on a clean worktree of
  `origin/main` before the change.
- Targeted: telegram-agents-schema 6/6, telegram-agents-webhook 56/56,
  sotuvchi-orders-inventory 40/40, store-pilot-1-rehearsal 8/8.
- Root and Functions TypeScript: PASS.
- Scoped ESLint for the latency slice: PASS.
- Root production build: PASS; 111 pages, 118 articles, 232 sitemap entries.
- Backend typecheck/build: PASS/PASS.
- Pages Functions compile: PASS.
- Agent boundary checker: zero violations.
- Migration rehearsal (local, in-memory): PASS.
- Root/backend production dependency audits: 0/0 findings.
- Secret scan: clean over 2,700 files.
- `git diff --check`: PASS.
- `git fsck --full`: no corruption; only unreachable dangling objects.

No migration was applied for this slice, and
`wrangler d1 migrations apply --remote` was not run: the production ledger
still ends at `0025` while `0026`–`0030` are present, so a ledger-managed
replay would not be idempotent.

## Operational invariants

- Tenant isolation, order idempotency and inventory idempotency remain PASS.
- Catalog and inventory databases remain the source of truth.
- No price, stock, specification or delivery promise is invented.
- n8n is retired; first-party Cloudflare automation is the sole path.
- Automatic publication and the SEO scheduler are disabled.
- Cloudflare automatic deployment is disabled; the new deployment was a manual
  exact-SHA upload and no automatic build was triggered by the `main` push.
- Railway's GitHub deployment trigger is disconnected.

## Store Pilot #1 preparation

Prepared and rehearsed against synthetic data only:

- `docs/agents-platform/release/R1_STORE_PILOT_1_PREPARATION.md` — consent
  checklist, out-of-band seller identity verification, onboarding form, import
  rules, operating agreements, pause/rollback and hard stops;
- `fixtures/market/store_pilot_1_import_template.json` — the 10–30 product
  import template;
- `scripts/market/validate-pilot-import.ts` — a read-only validator that
  imports the real catalog normalizers, so it cannot drift from what
  production accepts;
- `tests/store-pilot-1-rehearsal.test.ts` — 8/8, covering the import contract
  and a full synthetic onboarding → import → RU/UZ search → order → seller
  confirmation → exactly-one inventory decrement → handoff → teardown
  walkthrough.

One finding worth flagging early: **product image URLs cannot be used.** A
media reference must match `^[A-Za-z0-9][A-Za-z0-9._:-]*$`, which excludes `/`,
so `http(s)` links are rejected by the catalog contract. Images are Telegram
photo `file_id` values. Ask the seller for photos through the bot, or launch
with no images; do not collect a spreadsheet of image links.

## Exact next action

Store Pilot #1. Engineering is unblocked; the stage waits only on owner
business inputs: one consented verified seller, 10–30 approved real products
with integer UZS prices and inventory, and signed-off SLA, support and incident
ownership. No real store may be created without explicit owner authorization.
