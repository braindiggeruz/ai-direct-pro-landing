# GPTBot Market R1.1 product audit

Date: 2026-07-31  
Branch: `main`
Audited production SHA: `e8b2bd73092758cc83ad25a4ed2ca95b7b239cb9`

## Release outcome

The product feature was merged at
`a1ae79719fc6a2bf90a2a6986ad894fe66ef6a2b`, migrations `0026`–`0030` and the
controlled synthetic fixture were applied, Telegram RU/UZ metadata and
webhook state were verified, and source `a1ae797` was manually deployed.

The owner's functional walkthrough passed start, grounded search, cards,
comparison and navigation, but identified slow response time. Privacy-safe
production telemetry confirmed four completed interactions at
4,019–13,629 ms, averaging 8,849 ms. The latency remediation was committed as
`f3e15b53e0621c433295a0053c91231edaf2c493`, merged to main as
`e8b2bd73092758cc83ad25a4ed2ca95b7b239cb9` and manually deployed in Pages
deployment `226d65cc-5be9-4c5e-ba30-93af250b34df`.

The remediation preserves ordered product delivery while reducing the first
page from four to three cards with pagination, adds non-blocking fail-fast
typing feedback for text updates, and removes callback acknowledgement from
the Runtime critical path while keeping it Worker-tracked. One post-fix owner
Telegram request remains before the sprint canary is marked complete.

## Scope and safety boundary

This began as the evidence-first audit for the R1.1 product-quality sprint. The
canonical repository is `F:\Claude\gptbot-repo-clean-20260729-1140`.
Recovery repositories were not read or changed. No production mutation,
deployment, credential change, scheduler activation, Railway reconnect, real
store onboarding, payment flow or publication action was performed during
the initial audit checkpoint. Later authorized release actions are recorded
above and below.

The preflight WIP snapshot is stored outside Git at
`F:\Claude\gptbot-r1.1-wip-backups\20260731-062715`. The canonical worktree was
clean, local `main` equalled `origin/main`, there were no untracked files, and
no generated `_worker.bundle` existed.

## Verified current state

- Cloudflare Pages production serves source `ca99026`; `https://gptbot.uz/`
  returns 200.
- `/api/telegram/agents` is POST-only: GET returns 405 and an unauthenticated
  POST returns 401.
- All D1 migrations through `0025_owner_control_center_audit.sql` are applied.
- Production has one active synthetic store and 12 published synthetic
  products. There are no orders, handoffs, notification intents or automation
  jobs.
- Seven Telegram updates are terminal `completed`; no failed or reserved
  updates remain.
- The Telegram identity is exactly `@gptbot_market_bot`. Its webhook is the
  isolated Agents endpoint, has zero pending updates, no current provider
  error, and accepts only `message` and `callback_query`.
- Bot metadata is present in RU and Uzbek Latin, but the command menu contains
  only `/start`.
- The GitHub SEO scheduler is `disabled_manually`.
- The first-party Cloudflare Queue, DLQ, consumer and 15-minute Worker cron
  exist. The job ledger and DLQ-related domain state are empty.
- The latest Railway-created GitHub deployment remains the 2026-07-29
  deployment for `c20ccf75`; later pushes did not create a Railway deployment.
- The baseline TypeScript build passes. The full test harness passes
  931/931.

## Current buyer journey

1. `/start` binds the direct synthetic pilot and sends one short disclosure
   with one `Открыть каталог` button.
2. Catalog opens five cards per batch.
3. A non-exact result exposes only `Подробнее`.
4. An exact/full card exposes `Оформить` and `Назад к каталогу`.
5. Free text supports a small deterministic RU/UZ phrase set and exact catalog
   grounding.
6. An “affordable” phrase asks for a maximum budget; a bare spaced integer is
   accepted.
7. Checkout collects quantity, name, phone and address, then confirms a
   single-product order without payment.
8. Seller order, stock, handoff and statistics tools exist, but are presented
   as a technical owner menu rather than one coherent product navigation
   system.

## Defect inventory

### P0

No exploitable P0 was found in the audited path. Webhook authentication,
deduplication, trusted tenant resolution, strict grounding, single-product
checkout idempotency, inventory transition barriers, handoff ownership and
support-readonly mutation denial are covered by passing tests.

### P1 — release blockers

