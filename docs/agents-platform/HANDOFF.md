# GPTBot Agents — Handoff

## 1. Состояние

- Дата: 2026-07-27.
- Ветка: `main`.
- Исходный HEAD / P2.1 relay:
  `2258aa5cc4889f2da6cb856fbc909dac664401ba`.
- Подтверждённый P2.1 code commit:
  `6b7f68e1a3c644dab7d762704332d636d321c133`.
- P2.2 code commit:
  `9373af8d0910c360620139e0e6d8913beeefbd0e`.
- HEAD после relay определяется последним metadata-only commit в `git log`;
  согласно D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA.
- Завершённый этап: **P2.2 — Sotuvchi Catalog**.
- Следующий этап: **P2.3 — Buyer Q&A**.
- Рабочее дерево после relay должно содержать только два pre-existing untracked
  объекта: `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`.
- `origin/main` перед P2.2:
  `93fab390733d3d5ffbf052e211d95b6038ee4bbd`.
- Push, deploy, Telegram setup и production/local migration не выполнялись.

## 2. Что сделано

1. Подтверждены P2.1 STATE/git/source gate, clean tracked tree и полный baseline
   до изменений.
2. Добавлена additive migration `0019_sotuvchi_catalog.sql` и эквивалентный
   идемпотентный runtime bootstrap.
3. Созданы tenant-scoped categories с server-generated opaque ID/slug,
   `active|archived`, bounded sort order, same-store unique slug и archive
   вместо delete.
4. Созданы tenant-scoped products с optional same-store category/SKU, Unicode
   name, bounded plain description, integer UZS price, declarative
   availability, opaque media refs, publication status и optimistic version.
5. Реализованы transitions `draft → published`, `published → draft`,
   `draft|published → archived`; archived immutable и не восстанавливается.
6. Owner authorization проверяет active membership, organization и active store
   в service и conditional SQL. User input не задаёт tenant/store authority.
7. Mutation idempotency использует trusted Runtime/channel request ID,
   store-scoped operation key и SHA-256 fingerprint. Domain write + operation
   row записываются одним D1 batch.
8. Product update/status применяют expected version без silent retry; повтор
   одного operation не повышает version второй раз.
9. Реализован deterministic buyer search: exact normalized name → prefix → all
   tokens → partial tokens → stable normalized name/id tie-break.
10. Search переиспользует public Knowledge normalization/tokenization, но
    catalog tables остаются source-of-truth; неатомарная Knowledge projection
    сознательно не создана.
11. Добавлен agent-neutral optional `AgentDomainServicePort`; Sotuvchi manifest
    `1.1.0` расширен только capability `store.catalog` и 12 closed-list tools.
    AI selection остаётся disabled.
12. Buyer storefront route создаёт минимальную durable identity→store session,
    поэтому follow-up text остаётся в trusted store. Active route/store
    перепроверяются на каждом resolve.
13. Buyer response строится только из scalar catalog Facts и существующего
    grounding; raw product row не передаётся renderer.
14. Telegram seller получил пять deterministic catalog actions и structured
    command flow; buyer получил list/name/price/availability queries на
    RU/Uzbek Latin/mixed.
15. Добавлено 54 offline actual-SQLite/domain/Runtime/Telegram теста, включая
    migration parity, lifecycle, concurrency, idempotency, tenant negatives и
    grounded storefront output.

## 3. Изменённые файлы

- `functions/agents/sotuvchi/catalog/**` — types, content-free errors,
  validation, schema, D1 store, service, tools, rules и public exports.
- `functions/agents/sotuvchi/{index.ts,manifest.ts,rules.ts}` — registration,
  capability/tool/rule wiring и seller/storefront actions.
- `functions/platform/contracts/{agent.ts,index.ts,runtime.ts}` — capability
  `store.catalog` и agent-neutral narrow domain port.
- `functions/platform/runtime/manifest.ts` — capability allowlist.
- `functions/api/telegram/agents.ts` — catalog service/port wiring, trusted
  storefront session и completed seller routing; business SQL отсутствует.
- `migrations/0019_sotuvchi_catalog.sql` — четыре additive tables и восемь
  indexes с rollback notes.
- `tests/sotuvchi-catalog.test.ts` — 54 P2.2 tests.
- `tests/sotuvchi-onboarding.test.ts` — сохранение P2.1 behavior при новом
  catalog manifest/storefront response.
- `docs/agents-platform/{HANDOFF.md,STATE.json,CURRENT_STATE.md,TEST_MATRIX.md,DECISIONS.md}`
  — P2.2 relay и D-016.

## 4. Модель и архитектурные решения

