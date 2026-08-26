# ADR: Lead Radar Telegram campaigns on Cloudflare Free

**Status:** implemented as a disabled release candidate; production migration,
secret configuration, pairing, canary and enablement remain separate operations

**Date:** 2026-08-26

**Scope:** the existing GPTBot monorepository, Cloudflare Workers Free resources
and one owner-operated Windows Bridge

## Context

Lead Radar can discover companies, prepare one reviewed offer and select up to
50 results. The requested transport uses a separate Telegram user account. A
public corporate username proves only that an address exists; it is not consent
for automated outreach. Automatic recipients therefore remain a narrow subset
with an exact, current company endpoint and a separately recorded lawful route.

Cloudflare Workers cannot host a persistent MTProto client on the Free plan.
Cloudflare Containers would require a paid plan and would also move the durable
Telegram session into cloud custody. The product must work without that paid
runtime while preserving tenant isolation, serialization and no-repeat safety.

## Decision

Keep the authenticated control plane and durable business truth in the existing
Pages/D1 application. Replace the Container transport with a local, outbound-only
Windows Bridge and a small Cloudflare gateway backed by a SQLite Durable Object
mailbox.

```mermaid
flowchart LR
  UI[Lead Radar owner UI] --> P[Pages Functions]
  P --> D[(D1 policy and effect ledger)]
  P --> Q[Existing campaign queue]
  Q --> W[Automation Worker]
  W -->|private binding + bearer| G[Free Telegram gateway]
  G --> M[(SQLite DO mailbox)]
  B[Windows Bridge<br/>Telethon + DPAPI] -->|outbound HTTPS poll/result<br/>HMAC authenticated| G
  G -->|signed media stream| R[(Private campaign-media R2)]
  B --> T[Telegram MTProto]
```

- Pages/D1 remain authoritative for organizations, account state, legal basis,
  DNC, campaigns, recipient ordering, limits, effects and permanent no-repeat.
- The existing automation Worker remains the only campaign scheduler. Its
  private gateway call creates or observes one mailbox command. It never calls a
  second Telegram provider.
- The gateway and SQLite Durable Object provide a serialized mailbox and preserve
  the existing private account/send/reconcile contract. They do not contain an
  MTProto client and cannot send independently.
- The Windows Bridge is the only provider boundary. It has no inbound listener,
  accepts no Cloudflare API token and polls the public Bridge API every 15–30
  seconds over HTTPS. A device keeps its Telegram `api_id`, `api_hash`, session
  and any 2FA handling locally. Windows DPAPI protects the session and device
  secret at rest.
- The active gateway configuration has no `[[containers]]` binding. Legacy
  Container code/configuration is reference-only and cannot be a second consumer.
- Railway, a public session server, browser-held Telegram sessions, account pools
  and parallel senders are outside this decision.

## Trust boundaries and authentication

### Private application calls

Pages and the automation Worker reach the gateway through the existing service
binding. Every private request also carries
`Authorization: Bearer LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN`. The same
32-byte base64url secret is configured independently on callers and gateway;
it is never a plain-text Wrangler variable. Missing, malformed or mismatched
authentication fails closed.

Every account/send/reconcile request includes `org_id`. The gateway derives the
stable account reference for that organization and rejects a supplied account
reference that does not match. An organization cannot substitute another
tenant's route even if it learns an opaque reference.

### Device pairing

1. An authenticated owner asks Pages for a pairing ceremony. The browser
   generates at least 128 bits of random enrollment material.
2. Only its digest, tenant, expiry, attempt budget and `used_at` state are stored.
   Consumption is atomic and one-use. The custom URI carries only the nonsecret
   pairing id and origin; the code is copied separately into the Bridge's masked
   local prompt so it never enters a Windows process command line.
3. The Bridge generates its own 32-byte device secret and encryption key pair.
   Cloudflare stores only the device-secret digest and public encryption key.
4. Revocation is an explicit owner action for an exact device. A live connected
   account must be disconnected first. Offline revocation remains visibly
   pending until the Bridge confirms local session destruction; the server does
   not silently replace a paired device.

### Signed Bridge traffic

After enrollment, poll, heartbeat, media retrieval and results are authenticated
with the device secret. The canonical HMAC includes a version/domain separator,
direction, device id, timestamp, nonce, HTTP method, exact pathname and SHA-256
body digest. The gateway uses constant-time comparison, a bounded clock window
and durable nonce uniqueness. A command/result is tenant- and device-bound and
its state transition is a compare-and-swap. Replayed or cross-device results are
rejected.

Send commands and their terminal provider results are durable effect evidence;
they are not expired like transient account-control commands. A recipient cannot
be claimed twice, and reinstalling or replacing the Bridge cannot erase the
server-side no-repeat ledger.

## QR and 2FA custody

Cloudflare never receives plaintext QR/login URLs or a Telegram 2FA password.

1. For each connect attempt the browser creates a non-exportable RSA-OAEP key
   and sends only its SPKI public key, SHA-256 key id and an expiry no more than
   90 seconds in the future.
