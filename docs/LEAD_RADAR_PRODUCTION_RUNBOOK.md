# Lead Radar production runbook

This runbook is the operational contract for Lead Radar, its dedicated Telegram
Business reply plane and the separately gated Telegram user-account campaign
plane described in
[`LEAD_RADAR_TELEGRAM_CAMPAIGNS_ADR.md`](./LEAD_RADAR_TELEGRAM_CAMPAIGNS_ADR.md).
It does not authorize a migration, secret change, binding/configuration change,
deployment, commit, push or a real Telegram send.

## Non-negotiable safety boundary

- Research, scoring and draft preparation may be automated.
- A public Telegram endpoint is addressability, not consent. It remains a manual
  draft unless an exact, unexpired tenant/company/endpoint authorization exists.
- Automatic recipients require a documented opt-in, qualifying company-initiated
  conversation or applicable existing contract. Purchased/public lists and a
  form-level legal-basis selection do not qualify.
- One account has one serialized sender: maximum 30 automatic sends per policy
  day and minimum 120 seconds between attempts. No rotation, paid-message spend,
  flood bypass or parallel provider consumers.
- DNC wins at selection, reservation and immediately before provider dispatch.
- A provider success or ambiguous outcome is permanently no-repeat on the
  server, including after Bridge reinstall, device replacement or lead
  rediscovery. Ambiguous outcomes are never automatically retried.
- Telegram application credentials, session, device secret and plaintext QR/2FA
  never enter Cloudflare storage or logs.

## Architecture inventory

The campaign path is:

1. owner UI and Pages Functions;
2. D1 policy/campaign/no-repeat tables and private campaign-media R2;
3. existing Queue and automation Worker;
4. private service binding plus internal bearer token to the Free gateway;
5. one SQLite Durable Object mailbox per tenant account slot;
6. outbound-only Windows Bridge as the sole MTProto/provider boundary.

The gateway has public Bridge routes only on the approved dedicated origin.
They require the paired device's HMAC; they are not an admin API. The Bridge
polls every 15–30 seconds and has no listener. Active Wrangler configuration
must contain no Container binding and no paid-only CPU limit. Telegram
`api_id`, `api_hash` and session remain on that Windows device under DPAPI.

## Required release evidence

Before canary, attach all of the following to one immutable release candidate:

1. Green `npm run release:lead-radar` output. It type-checks, tests, scans and
   performs build/dry-run checks; it never deploys or applies migrations.
2. Exact Git revision, dirty/untracked paths, artifact hashes and rollback
   artifacts. Unknown WIP provenance is stop-ship.
3. Hashes for migrations `0042` through `0048` and a read-only production schema
   audit matching the checked-in contract.
4. Reviewed Pages, automation Worker and gateway bindings/vars; current
   Cloudflare Free-plan quota evidence; no `[[containers]]` in the active
   gateway descriptor.
5. Evidence that the Bridge build/install artifact is reviewed, runs outbound
   only, stores secrets/session under DPAPI, has no Cloudflare API token, and
   passes the exact mailbox/HMAC/E2E contract tests.
6. Private R2 policy evidence: no public development URL/custom domain, hard
   application quota 100 objects/250 MiB per organization, bounded retention.
7. Separate written approvals for migration apply, secrets, Cloudflare
   binding/configuration, deployment, account pairing and real-send canary.
8. Legal/data-owner approval covering lawful basis, DNC, retention, offer
   content, cross-border processing, the 30/day cap and 120-second floor.

## Migration order

Apply only after rehearsal against a production schema snapshot:

1. Reconcile already-physical `0041` objects with the migration ledger; never
   infer state from a filename.
2. Apply `0042_lead_radar_decision_makers.sql`.
3. Apply `0043_lead_radar_async_funnel.sql`.
4. Apply `0044_lead_radar_telegram_business.sql`.
5. Apply `0045_lead_radar_telegram_campaigns.sql`.
6. Apply `0046_lead_radar_telegram_campaign_safety.sql`.
7. Apply `0047_lead_radar_telegram_campaign_media.sql`.
8. Apply `0048_lead_radar_telegram_media_quota.sql`.
9. Run the exact read-only schema auditor. Any mismatch is stop-ship; runtime
   code never repairs schema or executes DDL.

`0045`–`0048` are additive. Old artifacts ignore the new objects; new artifacts
report campaign capability unavailable until schema, fingerprint sentinels,
bindings and secrets are exact. Rollback disables flags and restores artifacts;
it does not drop safety or no-repeat tables.

