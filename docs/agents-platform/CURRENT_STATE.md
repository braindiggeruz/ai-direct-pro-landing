# CURRENT_STATE — фактическое состояние репозитория (2026-07-28, P2.6)

## Production boundary

- SEO-фабрика, web AI-chat, админка, Javob `@gptbot_javob_bot` и lead-бот
  `@aidirectprobot` не изменялись.
- Agents webhook, Sotuvchi migrations и setup не публиковались и не
  применялись. Push/deploy отсутствуют.
- Cloudflare Pages/Functions, D1 `GPTBOT_DRAFTS_DB`, Workers AI и KV остаются
  без инфраструктурных изменений.
- Добавлены, но не применены migrations `0018`, `0019`, `0020`, `0021`,
  `0022`, `0023`.
- `origin/main` остаётся `93fab390733d3d5ffbf052e211d95b6038ee4bbd`; вся
  платформа P0.0–P2.6 существует только в локальной ветке.

## Sotuvchi manifest и routing

- Production manifest `sotuvchi` версии `1.5.0`; локали `ru`, `uz`;
  capabilities `store.onboarding`, `store.catalog`, `commerce.order`,
  `handoff`.
- AI selection disabled. Routing deterministic-first.
- Seller catalog tools P2.2, buyer read tools P2.3, `checkout.start` P2.4 и
  семь seller order/inventory tools P2.5 сохранены. P2.6 добавляет пять
  tools: `handoff.request` (buyer), `seller.handoffs.list`,
  `seller.handoff.get`, `seller.handoff.reply`, `seller.handoff.close`.
- Workflows: `sotuvchi-store-onboarding` v1, `sotuvchi-checkout` v1 и
  `sotuvchi-seller-reply` v1.
- `agent_<opaque storefront code>` разрешается только trusted route lookup.
  Durable session связывает platform identity с org/store; active checkout и
  active reply workflow подставляются сервером, а не пользовательским payload.
- Слот workflow в seller-контексте занят onboarding, пока оно идёт; после
  создания магазина слот несёт trusted привязку «следующее сообщение — ответ
  на handoff».
- Endpoint orchestration-only; Platform не импортирует Sotuvchi; Telegram
  renderer не содержит buyer/checkout/seller/handoff business logic.

## Handoff lifecycle (P2.6)

- Статусы: `open → answered → closed`, плюс терминальный `expired`.
- Причины: `unknown_intent`, `buyer_requested_human`, `catalog_no_result`,
  `order_question`, `seller_initiated`. В P2.6 автоматически создаётся только
  `buyer_requested_human`.
- Escalation только по явной просьбе покупателя. Неизвестный вопрос
  по-прежнему получает safe help — теперь с подсказкой, как позвать человека.
  Автоэскалация запрещена: она сохранила бы текст, который покупатель не
  собирался отправлять человеку.
- Одна живая переписка на buyer-сессию: partial unique index
  `idx_sotuvchi_handoffs_active ON (buyer_session_id) WHERE status IN
  ('open','answered')`. Повторный запрос возвращает уже открытый handoff.
- `closed` наступает либо явным закрытием продавцом, либо успешной доставкой
  ответа покупателю. Закрытый handoff неизменяем и освобождает buyer-сессию.

## Content, retention и PII

- `question_text` и `reply_text` (≤1000, plain, bounded CHECK) — единственные
  free-form колонки всего агента.
- Оба очищаются, когда проходит `expires_at` (7 дней): статус становится
  `expired`, `content_cleared_at` штампуется, ответить уже нельзя. Строка
  остаётся как метаданные и никогда не удаляется.
- Sweep opportunistic на каждом scoped чтении/записи; scheduler'а нет, поэтому
  момент физической очистки не гарантирован — гарантирована нечитаемость.
- Нет колонок transcript, вложения, профиля, chat id.
- `sotuvchi_handoff_operations` хранит только шаг, SHA-256 fingerprint и
  target — никогда сам вопрос.
- Seller notice не содержит текст вопроса: превью уведомления — самое лёгкое
  место утечки на экран блокировки. Очередь тоже скрывает контент; detail
  показывает его владельцу.

