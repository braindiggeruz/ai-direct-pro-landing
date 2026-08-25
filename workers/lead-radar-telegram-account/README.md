# Lead Radar Telegram account gateway

Private, service-binding-only Telegram user-account transport for Lead Radar.
It implements the account-campaign architecture accepted in
`docs/LEAD_RADAR_TELEGRAM_CAMPAIGNS_ADR.md`: one Durable Object and one
official-TDLib Container per organization account slot, with an
application-encrypted session archive in a private R2 bucket.

This directory is deployable infrastructure, not proof of a production
deployment. The production flags remain false until all release gates in
`docs/LEAD_RADAR_PRODUCTION_RUNBOOK.md` pass.

## Trust boundary

- `workers_dev = false` and no route is declared. The entry Worker additionally
  requires the internal service-binding origin.
- The automation Worker is the only intended caller. The target Worker must be
  deployed before adding its service binding to the caller.
- One stable Durable Object identity is derived from `(org_id, primary slot)`
  using `LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY`. It is independent from the
  rotatable session-encryption key.
- QR images/login links, phone numbers, login codes and 2FA passwords live only
  in request and process memory. Durable Object storage keeps only the opaque
  auth/operation IDs, auth mode and expiry needed to recover after isolate
  eviction; sensitive challenge material is absent from Durable Object
  storage, R2 metadata, the effect ledger and logs.
- The TDLib archive is encrypted before R2 with a random per-account seed. The
  seed is envelope-wrapped by the versioned application key. TDLib's local
  database gets a separate HKDF-derived subkey.
- Disconnect is fail-closed: dispatch is stopped before logout. The encrypted
  snapshot and wrapped seed are deleted only after TDLib confirms remote
  logout. An unconfirmed logout retains custody for a safe retry and returns
  `remote_revoke_unconfirmed`.

## Private API

All JSON responses use
`gptbot.lead-radar.telegram-account-service.v1`, are `no-store`, and contain
closed-list reason codes only.

Existing v1 endpoints:

- `POST /v1/accounts/connect` — start QR login; idempotency key required by the
  caller contract.
- `GET /v1/accounts/connect/active?org_id=...` — recover an unexpired durable
  auth attempt. The DO rehydrates state from its attached TDLib Container and,
  after a Container restart, requests a fresh QR challenge without persisting
  the QR image or link.
- `POST /v1/accounts/connect/status` — legacy-compatible QR poll.
- `POST /v1/accounts/disconnect` — confirmed remote logout followed by session
  deletion.
- `POST /v1/messages/send` — one serialized, paid-message-disabled provider
  effect.

Extended authentication/recovery endpoints:

- `POST /v1/accounts/connect/phone/start`
- `POST /v1/accounts/connect/phone`
- `POST /v1/accounts/connect/code`
- `POST /v1/accounts/connect/resend`
- `POST /v1/accounts/connect/password`
- `POST /v1/accounts/connect/cancel`
- `POST /v1/accounts/connect/state` — detailed FSM state for the UI.
- `POST /v1/messages/reconcile` — content-free effect reconciliation by
  `account_ref`, operation ID and payload digest. It never sends.
- `GET /v1/accounts/health?org_id=...`
- `GET /v1/health` and `GET /v1/capabilities`

Authentication is bounded to one 10-minute attempt. Durable rate windows limit
starts, phone submissions, codes, resends, passwords and polling. Every auth
response is `no-store`. QR responses contain both a PNG data URL and a strictly
validated, short-lived `tg://login?token=...` alternative for opening Telegram
on the same device; both are memory-only. Successful authorization calls TDLib
`getMe`; only a bounded masked label and verification timestamp survive.

## Provider-effect invariants

The Durable Object and Container each keep a digest-only idempotency ledger.
An operation ID reused with another payload returns a conflict. A live duplicate
or a crash after reservation resolves to `ambiguous`; it is never sent again.
An expired DO lease is first terminalized as `ambiguous`, then the account may
accept later work. The per-account active-effect key permits one provider
boundary at a time. A bounded opportunistic sweep inspects at most 32 retained
effect rows per reservation/reconciliation/health request and deletes only
expired terminal rows; in-flight, active, malformed and future rows are always
retained fail-closed.

The adapter resolves the current public username immediately before send and
accepts only a private chat whose current peer is a regular user. Bots,
channels, groups and supergroups are rejected. Corporate ownership and lawful
basis remain D1/API responsibilities and must be rechecked before the queue
claim; this transport check cannot turn a public username into consent.

`messageSendOptions` always has `allow_paid_broadcast=false` and
`paid_message_star_count=0`. Paid-message requirements are terminally rejected.
Flood/premium-flood/slow-mode waits pause the account for the complete provider
wait, without shortening or account rotation. Provider restrictions require
explicit reconnect. Ambiguous effects pause the account for operator review.

## Bindings and secrets

