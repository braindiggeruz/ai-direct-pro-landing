# First-party automation runbook

This is a preparation and operating document. Commands are dry-run/read-only
unless an owner separately authorizes a production change. R0.3B remains the
current blocked stage.

## Components

- Pages Functions: admin JWT boundary and Queue producer.
- D1 `GPTBOT_DRAFTS_DB`: `automation_jobs` ledger and content-domain tables.
- `gptbot-automation` Worker: Queue consumer and Cron handler.
- `gptbot-automation-dlq`: exhausted/non-retryable references.
- Existing provider router: RU/UZ generation.
- AI Draft Inbox: only content sink, always manual review.
- Railway: optional compute arm; not used by the initial SEO handler.

The Worker `fetch` handler returns 404. It has no public command endpoint.
Pages sends a bounded reference directly through `AUTOMATION_QUEUE`.

## Local validation

```powershell
node --import tsx --test tests/automation-runtime.test.ts
node --import tsx --test tests/n8n-ingest-security.test.ts
node --import tsx --test tests/n8n-dependency-inventory.test.ts
npx wrangler deploy --dry-run --config wrangler.automation.toml
```

`wrangler deploy --dry-run` must be used exactly as shown. Do not remove
`--dry-run`. This task does not create a Queue, Worker, Cron, binding or D1
object.

## External provisioning sequence

Only after R0.3B credential and deployment-freeze gates pass:

1. Back up and verify the production D1 database.
2. Create the primary Queue and DLQ with the names in
   `wrangler.automation.toml`.
3. Apply migration `0024_first_party_automation.sql` using the approved
   migration ledger.
4. Deploy the Worker with D1, producer, consumer, DLQ and Cron bindings.
5. Add the Pages Queue producer binding.
6. Deploy Pages with `FIRST_PARTY_AUTOMATION_ENABLED=false`.
7. Run read-only status checks and one synthetic non-publishing controlled
   write only under a separately approved pilot.
8. Enable the first-party flag.
9. Observe a complete job reaching `awaiting_review`; verify a single
   `pending_review` draft and no GitHub write.
10. Pause the GitHub SEO scheduler before enabling the Worker Cron.
11. Perform the n8n retirement runbook. Do not infer retirement from a
    successful first-party job.

Each mutation requires its own owner authorization. The sequence is not
authorization.

## Producer contract

`POST /api/admin/automation/jobs` accepts exactly:

```json
{
  "job_type": "seo_draft_generation",
  "idempotency_key": "owner-selected-stable-reference",
  "request_ref": "seo_topic_plan_item:trusted-item-id"
}
```

The administrator is authenticated before the body is read. Tenant scope is
assigned server-side. Supported request references are:

- `seo_topic_plan_item:<id>`;
- `seo_schedule:default`.

No callback URL, provider URL, tenant ID, SQL, prompt or article body is
accepted. A duplicate idempotency key returns the existing job.

## Consumer behavior

1. Validate the exact four-field Queue schema.
2. Conditionally lease an eligible D1 job.
3. Reject a non-matching job type or tenant.
4. Load the trusted topic-plan reference from D1.
5. Generate with the job idempotency key as provider request identity.
6. Require both RU and UZ before ingest.
7. Validate and insert through `ingestRawBundle`.
8. Store only `ai_draft:<id>` as the result.
9. End in `awaiting_review`.

Provider failures are classified. Missing configuration, invalid source,
invalid output and incomplete locale pair are non-retryable. Transient
provider/network/rate-limit failures use `retry_wait`. The ledger max is
bounded to 10; the prepared default is 3.

Cancellation sets `cancel_requested`; a consumer cannot acquire a new lease.
An already-running provider call cannot be forcibly interrupted by D1 alone,
so each provider must retain bounded request timeouts. The terminal guard
prevents a late result from overwriting cancellation or another result.

## Monitoring

Use identifiers and codes only:

```sql
SELECT status, COUNT(*) AS jobs
FROM automation_jobs
GROUP BY status;

SELECT job_id, job_type, status, attempt_count, max_attempts,
       available_at, lease_expires_at, last_error_code, updated_at
FROM automation_jobs
WHERE status IN ('retry_wait', 'dead_letter')
ORDER BY updated_at DESC
LIMIT 50;
```

Do not put raw prompts, articles, credentials, phone numbers, Telegram
usernames, addresses or arbitrary payloads in logs, events or notifications.

## DLQ replay

Replay is an authenticated owner/admin action. Confirm:

- the source/reference still exists;
- the prior error is understood;
- no terminal draft already exists;
- the requested tenant matches trusted session context;
- the same domain idempotency key remains in force.

The replay transition resets attempts but does not replace the job ID or
idempotency key. A member role is denied with neutral not-found semantics.

## Railway boundary

No initial SEO step requires Railway: provider REST calls, D1 and validation
already run in Workers-compatible code. Add a Railway step only with measured
evidence that Worker limits or runtime compatibility block it.

If added, Cloudflare sends job ID, request ID, idempotency key and a bounded
domain reference over the existing internal gateway. Railway resolves tenant
authority from trusted job state, does not accept it from the body, and returns
a retry-safe reference. It never owns scheduling, lease, retry or terminal
state and never holds the original admin HTTP request open.

## Manual review and publication

`awaiting_review` is not published. The administrator reviews the AI Draft
Inbox. GitHub import remains a separate admin-authenticated operation.
Automation runtime code must not import the GitHub writer or call IndexNow.

## Incident response

- Pause Queue delivery; do not purge.
- Disable Worker Cron separately from the GitHub scheduler.
- Set `FIRST_PARTY_AUTOMATION_ENABLED=false`.
- Preserve D1 ledger/events and DLQ.
- Use the rollback runbook to return temporarily to the synchronous direct
  path, not automatically to n8n.
- Do not delete queues, rows, drafts or backups during diagnosis.
