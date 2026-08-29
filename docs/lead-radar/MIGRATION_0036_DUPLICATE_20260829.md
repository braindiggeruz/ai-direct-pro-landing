# Duplicate migration number 0036 — resolution note (2026-08-29)

Two files share the numeric prefix `0036`:

- `migrations/0036_lead_radar.sql` — Lead Radar foundation (searches, companies, evidence).
- `migrations/0036_classifieds_location_contact.sql` — Bormi classifieds locations/channels.

## Why this is tolerated

Production migrations are applied by `wrangler d1 migrations apply`, whose
`d1_migrations` ledger keys on the **full file name**, not the numeric prefix
(confirmed by the ledger reconciliation practice in
`scripts/d1/reconcile-ledger-0026-0030.sql`). Both files therefore apply and
record independently; the duplicate prefix is cosmetic, not a correctness bug.

## Why neither file is renamed

Renaming an already-applied file makes the runner treat it as a brand-new
migration and re-execute it. `0036_classifieds_location_contact.sql` uses bare
`CREATE TABLE`/`INSERT` (no `IF NOT EXISTS`/`OR IGNORE`), so re-execution would
abort on existing objects and block the batch. Whether each file has already
been applied cannot be proven from the repo alone, so the safe direction is to
leave both names untouched.

## Rule going forward

Before adding a migration, pick the next free **prefix** (`ls migrations/ | tail`),
not just a free file name. New lead-radar work continues at `0054`.
