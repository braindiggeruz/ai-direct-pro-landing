# CURRENT_STATE — 2026-07-30

## Current production state

P3.1 Owner Control Center is reviewed, merged and live in production.

- Canonical `main` release commit:
  `9629db58e6b7ec334b680acad053fce161d05137`.
- Manual Cloudflare Pages deployment:
  `20d4c6e2-a69f-489a-b662-2d59122ac8ed`.
- Immutable deployment URL:
  `https://20d4c6e2.ai-direct-pro-landing.pages.dev`.
- Canonical domain: `https://gptbot.uz`.
- D1 migration `0025_owner_control_center_audit.sql` is applied; there are no
  pending migrations.
- The pre-migration export was restored in memory and passed
  `PRAGMA integrity_check = ok`. Its SHA-256 is recorded in `STATE.json` and
  the protected backup directory outside Git.
- Cloudflare Pages automatic production and preview deployment are disabled.
  Railway's GitHub deployment trigger is disconnected. The GitHub SEO
  scheduler is `disabled_manually`.

## Security and canary verdict

The independent review found and fixed three defects before merge:

1. pagination offset had no upper bound;
2. `support_readonly` could cross the legacy SEO-admin boundary;
3. a retired n8n runtime field had been reintroduced in an Owner overview.

The release gates pass:

```text
AUTHENTICATION=PASS
AUTHORIZATION=PASS
LEGACY_ADMIN_BOUNDARY=PASS
TENANT_ISOLATION=PASS
AUDIT_SAFETY=PASS
IDEMPOTENCY=PASS
MIGRATION_SAFETY=PASS
NO_IMPERSONATION=PASS
NO_N8N=PASS
NO_AUTO_PUBLICATION=PASS
NO_PUBLIC_MARKETPLACE=PASS
```

Local verification is `925/925` tests across 36 suites, including `69/69`
Owner Control Center tests. Both TypeScript gates, scoped lint, root and
backend builds, Pages Functions compilation, production dependency audits,
route parity and repository/built-asset secret scans pass.

Production canaries verified:

- real owner login and all eight Owner API/UI surfaces;
- owner and support reads; support, seller and unknown-role mutations denied;
- expired and wrong-issuer JWTs denied; the legacy JWT contract has no
  audience claim;
- missing reason, incorrect typed confirmation and request-supplied tenant
  overrides denied;
- suspend/restore and pilot activate/pause with exactly one domain effect and
  exactly one audit event per logical operation;
- duplicate requests replay the same result and a changed logical operation
  under the same key returns `409 idempotency_conflict`;
- a real Queue/Worker replay returns the synthetic missing reference safely to
  `dead_letter`, without creating or publishing a draft;
- `LOGIN_ATTEMPTS` survives a process boundary and returns `429`;
- retired n8n ingest returns `410`; the Agents webhook remains fail-closed at
  `503` until its dedicated bot identity exists;
- all synthetic operational rows were removed by exact ID. Five bounded audit
  events remain as release evidence.

The built-in browser webview did not attach during this session. Therefore the
UI release was verified through the exact production asset hash, eight
production SPA routes, role-aware source/behavior tests and API authorization,
not by claiming a visual browser session that did not occur.

## Automation and product boundaries

- First-party D1 + Queue automation is the sole supported automation path.
- n8n is retired and cannot be restored by an environment flag.
- Automatic publication is disabled; the canary left all 42 existing drafts
  unchanged (`5 imported`, `37 pending_review`).
- GPTBot AI Market remains a disabled internal placeholder. It is not a public
  marketplace.
- R1 has not started. No real store, seller, buyer, order, inventory movement,
  payment, webhook or Telegram bot was created by this release.

## Next stage

R1 is technically ready up to one owner/provider prerequisite:

1. the owner creates and retains ownership of a dedicated Telegram Agents bot
   in BotFather;
2. its identity is verified with `getMe` and confirmed distinct from the
   protected Lead/Javob bot identities;
3. the token and a distinct webhook secret are installed through the protected
   credential path, never in chat;
4. under separate authorization, select 1–3 verified stores and run
   `release/R1_SOTUVCHI_CONTROLLED_PILOT_RUNBOOK.md`.

Do not reconnect Railway, enable the SEO scheduler, reintroduce n8n, enable
automatic publication, start a public marketplace, invent stores/bots, or
create real orders as a shortcut.
