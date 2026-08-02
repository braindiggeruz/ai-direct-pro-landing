# GPTBot Market Mini App master roadmap

Status: MA-0 through MA-8 implemented and verified as a local synthetic
candidate on 2026-08-02. MA-9 and MA-10 are not started and remain gated by
owner/provider inputs and explicit public-cutover approval.

## Effort model and sequence

Effort is one cross-functional squad estimate after dependencies are available:
`XS <2 days`, `S 2–5 days`, `M 1–2 weeks`, `L 2–4 weeks`, `XL 4–7 weeks`.
It is not a commercial quote. Owner/provider waits and evidence soak are
separate.

| Phase | Outcome | Indicative effort | Critical dependency |
| --- | --- | ---: | --- |
| MA-0 | live reconciliation and architecture freeze | S | owner accepts proposed boundaries |
| MA-1 | auth, shared application composition and BFF contracts | XL | MA-0 |
| MA-2 | isolated Mini App foundation/staging | L | auth/API contract frozen |
| MA-3 | buyer read-only discovery | L | MA-1/MA-2 |
| MA-4 | buyer transactions and recovery | XL | MA-3 parity |
| MA-5 | seller read-only workspace | L | MA-1/MA-2; parallel with late MA-3/MA-4 |
| MA-6 | controlled seller mutations | XL | MA-4 idempotency + MA-5 authority |
| MA-7 | visual/accessibility/performance productization | L | stable screen/contracts |
| MA-8 | closed synthetic canary and rollback proof | M + proposed 7-day soak | MA-1–MA-7 |
| MA-9 | authorized Store Pilot #1 cohort | L + live evidence window | all owner gates |
| MA-10 | primary UI and selective callback reduction | M + proposed ≥4-week parity evidence | MA-9 |

With parallel design, localization, tests and seller reads, the engineering
critical path is approximately 18–26 calendar weeks plus owner waits and live
evidence windows. A single sequential contributor would likely require 28–40
engineering weeks. Re-estimate after MA-1 contracts and MA-3 media proof.

## MA-0 — Live reconciliation and architecture freeze

### MA-0.1 — Record immutable baseline and invariants

- **ID / phase / priority:** MA-0.1 / MA-0 / P0.
- **Title:** Reconcile source, production, rollback, schema and existing Mini App work.
- **Problem:** implementation is unsafe if planning uses stale audit facts.
- **Current implementation:** HEAD/origin `2d78967`; production/rollback recorded; no Mini App code/branch; physical schema through 0030, ledger through 0025.
- **Files/modules affected:** planning evidence only; future `STATE.json`, `HANDOFF.md` update under separate implementation task.
- **Backend capability reused:** current Git/release/schema contract evidence.
- **New component/API needed:** none.
- **User impact:** none.
- **Security impact:** prevents unknown code/secret/schema drift.
- **Data impact:** read-only inspection; no mutation.
- **Migration requirement:** none; explicitly prohibit blind apply.
- **Analytics:** none.
- **Tests:** Git clean/ahead-behind/fsck/diff; secret and physical-schema read checks.
- **Visual evidence:** n/a; release/deployment IDs are evidence.
- **Dependencies:** none.
- **Owner input:** identify missing master handoff if available; accept current production/rollback record.
- **Telegram/BotFather action:** none.
- **Deployment needed:** no.
- **Effort:** S.
- **Risk:** medium.
- **Rollback:** documentation revert only.
- **Acceptance criteria:** baseline is current, contradictions resolved or labelled, no hard stop open.
- **Definition of done:** evidence packet names source, prod, rollback, schema and missing source.
- **Parallel:** no; first critical-path item.

### MA-0.2 — Approve architecture and security ADR set

- **ID / phase / priority:** MA-0.2 / MA-0 / P0.
- **Title:** Freeze Mini App presentation/BFF/coexistence boundaries.
- **Problem:** frontend placement, auth and rollout choices affect every task.
- **Current implementation:** proposed ADRs only; no approved Mini App decision record.
- **Files/modules affected:** proposed ADR package; later canonical `DECISIONS.md` link.
- **Backend capability reused:** all existing domain services and bot fallback.
- **New component/API needed:** approved decision set, not code.
- **User impact:** establishes reversible product direction.
- **Security impact:** codifies server authority, exact CORS and no secrets/client D1.
- **Data impact:** defaults to no migration.
- **Migration requirement:** none.
- **Analytics:** approve privacy model/denominators.
- **Tests:** architecture threat review and dependency/build impact review.
- **Visual evidence:** approved IA and state/component inventory.
- **Dependencies:** MA-0.1.
- **Owner input:** approve/revise ADR-001…018, hostname intent and Owner Control Center separation.
- **Telegram/BotFather action:** none.
- **Deployment needed:** no.
- **Effort:** S.
- **Risk:** high if skipped.
- **Rollback:** reopen ADR before implementation; no production effect.
- **Acceptance criteria:** no unresolved critical boundary; dissent/gaps recorded.
- **Definition of done:** ADRs moved from proposed to accepted/rejected in a future authorized decision task.
- **Parallel:** reviews may run in parallel; approval is critical path.

## MA-1 — Transport-neutral application layer

### MA-1.1 — Implement and prove launch authentication/session contract

