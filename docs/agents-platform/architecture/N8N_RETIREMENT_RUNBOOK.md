# n8n retirement runbook

Status: **EXECUTED 2026-07-30 (R0.4)**. `N8N_DISPOSITION=RETIRED`.

What was actually observed is recorded in
[`N8N_RETIREMENT_EVIDENCE.md`](./N8N_RETIREMENT_EVIDENCE.md). This file is kept
as the standard the execution was held to, and as the rollback contract.

One deviation from the sequence below is recorded rather than hidden: step 4
("disable the production n8n workflow") could not be executed, because no n8n
control-plane credential exists. The workflow is documented as isolated instead
— the route it called is permanently `410`, its bearer is no longer read or
bound, and GPTBot no longer contains the n8n host, so neither direction can
carry traffic. §3 of the evidence file states this in full.

Retirement is an external, evidence-bearing security disposition. Repository
code, a disabled-by-default endpoint or a first-party dry run does not prove
that production n8n is retired.

## Preconditions

- R0.3 remains current and R0.3B remains blocked until all gates pass.
- The admin credential follows the complete **ROTATED** path. Admin retirement
  is forbidden.
- First-party replacement or documented manual fallback is verified.
- Production D1 backup and restoration evidence exists.
- Branch/tag stability, automation writers, Railway freeze and Cloudflare
  freeze are verified independently.
- Exact n8n workflows, webhook producers/consumers and schedules are
  inventoried. Unknown entries are resolved or explicitly block retirement.

## Acceptable credential dispositions

`n8n_ingest.disposition = rotated` requires all of:

- replacement generated;
- replacement installed;
- consumer restarted;
- consumer validated;
- old credential revoked;
- old credential rejected.

`n8n_ingest.disposition = retired` requires all of:

- all producers and consumers identified;
- production n8n workflow disabled;
- SEO scheduler disabled;
- automation writer disabled;
- old credential removed or revoked;
- old credential rejected;
- Cloudflare ingest no longer accepts it;
- missing/empty ingest secret fails closed;
- no production-critical job depends on n8n;
- first-party replacement or manual fallback exists;
- retirement validation recorded without credential material.

A generated replacement is not required for `retired`. The existing
DPAPI-protected record is retained as unused incident evidence until the owner
approves disposal. Its value or metadata must not be printed.

## Owner execution sequence

Every item is a separate external action and must be recorded by the owner-kit
closed-list action command.

1. Resolve every `production_activity: unknown` n8n producer/consumer in the
   inventory by inspecting the live control planes.
2. Pause the GitHub SEO scheduler. Record verifier evidence.
3. Disable other automation writers that can invoke the legacy endpoint.
4. Disable the production n8n workflow and any n8n-owned schedule.
5. Revoke/remove the legacy ingest credential in n8n and Cloudflare.
6. Keep `N8N_INGEST_ENABLED` false/absent. Confirm the endpoint is 404 when
   disabled.
7. In a controlled validation, confirm missing and empty binding fail closed
   when the legacy gate is deliberately enabled in an isolated environment.
8. Confirm the old credential is rejected without recording it in command
   history, output or evidence.
9. Verify the first-party manual trigger, Cron, Queue consumer, RU/UZ pair,
   one Draft Inbox record and manual review boundary.
10. Verify no GitHub write, IndexNow notification or auto-publish occurred.
11. Record `n8n_retirement_validation_verified`.
12. Run the deployment-freeze verifier. Retirement alone must not turn
    `OVERALL` to PASS.

Do not use a query parameter or shell argument for credential validation.
Use the provider's protected prompt/input mechanism and store only PASS/FAIL
evidence.

## Required evidence names

The owner kit accepts only closed-list actions:

- `n8n-inventory-verified`
- `n8n-workflow-disabled`
- `seo-scheduler-disabled`
- `automation-writer-disabled`
- `n8n-old-credential-revoked`
- `n8n-old-credential-rejected`
- `n8n-ingest-endpoint-disabled`
- `n8n-missing-binding-fail-closed`
- `n8n-no-critical-dependency-verified`
- `first-party-replacement-validated`
- `n8n-retirement-validation-verified`

Each action record contains a verifier command name, timestamp, operator and
redacted evidence path/status. A manually edited boolean is insufficient.

## Verification matrix

| Check | Expected |
| --- | --- |
| Legacy endpoint | 410 Gone, permanently — the handler is deleted, not gated |
| Any combination of stale `N8N_INGEST_ENABLED`/`N8N_INGEST_TOKEN` | 410; no revival path |
| Valid legacy bearer | 410 and zero draft rows written |
| 410 body and console | no credential, no request payload |
| First-party duplicate Queue delivery | one domain mutation |
| First-party SEO result | complete RU/UZ pair, `pending_review` |
| GitHub content commit | none |
| n8n workflow/schedule | disabled, verified externally |
| old credential | revoked and rejected |

## Rollback

If first-party automation fails before retirement validation completes:

- keep n8n disabled unless the owner explicitly chooses the `rotated` path;
- disable first-party producers/Cron while retaining D1 and Queue evidence;
- use manual topic-plan creation and manual Draft Inbox workflows;
- optionally use the existing synchronous direct generator after security
  review; it does not require n8n;
- do not restore a revoked credential;
- do not delete the DLQ, drafts, ledger or backups.

Re-enabling n8n requires a new credential, a complete ROTATED disposition,
explicit owner authorization and a new risk review. Retirement validation
must then be marked invalid; no status silently rolls back.

## Stop conditions

Stop and keep `n8n_ingest` incomplete if any producer/consumer remains
unknown, the old credential still works, the scheduler/writer remains active,
the legacy endpoint accepts the old credential, the replacement creates
duplicate or published content, or any freeze verifier is ambiguous.
