# Bormi Public Beta 1.0 — максимальный технический handoff

> Этот документ создан 2026-08-04 после коммита реализации `e94e8df5d19e8a0d3406aa5003ec19be98a26adf`.
> Он предназначен для нового агента, которому нужно продолжить работу без истории чата.
> Документ описывает фактическую работу этой сессии, текущие ограничения, доказательства,
> незакрытые gates и безопасный порядок продолжения. Это **не** заявление `GO`, не подтверждение
> production deployment и не разрешение на production mutation.

## 0. Сначала прочитай это

Работа велась по двум owner-промтам:

1. `C:\Users\Borinio\.codex\attachments\19945a29-9889-4496-898c-09c610306441\pasted-text.txt`
   — независимый audit-only промт, по которому был создан полный аудит.
2. `C:\Users\Borinio\.codex\attachments\e654fad6-5059-437f-bab1-fee790f23274\pasted-text.txt`
   — автономное доведение Bormi к evidence-based Public Beta 1.0.

Ключевое правило второго промта: 100% означает не «много кода», а доказанный production release
с нулём P0/P1, закрытыми launch-blocking P2, реальными owner/device/cohort доказательствами,
backup/restore/rollback, trust/legal/operations и согласованной release provenance.

Этот handoff имеет приоритет для текущего Bormi beta-трека над старыми Bormi-утверждениями в
`docs/agents-platform/STATE.json` и `docs/agents-platform/HANDOFF.md`: эти файлы содержат большой
исторический контекст, но их Bormi deployment/test/next-stage данные датированы более ранними
релизами и местами уже не соответствуют текущей release-ветке. Не удаляй их и не переписывай
механически. При конфликте используй приоритет:

1. текущий код и Git;
2. свежая read-only production проверка;
3. этот handoff и `docs/production-closure/2026-08-04/*`;
4. внешний master audit;
5. старые platform handoff/state документы.

## 1. Executive truth — где остановилась работа

Локально и в удалённой release-ветке завершены:

- release/restore tooling;
- remediation первоначальных test/lint/dependency проблем;
- isolated Admin preview proof;
- classifieds-first domain foundation;
- additive migrations `0034`–`0039`;
- global buyer discovery API;
- bilingual RU/Uz buyer Mini App;
- identity-scoped favorites;
- privacy-safe in-app inquiries;
- report submission;
- global classifieds voice search;
- synthetic buyer walkthrough и production-shaped migration rehearsal.

Работа остановилась **после завершения buyer slice**, перед следующими крупными блоками:

1. reconciliation свежего `origin/main` с release-веткой;
2. полный повторный release gate после merge;
3. private seller lifecycle и seller inquiry handling;
4. Admin moderation/report UI и safe commands;
5. owner Admin confirmation/canary;
6. Telegram identity-binding и native QuickPost/voice/device canaries;
7. trust/abuse/privacy/legal/operations;
8. production migrations/deploy/flags/canary;
9. real beta cohort.

Никаких production migrations `0034`–`0039`, production classifieds deployment, включения
classifieds/private-listing/QuickPost flags, production listing mutation или real-user canary
в этой сессии не было.

## 2. Machine-readable snapshot

```text
PROJECT=Bormi
TARGET_RELEASE=BORMI_PUBLIC_BETA_1.0
TARGET_MODEL=CLASSIFIEDS_FIRST_HYBRID
TARGET_REGION=Tashkent_first_cohort
DATE=2026-08-04

CANONICAL_REPO=F:\Claude\gptbot-bormi-api-fix
REMOTE=https://github.com/braindiggeruz/ai-direct-pro-landing.git
BRANCH=release/bormi-public-beta-1
IMPLEMENTATION_HEAD=e94e8df5d19e8a0d3406aa5003ec19be98a26adf
REMOTE_RELEASE_HEAD=e94e8df5d19e8a0d3406aa5003ec19be98a26adf
CURRENT_ORIGIN_MAIN_AT_HANDOFF=26440642fca0f735e3f8744117650c14f52b2146
RELEASE_MAIN_MERGE_BASE=7cc234144f3fd21c3d800f947d086c37bd99b120
ORIGIN_MAIN_UNIQUE_COMMITS=5
RELEASE_UNIQUE_COMMITS=5
RELEASE_TAG=NONE

LAST_AUDITED_PRODUCTION_ROOT_SOURCE=5a5111f90b8e1816069802a8fa06aa41d21e09b6
LAST_AUDITED_PRODUCTION_MINI_SOURCE=3c8da0a
CURRENT_LIVE_PRODUCTION_SOURCE=REVERIFY_REQUIRED
PRODUCTION_SOURCE_5a5111f_IN_CURRENT_ORIGIN_MAIN=YES

LAST_VERIFIED_PRODUCTION_D1_LEDGER=33
LOCAL_MIGRATIONS_PREPARED=0034,0035,0036,0037,0038,0039
LOCAL_MIGRATION_REHEARSAL=PASS
PRODUCTION_MIGRATIONS_0034_0039=NOT_APPLIED
PRODUCTION_WRITES_THIS_IMPLEMENTATION=0

MARKET_CLASSIFIEDS_DISCOVERY_ENABLED=false
MARKET_PRIVATE_LISTING_ENABLED=false
MARKET_QUICKPOST_ENABLED=false
MARKET_QUICKPOST_AI_ENABLED=false
MARKET_OWNER_TELEGRAM_BINDING_ENABLED=false
MARKET_NAV_BACK_ENABLED=true

BUYER_CLASSIFIEDS_CODE=IMPLEMENTED_BEHIND_FLAGS
PRIVATE_SELLER_PROFILE_API=IMPLEMENTED_BEHIND_FLAG
PRIVATE_LISTING_SUBMIT_API=IMPLEMENTED_BEHIND_FLAG
PRIVATE_SELLER_COMPLETE_LIFECYCLE=NOT_IMPLEMENTED
ADMIN_MODERATION_UI=NOT_IMPLEMENTED
SELLER_INQUIRY_REPLY_FLOW=NOT_IMPLEMENTED
OWNER_ADMIN_REAL_SESSION=NOT_VERIFIED
ADMIN_LISTING_PRODUCTION_CANARY=NOT_STARTED
TELEGRAM_SELLER_BINDING_CEREMONY=NOT_STARTED
QUICKPOST_NATIVE_CANARY=NOT_STARTED
CLASSIFIEDS_NATIVE_DEVICE_CANARY=NOT_STARTED
LEGAL_APPROVAL=NOT_STARTED
REAL_BETA_COHORT=NOT_STARTED

LAST_AUDITED_READINESS_PERCENT=58
CURRENT_EVIDENCE_BASED_READINESS_PERCENT=NOT_RECALCULATED
PUBLIC_BETA_GO_NO_GO=NO_GO
```

