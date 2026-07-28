# First-party automation test evidence

Prepared and verified on 2026-07-28.

| Suite | Tests | Evidence |
| --- | ---: | --- |
| `tests/automation-runtime.test.ts` | 13 | duplicate enqueue/delivery, retry, first terminal result, lease expiry, cancellation, concurrent consumers, DLQ/replay auth, tenant isolation, closed/bounded Queue payload, content-free events, RU/UZ manual-review adapter |
| `tests/n8n-ingest-security.test.ts` | 6 | disabled/missing/empty binding, missing/empty/invalid/oversized bearer, undefined bypass, auth-before-body, replay idempotency, no secret/payload logging |
| `tests/n8n-dependency-inventory.test.ts` | 3 | tracked literal coverage, unknown visibility, names-only inventory |

Targeted result: **22/22**.

Additional verified gates:

- external protected owner evidence policy: **6/6**;
- release preparation: **20/20**;
- required Agents baseline: **584/584**;
- full repository file-by-file: **762/762 across 32 suites**;
- repository secret scan: clean across 2503 files;
- scoped ESLint and architecture boundary checker: pass;
- root typecheck/build: pass;
- Railway `npm ci`, typecheck, build and production audit: pass, zero findings;
- Functions comparison: exactly 27 prior errors in the same 6 legacy files;
- migration and backup/restore rehearsals: pass on isolated synthetic data;
- Git integrity and diff checks: pass.

The Worker bundle is also compiled using
`wrangler deploy --dry-run --config wrangler.automation.toml`; dry-run exits
after bundling D1, Queue and DLQ bindings, without creating or updating a
Cloudflare resource.

Production validation is intentionally absent. No Queue, Worker, Cron,
binding, migration, secret, webhook, n8n workflow or pilot was changed.
