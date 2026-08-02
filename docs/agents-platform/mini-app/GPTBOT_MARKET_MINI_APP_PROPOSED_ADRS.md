# GPTBot Market Mini App proposed ADRs

All records below have status **PROPOSED**. None is implemented or production-
approved by this documentation commit.

## MA-ADR-001 — Mini App is presentation, not authority

- **Status:** PROPOSED
- **Context:** Browser state and Telegram launch parameters are user-controlled.
- **Decision:** Mini App renders server projections and submits commands; D1,
  domain services and server authorization remain authoritative.
- **Consequences:** No direct D1/client business logic. More BFF work, much
  lower authorization and drift risk.

## MA-ADR-002 — Bot and Mini App share application/domain services

- **Status:** PROPOSED
- **Context:** Sotuvchi already implements catalog, checkout, orders, stock,
  notifications and handoff.
- **Decision:** Extract a shared composition/application boundary and call the
  exact services from Telegram and BFF adapters.
- **Consequences:** No domain rebuild; regression/contract tests are mandatory
  when composition moves.

## MA-ADR-003 — Bot remains entry, notification and fallback channel

- **Status:** PROPOSED
- **Context:** The bot is live, reliable and handles asynchronous communication.
- **Decision:** Retain `/start`, launch/deep links, lightweight search,
  notifications, human handoff, support and emergency task flows.
- **Consequences:** Dual-surface testing/support continues; users never lose a
  safe path during app rollback.

## MA-ADR-004 — Seller authority is server-derived on every sensitive request

- **Status:** PROPOSED
- **Context:** Client routes/mode cannot prove owner membership.
- **Decision:** Validate launch identity, then re-read active owner membership,
  organization/store and pilot lifecycle before seller data or mutation.
- **Consequences:** Revocation is effective immediately; extra bounded D1 reads
  are accepted until evidence justifies a safe cache.

## MA-ADR-005 — Rollout is staged, cohort-gated and reversible

- **Status:** PROPOSED
- **Context:** Big-bang replacement would couple auth, UI and commerce risk.
- **Decision:** buyer read → buyer commands → seller read → seller commands →
  primary UI, each with independent server flags and bot fallback.
- **Consequences:** Longer coexistence, but smaller blast radius and evidence-
  based callback reduction.

## MA-ADR-006 — Frontend never accesses D1

- **Status:** PROPOSED
- **Context:** D1 binding and tenant rules are backend responsibilities.
- **Decision:** All access goes through `/api/market/v1` BFF; no database SDK,
  binding or raw row schema in the app.
- **Consequences:** Versioned DTOs and API tests are required; database secrets
  and authority stay server-side.

## MA-ADR-007 — Business rules are not shared with or duplicated in client

- **Status:** PROPOSED
- **Context:** Client validation can improve UX but is bypassable.
- **Decision:** Price/stock checks, order transitions, seller authorization,
  notification intent, store pause and handoff ownership have one domain owner.
  Client checks are hints only and server results win.
- **Consequences:** Some latency/conflict UX is necessary; exactly-once truth is
  preserved.

## MA-ADR-008 — Payments are excluded

- **Status:** PROPOSED
- **Context:** Current payment providers are disabled and merchant protocol is
  not approved.
- **Decision:** The first Mini App submits a request/order and states that it is
  not payment. No invoice, Stars, Click/Payme or card UI/API.
- **Consequences:** Lower legal/financial scope; payment requires a new ADR and
  owner/provider evidence.

## MA-ADR-009 — Owner Control Center remains separate

- **Status:** PROPOSED
- **Context:** OCC carries global platform, automation, audit and lifecycle
  authority unrelated to public buyer/seller tasks.
- **Decision:** Keep it in the protected web tool through Pilot #1; no platform
  role appears in Mini App auth/session/navigation.
- **Consequences:** Operators use a separate tool; public blast radius is
  reduced.

## MA-ADR-010 — Legacy bot callbacks require parity evidence before reduction

