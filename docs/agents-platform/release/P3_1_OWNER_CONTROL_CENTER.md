# P3.1 Owner Control Center — production release record

Date: 2026-07-30

Feature head: `3d646b95d74e4f84965ea727dcba0a10bbb93bc8`

Merge commit: `9629db58e6b7ec334b680acad053fce161d05137`

Status: reviewed, merged, migrated, manually deployed and canary-verified.

## Scope

P3.1 adds an internal control surface under `/admin-tools/agents`:

| Screen | Route |
| --- | --- |
| Platform overview | `/admin-tools/agents` |
| Store inventory | `/admin-tools/agents/stores` |
| Safe store detail | `/admin-tools/agents/stores/:storeId` |
| PII-minimized orders | `/admin-tools/agents/orders` |
| Content-free handoff status | `/admin-tools/agents/handoffs` |
| First-party automation and DLQ replay | `/admin-tools/agents/automation` |
| Append-only owner audit | `/admin-tools/agents/audit` |
| Controlled pilot roster | `/admin-tools/agents/pilot` |

It does not add a public marketplace, seller impersonation, payment custody,
escrow, automatic publication, n8n or a GitHub publication writer.

## Independent review and fixes

The final review found and fixed three release defects:

1. pagination offset is now bounded to `0..100000`;
2. `support_readonly` can use the shared admin shell and Owner reads but cannot
   cross into legacy SEO-admin reads or mutations;
3. the reintroduced retired n8n runtime field was removed from the Owner
   overview API, UI and tests.

Final review verdict:

```text
AUTHENTICATION=PASS
AUTHORIZATION=PASS
LEGACY_ADMIN_BOUNDARY=PASS
TENANT_ISOLATION=PASS
AUDIT_SAFETY=PASS
IDEMPOTENCY=PASS
MIGRATION_SAFETY=PASS
NO_IMPERSONATION=PASS
NO_N8N=PASS
NO_AUTO_PUBLICATION=PASS
NO_PUBLIC_MARKETPLACE=PASS
```

## Authorization and mutation contract

| Caller | Owner reads | Owner mutations | Legacy SEO admin |
| --- | ---: | ---: | ---: |
| no/malformed/expired/wrong-issuer token | no | no | no |
| seller or unknown role | no | no | no |
| `support_readonly` | yes | no | no |
| `platform_owner` | yes | yes | yes |
| signed legacy `admin` | mapped explicitly to `platform_owner` | yes | yes |

The legacy JWT contract has no audience claim. It verifies HS256, the
`gptbot-seo-admin` issuer, expiry and required email/role claims.

Every mutation requires a closed-list reason and a bounded idempotency key.
Suspension, pilot activation/pause and DLQ replay also require exact typed
confirmation. Request bodies cannot override organization or automation
tenant authority.

## Migration and audit

Migration `0025_owner_control_center_audit.sql` is additive and creates only:

- `owner_audit_events`;
- `owner_pilot_stores`;
- four named indexes.

It contains no `DROP` or `ALTER`. Audit metadata is allowlisted and limited to
2 KiB in the application and D1. Audit insert and domain transition are one
guarded D1 batch. A duplicate logical operation has one effect and one audit
event; reusing its idempotency key for a changed logical operation returns
`409 idempotency_conflict`.

## Verification

- Owner Control Center tests: `69/69`.
- Full repository: `925/925` across 36 suites.
- Post-merge critical corpus: `151/151`.
- TypeScript: root and Functions gates pass.
- Scoped ESLint, production root build, Pages Functions build, backend
  typecheck/build and both production dependency audits pass.
- Route parity: `26/26`; exactly eight protected Owner routes, zero public or
  static route delta.
- Exact merged build: 111 pages, 109 articles, sitemap 223.
- Repository and built-asset credential scans pass.

## Production release

- Fresh verified backup:
  `F:\Claude\gptbot-p3.1-production-backups\20260730-p3.1-pre0025-9629db5`.
- Backup SHA-256:
  `2B50D4388B9D9AC458B0AC195B2FBBAEDCDFF686347FEBB2CEFC0D1E61A093F4`.
- Restored SQLite integrity check: `ok`.
- Only migration `0025` was pending and applied. D1 advanced from 67 to 69
  tables and from 98 to 102 named indexes; no migration remains pending.
- Manual exact-source Pages deployment:
  `20d4c6e2-a69f-489a-b662-2d59122ac8ed`.
- Immutable URL:
  `https://20d4c6e2.ai-direct-pro-landing.pages.dev`.
- Canonical URL: `https://gptbot.uz`.

Production canaries verified owner/support/seller/unknown roles, token expiry
and issuer, legacy-admin separation, all Owner read routes, mutation
validation, tenant override rejection, store and pilot lifecycle,
idempotency, exactly-once bounded audit, Queue/Worker replay, KV lockout
persistence, the retired `410` endpoint and fail-closed Agents webhook.

All synthetic operational rows were removed by exact ID. Five bounded P3.1
audit events remain as release evidence. Existing production draft rows were
unchanged and no draft was published.

The built-in browser webview did not attach. UI evidence is therefore exact
production asset identity, eight live SPA routes, route/role/loading/error
behavior tests and API enforcement; no visual browser run is claimed.

## Freeze and rollback

Cloudflare Pages automatic deployments remain disabled, Railway's GitHub
trigger remains disconnected and the GitHub SEO scheduler remains
`disabled_manually`. n8n remains retired and automatic publication remains
disabled.

The rollback checkpoint is Pages deployment
`7fd0e9df-c782-4cc3-a3c4-5ed7270666b0` at source
`5d4c7e8d1db036e4c04f1a7413b4e442aecc99f0`, plus the verified pre-0025 D1
export. A code rollback must retain the additive audit/pilot tables and audit
evidence; do not drop migration `0025`.

## Explicit state

```text
P3.1_IMPLEMENTATION=COMPLETE
P3.1_TESTS=PASS
P3.1_MERGED=YES
P3.1_DEPLOYED=YES
MIGRATION_0025_APPLIED_REMOTE=YES
PRODUCTION_CANARIES=PASS
SYNTHETIC_OPERATIONAL_ROWS_REMAINING=0
R1_PILOT_STARTED=NO
AGENTS_BOT_CREATED=NO
MARKETPLACE_LAUNCHED=NO
N8N=RETIRED
AUTO_PUBLICATION=DISABLED
```
