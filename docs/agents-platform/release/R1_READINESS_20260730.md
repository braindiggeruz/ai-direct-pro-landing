# R1 readiness — 2026-07-30

Status: R1.1 complete; real Store Pilot #1 not started.

## R1.1 closeout — 2026-08-01

- Exact source `41ec9e3401b3e974edf8d97480695e9845a4924f` is live in
  deployment `ede1d0f4-6a06-40e2-9b6c-dee2a7812c69`.
- Rollback target: `af73edd9-1c90-418d-83d7-c79d81ae2888` at source `a542052`.
- Start latency PASS: 2,564 ms server-side on a cold isolate against a
  12,451 ms baseline; owner confirms the first response is fast.
- No order, handoff, notification or inventory side effect; exactly one
  Telegram update processed and completed.
- Release baseline is 1043/1047 tests across 45 suites; the four failures are
  pre-existing on clean `origin/main` and tracked in `KNOWN_ISSUES.md`.
- Evidence: `R1_1_START_LATENCY_EVIDENCE.md`.

## R1.1 update — 2026-07-31

- Dedicated `@gptbot_market_bot` identity verified.
- Token and distinct webhook secret installed through the protected owner
  path; no value is stored in Git or governance.
- Isolated webhook configured with zero pending updates and no current error.
- Migrations through `0030` applied and verified.
- Controlled catalog contains 48 explicitly synthetic products.
- Exact source `e8b2bd7` is live in deployment
  `226d65cc-5be9-4c5e-ba30-93af250b34df`.
- Full release baseline is 981/981 tests with all builds, typechecks, security
  scans and dependency audits passing.
- Owner walkthrough passed product behavior and exposed latency. The
  remediation is deployed; one post-fix owner request remains.
- Real stores, payments and public marketplace remain at zero/off.

## Completed technical gates

- P3.1 is independently reviewed, merged and live from exact source.
- Production D1 has a fresh verified backup and migration `0025`.
- Owner/support authorization, tenant boundaries, bounded atomic audit,
  idempotency, Queue replay and KV lockout pass in production.
- Sotuvchi platform migrations and prior production canaries remain valid.
- First-party automation is the sole supported path.
- n8n is retired; automatic publication and the SEO scheduler are disabled.
- Cloudflare automatic deployments are disabled and Railway is disconnected.
- Rollback artifacts and hard-stop criteria are recorded.
- No real store, bot, webhook, buyer, order, inventory movement or payment was
  created during P3.1.

## Remaining prerequisite for Store Pilot #1

1. Complete one post-fix latency request in the controlled synthetic bot.
2. Select one real, consented and verified store for the first pilot.
3. Verify one seller identity and approve 10–30 real products.
4. Sign off inventory baseline, seller SLA, support owner and incident lead.
5. Separately authorize the real-store start under the R1 runbook.

## Business and operator inputs not created by this release

Before the separately authorized pilot starts, the owner must also provide:

- 1–3 consented stores with verified legal/business owners;
- verified seller Telegram identities, each assigned only to its own store;
- approved initial categories and catalogs;
- integer UZS prices under the existing Sotuvchi contract;
- signed opening inventory baselines and a named correction owner;
- a seller response SLA and escalation contact;
- a named pilot support owner, incident lead and protected communication path.

These are controlled-pilot inputs, not missing platform implementation. No real
store or seller was silently created to make the readiness record look green.

## R1 hard boundaries

R1 does not authorize reconnecting Railway, enabling Cloudflare auto-deploy,
enabling a scheduler, restoring n8n, enabling automatic publication, launching
a public marketplace, enabling payments or creating synthetic substitutes for
real stores or the provider-owned bot.

```text
R1_TECHNICAL_READINESS=PASS
R1_PILOT_STARTED=NO
OWNER_PROVIDER_PREREQUISITE=COMPLETE
AGENTS_BOT_CREATED=YES
WEBHOOK_CONFIGURED=YES
R1_1_POST_FIX_LATENCY_CANARY=PENDING
REAL_STORES_SELECTED=NO
SELLER_IDENTITIES_VERIFIED=NO
CATALOGS_AND_INVENTORY_BASELINES_APPROVED=NO
SLA_AND_INCIDENT_OWNERS_ASSIGNED=NO
```