- **ID / phase / priority:** MA-1.1 / MA-1 / P0.
- **Title:** Strict `initData` validator and short-lived session exchange.
- **Problem:** current backend has Telegram webhook auth, not Mini App auth.
- **Current implementation:** identity service exists; no `initData`/session endpoint.
- **Files/modules affected:** future `functions/platform/mini-app-auth/*`, `_types.ts`, `/api/market/v1/session/*`, tests.
- **Backend capability reused:** `IdentityService`; server crypto/Jose stack.
- **New component/API needed:** validator, session signer/verifier, exchange/refresh/logout contracts.
- **User impact:** trustworthy seamless launch and truthful unsupported-browser state.
- **Security impact:** critical authentication boundary; dedicated secret, no logs/persistence.
- **Data impact:** may create normal Telegram identity; no auth table.
- **Migration requirement:** none; durable nonce only via separate ADR if gate requires.
- **Analytics:** closed auth success/failure reason/latency events after privacy review.
- **Tests:** official/current vectors, forged/expired/future/replay/foreign bot, bundle/log secret scan.
- **Visual evidence:** launch, auth failure, unsupported environment states at key widths/themes.
- **Dependencies:** MA-0.2.
- **Owner input:** staging/test bot identity and secret installation path for real-client stage.
- **Telegram/BotFather action:** no production action; test bot later under O-02.
- **Deployment needed:** local/staging only; production flag remains off.
- **Effort:** M.
- **Risk:** critical.
- **Rollback:** disable exchange route/global app flag; bot unaffected.
- **Acceptance criteria:** no invalid launch accepted; session contains no authority/PII and expires as specified.
- **Definition of done:** unit/contract/security suite and threat review pass with zero P0/P1.
- **Parallel:** can run with MA-1.2 after interface agreement.

### MA-1.2 — Extract shared application composition and access context

- **ID / phase / priority:** MA-1.2 / MA-1 / P0.
- **Title:** Move Sotuvchi wiring out of Telegram endpoint without changing domain behavior.
- **Problem:** service composition is embedded in `api/telegram/agents.ts`.
- **Current implementation:** services are modular, but construction/context/analytics/flush wiring is Telegram-entry-local.
- **Files/modules affected:** `functions/api/telegram/agents.ts`, new shared application/composition modules; no domain/store rewrite.
- **Backend capability reused:** catalog, buyer, checkout, orders, handoff, stats, analytics, workflow, dispatcher.
- **New component/API needed:** shared service factory and server-derived buyer/seller access resolver.
- **User impact:** none until BFF; preserves one truth.
- **Security impact:** context builder must never accept client org/store/role.
- **Data impact:** unchanged queries/writes.
- **Migration requirement:** none.
- **Analytics:** unchanged recorder; no duplicate wrapping.
- **Tests:** full existing bot/domain baseline; factory parity and tenant context tests.
- **Visual evidence:** n/a.
- **Dependencies:** MA-0.2; auth context interface coordinates with MA-1.1.
- **Owner input:** none.
- **Telegram/BotFather action:** none.
- **Deployment needed:** later exact-SHA BFF release; flags off.
- **Effort:** M.
- **Risk:** high.
- **Rollback:** revert composition extraction; current Telegram wiring restored.
- **Acceptance criteria:** Telegram tests/output unchanged; BFF can call factory without Telegram update/callback objects.
- **Definition of done:** one composition root, no duplicated service/business rule, full baseline green.
- **Parallel:** yes with auth and schema work, but merge order controlled.

### MA-1.3 — Build versioned BFF shell, schemas and security middleware

- **ID / phase / priority:** MA-1.3 / MA-1 / P0.
- **Title:** `/api/market/v1` closed contracts, exact CORS, rate/error/schema shell.
- **Problem:** no public buyer/seller API; current global CORS is wildcard.
- **Current implementation:** safe Owner HTTP shell and schema contract patterns exist.
- **Files/modules affected:** future `/functions/api/market/v1/**`, path middleware, shared contracts; `_middleware.ts` carefully refactored.
- **Backend capability reused:** owner error/request-id patterns, schema verifier pattern, domain validation/idempotency.
- **New component/API needed:** BFF handler wrapper, DTO validators, origin policy, API rate policy, kill/cohort gates.
- **User impact:** stable private API and recovery errors.
- **Security impact:** closes wildcard CORS/IDOR/error leakage; critical.
- **Data impact:** read-only shell; no D1 row leakage.
- **Migration requirement:** none.
- **Analytics:** request latency/error buckets only.
- **Tests:** evil/null origins, CSRF/content-type, XSS/error DTO, schema fail-closed, rate and API version contracts.
- **Visual evidence:** error/retry states consume each closed code.
- **Dependencies:** MA-1.1, MA-1.2 contract surfaces.
- **Owner input:** approve staging/production origins before enable.
- **Telegram/BotFather action:** none.
- **Deployment needed:** staging, then production with global flag off.
- **Effort:** L.
- **Risk:** critical.
- **Rollback:** global flag/route off; prior Pages deployment; bot endpoint unchanged.
- **Acceptance criteria:** exact CORS/CSP-compatible API, server scope only, all missing schema fails 503.
- **Definition of done:** contract/security suite, full platform regression and rollback target recorded.
- **Parallel:** DTO design and middleware can parallelize after shared conventions.

## MA-2 — Mini App foundation

### MA-2.1 — Create isolated frontend build and release pipeline

