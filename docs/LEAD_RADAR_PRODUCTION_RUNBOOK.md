# Lead Radar production runbook

This runbook is the operational contract for the evidence-first Lead Radar and
its dedicated Telegram Business plane. It does not authorize a migration,
secret change, webhook change, deployment, commit, or push.

## Non-negotiable safety boundary

- Research, scoring and draft preparation may be automated.
- Cold Telegram outreach is manual: the product may open a reviewed `t.me`
  draft, but the operator presses Send.
- A Bot API send is permitted only as a reply in an active Telegram Business
  chat, after a company-originated message within 24 hours, current
  `can_reply`, an exact verified corporate endpoint, a fresh server-issued
  single-use approval, DNC rechecks and an authenticated operator action.
- Public contact data is not consent. `LEAD_RADAR_CONTACT_ENABLED` is enabled
  only after the organization has an approved legal basis and operating policy.
- No personal or message payload is written to Queue, logs or the Telegram
  transport tables. Ambiguous provider outcomes are never retried automatically.
- The existing general Telegram bot, webhook and secrets are a separate trust
  domain and must not be reused by Lead Radar.

## Required release evidence

Before any canary, all of the following must be attached to one immutable
release candidate:

1. A green `npm run release:lead-radar` report. This runs local type checks,
   scoped lint, all Lead Radar tests, secret scan, Cloudflare Pages build and a
   Worker `wrangler deploy --dry-run`; it never deploys or applies migrations.
2. A release manifest with exact and separately identified PROD, HEAD and WIP
   snapshots. Any `unknown` keeps the release blocked.
3. The reviewed application and Worker artifact hashes, Git revision, dirty and
   untracked paths, migration hashes, bindings, consumers, cron, feature flags
   and rollback artifacts.
4. A read-only production schema audit matching the exact contract version.
5. Written approval for migration apply, webhook configuration, secrets and
   deploy. Those are four distinct external changes even if scheduled together.

## Migration order

Apply only after a reviewed rehearsal against a production schema snapshot:

1. Reconcile the already-physical `0041` objects with the migration ledger by
   the reviewed reconciliation procedure; never infer state from a filename.
2. Apply `0042_lead_radar_decision_makers.sql`.
3. Apply `0043_lead_radar_async_funnel.sql`.
4. Apply `0044_lead_radar_telegram_business.sql`.
5. Run the read-only exact schema auditor. A mismatch is stop-ship; application
   runtime never repairs schema and never executes DDL.

The migrations are additive. Application rollback disables capability flags
and restores the prior artifacts; it does not drop tables during an incident.

## Dedicated Telegram Business configuration

Provision a new bot that is used only for Lead Radar Business connections. Add
the following values through the platform secret/configuration controls; never
place secret values in a command history, repository, report or chat:

- `LEAD_RADAR_TELEGRAM_BOT_TOKEN` — dedicated bot token.
- `LEAD_RADAR_TELEGRAM_WEBHOOK_SECRET` — independent random webhook secret.
- `LEAD_RADAR_TELEGRAM_DATA_KEY` — 32 random bytes, base64/base64url encoded.
- `LEAD_RADAR_TELEGRAM_BOT_USERNAME` — public bot username without a URL.
- `LEAD_RADAR_CONTACT_DAILY_LIMIT` — conservative per-organization cap; default
  `10`, maximum `100`.

Configure exactly one HTTPS webhook:

`https://<approved-pages-host>/api/telegram/lead-radar-business`

Use the dedicated webhook secret and only the required update classes:
`message`, `business_connection`, `business_message`. Verify the configured URL,
secret status and allowed update list without printing either secret. The
central Telegram webhook must remain byte-for-byte unchanged.

The encryption key is a retention-critical secret. Until a tested versioned
keyring/rotation procedure is released, loss or replacement of this key makes
existing encrypted connection identifiers unreadable. Treat unplanned rotation
as an incident: pause contact, preserve audit metadata, delete/reconnect the
affected transport bindings under the approved DSAR/retention procedure, and do
not attempt blind re-encryption.

## Fail-closed enablement sequence

