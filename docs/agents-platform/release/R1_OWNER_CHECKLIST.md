# R1 owner checklist

Nothing is pre-approved or pre-checked.

- [ ] R0.3 credential incident is complete: replacements installed, old
  credentials revoked, and both real consumers validated.
- [ ] R0.3B remote rewrite completed through the gated executor.
- [ ] A fresh canonical clone is clean and all rewritten refs match the
  allowlisted manifest.
- [ ] Production environment contract passes without printing values.
- [ ] Root dependency audit is clean, or the exact temporary RSC-only
  reachability decision has been re-reviewed before its review-by date.
- [ ] D1 export is complete, checksum recorded outside Git, and restore owner is
  present.
- [ ] Migrations 0013–0023 checksums and ordered production application are
  explicitly approved.
- [ ] Cloudflare and Railway deployment artifacts/triggers are approved.
- [ ] Agents bot username is known, syntactically valid, and not a protected
  Lead/Javob identity.
- [ ] Agents webhook mutation is explicitly approved after exact `getMe`
  identity verification.
- [ ] Isolated pilot tenant and pilot users are named; no real production order
  is created by automation.
- [ ] Rollback owner, last known-good artifacts, incident channel, stop
  conditions, and restore decision tree are acknowledged.
