# GPTBot Market Mini App test strategy

## Baseline and principle

The latest productization evidence records 1,076/1,076 tests plus green build,
type, accessibility and secret gates. That evidence predates Mini App code; it
is a regression baseline, not Mini App certification.

Each stage must prove both the new surface and the unchanged bot/platform. A
green client suite cannot compensate for a failed tenant, idempotency,
inventory, notification, schema or fallback invariant.

## Test pyramid

### Unit

- `initData` strict parsing, canonicalization, HMAC derivation, constant-time
  comparison, age/skew and malformed user data;
- session claims, audience/expiry/rotation and closed auth errors;
- request/response validators, cursor and idempotency-header parsing;
- BFF DTO allowlists and domain-error mapping;
- product/order/handoff presenters with escaping and missing fields;
- role/capability navigation derived only from bootstrap response;
- Router/BackButton state, theme/safe-area adapter and cleanup;
- query reducers, filters, compare UI, checkout form and offline/retry policy;
- RU/Uzbek Latin dictionaries, price/UZS tabular formatting and expansion;
- analytics allowlist and forbidden-field rejection.

### Contract

- every `/api/market/v1` schema with positive, boundary and unknown-field
  fixtures;
- BFF → existing service compatibility without D1 row leakage;
- uniform `resource_not_found`, authorization and conflict contracts;
- schema verifier fails closed for every missing table/column/index;
- `Idempotency-Key` replay returns prior result and mismatched fingerprint
  returns conflict;
- exact CORS headers for staging/production/evil/null origins;
- CSP header snapshot, bundle source-map/secret scan and cache policy;
- API/frontend version compatibility matrix.

### Integration

- signed Telegram user → existing identity → storefront session;
- verified owner → membership → store/pilot → seller capability;
- revocation, pause and suspension between bootstrap and next request;
- buyer category/search/detail/comparison over real current services;
- checkout resume, price change, stock unavailable and placed order;
- buyer order ownership/list/detail;
- seller list/detail and PII minimization;
- confirm/cancel/done with inventory movement and one notification intent;
- buyer handoff → seller queue/reply → buyer delivery;
- media handle → fixed Telegram `getFile` host → bounded response/fallback;
- Mini App event projection through existing privacy-safe event service.

### End-to-end

- Telegram WebView-like signed launch and direct-browser rejection/recovery;
- buyer home → search/filter → detail → compare → bot checkout fallback;
- full buyer request → success → order detail → handoff;
- seller dashboard → order detail → transition → notification;
- seller question → reply, close/reopen and two-device conflict;
- RU and UZ, light/dark/custom theme, iOS/Android viewport and keyboard;
- network loss before/during/after a mutation, repeated tap and delayed response;
- stale product/stock/order, app minimize/reactivate and WebView reload;
- app kill switch and bot fallback without bot restart/deploy.

### Security

- forged, reordered, duplicate-key, decoded/re-encoded, expired, future and
  replayed `initData` vectors;
- foreign bot/test token and algorithm/canonicalization confusion;
- client `mode=owner/seller`, store/role/start parameter tampering;
- two-tenant/two-store IDOR matrix for every resource and command;
- order/handoff/media enumeration and uniform error timing/body review;
- stored/reflected XSS in names/descriptions/specs/comments/replies;
- CSRF simple forms, credential modes and malicious origins;
- CORS preflight and wildcard regression; CSP enforce/report behavior;
- hostile iframe vs allowed Telegram Web compatibility;
- rate-limit boundaries, bypass attempts and privacy of rate keys;
- bot/session/webhook token scan in source, bundle, maps, logs and media URLs;
- body/array/image limits, unsupported MIME, arbitrary URL and cache poisoning.

### Visual/accessibility

Snapshot and human evidence at 320, 360, 390 and 430 px for:

- buyer home, results, detail, compare, checkout/review, order timeline;
- seller dashboard, queues, detail, confirmation, stock editor;
- loading, empty, error, offline, stale, price-changed, paused and suspended;
- RU/UZ, light/dark/custom theme, 200% text and reduced motion.

Automated gates: axe/WCAG 2.2 AA, contrast, DOM order, keyboard, focus-visible,
44 px targets, no overflow and image/input labels. Human gates: VoiceOver and
TalkBack task passes, external keyboard and comprehension review. Automated
accessibility does not certify screen-reader usability.