1. `/start` is not a complete product home. It lacks product search, orders,
   seller and language entry points.
2. `/catalog`, `/orders`, `/help` and `/language` are not recognized as
   commands and are absent from BotFather metadata.
3. Buyer navigation has dead ends and inconsistent back paths. The only global
   back action reopens the product list.
4. Catalog batches contain five cards, exceeding the R1.1 maximum of four.
5. Product cards lack compare, seller, similar-product and consistent order
   actions.
6. There is no buyer category browser and no buyer order-history surface.
7. There is no product comparison state or verified field comparison.
8. Budget parsing misses `30k`, `30 к`, `30 ming`, `30 minggacha`,
   `до 30 тысяч`, `максимум 30000` and `бюджет 30 000`.
9. A bare integer is always interpreted as a budget, so model numbers,
   quantities, sizes, power, area and years can be misclassified.
10. Search ranking uses normalized product names and descriptions but has no
    structured synonym/specification contract or reason projection.
11. Checkout has no optional comment and does not explicitly distinguish a
    delivery request from a delivery promise.
12. The analytics catalogue covers only four funnel events; it cannot answer
    the closed R1.1 product funnel for compare, checkout, order and handoff.
13. There is no durable per-user/per-tenant rate-limit ledger for catalog,
    callback and order flows.

### P2 — quality and operability gaps

1. RU/UZ buyer copy is distributed across rules and response modules rather
   than one reviewed dictionary.
2. Product cards do not project a verified store name or safe media state.
3. No explicit stale-navigation response exists; unknown buyer callbacks fall
   back to generic help.
4. `/start` cold-path latency includes runtime schema bootstrapping and several
   sequential context lookups.
5. Runtime/provider failure copy is generic and offers no deterministic
   catalog recovery action.
6. Seller home exposes nine technical buttons without grouping or a buyer-home
   escape.
7. Handoff has bounded retention and safe close, but no buyer-visible
   reopen/timeout guidance in the main navigation.
8. The synthetic fixture is too small and lacks boundary products, structured
   specs, synonym coverage and media safety cases.
9. OCC has exact owner controls and read-only support authorization, but lacks
   one R1.1 product-quality snapshot combining funnel, queue, rate-limit and
   pilot readiness.

### P3 — polish

1. Button labels and terminology are inconsistent across RU and Uzbek Latin.
2. Cards do not include a short grounded “why this matches” explanation.
3. The start disclosure is canary-correct but sounds technical.
4. The bot has no prepared avatar package; this is non-blocking and remains a
   manual owner action.

## Implementation order

1. Central copy, commands, home/navigation and safe callback recovery.
2. Budget and intent normalization with ambiguity confirmation.
3. Four-card catalog, categories, grounded ranking, richer cards and compare.
4. Checkout comment/delivery wording and buyer order history.
5. Seller/handoff navigation and notification polish.
6. Closed product analytics, rate limits, OCC readiness and provider fallback.
7. 30–50 item synthetic fixture, metadata package, full review and release
   gates.

Every slice must retain the current security invariants: trusted org/store
scope, exact-product revalidation, scalar Facts grounding, content-free
analytics, idempotent writes, safe provider errors and zero secret output.

## Implementation checkpoint: buyer product foundation

The first implementation checkpoint closes the entry/navigation, budget
normalization and buyer order-history blockers without changing the production
deployment:

- `/start` now produces one localized home message with search, catalog,
  buyer-order, seller-handoff and language routes.
- `/catalog`, `/orders`, `/help` and `/language` normalize to bounded,
  provider-neutral actions; unknown slash commands recover to help.
- RU and Uzbek Latin buyer navigation/recovery copy is centralized.
- The buyer locale is persisted in the trusted storefront session and can be
  changed only for the already resolved bot, identity, organization and store.
- Budget parsing accepts the approved integer UZS variants. A context-free
  number requires confirmation; model numbers and quantities remain searches.
- The one-turn budget expectation is store-scoped, expires after ten minutes,
  and is cleared by `/start`, navigation or another catalog operation.
- `/orders` projects at most five placed orders for the current buyer session.
  Its Facts contain no name, phone or address, and strict grounding covers
  every displayed number and card value.
- `0026_market_buyer_experience.sql` is additive and stores only locale and
  bounded interaction state; it contains no buyer content.
