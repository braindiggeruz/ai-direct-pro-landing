# R1.1 `/start` latency — remediation evidence

Date: 2026-08-01.
Slice: second latency fix, merged at `41ec9e3401b3e974edf8d97480695e9845a4924f`.
Deployment: `ede1d0f4-6a06-40e2-9b6c-dee2a7812c69`, source `41ec9e3`.
Rollback target: `af73edd9-1c90-418d-83d7-c79d81ae2888`, source `a542052`.

## 1. Why the first fix was not enough

The first remediation (`e8b2bd7`) reduced the first result page from four
grounded cards to three, made `typing` feedback non-blocking and fail-fast, and
moved callback acknowledgement into the Worker lifecycle so it no longer
serialized Runtime.

That work was correct and stays in place, but it targeted Telegram message
serialization. `/start` renders one concise home card, so the number of
outbound messages was never its dominant cost. A repeat owner canary on
2026-07-31 measured 12,451 ms of server-side processing.

## 2. Confirmed root cause

Two costs dominated the cold path.

**Runtime bootstrap cascade.** Each schema module protects fresh and test
databases with idempotent DDL and caches the result in a
`WeakMap<D1Database, Promise<void>>`, which only survives for the lifetime of
one Worker isolate. On a cold isolate the `/start` chain re-entered Telegram
transport, identity, organizations, workflow, events, channel addresses,
knowledge, Sotuvchi onboarding, catalog, checkout, outbox, orders and handoff
bootstraps, each issuing its own `CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS` and `ALTER TABLE ADD COLUMN` probes with
duplicate-column handling. Production has been fully migrated since
2026-07-31, so every one of those statements was pure cold-start overhead.

**Synchronous post-turn work.** `createTelegramAgentsRuntimeWiring` returned a
dispatching Runtime that awaited workflow analytics and the notification outbox
flush before returning the buyer-facing result. `/start` creates no
notification, but the flush still resolved a storefront and touched the outbox
before the Telegram response could be sent.

## 3. What changed

### 3.1 Read-only fail-closed schema contract

`functions/api/telegram/agents-schema.ts` issues one contract query per Worker
isolate. It performs no DDL and writes nothing.

The contract verifies the complete surface owned by the bootstraps it allows a
request to skip:

- **32 tables** — the four Telegram agent transport tables, `identities`,
  `organizations`, `memberships`, `contacts`, `workflow_instances`,
  `workflow_transitions`, `knowledge_collections`, `knowledge_items`, `events`,
  `channel_addresses`, `telegram_agent_routes` and the seventeen `sotuvchi_*`
  tables;
- **12 runtime-added columns** — the eight `sotuvchi_storefront_sessions`
  columns (`last_product_id`, `last_intent`, `selection_request_key`,
  `selected_at`, `preferred_locale`, `pending_intent`, `pending_request_key`,
  `pending_at`), the two `sotuvchi_products` quality columns
  (`search_terms_json`, `specifications_json`) and the two `sotuvchi_orders`
  columns (`fulfillment_status`, `buyer_comment`);
- **5 unique indexes** — `idx_sotuvchi_stores_org_id`,
  `idx_sotuvchi_orders_active_draft`, `idx_sotuvchi_order_items_single`,
  `idx_sotuvchi_inventory_moves_order_type`, `idx_sotuvchi_handoffs_active`.

The indexes are in the contract because they are correctness-critical, not
because they are faster. They enforce one store per org, one active draft order
per buyer, one item per order, one inventory movement per order and movement
type, and one active handoff. Allowing a bootstrap bypass without verifying
them would let a partially migrated database silently lose the constraints that
back order idempotency and exactly-once inventory movement. Non-unique
performance indexes are deliberately excluded.

Any mismatch — one missing table, one missing column, one missing unique index
— throws, and the database is never marked verified.

### 3.2 Isolate-local verified marker

`functions/platform/storage/runtime-schema.ts` holds a `WeakSet<D1Database>`
with `markRuntimeSchemaVerified` and `isRuntimeSchemaVerified`. It is not a
global flag: it is keyed on the exact D1 binding object used by the request and
lives only as long as the isolate. A fresh or test database without a
successful contract verification still runs the original idempotent bootstrap,
so the migration suites are unaffected.

### 3.3 Webhook ordering

`handleTelegramAgentsWebhook` now runs:

1. method guard (`405` for anything but `POST`);
2. Telegram secret verification (`401`, constant-time);
3. `schemaReady` contract;
4. body parse (`400`, 64 KiB cap);
5. update grammar validation;
6. idempotency reservation;
7. Runtime, via the Worker lifecycle.

An unauthenticated request therefore never reaches the database. A schema
mismatch returns a controlled `503` with the body `unavailable` before the
update is reserved and before Runtime starts, and only the allowlisted log code
`schema_unavailable` is emitted — no SQL, no driver error text, no user data.

### 3.4 Lifecycle post-turn scheduling

