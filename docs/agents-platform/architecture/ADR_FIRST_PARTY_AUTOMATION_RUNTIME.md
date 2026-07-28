# ADR: first-party automation runtime

Status: accepted for local preparation; production cutover is not authorized.

Date: 2026-07-28.

## Context

The repository has two SEO paths. The legacy path forwards a request to n8n
and can hold an HTTP request open for minutes. The repository-default path
already generates through the internal multi-provider LLM router and writes a
strict `pending_review` bundle to the AI Draft Inbox without n8n. Scheduling,
job ownership, retries and compatibility status are nevertheless spread
across Pages Functions, GitHub Actions, an n8n control plane and n8n-named D1
columns.

No executable n8n consumer was found outside SEO automation. Public pages, GPT
Chat, Javob, Tahlil, Agents/Sotuvchi and unrelated Admin routes do not import
the n8n bridge. The only repository GitHub content writer in this flow is the
separate, admin-authenticated draft import operation. Generation and ingestion
force manual review and do not auto-publish.

Production activity is deliberately not inferred from tracked files. The
enabled state of the GitHub scheduler, the direct/legacy feature flag, n8n
workflows and live requests remains unknown until an owner performs the
retirement verification.

## Decision drivers

- One orchestration source of truth.
- At-least-once delivery with domain idempotency, never an exactly-once claim.
- No public secret-bearing callback or arbitrary URL.
- No raw prompts, article bodies, credentials or personal data in queue
  messages, job events, analytics or notifications.
- Keep the existing D1 and Railway backend; do not add Redis, Postgres or
  another paid SaaS without evidence.
- Preserve the AI Draft Inbox, manual review and separate manual publication.
- Minimize always-on processes and control planes.

## Options

| Dimension | A. Cloudflare-first | B. Railway-first | C. Temporary n8n |
| --- | --- | --- | --- |
| Components | Pages trigger, D1 ledger, Queue/DLQ, Worker consumer, Cron; Railway only for incompatible compute | Railway cron/background process, existing backend, D1 gateway | Existing Pages bridge, GitHub cron, n8n workflow, D1 |
| Source of truth | D1 `automation_jobs` | D1 must remain authoritative or a second database appears | Split between D1 job row and n8n execution |
| Retries | Queue delivery plus explicit D1 classification | Application loop/service supervisor | n8n policy plus bridge retry |
| Idempotency | Unique tenant/type/key and result reference; provider key derived from job key | Must reproduce the same contract across HTTP | Workflow/execution semantics are external and partly opaque |
| Scheduling | Cloudflare Cron enqueues due work | Railway cron | GitHub Actions plus n8n schedule possibilities |
| Observability | Code-only D1 events and Queue metrics | Railway logs plus D1 | Pages, GitHub and n8n views |
| DLQ/replay | Bound DLQ; owner/admin replay only | Custom table/loop required | n8n execution replay |
| Human approval | AI Draft Inbox remains terminal `awaiting_review` | Same if carefully preserved | Existing inbox |
| Secret surface | Provider secrets and optional Cloudflare→Railway gateway only | Cloudflare→Railway plus provider secrets | n8n ingest and webhook secrets plus provider secrets |
| Tenant isolation | Trusted tenant assigned at auth boundary; queue message has no authority | Must be re-established at gateway | Workflow payload can become an authority risk |
| Operational complexity | One primary Cloudflare plane plus compute arm | Adds an always-on/background deployment concern | Three automation/control planes |
| Vendor lock-in | Cloudflare Queue/D1 APIs, isolated behind platform modules | Railway process model and gateway | n8n workflow format and UI |
| Cost model | Scale-to-zero Workers/D1 plus Queue operations; no traffic volume assumed | Existing Railway service may need more runtime resources | Separate n8n subscription/operations plus existing platforms |
| Migration effort | Medium; direct generator already exists | Medium/high; move orchestration and provider code | Low now, recurring operational burden |
| Rollback | Pause producer/consumer; retain legacy code during bounded window | Stop background service and return to direct synchronous path | Current state |
| Principal failures | duplicate delivery, expired lease, provider rate limit, queue backlog | process restart, cron overlap, gateway outage | workflow disabled/drift, long request timeout, secret drift |

### Verified platform constraints

