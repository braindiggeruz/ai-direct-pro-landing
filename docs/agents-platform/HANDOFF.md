# Актуальный master handoff

Полная фактическая карта repository, services, Agents Platform, Telegram,
Sotuvchi, migrations, API, environment, tests, security, PII, production
readiness и точные инструкции продолжения:

[`GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md`](./GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md)

Этот файл ниже сохраняет stage-specific handoff P2.5. При расхождении
операционных сведений сначала сверяйте Git tree и `STATE.json`, затем
используйте master handoff как актуальную карту системы.

---

# GPTBot Agents — Handoff

## 1. Состояние

- Дата: 2026-07-27.
- Ветка: `main`.
- Исходный HEAD / P2.4 relay:
  `32112657589983467d31888ad3ec106a8d96b227`.
- P2.4 code commit:
  `a418bcb2d9886fa1d9d42cfbcecd39c6f9ac18ea`.
- P2.5 code commit:
  `0915f059027555665661a1bcb90e8719690bce0c`.
- HEAD после relay определяется последним metadata-only commit в `git log`;
  по D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA.
- Завершённый этап: **P2.5 — Sotuvchi Orders and Inventory**.
- Следующий этап: **P2.6 — Human handoff**.
- Рабочее дерево после relay: только два pre-existing untracked объекта —
  `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`.
- Push, deploy, webhook setup и применение migration не выполнялись.

## 2. Что сделано

1. Добавлен seller-side lifecycle заказа поверх P2.4. SQLite не расширяет
   существующий `CHECK` без table rebuild, поэтому добавлена одна additive
   колонка `sotuvchi_orders.fulfillment_status`; фактическое состояние — пара
   `(status, fulfillment_status)`: `placed`, `confirmed`, `cancelled`, `done`.
2. Разрешены только `placed → confirmed`, `placed → cancelled`,
   `confirmed → done`. `confirmed → cancelled` запрещён, поэтому compensation
   inventory не существует и не может быть выполнена ошибочно.
3. Добавлен количественный inventory: `sotuvchi_inventory` (integer
   `on_hand` 0..1 000 000, optimistic `version`, PK `(org, store, product)`) и
   append-only `sotuvchi_inventory_moves` с типами `initial`,
   `manual_adjustment`, `order_confirmed`.
4. Availability остаётся декларативной и никогда не превращается в число:
   `available` требует существующую строку баланса (fail-closed) и
   `on_hand >= quantity`; `preorder` подтверждается без списания; `unavailable`
   подтвердить нельзя.
5. Confirm выполняется одним D1 batch: owner membership, active store,
   published product, live availability, достаточный остаток, conditional
   decrement, movement, переход заказа, operation row и notification intent.
   Guard'ы вложены так, что statements применяются либо все, либо ни один.
6. Double-decrement защищён тремя независимыми механизмами: conditional
   `fulfillment_status = 'none'`, conditional inventory `version` и partial
   unique index `(order_id, type) WHERE order_id IS NOT NULL`.
7. Idempotency: trusted `requestId` как store-scoped ключ в существующей
   `sotuvchi_order_operations` (operation + SHA-256 fingerprint + target).
   Повтор того же ключа возвращает сохранённый результат; другой fingerprint
   на том же ключе — content-free conflict. Повтор перехода с другим
   requestId, когда заказ уже в целевом состоянии, возвращает `unchanged`
   без записей.
8. Добавлен durable notification outbox `sotuvchi_notifications`
   (`order_placed` seller, `order_confirmed`/`order_cancelled`/`order_done`
   buyer). Domain mutation не вызывает Telegram: placement и каждый seller
   transition пишут intent в своём же batch.
9. Notification row не содержит payload вообще. Renderer заново читает
   trusted order, поэтому имя, телефон и адрес покупателя физически не
   попадают в outbox.
10. Outbox вынесен в отдельный модуль `functions/agents/sotuvchi/outbox`,
    потому что у него два писателя (checkout placement и seller transitions);
    так ни один из модулей не импортирует другой.
11. Добавлены семь closed-list seller tools: `seller.orders.list`,
    `seller.order.get`, `seller.order.confirm`, `seller.order.cancel`,
    `seller.order.done`, `seller.inventory.get`, `seller.inventory.set`.
    Manual arbitrary delta не добавлялся.
12. Seller authority — только trusted Runtime `OrgContext.actorId` плюс
    active owner membership и active store через существующий
    `catalog.resolveOwnerContext`. Owner membership дополнительно проверяется
    внутри каждого мутирующего SQL.
13. List/detail PII policy: список заказов не содержит имя, телефон и адрес;
    detail отдаёт их авторизованному владельцу, потому что именно он
    выполняет заказ.