- **ID / phase / priority:** MA-2.1 / MA-2 / P0.
- **Title:** `apps/market-mini-app` with independent static Pages output.
- **Problem:** current Vite build couples landing, GPT Chat and admin; no app package.
- **Current implementation:** React 19/Vite/Router and market assets exist; no workspaces/SDK.
- **Files/modules affected:** future app directory/config/lockfile/CI; no landing entry import.
- **Backend capability reused:** API contracts only.
- **New component/API needed:** isolated build, typed env/runtime config, bundle report, immutable release metadata.
- **User impact:** faster, independently reversible app.
- **Security impact:** production mock excluded; output/source-map secret scan.
- **Data impact:** none.
- **Migration requirement:** none.
- **Analytics:** build/app version exposed as safe bucket.
- **Tests:** reproducible install/build, bundle budget, dependency audit, root build regression.
- **Visual evidence:** minimal shell at 320–430 px.
- **Dependencies:** MA-0.2, MA-1 API schema draft.
- **Owner input:** Pages project/hostname approval for staging; no production enable.
- **Telegram/BotFather action:** test environment only after O-02.
- **Deployment needed:** dedicated staging Pages project.
- **Effort:** M.
- **Risk:** medium.
- **Rollback:** delete/disable isolated deployment; root site untouched.
- **Acceptance criteria:** root and app builds are isolated/reproducible; initial bundle budget met.
- **Definition of done:** staging immutable URL, source SHA and rollback build recorded.
- **Parallel:** yes with MA-2.2/design work.

### MA-2.2 — Implement app shell, Telegram adapter and server-state layer

- **ID / phase / priority:** MA-2.2 / MA-2 / P0.
- **Title:** Authenticated Router shell with native Telegram integration and all global states.
- **Problem:** no safe area/theme/back/reload/query architecture exists.
- **Current implementation:** React Router available; official WebApp script not integrated.
- **Files/modules affected:** future app shell/routes/query/telegram/i18n/error/state modules.
- **Backend capability reused:** session/bootstrap contracts.
- **New component/API needed:** typed native adapter, TanStack Query, memory session, route/error boundaries, flags.
- **User impact:** coherent launch, navigation, theme, offline/recovery.
- **Security impact:** token memory-only; no raw HTML/local authority; CSP compliance.
- **Data impact:** ephemeral UI cache only.
- **Migration requirement:** none.
- **Analytics:** app/auth/home/technical buckets through closed client reporter.
- **Tests:** adapter lifecycle, BackButton, theme/safe area, reload, direct browser, retry/offline, token loss.
- **Visual evidence:** launch/auth/error/offline/light/dark/large-text matrix.
- **Dependencies:** MA-1.1/1.3 and MA-2.1.
- **Owner input:** approve navigation labels and test bot/hostname.
- **Telegram/BotFather action:** test bot Web App URL only under owner action.
- **Deployment needed:** staging.
- **Effort:** L.
- **Risk:** high.
- **Rollback:** frontend deployment rollback/global flag; bot link unchanged in production.
- **Acceptance criteria:** signed launch works on required clients; direct browser has no private access; state preserved as specified.
- **Definition of done:** platform, accessibility, CSP/CORS and bundle gates green.
- **Parallel:** component/i18n work parallel after shell contracts.

## MA-3 — Buyer read-only discovery

### MA-3.1 — Expose catalog/search/comparison/media read APIs

- **ID / phase / priority:** MA-3.1 / MA-3 / P0.
- **Title:** Privacy-minimized buyer queries over existing catalog truth.
- **Problem:** current buyer services are reached through Telegram Runtime/Facts.
- **Current implementation:** catalog/query/comparison are durable and tested; media is `file_id`.
- **Files/modules affected:** BFF catalog/comparison/media handlers, DTO presenters; shared query adapter.
- **Backend capability reused:** list/categories/search/detail/presentation/comparison/getFile.
- **New component/API needed:** cursor DTOs, query schema, opaque media proxy/fallback.
- **User impact:** visual discovery without changing transactions.
- **Security impact:** storefront scope, unpublished filtering, no bot token/media SSRF.
- **Data impact:** reads plus existing presentation/comparison records.
- **Migration requirement:** none.
- **Analytics:** reuse closed category/search/results/product/comparison events with surface extension.
- **Tests:** query parity, two-store/unpublished, raw-query privacy, cursor, media auth/MIME/size/token scan.
- **Visual evidence:** API fixture set for every loading/empty/error/stale state.
- **Dependencies:** MA-1.2/1.3.
- **Owner input:** approve media/freshness policy for real use later.
- **Telegram/BotFather action:** none.
- **Deployment needed:** BFF staging; production flag off/synthetic only later.
- **Effort:** L.
- **Risk:** high.
- **Rollback:** buyer-read flag off; current bot catalog/search remains.
- **Acceptance criteria:** zero fact/tenant drift; media failure never leaks token or blocks facts.
- **Definition of done:** contracts/integration/security tests and query plans recorded.
- **Parallel:** yes with MA-3.2 after fixture contracts stabilize.

### MA-3.2 — Build buyer home, discovery, detail and comparison UI