All three capability flags default to exact string `false`. A missing value,
mixed case or any other value is false.

1. Populate `LEAD_RADAR_ALLOWED_ORGS` with the one canary organization.
2. Keep `LEAD_RADAR_CONTACT_ENABLED=false`.
3. Enable `LEAD_RADAR_PROCESSING_ENABLED=true` and verify Worker bindings,
   consumer batch size `1`, concurrency `4`, DLQ and `*/15` cron.
4. Enable `LEAD_RADAR_ADMISSION_ENABLED=true` for the canary organization.
5. Run research-only searches at N=1/5/10/50 and inspect truthful funnel,
   evidence provenance, tenant isolation and capacity telemetry.
6. Only after legal/privacy/precision sign-off, configure the dedicated bot and
   set `LEAD_RADAR_CONTACT_ENABLED=true` for the same allowlisted organization.

Never enable contact globally before the allowlist is present. Removal from the
allowlist must immediately stop new bindings, replies and send approvals while
still accepting a disabling Telegram lifecycle update and running retention.

## Canary acceptance

Research-only:

- schema contract exact; runtime DDL count zero;
- duplicate admission produces one search and conflicting key reuse returns
  `409`;
- N=50 discovery stays at or below 50 D1 statements per invocation;
- adversarial cron recovery stays at or below 50 D1 statements;
- stale workers cannot regress terminal state or counters;
- cross-tenant reads, effects, suppression and dispatch are zero;
- candidate, processed, evidence-verified, site-bound and contact counters stay
  independent;
- no personal Telegram requirement deletes a real company candidate;
- 15-minute UI polling bounds stop and expose manual refresh.

Contact-enabled:

- an unlabeled site handle and `Person.sameAs` cannot become a corporate route;
- exact fresh same-company fact evidence exists for the endpoint;
- repeated/superseded connect links cannot create an ambiguous association;
- old or concurrent lifecycle updates cannot restore revoked reply rights;
- no inbound company activity in the last 24 hours means manual draft only;
- approval tampering/reuse/expiry/concurrency produces zero provider calls;
- DNC before reservation or before dispatch produces zero provider calls and
  removes reversible company-chat identifiers;
- timeout/crash after the provider boundary becomes `ambiguous` and is never
  auto-retried;
- daily limit and 30-second per-binding cooldown are enforced atomically;
- logs, Queue and D1 contain no raw token, Telegram ID, username, human name or
  message body.

## Monitoring and incident response

Alert on the closed set of schema, queue, retention and Telegram reason codes;
logs may include request/job/effect IDs, versions, counts, durations and error
buckets only. Never log request bodies, offers, drafts, contacts, provider
descriptions or decrypted identifiers.

Immediate contact pause conditions include schema mismatch, allowlist drift,
retention failure, DNC recurrence, any false corporate/human upgrade, unexpected
provider retry, ambiguous-effect growth, webhook authentication failure burst,
or evidence precision below the release gate.

Incident rollback order:

1. Set `LEAD_RADAR_CONTACT_ENABLED=false`.
2. Set `LEAD_RADAR_ADMISSION_ENABLED=false`.
3. Let already-running bounded jobs finish, or set
   `LEAD_RADAR_PROCESSING_ENABLED=false` if processing itself is unsafe.
4. Preserve DNC and retention scheduling; do not disable privacy cleanup.
5. Restore the reviewed Pages and Worker rollback artifacts.
6. Re-run the read-only manifest/schema comparison before any re-enable.

## Retention and deletion

Retention runs independently of admission, processing and contact capability.
It removes stale personal contact payloads, expired/superseded connect nonces,
bounded webhook idempotency rows, expired approvals, old terminal effects and
inactive reversible Telegram identifiers according to the configured policy.
DNC immediately closes the transitive company identity, blocks new effects and
deletes the company chat binding/ciphertext while retaining only the minimum
non-reversible suppression/audit record required by policy.

Every retention and DNC operation must be tenant-scoped, bounded, idempotent and
covered by a zero-recurrence test. A legal retention period or cross-border
mechanism is a launch gate for local counsel/data owner, not an engineering
assumption.
