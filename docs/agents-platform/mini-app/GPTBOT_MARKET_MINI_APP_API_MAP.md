# GPTBot Market Mini App preliminary API map

Status: implemented as a synthetic candidate behind default-off flags. The
capabilities in this map exist under `/api/market/v1/*`; the executable route
and contract truth is `functions/market/router.ts` plus
`tests/market-mini-app-contract.test.ts`. The candidate uses explicit checkout
step routes (`/checkout/name`, `/phone`, `/address`) and
`/checkout/cancel`; no production endpoint has been enabled or deployed.

## API rules

- Base path: `/api/market/v1`.
- JSON request/response schemas are closed, versioned and size-bounded.
- Session actor and store scope are server-derived. `role`, `orgId`, `storeId`
  and `start_param` from the browser never grant authority.
- All responses include `x-request-id`, `Cache-Control: no-store` for private
  data and a closed error code. No stack/error messages or D1 rows.
- Mutations require a client-generated UUID `Idempotency-Key`; the BFF maps it
  to the current domain `requestId` and preserves fingerprint conflicts.
- Reads use bounded cursor pagination; no unbounded offset or enumeration.
- Cross-origin policy allows only the exact approved staging/production Mini
  App origins and returns `Vary: Origin`. Wildcard CORS is forbidden.
- A server kill switch and cohort gate are checked before session/route use.

## Session and shell

| Method / route | Caller and request | Response | Auth / authority | Idempotency / rate / side effects | Reused service and tests |
| --- | --- | --- | --- | --- | --- |
| `POST /session/exchange` | app; raw `initData` in body/header, optional launch hint; max 8 KiB | short-lived bearer session, locale, buyer/seller capability flags, storefront summary, expiry | validate Telegram HMAC + `auth_date`; resolve identity; database-derived membership/store/pilot | one exchange per launch hash/window; strict IP/identity rate; may get/create identity and bind approved storefront | `IdentityService`, shared storefront resolver; signature vectors, expired/replay, forged role/start, pause tests |
| `POST /session/refresh` | app; current bearer plus fresh raw `initData` | rotated short-lived session | revalidate both; re-read membership/lifecycle | bounded per identity; old token expires normally | auth adapter; rotation/revocation/multi-device tests |
| `DELETE /session` | app; no body | `204` | valid session | idempotent; client discards token; stateless server token cannot be revoked individually, so TTL stays short | session shell; logout/no-token tests |
| `GET /me` | app | locale, safe user display, capabilities, active storefront/store state | valid session; seller capability re-derived | per-session read rate; no side effect | identity/membership/catalog; forged role and revoked owner tests |
| `GET /bootstrap` | app | flags, navigation, storefront/store state, unread/order counters, API/build versions | valid session and cohort | short private cache in query client only; no server cache | shared access/dashboard queries; paused/suspended and contract tests |

Session tokens should be signed server-side, audience-bound to `market-mini-app`,
contain only opaque identity/session identifiers and expire in 10 minutes. They
remain in memory. Every seller mutation re-reads owner membership/store status;
token claims are not sufficient authorization.

## Buyer catalog and comparison

