# GPTBot Market Mini App consolidated architecture report

## Executive verdict

GPTBot Market can become a visual Mini App without rebuilding its backend.
Approximately 89% of required backend/domain behavior is reusable. The safe
path is an independent frontend deployment plus a versioned BFF in the existing
Cloudflare backend, calling the same Sotuvchi services as the bot. The first
user-visible proof is one signed, read-only synthetic product-detail slice with
bot fallback and no migration.

`BACKEND_REUSE_ESTIMATE=89%`

`DATA_MIGRATION_NEED=NO_FOR_FIRST_IMPLEMENTATION_SLICE`

`RECOMMENDED_FIRST_IMPLEMENTATION_SLICE=MA-3.1a / Signed read-only product detail vertical slice`

## Audit/source status

- Git/code/schema/current docs and the seven available named marketplace audit
  documents were read and reconciled.
- `GPTBOT_MARKETPLACE_MASTER_CHAT_HANDOFF_2026-08-01(1).md` is
  `SOURCE_MISSING`; no contents were invented.
- Official Mini App protocol/security facts were checked against
  [Telegram Mini Apps](https://core.telegram.org/bots/webapps) and
  [Telegram Bot API](https://core.telegram.org/bots/api#webappinfo).
- No actual Mini App route, WebApp component, `initData` validator, SDK
  dependency or conflicting branch was found.

## Actual Git and production state

| Fact | Verified value |
| --- | --- |
| Canonical clone | `F:\Claude\gptbot-repo-clean-20260801` |
| Baseline local/origin SHA | `2d7896706c3dfbcaf4239de3b999fa39d86abac2`; equal, clean, no stash |
| Planning branch | `planning/gptbot-market-mini-app-roadmap` |
| Productization source | `08c21568581bf90e7122a566f2805a619cd9e81d` |
| Production deployment | `68747046-8e1e-492a-8b81-dc4e4065916f` |
| Immutable production URL | `https://68747046.ai-direct-pro-landing.pages.dev` |
| Canonical site/bot | `https://gptbot.uz` / `@gptbot_market_bot` |
| Immediate rollback | deployment `d9ca163e-947b-40ba-856d-8143308c8402`, source `c670e4eebff79e2cc4b9027ffede865f0af813ab` |
| Data state | 1 synthetic store, 48 synthetic products, 44 inventory moves; 0 real stores/orders/notifications/handoffs |
| Governance | auto-deploy off; Railway disconnected; n8n retired; payments/public launch off |

## What is already ready

- identity, organizations, memberships and active owner/store authorization;
- store/pilot lifecycle and storefront routing/session binding;
- tenant-scoped categories/products, deterministic search, aliases/budget and
  durable comparison/presentation context;
- durable checkout workflow, one active draft, validation, price refresh,
  stock recheck and request-not-payment semantics;
- orders/items, seller transitions, OCC, inventory balances/movements and
  idempotent operation logs;
- payload-free notification intents, Telegram address/delivery/retry;
- buyer/seller handoff ownership, reply workflow and bounded content TTL;
- closed privacy-safe analytics, Owner Control Center, automation/DLQ and
  fail-closed runtime schema contract.

What is coupled to Telegram: webhook auth/dedup/rate scopes, update/callback
parsing, Runtime action mapping, bot-username session namespace, FactSheet/text
presenters, `file_id` delivery, notification channel and next-message reply
binding. Keep these for the bot; extract only composition/application adapters.

## Recommended architecture

- **Frontend:** future `apps/market-mini-app`, isolated Vite/React build in the
  same repository, independent static Cloudflare Pages project.
- **Deployment:** proposed `market.gptbot.uz` static app; existing
  `gptbot.uz/api/market/v1` backend. Exact-SHA manual releases, paired API/app
  versions and independent frontend rollback.
- **API:** resource reads plus explicit domain command endpoints. No generic
  tool/RPC execution, D1, DB rows or client-built `OrgContext`.
- **State:** TanStack Query for server state; local React state for filters/forms;
  authoritative checkout/order/role/stock server-side; token memory-only.
- **Telegram SDK:** thin typed wrapper over official `telegram-web-app.js`;
  third-party SDK only after bundle/maintenance ADR.
- **Media:** opaque handle → authenticated bounded BFF proxy → server-side
  Telegram `getFile`; token/upstream URL never reaches client. Text/image
  fallback first, R2 only after measured need.
- **Owner Control Center:** remains separate protected web tool; no platform
  authority in Mini App.

## Authentication/session summary

The BFF accepts raw `Telegram.WebApp.initData`, performs strict HMAC-SHA-256
validation and a proposed five-minute `auth_date` freshness check, resolves the
existing Telegram identity and issues a proposed 10-minute audience-bound
bearer held only in memory. Refresh requires fresh validated launch data.

The session carries no org/store/role/platform authority. Storefront context is
resolved server-side. Every seller request rechecks active owner membership,
store and pilot state. Forged role/start/store values cannot grant access.
Direct browsers receive an explanation and official bot link, not a demo
identity. Exact-origin CORS, JSON-only bearer commands, compatible CSP/frame
policy, XSS/SSRF/secret/rate/privacy controls are hard gates.

## Product and information architecture

One shell serves both audiences, with `/seller/*` as a verified route group.
Buyer destinations are Home, contextual Compare, Orders and server-aware Store
entry. Seller destinations are Today, Orders, Questions, Products and More.
Favorites, payment and public marketplace tabs are excluded until evidence.

The full screen inventory covers launch/auth/unsupported, discovery, filters,
zero results, detail/media, compare, checkout/conflicts/success, orders/status,
handoff, paused/offline/errors/settings/trust, and seller verification,
dashboard/queues/details/transitions/replies/products/stock/categories/quality,
stats/notification failures/paused/suspended/support/role navigation.

Safe seller mutations move in this order: order confirm/cancel/done, direct
handoff reply, absolute stock update, then draft catalog editing. Publish and
media-heavy self-service are last and independently flagged. Onboarding,
store/pilot lifecycle, automation and notification replay remain bot/OCC.

## Design/localization/platform

Warm Market Signals tokens/assets are reusable; landing/admin layout components
are not. The Mini App needs its own safe-area shell, bottom navigation, search,
cards/gallery, compare, checkout/timeline and seller operational components.

All screens target 320–430 px, ≥44 px targets, WCAG 2.2 AA, 200% text,
VoiceOver/TalkBack, reduced motion, no horizontal overflow and one dominant
action. RU and Uzbek Latin are separate reviewed dictionaries; native Uzbek is
an owner gate. Telegram theme variables are mapped through contrast-safe brand
tokens. BackButton follows Router history. BottomButton is reserved for a
tested final action, not navigation. `sendData`, payments, sensors, attachment
menu and authority-bearing client storage are excluded.

## Data, analytics and performance

Existing session/workflow/order/comparison tables cover first stages. No new
D1 migration is demonstrated as necessary. Optional nonce, media or read-model
storage needs a separate ADR and physical/ledger reconciliation.

Analytics extends the current closed scalar catalog only after privacy review.
It never stores raw search/messages, Telegram/chat ID, phone/address, consent,
callback, initData or secrets. Key denominators are qualified search, results,
product view, request start/complete, order view, seller task, recovery and
technical session health.

Proposed targets include ≤150 KiB Brotli auth/home JS, ≤250 KiB first buyer
route, warm read API p95 ≤800 ms, cold read p95 ≤2.5 s, warm search p95 ≤1 s,
usable home p75 ≤2.5 s on slow-4G/4× CPU, and ≥99.8% crash-free before primary
cutover. They require synthetic/real measurement and do not describe current
p95.

## Rollout, fallback and rollback

Sequence: bot canonical → buyer read-only → buyer transactions → seller
read-only → seller commands → Mini App primary → individual callback reduction.
Each surface has global/environment/store/identity and command flags. Bot
fallback is outside those flags.

First action on failure is disable the affected Mini App flag, not mutate D1 or
undo a successful operation. The bot resumes existing checkout/order/handoff
truth. Frontend rolls back independently; BFF rolls back only after flags are
off and current bot/site/OCC are smoked. Every production enable requires an
immutable target and an executed rollback drill.

MA-8 is synthetic only. MA-9 needs separate real seller, media, privacy,
support, domain and BotFather authorization. MA-10 primary cutover requires an
agreed stability window; individual callbacks are only de-emphasized behind
re-enable flags and are not deleted.

## Critical path and parallel work

Critical path: architecture approval → auth/shared composition/BFF → shell →
buyer read → buyer transactions → seller commands → productization → synthetic
canary/rollback → authorized pilot → primary cutover.

After contracts freeze, frontend shell, design system, RU/UZ, visual/media,
analytics/performance and test infrastructure can run in parallel. Seller reads
can overlap late buyer work. Pilot operations can prepare during MA-7, but
cannot authorize real data early.

Estimated cross-functional critical path: 18–26 calendar weeks plus owner
waits/live evidence; 28–40 engineering weeks if sequential. MA-1 and MA-3
evidence must trigger re-estimation.

## Readiness verdicts

| Verdict | Score | Evidence | Blocker | Next gate |
| --- | ---: | --- | --- | --- |
| `BACKEND_REUSE_READINESS` | 9/10 | mature tenant-scoped services and tests across all commerce domains | BFF composition/projections absent | MA-1.2 |
| `DOMAIN_DECOUPLING_READINESS` | 7/10 | services/stores are modular and transport-neutral | composition, some buyer/reply mapping in Telegram runtime | MA-1.2 parity extraction |
| `MINI_APP_AUTH_READINESS` | 3/10 | identity/membership truth exists; official design complete | no validator/session/secret/origin implementation | MA-1.1 security suite |
| `MINI_APP_API_READINESS` | 2/10 | services and preliminary endpoint contracts exist | no BFF handlers/schemas/CORS policy | MA-1.3 |
| `BUYER_MINI_APP_READINESS` | 5/10 | discovery/compare/checkout/orders/handoff backend ready | no auth/API/client/media proof | signed read-only slice |
| `SELLER_MINI_APP_READINESS` | 5/10 | strong owner/order/stock/handoff services | no Mini App authority contract or UI; mutation proof absent | MA-5.1 then MA-5.2 |
| `DESIGN_SYSTEM_READINESS` | 6/10 | Warm Market Signals tokens/assets/accessibility contract | no app components, device/native UZ evidence | MA-2/MA-7 component matrix |
| `DATA_MIGRATION_NEED` | 9/10 no-migration confidence for first stages | current tables cover sessions/workflows/commerce | media/nonce/index only optional after evidence; ledger mismatch | keep no-schema, reconcile before any proposal |
| `BOT_COEXISTENCE_READINESS` | 9/10 | bot transport/notifications/fallback are complete and isolated | app launch/flags not implemented | MA-1 flags + MA-8 drill |
| `ROLLOUT_READINESS` | 3/10 | production governance and synthetic fixtures exist | no app/staging/cohort/device evidence | MA-8 after MA-1–7 |
| `ROLLBACK_READINESS` | 7/10 | current site rollback and bot fallback are known | no independent app/BFF paired rollback drill | MA-8.2 |
| `OVERALL_MINI_APP_TRANSITION_READINESS` | 5/10 | strong backend and product/design direction | auth/API/client/real-device/pilot evidence not built | approve ADRs, then MA-1.1 |

## Proposed decisions and risks

Eighteen proposed ADRs cover authority, shared services, bot fallback, staged
rollout, no D1/client rules/payments/OCC, deployment, BFF style, auth/CORS,
Telegram adapter, state, media and no-migration default. They remain PROPOSED.

The highest risks are forged launch, seller/tenant IDOR, wildcard CORS, double
order/stock/notification, media token leakage, analytics PII, unsafe migration
and missing rollback. Any demonstrated occurrence is a hard stop.

## Documentation and operations record

The planning index links the vision, current/target architecture, reuse matrix,
API/screen maps, auth/security, Telegram matrix, data/state/analytics/
performance, migration/coexistence, roadmap, test strategy, risk register,
owner gates and proposed ADRs.

The docs-only commit and matching remote branch SHA are recorded in the final
task handoff after commit/push; a Git commit cannot embed its own SHA.

No production operation, deploy, D1 migration, endpoint creation, application
code change, BotFather/webhook action, Railway/n8n/payment change, real store,
real product import or public launch was performed.

## Exact next action

Owner/architecture review of MA-ADR-001…018. If accepted, open a new
implementation task for MA-1.1 using synthetic official/current auth vectors
only. The first user-visible slice after MA-1 is MA-3.1a signed read-only
product detail, not checkout, seller mutation or BotFather production setup.
