# CURRENT_STATE — фактическое состояние репозитория (2026-07-27, P2.2)

## Продукты в production (не ломать)

- SEO-фабрика, web AI-chat, админка и существующие API продолжают работать по
  прежним контрактам.
- Javob `@gptbot_javob_bot` и lead-бот `@aidirectprobot` не изменялись.
- Agents webhook, Sotuvchi migrations и новый bot setup не публиковались и не
  применялись. Push/deploy отсутствуют.

## Инфраструктура и migrations

- Cloudflare Pages + Pages Functions; D1 `GPTBOT_DRAFTS_DB`; Workers AI и KV
  остаются без изменений.
- Добавлены, но не применены migrations
  `0018_sotuvchi_store_onboarding.sql` и `0019_sotuvchi_catalog.sql`.
- P2.2 migration/bootstrap добавляют tenant-aware
  `sotuvchi_categories`, `sotuvchi_products`,
  `sotuvchi_catalog_operations`, `sotuvchi_storefront_sessions`, восемь
  catalog/parent indexes, composite FKs, unique/check constraints.
- Runtime bootstrap повторяемый и структурно эквивалентен migration; destructive
  SQL отсутствует. R2, Durable Objects, Queues, cron и второй backend не
  добавлены.

## Sotuvchi Agent

- Production manifest `sotuvchi` версии `1.1.0` зарегистрирован в единственном
  production registry.
- Локали: `ru`, `uz`; capabilities: `store.onboarding`, `store.catalog`.
- Closed-list содержит 12 catalog tools: category create/list/update/archive;
  product create/list/update/publish/unpublish/archive/search/get. Единого
  unrestricted `catalog.execute` нет.
- Runtime использует optional agent-neutral `AgentDomainServicePort`; manifest
  выбирает agent/operation, а tenant берётся только из trusted `OrgContext`.
  Platform не импортирует Sotuvchi.
- AI selection отключён. Seller и buyer routing deterministic-first.

## Category и product model

- Category: server-generated opaque `id` и `slug`, trusted `orgId/storeId`,
  Unicode name, `active|archived`, bounded `sortOrder`, timestamps. Slug unique
  внутри store; archive вместо delete. Category version на P2.2 не добавлена.
- Product: opaque `id`, trusted `orgId/storeId`, optional same-store category и
  SKU, Unicode name, bounded plain description, integer `priceMinor`,
  `currency = UZS`, declarative availability
  `available|unavailable|preorder`, opaque media refs, status, version и
  timestamps.
- SKU trim/canonical uppercase/safe charset, unique только внутри store при
  non-NULL. Media refs — максимум пять opaque safe strings; URL/file upload и
  Telegram file object не входят в domain contract.
- Цена хранится без float: `100000` сум = `price_minor 100000`; допустимы только
  bounded non-negative integers. Форматирование пробелов deterministic; AI цену
  не создаёт.

## Lifecycle, concurrency и idempotency

- Product transitions:
  `draft → published`, `published → draft`,
  `draft|published → archived`.
- Archived product immutable, restore отсутствует. Draft/archived не видны
  buyer. Product в archived category остаётся в БД, но скрывается.
- Publication требует active store, active category при её наличии, valid
  product fields. Product mutation использует conditional
  `org_id + store_id + version`; stale version даёт content-free
  `CatalogVersionConflictError` без silent retry.
- Trusted channel/runtime `requestId` — store-scoped idempotency key.
  Catalog operation хранит SHA-256 fingerprint и target/version; mutation и
  operation row выполняются одним D1 batch. Duplicate create/update/publish не
  повторяет side effect и не повышает version второй раз; reuse ключа с другим
  input отклоняется.
- Active owner membership и принадлежность store проверяются в service и
  непосредственно в mutation SQL. User tool input не может задавать org/store;
  storefront code и buyer identity не дают mutation authority.

## Поиск, Facts и buyer route