2. The Bridge encrypts the QR payload to that key. The gateway stores/relays only
   the bounded ciphertext until expiry. The browser decrypts it in memory,
   validates exact tenant/device/command/auth context and expiry, renders the QR
   locally, then destroys the key and image on terminal state, expiry or unmount.
3. If Telegram requires 2FA, the UI obtains the paired Bridge public encryption
   key. The browser hybrid-encrypts an exact, short-lived password envelope with
   RSA-OAEP-256 plus AES-GCM and posts ciphertext only. The envelope is bound to
   organization, device, auth id and the dedicated password command id.
4. Password ciphertext is one-use and short-lived. Plaintext must never enter
   Pages, D1, Durable Object storage, R2, Queue, logs, analytics or browser
   persistence. The password input disables password-manager reuse and is
   cleared immediately after local encryption.

An idempotency operation id and its browser key are indivisible. Reusing an
operation with a different/expired browser key is a conflict; the UI starts a
new operation rather than accepting ciphertext for a discarded key.

## Campaign eligibility and dispatch

The server freezes at most 50 ordered targets and classifies each one:

- `auto_eligible`: exact, fresh, verified corporate endpoint plus a current
  tenant/company/endpoint-scoped authorization (documented consent, qualifying
  company-initiated conversation or applicable existing contract);
- `manual_draft`: a corporate endpoint is available but the automatic-send
  basis is absent or stale;
- `excluded`: DNC, personal/unverified/ambiguous endpoint, duplicate, missing
  route, tenant mismatch or any other fail-closed reason.

Selecting a legal-basis label in the campaign form does not create authorization.
Public or purchased contact data, generic terms and inferred similarity do not
qualify. The UI shows found, Telegram-capable, auto-eligible, manual and excluded
counts before approval.

One Telegram account has one serialized sender. Defaults and hard product limits
are at most 30 automatic sends per policy day and at least 120 seconds between
attempts. A 50-recipient campaign crosses daily boundaries. The system never
rotates accounts, pays Telegram Stars, bypasses flood waits or shortens a provider
restriction.

DNC and authorization are checked before reservation and again immediately
before the mailbox provider boundary. A successful or ambiguous provider effect
permanently blocks the exact tenant/company, keyed Telegram endpoint and stable
verified business aliases. A timeout after provider submission is `ambiguous`
and is never retried automatically. Only a proven pre-provider rejection may
release a reservation.

## Media on the Free architecture

One bounded static JPEG, PNG or WebP may be attached. Pages performs private
decode/format/dimension/pixel validation before registering the media. D1 freezes
an opaque media id, SHA-256 digest, MIME type, exact size and deterministic
tenant-scoped object key:

`lead-radar/campaign-media/{org_id}/{media_id}`

The private send command contains only that immutable source reference; neither
Pages nor a service binding base64-encodes the image and the gateway creates no
per-recipient R2 copy. A Bridge can stream the bytes only through the signed,
command-scoped media endpoint. The gateway rechecks tenant, key shape, R2 HEAD
metadata, size, MIME and digest while streaming. It never deletes the source on
a command result. Multiple recipients safely reuse one campaign object.

Storage is deliberately bounded well below the account allowance: at most 100
active/reserved objects and 250 MiB per organization. Reservation occurs before
`PutObject`; failures are recovered only after a bounded maintenance pass proves
the object absent. Retention cleanup runs even when auto-send is disabled. An
unknown quota, storage or D1 state fails closed, so transient failures cannot
create untracked growth or silently weaken the cap.

## Capability and rollout gates

Migrations `0045` through `0048` are additive. `0048` adds hard campaign-media
quota reservations and safe legacy reconciliation. The exact schema contract,
service binding, internal bearer token, private R2 binding, local-bridge mode and
operational Bridge status are all readiness inputs.

These flags default to the exact string `false`:

- `LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED`
- `LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED`
- `LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED`

Discovery remains an independent research-only capability. Disabling auto-send
stops new provider effects but never disables DNC, disconnect/revocation,
retention, stale reservation cleanup or ambiguous-effect reconciliation.

The Free operational budget uses bounded 15–30 second device polling, one
serialized command claim and bounded maintenance. Release owners must confirm
the Cloudflare account's then-current Workers, Durable Objects, D1 and R2 free
allowances before canary. Approaching or exhausting a platform quota is a
fail-closed availability event, never permission to skip authentication,
no-repeat, retention or storage accounting.

## Consequences

The feature can operate without Cloudflare Containers or a paid Workers plan.
The owner must keep the paired Windows Bridge running and connected; the UI
truthfully reports paired/online, paired/offline and pending-revocation states.
Cloudflare retains campaign policy/effect evidence and short-lived ciphertext,
but not Telegram application credentials, session material or plaintext login
secrets. Automatic sending remains intentionally narrower than all discovered
companies and requires explicit legal and operational approval before enablement.
