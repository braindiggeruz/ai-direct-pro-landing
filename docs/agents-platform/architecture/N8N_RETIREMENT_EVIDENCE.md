# n8n retirement evidence — GPTBot, R0.4

`N8N_DISPOSITION=RETIRED`

Executed 2026-07-30. This record supersedes the `ROTATED` disposition held after
R0.3B. It is the evidence half of
[`N8N_RETIREMENT_RUNBOOK.md`](./N8N_RETIREMENT_RUNBOOK.md); the runbook states
what retirement requires, this file states what was actually observed.

The owner's decision was explicit and final: n8n is removed from every GPTBot
workflow, and no dormant fallback is kept. Re-enabling it would require new
code, a new credential and a new risk review — not a flag.

---

## 1. What was retired

| Item | Kind | Disposition |
| --- | --- | --- |
| `POST /api/admin/ai-drafts` legacy ingest | Pages Function route | Permanent `410 Gone`; auth path, token comparison and body parsing deleted |
| `functions/lib/seo-autopilot/launch.ts` | legacy bridge launcher | file deleted |
| `functions/lib/seo-autopilot/bridge-worker.ts` | n8n webhook caller | file deleted |
| `functions/lib/seo-autopilot/normalise.ts` | n8n response normaliser | file deleted |
| `functions/api/seo-autopilot/run.ts` | public external trigger into the bridge | file deleted |
| `N8N_INGEST_TOKEN` | Pages secret (production + preview) | removed |
| `N8N_WEBHOOK_SECRET` | Pages secret (production + preview) | removed |
| `N8N_INGEST_ENABLED` | Pages variable | was already absent; name now forbidden |
| `EXTERNAL_AUTOPILOT_TRIGGER_ENABLED` | Pages variable | name removed from the contract and from `Env` |
| `SEO_AUTOPILOT_USE_DIRECT_AI` | Pages secret (production + preview) | removed; there is no second launcher to select |
| `braindigger.app.n8n.cloud/webhook/runable-seo-autopilot` | hard-coded webhook target | removed with the bridge; no runtime file contains an n8n host |
| `x-runable-secret` | outbound auth header | removed with the bridge |

The `seo_autopilot_jobs.n8n_url`, `n8n_status` and `n8n_execution_id` columns are
**kept**. They hold real values for historical rows and the Control Center reads
them. Renaming them would destroy audit history for no security gain; nothing
writes an n8n value to them any more, and the direct launcher records
`cloudflare://llm-router/seo-autopilot-direct` in `n8n_url`.

## 2. Replacement is live and proven first

Retirement was executed **after** the first-party automation canary passed, not
before. Sequence and evidence:

1. Sotuvchi production canary — **43/43 PASS** against production D1 inside a
   real Workers runtime (tenant isolation, order idempotency, exactly one
   inventory decrement, handoff, owner-only stats, no raw buyer PII in
   analytics). Synthetic data removed; production row counts returned to their
   exact pre-canary baseline.
2. First-party automation canary — **56/56 PASS** against production D1 and the
   real Queue/DLQ bindings (idempotent enqueue, duplicate suppression, retry
   accounting, retry ceiling, lease exclusivity, lease-expiry recovery,
   dead-letter, owner-only replay, replay idempotence, bounded ledger with no
   PII, `awaiting_review` as the only terminal success state).
3. Worker `gptbot-automation` deployed with the Queue consumer, the DLQ
   producer, the D1 ledger binding and the `*/15 * * * *` Cron trigger.
4. `FIRST_PARTY_AUTOMATION_ENABLED=true` set on the Worker and on Pages
   production only after both canaries passed.

See [`TEST_EVIDENCE_FIRST_PARTY_AUTOMATION.md`](../TEST_EVIDENCE_FIRST_PARTY_AUTOMATION.md)
and [`R0.4_RETIREMENT_AND_CANARY_EVIDENCE.md`](../release/R0.4_RETIREMENT_AND_CANARY_EVIDENCE.md).