- The Telegram metadata setup now declares exactly the five implemented
  commands in RU and Uzbek Latin. It remains dry-run by default.

Focused security review confirmed that callback payloads contain no tenant
authority, history queries require the trusted buyer session plus org/store,
locale writes revalidate active route and pilot state, and pending intent
updates cannot widen tenant scope.

Evidence at this checkpoint:

- buyer/checkout/webhook targeted corpus: `123/123 PASS`;
- TypeScript project build: `PASS`;
- expanded Sotuvchi, Owner Center and release regression after pending-state
  hardening: `411/411 PASS`;
- secret scan: `2651 files checked`, clean;
- `git diff --check`: `PASS`.

Production migration, Telegram metadata mutation and deployment remain
intentionally deferred until all R1.1 slices, full gates and independent
main-to-feature review pass.

## Implementation checkpoint: grounded catalog and search

The catalog-quality slice adds a deterministic, database-grounded catalog
experience without introducing an AI write path:

- catalog and search pages render at most four product cards;
- active categories are visible only when they contain a published product,
  with an all-products fallback and bounded pagination;
- product aliases and verified bilingual specification labels are validated
  as closed, bounded JSON structures;
- search ranks exact names, exact aliases, prefixes, categories, all-token and
  partial-token matches, then availability and freshness;
- every internal ranked result carries confidence, matched/unmatched
  constraints, reason codes and source product/store IDs;
- cards project the verified store name and at most four verified
  specifications through scalar Facts;
- similar-product ranking excludes the source product, prefers the same
  category and available items, and never leaves the trusted storefront;
- the product ceiling is raised to 100 so the required 30–50 product
  synthetic fixture can be created, while a single buyer response remains
  capped at four cards and the search candidate scan at 200 rows;
- `0027_market_catalog_quality.sql` additively introduces only validated
  search aliases and specification JSON. Existing products receive empty
  arrays.

Security and grounding review confirmed that category and product callback
references are re-resolved under the current org/store session, archived or
unpublished rows remain excluded, response drafts stay within the 64-Fact,
five-message, eight-field and four-card-action platform bounds, and internal
ranking metadata is not rendered to the buyer.

Evidence at this checkpoint:

- catalog/search/checkout targeted corpus: `142/142 PASS`;
- expanded Sotuvchi, Telegram webhook, Owner Center and release regression:
  `416/416 PASS`;
- TypeScript project build: `PASS`;
- `git diff --check`: `PASS`.

List and search responses intentionally omit specifications from their Facts
projection; verified specifications remain available on the full product card.
This keeps the worst-case four-card page below the platform's 64-Fact ceiling
even when every product stores the maximum rendered specification set.

## Implementation checkpoint: product comparison

The comparison slice adds a bounded two-to-three-product buyer flow:

- every add, show and clear operation resolves the active buyer session from
  the bot username plus platform identity, then revalidates org, store, route,
  pilot, product publication and category state;
- callbacks carry only an opaque product reference and never tenant authority;
- duplicate selections are idempotent and a fourth valid product is rejected
  without changing the existing three;
- recently presented ranking context stores only product references, bounded
  scores, counts, reason codes and request keys. No query text, message,
  contact detail or other buyer content is persisted;
- comparison cards render verified price, availability, category, store and
  at most two verified specifications. Missing verified fields and unmatched
  requirement counts are explicit instead of inferred;
- cheaper and closer-to-request summaries are deterministic. If the verified
  facts do not establish one leader, the response states that there is no
  clear leader;
- an unavailable product remains visible in the comparison but cannot start
  checkout;
- the full three-product response stays within four Telegram messages, eight
  fields per card, four choices and 64 scalar Facts.

Focused security review covered duplicate add, maximum size, stale
unpublished products, a forged cross-tenant product reference, inactive
catalog eligibility and clear/show isolation. All fail closed without
rendering a foreign product.

Evidence at this checkpoint:

- buyer/catalog/checkout targeted corpus: `146/146 PASS`;
- expanded Sotuvchi, Telegram webhook, Owner Center and release regression:
  `420/420 PASS`;
- TypeScript project build: `PASS`;
- scoped ESLint over all comparison-slice TypeScript and tests: `PASS`;
- secret scan: `2658 files checked`, clean;
- `git diff --check`: `PASS`.