- **ID / phase / priority:** MA-3.2 / MA-3 / P0.
- **Title:** Warm Market Signals buyer read-only experience.
- **Problem:** current button/text cards cannot support visual scan/filter/compare.
- **Current implementation:** design tokens/assets and conversational rules exist; no app components.
- **Files/modules affected:** buyer routes/components/i18n/query presenters.
- **Backend capability reused:** MA-3.1 APIs and current locale/facts.
- **New component/API needed:** home, search/filter, category/results, product gallery, compare tray/table.
- **User impact:** first low-risk visual value; checkout remains bot.
- **Security impact:** no business mutations; escaped content and safe external links.
- **Data impact:** server compare/presentation only; no favorites/local truth.
- **Migration requirement:** none.
- **Analytics:** closed discovery funnel and bot fallback.
- **Tests:** UI/unit/E2E, widths/themes/RU/UZ/200%, stale/zero/media/offline, bot deep-link recovery.
- **Visual evidence:** approved screen matrix and real-client recordings.
- **Dependencies:** MA-2.2, MA-3.1.
- **Owner input:** approve IA, Warm Market Signals moodboard and native UZ copy.
- **Telegram/BotFather action:** synthetic test inline/direct launch only.
- **Deployment needed:** staging and closed synthetic read flag.
- **Effort:** L.
- **Risk:** medium.
- **Rollback:** frontend/read flag off; bot catalog canonical.
- **Acceptance criteria:** five discovery tasks pass without hidden actions/fact mismatch; budgets met.
- **Definition of done:** synthetic read cohort and fallback evidence green.
- **Parallel:** screens can parallelize with shared component ownership.

## MA-4 — Buyer transactions

### MA-4.1 — Add checkout command API and progressive request UI

- **ID / phase / priority:** MA-4.1 / MA-4 / P0.
- **Title:** Reuse durable checkout workflow through idempotent BFF commands.
- **Problem:** visual request flow is missing; moving rules client-side would risk duplicates/stale facts.
- **Current implementation:** durable checkout steps, one draft, price/stock recheck and seller intent exist.
- **Files/modules affected:** checkout BFF handlers/DTOs and buyer form/review/success routes.
- **Backend capability reused:** `getActive/start/submit*/confirm/cancelCheckout` unchanged.
- **New component/API needed:** explicit step commands, idempotency adapter, progressive form and conflict presenters.
- **User impact:** complete request visually; bot can resume same draft.
- **Security impact:** PII bounds/no logs, CSRF/origin, ownership, replay/OCC.
- **Data impact:** existing workflow/order/item/operation/notification tables.
- **Migration requirement:** none.
- **Analytics:** request started/completed and closed recovery outcomes.
- **Tests:** duplicate/lost response/two devices, PII DTO/log, price/stock race, one order/intent, offline.
- **Visual evidence:** every checkout step plus price/no-stock/error/reopen/success at target matrix.
- **Dependencies:** MA-3 exit, MA-1 command shell.
- **Owner input:** approve request-not-payment, contact/privacy and seller expectation copy.
- **Telegram/BotFather action:** none beyond synthetic launch.
- **Deployment needed:** command flag off then synthetic allowlist.
- **Effort:** XL.
- **Risk:** critical.
- **Rollback:** `buyer_commands=false`; bot resumes active draft/order truth.
- **Acceptance criteria:** exactly one placed order and seller intent under every retry/race; no contact leak.
- **Definition of done:** integration/security/device/fallback/rollback tests green.
- **Parallel:** UI/API/test streams parallel after command contract freeze.

### MA-4.2 — Add buyer orders, status and handoff UI

- **ID / phase / priority:** MA-4.2 / MA-4 / P1.
- **Title:** Durable order self-service and seller question recovery.
- **Problem:** buyers need visual status/history/human help after request.
- **Current implementation:** five-order summary and active handoff services exist; bot delivers alerts/replies.
- **Files/modules affected:** buyer order/handoff query presenters/APIs and routes.
- **Backend capability reused:** buyer session order queries, handoff request/status, Telegram delivery.
- **New component/API needed:** cursor history/detail timeline, bounded question form, reply state.
- **User impact:** fewer support loops and clear next actor.
- **Security impact:** buyer ownership, content TTL/XSS/no-store/no raw analytics.
- **Data impact:** existing orders/handoffs; query projection only.
- **Migration requirement:** none unless measured pagination index need.
- **Analytics:** order viewed, handoff/fallback/recovery buckets.
- **Tests:** order/handoff IDOR, expiry, reload, notification return, XSS/content bounds.
- **Visual evidence:** empty/list/detail/timeline/question/reply/expired states.
- **Dependencies:** MA-4.1 service/session patterns.
- **Owner input:** support expectation/retention wording.
- **Telegram/BotFather action:** none.
- **Deployment needed:** synthetic buyer command/read flags.
- **Effort:** L.
- **Risk:** high.
- **Rollback:** orders/handoff app flags off; bot alerts/status/human flow remain.
- **Acceptance criteria:** only own orders/content visible; bot reply and app status converge.
- **Definition of done:** E2E from placed request to seller reply/fallback.
- **Parallel:** can overlap late MA-4.1 and MA-5 reads.

## MA-5 — Seller read-only cockpit

### MA-5.1 — Prove seller session capability and lifecycle revocation

- **ID / phase / priority:** MA-5.1 / MA-5 / P0.
- **Title:** Server-derived seller bootstrap and route guards.
- **Problem:** shared app shell must not equate navigation with authority.
- **Current implementation:** owner resolver is strong; no Mini App capability contract.
- **Files/modules affected:** BFF bootstrap/access, seller route guards and verification states.
- **Backend capability reused:** identity, membership, owner store resolver, pilot/store lifecycle.
- **New component/API needed:** capability DTO and verification/paused/suspended presenters.
- **User impact:** verified owners see workspace; everyone else sees truthful process.
- **Security impact:** critical role/tenant/revocation boundary.
- **Data impact:** reads only.
- **Migration requirement:** none.
- **Analytics:** seller entry/dashboard outcome without identity.
- **Tests:** forged seller mode, two stores, revoke/pause/suspend between calls, cache flash prevention.
- **Visual evidence:** invitation/verification/paused/suspended/buyer-mode states.
- **Dependencies:** MA-1 auth/context, MA-2 shell.
- **Owner input:** define verification/support language; no self-upgrade.
- **Telegram/BotFather action:** optional test seller deep link only.
- **Deployment needed:** seller-read flag off then synthetic owner.
- **Effort:** M.
- **Risk:** critical.
- **Rollback:** seller-read flag off; bot seller dashboard remains.
- **Acceptance criteria:** zero seller data/control for non-owner or inactive lifecycle, including stale client.
- **Definition of done:** authorization matrix and real-client route evidence green.
- **Parallel:** yes with buyer discovery/transactions after MA-1.

