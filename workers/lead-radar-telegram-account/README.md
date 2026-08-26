# Lead Radar Telegram gateway — Workers Free

This is the active Telegram user-account transport for Lead Radar. It uses a
Cloudflare Workers Free SQLite Durable Object as a persistent encrypted mailbox
and an outbound-only Windows Bridge for MTProto. It does **not** use Cloudflare
Containers, a cloud Telegram session, or a public listener on the owner PC.

## Runtime boundary

- Public origin: the exact account-owned
  `https://gptbot-lead-radar-telegram-account.braindigger-uz.workers.dev`.
  The custom `lead-radar-bridge.gptbot.uz` origin remains allowlisted for a
  later no-session-loss cutover after the owner grants Workers Routes Edit.
- Public paths are limited to authenticated `/v1/bridge/*` registration,
  polling, result and media streaming. Device requests are HMAC signed;
  commands and acknowledgements are separately server-signed and replay-bound.
- Account control, health, media validation and sends stay private and require
  `LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN` through a Service Binding. The
  device never receives a Cloudflare token.
- Telegram `api_id`, `api_hash`, 2FA input, StringSession and session custody
  stay on Windows under CurrentUser DPAPI and owner/SYSTEM-only ACLs.
- QR and 2FA relays are hybrid-encrypted end to end and expire within 90
  seconds. The Durable Object stores ciphertext only.
- The local SQLite effect ledger uses WAL + FULL synchronization; terminal send
  rows are permanent no-repeat barriers. Unknown outcomes are never retried.

## Exact media and message delivery

Campaign media remains in the tenant-scoped immutable campaign R2 object. The
gateway streams it to the authenticated device after ownership, size, MIME and
digest checks; it never copies, base64-stores or deletes the shared source. The
Bridge rechecks actual bytes, strips image metadata with Pillow and sends one
photo with the exact plain-text caption. Text and captions use
`parse_mode=None`, `formatting_entities=[]`; text disables link preview and a
photo never falls back to a document. Paid-message policy is signed as
`reject`/`false`.

Immediately before send, the Bridge resolves explicit `@username` and accepts
only the exact matching live regular Telegram User. Bots, deleted users,
channels, groups, numeric-id interpretation and mismatches are rejected.

## Active configuration

`wrangler.toml` declares only the `LeadRadarTelegramBridgeMailbox` SQLite
Durable Object, shared private campaign-media R2 binding and the exact
account-owned `workers.dev` public hostname.
Cloudflare secrets are the internal service token plus stable 32-byte data and
routing keys. Telegram API credentials exist only in the Windows vault.

The installer is in `tools/lead-radar-telegram-bridge`. Use Python 3.12 and the
hashed Windows `requirements.lock`. Run `install`, then `configure` once with
Telegram API credentials in named environment variables; they are immediately
moved to DPAPI. Pairing uses a non-secret custom URI plus a masked local prompt
for the separately displayed one-time code, so the code is absent from process
arguments. Manual `pair --stdin` and owner-only `pair --file` are supported.

## Verification

```powershell
npx tsc -p workers/lead-radar-telegram-account/tsconfig.json --noEmit --pretty false
npx tsc -p tsconfig.lead-radar.json --noEmit --pretty false
node --import tsx --test tests/lead-radar-telegram-gateway.test.ts tests/lead-radar-telegram-bridge-crypto.test.ts
py -3.12 -B -m unittest discover -s tools/lead-radar-telegram-bridge/tests -p "test_*.py" -v
npx wrangler deploy --dry-run --config workers/lead-radar-telegram-account/wrangler.toml
```

The release gate runs the Bridge tests, verifies OS-specific hashed locks and
performs a Worker dry-run without Docker or Containers entitlement.

## Historical code

`container/`, `account-object.ts`, `auth-metadata.ts` and `idempotency.ts` are
inactive migration references. They are excluded from the active TypeScript
project, release manifest, workflow, deploy descriptor and runbook and must not
be deployed.

Tests and the release gate never send a live Telegram message or deploy.
