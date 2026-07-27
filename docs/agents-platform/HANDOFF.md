# GPTBot Agents — Handoff

## 1. Состояние

- Дата: 2026-07-27.
- Ветка: `main`.
- Исходный HEAD / P1.4 relay:
  `c04ae463a403287e6d81d9eac8db116c721705a9`.
- Подтверждённый P1.4 code commit:
  `539525410f086ef1c705c221950b29d808982899`.
- P2.1 code commit:
  `6b7f68e1a3c644dab7d762704332d636d321c133`.
- HEAD после relay определяется последним metadata-only commit в `git log`;
  согласно D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA.
- Завершённый этап: **P2.1 — Sotuvchi Store Onboarding**.
- Следующий этап: **P2.2 — Sotuvchi Catalog**.
- Рабочее дерево после relay должно содержать только два pre-existing untracked
  объекта: `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`.
- `origin/main` перед P2.1 был
  `93fab390733d3d5ffbf052e211d95b6038ee4bbd`.
- Push, deploy, Telegram setup и production/local migration не выполнялись.

## 2. Что сделано

1. Подтверждены STATE/git gate, P1.4 ancestry, исходный clean tracked tree и
   полный baseline до изменений.
2. Создан production `AgentManifest` `sotuvchi` `1.0.0` с локалями RU/UZ,
   capability только `store.onboarding`, пустым tool allowlist и отключённым AI.
3. Добавлена D1 migration `0018_sotuvchi_store_onboarding.sql` и эквивалентный
   идемпотентный runtime bootstrap.
4. Добавлен durable identity claim `sotuvchi_onboardings`, чтобы повторный start
   продолжал одну organization/workflow и не создавал tenant/store дубль.
5. Переиспользован P0.4 atomic
   `OrganizationStore.createOrganizationWithOwner`; owner membership не
   дублируется вручную.
6. P1.2 Workflow Engine расширен optional trusted `reducePayload`; reducer
   работает только внутри trusted TypeScript definition, а результат повторно
   валидируется до durable transition.
7. Реализован persistent FSM
   `start → awaiting_name → awaiting_locale → awaiting_delivery →
   awaiting_payment → review → completed` и `cancelled`.
8. Workflow payload ограничен четырьмя draft-полями: `storeName`, `locale`,
   `deliveryMode`, `paymentMethods`.
9. Реализован `StoreProfile` с tenant root `orgId`, строгими RU/UZ,
   delivery/payment allowlists и статусом `draft|active|suspended`.
10. Confirmation проверяет owner и одним D1 batch создаёт store + trusted route.
    Unique collision откатывает batch, storefront code генерируется заново,
    максимум 5 попыток.
11. Storefront code генерируется только сервером: `s-` + 16 символов
    lowercase RFC 4648 base32 (`a-z2-7`), 80 бит entropy, length 18.
12. Добавлена trusted route table с unique `(bot, route)` и
    `(bot, org, agent)`, FK к store и owner membership.
13. Seller entry `agent_seller` запускает/продолжает onboarding; buyer payload
    `agent_<storefrontCode>` разрешается только через D1 и никогда не запускает
    seller setup.
14. `/api/telegram/agents` подключает production Sotuvchi registry и narrow
    workflow port. Endpoint остаётся без business SQL, Runtime —
    channel-neutral.
15. Telegram trusted context получил только internal `entryActionId` и workflow
    coordinates; idempotency берётся из durable channel dedup key.
16. Добавлено 28 offline D1/Runtime/Telegram тестов validation, persistence,
    atomic linkage, collisions, duplicates, tenant isolation, RU/UZ/mixed и
    buyer/seller route separation.

## 3. Изменённые файлы

- `functions/agents/sotuvchi/**` — manifest, types, deterministic rules,
  validation, schema, repository, service, FSM и Runtime workflow port.
- `functions/agents/{index.ts,registry.ts}` — production registration/export.
- `functions/platform/contracts/{agent.ts,index.ts,workflow.ts}` — onboarding
  capability и trusted payload reducer contract.
