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

Production release identifiers are appended after verification. No real campaign/message, paid Firecrawl request, contact import, reset of Telegram credentials/session, or budget increase is part of this update. A real first-send acceptance test still requires a selected consenting recipient and exact message approval. Privacy-hidden phones cannot be guaranteed resolvable; zero verified contacts is not turned into permission to message unverified numbers.