- Product/category остаются catalog source-of-truth. Knowledge projection не
  создаётся, потому что без atomic catalog+Knowledge outbox она могла бы стать
  stale.
- Catalog переиспользует публичную RU/Uzbek Latin normalization/tokenization
  Knowledge Engine. Search order:
  exact normalized name → prefix → all tokens → partial tokens → stable
  normalized name/id tie-break.
- Query, token count, candidate/result count ограничены. Search возвращает
  только published products active store с active category или без категории.
- Existing deep-link `agent_<storefrontCode>` разрешает exact trusted route.
  После входа минимальная durable session привязывает platform identity к
  org/store; каждый follow-up повторно проверяет active store/route.
- Buyer output строится из scalar catalog Facts: id/name, integer price,
  display price, currency, availability, description и result metadata. Raw
  product row в renderer не передаётся; unsupported exact price/status не
  проходит grounding.

## Telegram scope

- Seller после completed onboarding получает действия: «Добавить товар»,
  «Мои товары», «Категории», «Опубликовать товар», «Скрыть товар».
- P2.2 использует короткие deterministic structured commands, без нового
  workflow/wizard. Создание даёт draft, публикация/скрытие требуют product id и
  expected version.
- Buyer поддерживает «что у вас есть», поиск по названию,
  «сколько стоит X», «есть ли X», а также RU/UZ/mixed текст.
- Ответ показывает только опубликованный товар текущего storefront: название,
  integer UZS price, availability и bounded description. Заказ не начинается.
- Endpoint остаётся orchestration-only без SQL. Raw update, profile, chat,
  token/secret и D1 handle не попадают в Runtime/domain.

## Tenant isolation, privacy и events

- Все catalog reads/writes содержат `org_id + store_id`; category assignment
  проверяет тот же store, SKU unique scoped к store.
- Org/owner A не читает и не меняет product B; buyer route A не ищет B;
  cross-store product/category и storefront-as-owner fail-closed.
- Operation/session rows не хранят product name/description/SKU/price,
  storefront code, Telegram raw update, phone/email/address или payment data.
- P2.2 domain events не публикуются: atomic outbox policy не согласована,
  поэтому exactly-once не заявляется.

## Сознательно отсутствует

- Cart, checkout, quantity, orders/order items, stock ledger/reservation,
  delivery/address/phone, payments, operator/CRM, human handoff, sales
  analytics, public web catalog, Mini App, R2 upload, CSV import и AI-generated
  descriptions.
- `availability` — только декларативный catalog status, не inventory.

## Проверенный baseline P2.2

- `npx tsc -b` — exit 0.
- Sotuvchi catalog 54/54; onboarding 28/28; Telegram Agents 41/41; Runtime
  49/49; Workflow 39/39; Knowledge 33/33; AI 15/15; tenancy 31/31; Events
  20/20; boundaries 10/10; Telegram compatibility 1/1; Telegram assistant
  60/60; gpt-chat 15/15. Всего обязательных тестов: 396/396.
- Functions typecheck — ровно прежние 27 legacy errors в тех же 6 файлах; 0 в
  P2.2/platform/agents/channels/endpoint scope.
- Scoped ESLint — exit 0; boundary violations — 0; staged secret/PII/env scan —
  0; migration/bootstrap parity и repeated bootstrap подтверждены actual SQLite.

## Следующий этап

Только **P2.3 — Buyer Q&A** после проверки
`STATE.next_stage == "P2.3"`. Расширять deterministic RU/UZ/mixed intents,
карточки и fail-closed buyer answers поверх готового catalog, не меняя его
source-of-truth/tenant authority. Не начинать checkout/orders/inventory,
payments, P2.6 human reply bridge, Mini App, deploy или production migration без
отдельного явного задания.

## Рабочая среда

Windows + PowerShell. Pre-existing untracked
`apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не изменять и не
добавлять в коммиты.