Before `0047`/`0048`, attach a read-only count of user accounts, campaigns,
approvals, authorizations, nonterminal recipients/effects and active media.
Unexpected existing state requires an explicit reconciliation plan. Legacy
campaign rows never auto-bind a newly presented data key, and legacy media never
receives an assumed zero size. Until size is reconciled from a verified private
R2 HEAD, new uploads fail closed rather than bypass the quota.

## Secrets and bindings

Never put values in source, `.env` committed to Git, shell history, release
reports, screenshots or chat.

Pages and automation Worker require:

- `LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY`: independent 32-byte base64url key for
  campaign ciphertext/keyed identities;
- `LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN`: independent 32-byte base64url
  bearer shared only with the gateway;
- `LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE`: private service binding;
- `LEAD_RADAR_CAMPAIGN_MEDIA`: private R2 binding.

The gateway requires the same internal bearer plus the reviewed SQLite Durable
Object and media-bucket bindings and its approved public Bridge origin. The
Windows Bridge receives neither Cloudflare API credentials nor the internal
service token. Its device secret is generated locally at pairing; the server
stores only a digest.

Telegram `api_id`, `api_hash`, 2FA and the durable session belong only on the
paired device. They are not Cloudflare vars/secrets. Loss or unexpected change
of the campaign data key is a contact-pause incident because identity digests
and encrypted drafts would become unreadable; never rotate it without a
versioned migration.

## Fail-closed capability sequence

All flags use exact `true`; missing, malformed or mixed-case values are false.

1. Keep account, campaign and auto-send flags false. Allowlist exactly one
   canary organization.
2. Apply/audit schema and provision bindings/secrets while disabled.
3. Deploy the gateway first, then automation Worker, then Pages/UI. Verify
   private bearer health and the public Bridge origin without a device secret in
   logs.
4. Install the reviewed Bridge on the owner device. Create one high-entropy,
   short-lived pairing ceremony in the owner UI; consume it once. Prove status
   transitions `unpaired -> online`, heartbeat to `offline`, and explicit
   `pending_revocation -> revoked` when the device later confirms cleanup.
5. Enable `LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED=true` for the canary. Prove
   browser-E2E QR login and browser-to-Bridge-E2E 2FA without plaintext at Pages.
6. Enable `LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED=true`. Prepare/review campaigns
   only; verify all eligibility counts and no provider effects.
7. Only after legal/operations sign-off, enable
   `LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED=true` for the same organization
   and run a separately approved minimal canary.

`LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED` is research-only and never authorizes a
send. Disabling any contact flag stops new effects but must not stop DNC,
disconnect/revocation, retention, media cleanup or ambiguous reconciliation.

Use `LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT=30` and
`LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS=120`. Invalid or weaker
values keep auto-send unavailable. Fifty selected companies are a review set,
not a concurrency level.

## Pairing, QR and 2FA acceptance

- Pairing raw material has at least 128 bits of entropy, appears once as a
  separate copy value, expires, has a bounded attempt count and is atomically
  consumed. The activation URI contains only pairing id and origin; the code is
  pasted into a masked local prompt and only a digest persists server-side.
- Device-secret verification is constant-time. HMAC binds version/direction,
  device id, timestamp, nonce, method, exact path and body SHA-256. Clock and
  nonce replay windows are bounded and durable.
- The owner UI distinguishes unpaired, online, offline and pending revocation.
  It states that the Windows Bridge must be running.
- Browser public QR key id is exact lowercase SHA-256 of SPKI and has a maximum
  90-second expiry. QR ciphertext is bound to tenant/device/command/auth and is
  deleted/ignored on expiry or terminal state. QR is rendered locally; no
  external QR service sees the login URL.
- A reused connect idempotency operation with a different browser key is `409`.
  An expired key starts a new operation.
- 2FA POST accepts only the strict hybrid ciphertext envelope bound to the
  dedicated password command. Plaintext fields are rejected before a private
  call. The input is never persisted or offered to the site's password manager.
- Pages/gateway error projections redact enrollment codes, device secrets, QR
  ciphertext contents, password material and provider descriptions.

## Campaign and provider acceptance

- Selection of 51 or a cross-tenant target/account fails before mutation.
- The frozen target set truthfully distinguishes auto-eligible, manual and
  excluded recipients. Choosing a basis label never creates authorization.
