# CURRENT_STATE — фактическое состояние репозитория (2026-07-27, P2.5)

## Production boundary

- SEO-фабрика, web AI-chat, админка, Javob `@gptbot_javob_bot` и lead-бот
  `@aidirectprobot` не изменялись.
- Agents webhook, Sotuvchi migrations и setup не публиковались и не
  применялись. Push/deploy отсутствуют.
- Cloudflare Pages/Functions, D1 `GPTBOT_DRAFTS_DB`, Workers AI и KV остаются
  без инфраструктурных изменений.
- Добавлены, но не применены migrations `0018`, `0019`, `0020`, `0021`,
  `0022`.

## Sotuvchi manifest и routing

- Production manifest `sotuvchi` версии `1.4.0`; локали `ru`, `uz`;
  capabilities `store.onboarding`, `store.catalog`, `commerce.order`.
- AI selection disabled. Routing deterministic-first.
- Seller catalog tools P2.2, buyer read tools P2.3 и `checkout.start` P2.4
  сохранены. P2.5 добавляет семь seller tools:
  `seller.orders.list`, `seller.order.get`, `seller.order.confirm`,
  `seller.order.cancel`, `seller.order.done`, `seller.inventory.get`,
  `seller.inventory.set`.
- Workflows: `sotuvchi-store-onboarding` v1 и `sotuvchi-checkout` v1. Seller
  переходы не являются FSM: это прямые атомарные операции над заказом.
- `agent_<opaque storefront code>` разрешается только trusted route lookup.
  Durable session связывает platform identity с org/store; active checkout
  workflow подставляется сервером, а не пользовательским payload.
- Endpoint orchestration-only; Platform не импортирует Sotuvchi; Telegram
  renderer не содержит buyer/checkout/seller business logic.

## Order lifecycle (P2.5)

- P2.4 оставил узкий `CHECK (status IN ('draft','placed','cancelled'))`, а
  SQLite не расширяет его без table rebuild. Поэтому добавлена additive
  колонка `fulfillment_status IN ('none','confirmed','done')`, и фактический
  seller-статус — пара:
  - `draft` → `('draft', 'none')`;
  - `placed` → `('placed', 'none')`;
  - `confirmed` → `('placed', 'confirmed')`;
  - `done` → `('placed', 'done')`;
  - `cancelled` → `('cancelled', 'none')`.
- Разрешены только `placed → confirmed`, `placed → cancelled`,
  `confirmed → done`.
- `confirmed → cancelled` запрещён сознательно: компенсирующее движение
  склада создало бы риск двойного возврата, поэтому его нет вовсе.
- Запрещены `cancelled → *`, `done → *`, `placed → done`, `draft → confirmed`.
- Продавец видит только заказы с `placed_at IS NOT NULL`; отменённые
  покупателем draft-заказы ему не показываются.

## Inventory (P2.5)

- `sotuvchi_inventory` — PK `(org_id, store_id, product_id)`, integer
  `on_hand` в диапазоне `0..1 000 000`, optimistic `version`, timestamps.
- `sotuvchi_inventory_moves` — append-only: `id`, tenant/store/product,
  optional `order_id`, тип `initial | manual_adjustment | order_confirmed`,
  `delta`, `balance_after`, `idempotency_key`, `created_at`.
- Availability остаётся декларативной и никогда не превращается в число:
  - `available` — строка баланса обязательна; её отсутствие fail-closed;
    требуется `on_hand >= quantity`; списание ровно один раз;
  - `preorder` — подтверждение разрешено, склад не уменьшается, факт
    помечен явно;
  - `unavailable` — подтвердить нельзя.
- `available` никогда не трактуется как бесконечный остаток.
- Числовой остаток покупателю не показывается.

## Atomic confirm и защита от двойного списания

- Один D1 batch содержит: conditional decrement (`version` + `on_hand >= qty`
  + вложенная проверка заказа/товара/магазина/владельца), вставку движения,
  условный переход `placed → confirmed`, operation row и notification intent.
- Guard'ы вложены так, что statement A применяется ⇒ применяются B и C;
  если A не применился, не применяется ничего.
- Недостижимы: `confirmed` без движения, движение без `confirmed`,
  отрицательный остаток, двойное списание, дублирующее движение,
  дублирующий notification intent.
- Три независимых барьера двойного списания: условие
  `fulfillment_status = 'none'`, условие inventory `version`, и partial
  unique index `(order_id, type) WHERE order_id IS NOT NULL`.

## Idempotency

- Store-scoped ключ — trusted `requestId` в существующей
  `sotuvchi_order_operations`: `operation`, SHA-256 fingerprint, target,
  версия результата. PII в fingerprint не входит.
- Повтор того же ключа возвращает сохранённый результат; другой fingerprint
  на том же ключе — content-free `idempotency_conflict`.
- Повтор перехода с другим requestId, когда заказ уже в целевом состоянии,
  возвращает `unchanged` и ничего не пишет.
- Повторная установка того же остатка — `unchanged` без нового движения.

## Seller authority и PII

- Только trusted Runtime `OrgContext.actorId` + active owner membership +
  active store (через существующий `catalog.resolveOwnerContext`).
  Дополнительно owner membership проверяется внутри каждого мутирующего SQL.