| Method / route | Caller and request | Response | Auth / authority | Idempotency / rate / side effects | Reused service and tests |
| --- | --- | --- | --- | --- | --- |
| `GET /catalog/home` | buyer; locale | store identity, categories, bounded featured/recent products, freshness | active buyer storefront session | read bucket; may record content-free view separately | catalog list/categories; projection/empty/pause tests |
| `GET /catalog/categories` | buyer; cursor, limit ≤20 | category DTO page | active storefront/store/pilot | read bucket; none | `listBuyerCategories`; cursor and tenant tests |
| `GET /catalog/categories/:categoryId/products` | buyer; cursor, limit ≤20, safe filters | published product-card page | active storefront; category tenant-scoped | search/read bucket; presentation record only after shown | catalog category query; invalid filter/IDOR/stale tests |
| `GET /catalog/products` | buyer; bounded query/filters/cursor | result cards, applied constraints, next cursor, closed zero-result reason | active storefront | debounce client; rate per identity/store; records bounded presentation facts | buyer query/catalog ranker; raw-query privacy and equivalence tests |
| `GET /catalog/products/:productId` | buyer | full published product DTO, specs, media handles, updated time | active storefront; product tenant/store scoped | read bucket; product-view analytics best effort | catalog published product; unpublished/cross-store tests |
| `POST /comparison/items` | buyer; `{product_id}` | current 2–3 item comparison | active storefront | `Idempotency-Key`; comparison write only | catalog add comparison; duplicate/full/stale tests |
| `DELETE /comparison/items/:productId` | buyer | current comparison | active storefront | `Idempotency-Key`; adapter may use clear/rebuild until domain remove exists | current comparison service; adapter regression required |
| `GET /comparison` | buyer | factual comparison DTO with explicit missing fields | active storefront | read bucket; no business mutation | list comparison; stale product and formatting tests |
| `DELETE /comparison` | buyer | `204` | active storefront | idempotent; clears comparison | clear comparison; replay test |
| `GET /media/:handle` | buyer/seller UI; opaque handle | bounded image bytes or branded fallback | valid session and product access; handle maps server-side | aggressive abuse cap; server `getFile`; never returns/logs token URL | Telegram client `getFile`; MIME/size/cache/token-leak tests |

## Buyer checkout, orders and handoff

| Method / route | Caller and request | Response | Auth / authority | Idempotency / rate / side effects | Reused service and tests |
| --- | --- | --- | --- | --- | --- |
| `GET /checkout/active` | buyer | active draft/workflow state or null, privacy-minimized | active buyer session | read; no side effect | `getActiveCheckout`; reopen/two-device tests |
| `POST /checkout` | buyer; `{product_id}` | draft snapshot and next step | active buyer session and published/sellable product | required key; creates/resumes one workflow/order draft | `startCheckout`; duplicate/other-draft tests |
| `PUT /checkout/quantity` | buyer; `{quantity}` | updated draft | buyer owns active draft | required key; domain version/OCC | `submitQuantity`; repeated tap/conflict tests |
| `PUT /checkout/contact` | buyer; one explicit step `{field,value}` | updated draft without echoing unnecessary PII | buyer owns active draft | required key; strict body/field bounds; writes PII only to order | submit name/phone/address; logs/response/validation tests |
| `PUT /checkout/comment` | buyer; bounded comment or skip | updated draft | buyer owns draft | required key; stored bounded free text | submit/skip comment; XSS/log/size tests |
| `POST /checkout/confirm` | buyer; no price/total from client | placed, price-changed or stock-unavailable result | buyer owns complete draft; server re-reads product/stock | required key; places once and emits one seller intent | `confirmCheckout`; double tap, price/stock race, notification test |
| `DELETE /checkout` | buyer | cancelled snapshot/`204` | buyer owns draft | required key; idempotent cancel | `cancelCheckout`; reopen/replay test |
| `GET /orders` | buyer; cursor, limit ≤20 | buyer-owned order summaries | identity/storefront session | read bucket; no PII beyond own summary | extend `listBuyerOrders`; pagination/ownership test |
| `GET /orders/:orderId` | buyer | own order detail/status timeline, next actor | order belongs to buyer session | read bucket; no side effect | new privacy presenter over existing order store; IDOR/status tests |
| `POST /handoffs` | buyer; `{reason,question}` bounded | created/existing handoff status | trusted buyer session | required key; one active conversation and seller intent | `requestHandoff`; duplicate/content/TTL tests |
| `GET /handoffs/active` | buyer | own active status/reply attribution or null | trusted buyer session | read bucket; may mark display only if explicitly designed later | `getActiveForBuyer`; expiry/delivery tests |

## Seller reads

