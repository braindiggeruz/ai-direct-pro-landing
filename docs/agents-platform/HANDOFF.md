# GPTBot Agents — handoff

## State

- Date: 2026-07-30.
- Canonical repository:
  `F:\Claude\gptbot-repo-clean-20260729-1140`.
- Branch: `main`.
- Released code commit:
  `9629db58e6b7ec334b680acad053fce161d05137`.
- Pages deployment:
  `20d4c6e2-a69f-489a-b662-2d59122ac8ed`.
- Completed stage: P3.1 Owner Control Center production release.
- Next stage: R1 controlled Sotuvchi pilot readiness.
- R1 pilot started: no.

Never use the recovery repository `F:\Claude\gptbot-repo` or its audit
directory. Preserve
`F:\Claude\gptbot-p3.1-wip-backups\20260730-101520`.

## What was released

The protected `/admin-tools/agents` surface provides platform overview, store
inventory/detail, PII-minimized orders, content-free handoff status,
first-party automation/DLQ replay, append-only audit and controlled pilot
state.

`support_readonly` can read Owner projections and cannot use legacy SEO-admin
reads or any mutation. `platform_owner` can perform bounded, reasoned,
confirmed and idempotent mutations. The signed legacy `admin` role is mapped
explicitly to `platform_owner`. Seller, unknown, expired and wrong-issuer
tokens fail closed.

Migration `0025` adds only `owner_audit_events`, `owner_pilot_stores` and four
indexes. Audit and domain transitions are one guarded D1 batch. Audit metadata
is allowlisted and limited to 2 KiB in application code and D1.

## Release evidence

- Fresh pre-migration export:
  `F:\Claude\gptbot-p3.1-production-backups\20260730-p3.1-pre0025-9629db5\gptbot-ai-drafts-prod-pre0025.sql`.
- SHA-256:
  `2B50D4388B9D9AC458B0AC195B2FBBAEDCDFF686347FEBB2CEFC0D1E61A093F4`.
- Restore validation: `integrity_check=ok`.
- Pre-release production counts were preserved. After canary cleanup:
  organizations, memberships, stores, products, orders, automation jobs and
  automation events are all zero; `ai_drafts=42`,
  `seo_autopilot_jobs=81`.
- Five P3.1 canary audit events remain intentionally.
- Exact production admin bundle:
  `AdminRoot-CpqKduUX.js`, 396129 bytes, SHA-256
  `2deebcc...`; canonical and immutable deployment bytes match.
- Detailed evidence:
  `release/P3_1_OWNER_CONTROL_CENTER.md` and
  `release/P3_1_PRODUCTION_RELEASE_EVIDENCE.md`.

## Operational invariants

- `N8N_DISPOSITION=RETIRED`.
- First-party automation is the sole path.
- Automatic publication is disabled.
- GitHub SEO scheduler is `disabled_manually`.
- Cloudflare Pages automatic deployment is disabled.
- Railway GitHub deployment trigger is disconnected.
- GPTBot AI Market is not launched.
- Agents webhook is fail-closed until a dedicated bot identity is installed.

## R1 prerequisite

The remaining owner/provider prerequisite is BotFather ownership of a
dedicated Agents bot. Verify it with `getMe`, keep it distinct from protected
Lead/Javob identities, and install its token and a distinct webhook secret via
the protected owner path. Never put credentials in chat or governance files.

After that provider prerequisite is complete, separately authorize and run the
R1 controlled-pilot runbook for 1–3 verified stores. Do not invent a bot or
store, reconnect Railway, enable a scheduler, enable n8n, enable automatic
publication, launch a marketplace, or create real orders automatically.

## Start commands

```powershell
Set-Location F:\Claude\gptbot-repo-clean-20260729-1140
git status --short --branch
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
```

Expected code head before the governance follow-up commit:
`9629db58e6b7ec334b680acad053fce161d05137`. The governance commit that
contains this handoff must not trigger a Cloudflare or Railway deployment.
