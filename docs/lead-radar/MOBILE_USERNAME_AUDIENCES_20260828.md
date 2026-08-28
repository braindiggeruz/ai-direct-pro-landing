# Mobile / Telegram audiences — 2026-08-28

## Delivered behavior

- The all-search directory includes normalized mobile phones OR public Telegram usernames. A mobile is a research candidate, never proof that Telegram exists. Fixed/service/invalid numbers and known bot/group/personal usernames do not qualify by themselves.
- One button walks every filtered page, deduplicates and saves the selection. It creates an audience when needed. Up to 500 research contacts; overflow fails visibly without a partial save. Cross-search DNC/conflicts/history apply before filters. Existing audiences remain intact.
- Source, mobile/username, review status and corporate proof are visible together. Status filters cover the full result set. Directory status refreshes every 30 seconds while visible; selection is not overwritten.
- Campaigns remain limited to 50. Prepare and create use the exact same captured subset, not all 500 selected contacts. Previously contacted/uncertain/conflicting contacts are omitted from fresh audience batches. A new draft omits its previous prepared batch locally; saved audience membership remains available for review.
- A regular Telegram account without public username can use an opaque `lrpeer:` handle. Actual Telegram id/access_hash remain in the Windows DPAPI vault, tied to account and auth session, with 24-hour expiry and 500-entry cap. Persistence precedes acknowledgment. Logout clears them. No invented public link is produced.
- Gateway and Bridge version 1.5 retain legacy username support. Sending opaque handles requires Bridge >=1.5. Source ownership, account binding, fresh resolution, documented per-contact authorization, DNC/history, paid-message rejection and delivery ledger still gate dispatch.
- Pending contact jobs no longer silently become completed after timeout or when an account/binding is absent. They retain an explicit wait reason and become attention-required/dead-letter after the bounded window. They do not restart paid website parsing.
- Failed Firecrawl reservation diagnostics distinguish daily/search/domain/company limits, lease loss and reservation conflicts. No cap was raised; uncertain reservations are not refunded or retried blindly.

## Compatibility and validation

0053 is additive: full selection + selection version columns. The old <=50 member snapshot remains for old readers. If an old writer changes the audience version, readers fall back to the legacy snapshot instead of resurrecting stale extended membership. Campaign snapshot table and 50-recipient constraints are unchanged.

Validated locally: all 29 Lead Radar test files passed, including real SQLite/D1 guards and a 50-recipient campaign from a 60-contact audience; 50 Python Bridge tests passed; typecheck, full ESLint, secret scan (3962 files), main/admin production build and both Worker dry-runs passed.

Browser fixture (network sending disabled): 63 synthetic contacts, one click selected 60 across pages; reload retained all 60; global review filter returned 30 across two pages; composer text stayed editable; no browser errors. Checkbox labels, keyboard traversal and 44x44 hit targets inspected. The a11y static scanner's page-level main/h1/skip-link and explicit-live/fieldset warnings were reviewed in context: these are nested components, status/alert roles have implicit live semantics, and table/caption/row labels supply the checkbox grouping. This is scoped validation, not a claim of a full site WCAG certification.

## Release / limits

Released to production on 2026-08-28:

- Runtime code: `da3e03a20c3fa3be06e181122db73085ac8ff940`.
- D1 migration `0053_lead_radar_audience_selection.sql` applied and ledgered.
- Automation Worker: `bd6452fb-46b6-4a6a-8207-5ae32f419e83`.
- Telegram gateway: `ea3c7eff-8cb6-4673-a84c-ed187701c96c`.
- Pages main: `5beea596-a02e-4423-bb2e-b012c177f1bf`; deployment API confirmed success and the runtime commit. Production admin asset matched the local build hash.
- Local Windows Bridge 1.5.0 installed; self-test and package checks passed. Paired state, vault health, URI handler and running scheduled task confirmed. Fresh gateway logs showed successful Bridge polls after restart. No session/vault reset.
- Production schema audits passed. The directory contained 37 unique groups; first-page statuses were 13 review, 6 conflict and 1 verified. These are not 37 send-ready recipients. No active jobs/campaigns/effects were reported at verification time. Login returned 200; unauthenticated private APIs returned 401 with no-store.

No real campaign/message, paid Firecrawl request, contact import, reset of Telegram credentials/session, or budget increase was part of this update. A real first-send acceptance test still requires a selected consenting recipient and exact message approval. Privacy-hidden phones cannot be guaranteed resolvable; zero verified contacts is not turned into permission to message unverified numbers.

## Remaining broader roadmap work

This release delivers the mobile-or-username selection and compatible recipient pipeline; it does not claim every item in the wider roadmap is complete. Additional source/search/date filters, a group authorization form, explicit operator resume for historical budget-limited enrichment, cross-search enrichment-cache reuse, and a pre-search remaining-budget display remain follow-up work. Historical limited/unknown jobs were not rewritten or automatically retried. Full unification of every legacy card's readiness display and a live owner-approved first-send acceptance test remain separate checks.
