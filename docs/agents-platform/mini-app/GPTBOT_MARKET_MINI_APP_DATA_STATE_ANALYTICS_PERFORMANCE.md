# GPTBot Market Mini App data, state, analytics and performance

## Data/schema verdict

`DATA_MIGRATION_NEED=NO_FOR_FIRST_IMPLEMENTATION_SLICE`

MA-0 through buyer/seller read-only stages can use the current schema. Buyer
checkout, order transitions, stock, notifications and handoffs can also reuse
existing tables once their BFF contracts pass because their durable workflows
and idempotency already exist.

| Need | Existing truth | Verdict |
| --- | --- | --- |
| Telegram identity | `identities(provider='telegram')` | reuse |
| buyer storefront/locale/selection | `sotuvchi_storefront_sessions` | reuse |
| comparison | buyer comparison/presentation tables | reuse; no local authoritative compare |
| checkout draft | workflow instance + draft order/item | reuse |
| order history/status | orders/items | reuse; add API projection only |
| seller dashboard | exact domain tables/events | reuse; no read-model table initially |
| Mini App session | short signed bearer, memory-only | no D1 row initially |
| API idempotency | existing domain operation tables | reuse; map `Idempotency-Key` to request ID |
| audit | domain operations/events and OCC audit | reuse for current mutations; define any new auth audit separately |
| product media | Telegram `file_id` references | reuse through proxy for synthetic/pilot; R2 optional later |
| favorites | no proven job | do not build or migrate |

Optional future schema/infra proposals, each requiring a separate ADR and
owner gate:

- durable one-time Mini App launch nonce/revocation if transactional security
  review rejects bounded stateless replay;
- stable cursor/index changes if measured D1 query plans miss latency budgets;
- media asset metadata/R2 ownership if the Telegram proxy fails pilot needs;
- notification/read state only if users demonstrate an unread-state job;
- aggregated seller read models only after live query evidence, not in advance.

No future migration may run until physical D1 state through 0030 and the ledger
ending at 0025 are reconciled. Required sequence: read-only introspection,
backup/export, proposed SQL and checksum, clean/upgrade rehearsal, forward and
rollback rehearsal, exact target selection, explicit owner approval, manual
apply, post-contract check. `wrangler d1 migrations apply --remote` is never a
generic next step.

## Client state architecture

| State | Owner | Persistence/recovery | Mutation rule |
| --- | --- | --- | --- |
| identity/session | BFF + in-memory bearer | re-exchange Telegram `initData` on reload; never localStorage | client cannot edit claims |
| membership/store/pilot | D1/domain | re-read bootstrap and every seller mutation | no optimistic authority |
| catalog/products | server query cache | bounded TanStack Query cache; invalidate on focus/reactivate | reads only; no invented freshness |
| active search/filter | local URL/React state | safe bounded values may survive route/reload in URL; raw search not analytics | cancel obsolete request; debounce 250–350 ms proposed |
| comparison | D1 comparison service | server is durable; local tray mirrors last response | optimistic display only with rollback on API failure |
| checkout/order draft | existing server workflow/order | `GET /checkout/active` restores; local field stays provisional until acknowledged | no offline confirm; one pending command at a time |
| contact/comment input | local form until successful step; then server order | do not persist in browser storage; closing confirmation while unsaved | never log/cache globally |
| order status | server | refetch on app activation, focus and after notification return | no optimistic lifecycle |
| seller queues/dashboard | server | short cache; revalidate on activation and before action | counts never client-derived authority |
| seller mutations | domain service | response version replaces cache; conflicts force refetch | optimistic status only if reversible; stock never optimistic |
| locale | existing stored storefront preference + session hint | server preference, Telegram language default | route remains usable during save failure |
| theme/safe area | Telegram client + CSS | event-driven, ephemeral | presentation only |
| offline state | browser network signal + last safe cache | label stale, preserve form in memory | all business mutations disabled until server confirmation |

TanStack Query is recommended for server state because it provides cancellation,
deduplication, invalidation and bounded retries. Default retry policy:

- GET: up to two retries for network/5xx with jitter; never retry 4xx;
- mutation: no automatic retry after request transmission unless the same
  idempotency key is retained and the user explicitly retries;
- auth, permission, price, stock and version conflicts never auto-retry;
- app activation triggers safe read invalidation, not command replay.

## Multiple windows/devices and stale data

- OCC/domain version columns arbitrate concurrent seller edits.
- One active checkout draft per buyer session prevents competing cart truth.
- Every checkout confirmation re-reads price and stock.
- Every seller transition uses current order/inventory versions and a stable
  idempotency key.
- A stale client shows the server response and asks the user to review; it
  never overwrites silently.
- Closing/reopening the WebView reconstructs only navigation and server state;
  unsent contact/reply text is intentionally not durable unless a later,
  privacy-reviewed draft requirement is approved.

## Analytics mapping

Current event allowlist is in `functions/agents/sotuvchi/analytics/types.ts`.
It already blocks unknown fields and the platform PII validator rejects common
content/contact keys. New event names below are proposals, not implemented.

Privacy classes:

- **P0 aggregate:** closed locale/source/outcome/latency buckets;
- **P1 scoped reference:** internal product/category/store aggregate IDs,
  permitted only where already accepted and needed;
- **forbidden:** raw input/content/contact, Telegram/chat identity, initData,
  secrets.