- Продавец не может передать `orgId`, `storeId`, чужой заказ, баланс или
  авторитет над товаром. Продавец A не видит данные продавца B.
- Покупатель не получает seller tools.
- Список заказов не содержит имя, телефон и адрес покупателя.
- Detail отдаёт имя, телефон и адрес авторизованному владельцу магазина,
  потому что именно он выполняет заказ.

## Durable notifications

- `sotuvchi_notifications`: `audience` `seller|buyer`, тип
  `order_placed | order_confirmed | order_cancelled | order_done`, статус
  `pending | sending | sent | failed`, `idempotency_key`, `attempt_count`,
  timestamps. `UNIQUE (order_id, audience, type)`.
- Domain mutation никогда не вызывает Telegram напрямую: placement и каждый
  seller transition пишут intent в своём же batch.
- Row не содержит payload вообще; renderer заново читает trusted order, так
  что PII в outbox физически отсутствует.
- Delivery semantics: durable intent + at-least-once попытка + идемпотентные
  доменные эффекты. Возможен повторный текст, если процесс упал после
  отправки. Exactly-once не заявляется.
- Фактический транспорт (push продавцу и покупателю) в P2.5 не реализован:
  для него нужен durable mapping identity → chat reference, которого в
  repository нет. P2.5 даёт intent, renderer и claim/settle операции.

## Facts и grounding

- Seller Facts scalar-only и namespaced:
  `seller.view`, `seller.orders.count`,
  `seller.orders.<n>.{id,number,status,status_display,product_name,quantity,
  total_minor,total_display,version}`,
  `seller.order.*` (те же плюс `unit_price_*`, `availability*`,
  `customer_name`, `customer_phone`, `customer_address`,
  `inventory_required`, `inventory_known`, `inventory_on_hand`),
  `seller.inventory.*`, `seller.transition{,.outcome,.stock_delta}`.
- Статусы: RU `Новый|Подтверждён|Отменён|Выполнен`;
  UZ `Yangi|Tasdiqlangan|Bekor qilingan|Bajarilgan`.
- Весь текст собирается deterministic composer'ом из Facts; claims и все
  числа проходят существующий strict grounding, unsupported число или claim
  отклоняет ответ.

## Buyer parser, catalog и checkout

- Closed intents, ranking, price filter, follow-up P2.3 и checkout FSM P2.4
  не изменялись.
- Placement дополнительно пишет seller notification intent в том же D1 batch;
  остальное поведение покупателя прежнее.

## Заказы в БД

- `sotuvchi_orders` — плюс additive `fulfillment_status`.
- `sotuvchi_order_items` — без изменений; `UNIQUE (order_id)` по-прежнему
  запрещает второй item.
- `sotuvchi_order_operations` — общий store-scoped журнал идемпотентности
  для checkout и seller операций.
- Новые: `sotuvchi_inventory`, `sotuvchi_inventory_moves`,
  `sotuvchi_notifications`.

## Tenant, privacy и events

- Tenant source только Runtime `OrgContext` + owner membership + собственный
  store. Tool input с org/store override отклоняется.
- Events P2.5 не добавлены до atomic outbox policy платформы.
- Error classes content-free; fixtures только вымышленные.

## Migration и rollback

- `0022_sotuvchi_orders_inventory.sql` additive; runtime bootstrap
  повторяемый; destructive SQL отсутствует. Migration не применялась.
- Code rollback: relay revert, затем P2.5 code revert.
- Если `0022` применена отдельно, после отключения seller traffic удаляются
  только её индексы и три таблицы в обратном порядке. Колонка
  `fulfillment_status` остаётся: её удаление требует отдельного одобренного
  SQLite table rebuild.

## Проверенный baseline P2.5

- `npx tsc -b` — exit 0.
- Orders/Inventory 37/37 (new); Checkout 36/36; Buyer Q&A 39/39;
  Catalog 54/54; Onboarding 28/28; Telegram Agents 41/41; Runtime 49/49;
  Workflow 39/39; Knowledge 33/33; AI 15/15; Tenancy 31/31; Events 20/20;
  Boundaries 10/10; compatibility 1/1; assistant 60/60; gpt-chat 15/15.
  Обязательный итог **508/508**.
- Дополнительные repository suites 78/78; полный итог **586/586**.
- Functions typecheck: ровно 27 baseline legacy errors в шести старых файлах;
  новых platform/agents/channels/endpoint errors 0.
- Scoped ESLint exit 0; boundary checker 0 violations; staged secret/PII/env
  scan 0; `git diff --cached --check` clean.

## Сознательно отсутствует

- Фактическая доставка уведомлений в Telegram, корзина и второй item,
  payment link и провайдеры, refunds, partial fulfillment, multi-warehouse,
  variant inventory, CRM, operator/human handoff и reply bridge, Mini App,
  публичная веб-витрина, внешние службы доставки, рекомендации и свободный
  AI-commerce.
- Timer/cron и состояние `expired`, analytics events, Knowledge projection
  каталога, compensation inventory.

## Следующий этап

Только **P2.6 — Human handoff** после нового задания и проверки
`STATE.next_stage == "P2.6"`. Не начинать P2.7, payments, CRM, deploy или
production migration.

## Рабочая среда

Windows + PowerShell. Pre-existing untracked
`apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не изменять и не
добавлять в коммиты.
