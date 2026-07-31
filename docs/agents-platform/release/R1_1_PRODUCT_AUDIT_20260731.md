# GPTBot Market R1.1 product audit

Date: 2026-07-31  
Branch: `feature/r1.1-market-product-polish`  
Audited production SHA: `ca990266ab67c6dbdf79b325dc59747795f3d0d3`

## Scope and safety boundary

This is the evidence-first audit for the R1.1 product-quality sprint. The
canonical repository is `F:\Claude\gptbot-repo-clean-20260729-1140`.
Recovery repositories were not read or changed. No production mutation,
deployment, credential change, scheduler activation, Railway reconnect, real
store onboarding, payment flow or publication action was performed during
this audit.

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