`0028_market_product_comparison.sql` is create-only and additive. Production
migration and deployment remain deferred until the remaining R1.1 slices and
release gates pass.

## Implementation checkpoint: buyer orders and seller response

The order-quality slice completes the single-product buyer flow and the
seller's first-response surface:

- checkout now collects quantity, bounded contact data, a clearly labelled
  delivery/pickup request and an optional bounded comment;
- the final review shows the current catalog product, integer UZS unit price
  and total, store, availability, masked phone and comment presence;
- final placement revalidates the active store, pilot, published product,
  category, price and any configured inventory balance inside the guarded
  write;
- a configured balance below the requested quantity cancels the draft before
  placement, creates no seller notification and never changes inventory;
- placement remains idempotent and writes exactly one content-free seller
  notification intent. Inventory is decremented only by the seller's atomic
  confirmation and at most once;
- completed checkout offers buyer orders, verified seller contact and home;
  the out-of-stock recovery offers similar products, seller contact and home;
- buyer history shows at most five tenant-scoped orders with order number,
  product, quantity, total, store, status and UTC placement time, without
  buyer name, phone or address;
- seller list projections remain contact-free. Authorized detail and
  notification rendering rebuild contact/comment data from the trusted order
  at read time;
- the seller notification offers confirm, no-stock, contact, handoff and view
  actions. Every order action is re-resolved through the authenticated store
  owner and never trusts tenant authority from a callback;
- `0029_market_checkout_comment.sql` additively stores the optional comment
  only on the tenant-scoped order aggregate.

Focused security review confirmed that comment text is absent from workflow
payloads, operation fingerprints, notification rows and analytics; outbox
rows remain payload-free; configured-stock failures are idempotent; seller
contacts never enter list projections; and every inventory movement remains
store-scoped, unique and atomic.

Evidence at this checkpoint:

- buyer checkout and seller order/inventory targeted corpus: `80/80 PASS`;
- expanded Sotuvchi, Telegram webhook, Owner Center and release regression:
  `425/425 PASS`;
- TypeScript project build: `PASS`;
- scoped ESLint over checkout, orders and their tests: `PASS`;
- secret scan: `2659 files checked`, clean;
- `git diff --check`: `PASS`.

Production migration and deployment remain intentionally deferred until
analytics, reliability, fixture, metadata, governance, full gates and the
independent main-to-feature review all pass.

## Implementation checkpoint: privacy-safe product analytics

The analytics slice replaces the narrow technical-canary counters with the
closed R1.1 product funnel while keeping operational tables as the exact source
of truth:

- the event catalogue now covers bot and language entry, catalog/category
  discovery, clarification and budget parsing, result and zero-result
  outcomes, product views, comparison, order start/create/duplicate blocking,
  handoff and seller activity, order status changes, Telegram failures and
  owner report views;
- every durable payload is projected through one closed scalar allowlist.
  Unknown runtime properties are discarded, identifiers are validated, and
  counts, price/latency buckets and server-selected reason codes are bounded;
- buyer messages, seller replies, names, usernames, phones, addresses, chat
  references, credentials, headers and stack traces cannot enter an event;
- domain events are emitted only after the corresponding domain operation
  succeeds. Analytics failures are swallowed after the operation and never
  cause a business action, order or notification to run twice;
- delivery events are recorded only after an actual seller notification is
  accepted by Telegram;
- order creation and seller response events are derived from trusted workflow
  Facts, not from callback authority or user-provided text;
- the owner-only daily report separates best-effort funnel counts from exact
  catalog, order, delivery and handoff totals.

Focused security review covered a deliberately untyped payload carrying buyer
text and contact fields, invalid identifiers and buckets, duplicate update
replay, org isolation, analytics storage failure, owner authorization and
cross-identity report access. Unsafe properties are ignored or the event is
skipped; no raw content reaches the database.

Evidence at this checkpoint:

- buyer, checkout, handoff, seller and analytics targeted corpus:
  `204/204 PASS`;
- TypeScript project build: `PASS`;
- scoped ESLint over all analytics-slice TypeScript and tests: `PASS`;
- secret scan: `2660 files checked`, clean;
- `git diff --check`: `PASS`.

Production deployment remains deferred. Telegram failure telemetry, Owner
Control Center operational projections, rate limiting and retry/fallback
hardening belong to the next reliability slice.

