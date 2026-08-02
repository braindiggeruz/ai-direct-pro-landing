# GPTBot Market Mini App backend reuse matrix

## Estimate

`BACKEND_REUSE_ESTIMATE=89%`

This is an engineering estimate of backend/domain behavior required by the
planned Mini App, not a percentage of repository lines. It is weighted by
commerce risk: authorization, catalog truth, checkout, orders, stock,
notifications and handoff count more than formatting or routing.

| Layer | Reuse | Evidence and remaining work |
| --- | ---: | --- |
| Domain logic | 91% | catalog, deterministic search, comparison, checkout workflow, order transitions, inventory, outbox and handoff are complete; add transport-neutral query/command façades, not new rules |
| Data model | 96% | all first-slice entities and sessions exist; pagination/media projection may need code but no schema; later media/read models are optional |
| Authorization | 82% | identity, membership and store/pilot authority exist; `initData` authentication, session issuance and BFF context construction are new |
| Telegram transport/ecosystem | 72% | bot webhook, delivery, deep links, notifications and fallback remain; Mini App launch buttons and auth adapter are new |
| Frontend presentation | 12% | brand tokens/assets, React/tooling and format rules are reusable; app shell, screens and states are new |

The missing 11% of backend work is mostly authentication/BFF/presentation
adapters and pagination/media delivery. Rebuilding the domain would increase
risk without adding product value.

## Classification legend

- **A — Reuse unchanged:** call the current service with trusted context.
- **B — Reuse through adapter/API façade:** domain is ready; BFF DTO/handler is
  missing.
- **C — Refactor into shared application service:** behavior is usable but its
  composition or input mapping lives in Telegram wiring.
- **D — Remain bot-only:** channel behavior, not Mini App domain.
- **E — Mini-App-only presentation:** visual/client state with no authority.
- **F — Later deprecation candidate:** retain until measured parity.

## Core platform and authority

| Capability | Current files / entry | Authority / data / side effects | Class and required adapter | Security risk | Existing tests / missing tests | Migration / rollback |
| --- | --- | --- | --- | --- | --- | --- |
| Telegram identity resolution | `platform/identity/*`; `channels/telegram/identity.ts`; webhook `processAccepted` | trusted webhook `from.id` → provider/external ID → `identities`; may create identity | **B**: `initData.user.id` after signature validation calls the same `IdentityService` | accepting `initDataUnsafe` or client identity | `platform-tenancy`, `telegram-agents-webhook`; add signed/forged/expired launch integration | no schema; disable session endpoint and fall back to bot |
| Organizations and memberships | `platform/orgs/*`; onboarding and catalog owner lookup | D1 organizations/memberships; active role/status | **A/B**: reuse store/service; BFF never accepts role claims | forged seller mode, revoked membership cache | tenancy/onboarding/catalog tests; add revoke-between-requests and multi-device | no schema; kill Mini App cohort |
| Seller/store authorization | `catalog/service.ts:resolveOwnerContext`; `catalog/store.ts:findOwnedActiveStore` | server actor → active owner membership → active store; read-only query | **A**: construct actor/org server-side and call unchanged | IDOR if BFF trusts org/store route | catalog, orders, handoff, pilot tests; add endpoint cross-store matrix | no schema; route disabled |
| Store/pilot lifecycle | onboarding, `owner_pilot_stores`, routes, catalog/checkout lookups | active store/route/pilot gates; Owner actions can pause/suspend | **A/B**: shared `resolveMarketAccess` query for BFF shell | stale session after pause/suspend | pilot readiness, OCC, checkout tests; add mid-session pause/suspend | no schema; server denies and bot recovery remains |
| Channel address binding | `platform/channels/*`, `channels/telegram/addresses.ts` | identity → Telegram thread, notification reachability | **D/A**: remains bot delivery truth; Mini App reads only notification status | exposing chat/thread references | channel compatibility and webhook tests; add no-address fallback | no schema; bot continues current behavior |
| Schema contract | `api/telegram/agents-schema.ts` | one fail-closed read-only contract query | **C**: extract shared market schema verifier/composition root; BFF adds API prerequisites | partial schema causing fail-open handlers | six schema tests; add BFF cold-start contract | no migration for extraction; revert BFF deployment |
| Rate limiting | `channels/telegram/rate-limit.ts` | hashed user/chat/bot/tenant counters | **B/C**: reuse hashing/tenant concepts; create Mini App API policy keyed by session/identity/org, not webhook fields | abuse, enumeration, shared-secret reuse | webhook/rate tests; add session, endpoint class and 429 contracts | prefer existing tables only if semantics fit; otherwise separate future proposal; feature flag rollback |