`createTelegramAgentsRuntimeWiring` accepts an optional
`schedulePostTurn(promise)`. The production entry point passes the Pages
Functions `waitUntil` from the same request context that already tracks
`processAccepted`, so the nested registration happens while the outer lifecycle
task is still pending. `runtime.run` is still awaited; only workflow analytics
and the outbox flush move off the buyer-facing path, and the scheduled promise
is caught before registration so `waitUntil` never observes a rejection.

Callers without a scheduler — every test harness and every non-Pages caller —
keep awaiting the post-turn work, which preserves the existing deterministic
integration assertions.

## 4. Test evidence

`tests/telegram-agents-schema.test.ts` (6 tests):

- a fully migrated in-memory database (migrations `0013`–`0030`) passes the
  contract, is marked verified, and issues zero further prepares for both a
  repeated verification and a bypassed bootstrap;
- an incomplete database is never marked verified and fails closed;
- dropping any one of the five correctness-critical unique indexes fails the
  contract closed;
- dropping one runtime-added column fails the contract closed;
- a drift guard derives the bypassed module set from the source (every file
  containing the bypass guard, plus its sibling `store.ts`) and asserts the
  contract's table and unique-index lists match it exactly in both directions;
- a second drift guard asserts every `ALTER TABLE ... ADD COLUMN` in a bypassed
  module appears in the contract.

`tests/telegram-agents-webhook.test.ts` (56 tests) adds:

- a missing or wrong Telegram secret returns `401` and the schema check is
  never called;
- a failing contract returns `503` with body `unavailable`, no reservation, no
  Runtime run, and only `schema_unavailable` in the log with no raw detail.

`tests/sotuvchi-orders-inventory.test.ts` (40 tests) adds:

- with a lifecycle scheduler, the seller answer and the durable inventory
  decrement land before the dispatch runs, exactly one post-turn promise is
  registered, it never rejects, the buyer intent is delivered exactly once, a
  later turn re-flushes the same outbox without duplicating it, and exactly one
  `order_confirmed` inventory movement exists;
- without a scheduler, the dispatch still settles inside the turn.

Domain and security regression across the market, Telegram, tenancy, owner and
automation corpus stayed green: tenant isolation, seller authorization, order
idempotency, exactly-once inventory, exactly-once notification, update dedup,
webhook auth, schema fail-closed, no raw PII logging, no secret leakage and
catalog grounding all PASS.

## 5. Production verification

The extended contract was rehearsed read-only against production D1 **before**
the code was changed, so the deployment could not fail closed:

| Check | Expected | Production |
| --- | ---: | ---: |
| Bypassed tables | 32 | 32 |
| Storefront session columns | 8 | 8 |
| Product quality columns | 2 | 2 |
| Order columns | 2 | 2 |
| Correctness-critical unique indexes | 5 | 5 |

`rows_written` was 0 and `changed_db` was false for every probe.

## 6. Measured latency

| Observation | UTC | Server-side processing |
| --- | --- | ---: |
| Baseline | 2026-07-31T04:39:22Z | 13,264 ms |
| Baseline | 2026-07-31T04:40:40Z | 13,629 ms |
| Baseline | 2026-07-31T04:41:11Z | 4,019 ms |
| Baseline | 2026-07-31T04:41:19Z | 4,484 ms |
| Baseline, newest before the fix | 2026-07-31T05:16:00Z | 12,451 ms |
| Owner `/start` after `41ec9e3` | 2026-08-01T13:16:33Z | **2,564 ms** |

The metric spans durable update reservation to completed delivery and
finalization. It stores no message text, Telegram identifier, chat reference or
contact data.

The post-deployment observation is a genuine cold isolate: it was the first
request to reach the new deployment. Server-side processing fell 79 percent and
landed below the 3,000 ms target, and the owner independently confirmed the bot
loaded fast.

## 7. Side effects

| Aggregate | Before | After |
| --- | ---: | ---: |
| `telegram_agent_updates` | 12 | 13 |
| completed / failed | 12 / 0 | 13 / 0 |
| `sotuvchi_orders` | 0 | 0 |
| `sotuvchi_handoffs` | 0 | 0 |
| `sotuvchi_notifications` | 0 | 0 |
| `sotuvchi_inventory_moves` | 44 | 44 |
| `sotuvchi_stores` | 1 | 1 |
| `sotuvchi_products` | 48 | 48 |

Exactly one update was processed, with no duplicate response and no business
side effect.

## 8. Honest limits

- One cold-isolate observation is not a p95. Warm follow-up latency and
  repeated cold-start behaviour were not sampled, because doing so would have
  required either spamming the production bot or several owner actions.
- The remaining residual costs identified during diagnosis are untouched and
  still available if a future slice needs them: two sequential rate-limit D1
  calls, the awaited channel address binding, the onboarding and stored
  storefront lookups, the bot-start analytics write and the pending-budget
  clear.
- No migration was applied and `wrangler d1 migrations apply --remote` was not
  run. The production ledger still ends at `0025` while `0026`–`0030` are
  physically present.

## 9. Rollback

Redeploy `af73edd9-1c90-418d-83d7-c79d81ae2888` (source `a542052`). No schema
change accompanies this slice, so a rollback needs no database action.
