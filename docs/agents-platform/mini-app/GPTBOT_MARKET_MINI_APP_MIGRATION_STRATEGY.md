# GPTBot Market Mini App migration and coexistence strategy

## Principle

`UI MIGRATION, NOT DOMAIN REBUILD`

Bot and Mini App are two adapters over one application/domain model. D1,
service authorization, workflows, operation logs, OCC, outbox and Telegram
delivery remain authoritative throughout the transition.

## Coexistence stages

| Stage | Change / remains | Cohort and flag | Tests, metrics and canary | Rollback and stop conditions |
| --- | --- | --- | --- | --- |
| A — bot canonical | Mini App shell/read-only prototype uses synthetic fixture and real read services; all real tasks remain bot | internal synthetic identities; `market_app_enabled=false` in production | auth shell, contract, bot regression, no writes | remove frontend route/disable preview; stop on auth/CORS/schema/bot regression |
| B — buyer read-only | home/categories/search/detail/compare through BFF; checkout/orders remain bot; button opens app for synthetic cohort | `buyer_read_enabled` allowlist; one synthetic store | search parity, zero-result, media, RU/UZ, WebView; result/product/fallback metrics | flag off returns to bot; stop on cross-store, fact mismatch, p95/error budget |
| C — buyer transaction parity | checkout, order history/detail and handoff use same services; bot flow remains fully available | separate `buyer_commands_enabled`, synthetic users first | duplicate tap/two-device, price/stock race, one notification, recovery; completed request and fallback | disable commands/read app remains; bot resumes existing draft; stop on any duplicate/PII/notification failure |
| D — seller read-only | verified seller dashboard/orders/questions/products/status; mutations stay bot | `seller_read_enabled`, synthetic owner only | revoked role, list/detail privacy, pause/suspend, counts | hide seller routes; bot dashboard; stop on PII/authority mismatch |
| E — seller controlled mutations | order transitions and reply first; stock later; catalog edit/publish separate subflag | per-seller allowlist + per-command flags | OCC/concurrency/exactly-once, notification/handoff parity, real-device evidence | each command flag off; same task in bot; stop on stock/transition/intent invariant |
| F — Mini App primary | app is default visual UI; bot entry, search fallback, notifications, handoff and support remain | Store Pilot #1 then bounded real cohorts; `market_primary_ui` | four-week stability window proposed, task success, fallback, support load, SLOs | menu/launch flag back to bot without data migration; stop on SLO/product harm |
| G — callback reduction | low-use visual callbacks become fallback/deprecated only after parity | per-callback flag, never blanket removal | callback usage, fallback success, support and rollback drill | re-enable callback immediately; stop if recovery or accessibility worsens |

Stage letters describe user coexistence; the detailed implementation tasks are
the `MA-*` roadmap. A stage never inherits approval merely because code exists.

## Feature-flag design

Flags are evaluated server-side from trusted identity/store cohort data. The
client receives only resulting capabilities.

Proposed hierarchy:

```text
market_app_global
  buyer_read
  buyer_commands
  seller_read
  seller_order_commands
  seller_reply_command
  seller_stock_command
  seller_catalog_commands
  primary_ui
  legacy_callback_<capability>
```

Rules:

- global kill switch wins;
- environment, store and identity cohort must all pass;
- seller flags never create seller authority;
- every command has an independent emergency disable;
- the fallback bot path is not gated by a Mini App flag;
- flag evaluation and version are exposed as safe capability booleans, not
  rules the client can override;
- no payment or platform-owner flag exists in this program.

Initial flags may be code/config allowlists for synthetic identities. A new
database flag system is not justified before real cohort operations.

## Deployment and release sequence

### Environments

- Local: explicit mock Telegram adapter and synthetic D1; production auth
  bypass code must not be included in production output.
- Staging: dedicated Mini App Pages project/hostname, staging/test bot identity,
  non-production D1 copy or synthetic environment, exact staging BFF origin.
- Production: proposed `market.gptbot.uz` static app and current `gptbot.uz`
  BFF; real bot launch action requires separate owner approval.

### Release order

1. verify clean source and record exact source/rollback SHAs;
2. run contracts, full bot/platform tests, secret scan, bundle/visual/security
   gates;