## Buyer commerce

| Capability | Current files / entry | Authority / data / side effects | Class and required adapter | Security risk | Existing tests / missing tests | Migration / rollback |
| --- | --- | --- | --- | --- | --- | --- |
| Storefront route/session | `agents.ts` context resolver; catalog bind/resolve session | start/deep link resolves active route/pilot; binds identity to store/locale | **C**: shared launch resolver consumes validated `start_param` as hint and binds with server lookup | forged store code, cross-store session | webhook, catalog, buyer tests; add forged/missing/startapp and rebind policy | existing session table; no schema; bot binding remains |
| Categories/products | `catalog/service.ts`, `catalog/store.ts` | published, active store/pilot, tenant-scoped reads | **A/B**: BFF list/detail DTOs and cursor pagination | unpublished fields or DB shape leak | 60 catalog tests; add API projection/cursor/cache tests | no schema; BFF disable |
| Search and filters | `buyer/query.ts`, catalog ranker, parser/rules | stored storefront session; presentations and selection side effects | **B/C**: expose typed search query; keep conversational parser in bot; share deterministic query service | raw query analytics, costly enumeration | 27 buyer tests; add query schema, debounce/cancel and pagination | no schema; bot search canonical |
| Budget clarification | `buyer/parser.ts`, `buyer/query.ts`, pending budget columns | durable pending intent/request key | **C**: Mini App uses explicit price filters; bot keeps free-text clarification; do not duplicate parser | client treating parsed budget as authority | buyer tests; add filter/query equivalence | no schema; remove UI filter flag |
| Product presentation | FactSheet, cards, Telegram renderer | grounded facts → text/media `file_id`; analytics presentation rows | **B/E**: BFF product DTO + React card; shared price/availability enums only | stale/unsafe media, XSS in text | buyer grounding/media tests; add escaping, stale and visual contracts | no schema; fall back to text and bot |
| Comparison | catalog comparison service/table | session-scoped 2–3 published products; add/clear side effects | **A/B**: list/add/remove/clear endpoints call current service | comparison IDOR or stale product | buyer/catalog tests; add endpoint idempotency and stale item UX | existing table; no schema; client can clear local tray |
| Checkout workflow | `checkout/service.ts`, workflow engine/store | active buyer session; one draft; price/stock recheck; contact PII; operation log | **A/B**: explicit step/confirm/cancel commands with existing request IDs | duplicate order, PII leak, workflow-version race | 42 checkout tests; add API replay, two-device, CSRF/XSS | existing workflow/order tables; no schema; disable commands, bot resumes same draft |
| Buyer order history/detail | checkout list and order store | session-owned orders; current summary capped at five | **B/C**: privacy-minimized cursor query and buyer-owned detail projection | order enumeration/PII | checkout tests; add IDOR/pagination/status timeline | likely no schema; query code only; bot history fallback |
| Buyer handoff/question | `handoff/service.ts:requestHandoff/getActiveForBuyer` | buyer session ownership; bounded content/TTL; seller intent | **A/B**: request/status endpoint; preserve content rules | raw content logs, duplicate queue, expired reply | 40 handoff tests; add API body bounds, expiry/reload | no schema; bot can create/receive handoff |

## Seller operations