## Implementation checkpoint: Owner Control Center product visibility

The existing first-party Owner Control Center now exposes the Market product
and service health needed for a controlled pilot:

- the overview shows today's bot starts, searches, result/zero-result counts,
  product views, order starts/creates and handoff requests from the closed
  analytics event list;
- Telegram transport health shows accepted, completed, failed, pending and
  duplicate updates, bounded processing latency and error totals;
- seller service health shows responses, a response-time bucket, open handoffs
  older than 15 minutes and notification failures/retries;
- the non-secret bot identity projection contains only the validated public
  username, fixed webhook path and a `ready|incomplete` configuration state;
- store list and detail projections add configured in-stock counts, catalog
  freshness, verified active-owner status, handoff SLA and last activity;
- queue/retry/DLQ, pilot state, orders, handoffs, automation and audit remain on
  their existing first-party surfaces.

All views remain available to `support_readonly`, while every mutation still
requires the platform-owner role, reason, idempotency key and any applicable
typed confirmation. SQL projections deliberately omit event payloads,
aggregate references, Telegram identifiers, messages, profiles, buyer contact
fields and handoff text. Optional telemetry tables fail to a visible zero or
`unknown` state without hiding exact domain totals.

Evidence at this checkpoint:

- Owner Control Center behavioural corpus: `71/71 PASS`;
- TypeScript project build: `PASS`;
- scoped ESLint over server projections, shared contracts, UI and tests:
  `PASS`;
- secret scan: `2660 files checked`, clean;
- `git diff --check`: `PASS`.

The duplicate and processing-latency fields are wired but remain zero/unknown
on an older schema. The next additive reliability migration will populate
them without changing the existing update idempotency key.

## Implementation checkpoint: Telegram reliability and provider fallback

The reliability slice hardens the accepted-update path without widening any
Telegram or tenant authority:

- `0030_market_telegram_reliability.sql` adds repeatable, create-only tables
  for update latency/duplicate counters and fixed-window rate limiting; the
  existing update idempotency ledger and business tables are unchanged;
- update metrics contain only the existing idempotency key, public bot
  namespace, bounded counters, latency and timestamps;
- rate-limit rows contain only SHA-256 scope keys, minute windows and bounded
  counters. Raw Telegram user/chat identifiers, org identifiers, messages,
  callbacks, profiles, IPs and credentials are never persisted;
- per-user, private-chat, bot, tenant and callback limits run after durable
  update reservation and before Runtime. A denied update remains terminal, so
  replay cannot bypass the limit or execute an order later;
- the localized rate-limit reply is sent at most once per scope/window;
  subsequent denied updates are silently finalized to avoid turning abuse
  protection into outbound amplification;
- buyer text is bounded to 2,000 UTF-16 code units, control characters are
  rejected, the webhook body remains capped at 64 KiB and callback actions
  remain on their closed 48-character grammar;
- Telegram calls use a bounded whole-response timeout and at most three
  retries. `retry_after`, 5xx and network backoff are capped; 403 is terminal;
  structured logs contain only method, status/reason, attempt and delay;
- tenant-known Runtime, rate-store and delivery failures emit the closed
  `sotuvchi.telegram_error` event with only a reason and latency bucket.

Sotuvchi keeps `aiSelection: disabled`: catalog/category/budget/exact-prefix
search, popular fallback, product details, comparison, ordering, buyer
history, seller actions and handoff are deterministic first-party paths.
Therefore an absent or failing LLM provider cannot remove those functions or
replace them with the generic failure copy.

Focused tests cover duplicate metrics, migration reapply, raw-identifier
absence, user/chat/bot/tenant/callback limits, window reset, one-notice
suppression, limiter storage failure, 2,000/2,001-character boundaries,
control characters, malformed/media input, 429 `retry_after`, 5xx/network
delay policy, bounded timeout, blocked/deleted-chat 403, safe telemetry and
the existing RU/UZ buyer/order/seller/handoff flows without an AI provider.

Evidence at this checkpoint:

- reliability plus expanded Market/Owner targeted corpus: `327/327 PASS`;
- TypeScript project build: `PASS`;
- scoped ESLint over transport, wiring, Owner projection, pilot check and
  tests: `PASS`;
- migration `0030` clean bootstrap and repeated apply: `PASS`;
- secret scan: `2660 files checked`, clean;
- `git diff --check`: `PASS`.