- **Status:** PROPOSED
- **Context:** Existing callbacks are the tested recovery path.
- **Decision:** Do not remove them. After MA-10 evidence, reduce only individual
  visual callbacks behind re-enable flags.
- **Consequences:** Temporary UI duplication; rollback remains immediate.

## MA-ADR-011 — Isolated frontend deployment, existing backend BFF

- **Status:** PROPOSED
- **Context:** A fourth entry in the current Pages project would couple app
  rollback to the site/bot backend; a duplicate Functions project would create
  deployed domain-version drift.
- **Decision:** `apps/market-mini-app` builds to an independent static Pages
  project. BFF remains in current `gptbot.uz` Pages Functions.
- **Consequences:** Independent frontend rollback and bundle; exact-origin CORS
  and frontend/API compatibility records are mandatory.

## MA-ADR-012 — Resource reads plus explicit domain command endpoints

- **Status:** PROPOSED
- **Context:** Generic RPC/tool execution would expose runtime internals and
  client-selected actions.
- **Decision:** Use versioned resource GETs and explicit command POSTs that map
  one-to-one to existing application services.
- **Consequences:** More handlers/schemas; clear authorization, idempotency and
  observability per operation.

## MA-ADR-013 — Raw `initData` HMAC and short memory-only bearer session

- **Status:** PROPOSED
- **Context:** Official Telegram launch proof must be validated server-side;
  cross-origin cookies add CSRF/third-party behavior.
- **Decision:** Strict HMAC/freshness validation, then a 10-minute proposed
  audience-bound session held only in memory. Refresh needs fresh launch data.
- **Consequences:** Reload re-exchanges auth; no local token persistence. A
  durable nonce is a later security-gate option, not an implicit migration.

## MA-ADR-014 — Exact-origin CORS; non-ambient bearer auth

- **Status:** PROPOSED
- **Context:** Current global middleware emits wildcard CORS, incompatible with
  a private BFF threat model.
- **Decision:** Market API allows exact staging/production origins, denies
  unknown/null origins, uses Authorization bearer and JSON-only mutations.
- **Consequences:** Path-level middleware/refactor and Telegram Web tests are a
  hard prerequisite.

## MA-ADR-015 — Thin native Telegram adapter before third-party SDK

- **Status:** PROPOSED
- **Context:** Telegram's official script exposes all required initial features;
  no SDK exists in the repository.
- **Decision:** Wrap `window.Telegram.WebApp` in a typed internal adapter. Add a
  third-party SDK only after a bundle/maintenance/version ADR.
- **Consequences:** Small bundle and controlled protocol surface; the project
  owns adapter tests and typings.

## MA-ADR-016 — TanStack Query for server state, React state for UI

- **Status:** PROPOSED
- **Context:** Catalog/orders are server state with activation/retry/conflict
  behavior; Redux/global client authority is unnecessary.
- **Decision:** isolated app package uses TanStack Query; local reducers/forms
  handle ephemeral UI. Checkout, role, stock and status stay on server.
- **Consequences:** one new isolated dependency; explicit invalidation and
  retry policy required.

## MA-ADR-017 — Telegram media proxy first, R2 only from evidence

- **Status:** PROPOSED
- **Context:** Catalog media is reusable Telegram `file_id`; Bot API download
  URLs contain the token and expire.
- **Decision:** BFF maps opaque handle to stored file ID, resolves/streams a
  bounded image and provides a fallback. Never expose upstream URL/token.
- **Consequences:** proxy latency and size limits; no first-slice schema. R2 is
  optional after measured need and owner approval.

## MA-ADR-018 — No new D1 migration by default

- **Status:** PROPOSED
- **Context:** Existing sessions/workflows/domain tables cover planned tasks and
  production physical/ledger history is mismatched.
- **Decision:** implement through adapters/projections first. Any schema change
  needs its own ADR, introspection, backup and forward/rollback rehearsal.
- **Consequences:** some initial queries/pagination stay simple; unsafe blind
  migrations are prevented.