14. Facts scalar и namespaced (`seller.orders.*`, `seller.order.*`,
    `seller.inventory.*`, `seller.transition.*`); ответы собираются
    deterministic composer'ом и проходят существующий strict grounding.
15. Deterministic RU/UZ actions и commands: `seller-orders`,
    `seller-inventory`, `seller-order.<id>`, `seller-order-confirm.<id>`,
    `seller-order-cancel.<id>`, `seller-order-done.<id>`, тексты
    «Заказы»/«Buyurtmalar», «Остатки»/«Qoldiqlar» и
    `Остаток: <id> | <n>` / `Qoldiq: <id> | <n>`.
16. Manifest поднят до `1.4.0`; capability `commerce.order` уже была. Пункты
    меню продавца дополнены «Заказы» и «Остатки». AI selection остаётся
    disabled.
17. Добавлена additive migration `0022_sotuvchi_orders_inventory.sql` и
    runtime bootstrap parity. Migration не применялась.
18. Создан offline suite `tests/sotuvchi-orders-inventory.test.ts`: 37/37.

## 3. Изменённые файлы

- `functions/agents/sotuvchi/inventory/{types,errors,validation,index}.ts` —
  value-типы баланса и движений, bounded validation, content-free errors.
- `functions/agents/sotuvchi/outbox/{schema,index}.ts` — DDL и bootstrap
  таблицы `sotuvchi_notifications`; общий для checkout и orders.
- `functions/agents/sotuvchi/orders/schema.ts` — inventory/moves DDL,
  additive `fulfillment_status`, parity с migration `0022`.
- `functions/agents/sotuvchi/orders/types.ts` — seller lifecycle, summary и
  detail проекции, типы notification intent.
- `functions/agents/sotuvchi/orders/validation.ts` — вывод seller-статуса из
  пары колонок, таблица разрешённых переходов, bounded validation.
- `functions/agents/sotuvchi/orders/store.ts` — весь SQL агрегата: чтения,
  атомарные batch'и confirm/cancel/done, `setInventory`, outbox-операции.
- `functions/agents/sotuvchi/orders/service.ts` — авторизация продавца,
  idempotency, availability policy, fail-closed inventory, сборка batch'ей.
- `functions/agents/sotuvchi/orders/facts.ts` — scalar-only проекции.
- `functions/agents/sotuvchi/orders/responses.ts` — RU/UZ composer, строящий
  весь текст только из Facts.
- `functions/agents/sotuvchi/orders/{rules,tools,index}.ts` — deterministic
  правила, closed-list tools, domain port и публичный экспорт.
- `functions/agents/sotuvchi/checkout/{store,service,index}.ts` — placement
  дополнительно пишет seller notification intent в том же batch; bootstrap
  переключён на общий outbox.
- `functions/agents/sotuvchi/{manifest,rules,index}.ts` — регистрация seller
  tools/rules, пункты меню, реэкспорт.
- `functions/api/telegram/agents.ts` — orders service и композиция domain
  port; endpoint остаётся orchestration-only.
- `migrations/0022_sotuvchi_orders_inventory.sql` — additive migration с
  rollback notes.
- `tests/sotuvchi-orders-inventory.test.ts` — новый suite.
- `tests/sotuvchi-{catalog,onboarding}.test.ts` — manifest-scope assertions
  переведены с границы P2.4 на границу P2.5 (payment/refund/handoff/cart
  по-прежнему запрещены).

## 4. Архитектурные решения

D-019 — Inventory ledger, idempotent seller order transitions and durable
notification intents. Полный текст в `DECISIONS.md`.

## 5. Что сознательно не сделано

- Фактическая отправка Telegram-уведомлений. Для push продавцу/покупателю
  нужен durable mapping identity → chat reference, которого в repository нет;
  создание такого mapping — работа транспортного этапа. P2.5 доводит
  контракт до durable intent, renderer'а и claim/settle операций.
- `confirmed → cancelled` и любая compensation inventory.
- P2.6 human handoff, reply bridge, CRM, payments, refunds, partial
  fulfillment, multi-item cart, multi-warehouse, variant inventory,
  delivery integration, Mini App, web dashboard, analytics dashboard,
  scheduler.
- Events по-прежнему не публикуются: atomic outbox policy платформы не
  согласована, а имитировать exactly-once запрещено.
- Migration `0022` не применялась ни локально, ни на production.

## 6. Проверки

