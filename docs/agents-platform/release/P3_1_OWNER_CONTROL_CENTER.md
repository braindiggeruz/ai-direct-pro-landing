# P3.1 Owner Control Center — PR implementation record

Date: 2026-07-30
Branch: `feature/p3.1-owner-control-center`
Status: implementation complete; feature branch only; not merged; not deployed.

## Scope

P3.1 adds an internal platform control surface under `/admin-tools/agents`.
It reuses the existing admin SPA and JWT issuer. It does not add a public
marketplace, seller impersonation, payment custody, escrow, automatic
publication, n8n, or a GitHub publication path.

The internal screens are:

| Screen | Route |
| --- | --- |
| Platform overview and runtime policy | `/admin-tools/agents` |
| Store/onboarding inventory | `/admin-tools/agents/stores` |
| Safe store detail | `/admin-tools/agents/stores/:storeId` |
| PII-minimized order projection | `/admin-tools/agents/orders` |
| Handoff state without conversation text | `/admin-tools/agents/handoffs` |
| First-party automation ledger and DLQ replay | `/admin-tools/agents/automation` |
| Append-only owner audit timeline | `/admin-tools/agents/audit` |
| Controlled pilot roster | `/admin-tools/agents/pilot` |

There are no public navigation links to these routes. GPTBot AI Market is a
disabled placeholder only.

## Authorization contract

All API handlers use the centralized, fail-closed `requirePlatformRole` guard.
Role and identity come only from the verified JWT. Store organization and
automation tenant are resolved on the server; request bodies cannot override
them.

| Caller | Read owner projections | Suspend/restore | Pilot activate/pause | DLQ replay |
| --- | ---: | ---: | ---: | ---: |
| no/malformed/expired/foreign token | no | no | no | no |
| unknown role / seller | no | no | no | no |
| `support_readonly` | yes | no | no | no |
| `platform_owner` | yes | yes | yes | yes |
| legacy `admin` | yes, mapped explicitly to `platform_owner` | yes | yes | yes |

The legacy alias is intentionally limited to the existing signed `admin` claim.
There is no wildcard or fallback role mapping.

## API inventory

| Method | Path | Minimum role |
| --- | --- | --- |
| GET | `/api/admin/agents/overview` | `support_readonly` |
| GET | `/api/admin/agents/stores` | `support_readonly` |
| GET | `/api/admin/agents/stores/:storeId` | `support_readonly` |
| POST | `/api/admin/agents/stores/:storeId/suspend` | `platform_owner` |
| POST | `/api/admin/agents/stores/:storeId/restore` | `platform_owner` |
| GET | `/api/admin/agents/orders` | `support_readonly` |
| GET | `/api/admin/agents/handoffs` | `support_readonly` |
| GET | `/api/admin/agents/automation` | `support_readonly` |
| POST | `/api/admin/agents/automation/replay` | `platform_owner` |
| GET | `/api/admin/agents/audit` | `support_readonly` |
| GET/POST | `/api/admin/agents/pilot` | read: `support_readonly`; write: `platform_owner` |

Listings have bounded pagination and closed-list filters. Unknown mutation
fields are rejected. Mutation bodies are limited to 2 KiB.

## High-impact operation contract

Every mutation requires a closed-list reason and a bounded idempotency key.
Store suspension, pilot activation/pause, and DLQ replay additionally require
the operator to type the exact target ID. The UI provides the workflow, but
every condition is independently enforced by the server.

The same idempotency key may replay only the same actor/action/target/org/reason
tuple. Reusing it for another logical operation returns
`409 idempotency_conflict`.

## Audit model and migration

Additive migration `migrations/0025_owner_control_center_audit.sql` creates:

- `owner_audit_events`, an append-only application table with a globally unique
  idempotency key;
- `owner_pilot_stores`, a versioned per-store pilot state;
- indexes for event time, target, actor, and pilot state.

Audit rows contain only actor email/role, closed action and reason tokens,
target/org references, request ID, idempotency key, timestamp, and allowlisted
before/after metadata. The metadata is bounded to 2 KiB in application code and
the database. Passwords, JWTs, headers, cookies, raw Telegram messages,
conversation text, buyer contact data, and arbitrary request bodies have no
audit column or projection.

Audit insert and domain transition are one D1 batch. The domain write depends
on the newly generated audit event ID. A state/version conflict therefore
creates neither a domain effect nor a ghost audit. Duplicate requests have one
logical effect and one audit row.

Automation replay commits the audit row, guarded job transition, and
`dlq_replayed` ledger event atomically, then sends the bounded queue reference.
If queue delivery fails, the committed `queued` row remains recoverable by the
scheduled first-party dispatcher. A duplicate API request does not send again.

## Verification

The dedicated behavioral suite passes `66/66` and exercises
authentication, role boundaries, PII-minimized projections, tenant override
rejection, bounded input, confirmations, exactly-once audit behavior, atomic
rollback, pilot invariants, DLQ replay, legacy admin compatibility, and absence
of public marketplace/payment surfaces.

The complete local repository corpus passes `922/922` across 36 suites.
Functions and SPA TypeScript checks, scoped lint, production build, Pages
Functions build, backend typecheck/build, migration rehearsal, route parity,
architecture boundaries, repository secret scan, and built-asset credential
scan pass.

## Deployment prerequisites

P3.1 is not authorized for deployment by this record. A later reviewed release
must, in order:

1. merge an approved PR without bypassing branch protection;
2. take and verify a D1 backup;
3. apply migration `0025` to the intended non-production environment first;
4. run migration bootstrap and synthetic upgrade checks;
5. verify JWT issuer/secret, D1, Queue, and first-party automation bindings;
6. run owner authorization, audit, tenant, Sotuvchi, order/inventory, and
   automation smoke suites;
7. verify Cloudflare and Railway deployment policy before any production
   action;
8. perform a separate, explicitly authorized production rollout.

Do not re-enable the SEO scheduler, n8n, automatic publication, Cloudflare
auto-deploy, or Railway auto-deploy as part of P3.1.

## Rollback

Before production, rollback is simply abandoning/reverting the feature branch;
no remote migration has been applied. After a future authorized deployment:

1. pause owner mutations and the R1 pilot;
2. roll back the application to the last reviewed release;
3. retain `owner_audit_events` and `owner_pilot_stores` for evidence;
4. do not drop migration `0025` tables;
5. reconcile queued automation jobs through the first-party runtime;
6. investigate by `request_id` and audit event ID before resuming.

Tenant isolation failure, PII leakage, duplicate order/inventory effects, or an
unauthorized mutation is a hard stop, not a routine retry.

## Explicit state

```text
P3.1_IMPLEMENTATION=COMPLETE
P3.1_TESTS=PASS
P3.1_FEATURE_BRANCH=PUSHED
P3.1_MERGED=NO
P3.1_DEPLOYED=NO
MIGRATION_0025_APPLIED_REMOTE=NO
R1_PILOT_STARTED=NO
AGENTS_BOT_CREATED=NO
MARKETPLACE_LAUNCHED=NO
N8N=RETIRED
AUTO_PUBLICATION=DISABLED
```
