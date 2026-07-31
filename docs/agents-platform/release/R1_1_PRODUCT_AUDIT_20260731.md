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
