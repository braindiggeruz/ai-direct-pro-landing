# Lead Radar production runbook

This runbook is the operational contract for the evidence-first Lead Radar, its
dedicated Telegram Business plane and the separately gated Telegram user-account
campaign plane defined in
[`LEAD_RADAR_TELEGRAM_CAMPAIGNS_ADR.md`](./LEAD_RADAR_TELEGRAM_CAMPAIGNS_ADR.md).
It does not authorize a migration, secret change, webhook change, Cloudflare
binding/configuration change, deployment, commit, or push.

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
- Selecting up to 50 Radar companies creates one campaign review set, not an
  automatic-send entitlement and not 50 concurrent sends. A public username
  alone remains manual-draft only.
- The separate Telegram account may auto-send only to an exact, fresh, verified
  corporate endpoint with a recorded qualifying opt-in, inbound conversation
  or contract-approved existing relationship that explicitly covers or
  reasonably expects this outreach. Public/purchased data or generic terms do
  not qualify. Every other target remains manual or excluded.
- One account has one serialized sender, conservative daily/minimum-interval
  limits and no account rotation, paid flood bypass or automatic paid messages.
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
5. For account campaigns: reviewed TDLib image digest/SBOM/signature, Container
   dry-run/staging evidence, Durable Object migration, private R2 policy and
   private service-binding inventory.
6. Written approval for migration apply, secrets, Cloudflare
   bindings/configuration and deploy. These are four distinct account-campaign
   changes even if scheduled together. A Business-bot webhook change is a fifth,
   separate approval whenever that plane is in the release scope.

## Migration order

Apply only after a reviewed rehearsal against a production schema snapshot:

1. Reconcile the already-physical `0041` objects with the migration ledger by
   the reviewed reconciliation procedure; never infer state from a filename.
2. Apply `0042_lead_radar_decision_makers.sql`.
3. Apply `0043_lead_radar_async_funnel.sql`.
4. Apply `0044_lead_radar_telegram_business.sql`.
5. Apply `0045_lead_radar_telegram_campaigns.sql`.
6. Run the read-only exact schema auditor. A mismatch is stop-ship; application
   runtime never repairs schema and never executes DDL.

The migrations are additive and `0045` is a rolling-compatible campaign
extension: old application/Worker artifacts ignore its objects; new artifacts
must expose campaign capability as unavailable until the exact schema and all
bindings exist. Application rollback disables capability flags and restores the
prior artifacts; it does not drop tables during an incident.

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

## Separate Telegram account campaign configuration

The canonical architecture and rationale are in
[`LEAD_RADAR_TELEGRAM_CAMPAIGNS_ADR.md`](./LEAD_RADAR_TELEGRAM_CAMPAIGNS_ADR.md).
It extends the existing Pages/D1/Queue/automation Worker path with a private
service-bound Telegram account Worker, one Durable Object per account, one
Cloudflare Container running official TDLib and a private R2 encrypted session
snapshot. Railway, GramJS, browser session custody, public gateway routes and a
second repository/backend are prohibited.

Official operational references:

- [TDLib](https://core.telegram.org/tdlib) and
  [QR login](https://core.telegram.org/api/qr-login);
- [Telegram application credentials](https://core.telegram.org/api/obtaining_api_id)
  and [API Terms](https://core.telegram.org/api/terms);
- [Cloudflare Containers](https://developers.cloudflare.com/containers/),
  [Durable Objects](https://developers.cloudflare.com/durable-objects/),
  [service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
  and [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/).

Do not place secret values in a command, report or chat. Provision through the
platform secret controls:

- `LEAD_RADAR_TELEGRAM_API_ID` and `LEAD_RADAR_TELEGRAM_API_HASH` — the
  application's own credentials created by the owner at `my.telegram.org`;
- `LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY` — versioned application
  envelope-encryption master key for TDLib snapshots;
- `LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY` — a separate 32-byte base64url key
  for encrypted campaign templates/endpoints and keyed D1 digests; it must not
  be reused for TDLib snapshots or the Telegram Business bot;
- internal service authentication material if required by the reviewed binding
  design; the service itself must not have a public route.

Provision and verify a private R2 bucket, a per-account Durable Object migration,
the Container image/binding and the private service binding. R2 must have no
public development URL or custom domain. The encrypted TDLib snapshot is the
only durable session payload; QR token/URI, login code and 2FA password are
memory-only and `no-store`.

All account/campaign flags ship as exact `false`:

- `LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED=false`
- `LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED=false`
- `LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED=false`

`LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED` is separate and research-only. It may
be `true` while all three flags above remain false; it permits verified
corporate Telegram discovery/filtering only and can never authorize a send.

The disabled release candidate uses
`LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT=10` and
`LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS=120`. A 50-target campaign
must cross daily boundaries rather than bypass these limits. Invalid/missing
values keep auto-send unavailable; a production change requires the same
configuration approval as capability enablement.

### Rolling deployment order

Each step remains separately approved and evidenced; this sequence does not
authorize execution:

1. Rehearse and apply additive `0045`, then prove the exact read-only schema.
2. Create/verify the private R2 bucket and secrets without enabling any flag.
3. Deploy the Telegram account Worker, Durable Object migration and pinned
   TDLib Container to staging, then production with no public route. Record the
   active Worker version and Container image digest after rollout converges.
4. Verify the private service binding and health contract from staging. Deploy
   the binding target before any caller; Cloudflare documents this requirement
   in [service-binding deployment](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/#deployment).
5. Deploy the backward-compatible automation Worker caller, then Pages/API/UI.
   All three account/campaign flags remain false, so old and new artifacts can
   coexist without a provider effect.
6. Canary account connection for one allowlisted organization, prove QR/session
   custody and revoke/restore, then enable campaign creation without auto-send.
7. Only after legal and operational acceptance, enable auto-send for the same
   organization and prove the 10/day, 120-second, DNC, paid-message, flood and
   ambiguous-effect controls.

Container deployment is not transactional with the Worker and rollout may
briefly contain old Container instances, as documented in
[Deploy Containers](https://developers.cloudflare.com/containers/deploy/).
Therefore every Worker-to-Container request carries a versioned contract and
both adjacent versions must be compatible. A mismatch is fail-closed; it never
falls back to a public gateway or alternate account.

Enable in that order for one allowlisted organization only after the preceding
layer passes canary. A missing, mixed-case or non-`true` value is false. Disabling
any flag stops new reservations/provider effects but must not stop disconnect,
DNC, retention or ambiguous-effect reconciliation.

Production remains externally blocked until Workers Paid (currently documented
at a USD 5/month minimum) and budget alerts are accepted; Docker/CI can build,
scan, sign and deploy the pinned Linux/amd64 official TDLib image; the owner
provides `api_id`/`api_hash`; secrets, private R2, Durable Object, Container and
service bindings are provisioned; and legal/data-owner sign-off covers lawful
basis, retention, cross-border processing, offer content, DNC, daily cap and
minimum interval. Migration, secret, configuration/binding and deployment
approvals are recorded separately.

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

Account-campaign enabled:

- selection of 51 targets and any cross-tenant target/account/campaign reference
  fail before mutation;
- the frozen set contains at most 50 ordered targets, with truthful
  `auto_eligible`, `manual_draft` or `excluded` reason codes;
- a public username without qualifying consent/inbound/contract evidence
  produces zero provider calls and remains a manual draft;
- one account produces at most one in-flight provider effect and preserves order
  across concurrent Worker deliveries, retries, pause/resume and Container
  restarts;
- DNC is rechecked before reservation and provider dispatch, cancels all unsent
  company targets and removes reversible routing material;
- daily cap and minimum interval are atomic across campaigns for the account;
- QR/login-code/2FA values never appear in D1, R2, Queue, logs, analytics or
  browser persistence; only an application-encrypted TDLib snapshot reaches
  private R2;
- revoke/logout/auth-key errors stop the account and require explicit reconnect;
- `FLOOD_WAIT`, premium flood, slow-mode or spam restriction pauses the account
  without switching accounts or shortening the provider wait;
- paid-message requirements result in `paid_message_required`, zero Stars spent
  and zero automatic provider sends;
- timeout/crash after the TDLib boundary becomes `ambiguous` and is never
  automatically retried;
- Container image digest, service binding, R2 bucket policy, Durable Object
  migration and exact flags match the approved release manifest.

## Monitoring and incident response

Alert on the closed set of schema, queue, retention and Telegram reason codes;
logs may include request/job/effect IDs, versions, counts, durations and error
buckets only. Never log request bodies, offers, drafts, contacts, provider
descriptions or decrypted identifiers.

Immediate contact pause conditions include schema mismatch, allowlist drift,
retention failure, DNC recurrence, any false corporate/human upgrade, unexpected
provider retry, ambiguous-effect growth, webhook authentication failure burst,
evidence precision below the release gate, account serialization breach,
Telegram restriction/flood burst, session snapshot failure, unexpected paid
message attempt or private gateway exposure.

Incident rollback order:

1. Set `LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED=false`.
2. Set `LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED=false` and
   `LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED=false` if account custody is suspect.
3. Set `LEAD_RADAR_CONTACT_ENABLED=false`.
4. Set `LEAD_RADAR_ADMISSION_ENABLED=false`.
5. Let already-running bounded jobs finish, or set
   `LEAD_RADAR_PROCESSING_ENABLED=false` if processing itself is unsafe.
6. Preserve DNC, disconnect and retention scheduling; do not disable privacy
   cleanup. If session custody is suspect, revoke the Telegram authorization and
   delete the encrypted R2 snapshot/wrapped key under incident procedure.
7. Restore the reviewed Pages, Worker and Container rollback artifacts.
8. Re-run the read-only manifest/schema/binding comparison before any re-enable.

## Retention and deletion

Retention runs independently of admission, processing and contact capability.
It removes stale personal contact payloads, expired/superseded connect nonces,
bounded webhook idempotency rows, expired approvals, old terminal effects and
inactive reversible Telegram identifiers according to the configured policy.
DNC immediately closes the transitive company identity, blocks new effects and
deletes the company chat binding/ciphertext while retaining only the minimum
non-reversible suppression/audit record required by policy.

Disconnect/revoke of a separate account also deletes its encrypted private-R2
TDLib snapshot and wrapped key after dispatch is stopped. Expired QR connection
attempts disappear from memory; there is no durable QR/2FA cleanup path because
those values must never be persisted.

Every retention and DNC operation must be tenant-scoped, bounded, idempotent and
covered by a zero-recurrence test. A legal retention period or cross-border
mechanism is a launch gate for local counsel/data owner, not an engineering
assumption.
