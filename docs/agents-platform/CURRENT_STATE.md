# CURRENT_STATE — фактическое состояние репозитория (2026-07-27, P2.1)

## Продукты в production (не ломать)

- SEO-фабрика, web AI-chat, админка и существующие API продолжают работать по
  прежним контрактам.
- Javob `@gptbot_javob_bot` и lead-бот `@aidirectprobot` не изменялись.
- Agents webhook, Sotuvchi migration и новый bot setup не публиковались и не
  применялись. Push/deploy отсутствуют.

## Инфраструктура

- Cloudflare Pages + Pages Functions; D1 `GPTBOT_DRAFTS_DB`; Workers AI и KV
  остаются без изменений.
- Добавлена, но не применена migration
  `0018_sotuvchi_store_onboarding.sql`.
- Migration и runtime bootstrap создают одинаковые additive объекты:
  `sotuvchi_onboardings`, `sotuvchi_stores`, `telegram_agent_routes` и три
  индекса. Runtime bootstrap идемпотентен; destructive SQL отсутствует.
- R2, Durable Objects, Queues, cron и второй backend не добавлены.

## Sotuvchi Agent

- Production manifest `sotuvchi` версии `1.0.0` зарегистрирован в единственном
  production registry.
- Локали: `ru`, `uz`; единственная capability: `store.onboarding`.
- Tool allowlist пуст. Поведение P2.1 реализовано trusted workflow port и
  deterministic rules `seller-start`, `seller-status`, `seller-cancelled`,
  `storefront-start`.
- AI отключён. Catalog, checkout, orders, inventory, analytics, payments
  integration, handoff и Mini App отсутствуют.

## Store profile и owner policy

- `StoreProfile` содержит только `id`, trusted `orgId`, validated name,
  `ru|uz`, `pickup|delivery|both`, allowlisted payment methods,
  server-generated storefront code, `draft|active|suspended` и timestamps.
- Payment methods на P2.1 — декларации `cash`, `card_transfer`,
  `cash_on_delivery`; платёжного API и реквизитов нет.
- Одна platform identity может владеть максимум одним Sotuvchi store. Повторный
  start возвращает активный onboarding или существующий магазин.
- Telegram username/profile/phone/address и raw update как store/onboarding
  business data не сохраняются.

## Persistent onboarding

- P1.2 Workflow Engine расширен optional trusted `reducePayload`; результат
  каждого reducer повторно проходит payload validation до commit.
- FSM: `start → awaiting_name → awaiting_locale → awaiting_delivery →
  awaiting_payment → review → completed`; из активных состояний доступен
  `cancelled`.
- Payload содержит только `storeName`, `locale`, `deliveryMode`,
  `paymentMethods`.
- Optimistic version, tenant-scoped instance, transition idempotency и restart
  persistence обеспечиваются Workflow Engine.
- Валидация закрытая: Unicode RU/UZ name 2–80 без control chars и URL-only,
  exact locale/delivery/payment allowlists, минимум один и максимум три
  уникальных payment methods. `orgId` и storefront code во входе запрещены.

## Organization, owner и completion

- Start сначала закрепляет уникальный `sotuvchi_onboardings` claim за platform
  identity, затем переиспользует P0.4
  `OrganizationStore.createOrganizationWithOwner`.
- Созданные organization + owner membership атомарны; provisional organization
  имеет opaque системный slug и используется как tenant workflow.
- Confirmation сначала проверяет owner membership. Затем один D1 batch создаёт
  store и trusted route; strict insert и unique constraints дают rollback при
  collision, после чего storefront code генерируется заново, максимум 5 раз.
- Недопустимы store без owner membership и route без store. Если isolate
  прервётся между owner setup и workflow/store, durable onboarding claim
  позволяет продолжить ту же organization, а не создать дубль.
- Completed confirmation и повторный Telegram update не повторяют side effects.

## Storefront code и trusted route

- Code формата `s-` + 16 lowercase RFC 4648 base32 символов (`a-z2-7`):
  80 бит server-side entropy, длина 18, unique constraint и collision retry.
- Code не содержит organization/identity/Telegram id, имя, телефон или
  последовательный integer и никогда не принимается из user input.
- Seller entry: trusted `agent_seller`.
- Buyer deep-link: `https://t.me/<bot>?start=agent_<storefrontCode>`.
- Deep-link payload — только lookup key. Tenant берётся из D1
  `telegram_agent_routes` по exact `(bot_username, route_code)`; unknown route
  fail-closed. Buyer route возвращает `storefront-start` и не запускает seller
  onboarding.

## Telegram integration

- Используется существующий `POST /api/telegram/agents`; второй webhook не
  создан.
- Endpoint остаётся orchestration-only и не содержит business SQL.
- Channel adapter передаёт resolver только platform identity, bot username,
  locale и dedup-derived idempotency key. Trusted resolver добавляет
  `entryActionId` и tenant-scoped workflow coordinates.
- Runtime остаётся Telegram-neutral: raw update, profile, chat/token/secret и D1
  handle в него не передаются.
- Существующая P1.4 secret guard, normalization, at-most-once update reservation,
  renderer и setup protection сохранены.

## Tenant isolation и события

- Tenant-sensitive API принимает identity context, а не произвольный `orgId`.
- Owner membership проверяется при чтении и изменении; identity A не может
  читать/изменять store B, workflow tenant-scoped, route не может подменить org.
- P2.1 не публикует domain events. Atomic domain-write/outbox policy для этого
  потока пока отсутствует, поэтому exactly-once не заявляется. Допустимые
  PII-safe event names/payload остаются будущим отдельным решением.

## Проверенный baseline P2.1

- `npx tsc -b` — exit 0.
- Sotuvchi onboarding 28/28; Telegram Agents 41/41; Runtime 49/49; Workflow
  39/39; Knowledge 33/33; AI 15/15; tenancy 31/31; Events 20/20; boundaries
  10/10; Telegram compatibility 1/1; Telegram assistant 60/60; gpt-chat 15/15.
- Functions typecheck — ровно прежние 27 legacy errors в тех же 6 файлах; 0 в
  P2.1/platform/agents/channels scope.
- Расширенный scoped ESLint — exit 0; boundary violations — 0;
  staged secret/PII scan — 0.

## Следующий этап

Только **P2.2 — Sotuvchi Catalog** по ROADMAP после отдельной проверки
`STATE.next_stage == "P2.2"`. Не начинать checkout, orders, inventory,
payments, human handoff, Mini App, deploy или production migration без нового
явного задания.

## Рабочая среда

Windows + PowerShell. Pre-existing untracked
`apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не изменять и не
добавлять в коммиты.