`CURRENT_ORIGIN_MAIN_AT_HANDOFF` и live production данные могут измениться. Первая задача нового
агента — повторить read-only reconciliation, а не доверять этому snapshot как вечной истине.

## 3. Репозиторий, ветка и текущая Git-развилка

Каноническая рабочая копия:

```text
F:\Claude\gptbot-bormi-api-fix
```

Release-ветка создана от merge-коммита `7cc2341`, который объединил две существовавшие линии:

- `5a5111f` — исторически задеплоенный Admin return-path source;
- `b597398` — тогдашнюю `origin/main` SEO-линию.

После `7cc2341` в release-ветке пять Bormi-коммитов:

| SHA | Commit | Назначение |
| --- | --- | --- |
| `851d81a` | `fix(release): make Cloudflare artifact restorable` | exact-SHA preflight, D1 export/restore, Admin в Cloudflare artifact |
| `e52e787` | `fix(beta): close phase-one quality gates` | тесты, lint, Node Mini harness, dependency advisory, lockfile |
| `89917c3` | `test(beta): capture isolated admin preview evidence` | preview smoke/evidence и binding precheck |
| `86b3060` | `feat(beta): add classifieds-first domain foundation` | ADR, migrations `0034`–`0037`, classifieds domain/API/tests |
| `e94e8df` | `feat(beta): add global classifieds buyer journey` | migrations `0038`–`0039`, buyer API/UI/voice/evidence |

После создания release-ветки `origin/main` получил пять SEO-коммитов:

```text
64bbe0a docs(seo): research and briefs for the SMM services cluster
bb2ec50 feat(content): three supporting articles for the SMM services cluster
b249160 feat(seo): wire the smm-ru cluster - hub, links and intent ownership
22e08ba docs(seo): link map, implementation report, QA evidence and handoff
2644064 docs(seo): record the merge, the production deploy and the index baseline
```

На момент handoff:

```text
git rev-list --left-right --count origin/main...HEAD
# 5 5
```

То есть release не «просто впереди main». Обе стороны имеют по пять уникальных коммитов.
Нельзя push-force, rebase опубликованной release-ветки, reset или cherry-pick вслепую. Безопасный
путь — сначала fresh fetch и diff, затем обычный merge `origin/main` в release-ветку, полный gate,
и только потом отдельно решать promotion release → main. Не делать production deploy из
непримирённой линии.

Другие worktrees существуют и не являются текущей Bormi beta copy:

- `F:\Claude\gptbot-repo-clean-20260801`;
- `F:\Claude\gptbot-main-baseline-20260801`;
- `F:\Claude\gptbot-seo-smm-20260804`.

Не выполняй Bormi работу в них по ошибке.

## 4. Неизвестные/untracked файлы — не удалять и не присваивать

До создания этого handoff в canonical worktree уже находились чужие незакоммиченные Admin
evidence-файлы:

```text
?? docs/production-closure/2026-08-04/evidence/admin-preview-core-e52e787/expired-session-401.png
?? docs/production-closure/2026-08-04/evidence/admin-preview-e52e787/
```

Они намеренно не были staged, удалены, перемещены или включены в `e94e8df`. Не использовать
`git add .`, `git clean`, recursive delete или массовое перемещение. Перед каждым commit делать
только targeted `git add <explicit-files>`.

Этот `20_FINAL_HANDOFF.md` создан по прямому запросу owner после `e94e8df`; если он передаётся
как локальный файл и ещё не закоммичен, это ожидаемо. Не смешивать его с чужими Admin evidence.

## 5. Исходный master audit

Внешние audit artifacts находятся вне Git worktree:

```text
F:\Claude\bormi-audit\2026-08-04\
```

Там 19 документов от `01_EXECUTIVE_SUMMARY.md` до `19_EVIDENCE_INDEX.md`. Исходный audit-only
вердикт:

```text
READINESS=58%
P0=0
P1=7
P2=10
P3=5
PUBLIC_BETA_READY=NO
```

Первоначальные P1:

- BMR-001 release provenance drift;
- BMR-002 красные full test/Mini/lint gates;
- BMR-003 High advisory `fast-uri`;
- BMR-004 незакрытый Admin owner release;
- BMR-005 seller authority/QuickPost недоступны;
- BMR-006 отсутствующая classifieds foundation;
- BMR-007 отсутствующие public trust/operations/legal gates.

Не считать эти IDs автоматически закрытыми только потому, что появился код. Например,
BMR-006 локально существенно продвинут, но production schema, rollout и real journeys ещё не
доказаны; BMR-001 снова требует reconciliation из-за свежего `5/5` divergence.

## 6. Что сделано: Phase 0 / release truth, backup и restore tooling

Commit: `851d81a3443e0a3ac9b733e8dbf610c8f2aa9bf1`.

### 6.1. Cloudflare release artifact

`package.json` script `build:cf` теперь заканчивается `npm run build:admin`. Это исправляет
критический release gap: direct Pages artifact должен содержать и root public site, и новую
Admin shell/assets. Раньше возможен был корректный root build без восстановимого Admin artifact.

### 6.2. Exact-SHA preflight

Добавлен `scripts/release/bormi-beta-preflight.ts`. Он fail-closed проверяет:

- текущая ветка ровно `release/bormi-public-beta-1`;
- локальный HEAD равен переданному полному expected SHA;
- `origin/release/bormi-public-beta-1` равен этому же SHA;
- worktree clean;
- `origin/main`, deployed baseline `5a5111f` и указанный production source находятся в ancestry;
- stash пуст;
- merge/rebase operation не активна;
- backup существует и SHA-256 совпадает;
- isolated restore проходит quick/integrity/FK и имеет ledger 33, last migration `0033`;
- root/Admin build artifacts существуют и все referenced JS/CSS-файлы присутствуют;
- `/admin/*` включён в Functions routing, а `/admin/assets/*` исключён и отдаётся статически.

Важно: после свежего продвижения `origin/main` проверка `origin/main is ancestor of HEAD` ожидаемо
будет `BLOCK` до merge main → release. Не ослаблять эту проверку ради зелёного результата.

### 6.3. D1 export restore

Добавлен `scripts/release/d1-export-restore.ts` и tests. Скрипт:

- разбирает D1 SQL export с корректной обработкой `;` внутри строк и комментариев;
- не печатает SQL/PII;
- импортирует только в явно указанный isolated SQLite output;
- запрещает source=target;
- обнаруживает особенность Cloudflare export: composite parent index
  `idx_sotuvchi_stores_org_id` мог находиться после child inserts;