3. manually deploy BFF exact SHA with all app flags off;
4. smoke bot webhook, GPT Chat, site and Owner Control Center;
5. manually deploy immutable Mini App frontend exact SHA;
6. verify staging/production auth, CSP/CORS, build/API compatibility;
7. enable one synthetic identity/store capability flag;
8. observe metrics and execute rollback drill before expanding cohort;
9. record deployment IDs, source SHA, flag state and immediate rollback.

Cloudflare auto-deploy remains disabled. Railway is not connected. n8n is not
restored. BotFather/menu/webhook changes are excluded until the matching owner
gate.

## Rollback without bot downtime

| Failure scope | First action | Rollback target | Data handling |
| --- | --- | --- | --- |
| frontend visual/runtime | global or surface flag off; bot recovery message | prior immutable Mini App frontend | none; server drafts/orders remain |
| read BFF | read flag off | prior main Pages deployment if required | no migration; bot unchanged |
| buyer command BFF | `buyer_commands=false`; keep read-only if safe | prior BFF deployment | existing checkout/order state resumes in bot |
| one seller command | disable only that command | prior BFF or endpoint flag | OCC/idempotency determine final server state; no client rollback writes |
| auth/CORS/CSP | global app flag off | last known compatible frontend/BFF pair | sessions expire; no identity deletion |
| media | images flag/proxy off | text/placeholder and bot photo | product `file_id` unchanged |
| platform-specific UX | exclude affected client/cohort if safe; otherwise global off | previous frontend | no data change |

Never “undo” a successful domain mutation from the client during rollback.
Reconcile by current D1 truth, operation records and audit evidence.

## Synthetic canary

MA-8 uses only the current synthetic store/catalog and synthetic Telegram
identities. It must demonstrate:

- valid/invalid launch and direct-browser recovery;
- buyer discovery → compare → checkout → order → notification → handoff;
- seller list/detail → confirm/cancel/done → stock/intent exactly once;
- store pause/suspend and role revocation mid-session;
- repeated taps, two devices, reload, network loss and rollback;
- RU/Uzbek Latin, light/dark, 320–430 px, iOS/Android/Desktop/Web;
- no raw data in logs/events and no secret in bundle/media URL;
- bot, website, GPT Chat and Owner Control Center remain green.

No synthetic success authorizes a real store.

## Store Pilot #1 transition

MA-9 requires separate approval and all existing Store Pilot #1 business
inputs, plus:

- verified seller identity/membership and named support owner;
- approved production hostname, test bot and BotFather/menu rollout action;
- native Uzbek review, real product photo rights/media policy and truth review;
- signed pilot scope, cohort IDs, service/incident hours and stop authority;
- backup/rollback evidence and trained bot fallback;
- buyer/seller consent and privacy wording where legally required;
- daily evidence review with a very small invited buyer cohort.

Start real pilot read-only. Enable buyer commands only after real catalog/media
truth is approved. Enable seller commands one by one. No payment or public
listing is inferred.

## Legacy callback deprecation rules

A callback may become secondary only when all are true:

1. matching Mini App task has at least four consecutive weeks of agreed SLOs
   in the target cohort (duration is proposed and owner-adjustable);
2. task success is no worse than bot baseline and fallback succeeds;
3. RU/UZ, accessibility and all supported clients pass;
4. bot notifications, `/start`, lightweight search, support and emergency
   recovery remain;
5. the callback has an independent re-enable flag and a tested rollback;
6. support owner signs off and no P0/P1 is open.

Deletion is a separate future decision. MA-10 only reduces prominence.

## Data migration classification by roadmap stage

| Stage | No schema | Optional schema | Required schema |
| --- | --- | --- | --- |
| MA-0–MA-3 | all planned work | none | none |
| MA-4 buyer transactions | existing workflow/orders/idempotency | strict auth replay ledger if mandated | none currently demonstrated |
| MA-5 seller reads | existing domain queries | pagination/index after measured query plan | none currently demonstrated |
| MA-6 seller mutations | existing operation/version/outbox | new audit event only if current operations insufficient | none currently demonstrated |
| MA-7 media/productization | Telegram media proxy | R2/media metadata after evidence | none for synthetic/pilot proxy |
| MA-8–MA-10 | flags/cohorts in config initially | durable cohort/rollout records at scale | only after separate ADR |

The default remains no new D1 migration. Optional does not mean pre-approved.