## Reply bridge

- `sotuvchi_seller_reply_sessions` — PK `(org_id, store_id,
  seller_identity_id)`, состояния `awaiting_reply | completed | cancelled`,
  собственный TTL 24 часа (короче retention контента).
- Привязка дублируется durable `workflow_instances` (`sotuvchi-seller-reply`
  v1), поэтому переживает isolate restart. Payload workflow содержит только
  `handoffId`.
- Повторное нажатие «Ответить» ничего не меняет (`request_key` guard).
- Idempotent replay ответа разрешается **до** проверки состояния сессии:
  отправка переводит сессию в `completed`, поэтому повторный Telegram update
  обязан вернуть сохранённый ответ, а не прочитать settled-сессию как
  отсутствующую цель.
- Ровно один финальный ответ: conditional UPDATE требует `status = 'open'`,
  `reply_text IS NULL`, совпадения `version`, непросроченности и owner
  membership. Ответ, проигравший гонку, отклоняется как `reply_conflict` и
  ничего не перезаписывает.

## Channel address book (platform)

- `functions/platform/channels` — channel-neutral таблица `channel_addresses`
  (`identity_id`, `channel`, `namespace`, `thread_ref`, `status`,
  `UNIQUE (identity_id, channel, namespace)`).
- Адрес отвечает только на вопрос «где достать эту identity». Это транспортная
  деталь, а не authority: membership, ownership и принадлежность переписки
  заново выводятся из домена перед каждой отправкой.
- `namespace` изолирует ботов на одном канале: адрес, привязанный через
  Agents-бота, не может использоваться для Javob или lead-бота.
- Binding выполняется best-effort на inbound: его отказ не ломает текущий turn,
  а лишь откладывает будущие pushed-сообщения.

## Delivery

- `functions/agents/sotuvchi/delivery` — opportunistic dispatcher, вызываемый
  после turn'а для магазина, которого этот turn коснулся. Cron/scheduler'а нет.
- Доставляет три потока: seller notice, buyer reply и notification-интенты
  заказов P2.5, которым до этого этапа физически некуда было слать.
- Delivery state живёт на агрегате handoff: conditional UPDATE, штампующий
  `seller_notified_at` / `buyer_delivered_at`, и есть claim. Второй outbox для
  handoff не заводился; счётчики попыток ограничены сотней.
- Контракт: durable intent + at-least-once попытка + идемпотентные доменные
  эффекты. Повторный текст возможен, exactly-once не заявляется.
- Неудачная доставка сохраняет ответ и повторяется позже. Отсутствующий адрес
  покупателя не теряет ответ.
- Pushed-сообщения проходят тот же strict grounding, что и turn-ответы:
  неподдерживаемое число не доставляется вообще.
- Ответ покупателю всегда несёт маркер авторства `Ответ продавца` /
  `Sotuvchining javobi`.

## Facts и grounding (P2.6)

- Buyer: `handoff.view`, `handoff.status`, `handoff.reason`,
  `handoff.reason_display`, `handoff.reply_text`,
  `handoff.seller_authorship_label`.
- Seller: `seller.view`, `seller.handoff.{id,status,status_display,reason,
  reason_display,created_at,content_available,question_text,reply_text}`,
  `seller.handoffs.count`, `seller.handoffs.<n>.*`.
- Views: `buyer_created`, `buyer_existing`, `buyer_reply`, `seller_notice`,
  `seller_queue`, `seller_detail`, `seller_reply_prompt`, `seller_answered`,
  `seller_closed`.
- Статусы: RU `Новый|Отвечен|Закрыт|Истёк`;
  UZ `Yangi|Javob berilgan|Yopilgan|Muddati tugagan`.
- Весь текст собирается deterministic composer'ом из Facts; claims и все числа
  проходят существующий strict grounding.

## Order lifecycle, inventory и checkout (P2.5/P2.4)