- переносит **ровно этот один существующий index statement** сразу после parent table DDL;
- сравнивает hash multiset statements до/после и блокирует любое содержательное drift;
- проверяет `quick_check`, `integrity_check`, FK, ledger и privacy-safe aggregates.

Внешний production-shaped backup и verified restore сохранены вне repo:

```text
F:\Claude\bormi-backups\2026-08-04\gptbot-ai-drafts-pre-beta-20260804-111304.sql
F:\Claude\bormi-restore-rehearsals\2026-08-04\gptbot-ai-drafts-pre-beta-20260804-111304-verified.sqlite
```

Не коммитить эти файлы. Не использовать verified restore как production target. Rehearsal scripts
копируют его во временную директорию и удаляют временную копию после проверки.

## 7. Что сделано: Phase 1 / test, lint и dependency closure

Commit: `e52e78727f233adde3ae9eb8e9e776f128a2e08a`.

### 7.1. High dependency advisory

В `apps/gpt-backend/package.json` добавлены узкие overrides:

```json
{
  "fast-uri@3.1.4": "3.1.5",
  "fast-uri@4.1.1": "4.1.2"
}
```

Backend lockfile обновлён. Root toolchain также обновлён до совместимых patch/minor версий,
добавлены yarn resolutions для известных advisory chains, `yarn.lock` пересобран. Не делать
широкое `npm audit fix` или новый package-manager migration. Root использует Yarn lock; команда
`npm audit --omit=dev` в root выдаёт `ENOLOCK` и **не является** результатом dependency audit.
Для root нужен Yarn-compatible audit; для `apps/gpt-backend` используется его npm lock.

### 7.2. Mini App Node harness

`apps/market-mini-app/src/lib/api.ts` больше не предполагает безусловное наличие Vite
`import.meta.env` в Node ESM tests. Добавлен один read-only `runtimeEnv = import.meta.env ?? {}`,
после чего production/browser и Node tests используют один request path без test-only global.

### 7.3. Stale tests и реальные дефекты

Исправлены причины исходных падений:

- route/sitemap assertions обновлены на явно одобренные новые static routes, а не blanket skip;
- onboarding test больше не считает, что buyer greeting обязан быть последним Telegram message;
- synthetic checkout test проверяет фактические snapshots и не присваивает `unknown`;
- повреждённый mojibake RU fixture исправлен на реальный UTF-8 текст;
- N8N dependency inventory получил документированную active-doc classification;
- backend `any` query builder заменён на выведенный тип;
- Admin hook/component boundary переразложен, единственный exhaustive-deps exception узко
  документирован.

### 7.4. ESLint

`.wrangler/**` исключён как generated output. React Compiler adoption rules отключены, поскольку
репозиторий не включает React Compiler; runtime correctness rules `rules-of-hooks` и
`exhaustive-deps` не были глобально отключены. Production lint defects в затронутых файлах были
исправлены, а не скрыты широкими disable-комментариями.

## 8. Что сделано: isolated Admin preview evidence

Commit: `89917c390eec9d332c134cb8a66bcd7cf5369641`.

### 8.1. Preview smoke

`scripts/release/admin-preview-smoke.ts` принимает только credential-free HTTPS `*.pages.dev`
origin без path/query/hash/userinfo и проверяет:

- `/admin/`, `/admin/listings`, `/admin/system` → HTML shell, `no-store`, `noindex,nofollow`;
- built Admin entry asset доступен как JavaScript, а не HTML fallback;
- hashed asset имеет immutable public cache;
- legacy `/admin-tools/agents` остаётся доступным.

Не вставлять preview URL в commit/evidence. В tracked evidence записан только source label.

### 8.2. Browser evidence harness

`scripts/admin-v1-evidence.ts` расширен для isolated preview. Все `/api/admin/**` запросы
перехватываются Playwright до сети и получают synthetic responses. Session placeholder не является
credential. Поэтому evidence доказывает UI/contracts, но не production data или owner authority.

Tracked evidence:

```text
docs/production-closure/2026-08-04/evidence/admin-preview-core-e52e787/
docs/production-closure/2026-08-04/evidence/admin-preview-expired-e52e787/
```

Доказано synthetic/preview образом:

- unauthenticated deep link уходит на `/admin-tools/login`;
- 401 очищает local session и уходит на login;
- 403 показывает «Недостаточно прав»;
- system/listing screens работают на 1280 и listing detail на 320 без horizontal overflow;
- synthetic applied/conflict states отображаются;
- на operations screens нет write controls;
- PII pattern на экране отсутствует.

Не доказано:

- реальный owner login;
- post-login landing;
- production protected data;
- support_readonly на живой сессии;
- production listing command;
- audit insertion/rollback canary.

### 8.3. Telegram binding precheck

`scripts/release/telegram-binding-precheck.ts` выполняет один aggregate-only remote D1 read,
подавляет raw Wrangler output и проверяет:

- organizations/stores/memberships aggregates;
- duplicate membership pairs;
- ровно одного active owner для active org;
- active/redeemed binding challenges;
- seller.bind/unbind audit counts;
- ledger/FK/index;
- seller read/command flags включены;
- ceremony/QuickPost flags ещё выключены.

Он не создаёт challenge, не привязывает Telegram identity и не раскрывает IDs. Перед будущей
ceremony его нужно запускать заново. Старый audit видел zero Telegram owner membership и zero
active challenge, но это не вечная истина.

## 9. Classifieds architecture decision

Commit foundation: `86b306058ffae9bffdf16f774df81f4011abae21`.

Канонический ADR:

```text
docs/production-closure/2026-08-04/08_CLASSIFIEDS_ADR.md
```

Fixed decision:

- target model — `CLASSIFIEDS_FIRST_HYBRID`;
- `sotuvchi_products` остаётся canonical content/listing record;
- не создаётся второй parallel listing backend;
- store commerce остаётся для магазинов;
- private seller не получает fake public store;
- listing ownership вынесен в first-class relation;
- seller profile provider-neutral и ссылается на `identities.id`;
- global discovery требует published + approved + active ownership/profile/taxonomy/location;
- private listing всегда inquiry-only;
- contact data не публикуются автоматически;
- точный домашний адрес/coordinates foundation не хранит;
- AI может интерпретировать язык, но не придумывает product/price/seller/state.

### 9.1. Почему `sotuvchi_products` пришлось перестроить

Старые `org_id` и `store_id` были `NOT NULL`; private listing без fake store невозможен. SQLite
не умеет снять `NOT NULL` через `ALTER COLUMN`. Migration `0034` выполняет один bounded rebuild,
добавляет `listing_scope='store'|'private'` и conditional constraints.