## 3. External n8n workflow

No n8n control-plane credential exists in the owner kit. The DPAPI vault holds
`n8n_ingest_token`, which is the bearer **n8n sent to GPTBot** — it grants no
access *to* n8n — and the R0.3B rotation already revoked the previous value at
the provider end.

The external workflow is therefore documented as **isolated rather than
verified-disabled**, and the isolation is enforced on the GPTBot side, which is
the side that matters:

- the route it called returns `410 Gone` with no code path to the ingest service;
- the bearer it authenticated with is no longer read by any code and no longer
  exists as a Cloudflare binding;
- the outbound direction is gone too: no runtime file contains the n8n host or
  the `x-runable-secret` header, so GPTBot cannot call n8n either.

A surviving n8n workflow can neither push into production nor be invoked by it.
Per §13B of the retirement decision, an inaccessible external UI does not keep
the project integration alive. The n8n instance itself was **not** deleted —
unrelated workflows may exist there and are out of scope.

## 4. Fail-closed proof, not fail-open

`tests/n8n-retirement.test.ts` (16 tests) replaces the old
`tests/n8n-ingest-security.test.ts`, which asserted the *fail-closed* behaviour
of an endpoint that no longer exists. The new suite asserts:

- `POST` answers `410` — not `200`, and not `404` (a permanent status stops a
  surviving caller from retrying);
- every historical revival combination of `N8N_INGEST_ENABLED` /
  `N8N_INGEST_TOKEN`, including the exact set that used to return `200`, still
  answers `410`;
- a correct bearer token writes **no** draft row;
- the `410` body echoes neither the credential nor the request payload, and
  neither reaches the console;
- the four deleted files do not exist;
- no file under `functions/`, `workers/` or `src/` reads a retired variable, and
  `Env` no longer declares one;
- no runtime file contains an n8n host or the `x-runable-secret` header;
- the environment contract removed the retired names **and** records them as
  forbidden, so a stale value cannot be mistaken for a live switch;
- exactly one SEO launcher is exported, it takes no webhook secret, and all four
  launch callers use it;
- the automation job-type allowlist is the closed single-entry list.

The route-parity gate lost its `legacy_n8n_default_off` invariant, which
asserted that the kill-switch *declaration existed*. That is not a routing
invariant and would have blocked the routing gate forever once the declaration
was deleted. Route parity itself is unchanged: **224/224 patterns, zero
deltas**.

## 5. Runtime state at retirement

| Check | Observed |
| --- | --- |
| `N8N_DISPOSITION` | `RETIRED` |
| Pages production env vars containing `N8N` | 0 |
| Pages preview env vars containing `N8N` | 0 |
| Retired names in `config/production-env.schema.json` variables | 0 (listed under `retired_variables`) |
| Automation path | Cloudflare Queue + DLQ + Cron + D1 ledger, sole production path |
| `FIRST_PARTY_AUTOMATION_ENABLED` | `true` (Worker and Pages production) |
| Draft terminal state reachable by automation | `awaiting_review` only |
| GitHub content write from automation | none; publication stays a separate admin-authenticated action |
| SEO Autopilot scheduler (GitHub Actions) | `disabled_manually` |
| SEO Autopilot schedule (`system_settings`) | `disabled` |
| Cloudflare Pages Git auto-deploy | disabled |
| Cloudflare Pages preview deployments | none |
| Railway GitHub trigger | disconnected |

## 6. Rollback

Rollback is a **first-party release rollback**, never an n8n reactivation:
redeploy the previous Pages deployment and, if required, set
`FIRST_PARTY_AUTOMATION_ENABLED=false` so the Cron returns immediately and Queue
messages are retried rather than processed. The D1 ledger, the DLQ and the
backups are never deleted as part of a rollback.

There is deliberately no dormant n8n path to fall back to.