### MA-5.2 — Build seller dashboard and read-only work queues

- **ID / phase / priority:** MA-5.2 / MA-5 / P1.
- **Title:** Today, orders, questions, products, inventory and stats reads.
- **Problem:** bot information is safe but vertically dense for operating work.
- **Current implementation:** exact stats, PII-free lists, authorized details and catalog/inventory queries exist.
- **Files/modules affected:** seller read APIs/DTOs and seller routes/components.
- **Backend capability reused:** stats, orders, handoffs, catalog, inventory.
- **New component/API needed:** cursor projections, exception-first dashboard, no-store detail views.
- **User impact:** sellers scan and prioritize work visually; actions still open bot.
- **Security impact:** contact only in authorized detail; content-free queues; lifecycle checks.
- **Data impact:** read only; existing stats view event.
- **Migration requirement:** none.
- **Analytics:** dashboard opened and safe queue/task intent buckets.
- **Tests:** exact counts, list/detail privacy, IDOR, stale/version, UZ/layout/accessibility.
- **Visual evidence:** dashboard/empty/aged/order/question/product/notification failure states.
- **Dependencies:** MA-5.1 and read DTO shell.
- **Owner input:** approve operational priority/aging and “today” wording.
- **Telegram/BotFather action:** seller test launch only.
- **Deployment needed:** synthetic owner read flag.
- **Effort:** L.
- **Risk:** high.
- **Rollback:** seller-read flag off; bot commands unchanged.
- **Acceptance criteria:** counts match D1, no PII in lists/logs, each item opens correct bot fallback.
- **Definition of done:** seller read canary and device evidence green.
- **Parallel:** dashboard/orders/questions/products components can parallelize.

## MA-6 — Seller controlled mutations

### MA-6.1 — Move order transitions behind per-command flags

- **ID / phase / priority:** MA-6.1 / MA-6 / P0.
- **Title:** Confirm/cancel/done through unchanged OrdersService.
- **Problem:** seller actions are high-value but can double stock/notifications if reimplemented.
- **Current implementation:** domain transitions, OCC, movement and intent invariants are tested.
- **Files/modules affected:** seller command BFF handlers and detail confirmations.
- **Backend capability reused:** `confirmOrder`, `cancelOrder`, `completeOrder` unchanged.
- **New component/API needed:** expected-version/idempotency adapters and conflict UI.
- **User impact:** fast visual order processing with bot fallback.
- **Security impact:** recheck owner/store/order; PII/no-store; exactly once.
- **Data impact:** existing orders, inventory moves, operations, notifications.
- **Migration requirement:** none.
- **Analytics:** closed task/transition/outcome only.
- **Tests:** two-device/repeated/different payload/network loss; one move/intent; revoke/pause mid-action.
- **Visual evidence:** pending/confirm/destructive/conflict/success/recovery states.
- **Dependencies:** MA-4 idempotency proof and MA-5 authority/detail.
- **Owner input:** approve action confirmation copy/service policy.
- **Telegram/BotFather action:** none.
- **Deployment needed:** each command separate synthetic flag.
- **Effort:** L.
- **Risk:** critical.
- **Rollback:** command flag off; bot performs same service action; reconcile by D1 truth.
- **Acceptance criteria:** invariants hold in all concurrency cases; no action after revoke/pause.
- **Definition of done:** command-specific rollback drills and full bot regression.
- **Parallel:** three endpoint/UI streams share one invariant harness.

### MA-6.2 — Add direct seller handoff reply command

- **ID / phase / priority:** MA-6.2 / MA-6 / P1.
- **Title:** Reply visually without duplicating bot next-message workflow rules.
- **Problem:** current seller reply starts a bot workflow then binds the next message.
- **Current implementation:** handoff ownership, TTL, workflow and settlement exist; input mapping is Telegram-specific.
- **Files/modules affected:** shared handoff application command, BFF handler, reply composer; bot adapter preserved.
- **Backend capability reused:** resolve seller/handoff, validation, workflow/settlement, buyer delivery intent.
- **New component/API needed:** transport-neutral direct reply command with version/idempotency.
- **User impact:** contextual seller response and buyer alert.
- **Security impact:** bounded content, no logs/analytics, store ownership/expiry.
- **Data impact:** existing handoff/workflow/outbox rows.
- **Migration requirement:** none.
- **Analytics:** task outcome only, no content.
- **Tests:** bot/direct parity, duplicate/two-device/expired/foreign handoff, XSS, one delivery.
- **Visual evidence:** compose/unsaved-close/pending/expired/conflict/answered.
- **Dependencies:** MA-5.2; MA-1.2 shared application boundary.
- **Owner input:** approve reply attribution/retention copy.
- **Telegram/BotFather action:** none.
- **Deployment needed:** seller-reply flag synthetic only first.
- **Effort:** M.
- **Risk:** high.
- **Rollback:** flag off; current bot reply workflow stays canonical.
- **Acceptance criteria:** same ownership/TTL/outcome as bot, one buyer delivery intent.
- **Definition of done:** cross-surface parity and rollback E2E pass.
- **Parallel:** yes with MA-6.1 after shared command pattern.

