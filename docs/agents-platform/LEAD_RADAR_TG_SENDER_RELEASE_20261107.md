# Lead Radar + TG Sender: production release, 2026-11-07 UTC

## Status and scope

Runtime source `02a3613c7ccb85f8de52a6cbe4d3a22781607375` was released through the guarded Pages process to deployment `348f91de-c3e9-4eb3-8c97-4e6cd771252a`.
Automation is `e0f0f0a4-6044-4804-b47c-5eac943f3d3c`; TG Sender is `53cd7232-c239-4d33-941f-2405fa1e12ab`, using transport source `ce82c0fd9dec222175749663b68a590550a628dd`.
The real provider session was verified by getMe at 18:21 UTC. Live HTTP/runtime/binding/asset acceptance passed at 19:14 UTC. No customer messages, contact lookups or campaigns were created.

Production database migration readback is `after_verified`, with zero foreign-key violations and preservation of 34,767 existing rows. Only the independent crawler heartbeat column `lead_radar_crawler_workers.last_seen_at` was excluded from concurrent business-data hash comparison; its original full hashes were retained. Two rejected attempts fully rolled back before the supported dependency guard was applied. Safe evidence: `F:/Claude/gptbot-tools/outreach-release/live-acceptance.json` and `d1-guarded-apply.json`.

The explicit owner UI transition from the previous Bridge account, visual browser smoke and first owner-selected real-message/reply canary remain unverified. Chrome attachment failed; no alternate login or hidden account replacement was used. Configuration readiness is not proof of message delivery.

The owner requested one workflow for finding companies and contacting a cold
business audience. The implementation reuses the existing Lead Radar audience,
approval, campaign, quota, suppression and encrypted-message engine. It adds a
TG Sender transport, a distinct public-business first-contact policy, an inbox
and delivery-receipt reconciliation. Existing consent-based campaigns retain
their authorization basis and behavior.

## Architecture and ownership

1. Discovery fetches each configured catalog once, without website enrichment
   inside the raw discovery call. The existing leased enrichment queue owns
   crawling. A failed catalog does not hide successful catalogs; a total source
   failure follows the existing bounded retry/dead-letter path. Source budgets,
   robots handling, deduplication and the production free-only boundary remain.
2. A company contact must be reviewed and resolved to the account-bound peer.
   The public inquiry path additionally requires a verified corporate public
   username and exact first-party source evidence. An opaque peer reference
   cannot replace the public username or its evidence.
3. The owner approves the exact audience and rendered text. Selection/content
   digests and the approval token bind the campaign. Editing the audience or
   text requires fresh approval. Approval is not a declaration of subscription.
4. The automation Worker is the campaign scheduler. The TG Sender integration
   endpoint performs one bound effect; it does not independently schedule this
   campaign. Sender account, organization and integration endpoint come from
   server configuration, never a browser-supplied host, token or fingerprint.
5. Before provider dispatch, the Worker verifies the binding, the durable
   authorization reference, the data-key fingerprint, provider-session freshness,
   suppression, history, account lease, pacing, quota and inbox opt-out barrier.
6. The receipt wrapper persists the immutable provider receipt key before the
   request crosses the provider boundary. Unknown delivery becomes ambiguous,
   not a retry. Reconciliation reads an exact effect/account/payload receipt;
   it never calls send or releases the permanent no-repeat guard.
7. Authenticated inbound callbacks enter the encrypted inbox. A pending opt-out
   immediately blocks that account's sending until the existing suppression
   identities have been applied. Disabling the inbox feature does not ignore
   pending opt-outs already stored in the database.

## Public inquiry policy

The basis is `public_business_inquiry`, evidence version
`public-business-inquiry-v1`. It is not `documented_consent` and never marks a
public contact as subscribed.

- Source evidence must be the observed corporate Telegram username on the
  company's own HTTPS website. Source/evidence age and authorization expiry are
  bounded to 30 days. The exact canonical source URL is bound by its digest.
- Personal contacts, bots, channels, groups, peer-only records and missing or
  substituted evidence cannot pass this policy.