No production migration, configuration change, webhook mutation, push or
deployment was performed.

## Implementation checkpoint: synthetic storefront and Telegram metadata

The pilot fixture is now a versioned, locally validated product-quality asset:

- `r1_1_synthetic_catalog.json` contains 36 clearly synthetic products across
  six bilingual categories, with no real brand or customer data;
- all products carry the same explicit RU/UZ synthetic-test disclosure;
- coverage includes available, unavailable, preorder, low-stock and zero-stock
  states; products with and without safe opaque media references; complete and
  intentionally incomplete optional specifications; Russian titles and Uzbek
  Latin search aliases;
- exact price-boundary products cover 29,999 / 30,000 / 30,001 / 50,000 /
  200,000 / 1,000,000 UZS;
- the validator rejects unknown fields, non-synthetic disclosure, fewer than
  30 or more than 50 products, incomplete category coverage, invalid stock
  combinations, duplicate keys/SKUs and missing boundary scenarios.

`market-synthetic-fixture.ts` is read-only by default. SQL generation requires
an exact organization, store and typed store confirmation. Its output uses
only `INSERT OR IGNORE` writes guarded by the existing target store; it has no
update, delete, replace, archive, schema or remote-apply path. An integration
rehearsal applies all migrations 0013 through 0030, applies the fixture twice,
and verifies stable counts, tenant grounding, Uzbek alias search, price
boundaries and zero order/notification side effects.

Telegram product metadata is now a closed code-owned contract:

- the only advertised commands are `/start`, `/catalog`, `/orders`, `/help`
  and `/language`, and every command maps to an implemented deterministic
  buyer action;
- default/Russian and Uzbek Latin command descriptions, full descriptions and
  short descriptions explicitly identify the bot as a synthetic test store
  without promising payment or delivery;
- metadata setup is dry-run by default, verifies `getMe`, the exact expected
  username and protected-bot isolation before mutation, and requires
  `--apply`;
- full webhook setup still validates the webhook secret before the first
  mutation. Metadata operations are bounded and repeatable; no token or secret
  value is printed.

Evidence at this checkpoint:

- fixture, metadata and release-preparation corpus: `29/29 PASS`;
- fixture clean bootstrap, double-apply and cross-store guard: `PASS`;
- TypeScript project build: `PASS`;
- scoped ESLint over the slice and tests: `PASS`;
- secret scan: `2662 files checked`, clean;
- `git diff --check`: `PASS`.

No production SQL, Bot API mutation, configuration change, push or deployment
was performed.

## Implementation checkpoint: migration and release governance

The release migration manifest now covers the full ordered range 0013–0030
with normalized SHA-256 values, dependencies, declared tables/indexes,
reversibility, PII classification and owner for every entry. The isolated
rehearsal proves both a clean 18-migration bootstrap and the actual production
upgrade shape: baseline through 0025, then R1.1 migrations 0026–0030. It also
verifies checksums, declared objects, foreign keys, CHECK constraints,
rollback on failure, duplicate ledger behavior and application schema
compatibility.

`R1_1_MARKET_PILOT_RUNBOOK.md` is now the current execution authority. It
defines exact source/review gates, read-only production preflight, external
backup, one-at-a-time migration checks, guarded fixture import, exact-SHA
manual Pages deployment, RU/UZ Telegram metadata, product canaries, stop
conditions, rollback and closeout evidence. Historical P2.7 and real-store R1
runbooks now point to it and do not authorize R1.1 execution.

The fixture renderer deliberately omits explicit `BEGIN/COMMIT`: Cloudflare D1
file import manages statement execution and can reject a dump that opens its
own transaction. Safe recovery remains deterministic because every fixture
write is store-guarded `INSERT OR IGNORE`, all fixture identifiers are stable,
and repeated apply is tested to converge without order or notification side
effects.

Evidence at this checkpoint:

- migration rehearsal: all ten checks `PASS`;
- fixture/release-preparation corpus: `25/25 PASS`;
- TypeScript project build: `PASS`;
- scoped ESLint: `PASS`;
- secret scan: `2667 files checked`, clean;
- `git diff --check`: `PASS`.

No remote D1 query/write, migration, Bot API mutation, push or deployment was
performed.

## Pre-release checkpoint: integrated gates and security review