### MA-6.3 — Stage stock and catalog mutations by risk

- **ID / phase / priority:** MA-6.3 / MA-6 / P1/P2.
- **Title:** Absolute stock first; draft catalog edits later; publish last.
- **Problem:** attractive self-service can expand authority/quality risk prematurely.
- **Current implementation:** services support stock/category/product CRUD and transitions; media/browser workflow is immature.
- **Files/modules affected:** seller inventory/catalog APIs and editors, validation presenters.
- **Backend capability reused:** `setInventory`, catalog CRUD/publish/unpublish/version/idempotency.
- **New component/API needed:** expected-version stock editor; draft form; quality/media gate; separate flags.
- **User impact:** safer self-service in progressive sub-cohorts.
- **Security impact:** owner/product scope, OCC, no automatic publish, bounded media.
- **Data impact:** existing inventory/move/catalog operations; no new table.
- **Migration requirement:** none for current fields; import/R2 excluded pending ADR.
- **Analytics:** closed task/outcome/quality buckets only.
- **Tests:** stale overwrite, move uniqueness, invalid/partial product, accidental publish, cross-store/media.
- **Visual evidence:** stock conflict, form validation, draft/publish warning, rejected input/freshness.
- **Dependencies:** MA-6.1 stable; MA-7 media/quality design for product commands.
- **Owner input:** catalog quality, freshness, photo rights and publish policy.
- **Telegram/BotFather action:** none.
- **Deployment needed:** three independent flags; real use only after MA-9 authorization.
- **Effort:** XL.
- **Risk:** critical for stock/publish.
- **Rollback:** per-command flags; bot/owner-assisted catalog; unpublish only via authorized existing service.
- **Acceptance criteria:** stock exactly once; draft never auto-published; all validation/authority conflicts safe.
- **Definition of done:** each sub-capability separately passes canary/rollback; publish may remain deferred.
- **Parallel:** stock and draft editor can parallelize; publish waits.

## MA-7 — Visual productization

### MA-7.1 — Complete Warm Market Signals component/state system

- **ID / phase / priority:** MA-7.1 / MA-7 / P1.
- **Title:** Production component library for buyer and seller surfaces.
- **Problem:** functional screens without coherent states will still feel like a WebView/admin UI.
- **Current implementation:** semantic tokens/assets/spec exist; app components do not.
- **Files/modules affected:** Mini App tokens, components, Storybook/equivalent fixture gallery, i18n.
- **Backend capability reused:** factual DTO semantics.
- **New component/API needed:** shell/nav/header/search/chips/cards/gallery/compare/steps/timeline/badges/forms/skeletons.
- **User impact:** consistent, legible commerce and operational experience.
- **Security impact:** standard escaped components, safe links and confirmations reduce UI bypass/error.
- **Data impact:** none.
- **Migration requirement:** none.
- **Analytics:** none beyond screen/task mapping.
- **Tests:** component states, interaction/focus, RU/UZ expansion, dark/custom theme, reduced motion.
- **Visual evidence:** approved fixture gallery and all key-screen snapshots.
- **Dependencies:** MA-3–MA-6 stable semantics.
- **Owner input:** design approval and native UZ review.
- **Telegram/BotFather action:** no.
- **Deployment needed:** staging/frontend.
- **Effort:** L.
- **Risk:** medium.
- **Rollback:** previous frontend deployment; domain unaffected.
- **Acceptance criteria:** no ad-hoc tokens/components, one dominant action, all required states.
- **Definition of done:** design/accessibility review and visual baseline accepted.
- **Parallel:** buyer/seller components parallel under token governance.

### MA-7.2 — Accessibility, media and performance hardening

- **ID / phase / priority:** MA-7.2 / MA-7 / P0 before canary.
- **Title:** Meet device, WCAG, media and performance budgets.
- **Problem:** WebView/client differences and product images can invalidate a polished desktop review.
- **Current implementation:** website a11y/design evidence; no Mini App real-device proof.
- **Files/modules affected:** app build/media/layout/telemetry, BFF media/query tuning.
- **Backend capability reused:** media proxy, closed events, bounded queries.
- **New component/API needed:** responsive image handling, real-user performance marks, accessibility fixes.
- **User impact:** reliable low-end/large-text/theme use.
- **Security impact:** media/token/CSP hardening and no sensitive telemetry.
- **Data impact:** none unless an optional evidence-backed media/index ADR is approved.
- **Migration requirement:** none by default.
- **Analytics:** latency/error/crash buckets.
- **Tests:** real devices, widths, VoiceOver/TalkBack, 200%, slow/offline, bundle/API/image budgets.
- **Visual evidence:** complete light/dark/RU/UZ/state/device capture pack.
- **Dependencies:** MA-7.1 and functional routes.
- **Owner input:** accessibility acceptance, product photo approval.
- **Telegram/BotFather action:** test launch only.
- **Deployment needed:** staging.
- **Effort:** L.
- **Risk:** high.
- **Rollback:** frontend/media flag; bot text/photo fallback.
- **Acceptance criteria:** all hard budgets/gates pass; no unsupported-client critical task failure.
- **Definition of done:** human and automated evidence signed off.
- **Parallel:** performance, a11y, localization and media streams parallel.