Пять таблиц имели FK к products и должны были быть временно скопированы/удалены/воссозданы внутри
той же атомарной migration:

- `sotuvchi_order_items`;
- `sotuvchi_inventory`;
- `sotuvchi_inventory_moves`;
- `sotuvchi_buyer_presentations`;
- `sotuvchi_buyer_comparisons`.

Первый D1-shaped rehearsal закономерно упал на parent drop при существующих child FKs. Production
не менялся. Migration исправили: bounded child backups → remove children → rebuild parent → exact
child schemas/indexes → copy rows back. Исправленная версия проходит SQLite и local D1 runtime.

## 10. Migrations `0034`–`0039`

Все migrations forward-only, additive по бизнес-смыслу и **не применены production**.

### 10.1. `0034_classifieds_seller_ownership.sql`

Создаёт/изменяет:

- `seller_profiles` — provider-neutral identity link, public display name, seller/verification/
  moderation/status/version;
- `sotuvchi_products.listing_scope` и nullable org/store для private scope;
- `listing_ownerships` — ровно один active owner через partial unique index;
- `market_listing_operations` — idempotency/fingerprint ledger private listing operations;
- rebuild пяти FK child tables с восстановлением прежних constraints/indexes/data.

Invariants:

- store listing требует org/store;
- private listing запрещает org/store/category_id/SKU commerce coupling;
- private listing нельзя поместить в inventory/order tables;
- ownership type должен совпадать с product scope;
- private owner не несёт tenant/store authority.

### 10.2. `0035_classifieds_global_taxonomy.sql`

Создаёт:

- `market_global_categories`;
- `market_store_category_mappings`;
- `market_listing_taxonomy`.

Seed: девять bilingual root categories (`electronics`, `home-garden`, `fashion`, `kids`,
`sport-hobbies`, `vehicles`, `parts`, `services`, `other`). `vehicles`, `services`, `other`
отмечены high-risk. Condition allowlist:

```text
new, like_new, good, fair, for_parts, not_applicable
```

Store category tree не удаляется; mapping связывает его с global taxonomy.

### 10.3. `0036_classifieds_location_contact.sql`

Создаёт:

- `market_regions`;
- `market_districts`;
- `market_listing_locations`;
- `market_listing_channels`.

Seed: Uzbekistan/Tashkent city и 12 districts. Location хранит structured region/district и
bounded optional locality hint, всегда `approximate_only=1`. Нет coordinates/home address.

Contact modes:

```text
in_app
telegram_relay
phone_optional
```

`phone_optional` означает только policy `after_buyer_action`; номер телефона в этой таблице не
хранится. Commerce modes: `inquiry` или `store_order`; private scope может быть только `inquiry`.

### 10.4. `0037_classifieds_moderation_reports.sql`

Создаёт:

- `market_listing_moderation`;
- `market_listing_reports`;
- `market_moderation_audit`.

Moderation states:

```text
pending, approved, rejected, restricted, removed
```

Report reasons — закрытый словарь. Report note bounded до 500 символов. Reporter identity/session
не попадает в public projection; moderation audit не содержит report note. DB trigger ограничивает
reports до 5 на proven identity в час. Два triggers запрещают UPDATE/DELETE append-only audit.

### 10.5. `0038_classifieds_favorites.sql`

Создаёт `market_listing_favorites(identity_id, product_id, created_at)` с composite PK и индексами
по identity/recent и product. В таблице нет listing copy, seller/contact/Telegram/phone данных.

### 10.6. `0039_classifieds_inquiries.sql`

Создаёт `market_listing_inquiries`:

- buyer identity и server-derived seller profile;
- private message/reply до 500 символов;
- `open|answered|closed`;
- fingerprint;
- create/reply idempotency keys;
- optimistic version;
- buyer/seller/product indexes;
- DB trigger максимум 10 inquiries на identity за 24 часа.

Message/reply не входят в audit/analytics projection. Reply command/UI ещё не реализованы.

## 11. Migration rehearsal — фактический результат

Scripts:

- `scripts/release/classifieds-migration-rehearsal.ts` — foundation `0034`–`0037`;
- `scripts/release/classifieds-journey-migration-rehearsal.ts` — full `0034`–`0039`;
- `scripts/release/prepare-d1-import.ts` — подготовка local D1 import с тем же safe reorder rule.

Последний повторный full rehearsal выполнен против внешнего verified restore и дал `PASS`:

| Aggregate | Before | After |
| --- | ---: | ---: |
| products | 48 | 48 |
| orders | 1 | 1 |
| inventory | 44 | 44 |
| carts | 0 | 0 |
| cart items | 0 | 0 |
| order items | 1 | 1 |
| ledger | 33 | 39 |

Дополнительно PASS:

- product snapshots всех старых columns идентичны;
- business counts preserved;
- FK check clean;
- integrity check `ok`;
- favorites schema minimal;
- inquiry schema без contact copy;
- favorites/inquiries query plans используют covering indexes;
- favorite identity isolation;
- duplicate favorite rejected;
- inquiry identity isolation;
- inquiry idempotency enforced;
- 11-я inquiry блокируется DB trigger;
- fixture foreign keys clean.

Rehearsal **не** означает разрешение применить migrations production. До apply обязательны fresh
exact-SHA preflight, ledger predecessor `0033`, FK=0, fresh backup, Time Travel bookmark presence,
owner release decision и заранее описанный postflight.

## 12. Classifieds backend domain

Основные файлы:

```text
functions/agents/sotuvchi/classifieds/index.ts
functions/agents/sotuvchi/classifieds/types.ts
functions/agents/sotuvchi/classifieds/schema.ts
functions/agents/sotuvchi/classifieds/store.ts
functions/agents/sotuvchi/classifieds/service.ts
functions/market/router.ts
functions/market/composition.ts
```

### 12.1. Runtime schema behavior

`ensureClassifiedsSchema` и `ensureClassifiedsJourneySchema` **не выполняют migrations на request**.
Они только проверяют наличие expected tables и `listing_scope`; при отсутствии бросают
`classifieds_schema_unavailable`. Это важный fail-closed invariant.

Следствие: нельзя включать discovery flag до migrations. Иначе global shell может открыться, но
API будет fail-closed из-за отсутствующей schema.

### 12.2. Discovery projection

Public discovery возвращает запись только когда одновременно:

- `product.status='published'`;
- ownership active;
- product scope совпадает с ownership type;
- seller active и moderation state clear;
- global category active;
- region/district active;
- listing moderation `approved`;
- taxonomy/location/channel relations существуют.

Фильтры:

- query;
- category;
- region;
- district;
- condition;
- seller type;
- availability;
- optional store;
- minimum/maximum integer UZS price;
- cursor;
- limit 1–20, default 20.

Cursor — deterministic `(updatedAt,id)`. Search escaped для `%`, `_`, `\`; ищет по normalized
name, description, bilingual category names и bounded search terms. LLM не генерирует факты.

### 12.3. Private seller foundation

Реализованы behind `MARKET_PRIVATE_LISTING_ENABLED=false`:

- create/get-or-return private seller profile по bearer-derived identity;
- submit private listing draft;
- validate UZS, price, media refs, category condition allowlist, structured location/contact mode;
- require active/clear private seller profile;
- stable idempotency replay по operation fingerprint;
- atomic batch product + ownership + taxonomy + location + channel + pending moderation +
  append-only audit + operation ledger;
- high-risk category → `high_risk_category`, иначе `new_seller_review`;
- listing result остаётся `draft/pending`, commerce=`inquiry`.

Не реализованы: edit, autosave, resubmit, publish approval command, unpublish/archive, seller list,
seller inquiry reply/close, media UX для private seller.

### 12.4. Reports

Report listing existence проверяется через approved public projection. Reporter identity берётся
из bearer claims. Session scope HMAC-hash формируется server-side; raw session/token не хранится.
Idempotency replay проверяет listing/reporter/fingerprint. Service rate check даёт stable 429,
DB trigger закрывает concurrency race. Audit row хранит reason/state/IDs, но не reporter identity
и не report note.

### 12.5. Favorites

Favorite identity берётся только из bearer claims. Save проверяет public listing и identity,
затем делает `INSERT OR IGNORE`. Delete ограничен `(identity_id, product_id)`. List возвращает
максимум 50 всё ещё approved/public listings; снятые с публикации записи не протекают через
favorite projection.

### 12.6. Inquiries

Create inquiry:

- identity только из bearer;
- listing должен быть approved/public;
- active seller profile выводится server-side из ownership;
- self-inquiry запрещён;
- message normalized и bounded 2–500;
- idempotency key + fingerprint;
- service precheck 10/24h;
- DB trigger закрывает parallel race;
- buyer list ограничен identity и limit 50.

Seller reply/queue APIs ещё не реализованы, хотя schema и index подготовлены.

## 13. HTTP API surface

Все classifieds routes находятся под существующим authenticated `/api/market/v1` bearer/session
boundary. UI flag не является authorization.

### Discovery flag required

`MARKET_CLASSIFIEDS_DISCOVERY_ENABLED=true` требуется для:

```text
GET  /classifieds/categories
GET  /classifieds/locations
GET  /classifieds/listings
GET  /classifieds/listings/:id
GET  /classifieds/favorites
POST /classifieds/listings/:id/favorite
DELETE /classifieds/listings/:id/favorite
GET  /classifieds/inquiries
POST /classifieds/listings/:id/inquiries
POST /classifieds/listings/:id/reports
POST /classifieds/voice/search
```

POST commands требуют `Idempotency-Key`, кроме DELETE favorite. Voice дополнительно проходит
существующий voice flag/credential/bounded audio validation и privacy-safe rate limit.

### Private listing flag required

`MARKET_PRIVATE_LISTING_ENABLED=true` требуется для:

```text
POST /classifieds/private/profile
POST /classifieds/private/listings
```

При false routes выглядят как 404. Client не может передать identity/owner/status.

### Global launch/bootstrap

До `e94e8df` Market launch всегда требовал legacy pilot storefront. Теперь, только когда
classifieds discovery flag true и resolution падает с точным `storefront_unavailable`, сервер
выдаёт global classifieds bootstrap:

- `storefront=null`;
- no seller authority;
- no order counters;
- no media upload capability;
- navigation `home/search/saved/activity`;
- classifieds flags/capabilities truthfully reported.

Другие ошибки, cohort/authorization/session failures не превращаются в global access и продолжают
fail closed.

## 14. Buyer Mini App

Основной экран:

```text
apps/market-mini-app/src/screens/ClassifiedsBuyer.tsx
```

App lazy-loads его только когда authenticated bootstrap сообщает
`flags.classifiedsDiscovery === true`; при false старый buyer/store/seller UI остаётся fallback без
изменения поведения.

### Реализованные buyer flows

- RU и Uzbek Latin copy;
- home/search/saved/activity bottom navigation;
- text search;
- category/district/condition/availability/seller type/price filters;
- listing cards и detail sheet;
- bounded trust facts: seller type/name/verification, condition, location, contact policy;
- favorite save/remove с server confirmation;
- in-app inquiry modal и activity list;
- report modal с closed reason vocabulary;
- voice recording через существующие `VoiceRecorder`, `VoiceSheet`, `VoiceSummary`;
- mixed-language server interpretation и grounded result cache update;
- offline/error/loading/empty states;
- Telegram/hardware/browser back integration через existing navigation spine;
- responsive 320px layout, light/dark theme inheritance.

### Synthetic scenario

`apps/market-mini-app/src/dev/synthetic.ts` поддерживает query `?classifieds=1` в fixture dev mode.
Он моделирует global no-store launch, bilingual categories/locations, listings, filtering, voice,
favorites, inquiries и reports. Это только synthetic UI fixture, не production data proof.

## 15. Navigation race: найденный и исправленный runtime defect

Synthetic walkthrough обнаружил реальный race в `apps/market-mini-app/src/platform/navigation.ts`.
При переходе modal → modal React cleanup старого back stop мог удалить browser sentinel уже после
регистрации нового stop. Следующее back действие иногда уходило в `about:blank` вместо закрытия
активного sheet.

Исправление: `scheduleComponentSync()` coalesces cleanup/re-registration через `queueMicrotask`,
чтобы один React commit сначала завершил все effect cleanup/setup, а потом spine синхронизировал
один итоговый sentinel. Добавлен source regression test в `tests/market-quickpost.test.ts`.

После добавления третьего global bootstrap brittle tests, считавшие два использования nav/QuickPost
flags, упали. Assertions изменены не на свободное совпадение, а на точную новую архитектуру:
два store-scoped payload + один global payload, всего три flag reads. Финальный targeted suite
56/56.

## 16. Buyer synthetic evidence и незакрытая accessibility проблема

Script:

```text
scripts/release/classifieds-buyer-preview.ts
```

Tracked evidence:

```text
docs/production-closure/2026-08-04/evidence/classifieds-buyer-synthetic-phase5/
```

Содержит пять screenshots и `measurements.json`.

Факты:

- synthetic=true;
- 320px horizontal overflow=false;
- undersized interactive targets=[];
- hardware back returned home=true;
- inquiry journey=true;
- favorite journey=true;
- automated axe violations=[];
- home RU и saved UZ имеют zero incomplete;
- detail sheet имеет один `color-contrast` result со статусом `incomplete`, impact serious.

Итоговый `measurements.json.verdict=FAIL`, потому что harness сознательно считает serious
`incomplete` незакрытым gate. Не менять verdict на PASS и не выкидывать incomplete. Причина может
быть animated/translucent sheet compositing, но это нужно доказать deterministic contrast audit или
manual owner review; догадка не является закрытием.

## 17. Проверки — что действительно было запущено

Последний buyer slice:

| Gate | Result | Примечание |
| --- | --- | --- |
| `npm run test:classifieds` | 8/8 PASS | service + HTTP bearer identity/fallback |
| quickpost + voice targeted | 56/56 PASS | включая navigation regression и 3 bootstraps |
| root `npx tsc -b --pretty false` | PASS | после backend/UI integration |
| changed-file ESLint | PASS | весь список изменённых TS/TSX/scripts/tests |
| Mini `npm run typecheck` | PASS | |
| Mini `npm test` | 18/18 PASS | |
| Mini `npm run build` | PASS | Vite, 84 modules |
| migration rehearsal `0034`–`0039` | PASS | внешний verified restore, временная copy |
| `npm run scan:secrets` | PASS | clean, 3210 files на момент запуска |
| `git diff --cached --check` | PASS | до `e94e8df` |
| staged Telegram-token regex | PASS | no matches |

Последний Mini build sizes:

```text
ClassifiedsBuyer chunk 19.50 kB / 6.33 kB gzip
main index JS        321.20 kB / 99.31 kB gzip
CSS                   46.53 kB / 9.38 kB gzip
```

### Что нельзя переобозначать как PASS

- Full root corpus после `e94e8df` запускался, показал много успешных suites, но wrapper потерял
  финальный exit/status; окончательное число не зафиксировано.
- Full root `npm run lint` процесс завершился, но wrapper также не сохранил финальный exit.
  Changed-file ESLint прошёл, а full lint на `e52e787` был частью Phase 1 closure; после merge с
  текущим main полный lint нужно повторить.
- Buyer Playwright accessibility verdict — `FAIL` из-за serious incomplete, несмотря на zero
  violations.
- Root `npm audit` не выполняется через npm без lockfile; `ENOLOCK` не равен clean audit.

Новый агент обязан получить fresh финальный status, а не писать «likely pass».

## 18. Security, privacy и authority invariants

Не нарушать:

- Browser никогда не пишет D1 напрямую.
- Telegram identity только из verified initData/existing signed Market session.
- Username не authority.
- UI visibility/feature flag не authorization.
- Privileged command всегда повторно проверяет membership/identity server-side.
- Client не передаёт произвольный target status или owner identity.
- Lifecycle mutation требует expectedVersion и stable idempotency key.
- Audit и mutation атомарны, где audit обязателен.
- Moderation audit append-only.
- Не логировать raw initData, token, challenge, audio, transcript, query, inquiry/report content,
  phone/address/Telegram ID.
- Favorites не хранят listing copy/contact.
- Public projection не возвращает pending/rejected/restricted/removed/draft/archived listings.
- Private listing не получает store commerce.
- Phone/Telegram contact не раскрывается автоматически.
- Tests/evidence не используют production PII.
- Не ослаблять secret scanner.
- Не делать direct SQL lifecycle mutation.

## 19. Feature flag matrix

Source defaults в `wrangler.toml` на момент handoff:

| Flag | Value | Смысл |
| --- | --- | --- |
| `MARKET_NAV_BACK_ENABLED` | `true` | navigation spine active |
| `MARKET_QUICKPOST_ENABLED` | `false` | manual QuickPost скрыт |
| `MARKET_QUICKPOST_AI_ENABLED` | `false` | AI QuickPost скрыт |
| `MARKET_CLASSIFIEDS_DISCOVERY_ENABLED` | `false` | global classifieds hidden |
| `MARKET_PRIVATE_LISTING_ENABLED` | `false` | private profile/submit hidden |
| `MARKET_OWNER_TELEGRAM_BINDING_ENABLED` | `false` | owner ceremony closed |

Не предполагать, что live Cloudflare vars совпадают с file defaults: `wrangler pages deploy` может
заменить dashboard config содержимым `wrangler.toml`. Перед deploy сравнить names/count/bindings и
не печатать secret values.

Правильный rollout dependency:

1. migrations с flags false;
2. same exact backend SHA с flags false;
3. read-only postflight;
4. controlled discovery canary;
5. private write только после seller authority/native ceremony;
6. wider cohort только после moderation/support/legal/device gates.

## 20. Production truth и ограничения доказательств

Последний master audit видел:

- root production source `5a5111f`;
- Mini static source `3c8da0a`;
- D1 ledger 33;
- 48 products, 1 order, 1 order item, 44 inventory rows;
- FK clean, quick check ok;
- Admin audit rows preserved;
- zero Telegram owner membership;
- QuickPost/binding flags off.

После audit `origin/main` получил новые SEO commits и по документации SEO-трека был production
deploy. Эта сессия не делала свежий live Cloudflare/D1 reconciliation после этих событий. Поэтому
не указывать старые deployment IDs как current. Перед любым release action заново проверить:

- root/Mini current deployment and exact source SHA;
- production branch metadata;
- bindings/vars names/counts;
- D1 identity/ledger/FK/quick check/aggregates;
- flags;
- rollback deployment;
- Time Travel bookmark presence;
- no active binding challenge.

## 21. Что осталось по product journeys

### Buyer

Локально реализовано: entry/global launch, search/text/voice, filters, listing card/detail, trust
facts, inquiry, favorite, report, back.

Открыто:

- real Telegram launch/session;
- real approved classifieds data;
- real inquiry delivery/reply;
- saved search decision;
- phone/relay implementation, если owner утвердит;
- offline/provider/device edge cases;
- native RU/UZ/mixed voice;
- TalkBack/VoiceOver;
- production/cohort evidence.

### Private seller

Локально foundation-only:

- create profile;
- submit validated draft/pending listing atomically.

Открыто:

- Mini seller onboarding/switch;
- photo/manual/voice composition reuse;
- autosave/recovery;
- edit with expectedVersion;
- resubmit moderation;
- publish only through approved policy;
- buyer visibility proof;
- seller inquiry queue/reply;
- unpublish/archive;
- restriction/suspension behavior;
- real Telegram authority.

### Store seller

Старый store commerce сохранён, но новые classifieds relations не backfilled production и store
listing mapping/canary не выполнены. Открыты optional global discovery projection, inquiry/order
split и compatibility canary.

### Owner

Admin preview UI доказан synthetic. Открыты real login/landing, owner/support role matrix, listing
canary, classifieds moderation/report queues/actions, audit/system status и rollback.

## 22. Trust, abuse, privacy, legal и operations — почти полностью открыто

Foundation содержит report schema/reasons/rate triggers и pending moderation states, но public beta
требует ещё:

- deterministic prohibited-items policy;
- distributed rate limits вместо isolate-only там, где нужно;
- create/publish cooldowns;
- duplicate/suspicious link/phone controls;
- new-seller risk policy;
- moderator queue и least-privilege role;
- report triage/resolve/dismiss commands с audit;
- restriction/removal/appeal lifecycle;
- media/content policy;
- repeat offender controls;
- privacy data map, retention, deletion/export process;
- R2 media lifecycle;
- approved Terms, Privacy, Prohibited Items, Seller Rules, Buyer Safety,
  Moderation/Appeals, Support/Contact;
- incident severity matrix и Cloudflare/Telegram/D1/privacy runbooks;
- назначенные Product/Technical/Moderation/Support/Privacy owners;
- alerting и privacy-safe observability.

Legal drafts можно подготовить технически, но нельзя называть юридически утверждёнными без owner/
legal approval.

## 23. Owner gates, которые нельзя подменить synthetic proof

Собрать один минимальный owner package:

1. Реальная owner Admin session: login → returnTo `/admin/*` → refresh → logout, desktop/mobile.
2. Отдельно одобренный один listing command canary с before/after/audit/rollback.
3. Реальная Telegram identity-binding ceremony для выбранного owner/store.
4. Native Telegram device pack: Android low-end/current, iOS, RU, Uz Latin, mixed voice,
   microphone denied, hardware/Telegram Back, keyboard.
5. Manual QuickPost canary одной согласованной listing с safe media и rollback.
6. Legal/privacy/support documents approval.
7. Назначение operating owners/SLA/on-call.
8. Предоставление 3–10 consenting real beta users для controlled cohort.

Не разбивать это на хаотические запросы, но и не выполнять от имени owner.

## 24. Safe startup checklist для следующего агента

### 24.1. Read-only reconciliation

```powershell
Set-Location -LiteralPath 'F:\Claude\gptbot-bormi-api-fix'
git fetch --all --prune
git remote -v
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git rev-parse origin/release/bormi-public-beta-1
git status --short
git status --branch
git diff --check
git log --graph --oneline --decorate --all -80
git log --left-right --cherry-pick --oneline origin/main...HEAD
git rev-list --left-right --count origin/main...HEAD
git branch -vv
git worktree list
git stash list
git fsck --full
```

Остановиться, если canonical path/branch/unknown dirty files изменились или release remote не равен
ожидаемому SHA. Unknown Admin evidence сохранить.

### 24.2. Live read-only reconciliation

Без вывода secret values/DB UUID/bookmark/raw IDs:

- Pages deployments/project branch/source;
- root/Admin/Mini HTTP and headers;
- bindings/vars names/counts;
- D1 ledger last/count, FK, quick check, safe aggregates;
- owner audit counts;
- challenge/membership aggregates;
- feature flags;
- rollback deployment availability.

### 24.3. Merge current main into release

Только после diff review и сохранения unknown files:

```powershell
git merge --no-ff origin/main
```

Не rebase опубликованные commits. Не force push. При конфликте не выбирать «ours/theirs» для
lockfile, route tests, content baselines или shared config без содержательного review. После merge
обновить brittle route/sitemap counts только на фактические approved additions.

### 24.4. Full release gate после merge

Рекомендуемый минимум:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b --pretty false
npx eslint .
node --import tsx --test --test-concurrency=1 tests/*.test.ts
npm run scan:secrets
npm run build:cf

Set-Location -LiteralPath 'F:\Claude\gptbot-bormi-api-fix\apps\market-mini-app'
npm run typecheck
npm test
npm run build

Set-Location -LiteralPath 'F:\Claude\gptbot-bormi-api-fix\apps\bormi-admin'
npm run typecheck
npm test
npm run build

Set-Location -LiteralPath 'F:\Claude\gptbot-bormi-api-fix\apps\gpt-backend'
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Проверить реальные script names в package manifests перед запуском. На Windows не запускать
несколько memory-heavy Chrome/build задач одновременно при низкой RAM. Любой failure
классифицировать как current regression/stale approved baseline/environment; не blanket skip.

### 24.5. Повторить focused gates

```powershell
Set-Location -LiteralPath 'F:\Claude\gptbot-bormi-api-fix'
npm run test:classifieds
node --import tsx --test tests/market-quickpost.test.ts tests/market-voice-search.test.ts
npx tsx scripts/release/classifieds-journey-migration-rehearsal.ts --source 'F:\Claude\bormi-restore-rehearsals\2026-08-04\gptbot-ai-drafts-pre-beta-20260804-111304-verified.sqlite'
git diff --check
```

## 25. Рекомендуемый следующий implementation order

### Step A — reconcile и green baseline

Цель: merge current main into release, fresh full gates, dependency audit, exact release provenance.
Никаких feature flags/migrations/deploy.

### Step B — private seller lifecycle

Минимальный bounded slice:

- list own profile/listings;
- autosave draft contract;
- edit with `expectedVersion` + idempotency fingerprint;
- submit/resubmit moderation;
- seller archive/unpublish command;
- seller inquiry queue + reply/close;
- server-derived ownership на каждом command;
- negative IDOR tests identity A/B;
- Mini seller UI reuses QuickPost/media/voice components;
- all new UI remains behind `MARKET_PRIVATE_LISTING_ENABLED=false`.

Не включать public publish автоматически. Listing остаётся pending, пока moderation policy/Admin
command не доказаны.

### Step C — Admin moderation/report lifecycle

- read-only queues first;
- pending/reports detail;
- closed action/reason vocabulary;
- expectedVersion/idempotency;
- append-only audit in same mutation batch;
- support_readonly sees but cannot mutate;
- 401/403/409/expired/open-redirect tests;
- isolated preview evidence;
- no production canary without owner gate.

### Step D — trust/privacy/operations

Закрыть BMR-007 technical portion, policies/runbooks/event allowlist/alerts. Не откладывать всё до
последнего дня, потому что real cohort без support/moderation нельзя открыть.

### Step E — device/owner ceremonies

После technical green:

- Admin owner read-only;
- binding ceremony;
- QuickPost native canary;
- classifieds buyer/seller native canary;
- moderation/inquiry canary;
- accessibility/manual language review.

### Step F — production rollout

Только после exact approved SHA:

1. fresh backup + hash + isolated restore;
2. fresh Time Travel bookmark presence;
3. ledger predecessor 0033/FK0/quick check;
4. apply `0034`→`0039` unchanged;
5. read-only postflight counts/FK/integrity/ledger;
6. deploy backend same exact SHA with flags false;
7. deploy Admin/Mini compatible artifacts;
8. read-only discovery controlled canary;
9. enable one flag/cohort dimension at a time;
10. observe and stop on unexplained error.

## 26. Rollback/compensation model

### До production migrations

Rollback code-only: release branch/preview может быть отклонена, production не менялся.

### После migrations, но до private user writes

- flags off;
- previous app deployment;
- Time Travel допустим только при доказанной migration corruption и до valid new writes;
- preserve audit/evidence.

### После valid private listings/inquiries

Schema rollback/drop запрещён, потому что уничтожит новые business data. Compensation:

1. disable private creation/discovery;
2. unpublish/restrict affected listings через domain commands;
3. preserve reports/audit/inquiries;
4. route traffic to compatible previous app;
5. forward-fix schema/code;
6. communicate incident по runbook.

Никогда не выполнять direct SQL lifecycle rollback.

## 27. Known traps

- PowerShell 5.1: нет `&&`; `$()`/backticks в shell strings могут исполняться.
- Root использует Yarn lock; `npm audit` в root даёт ENOLOCK.
- Не использовать `git add .`, `git clean`, `git reset --hard`, `git push --force`.
- Не удалять unknown Admin evidence.
- `wrangler pages deploy` способен заменить dashboard-only bindings/vars конфигом файла.
- D1 export parent composite index order требует safe one-statement reorder tooling.
- Product rebuild с FK children нельзя проектировать только по SQLite предположению; local D1
  rehearsal уже поймал реальный boundary.
- Runtime schema probes не мигрируют; flag-on до schema приведёт к fail-closed API.
- Global bootstrap добавил третье использование некоторых flags; source-count tests должны
  понимать три payload, не маскировать counts.
- React modal effect cleanup может ломать history sentinel; сохранять microtask coalescing.
- Synthetic axe `incomplete` не равен pass.
- Synthetic Admin/Buyer screenshots не равны owner/device/production/cohort proof.
- Не публиковать raw D1 IDs, Time Travel bookmarks, preview URLs, tokens, initData, Telegram IDs,
  inquiry/report text или production PII.

## 28. File map для быстрого входа

### Audit/closure

```text
F:\Claude\bormi-audit\2026-08-04\01_EXECUTIVE_SUMMARY.md
F:\Claude\bormi-audit\2026-08-04\15_RISK_REGISTER.md
F:\Claude\bormi-audit\2026-08-04\17_MASTER_ROADMAP.md
F:\Claude\bormi-audit\2026-08-04\18_OWNER_DECISIONS_REQUIRED.md
docs/production-closure/2026-08-04/08_CLASSIFIEDS_ADR.md
docs/production-closure/2026-08-04/09_CLASSIFIEDS_MIGRATIONS.md
docs/production-closure/2026-08-04/10_BUYER_SELLER_JOURNEYS.md
docs/production-closure/2026-08-04/20_FINAL_HANDOFF.md
```

### Release tooling

```text
scripts/release/bormi-beta-preflight.ts
scripts/release/d1-export-restore.ts
scripts/release/prepare-d1-import.ts
scripts/release/admin-preview-smoke.ts
scripts/release/telegram-binding-precheck.ts
scripts/release/classifieds-migration-rehearsal.ts
scripts/release/classifieds-journey-migration-rehearsal.ts
scripts/release/classifieds-buyer-preview.ts
scripts/admin-v1-evidence.ts
```

### Backend/domain

```text
functions/agents/sotuvchi/classifieds/
functions/agents/sotuvchi/catalog/schema.ts
functions/agents/sotuvchi/index.ts
functions/market/composition.ts
functions/market/router.ts
functions/_types.ts
```

### Migrations

```text
migrations/0034_classifieds_seller_ownership.sql
migrations/0035_classifieds_global_taxonomy.sql
migrations/0036_classifieds_location_contact.sql
migrations/0037_classifieds_moderation_reports.sql
migrations/0038_classifieds_favorites.sql
migrations/0039_classifieds_inquiries.sql
```

### Mini App

```text
apps/market-mini-app/src/App.tsx
apps/market-mini-app/src/screens/ClassifiedsBuyer.tsx
apps/market-mini-app/src/dev/synthetic.ts
apps/market-mini-app/src/lib/api.ts
apps/market-mini-app/src/platform/navigation.ts
apps/market-mini-app/src/types.ts
apps/market-mini-app/src/styles.css
```

### Tests

```text
tests/d1-export-restore.test.ts
tests/classifieds-foundation.test.ts
tests/market-quickpost.test.ts
tests/market-voice-search.test.ts
tests/bormi-admin-hardening.test.ts
apps/market-mini-app/test/*.test.ts
```

## 29. Definition of done — что должно быть истинно перед `GO`

Нельзя писать `BORMI_PUBLIC_BETA_READINESS=100%` пока одновременно не доказаны:

- deployed code находится в canonical main/release truth;
- exact deployment SHA;
- zero P0/P1 и zero launch-blocking P2;
- full tests/lint/typecheck/builds;
- zero High/Critical production advisories;
- secret scan;
- fresh backup + isolated restore;
- D1 integrity/ledger;
- Admin owner E2E + mutation canary + rollback;
- Telegram seller authority;
- QuickPost manual/voice native canary;
- global discovery;
- complete private seller lifecycle;
- buyer inquiry/contact;
- moderation/report/appeal;
- privacy-safe telemetry + alerts;
- RU/UZ + native devices + accessibility;
- performance budgets;
- legal/support owner gate;
- controlled real cohort evidence.

До этого честный статус:

```text
BORMI_PUBLIC_BETA_READINESS=<recalculated honest value>
PUBLIC_BETA_GO_NO_GO=NO_GO
```

## 30. Короткий handoff новому агенту

Ты входишь не в greenfield и не в готовый release. Основа classifieds и buyer journey уже
реализованы качественно, fail-closed и находятся в pushed release-ветке. Production намеренно не
затрагивался. Главная непосредственная техническая задача — reconcile `origin/main` с release,
получить свежий полный green gate, затем завершить private seller + Admin moderation без включения
flags. Главные человеческие блокеры — реальная owner session, Telegram identity/device ceremonies,
legal approval и real cohort. Не подменяй их synthetic screenshots. Не начинай с production
migration/deploy/flag. Сохраняй чужие untracked Admin evidence и используй только targeted Git
operations.