- Пара `(status, fulfillment_status)`, разрешённые переходы
  `placed → confirmed`, `placed → cancelled`, `confirmed → done`, запрет
  `confirmed → cancelled` и отсутствие compensation — без изменений.
- Инварианты inventory (fail-closed `available`, `preorder` без списания,
  запрет подтверждения `unavailable`, три барьера двойного списания) — без
  изменений.
- Buyer parser, ranking, price filter, follow-up P2.3 и checkout FSM P2.4 не
  изменялись, кроме подсказки «позвать продавца» в help и no-result.

## Таблицы Sotuvchi в БД

- P2.1–P2.5: `sotuvchi_stores`, `sotuvchi_onboardings`,
  `sotuvchi_categories`, `sotuvchi_products`, `sotuvchi_catalog_operations`,
  `sotuvchi_storefront_sessions`, `sotuvchi_orders`, `sotuvchi_order_items`,
  `sotuvchi_order_operations`, `sotuvchi_inventory`,
  `sotuvchi_inventory_moves`, `sotuvchi_notifications`.
- Новые P2.6: `channel_addresses` (platform), `sotuvchi_handoffs`,
  `sotuvchi_handoff_operations`, `sotuvchi_seller_reply_sessions`.

## Tenant, privacy и events

- Tenant source только Runtime `OrgContext` + owner membership + собственный
  store либо durable buyer session. Tool input с org/store override
  отклоняется.
- Ссылка на handoff сама по себе не даёт доступа: чужой продавец не может ни
  прочитать, ни ответить, ни закрыть.
- Events P2.6 не добавлены до atomic outbox policy платформы.
- Error classes content-free; fixtures только вымышленные.

## Migration и rollback

- `0023_sotuvchi_handoff.sql` additive; runtime bootstrap повторяемый;
  destructive SQL отсутствует. Migration не применялась.
- Code rollback: relay revert, затем P2.6 code revert.
- Если `0023` применена отдельно, после отключения handoff traffic удаляются
  только её пять индексов и четыре таблицы в обратном порядке. Удаление
  `channel_addresses` также останавливает доставку интентов P2.5 — интенты
  остаются pending и не теряются. Shared orders/checkout/catalog/store таблицы
  не удаляются.

## Проверенный baseline P2.6

- `npx tsc -b` — exit 0.
- Handoff 40/40 (new); Orders/Inventory 37/37; Checkout 36/36;
  Buyer Q&A 39/39; Catalog 54/54; Onboarding 28/28; Telegram Agents 41/41;
  Runtime 49/49; Workflow 39/39; Knowledge 33/33; AI 15/15; Tenancy 31/31;
  Events 20/20; Boundaries 10/10; compatibility 1/1; assistant 60/60;
  gpt-chat 15/15. Обязательный итог **548/548**.
- Дополнительные repository suites 78/78; полный итог **626/626**.
- Functions typecheck: ровно 27 baseline legacy errors в шести старых файлах;
  новых platform/agents/channels/endpoint errors 0.
- Scoped ESLint exit 0; boundary checker 0 violations; staged secret/PII/env
  scan 0; `git diff --cached --check` clean.

## Сознательно отсутствует

- Cron/scheduler, поэтому retention sweep и flush остаются opportunistic.
- CRM, ticketing, назначение оператору, SLA-таймер, staff-роли, вложения,
  голос, фото в handoff, история переписки для продавца.
- Auto-escalation неизвестного вопроса, AI-классификация причины, шаблоны
  быстрых ответов, рассылки.
- Корзина и второй item, payment link и провайдеры, refunds, partial
  fulfillment, multi-warehouse, variant inventory, Mini App, публичная
  веб-витрина, внешние службы доставки, рекомендации и свободный AI-commerce.
- Analytics events, Knowledge projection каталога, compensation inventory.

## Следующий этап

Только **P2.7 — Analytics и pilot readiness** после нового задания и проверки
`STATE.next_stage == "P2.7"`. Не начинать payments, CRM, Mini App, deploy или
production migration.

## Рабочая среда

Windows + PowerShell. Pre-existing untracked
`apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не изменять и не
добавлять в коммиты.