- Authorization and DNC are revalidated immediately before command creation.
- Daily cap and 120-second floor are atomic across campaigns for one account.
- There is one mailbox claim and one Bridge provider call for one effect. The
  legacy Container sender is unreachable in local-bridge mode.
- A result is accepted only from the authenticated device that owns that exact
  tenant command. Cross-device, cross-tenant and replayed results fail.
- Success or ambiguity updates permanent tenant-side no-repeat history. Bridge
  reinstall/re-pair cannot make the recipient eligible again.
- Provider timeout after submission is ambiguous and never auto-retried.
  Definitive pre-provider errors may release only their exact reservation.
- Flood/spam/slow-mode/revoked-session signals pause the account. Paid-message
  requirements spend zero Stars and become a terminal/manual-review result.
- Exact message preview preserves Unicode text, line breaks and literal
  punctuation. Markdown/HTML parsing is disabled. One image is sent with the
  reviewed text as its caption; it never silently degrades to text-only.

## Media and zero-cost guard

- Validate one static JPEG/PNG/WebP before R2 registration: byte size, format,
  animation, dimensions and decoded pixels.
- Reserve D1 quota before `PutObject`. Per organization, active plus reserved
  media stays at or below 100 objects and 250 MiB.
- Store only at
  `lead-radar/campaign-media/{org_id}/{media_id}` with frozen digest/MIME/size.
- Send commands contain the immutable source reference, never bytes/base64.
  Multiple recipients reuse one object. The gateway never creates or deletes a
  per-recipient copy.
- Signed command media streaming rechecks tenant, command, object key, R2 HEAD
  metadata and SHA-256. Only campaign retention/deletion owns source deletion.
- On upload uncertainty, keep the reservation until bounded maintenance HEAD
  proves absence. If R2/D1/quota is unavailable, reject new media; never guess.
- Cleanup continues with auto-send false and uses bounded cursors. A failed
  sweep is retried without unbounded work or weakening the quota.

## Free-plan capacity and monitoring

The design budget assumes one serialized sender, 15–30 second Bridge polling,
bounded mailbox/retention pages and the application storage cap above. Before
each enablement, compare measured request, Durable Object, D1 write/storage and
R2 usage to the account's current Free allowances. Configure alerts well before
the limit. Quota exhaustion is an availability incident: stop new admissions
and sends, preserve no-repeat/DNC/effects, and do not add a paid dependency or
bypass a guard automatically.

Monitor without payloads:

- Bridge online/offline/revocation state and heartbeat age;
- mailbox depth/oldest age, command lease expiry and rejected replays;
- campaign pending/sent/ambiguous/pre-provider-failed counts;
- account daily reservations and next allowed send time;
- D1 statement/write budget, Worker requests, DO storage and R2 bytes/objects;
- stale media reservations, retention cursor progress and cleanup failures.

Logs contain opaque tenant/command/effect ids and closed error codes only. Never
log usernames, phone/chat ids, message body, provider descriptions, QR/2FA,
enrollment/device secrets or Telegram session data.

## Incident and rollback

1. Set auto-send false, then campaign/account flags false if scope expands.
2. Keep DNC, disconnect/revocation, retention and reconciliation running.
3. If a send crossed the provider boundary without a definitive result, mark it
   ambiguous; do not replay it.
4. For a suspected device compromise, stop campaigns, explicitly revoke the
   exact device and require confirmation of local DPAPI/session deletion before
   replacement. Revoke the Telegram session from an official client as needed.
5. For internal-token compromise, disable callers, rotate the bearer on gateway
   and callers as one reviewed change, then verify all private routes reject the
   old token.
6. For campaign-key mismatch/loss, pause contact and preserve safety ledgers;
   never auto-bind a replacement key.
7. Restore reviewed Pages, automation Worker and gateway artifacts. Do not roll
   back by dropping safety/no-repeat/quota schema.

## Retention

Campaign maintenance purges message/template ciphertext, recipient details,
eligibility children and media mappings at the approved horizon while preserving
opaque campaign audit totals and permanent tenant-keyed no-repeat digests.
Media source deletion occurs only after no live campaign reference remains and a
D1 compare-and-swap grants the retention worker ownership.

Pairing material, browser keys, QR/password ciphertext, transient non-send
commands and replay nonces use short explicit TTLs. Terminal send commands/results
and the permanent no-repeat ledger are not subject to the transient mailbox TTL.
Every retention action is tenant-scoped, bounded, idempotent and continues after
the tenant is removed from the auto-send allowlist.