- The first contact is text only. Public-mode media and automatic follow-ups
  are not supported. Existing company and endpoint history prevents a second
  campaign from sending another first contact.
- TG Sender receives a structured proof: policy version, source URL digest,
  approval ID, selection digest, content digest, recipient ID and
  `first_contact_only: true`. A free-form authorization string is insufficient.
- DNC, opt-out, ambiguity, quota and provider FLOOD_WAIT remain authoritative.
  There is no account rotation or bypass of provider restrictions.

## Production configuration and rollback gates

The committed Pages and automation configuration uses `LEAD_RADAR_TELEGRAM_TRANSPORT_MODE=tg_sender` and origin `https://tg-sender-v2.braindigger-uz.workers.dev`. Research, public inquiry, inbox and approved-campaign dispatch are enabled only for the existing owner allowlist. The provider public/inbox flags are enabled too. Original limits and all unrelated runtime settings are preserved. Account connection, exact audience/text approval, source evidence and every delivery guard remain mandatory; enablement did not start a campaign.

For rollback, turn campaign autosend off first. Do not re-enable an old Bridge account or reverse the expanded basis CHECK constraints automatically. Keep pending opt-out custody, receipt records and permanent history even when feature flags are off.

The remote path requires server-side `LEAD_RADAR_TG_SENDER_ORIGIN`,
`LEAD_RADAR_TG_SENDER_TOKEN` and `LEAD_RADAR_TG_SENDER_BINDING_JSON`. The binding
contains only `org_id`, `account_id`, `account_ref`, `sender_fingerprint`.
The current origin allowlist permits the dedicated TG Sender Worker or an
HTTPS Railway app hostname. Redirects, credentials, arbitrary URL paths,
ports, query strings and browser overrides are rejected.

The provider integration has a separate public-inquiry enable flag and a
dedicated scoped integration token. Inbox callbacks use their separate token.
Tokens belong in secret stores; do not include their values in documentation,
logs, browser responses or deployment evidence.

`GET /status` configuration readiness alone is not sufficient. An explicit
session probe performs the provider check when connecting; connection requires
a verification within 60 seconds. Queue dispatch requires a valid non-null
`provider_verified_at`; the client rejects verification older than 24 hours.
Missing or stale verification produces no claim, quota reservation or effect.

Configured campaign bounds remain at most 30 attempts per day and at least
120 seconds between attempts. These are application ceilings, not a promise
that a provider account permits that volume.

## Schema and one-time account transition

- `0080_lead_radar_outreach_inbox.sql`: encrypted inbound storage. Pending
  opt-out rows are a durable sending barrier.
- `0081_lead_radar_public_business_inquiry.sql`: reviewed rebuild of the existing
  campaign dependency graph to extend four CHECK-constrained basis enums. It
  preserves IDs, ciphertext, rows, indexes and foreign keys, rejects unknown
  downstream dependencies, and verifies exact round-trip equality. It does not
  disable foreign keys or use writable-schema edits. Legacy and new runtime
  fingerprints must match their respective migration ledger.
- `0082_lead_radar_outreach_receipts.sql`: additive immutable receipt custody,
  with exact schema fingerprint. It stores binding and digests, not message text,
  session material or tokens. Missing or changed schema blocks remote dispatch.
- `0083_lead_radar_outreach_account_cutovers.sql`: additive proof of an explicitly
  confirmed transition from an existing account to the server-pinned TG Sender
  account. History and the old account row are retained.

An existing active Bridge account is never silently replaced. The owner sees a
confirmation for the exact old account; the server receives only that ID and
uses the pinned target binding. The atomic transition refuses non-terminal
campaigns, active leases, reserved/in-flight/ambiguous delivery, and pending
opt-outs. A matching recorded transition can be retried after a partial
connection failure; an arbitrary previously revoked account is not accepted as
transition evidence. Identity changes cannot reuse a staged connection.

## Rollout and acceptance

1. Freeze and record the actual source commit and current deployment ancestry.
   Capture a recoverable D1 backup, migration ledger, graph row counts, foreign-key
   status, active campaigns, account leases and ambiguous effects. Keep the
   original database and the old account history available for recovery.
