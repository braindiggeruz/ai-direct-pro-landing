# ADR: Existing Product Domain → Classifieds Listing Evolution

- Status: accepted for implementation; production migration not yet authorized
- Date: 2026-08-04
- Release branch: `release/bormi-public-beta-1`
- Decision owner: Product Owner

## Context

`sotuvchi_products` is already the record used by seller lifecycle commands,
buyer presentation, media, Admin and store commerce. Creating another listing
record would duplicate lifecycle and make buyer visibility ambiguous.

The current table is store-only: both `org_id` and `store_id` are `NOT NULL`.
That constraint makes the fixed product decision “private listing without a
store” impossible. A fake public store for every person would leak the commerce
model into the private-seller journey and is rejected.

## Options considered

| Option | Benefit | Cost/risk | Decision |
| --- | --- | --- | --- |
| Add columns to `sotuvchi_products` | Few joins | One wide record mixes identity, location, contact and moderation; nullable fields proliferate; sensitive policy changes require rebuilding the main table | Reject except for one bounded `listing_scope` discriminator |
| Small ownership/relation tables | Keeps the existing content record; domains remain bounded; private and store authority are explicit; rollout can be hidden | More joins and a narrowly scoped rebuild to permit a null store | **Selected** |
| Read projection/view over the store schema | Cheap read model | Cannot create a private listing without inventing a store; a view cannot own lifecycle constraints | Reject as the write model; a projection remains useful for discovery |
| Separate listing table | Clean greenfield schema | Parallel listing backend, duplicated media/lifecycle/Admin/search, migration ambiguity and higher owner cost | Reject |

## Decision

`sotuvchi_products` remains the canonical content/listing record.

1. Add `listing_scope = 'store' | 'private'` to that record.
2. Store listings retain non-null `org_id`/`store_id`; private listings require
   both to be null. `category_id` and `sku` remain store-commerce fields and are
   null for private listings.
3. Add a first-class provider-neutral `seller_profiles` record. It references
   `identities.id`; it never stores Telegram ID, username, phone or provider
   credentials.
4. Add `listing_ownerships` with a partial unique index that permits exactly one
   active owner per listing. Composite foreign keys bind store ownership to the
   same product tenant. Private ownership cannot carry a tenant/store.
5. Add bounded relations for global taxonomy, structured location, contact and
   commerce policy, moderation, reports and append-only moderation audit.
6. Global discovery joins these relations and returns only records where:
   product status is `published`, ownership is active, taxonomy and location are
   active, and moderation is `approved`.
7. Store commerce remains available only when `listing_scope='store'` and
   `commerce_mode='store_order'`. A private listing is inquiry-only.

## Why a product-table rebuild is unavoidable

SQLite cannot remove `NOT NULL` from `org_id`/`store_id` with `ALTER COLUMN`.
The only alternatives are a fake store or a separate listing table; both violate
fixed product decisions. Migration 0034 therefore performs one rehearsed,
forward-only rebuild of `sotuvchi_products`, preserving every existing column,
row, key and store constraint while adding the discriminator and conditional
scope check. No other business table is rebuilt.

Five tables hold foreign keys to the product record: order items, inventory,
inventory movements, buyer presentations and buyer comparisons. D1 correctly
refuses a parent drop while those references remain, even when enforcement is
deferred. Migration 0034 therefore copies those five bounded tables inside the
same atomic migration, removes them before the parent rebuild, then recreates
their exact constraints/indexes and copies every row back. Orders, sessions and
other aggregates are not rebuilt. The first production-shaped D1 rehearsal
failed at this boundary and was retained as evidence; the corrected sequence
then passed both SQLite and the local D1 runtime.

The migration is valid only when preflight proves:

- no foreign-key violations;
- every existing product has a matching store scope;
- migration ledger ends at the expected predecessor;
- the backup and isolated restore match production aggregates.

## Tenant and authority invariants

- A browser never writes D1 directly.
- Identity comes from verified Telegram `initData` or an existing server session.
- UI visibility and rollout flags grant no authority.
- Store writes re-check active membership for the exact organization/store.
- Private writes re-check the seller profile’s identity against the session.
- No client supplies an arbitrary target state.
- Lifecycle commands require `expectedVersion` and stable idempotency keys.
- Drafts, archived, rejected, restricted and removed listings are absent from
  global discovery.
- Audit rows contain identifiers and state transitions, not listing copy,
  contact data, report notes or reporter identity.

## Taxonomy, location and contact

- The global taxonomy is bilingual (Russian and Uzbek Latin), hierarchical and
  independent of store category trees. An explicit mapping connects a store
  category to one global category.
- Conditions are the closed set `new`, `like_new`, `good`, `fair`, `for_parts`,
  `not_applicable`; the domain validates the selected value against the global
  category’s allowlist.
- Public beta uses country `UZ`, structured region/district identifiers and an
  optional bounded locality hint. Exact coordinates and home addresses are not
  stored by this foundation.
- The first location seed is Tashkent city and its 12 districts, following the
  [official Tashkent city administration directory](https://tashkent.uz/uz/districts).
- Contact modes are `in_app`, `telegram_relay` and `phone_optional`. The record
  stores policy only, not a Telegram ID or phone. Contact disclosure requires a
  buyer action.

## Moderation and reports

New listings start `pending`. Low-risk post-moderation may be expressed by a
domain command that atomically records `approved`; suspicious/new-seller and
high-risk flows remain pending. Rejected, restricted and removed records fail
closed. AI may propose risk labels but has no irreversible command.

Reports use a closed reason catalog, a bounded optional note, a privacy-safe
rate scope and a private reporter identity/session reference. Reporter data is
never part of public projections. Moderator actions are append-only and
idempotent.

## Migration and rollout order

1. `0034`: seller profiles, nullable private scope and listing ownership.
2. `0035`: global taxonomy, store mapping and listing classification.
3. `0036`: Tashkent location references and listing contact/commerce policy.
4. `0037`: moderation, reports and moderation audit.
5. Deploy code with classifieds discovery and write flags off.
6. Run read-only postflight, then an owner/synthetic store-listing canary.
7. Enable read-only global discovery for the controlled cohort.
8. Enable private creation only after Telegram authority and native QuickPost
   ceremonies pass.

Each migration must pass a production-shaped isolated rehearsal, FK/integrity,
declared-index, uniqueness and representative `EXPLAIN QUERY PLAN` checks. There
are no hidden production writes in tests.

## Rollback and compensation

Before production apply, rollback is code-only because no production schema was
changed. After apply, new tables and the wider product scope are backward
compatible with the old store runtime; feature flags can stop all new paths.
Existing store rows are not rewritten semantically.

Once a private product exists, narrowing `sotuvchi_products` back to store-only
would destroy valid business data and is not an acceptable rollback. The
compensating action is to disable discovery/creation, unpublish through the
domain, preserve audit, and roll application traffic back to the previous
deployment while the wider schema remains.

## Consequences

- Positive: one listing lifecycle and media record; no fake store; explicit
  authority; bounded sensitive data; deterministic global discovery.
- Negative: one carefully rehearsed table rebuild; additional joins; store-only
  code must continue to filter by non-null store scope.
- Deferred: production taxonomy mapping, private creation UI, inquiry delivery,
  moderation UI, phone vault and real cohort activation are separate gated
  changes, not implied by this ADR.