## MA-8 — Closed synthetic canary

### MA-8.1 — Run full synthetic cohort and soak

- **ID / phase / priority:** MA-8.1 / MA-8 / P0.
- **Title:** Exercise buyer/seller cross-surface flows with synthetic data only.
- **Problem:** unit/E2E cannot prove real Telegram client lifecycle and release behavior alone.
- **Current implementation:** one synthetic store/48 products; zero real stores/orders/handoffs.
- **Files/modules affected:** flags, runbook/evidence, no product code unless defects found.
- **Backend capability reused:** entire existing market system.
- **New component/API needed:** synthetic identities/cohort config and evidence dashboard.
- **User impact:** none outside internal testers.
- **Security impact:** validates auth/tenant/log/privacy without real PII.
- **Data impact:** synthetic orders/moves/notifications/handoffs only; provenance retained.
- **Migration requirement:** none.
- **Analytics:** full closed funnel/technical metrics.
- **Tests:** required device/E2E/security/regression matrix and proposed 7-day soak.
- **Visual evidence:** recorded complete buyer/seller journeys and failure states.
- **Dependencies:** all MA-1–MA-7 gates.
- **Owner input:** authorize synthetic production cohort/observation if run in prod environment.
- **Telegram/BotFather action:** approved test/closed launch surface only.
- **Deployment needed:** exact-SHA frontend/BFF, flags allowlist only.
- **Effort:** M plus soak.
- **Risk:** high but bounded.
- **Rollback:** global flag and immutable deployment drill.
- **Acceptance criteria:** zero invariant/security breach; SLOs and fallback targets met.
- **Definition of done:** signed synthetic evidence and open defect/risk decision.
- **Parallel:** observation, visual, analytics and support rehearsal parallel.

### MA-8.2 — Prove kill switches and immutable rollback

- **ID / phase / priority:** MA-8.2 / MA-8 / P0.
- **Title:** Roll back frontend, BFF read and each command without bot downtime.
- **Problem:** documented rollback is not proof.
- **Current implementation:** production site rollback exists; no Mini App deployment/flag drill.
- **Files/modules affected:** release runbook/flags/evidence only.
- **Backend capability reused:** current bot fallback and immutable Pages deployments.
- **New component/API needed:** tested flag sequence and paired version record.
- **User impact:** safe recovery path.
- **Security impact:** prevents continued exposure during auth/CORS/IDOR incident.
- **Data impact:** no undo writes; reconcile domain truth.
- **Migration requirement:** none.
- **Analytics:** recovery/fallback and deployment version buckets.
- **Tests:** response-lost successful mutation then disable; stale app/BFF compatibility; bot smoke.
- **Visual evidence:** fallback/error/bot continuation recording.
- **Dependencies:** MA-8.1 release candidate.
- **Owner input:** release/incident owner executes and records drill.
- **Telegram/BotFather action:** reversible test launch configuration only.
- **Deployment needed:** rollback between immutable synthetic targets.
- **Effort:** S.
- **Risk:** critical if absent.
- **Rollback:** this item is the rollback proof.
- **Acceptance criteria:** app disabled and bot usable within agreed recovery objective; no data corruption.
- **Definition of done:** IDs/timestamps/outcome/runbook corrections recorded.
- **Parallel:** may run during end of soak, not before stable candidate.

## MA-9 — Store Pilot #1 Mini App cohort

### MA-9.1 — Close real-pilot owner, privacy, media and operations gates

- **ID / phase / priority:** MA-9.1 / MA-9 / P0.
- **Title:** Authorize one real seller and a tiny invited buyer cohort.
- **Problem:** synthetic evidence cannot authorize real business/PII/public behavior.
- **Current implementation:** real stores = 0; Store Pilot #1 business inputs remain external.
- **Files/modules affected:** owner inputs/runbook/cohort config; no import until authorized.
- **Backend capability reused:** existing pilot/OCC/store lifecycle.
- **New component/API needed:** none necessarily; operational records.
- **User impact:** establishes accountable real service.
- **Security impact:** verified identity, support, privacy/legal and incident ownership.
- **Data impact:** future real data only after gate; backup/retention approved.
- **Migration requirement:** none unless separate approved evidence says otherwise.
- **Analytics:** denominators/retention and review cadence approved.
- **Tests:** production identity/domain/flag/rollback dry run without real mutation first.
- **Visual evidence:** real catalog/photo/copy/trust and owner/seller comprehension review.
- **Dependencies:** MA-8 complete, existing Store Pilot #1 inputs.
- **Owner input:** explicit seller/store/cohort/domain/BotFather/privacy/support/cutover authority.
- **Telegram/BotFather action:** exact approved menu/inline/test-to-prod configuration.
- **Deployment needed:** exact-SHA production candidate with flags off.
- **Effort:** M engineering plus owner/provider time.
- **Risk:** critical.
- **Rollback:** do not start if any gate/target absent.
- **Acceptance criteria:** named approvals, cohort and immediate rollback recorded; no public exposure.
- **Definition of done:** owner authorizes the exact next pilot step, not the full roadmap.
- **Parallel:** operations/content review parallel; authorization sequential.

### MA-9.2 — Enable real cohort progressively