| Capability | Current files / entry | Authority / data / side effects | Class and required adapter | Security risk | Existing tests / missing tests | Migration / rollback |
| --- | --- | --- | --- | --- | --- | --- |
| Seller dashboard/stats | `stats/service.ts`, catalog/orders/handoff counts | owner-authorized exact D1 counts; content-free analytics | **A/B**: seller shell/dashboard DTO | count leak across store, misleading window | stats/pilot tests; add BFF role and today-window contract | no schema; hide seller route |
| Seller order list/detail | `orders/service.ts` | owner authorization; list omits PII, detail contains contact | **A/B**: separate DTOs and `Cache-Control: no-store` | contact exposure, IDOR | 40 orders/inventory tests; add list/detail privacy snapshots | no schema; return to bot order commands |
| Seller order transitions | `confirmOrder/cancelOrder/completeOrder` | version/idempotency; stock move and buyer notification intent in domain batch | **A/B**: command endpoints with required `Idempotency-Key` and current version | double stock decrement/notification | extensive exactly-once tests; add repeated-tap/two-device/API contract | no schema; disable seller mutation flag; bot uses same service |
| Inventory reads/sets | orders service/store | owner auth; product scope; OCC; unique movement | **A/B**: read first; set only MA-6 after parity | stale overwrite, wrong-store product | inventory tests; add expected-version UI/API test | no schema; mutation flag off |
| Catalog management | catalog CRUD/service | owner auth, validation, operation log, product version | **A/B**: read in MA-5; create/edit/publish only after media/validation UX proof | publishing incomplete product, version conflict | catalog tests; add multipart/media, validation presentation, conflict | no schema for text fields; keep mutations bot/owner-assisted initially |
| Seller handoff queue/reply | handoff service and seller reply workflow | owner/store scope; bounded content; bot next-message binding | **B/C/D**: list/detail reusable; add direct reply command using existing domain settlement; bot next-message flow remains | wrong handoff ownership, duplicate answer, content retention | handoff tests; add direct-command and two-device conflict | no schema; reply in bot fallback |
| Notification status and retry | notification outbox, dispatcher, automation/OCC | payload-free intent claims and Telegram delivery settlement | **A/D**: current dispatcher remains; Mini App may display safe status, never send directly | duplicate delivery, leaking destination | orders/handoff/automation tests; add Mini App transition→single intent regression | no schema; bot delivery unaffected |

## Presentation and channel

| Capability | Current files / entry | Authority / data / side effects | Class and required adapter | Security risk | Existing tests / missing tests | Migration / rollback |
| --- | --- | --- | --- | --- | --- | --- |
| Bot callbacks and renderers | `buyer/rules.ts`, response files, `channels/telegram/render.ts` | Runtime facts → buttons/messages; callback actions drive services | **D/F**: keep unchanged; reduce only after MA-10 evidence | early removal breaks recovery | webhook/channel/buyer regression suites; add parity comparison | no schema; restore callback feature flag |
| Telegram delivery | `channels/telegram/api.ts`, delivery dispatchers | bot token server-only; retries/send settlement | **D** unchanged | token disclosure or duplicate send | channel/media/reliability tests; add Mini App-triggered notification E2E | no migration; current delivery path |
| Product media | catalog `mediaRefs`; Telegram `file_id`; `getFile/sendPhoto` | bot token required to resolve; browser cannot consume `file_id` | **B**: authenticated bounded media proxy and fallback; later R2 only with evidence | token in URL/log/cache, oversized or wrong MIME | media validation tests; add proxy auth/MIME/size/cache tests | no schema first; disable images and use fallback |
| Mini App UI | no implementation; design tokens/assets exist | API DTOs + ephemeral client state only | **E**: isolated React app, Telegram adapter, state/query layer | client authority, XSS, stale optimistic UI | website/a11y evidence only; full unit/visual/E2E required | no data migration; frontend deployment rollback |
| Owner Control Center | `platform/admin/*`, `/api/admin/agents/*`, `src/admin/*` | platform JWT roles and global data | **D**: remain separate protected web tool | platform authority in public client | OCC role/privacy/audit tests; regression only | none; no integration |
| Analytics | Sotuvchi closed catalog and PII validator | best-effort idempotent scalar events | **B/C**: add Mini App source/event allowlist only after privacy review | raw query/initData/Telegram ID leakage | analytics/events tests; add new closed-field snapshots and retention | no schema if using events table; revert event producers |

## Risky duplication map

| Rule that must have one owner | Current owner | Safe shared location / sequence | Regression and rollback |
| --- | --- | --- | --- |
| stock and price validation | checkout/orders/catalog services | unchanged domain service; BFF calls commands | existing concurrency suites + API replay; disable endpoint |
| seller authorization | catalog owner resolver and membership query | shared application context builder delegates to resolver | cross-store matrix; deny Mini App sessions |
| order transitions | orders service | unchanged; endpoint names mirror commands, not logic | transition table/repeated tap; bot remains |
| notification intent | checkout/order/handoff domain writes | unchanged outbox creation inside domain operation | assert one intent; dispatcher unchanged |
| handoff ownership | handoff service | unchanged trusted buyer/seller session methods | IDOR/expiry; bot reply path remains |
| store pause/pilot | catalog/checkout store joins and OCC lifecycle | shared access resolver plus existing service checks on every request | pause mid-session; kill app cohort |
| catalog grounding | catalog/buyer query and FactSheet | query service returns domain results; BFF presenter never invents facts | bot/API equivalence fixtures; BFF rollback |
