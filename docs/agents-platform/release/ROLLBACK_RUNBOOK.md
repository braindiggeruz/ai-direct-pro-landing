# R1 rollback runbook

This is an approval-time decision tree. It does not contain destructive
migration SQL and does not authorize a production change.

## Stop conditions

Stop the pilot and escalate immediately for cross-tenant visibility, wrong bot
identity, invalid webhook authentication, incorrect order totals, inventory
underflow, PII entering analytics, repeated provider authentication failures,
or an unrecoverable schema mismatch.

## Decision tree

1. **Static/site regression only**
   - Stop new rollout traffic.
   - Select the last verified Git release candidate.
   - Roll Cloudflare Pages back to its last known-good deployment.
   - Re-run read-only route and security smoke checks.
2. **Railway backend regression only**
   - Stop new rollout traffic.
   - Use Railway deployment rollback to the last verified backend artifact.
   - Validate `/health`, gateway authentication, CORS, and read-only chat paths.
3. **Telegram webhook/identity regression**
   - Stop the pilot.
   - Do not redirect Agents traffic to Lead or Javob.
   - Restore only the previously approved Agents webhook configuration after
     exact `getMe` identity verification.
   - Re-run webhook status and signature checks before resuming.
4. **D1 migration or data-integrity incident**
   - Stop all writes.
   - Preserve the incident database and logs.
   - If no post-migration production writes exist, restore the approved
     pre-migration D1 export into the owner-approved recovery target.
   - If writes exist, prefer a reviewed forward fix or controlled data repair.
     Never run guessed destructive schema/data statements or reverse column
     changes.
   - Validate checksums, `PRAGMA integrity_check`, tenant boundaries, and
     application schema compatibility before routing traffic.

## Git and release history

Do not rewrite shared history as a rollback mechanism. R0.3B is a one-time
credential-incident remediation with its own executor. Normal R1 code rollback
uses an explicit reviewed revert or provider deployment rollback.

## Ownership and evidence

The release owner records the trigger, affected component, last known-good
artifact, backup identifier, decision, timestamps, validation results, and
resume approval. Security owns credential/webhook incidents; platform owns
Cloudflare and D1; backend owns Railway; the Sotuvchi product owner approves
pilot resumption.