- **ID / phase / priority:** MA-9.2 / MA-9 / P0.
- **Title:** Real read-only → buyer commands → seller commands, one flag at a time.
- **Problem:** all-at-once real enable hides which surface causes harm.
- **Current implementation:** no real Mini App cohort.
- **Files/modules affected:** cohort flags/evidence/runbook; defects only under scoped fixes.
- **Backend capability reused:** same domain/BFF as synthetic.
- **New component/API needed:** none unless evidence-gated defect.
- **User impact:** bounded visual marketplace for one store.
- **Security impact:** daily auth/tenant/PII review and stop authority.
- **Data impact:** real orders/contact/handoff under approved policy.
- **Migration requirement:** none by default.
- **Analytics:** primary funnel, seller response, fallback, error/support guardrails.
- **Tests:** daily smoke, sampled reconciliation, real-device tasks, rollback checkpoint before each flag.
- **Visual evidence:** observed real loading/empty/error/stale/support, not staged only.
- **Dependencies:** MA-9.1.
- **Owner input:** explicit approval before each command/callback cohort expansion.
- **Telegram/BotFather action:** bounded launch/menu change with recorded reversal.
- **Deployment needed:** flags first; new exact-SHA only for fixes.
- **Effort:** L plus evidence window.
- **Risk:** critical.
- **Rollback:** flag to prior stage; bot and current data continue.
- **Acceptance criteria:** agreed task/SLO/support targets, zero P0/P1, reconciliation exact.
- **Definition of done:** pilot report recommends expand/hold/rollback with evidence.
- **Parallel:** monitoring/support/localization parallel; flag sequence is serial.

## MA-10 — Primary interface and legacy callback reduction

### MA-10.1 — Make Mini App the primary visual entry

- **ID / phase / priority:** MA-10.1 / MA-10 / P1.
- **Title:** Promote app launch while preserving bot responsibilities.
- **Problem:** after proven parity, users need a clear default without losing recovery.
- **Current implementation:** bot is primary and must remain available.
- **Files/modules affected:** bot launch/menu presentation, flags/runbook; no webhook replacement.
- **Backend capability reused:** bot `/start`, notifications, fallback, all domain services.
- **New component/API needed:** primary UI capability/entry copy only.
- **User impact:** one-tap visual marketplace; conversational/fallback bot retained.
- **Security impact:** no authority change; public exposure/load reviewed.
- **Data impact:** none.
- **Migration requirement:** none.
- **Analytics:** app vs bot entry, task success, fallback/support.
- **Tests:** public entry, all clients/locales, kill switch, load/error budgets, bot smoke.
- **Visual evidence:** profile/menu/launch preview and recovery journey approved.
- **Dependencies:** MA-9 stability and owner O-11.
- **Owner input:** explicit public/primary cutover and BotFather action.
- **Telegram/BotFather action:** menu/main Mini App/profile configuration, separately reversible.
- **Deployment needed:** exact-SHA plus flag/menu rollout.
- **Effort:** M.
- **Risk:** high.
- **Rollback:** revert menu/flag to bot primary; no backend/data rollback.
- **Acceptance criteria:** primary entry meets SLOs and bot fallback is discoverable/functional.
- **Definition of done:** cutover evidence, support monitoring and rollback target recorded.
- **Parallel:** creative/support prep parallel; cutover serial.

### MA-10.2 — Reduce individual legacy callbacks only after parity

- **ID / phase / priority:** MA-10.2 / MA-10 / P2.
- **Title:** De-emphasize proven visual callbacks with independent re-enable flags.
- **Problem:** indefinite duplicate UI adds maintenance, but early removal destroys fallback.
- **Current implementation:** current callbacks remain safe and tested.
- **Files/modules affected:** bot response/action presentation and per-callback flags only; services remain.
- **Backend capability reused:** all bot runtime/domain/delivery.
- **New component/API needed:** usage/parity report and re-enable controls.
- **User impact:** cleaner bot, Mini App primary for complex tasks; lightweight/recovery actions remain.
- **Security impact:** no rule/authority deletion; fallback must remain.
- **Data impact:** none.
- **Migration requirement:** none.
- **Analytics:** callback usage, app completion, fallback/recovery/support.
- **Tests:** each callback off/on, deep link, unsupported app, accessibility, incident recovery.
- **Visual evidence:** before/after bot journeys for RU/UZ and unsupported clients.
- **Dependencies:** proposed ≥4 weeks MA-10.1 target parity and owner approval.
- **Owner input:** approve each callback, never blanket deprecation.
- **Telegram/BotFather action:** none necessarily.
- **Deployment needed:** flag/config; code removal is a future separate decision.
- **Effort:** S per callback group.
- **Risk:** high.
- **Rollback:** re-enable specific callback immediately.
- **Acceptance criteria:** no worse task success/support/accessibility; recovery remains one tap/command.
- **Definition of done:** callback marked fallback/de-emphasized, not deleted, with evidence and owner.
- **Parallel:** independent callback analyses can parallelize; changes stage separately.

## Recommended first implementation slice

`RECOMMENDED_FIRST_IMPLEMENTATION_SLICE=MA-3.1a / Signed read-only product detail vertical slice`

After MA-1 auth/BFF foundation is complete, the first user-visible slice is:

1. signed synthetic Telegram launch;
2. existing identity/storefront resolution;
3. one versioned `GET` product-detail projection over the real catalog service;
4. one Warm Market Signals product-detail screen with media fallback;
5. “continue in bot” action;
6. global/synthetic cohort kill switch;
7. auth/IDOR/CSP/CORS/media/visual/bot-regression proof.

It changes no business rule, requires no migration, uses the current synthetic
store and real backend, has bot fallback, rolls back independently and proves
the highest-risk architecture before search or transactions expand.