Gateway bindings declared in `wrangler.toml`:

- `TELEGRAM_ACCOUNTS` — `LeadRadarTelegramAccount` SQLite Durable Object.
- `TELEGRAM_SESSION_BUCKET` — private
  `gptbot-lead-radar-telegram-sessions` R2 bucket, with no development URL or
  custom domain.
- Container image — `container/Dockerfile`, `linux/amd64`, maximum five pilot
  instances.

Secrets, provisioned through Cloudflare controls without values in shell
history or reports:

- `LEAD_RADAR_TELEGRAM_API_ID`
- `LEAD_RADAR_TELEGRAM_API_HASH`
- `LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY` — independent stable 32-byte
  base64url key. Treat replacement as an account-routing incident, not routine
  rotation.
- `LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY` — current 32-byte base64url envelope
  key.
- optional `LEAD_RADAR_TELEGRAM_ACCOUNT_PREVIOUS_DATA_KEYS` — JSON object of at
  most three prior `key_version: base64url_key` values, stored as one secret.

Non-secret configuration identifies current key version, gateway version and
the exact TDLib source commit.

For rotation, add the old key to the previous-key secret, change the current
data key and `LEAD_RADAR_TELEGRAM_ACCOUNT_KEY_VERSION`, then deploy. The first
account access unwraps with the recorded old version and atomically rewraps the
same per-account seed with the current key. Retain the old key until every
account has been observed rewrapped and its release evidence is complete.

The automation Worker still needs the private caller binding:

```toml
[[services]]
binding = "LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE"
service = "gptbot-lead-radar-telegram-account"
```

That shared caller descriptor is intentionally outside this directory and must
be updated in the coordinated release after the target exists.

Service-binding time budgets are operation-specific: 75 seconds for auth and
disconnect control paths, 90 seconds for reconciliation and 120 seconds for a
send including cold restore and encrypted snapshot export. Platform callers
must retain a larger bounded outer deadline (currently 80/125 seconds for
control/send), and browser control requests a further bounded margin. This
ordering prevents a caller abort from misclassifying a still-running provider
effect.

## Reproducible image inputs

- TDLib is built from the official `tdlib/td` repository at full commit
  `d1085f9cebc5a62379991ae1652673954f229c1f`; no floating branch or third-party
  binary is used.
- The Debian multi-architecture base manifest is pinned by digest.
- Apt repositories use a fixed `snapshot.debian.org` timestamp.
- `container/tdlib-schema-contract.txt` vendors the reviewed function
  signatures that the JSON adapter emits. Tests bind it to the same commit.
- The runtime is non-root and listens only on the Container port owned by the
  Durable Object.

The Worker uses Cloudflare's typed low-level Durable Object Container surface
(`this.ctx.container`) supplied by the pinned Workers runtime types. It does not
add `@cloudflare/containers`: that package's `Container` base class would own a
second Durable Object lifecycle, while this gateway already needs its own
account DO for encrypted custody and the effect ledger.

Before production, generate and retain an SBOM, vulnerability report, signed
image digest and rollback digest. A source pin alone is not that evidence.

## Verification

Run from repository root:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -p workers/lead-radar-telegram-account/tsconfig.json --noEmit --pretty false
npx eslint workers/lead-radar-telegram-account/*.ts tests/lead-radar-telegram-gateway.test.ts
node --import tsx --test tests/lead-radar-telegram-gateway.test.ts
py -3 -m unittest workers/lead-radar-telegram-account/container/test_correlation.py
npx wrangler deploy --dry-run --containers-rollout=none --config workers/lead-radar-telegram-account/wrangler.toml
```

The final Container dry-run/build requires a running Docker-compatible engine.
`--containers-rollout=none` proves the Worker bundle and binding descriptor but
does not build, scan or validate the image.

The 24 MiB compressed session limit prevents simultaneous plaintext and
ciphertext buffers from exhausting the 128 MiB Worker memory budget. An
oversized archive fails closed as `snapshot_too_large`; sending remains paused
and the operator must reconnect or follow the reviewed manual session-remedy
procedure. The gateway never silently stores an unencrypted or truncated
archive.

## Current deployment blockers (2026-08-25)

- Docker is unavailable on the owner workstation, so the pinned TDLib image has
  not been built locally and has no reviewed image digest/SBOM/signature.
- The current Cloudflare credential/account check reports a Containers
  authentication/capability error. Workers Paid/Containers entitlement and a
  budget alert must be confirmed.
- The private R2 bucket, gateway secrets, Durable Object migration, Container
  rollout and caller service binding have not been proven by this directory.
- A real Telegram login, revoke/restore test and zero-send canary require the
  owner's `api_id`/`api_hash` and interactive approval.
- Automatic sending remains blocked behind the existing exact-false feature
  flags plus legal/data-owner acceptance. No live message was sent by these
  changes.
