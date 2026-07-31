# R1 owner checklist

Status: R1.1 synthetic pilot released; real Store Pilot #1 not started.

The dedicated Market bot and webhook prerequisites are complete. One
post-latency-fix owner request remains before R1.1 closeout.

## Completed and verified

- [x] Credential incident remediation and clean canonical repository.
- [x] Production environment names/types checked without printing values.
- [x] Production dependency audits and secret scans pass.
- [x] Fresh production D1 export, checksum and restore validation.
- [x] Migrations through `0030` applied in order; none pending.
- [x] D1 tables, indexes, CHECK limits and critical row counts verified.
- [x] Cloudflare Queue/DLQ/Worker and Pages producer bindings verified.
- [x] First-party automation replay and duplicate suppression verified.
- [x] n8n retired; legacy ingest permanently `410`.
- [x] Automatic publication disabled.
- [x] GitHub SEO scheduler `disabled_manually`.
- [x] Cloudflare automatic deployments disabled.
- [x] Railway GitHub deployment trigger disconnected.
- [x] P3.1 exact-source manual deployment and production canaries pass.
- [x] Dedicated `@gptbot_market_bot` identity verified through `getMe`.
- [x] Token and distinct webhook secret installed through the protected path.
- [x] Isolated webhook configured and verified with zero pending updates.
- [x] R1.1 exact-source deployment `e8b2bd7` and HTTP canary pass.
- [x] Controlled 48-product synthetic catalog installed and grounded.
- [x] Previous Pages deployment and D1 rollback checkpoint recorded.
- [x] Production orders, handoffs, notifications and automation jobs remain 0.

## Owner/provider prerequisites

- [ ] Run one post-fix product request and confirm improved first-response
  latency without sharing credentials.
- [ ] Name one consented, verified Store Pilot #1 business and its owner.
- [ ] Verify each seller Telegram identity out of band and bind it only to its
  own store.
- [ ] Approve 10–30 initial real products and integer UZS prices.
- [ ] Sign off opening inventory baselines and name the correction owner.
- [ ] Agree the seller response SLA and escalation contact.
- [ ] Assign the pilot incident/support owner and communication path.
- [ ] Separately authorize the controlled R1 start and acknowledge hard stops.

Nothing in this checklist authorizes reconnecting Railway, enabling automatic
deployment, enabling a scheduler, restoring n8n, enabling automatic
publication, launching a public marketplace or creating a synthetic provider
identity.
