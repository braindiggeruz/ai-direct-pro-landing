# Classifieds migration rehearsal

- Date: 2026-08-04
- Scope: migrations `0034` through `0037`
- Production writes: **0**
- Production migration status: **not applied**
- Rollout flags: discovery **off**, private writes **off**

## Result

The four forward migrations pass against an isolated, production-shaped restore
and the local Cloudflare D1 engine. The verified restore was copied for every
attempt; the source restore was never modified.

| Check | Before | After | Result |
| --- | ---: | ---: | --- |
| Migration ledger | 33 | 37 | PASS |
| Canonical listing records | 48 | 48 | PASS |
| Store-scoped existing listings | 48 | 48 | PASS |
| Orders | 1 | 1 | PASS |
| Order items | 1 | 1 | PASS |
| Inventory rows | 44 | 44 | PASS |
| Global categories | 0 | 9 | PASS |
| Regions | 0 | 1 | PASS |
| Districts | 0 | 12 | PASS |
| Foreign-key violations | 0 | 0 | PASS |
| SQLite/D1 quick check | ok | ok | PASS |

Product snapshots before and after the central-table rebuild are identical for
all pre-existing columns. The rehearsal also proves:

- exactly one active listing owner is permitted;
- a private listing cannot carry an organization or store;
- a private listing cannot be inserted into store inventory/order relations;
- discovery returns only `published` + `approved` listings with active seller,
  taxonomy and location relations;
- moderation audit rows cannot be updated or deleted;
- report rate limiting is enforced in the database by proven identity, so a
  session refresh or concurrent request cannot bypass the five-per-hour cap;
- all declared tables, indexes and triggers exist;
- representative discovery uses declared indexes. The bounded result still
  uses a temporary B-tree for its deterministic final ordering; this is a
  measured performance item, not an integrity failure.

## Rehearsal history

The first D1-shaped attempt at `0034` failed atomically when the parent product
table was rebuilt while five foreign-key child tables still existed. No source
or production database changed. The migration was corrected to copy and remove
those five bounded child tables inside the same transaction, rebuild the parent,
then recreate the exact child schemas/indexes and restore their rows. The
corrected sequence passes both SQLite and local D1.

This failed attempt is intentionally recorded: it is evidence that the D1
foreign-key behavior was exercised rather than inferred from SQLite alone.

## Forward plan

1. Keep both classifieds flags false in the deployed artifact.
2. Immediately before any production apply, re-run exact-SHA preflight and
   confirm that the ledger predecessor is still `0033` and FK count is zero.
3. Capture a fresh D1 Time Travel bookmark and record only its presence in
   public evidence; do not publish the raw bookmark.
4. Apply `0034`, `0035`, `0036`, and `0037` in order without editing them.
5. Run read-only postflight counts, `foreign_key_check`, integrity check and
   ledger verification.
6. Deploy the same exact SHA with both flags still false.
7. Canary read-only discovery before any private write is enabled.

`TIME_TRAVEL_BOOKMARK=REQUIRED_BEFORE_PRODUCTION_APPLY`

`CURRENT_BOOKMARK_STATUS=NOT_CAPTURED`

`BLIND_APPLY=FORBIDDEN`

## Compensation and rollback

Before production apply, rollback is code-only because production schema is
unchanged. After apply, the wider schema is backward compatible with the store
runtime and both new paths can be stopped with feature flags.

Once a valid private listing exists, dropping the new schema or narrowing the
canonical product table would destroy business data and is forbidden. The safe
compensation is:

1. disable private creation and discovery;
2. unpublish affected listings through a domain command;
3. preserve reports and append-only audit;
4. route traffic to the previous application deployment;
5. diagnose and forward-fix the schema without direct lifecycle SQL.

D1 Time Travel is the disaster-recovery path for migration corruption before
new valid writes exist. It is not a substitute for domain compensation after
users have created listings.

## Gate status

`SCHEMA_REHEARSAL=PASS`

`D1_ENGINE_REHEARSAL=PASS`

`PRE_POST_COUNTS=PASS`

`INDEX_FK_UNIQUENESS=PASS`

`PRODUCTION_APPLY=NOT_STARTED`

`PRODUCTION_WRITES=0`