Cloudflare documents Queue delivery as **at least once** and explicitly advises
idempotency keys for duplicate-safe mutations:
<https://developers.cloudflare.com/queues/reference/delivery-guarantees/>.
Queue messages are limited to 128 KB, consumers to 15 minutes wall time, and
retries to 100; this design intentionally caps its own message at 2 KB and
puts only references in it:
<https://developers.cloudflare.com/queues/platform/limits/>.
Queue pricing is operation-based, normally write/read/delete per delivered
message, with retries adding reads; no traffic volume is assumed here:
<https://developers.cloudflare.com/queues/platform/pricing/>.

D1 is scale-to-zero and bills by rows read/written and storage. An individual
database is single-threaded, so indexed, conditional lease updates are used
instead of wide scans:
<https://developers.cloudflare.com/d1/platform/pricing/> and
<https://developers.cloudflare.com/d1/platform/limits/>.
Pages officially supports Queue producer bindings, so the authenticated Pages
route can enqueue without a public Worker command endpoint:
<https://developers.cloudflare.com/pages/functions/bindings/#queue-producers>.
Service bindings remain an option for internal Worker RPC and do not require a
public URL, but are unnecessary for the initial enqueue path:
<https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/>.

Workflows is not the default. It is reserved for a future pipeline that proves
it needs durable sleeps/events or independently retried long-running steps.
Cloudflare's published limits permit long wall-clock steps and durable waits,
but add a separate state/step cost model:
<https://developers.cloudflare.com/workflows/reference/limits/> and
<https://developers.cloudflare.com/workflows/reference/pricing/>.

## Decision

Choose **A, Cloudflare-first**.

The initial runtime is Queue + D1 state machine. Pages authenticates the admin
before enqueue. A standalone Worker leases the D1 job, invokes a closed-list
handler, and writes only a result reference. Cron re-enqueues due jobs and
creates one idempotent scheduled SEO job per UTC date. A bounded DLQ receives
exhausted/non-retryable messages. Railway remains a compute arm only if a
measured step is incompatible with Workers or cannot fit the Worker limits.

The Worker exposes no public command API. The Pages Queue producer binding is
the boundary. If a later Railway step is needed, it receives a trusted job
identity, request ID and idempotency key from D1, never tenant authority from
the body, and it returns a retry-safe result without owning orchestration.

## State machine and invariants

```text
queued -> leased -> running -> awaiting_review -> completed
                      |              |
                      +-> retry_wait-+
                      +-> dead_letter
queued/leased/running/retry_wait -> cancelled
```

- Delivery and execution are at least once.
- `(tenant_key, job_type, idempotency_key)` is unique.
- A conditional update grants one unexpired lease. Takeover is possible only
  at/after expiry.
- Replay detection happens at the lease/terminal guard before a handler runs.
- First terminal result wins; retries cannot replace it.
- Queue schema and job types are closed lists.
- Queue messages contain schema, job ID, job type and delivery ID only.
- Job events contain identifiers, event type, attempt count and error code
  only.
- No callback URL, provider URL, SQL, secret, raw prompt or article content is
  accepted by the runtime contract.
- Tenant scope is assigned server-side. Tenant lookup returns neutral
  not-found.
- DLQ replay requires authenticated owner/admin authority.
- The SEO handler requires an RU/UZ pair before creating a reviewable result.
- Content is written only to `ai_drafts`, with `pending_review`; publication
  is not part of this runtime.

## SEO pipeline

```text
admin/cron -> D1 job -> Queue -> lease
  -> resolve trusted schedule/topic-plan reference
  -> existing provider router
  -> require complete RU/UZ pair
  -> strict bundle validator
  -> idempotent AI Draft Inbox insert
  -> awaiting_review
```

The existing topic-plan/Intent Guard flow remains the source of SERP/sitemap
context and cannibalisation decisions. Its synchronous endpoints are not
silently switched in this local-only change because they also transition
reservations and analysis rows. Their controlled cutover is documented as a
separate step, with the job result driving those idempotent transitions.

## Consequences

Benefits: n8n is no longer required by the target critical path; scheduling,
retry and replay move to the same Cloudflare/D1 plane; public credential
surface shrinks; the Railway service does not become a second ledger.

Costs: a Queue, DLQ, Worker and bindings must be created externally; legacy UI
fields need gradual provider-neutral migration; operators must monitor Queue
and D1 instead of the n8n UI.

This ADR authorizes local preparation only. It does not claim that n8n is
retired, that production bindings exist, or that R0.3B/R0.4/R1 is complete.
