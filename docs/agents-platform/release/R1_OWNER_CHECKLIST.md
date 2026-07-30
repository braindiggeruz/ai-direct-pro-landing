# R1 owner checklist

Status: technical gates complete; pilot not started.

## Completed and verified

- [x] Credential incident remediation and clean canonical repository.
- [x] Production environment names/types checked without printing values.
- [x] Production dependency audits and secret scans pass.
- [x] Fresh production D1 export, checksum and restore validation.
- [x] Migrations through `0025` applied in order; none pending.
- [x] D1 tables, indexes, CHECK limits and critical row counts verified.
- [x] Cloudflare Queue/DLQ/Worker and Pages producer bindings verified.
- [x] First-party automation replay and duplicate suppression verified.
- [x] n8n retired; legacy ingest permanently `410`.
- [x] Automatic publication disabled.
- [x] GitHub SEO scheduler `disabled_manually`.
- [x] Cloudflare automatic deployments disabled.
- [x] Railway GitHub deployment trigger disconnected.
- [x] P3.1 exact-source manual deployment and production canaries pass.
- [x] Previous Pages deployment and D1 rollback checkpoint recorded.
- [x] Synthetic canary operational data removed.

## Owner/provider prerequisites

- [ ] Create and retain ownership of a dedicated Telegram Agents bot in
  BotFather.
- [ ] Verify the exact identity through `getMe` and confirm it is distinct from
  protected Lead/Javob identities.
- [ ] Install its token and a new, distinct webhook secret through the
  protected credential path; never put values in chat.
- [ ] Separately authorize and configure the exact webhook.
- [ ] Name 1–3 consented, verified pilot stores and their owners.
- [ ] Assign the pilot incident/support owner and communication path.
- [ ] Separately authorize the controlled R1 start and acknowledge hard stops.

Nothing in this checklist authorizes reconnecting Railway, enabling automatic
deployment, enabling a scheduler, restoring n8n, enabling automatic
publication, launching a public marketplace or creating a synthetic provider
identity.