| Method / route | Caller and request | Response | Auth / authority | Idempotency / rate / side effects | Reused service and tests |
| --- | --- | --- | --- | --- | --- |
| `GET /seller/dashboard` | verified seller | today stats, aged/open work, store state | active owner membership + active store each call | seller read bucket; content-free view event | stats/dashboard service; revoke/pause/count tests |
| `GET /seller/orders` | seller; status/cursor/limit | PII-free summaries | owner/store scope | read; none | orders list; cross-store/pagination tests |
| `GET /seller/orders/:orderId` | seller | authorized detail including buyer contact, `no-store` | owner/store/order scope | stricter read rate; audit-safe access metric, no contact logs | orders detail; support-role/IDOR/cache tests |
| `GET /seller/handoffs` | seller; status/cursor | content-free queue | owner/store scope | read; no content | list handoffs; scope/pagination tests |
| `GET /seller/handoffs/:handoffId` | seller | bounded question/reply while unexpired | owner/store/handoff scope | strict rate; no raw analytics/logs | get handoff; expiry/content-clear tests |
| `GET /seller/products` | seller; status/cursor | own catalog quality/readiness DTOs | owner/store scope | read; none | catalog list; draft/privacy/pagination tests |
| `GET /seller/products/:productId` | seller | own product/detail/version/stock | owner/store/product scope | read; none | catalog get + inventory; cross-store test |
| `GET /seller/categories` | seller | own categories | owner/store scope | read; none | catalog list categories; scope test |
| `GET /seller/inventory` | seller; cursor | own inventory snapshots | owner/store scope | read; none | orders list inventory; pagination test |
| `GET /seller/stats` | seller; fixed supported window | exact report and declared window | owner/store scope | read; stats view event | stats service; “today” truth test |

## Seller commands — staged behind separate flags

| Method / route | Caller and request | Response | Auth / authority | Idempotency / rate / side effects | Reused service and tests |
| --- | --- | --- | --- | --- | --- |
| `POST /seller/orders/:id/confirm` | seller; `{expected_version}` | transition, stock result, order | active owner/store; order scoped | required key; exactly one stock move + buyer intent | `confirmOrder`; concurrency/replay/notification parity |
| `POST /seller/orders/:id/cancel` | seller; `{expected_version}` | transition/order | same | required key; terminal transition + one buyer intent | `cancelOrder`; conflict/replay tests |
| `POST /seller/orders/:id/done` | seller; `{expected_version}` | transition/order | same | required key; terminal transition + one buyer intent | `completeOrder`; conflict/replay tests |
| `POST /seller/handoffs/:id/reply` | seller; `{reply,expected_version}` | answered handoff | active owner/store/handoff, unexpired | required key; one answer + buyer delivery intent; direct command adapter must reuse settlement | handoff submit reply; duplicate/two-device/TTL tests |
| `PUT /seller/inventory/:productId` | seller; `{on_hand,expected_version}` | inventory/move result | active owner/store/product | required key; one adjustment/move | `setInventory`; stale overwrite/replay tests |
| `POST /seller/categories` | seller; bounded name/sort | category | active owner/store | required key; catalog operation | `createCategory`; validation/replay tests |
| `PATCH /seller/categories/:id` | seller; patch/version | category | owner/store/category | required key; OCC/update | catalog update; conflict tests |
| `POST /seller/products` | seller; validated product fields/media handles | draft product | owner/store; seller self-service flag | required key; catalog operation; no auto-publish | `createProduct`; body/media/validation tests |
| `PATCH /seller/products/:id` | seller; patch/version | product | owner/store/product | required key; OCC update | `updateProduct`; conflict/incomplete state tests |
| `POST /seller/products/:id/publish` | seller; expected version | product | owner/store/product; quality gate | required key; state transition | `publishProduct`; incomplete/unavailable/media policy tests |
| `POST /seller/products/:id/unpublish` | seller; expected version | product | owner/store/product | required key; state transition | `unpublishProduct`; buyer stale/recovery tests |

Seller product/category mutations remain bot/owner-assisted through MA-5. MA-6
starts with order transitions and replies because their domain invariants are
strongest. Product creation/publish is a later sub-cohort after media and
catalog-quality evidence.

## Closed error vocabulary

Initial codes: `auth_required`, `auth_invalid`, `auth_expired`,
`unsupported_environment`, `cohort_disabled`, `storefront_unavailable`,
`seller_forbidden`, `resource_not_found`, `validation_failed`,
`idempotency_conflict`, `version_conflict`, `price_changed`,
`stock_unavailable`, `rate_limited`, `schema_unavailable`,
`temporarily_unavailable`, `internal_error`.

Map domain errors deliberately. Never return “not found” for one store and
“forbidden” for another in a way that enables enumeration; cross-tenant
resources use the same closed `resource_not_found` response.