- Category:
  `id/orgId/storeId/name/slug/status/sortOrder/createdAt/updatedAt`.
  Category version не добавлена: P2.2 требует optimistic concurrency продукта;
  category mutation owner-only, idempotent и archive-only.
- Product:
  `id/orgId/storeId/categoryId?/sku?/name/description?/priceMinor/currency/
  availability/status/mediaRefs/version/createdAt/updatedAt`.
- `price_minor` — bounded non-negative integer; для UZS `100000 сум = 100000`.
  Float и numeric string domain boundary отклоняются; deterministic formatter
  добавляет пробелы, AI цену не пишет.
- Availability `available|unavailable|preorder` — декларативный status, не stock
  ledger и не inventory reservation.
- Product limit MVP — 20 non-archived rows на store, проверяется также внутри
  INSERT, чтобы закрыть race.
- SKU canonical uppercase и unique только внутри store; несколько NULL
  разрешены SQLite. Media refs — максимум пять opaque safe strings.
- Buyer видит только published product active store, если category active или
  отсутствует. Archive category не удаляет product row.
- D-016 фиксирует domain search вместо Knowledge projection: без atomic
  catalog+Knowledge outbox projection могла бы быть stale. Используются только
  public normalization/tokenization APIs.
- `AgentDomainServicePort` не расширяет authority: manifest tool фиксирует
  agent/operation, Runtime фиксирует org/actor/request, domain разрешает store.
- Seller UX — короткие action/command fixtures без нового workflow. Это
  сознательно удерживает P2.2 scope.
- Catalog events не добавлены до согласованной atomic outbox policy; exactly-once
  не заявляется.

## 5. Migration `0019`

Таблицы:

- `sotuvchi_categories`;
- `sotuvchi_products`;
- `sotuvchi_catalog_operations`;
- `sotuvchi_storefront_sessions`.

Indexes:

- unique parent `(sotuvchi_stores.org_id, id)` для composite FKs;
- category `(store_id, status, sort_order, name, id)` и `(org_id, store_id)`;
- product `(store_id, status, normalized_name, id)`,
  `(store_id, category_id, status, id)` и `(org_id, store_id)`;
- operation `(org_id, store_id, created_at)`;
- session `(org_id, store_id, status)`.

Checks/uniques/FKs фиксируют status allowlists, integer bounds, JSON array,
version, same-tenant parentage, store slug/SKU scope и session identity.
Migration не применялась ни local, ни production.

## 6. Что сознательно не сделано

- Cart, checkout, quantity, order/order items, inventory reservation/ledger,
  delivery/address/phone, payment integration/details, operator/CRM, human
  handoff, sales analytics, public web storefront и Mini App отсутствуют.
- R2 upload, Telegram file object в domain, CSV import и AI-generated
  descriptions отсутствуют.
- Buyer Q&A P2.3 не расширялся дальше минимальных list/name/price/availability
  intents P2.2; карточки и более широкий fail-closed intent set отложены.
- Knowledge product projection и catalog events отложены до atomic outbox.
- Migrations `0018/0019`, webhook setup, push и deploy не выполнялись.
- Javob, lead bot, gpt-chat, SEO, billing и unrelated production paths не
  изменялись.
- 27 legacy Functions errors и global legacy-red ESLint не исправлялись.

## 7. Проверки

- До изменений: `npx tsc -b` exit 0; onboarding 28/28; Telegram Agents 41/41;
  Runtime 49/49; Workflow 39/39; Knowledge 33/33; AI 15/15; tenancy 31/31;
  Events 20/20; boundaries 10/10; compatibility 1/1; assistant 60/60;
  gpt-chat 15/15.
- После изменений:
  - Sotuvchi catalog 54/54; onboarding 28/28.
  - Telegram Agents 41/41; Runtime 49/49; Workflow 39/39.
  - Knowledge 33/33; AI 15/15; tenancy 31/31; Events 20/20.
  - Boundaries 10/10; compatibility 1/1; assistant 60/60; gpt-chat 15/15.
  - Всего обязательных tests: 396/396.
  - `npx tsc -b` exit 0.
  - Functions typecheck exit 2: ровно те же 27 legacy errors в тех же 6 старых
    файлах; новых P2.2/platform/agents/channels/endpoint errors 0.
  - Scoped ESLint exit 0; boundary current-tree violations 0.
  - Actual SQLite подтверждает migration/bootstrap parity, columns, indexes,
    FKs/check/unique constraints, repeat bootstrap и отсутствие destructive SQL.
  - Staged credential/private-key/token/email/phone/env/known-real-ID scan 0.
  - `git diff --cached --check` clean.
- Один ранний параллельный test запуск превысил общий Windows Node memory limit;
  все affected suites немедленно перезапущены последовательно и прошли.