### Regression

- existing Telegram webhook secret/dedup/rate limit/runtime/render/delivery;
- all Sotuvchi catalog, buyer, checkout, orders/inventory, handoff, stats and
  pilot suites;
- GPT Chat, public website/prerender/SEO and Owner Control Center;
- lead and Javob bot isolation; protected bot username guard;
- automation producer/consumer/DLQ and n8n-retirement gates;
- current schema contract and migration evidence;
- secret scan and repository type/build baseline.

## Core acceptance invariants

| Invariant | Acceptance |
| --- | --- |
| Authentication | zero forged/expired/foreign launch accepted; no auth value logged |
| Tenant isolation | every foreign store/resource read and mutation fails uniformly |
| Seller authority | client role/path never grants capability; revoke blocks next request |
| Idempotency | identical retry is unchanged/replay; changed payload under key conflicts |
| Checkout | one active draft, one placed order, price/stock revalidated server-side |
| Inventory | one movement per successful transition; never negative or double-decremented |
| Notifications | one intent per domain transition; retries do not create a second intent |
| Handoff | one active buyer conversation, correct seller, TTL/content clearing preserved |
| Privacy | no forbidden field/value in list DTO, analytics, logs, errors or caches |
| Fallback | disabling any app surface leaves the matching bot task usable |
| Schema | partial/mismatched runtime answers 503 before domain use |

## Stage exit gates

| Stage | Exact acceptance gate |
| --- | --- |
| MA-0 | Git/source/production/rollback reconciled; ADRs approved or explicitly open; no unknown Mini App code; missing source recorded |
| MA-1 | 100% auth/contract/security tests green; two-store IDOR matrix green; BFF composition invokes existing services; current full bot baseline green |
| MA-2 | shell bundle within budget; signed launch on staging iOS/Android/Web; direct browser denied; CSP/CORS exact; all shared states accessible |
| MA-3 | synthetic catalog parity for categories/search/detail/compare; zero fact drift; media fallback; p95/error budget; bot checkout remains usable |
| MA-4 | duplicate/two-device/price/stock/network cases create one order and one intent; bot resumes same draft; no contact leakage |
| MA-5 | revoked/paused/suspended seller loses data immediately; lists PII-free; detail authorized/no-store; dashboard counts match D1 truth |
| MA-6 | each command passes OCC, replay and one-move/one-intent proofs; command-specific rollback drill; no P0/P1 security issue |
| MA-7 | all key screens pass RU/UZ, themes, widths, 200% text, VoiceOver/TalkBack, reduced motion and performance budgets |
| MA-8 | complete synthetic E2E and live kill-switch/immutable rollback rehearsal; 7-day synthetic soak proposed with no invariant breach |
| MA-9 | separate real seller/owner authorization, content/media/privacy review; tiny invited cohort; daily evidence and bot fallback; no open P0/P1 |
| MA-10 | agreed stability window and task parity; fallback/support within target; each callback has independent re-enable proof |

## Device/client matrix

| Dimension | Required values |
| --- | --- |
| Telegram | current iOS, Android, Desktop, Web; one previous supported mobile version where available |
| Device | low-end Android, reference Android, current and older supported iPhone |
| Width | 320, 360, 390, 430 px; tablet/desktop responsive sanity |
| App state | compact, expanded, keyboard open, minimize/reactivate, close/reopen |
| Network | offline, slow, high latency, response lost after server success |
| Theme | light, dark, custom high/low-luminance Telegram themes |
| Locale/access | RU, native-reviewed Uzbek Latin, 200% text, VoiceOver, TalkBack, keyboard, reduced motion |

## Evidence artifacts

Each release candidate records:

- source SHA, frontend/API build versions and dependency lockfiles;
- test command/results and baseline comparison;
- auth/security vectors and tenant matrix;
- bundle report, traces and API p50/p95 by cold/warm/client;
- screenshots/video for the visual matrix;
- event/log PII inspection;
- immutable frontend/BFF deployment IDs and flags;
- rollback drill result and fallback bot evidence;
- named human approvals and remaining evidence gaps.