- `functions/platform/workflow/{engine.ts,validation.ts}` — reducer validation
  and application; duplicate idempotency key подтверждает тот же trigger.
- `functions/platform/runtime/manifest.ts` — capability allowlist.
- `functions/channels/telegram/{deep-link.ts,webhook.ts}` — trusted entry action,
  workflow coordinates и channel-derived idempotency context.
- `functions/api/telegram/agents.ts` — Sotuvchi resolver/registry/workflow wiring.
- `migrations/0018_sotuvchi_store_onboarding.sql` — три additive tables и три
  индекса.
- `tests/sotuvchi-onboarding.test.ts` — 28 новых offline тестов.
- `tests/{agent-boundaries.test.ts,telegram-agents-webhook.test.ts}` —
  registration/compatibility assertions без уменьшения suite counts.
- `docs/agents-platform/{HANDOFF.md,STATE.json,CURRENT_STATE.md,TEST_MATRIX.md,DECISIONS.md}`
  — P2.1 relay и D-015.

## 4. Архитектурные решения

- **D-015:** Sotuvchi onboarding использует recoverable two-phase orchestration.
  Unique identity claim закрепляет одну provisional organization; organization
  + owner создаются атомарно существующим tenancy service. Финальный store +
  route создаются вторым атомарным D1 batch.
- Workflow требует tenant до первого instance, поэтому organization создаётся
  перед сбором draft. Interruption не создаёт store/route; повторный start
  продолжает тот же durable claim.
- Недопустимы store без owner и route без store. Strict insert/unique/FK/check
  constraints закрывают partial completion и collision races.
- Одна owner identity имеет максимум один Sotuvchi store — явная MVP policy.
- Deep-link code — opaque lookup key, не tenant source. Tenant определяется
  только server-side route lookup.
- Agent не получает произвольного update tool: P2.1 mutations доступны только
  через injected trusted workflow port.
- Events не добавлены: без атомарной связки domain write + outbox нельзя честно
  обещать exactly-once. Это зафиксированное отложенное решение.

## 5. Что сознательно не сделано

- Не начат P2.2 и не добавлены products, categories, photos, prices, stock,
  catalog search или public storefront page.
- Не добавлены buyer chat, cart, checkout, orders, delivery address, customer
  phone, operator/CRM, payments API/links, Click/Payme, Mini App, Instagram,
  custom bot, R2, CSV import или AI store description.
- Payment methods в store profile — только декларация доступных способов.
- P2.1 domain events не публикуются; outbox/retry policy не имитируется.
- Migration `0018` не применялась. Webhook setup, push и deploy не выполнялись.
- Javob, lead bot, gpt-chat, SEO, billing и unrelated production paths не
  изменялись.
- 27 legacy Functions errors и global legacy-red ESLint не исправлялись.

## 6. Проверки

- До изменений: `npx tsc -b` exit 0; Telegram Agents 41/41; Runtime 49/49;
  Workflow 39/39; Knowledge 33/33; AI 15/15; tenancy 31/31; Events 20/20;
  boundaries 10/10; Telegram compatibility 1/1; Telegram assistant 60/60;
  gpt-chat 15/15.
- До изменений Functions typecheck: ровно 27 legacy errors в 6 старых файлах.
- После изменений:
  - Sotuvchi onboarding 28/28.
  - Telegram Agents 41/41.
  - Runtime 49/49; Workflow 39/39; Knowledge 33/33; AI 15/15.
  - Tenancy 31/31; Events 20/20; boundaries 10/10.
  - Telegram compatibility 1/1; Telegram assistant 60/60; gpt-chat 15/15.
  - `npx tsc -b` exit 0.
  - Functions typecheck exit 2, ровно те же 27 legacy errors в тех же 6
    файлах; новых P2.1/platform/agents/channels errors 0.
  - Расширенный scoped ESLint exit 0.
  - Boundary suite 10/10; direct forbidden-import checks 0.
  - Migration/bootstrap parity, constraints, repeated bootstrap и no
    destructive SQL покрыты тестами.
  - Staged token/API-key/private-key/email/phone/env scan 0.
  - `git diff --cached --check` перед code commit clean.