- `npx tsc -b` → exit 0.
- `node --import tsx --test tests/sotuvchi-orders-inventory.test.ts` → 37/37.
- Обязательный Agents-набор file-by-file: orders/inventory 37/37,
  checkout 36/36, buyer Q&A 39/39, catalog 54/54, onboarding 28/28,
  Telegram Agents 41/41, runtime 49/49, workflow 39/39, knowledge 33/33,
  AI 15/15, tenancy 31/31, events 20/20, boundaries 10/10,
  compatibility 1/1, assistant 60/60, gpt-chat 15/15 → **508/508**.
- Остальные suites репозитория: canonical-url-redirects 4/4,
  direct-generator 13/13, gpt-backend 17/17, indexnow-engine 11/11,
  intent-guard 16/16, telegram-cost-calculator 6/6,
  yandex-research 11/11 → 78/78. Полный репозиторий **586/586**.
- `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, ровно 27 legacy
  errors в тех же шести legacy-файлах; в
  `functions/{platform,agents,channels}` и endpoint — 0.
- `npx eslint functions/agents/sotuvchi functions/api/telegram/agents.ts
  functions/channels/telegram tests/sotuvchi-*.test.ts` → exit 0.
- Boundary checker: 10/10, 0 violations.
- Staged token/private-key/API-key/email scan → 0 совпадений;
  `git diff --cached --check` → clean.

## 7. Известные проблемы

- Существовали до этапа: `memory/test_credentials.md` в Git (critical,
  release blocker); global ESLint legacy-red; 27 legacy functions-typecheck
  errors; отсутствие cron/scheduler; migrations `0013–0022` не применены на
  remote D1; Agents webhook не настроен.
- Появились в этапе: регрессий нет. Две manifest-scope assertions в suites
  P2.2/P2.1 переведены с границы P2.4 на границу P2.5 — они запрещали
  именно то, что P2.5 обязан добавить.
- Внешние блокеры: Click/Payme merchant API, фискальные чеки, Instagram и
  WhatsApp Business API — без изменений.

## 8. Следующая задача

**P2.6 — Human handoff** после отдельного явного задания: очередь,
уведомление продавцу, reply-мост «ответ продавца → покупателю», TTL текста
вопроса, закрытие и события.

## 9. Acceptance criteria следующего этапа

1. Handoff создаётся из buyer-диалога и виден продавцу.
2. Ответ продавца доставляется покупателю от имени бота с пометкой.
3. Текст вопроса хранится с явным TTL и удаляется.
4. Повтор Telegram update не создаёт второй handoff и не отправляет второй
   ответ.
5. Tenant isolation доказана негативными тестами.
6. Обязательный baseline не опускается ниже 508/508, полный — ниже 586/586.
7. Functions typecheck — те же 27 legacy errors, 0 новых.
8. Scoped ESLint exit 0, boundaries 10/10.

## 10. Команды для старта

```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\CURRENT_STATE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ARCHITECTURE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ROADMAP.md
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
node --import tsx --test tests/sotuvchi-orders-inventory.test.ts
node --import tsx --test tests/sotuvchi-checkout.test.ts
node --import tsx --test tests/sotuvchi-buyer-qa.test.ts
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

## 11. Риски

- Не ослаблять инварианты P2.5: одна decrement-запись на заказ, fail-closed
  inventory для `available`, запрет `confirmed → cancelled`, payload-free
  notification row.
- Не переносить buyer PII в списки, события, логи и notification payload.
- Не превращать `availability` в число и не считать `available`
  бесконечным остатком.
- Не изменять `sotuvchi_orders.status` CHECK: расширение потребует полного
  SQLite table rebuild отдельным одобренным change.
- Не трогать `functions/api/telegram/webhook.ts`, Javob, lead-бот, gpt-chat,
  SEO и admin.
- Не добавлять `memory/test_credentials.md` в diff и не ротировать
  credentials без отдельного разрешения.

## 12. Rollback

1. Если P2.5 relay создан, `git revert <P2.5-relay-SHA>`.
2. Затем `git revert 0915f059027555665661a1bcb90e8719690bce0c`.
3. Migration `0022` не применялась. Если она будет применена отдельно,
   безопасный операционный rollback после отключения seller traffic —
   удалить только её индексы и три таблицы в обратном порядке
   (`idx_sotuvchi_orders_fulfillment`,
   `idx_sotuvchi_notifications_pending`,
   `idx_sotuvchi_inventory_moves_product`,
   `idx_sotuvchi_inventory_moves_order_type`,
   `idx_sotuvchi_inventory_store`, `sotuvchi_notifications`,
   `sotuvchi_inventory_moves`, `sotuvchi_inventory`). Колонку
   `fulfillment_status` оставить: её физическое удаление требует отдельного
   одобренного SQLite table rebuild. Shared checkout/catalog/store таблицы не
   удалять.