| Product event | Reuse/new and allowed scalar fields | Privacy / decision use | Denominator and retention |
| --- | --- | --- | --- |
| `app_opened` | new `sotuvchi.app_opened`; locale, platform bucket, launch-source bucket, build version bucket | P0; adoption and startup health | valid launch attempts; existing event retention policy, proposed 90-day aggregate review |
| `auth_succeeded/failed` | new closed events; locale, reason/latency bucket; never Telegram ID/hash | P0; detect protocol/client failure | exchange attempts; operational 30-day review, aggregate trend 90 days |
| `home_viewed` | new; locale, safe source | P0; home usefulness denominator | authenticated opens |
| `category_opened` | reuse `sotuvchi.category_opened`; category ID, locale | P1; category discovery | home/category viewers |
| `qualified_search` | reuse `sotuvchi.search_submitted`; locale, price bucket, constraint-count bucket; no raw query | P0; valid demand | authenticated users who submit a bounded search |
| `results_shown` | reuse `sotuvchi.search_results_shown`; result count/bucket, category/product refs only as current policy permits | P0/P1; relevance funnel | qualified searches |
| `zero_result_reason` | reuse `sotuvchi.zero_results`; closed reason, price bucket | P0; catalog/search gaps | qualified searches |
| `product_viewed` | reuse; product/category IDs, locale | P1; result usefulness | users with results shown |
| `comparison_used` | reuse `comparison_started`; item-count bucket | P0; compare value | product viewers with ≥2 candidates |
| `request_started` | reuse `order_started`; product ref/locale | P1; checkout intent | product viewers |
| `request_completed` | reuse `order_created`; product ref/outcome | P1; primary conversion | request started |
| `order_viewed` | new; status bucket, age bucket, locale; no order/customer ID in global payload | P0; self-service status value | users with placed order |
| `seller_dashboard_opened` | new; locale, store aggregate, task-count bucket | P0/P1; seller activity | active verified sellers |
| `seller_task_completed` | new; closed task/outcome, latency bucket; no contact/content/order ID | P0; operating effectiveness | seller tasks started/eligible |
| `recovery_used` | new; closed error/recovery channel | P0; recoverability | users shown recoverable error |
| `fallback_to_bot` | new; screen/reason bucket | P0; missing parity and reliability | authenticated sessions or errors by screen |
| Mini App technical error | new `sotuvchi.mini_app_error`; platform/build/error/latency bucket | P0; release health | sessions/routes; short operational retention |

Existing bot events remain unchanged so bot and Mini App can be compared by a
new closed `surface`/source dimension only after the allowlist is deliberately
extended. Do not overload `source=deep_link|session` with a new meaning.

No event stores raw search, raw messages, Telegram ID, chat ID, phone, address,
consent text, callback data, initData, hash, query ID or secrets. Event writers
remain best-effort and cannot retry/repeat domain calls.

## Performance budgets

These are proposed rollout targets based on a mobile WebView, current React
stack and the observed 2.564 s cold `/start` sample. They are not claims about
current p95. Each target requires lab and real canary measurement.

| Measure | Proposed target | Rationale and verification |
| --- | ---: | --- |
| initial compressed JS | ≤150 KiB Brotli for auth/home shell; ≤250 KiB after first buyer route | root React is modern; separate package and native Telegram wrapper avoid landing/admin code. Measure bundle report in CI |
| initial CSS | ≤35 KiB Brotli | token/component system, no landing CSS; CI artifact budget |
| route chunks | ≤80 KiB Brotli each; seller editor loaded on demand | protect buyer startup; manifest check |
| first product image | responsive AVIF/WebP where available, ≤150 KiB; no image >500 KiB in first viewport | low-end/slow network; media proxy content/size tests and Lighthouse trace |
| skeleton visible | ≤500 ms after navigation on reference warm client | immediate feedback without fake data; performance marks |
| usable home p75 | ≤2.5 s on simulated slow 4G/4× CPU; p95 canary ≤4 s | realistic WebView target; Playwright trace + real clients |
| warm read API | p50 ≤250 ms, p95 ≤800 ms server duration | D1 reads should be bounded; instrument closed latency buckets |
| cold read API | p95 ≤2.5 s during synthetic canary | current one cold `/start` sample is 2.564 s; first goal is not worse, then optimize from evidence |
| search response | p95 ≤1.0 s warm after debounce, first 20 items | maintains flow; server timing + client marks |
| mutation response | p95 ≤1.5 s warm, ≤3 s cold, with persistent pending feedback | transactions include OCC/batches; canary timings |
| client technical error | <1% sessions in synthetic canary, <0.5% before primary cutover | conservative release health; closed event denominator |
| crash-free sessions | ≥99.5% canary, ≥99.8% before primary cutover | commerce trust; error boundary/session denominator |

## Performance implementation rules

- Separate frontend deployment and route-level lazy loading; no landing/admin
  code or full Telegram SDK bundle in initial path.
- Server-side cursor pagination, bounded filters and search result limits.
- Cancel obsolete search requests; never fire on every keystroke without
  debounce/minimum intent.
- Product media uses explicit dimensions, lazy loading below fold, decoding
  async, and a truthful fallback.
- Cache public hashed assets immutably. Private API data remains client-memory
  only; no CDN shared cache for identity/seller/order responses.
- Catalog ETags may be evaluated after authorization/cache-key proof; avoid
  premature shared caching across stores.
- Instrument client navigation/auth/API marks with buckets, never raw URLs if
  they contain resource IDs.
- Measure low-end Android, Telegram Web and cold Worker separately; averages do
  not satisfy gates.

Any stage exceeding bundle/API/home targets by more than 20%, or showing a
regression in current bot cold path, pauses cohort expansion until diagnosed.