## 7. Известные проблемы

- Сохраняются 27 Functions legacy errors в 6 старых файлах, global legacy-red
  ESLint и Node OOM risk; полный список в `KNOWN_ISSUES.md`.
- Onboarding orchestration двухфазная: после успешного owner setup и аварии до
  workflow/store может остаться provisional organization. Durable identity
  claim делает её resumable и не позволяет создать вторую, но автоматического
  garbage collection нет.
- P1.4 at-most-once delivery может оставить Telegram update terminal `failed`
  после send uncertainty; durable recovery/outbox отсутствует.
- Sotuvchi domain events отсутствуют до согласованной atomic outbox policy.
- Buyer storefront route уже безопасно разрешается, но buyer product behavior
  сознательно отсутствует до последующих этапов.
- Pre-existing untracked package-lock/audit artifacts намеренно не тронуты.

## 8. Следующая задача

Только **P2.2 — Sotuvchi Catalog**.

1. Сначала прочитать все обязательные platform docs и проверить:
   `last_completed_stage == P2.1`, `next_stage == P2.2`,
   `last_commit == 6b7f68e1a3c644dab7d762704332d636d321c133`.
2. Проверить P1.4 relay/code и P2.1 code/relay в ancestry, tracked tree и два
   pre-existing untracked объекта.
3. Запустить полный baseline, включая Sotuvchi 28/28, до любых изменений.
4. Реализовывать только catalog scope, определённый ROADMAP/новой инструкцией,
   поверх trusted organization/store/route, не обходя owner и tenant checks.
5. Не начинать checkout, orders, inventory, payment integration, human handoff,
   Mini App, deploy, webhook setup или production migration.

## 9. Acceptance criteria следующего этапа

1. Source gate P2.1 подтверждён фактическими SHA и `STATE`.
2. Все P2.1 store/owner/route invariants и 28 Sotuvchi тестов сохранены.
3. Новый catalog tenant-scoped к existing store и не принимает user-supplied
   `orgId`/owner/storefront code как authority.
4. Telegram/Runtime boundaries, P1.4 dedup и buyer/seller route separation не
   ослаблены.
5. Functions errors не превышают 27 и новых scoped errors/lint/boundary/security
   нарушений нет.
6. Checkout, order placement, inventory reservation, payments, handoff и Mini
   App не появляются без отдельного этапа.
7. Migration/setup/push/deploy выполняются только по отдельной явной команде
   владельца.

## 10. Команды для старта

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
git log -12 --oneline
git diff
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
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

## 11. Риски

- Не принимать `orgId`, owner identity или storefront code из agent/user input
  как trusted authority.
- Не удалять unique/FK/check constraints и не разделять store/route batch.
- Не обходить `OrganizationStore.createOrganizationWithOwner` собственной
  tenancy SQL.
- Не переносить Telegram API/profile/raw update в Sotuvchi domain или Platform
  Runtime.
- Не превращать `reducePayload` в dynamic/untrusted reducer и не пропускать
  payload validation после него.
- Не добавлять non-idempotent events/actions без durable outbox/recovery policy.
- Не смешивать Agents env/webhook/dedup/setup с Javob или lead bot.
- Не применять migration и не выполнять push/deploy без отдельной явной команды.

## 12. Rollback

1. Если relay commit создан, сначала `git revert <P2.1-relay-SHA>`.
2. Затем `git revert 6b7f68e1a3c644dab7d762704332d636d321c133`.
3. Migration P2.1 не применялась, поэтому текущему production schema rollback не
   нужен.
4. Если `0018` когда-либо применена отдельно, сначала отключить Sotuvchi route,
   сохранить необходимые данные и согласованным ops change удалить в обратном
   порядке три индекса, затем `telegram_agent_routes`, `sotuvchi_stores`,
   `sotuvchi_onboardings`.
5. Не удалять shared `organizations`, `memberships`, `workflow_instances` или
   legacy Telegram tables: они не принадлежат migration `0018`.
6. Revert не должен затрагивать P1.4 commits, Javob/lead bot, unrelated
   production history и два pre-existing untracked объекта.
