# R1 owner checklist

Nothing is pre-approved or pre-checked.

- [ ] R0.3 credential incident is complete: replacements installed, old
  credentials revoked, and both real consumers validated.
- [ ] R0.3B remote rewrite completed through the gated executor.
- [ ] A fresh canonical clone is clean and all rewritten refs match the
  allowlisted manifest.
- [ ] Production environment contract passes without printing values.
- [ ] Root dependency audit is clean, or the exact temporary RSC-only
  reachability decision has been re-reviewed before its review-by date and an
  isolated React Router 8 migration spike has resolved the R1 blocker.
- [ ] D1 export is complete, checksum recorded outside Git, and restore owner is
  present.
- [ ] Migrations 0013–0024 checksums and ordered production application are
  explicitly approved.
- [ ] Cloudflare Queue, DLQ, Worker, Cron and Pages producer bindings are
  created from the approved names-only contract.
- [ ] A controlled first-party job proves duplicate-safe RU/UZ Draft Inbox
  creation, `pending_review`, DLQ observability and no automatic publication.
- [ ] n8n has a complete owner-verifiable disposition: fully ROTATED or fully
  RETIRED. A generated replacement or repository flag alone is insufficient.
- [ ] GitHub SEO scheduler, every automation writer and the production n8n
  workflow are disabled before a RETIRED disposition is accepted.
- [ ] Cloudflare and Railway deployment artifacts/triggers are approved.
- [ ] Agents bot username is known, syntactically valid, and not a protected
  Lead/Javob identity.
- [ ] Agents webhook mutation is explicitly approved after exact `getMe`
  identity verification.
- [ ] Isolated pilot tenant and pilot users are named; no real production order
  is created by automation.
- [ ] Rollback owner, last known-good artifacts, incident channel, stop
  conditions, and restore decision tree are acknowledged.