## 8. Известные проблемы и риски

- Сохраняются 27 Functions legacy errors в 6 старых файлах, global legacy-red
  ESLint и Node OOM risk; полный список в `KNOWN_ISSUES.md`.
- Catalog runtime bootstrap выполняется по уже принятому pattern; migration
  остаётся неприменённой до отдельного operations change.
- Domain search ограничен 20 MVP products/store и не использует FTS5. При росте
  объёма потребуется отдельная search/projection стратегия с atomic outbox.
- Durable storefront session не содержит TTL; route/store deactivation
  fail-closes resolution. Lifecycle/expiry session — будущая отдельная policy.
- Category mutation без version допустима только в P2.2; конкурентный UX может
  потребовать version в будущем.
- Catalog events/Knowledge projection отсутствуют до outbox policy.
- P1.4 at-most-once Telegram delivery может оставить terminal `failed` после
  send uncertainty.
- Pre-existing untracked package-lock/audit artifacts намеренно не тронуты.

## 9. Следующая задача

Только **P2.3 — Buyer Q&A**.

1. Сначала прочитать все обязательные platform docs и проверить:
   `last_completed_stage == P2.2`, `next_stage == P2.3`,
   `last_commit == 9373af8d0910c360620139e0e6d8913beeefbd0e`.
2. Проверить P2.2 code/relay ancestry, clean tracked tree и два pre-existing
   untracked объекта; запустить полный 396-test baseline до изменений.
3. Расширить buyer intents RU/UZ/mixed, deterministic product lookup, карточки,
   price/availability только из catalog Facts и fail-closed unknown behavior.
4. Сохранить catalog source-of-truth, trusted storefront context, strict tenant
   isolation, closed-list tools и existing grounding.
5. Не начинать P2.4 checkout/orders, inventory, payments, P2.6 human reply
   bridge, Mini App, deploy, webhook setup или production migration.

## 10. Команды для старта P2.3

```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ARCHITECTURE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ROADMAP.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\CURRENT_STATE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\TEST_MATRIX.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\KNOWN_ISSUES.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\DECISIONS.md
git status --short
git branch --show-current
git rev-parse HEAD
git log -15 --oneline
git diff
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
node --import tsx --test tests/sotuvchi-catalog.test.ts
node --import tsx --test tests/sotuvchi-onboarding.test.ts
node --import tsx --test tests/telegram-agents-webhook.test.ts
node --import tsx --test tests/platform-runtime.test.ts
node --import tsx --test tests/platform-workflow.test.ts
node --import tsx --test tests/platform-knowledge.test.ts
node --import tsx --test tests/platform-ai.test.ts
node --import tsx --test tests/platform-tenancy.test.ts
node --import tsx --test tests/platform-events.test.ts
node --import tsx --test tests/agent-boundaries.test.ts
node --import tsx --test tests/telegram-channel-compat.test.ts
node --import tsx --test tests/telegram-assistant.test.ts
node --import tsx --test tests/gpt-chat.test.ts
npx tsc -p tsconfig.functions.json --noEmit
```

## 11. Acceptance criteria P2.3

1. P2.2 category/product/lifecycle/idempotency/tenant invariants и 54 catalog
   tests сохранены.
2. Buyer intents для RU/UZ/mixed deterministic и не требуют AI-generated exact
   price/availability.
3. Product card/answer использует только published same-store catalog Facts;
   draft/archived/foreign store остаются недоступны.
4. Unknown/ambiguous intent fail-closed и не начинает order/handoff side effect.
5. Storefront code/session не становятся owner authority или user-selectable org.
6. Functions errors не превышают 27; scoped lint/boundaries/security clean;
   полный baseline не уменьшается.
7. Checkout/orders/inventory/payments/human reply bridge/Mini App отсутствуют
   без отдельного этапа.

## 12. Rollback

1. Если P2.2 relay commit создан, сначала `git revert <P2.2-relay-SHA>`.
2. Затем `git revert 9373af8d0910c360620139e0e6d8913beeefbd0e`.
3. Migration `0019` не применялась, поэтому текущему production schema rollback
   не нужен.
4. Если `0019` применена отдельно, сначала отключить catalog traffic и
   сохранить необходимые данные. Затем удалить в обратном порядке session,
   operation, product и category indexes/tables и только после child objects —
   `idx_sotuvchi_stores_org_id`.
5. Не удалять shared `sotuvchi_stores`, routes, onboarding, organizations,
   memberships, workflow или legacy Telegram tables.
6. Revert не должен затрагивать P2.1/P1.x history, Javob/lead bot, unrelated
   production history и два pre-existing untracked объекта.