2. With autosend and both new feature flags off, validate the complete migration
   sequence against a restored copy of the live schema/data. In particular,
   inspect the 0081 unknown-dependency gate and round-trip checks before applying
   it to live D1. Never force a migration past a failed guard.
3. Provision the exact integration binding and scoped secrets on both runtimes.
   Keep unrelated TG Sender jobs and bot webhooks unchanged. Verify unauthorized,
   cross-tenant, wrong-binding and stale-session requests fail closed.
4. Use the existing guarded production build and Pages release process; release
   the automation Worker separately after its dry-run. Verify the built release
   manifest, public SEO contracts and the actual deployed versions. A successful
   build is not production acceptance.
5. Connect and explicitly confirm any one-time account transition. Confirm the
   real provider verification timestamp, retained account history and absence of
   pending cutover blockers. Connection must not start a campaign.
6. Exercise an owner-controlled test recipient and inbound opt-out. Confirm one
   effect, exact receipt custody, encrypted inbox linkage and suppression. This
   canary requires an explicitly selected test audience; do not send to discovered
   companies as part of infrastructure verification.
7. Enable the intended server flags only after the prior checks. The owner still
   reviews and approves each concrete audience/text. Start a small approved
   campaign and verify terminal delivery, quota, replies and opt-outs before
   increasing activity within the existing limits.

Stop rollout on schema drift, missing backup, mismatched binding/key, unverified
session, unknown provider outcome, unprocessed opt-out or lost callback custody.

## Rollback

Disable campaign autosend first; disable the remote/public feature flags in both
runtime configuration forms as needed. Preserve receipt, inbox, DNC, history,
cutover and migration ledgers. Never resend ambiguous deliveries, reset quota,
delete suppression data or automatically un-revoke the previous account. Do not
reverse 0081 by dropping tables: recover from the verified backup or deploy a
reviewed forward-compatible correction. Old binaries may reject the upgraded
schema, so verify compatibility before rolling application code back.

## Local validation evidence

All commands use `NODE_OPTIONS=--max-old-space-size=1400`. Tests are sequential
and use synthetic SQLite data and mocked transport; no production dispatch was
performed by these tests.

The implementation-specific verification before final global QA passed:

- 119/119: outreach Worker (12), receipts (14), public inquiry (19), legacy
  campaign (74).
- 85/85: discovery wiring, discovery sources, 2GIS, queue reliability and free
  catalog discovery.
- Scoped ESLint on the implementation files and `git diff --check`: exit 0.
- Whole cold Worker statement count, including schema, inbox, public evidence
  and custody: sent 47; ambiguous 49; FLOOD_WAIT 49; paid-message rejection 47.
  All remain within the 50-statement D1 Free invocation bound.
- Invalid account/ref/fingerprint/auth/data-key and missing/stale provider
  verification: zero claim attempts, quota reservations and provider effects.
- A 50-contact audience uses 19 prepare / 27 create statements, with 15 further
  statements reserved for the existing API guards.

Final global QA after the UI/CSS freeze passed:

- `npx tsc -b`: exit 0.
- Functions and Lead Radar dedicated TypeScript projects: exit 0.
- ESLint over all 53 changed/new TypeScript and TSX files: exit 0.
- Registered `test:lead-radar-outreach`: 105/105.
- API, campaign UI, core Lead Radar and release manifest/gate suites: 108/108.
- SEO protection, canonical redirects, commercial contracts, hreflang,
  reviewed content corrections, technical recovery, stylesheet and Pages
  production-release contracts: 62/62.
- `git diff --check`: exit 0.

These 275 final tests overlap the earlier implementation runs; they must not
be added to those counts as a unique-test total. The whole-Worker budget
assertions remain part of the registered outreach suite. The Worker test is
registered in both `test:lead-radar` and `test:lead-radar-outreach`.

Global typecheck, changed/new-file lint and outreach/SEO regression logs are under
`F:/Claude/gptbot-tools/lead-radar-integration-audit-20261107/qa-release/`.
The release owner must append the full production build and live acceptance
separately; these results do not imply deployment or measured lead revenue.
