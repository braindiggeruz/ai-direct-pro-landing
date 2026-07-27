# CURRENT_STATE — фактическое состояние репозитория (2026-07-27, P2.4)

## Production boundary

- SEO-фабрика, web AI-chat, админка, Javob `@gptbot_javob_bot` и lead-бот
  `@aidirectprobot` не изменялись.
- Agents webhook, Sotuvchi migrations и setup не публиковались и не
  применялись. Push/deploy отсутствуют.
- Cloudflare Pages/Functions, D1 `GPTBOT_DRAFTS_DB`, Workers AI и KV остаются
  без инфраструктурных изменений.
- Добавлены, но не применены migrations `0018`, `0019`, `0020`, `0021`.

## Sotuvchi manifest и routing

- Production manifest `sotuvchi` версии `1.3.0`; локали `ru`, `uz`;
  capabilities `store.onboarding`, `store.catalog`, `commerce.order`.
- AI selection disabled. Routing deterministic-first.
- Seller tools P2.2 и buyer read tools P2.3 сохранены. P2.4 добавляет ровно
  один tool `checkout.start`.
- Workflows: `sotuvchi-store-onboarding` v1 и `sotuvchi-checkout` v1.
- `agent_<opaque storefront code>` разрешается только trusted route lookup.
  Durable session связывает platform identity с org/store; active checkout
  workflow подставляется сервером, а не пользовательским payload.
- Endpoint orchestration-only; Platform не импортирует Sotuvchi; Telegram
  renderer не содержит buyer/checkout business logic.

## Checkout (P2.4)

- FSM `sotuvchi-checkout`:
  `idle → awaiting_quantity → awaiting_name → awaiting_phone →
  awaiting_address → awaiting_confirmation → completed`, плюс `cancelled`.
  Терминальные состояния `completed` и `cancelled`; таймеров и `expired` нет.
- Workflow payload содержит только `{ orderId }`. Имя, телефон и адрес живут
  исключительно в `sotuvchi_orders`.
- Вход: trusted card action `buyer-checkout.<opaque productId>` на полной
  карточке orderable товара. Свободный текст checkout не открывает.
- Один активный draft на buyer session; старт для другого товара возвращает
  существующий заказ с выбором «Продолжить/Отменить».
- Quantity: целое `1..99`, только ASCII-цифры из текста. Имя: `2..80`
  Unicode без control chars. Телефон: `+998` + девять цифр (принимаются
  `+998…`, `998…`, девять цифр, пробелы и дефисы), хранится в E.164.
  Адрес: `5..240` символов plain text.
- Подтверждение атомарно перечитывает published product, active store и
  category, availability `available|preorder` и текущую цену, затем одним D1
  batch переводит заказ в `placed` и пишет operation row.
- Цена изменилась — молчаливого подтверждения нет: snapshot обновляется,
  покупатель получает новый review и подтверждает повторно.
- Order number `S-` + шесть символов `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`,
  unique в пределах store, не кодирует org/store/user/row id.
- Idempotency: trusted `requestId` канала как store-scoped ключ в
  `sotuvchi_order_operations`; проверяется раньше FSM-состояния. Fingerprint
  не содержит PII.

## Заказы в БД

- `sotuvchi_orders` — org/store/buyer session/workflow ref, order number,
  `draft|placed|cancelled`, buyer name/phone/address, integer `total_minor`,
  `UZS`, optimistic `version`, timestamps, `placed_at`.
- `sotuvchi_order_items` — product ref, immutable name/price/availability
  snapshot, quantity и line total. `UNIQUE (order_id)` запрещает второй item.
- `sotuvchi_order_operations` — operation, SHA-256 fingerprint, target и
  версия; raw input и PII не хранятся.
- Table CHECK запрещает `placed` без имени, телефона, адреса, суммы и
  `placed_at`.

## Buyer parser и catalog

- Closed intents, ranking, price filter и follow-up P2.3 не изменялись.
- Полная карточка orderable товара получила действие `Оформить` /
  `Rasmiylashtirish`; остальные действия прежние.

## Facts и grounding

- Checkout Facts scalar-only:
  `checkout.view/state`, `checkout.product.{name,price_minor,price_display,
  availability,availability_display}`, `checkout.quantity(.min/.max)`,
  `checkout.total_minor`, `checkout.total_display`,
  `checkout.customer.{phone_prefix,phone_masked,name_present,address_present}`,
  `checkout.order.{number,status}`, `checkout.price_changed`,
  `checkout.input.rejected`.
- Имя и адрес покупателя не эхо-показываются; телефон только как
  `+998 ** *** ** NN`.
- Все числа и claims проходят существующий strict grounding; unsupported
  total, цена, quantity или order number отклоняются.

## Tenant, privacy и events

- Tenant source только Runtime `OrgContext` + stored session + собственный
  draft заказа покупателя. Tool input с org/store override отклоняется.
- Buyer не имеет seller mutation authority; seller order management
  отсутствует.
- Events P2.4 не добавлены до atomic outbox policy.
- Error classes content-free; fixtures только вымышленные.

## Migration и rollback

- `0021_sotuvchi_checkout.sql` additive; runtime bootstrap повторяемый;
  destructive SQL отсутствует. Migration не применялась.
- Code rollback: relay revert, затем P2.4 code revert. Если `0021` применена
  отдельно, после отключения checkout traffic удаляются только её пять
  индексов и три таблицы в обратном порядке.

## Проверенный baseline P2.4

- `npx tsc -b` — exit 0.
- Checkout 36/36 (new); Buyer Q&A 39/39; Catalog 54/54; Onboarding 28/28;
  Telegram Agents 41/41; Runtime 49/49; Workflow 39/39; Knowledge 33/33;
  AI 15/15; Tenancy 31/31; Events 20/20; Boundaries 10/10; compatibility 1/1;
  assistant 60/60; gpt-chat 15/15. Обязательный итог **471/471**.
- Дополнительные repository suites 78/78; полный итог **549/549**.
- Functions typecheck: ровно 27 baseline legacy errors в шести старых файлах;
  новых platform/agents/channels/endpoint errors 0.
- Scoped ESLint exit 0; boundary checker 0 violations; staged secret/PII/env
  scan 0; `git diff --cached --check` clean.

## Сознательно отсутствует

- Корзина, второй item, inventory/reservation/списание остатка, seller order
  management и уведомления продавцу, payment link и провайдеры, CRM,
  operator/human handoff и reply bridge, Mini App, публичная веб-витрина,
  внешние службы доставки, рекомендации и свободный AI-commerce.
- Timer/cron и состояние `expired`, analytics events, Knowledge projection
  каталога.

## Следующий этап

Только **P2.5 — Orders/inventory** после нового задания и проверки
`STATE.next_stage == "P2.5"`. P2.5 начинает с inventory_moves, защиты от
двойного списания, seller order management и уведомления продавцу поверх уже
существующих `sotuvchi_orders`/`sotuvchi_order_items`. Не начинать P2.6 human
bridge, payments, CRM, deploy или production migration.

## Рабочая среда

Windows + PowerShell. Pre-existing untracked
`apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не изменять и не
добавлять в коммиты.