The feature branch was fetched and integrated with current `origin/main`
before final review. Two already-merged Search Pulse commits were preserved;
their ten TypeScript/TSX files and dedicated suite were reviewed separately.
They add an authenticated, version-aware submission path for already-published
URLs and do not create or publish content. They do not change the Market
tenant, order, Telegram or automation boundaries.

The R1.1 review covered all changed runtime, migration, fixture, projection and
release files. Two defense-in-depth findings were fixed before approval:

1. the isolated Agents webhook secret used an ordinary string comparison; it
   now uses a fixed-expected-length comparison without an early content exit;
2. rate-limit scope keys used unkeyed SHA-256 over low-entropy identifiers;
   they now use HMAC-SHA-256 with the isolated webhook secret as a server-only
   pepper. Missing/weak keys fail closed and raw identifiers remain absent.

The review also verified:

- webhook method, secret, body-size, update grammar, reservation and terminal
  replay behavior;
- user/chat/bot/tenant/callback limits, one-notice suppression, retry ceilings
  and content-free logs/telemetry;
- tenant/store authority for catalog, comparison, checkout, history, seller
  status and handoff;
- one logical order, one notification and one stock decrement per trusted
  operation;
- scalar analytics projection, PII-free OCC aggregates and owner/support role
  boundaries;
- deterministic provider-independent buyer paths and strict Facts grounding;
- ordered additive migrations, append-only fixture SQL and exact target
  guards;
- exact bot identity checks, dry-run defaults and RU/UZ metadata restricted to
  implemented commands.

Integrated gate evidence:

- complete repository corpus in four bounded batches: `979/979 PASS` across
  39 suites;
- changed Market TypeScript/TSX: 84 files, ESLint `PASS`;
- inherited Search Pulse TypeScript/TSX: 10 files, ESLint `PASS`;
- app TypeScript build and Functions TypeScript build: `PASS`;
- agent boundary checker: zero violations;
- production root build: `PASS` with zero critical SEO findings, 113 pages,
  112 articles and 228 sitemap entries;
- backend typecheck/build and Pages Functions compile: `PASS`;
- Yarn production audit: 0 vulnerabilities across 115 packages;
- backend npm production audit: 0 vulnerabilities;
- secret scan: `2676 files checked`, clean;
- `git diff --check` and `git fsck --full`: `PASS` (two harmless dangling
  objects only).

Repository-wide ESLint remains a documented legacy debt and is not the scoped
release gate: it reports 62 errors and 12 warnings in old backend, SEO/admin
and animate-ui files outside this sprint. No R1.1 or inherited Search Pulse
file contributes an error.

Review verdict: source is ready for exact-SHA merge/retest and read-only
production preflight. No remote D1 query/write, Bot API mutation, push or
deployment had occurred at this checkpoint.

## Final exact-SHA release evidence

- Feature branch:
  `origin/fix/r1.1-telegram-latency` at `f3e15b53e0621c433295a0053c91231edaf2c493`.
- Main merge/deployed source:
  `e8b2bd73092758cc83ad25a4ed2ca95b7b239cb9`.
- Production deployment:
  `226d65cc-5be9-4c5e-ba30-93af250b34df`,
  `https://226d65cc.ai-direct-pro-landing.pages.dev`.
- Full repository: `981/981 PASS` across 35 suites.
- Targeted latency/buyer: `103/103 PASS`.
- Market/commerce/reliability: `351/351 PASS`.
- Root/Functions TypeScript, scoped ESLint, agent boundaries, root build,
  backend typecheck/build and Pages Functions compile: `PASS`.
- Root/backend production dependency audits: `0/0`.
- Secret scan: clean over 2,676 files.
- Root build: 113 pages, 112 articles and 228 sitemap entries.
- Telegram status: expected webhook URL, zero pending updates, no last error.
- HTTP: root/RU/UZ/immutable deployment 200, webhook GET 405, unauthorized
  POST 401.
- Post-deploy domain state: zero orders, handoffs, seller notifications,
  automation jobs and dead-letter jobs.
- Cloudflare automatic deployment did not run; Railway did not deploy.
- No migration or D1 mutation was needed for the latency fix.

Release verdict: application and infrastructure gates pass. R1.1 remains
`released_pending_post_fix_owner_latency_canary` until one owner interaction
produces a new production latency observation.
