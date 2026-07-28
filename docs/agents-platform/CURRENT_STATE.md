# CURRENT_STATE — фактическое состояние репозитория (2026-07-28, R0.3 частично)

## Текущий release relay: R0.3 заблокирован, R0.4 подготовлен только локально

- Authoritative state: `current_stage: R0.3`, `stage_status: in_progress`,
  `last_completed_stage: R0.2`, `next_stage: R0.3B`, `blocked: true`.
- Parallel local preparation now also contains
  `first_party_automation_runtime: prepared_locally` and
  `n8n_retirement: prepared_not_executed`. D1 ledger, Queue/DLQ consumer,
  Cron handler, strict Queue contract and admin enqueue/replay boundaries are
  prepared locally. No Worker, Queue, binding, Cron or migration was created
  in production.
- n8n is not declared retired. `n8n_ingest` may satisfy the future owner gate
  through one complete evidence path: ROTATED or RETIRED. Admin remains
  ROTATED-only.
- R0.3B automation и owner kit готовы. Замены admin credential и
  `N8N_INGEST_TOKEN` хранятся только в Windows-защищённом vault вне Git, но
  внешняя установка, проверка и отзыв старых значений не выполнены.
  `N8N_INGEST_TOKEN` консервативно считается потенциально раскрытым.
- До live rewrite необходимо подтвердить freeze всех writers: Railway
  auto-deploy, Cloudflare Pages auto-deploy, SEO scheduler и другие automation
  writers. Затем rewrite может обновить только allowlisted загрязнённые refs с
  точными lease; до этого remote history остаётся неизменной.
- `R0.4-prep: completed_locally` в
  `27e7ddbe03695a859c9a7c11e7e93b450309946b`. Этап R0.4 **не завершён**,
  production заблокирован, R1 не начат.
- Финальная локальная доказательная база: targeted baseline 22/22; owner
  evidence policy 6/6; обязательный Agents baseline 584/584; полный baseline
  762/762 по 32 suites. Migration и backup/restore rehearsals прошли на
  synthetic/local data; deployment и Wrangler dry-run не мутируют внешние
  сервисы.
- Root dependency audit: установлен React Router 7.18.1, affected range
  `>=7.12.0 <8.3.0`, fix `8.3.0`. Текущий BrowserRouter SPA не имеет RSC
  build/runtime dependency или unstable RSC imports. Machine-verified narrow
  exception разрешает только local prep; blind major upgrade не выполнялся,
  R1 остаётся blocked до isolated migration spike или нового review.
- Не выполнялись push/deploy, production D1 migration, webhook mutation или
  pilot.

## R0.3 Credential Incident Response — НЕ ЗАВЕРШЁН

- Code commit: `77d46d403cde210b5453214d61296ac261ca51e2`.
- Сделано: current-tree remediation + **R0.3C** secret prevention gate.
- Не сделано: **R0.3B** — ротация, rewrite истории, force-update refs.
- `memory/test_credentials.md` и два дубликата в `gptbot-audit/` удалены из
  дерева и заблокированы `.gitignore`. В **истории** материал остаётся.
- Инцидент: 5 путей, 12 commits с материалом, 409/459 commits под перезапись,
  11/11 локальных веток, 38/42 remote-веток, 5/5 тегов, 2 stash, 5 открытых PR.
  Репозиторий публичный, экспозиция с 2026-06-21 → значения считать
  скомпрометированными.
- Prevention gate: `scripts/scan-secrets.ts` (redacted-вывод: правило, путь,
  строка), `tests/secret-scan.test.ts` 14/14, CI workflow, npm-скрипты
  `scan:secrets` / `test:secret-scan`. Валидирован против реального инцидента:
  22/23 версий заблокированы, 0 ложных на 2463 файлах.
- GitHub secret scanning и push protection включены, но за пять недель не дали
  ни одного алерта: значения generic. `secret_scanning_non_provider_patterns`
  через API на текущем плане не включается.
- Offline-bundle всей истории создан вне репозитория, не опубликован.
- Baseline: **720/720** по 28 suites; остальные гейты зелёные.

## R0.2 Backend Dependency Hardening

## R0.2 Backend Dependency Hardening

- R0.2 code commit:
  `a364b45dd9355c4ef432951c4c1e88ef8da3bc81`.
- Repository-sync merge (не commit этапа, D-023):
  `8f42081598e37bdaa5a072ed7ec8be53a4dc0d38`. Интегрировал два
  SEO-content-only remote commit'а (`025a217`, `1a68a12`) обычным `--no-ff`
  merge. 27 локальных stage SHA не переписывались; после merge behind 0.
- Railway backend работает на **Fastify 5.10.0** (было 4.29.1).
  `npm audit --omit=dev` в `apps/gpt-backend`: **0 findings** вместо 6 High.
  Цепочка: `fast-uri` 3.1.4/4.1.1, `find-my-way` 9.7.0,
  `fast-json-stringify` 7.0.1, `@fastify/ajv-compiler` 4.0.5,
  `@fastify/fast-json-stringify-compiler` 5.1.0 — всё через поддерживаемый
  граф Fastify 5, без overrides.
- Сборка приложения вынесена в `apps/gpt-backend/src/app.ts` (`buildApp()`);
  `server.ts` остался единственным модулем, который слушает порт. Это позволяет
  прогонять реальное приложение через `app.inject()` без открытия сокета.
- Валидация тела по-прежнему на **zod**, route schema Fastify не используется,
  поэтому ужесточение JSON Schema в v5 неприменимо. Единственное изменение
  типов: `setErrorHandler` аннотирован `FastifyError` (в v5 ошибка иначе
  `unknown`).
- Восстановлен контракт v4 для пустого JSON-тела: Fastify 5 отклоняет
  `Content-Type: application/json` с пустым телом, а CF-gateway ставит этот
  заголовок безусловно, поэтому `DELETE /v1/gpt/session/:id` начал бы отвечать
  400 вместо 401. Точечный content-type parser парсит пустое тело в `undefined`
  и отдаёт решение route; malformed JSON — controlled 400. Защита от prototype
  poisoning (`__proto__`/`constructor`), которую давал дефолтный
  `secure-json-parse`, воспроизведена явно.
- **npm** подтверждён как deployment package manager (`railway.json` собирает
  `npm install && npm run build`). `apps/gpt-backend/package-lock.json` теперь
  tracked и authoritative; `npm ci` в чистой директории вне репозитория
  воспроизводит дерево, typecheck и build exit 0.
- Node runtime не менялся: Fastify 5 требует Node ≥ 20, `engines.node` уже
  `">=20"`, deployment-файлы не трогались.
- Baseline: R0.2 backend security 30/30; backend 18/18; R0.1 web-security
  13/13; required Agents 584/584; весь repository **706/706** по 27 suites;
  root TypeScript/build, backend TypeScript/build и scoped ESLint exit 0;
  Functions сохраняет ровно 27 legacy errors в тех же 6 файлах и 0 новых;
  boundaries 10/10.
- Production не изменялся: push/deploy/migrations/webhook/secrets не
  выполнялись. Следующий этап — только R0.3 Credential Incident Response.

## R0.1 Web Security Hardening

- R0.1 code commit:
  `6c0f723ccda2725acfd91e76f05276e64fe2fbb4`.
- Turnstile enforcement выполняется на Cloudflare edge до Railway/local
  provider work, если configured server secret объявляет challenge
  обязательным. Клиент загружает public config, работает fail-closed при
  config/widget error и отправляет одноразовый token только на edge.
- Siteverify проверяет success, exact action и request hostname, ограничивает
  token 2048 символами и timeout 5 секунд. GPT Chat и admin login разделены
  actions `gpt_chat`/`admin_login`.
- Direct Railway chat ingress закрыт internal gateway secret до body/provider
  processing. Turnstile token удаляется из proxy body.
- Root React Router находится на 7.18.1. Исправленные 7.x advisories больше не
  присутствуют в production audit; остаётся RSC-only
  `GHSA-qwww-vcr4-c8h2`, неприменимый к текущему declarative BrowserRouter
  приложению без RSC.
- GPT Chat RU/UZ, Sotuvchi RU/UZ, canonical redirects, 404 и public navigation
  не переведены на Router и не изменены. Admin deep routes и wildcard fallback
  проверены на 7.18.1.
- Baseline: required Agents 584/584; весь repository 676/676; R0.1 suite 13/13;
  root TypeScript/build, backend TypeScript/build и scoped ESLint exit 0;
  Functions сохраняет ровно 27 legacy errors в тех же 6 файлах и 0 новых;
  boundaries 10/10, checker 0 violations.
- Production не изменялся: push/deploy/migrations/webhook/secrets не
  выполнялись. Следующий этап — только R0.2.

## Production boundary

- SEO-фабрика, web AI-chat, админка, Javob `@gptbot_javob_bot` и lead-бот
  `@aidirectprobot` не изменялись.
- Agents webhook, Sotuvchi migrations и setup не публиковались и не
  применялись. Push/deploy отсутствуют.
- Cloudflare Pages/Functions, D1 `GPTBOT_DRAFTS_DB`, Workers AI и KV остаются
  без инфраструктурных изменений.
- Добавлены, но не применены migrations `0018`, `0019`, `0020`, `0021`,
  `0022`, `0023`. **P2.7 новой migration не добавляет.**
- Добавлены две публичные страницы `content/pages/{ru,uz}/sotuvchi.json`; они
  собираются существующим prerender, но не задеплоены.
- `origin/main` остаётся `93fab390733d3d5ffbf052e211d95b6038ee4bbd`; вся
  платформа P0.0–P2.7 существует только в локальной ветке.

## Sotuvchi manifest и routing

- Production manifest `sotuvchi` версии `1.6.0`; локали `ru`, `uz`;
  capabilities `store.onboarding`, `store.catalog`, `commerce.order`,
  `handoff` (P2.7 новую capability не вводит).
- AI selection disabled. Routing deterministic-first.
- Seller catalog tools P2.2, buyer read tools P2.3, `checkout.start` P2.4,
  семь seller order/inventory tools P2.5 и пять handoff tools P2.6 сохранены.
  P2.6 добавил `handoff.request` (buyer), `seller.handoffs.list`,
  `seller.handoff.get`, `seller.handoff.reply`, `seller.handoff.close`.
  P2.7 добавляет один owner-only tool `seller.stats.get`.
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
- P2.7 новых таблиц не создаёт: аналитика пишет в существующую платформенную
  `events` (migration `0013`).

## Analytics (P2.7)

- Каталог событий закрытый и узкий: `sotuvchi.buyer_started`,
  `sotuvchi.catalog_answered`, `sotuvchi.catalog_no_result`,
  `sotuvchi.stats_viewed`.
- Lifecycle-переходы заказа, остатка и handoff событиями **не** дублируются:
  их точный счёт принадлежит domain-таблицам, второй источник истины запрещён.
- Payload — только closed-list токены, boolean и bounded счётчики:
  `locale`, `source`, `intent`, `result_bucket`, `full_card`, `window_days`.
  `intent` валидируется по закрытому buyer-списку.
- Отклоняются: произвольные строки, длинные значения, неизвестное имя события,
  пустой org/request. Chat/thread ref, storefront code, имя, телефон, адрес,
  текст вопроса и ответа не передаются вовсе; PII-guard платформы не ослаблен.
- Idempotency key — trusted channel `requestId`; повторный Telegram update не
  добавляет вторую строку и не вызывает второй emit.
- Гарантия: durable intent + best-effort append **после** доменной записи.
  Recorder не повторяет доменную операцию и глушит свои ошибки, поэтому
  аналитика может недосчитать, но не может продублировать доменный эффект.
  Exactly-once не заявляется.
- Точка съёма воронки — декоратор domain-порта `withSotuvchiAnalytics`: он
  читает уже произведённые scalar Facts и не может изменить или повторить
  вызов. `buyer_started` пишется в endpoint при разрешении deep-link витрины.

## Отчёт `/stats` (P2.7)

- Owner-only: trusted `OrgContext.actorId` + active owner membership + active
  store через существующий `catalog.resolveOwnerContext`. Покупатель, чужой
  владелец, отключённое membership и другая identity в том же чате получают
  одинаковый content-free отказ.
- Tool `seller.stats.get` не принимает параметров: окно, tenant и store
  определяются сервером. Команды: `/stats`, `Статистика`, `statistika`, плюс
  кнопка `seller-stats`.
- **Точный** блок (окно 7 дней либо «сейчас»): опубликованные товары,
  начатые оформления, оформленные заказы, подтверждено, отменено, выполнено,
  открытые вопросы, отвеченные вопросы.
- **Приблизительный** блок воронки: открытия витрины, ответы по каталогу, без
  результата. В тексте явно помечен как оценка, которая может быть занижена.
- Не считаются: revenue, прибыль, средний чек, conversion rate,
  time-to-seller-reply — схема не позволяет посчитать их честно.
- Запросы tenant-scoped, ограничены по времени, параметризованы, возвращают
  только `COUNT(*)`; PII и контент не читаются. Числа проходят strict
  grounding.

## Публичные страницы и bot config (P2.7)

- `/ru/sotuvchi/` и `/uz/sotuvchi/` собираются существующим prerender:
  взаимный hreflang, canonical, sitemap, FAQ, внутренние ссылки в обе стороны.
- `src/shared/sotuvchi-config.ts` — единственный публичный источник ссылки на
  Agents-бота. Username ещё не зарегистрирован, поэтому константа `null`, а CTA
  ведёт на секцию `#pilot`, а не на угаданный `t.me`-адрес.
- Хелпер отказывает для `aidirectprobot` и `gptbot_javob_bot` и собирает
  `?start=agent_seller` только для валидного username.
- `scripts/sotuvchi-pilot-check.ts` — offline read-only проверка конфигурации:
  без сетевых вызовов, без вывода значений секретов, без мутации webhook.

## Tenant, privacy и events

- Tenant source только Runtime `OrgContext` + owner membership + собственный
  store либо durable buyer session. Tool input с org/store override
  отклоняется.
- Ссылка на handoff сама по себе не даёт доступа: чужой продавец не может ни
  прочитать, ни ответить, ни закрыть.
- События одного org не видны другому org: аггрегатное чтение
  `countEventsByType` всегда содержит предикат `org_id`.
- Error classes content-free; fixtures только вымышленные.

## Migration и rollback

- `0023_sotuvchi_handoff.sql` additive; runtime bootstrap повторяемый;
  destructive SQL отсутствует. Migration не применялась.
- **P2.7 новой migration не создаёт**, поэтому откат кода P2.7 не требует
  изменений схемы БД.
- Code rollback: relay revert, затем code revert соответствующего этапа.
- Если `0023` применена отдельно, после отключения handoff traffic удаляются
  только её пять индексов и четыре таблицы в обратном порядке. Удаление
  `channel_addresses` также останавливает доставку интентов P2.5 — интенты
  остаются pending и не теряются. Shared orders/checkout/catalog/store таблицы
  не удаляются.

## Проверенный baseline P2.7

- `npx tsc -b` — exit 0; `npm run build` — exit 0 (seo-audit gate, vite,
  prerender, sitemap, robots, llm-markdown).
- Pilot readiness 36/36 (new); Handoff 40/40; Orders/Inventory 37/37;
  Checkout 36/36; Buyer Q&A 39/39; Catalog 54/54; Onboarding 28/28;
  Telegram Agents 41/41; Runtime 49/49; Workflow 39/39; Knowledge 33/33;
  AI 15/15; Tenancy 31/31; Events 20/20; Boundaries 10/10; compatibility 1/1;
  assistant 60/60; gpt-chat 15/15. Обязательный итог **584/584**.
- Дополнительные repository suites 78/78; полный итог **662/662**.
- SEO audit: 0 critical, 105 published pages, orphan 0.
- Build output: `dist/ru/sotuvchi/index.html`, `dist/uz/sotuvchi/index.html`,
  обе страницы в `sitemap.xml` с взаимным hreflang.
- Functions typecheck: ровно 27 baseline legacy errors в шести старых файлах;
  новых platform/agents/channels/endpoint errors 0.
- Scoped ESLint exit 0; boundary checker 0 violations; staged secret/PII/env
  scan — только фикстурные литералы теста; `git diff --cached --check` clean.

## Сознательно отсутствует

- Cron/scheduler, поэтому retention sweep и flush остаются opportunistic.
- Daily aggregate table, web dashboard, внешняя аналитика, экспорт и
  user profiling.
- Revenue, прибыль, средний чек, conversion rate, time-to-seller-reply.
- CRM, ticketing, назначение оператору, SLA-таймер, staff-роли, рассылки,
  вложения, голос, фото в handoff, история переписки для продавца.
- Auto-escalation неизвестного вопроса, AI-классификация причины, шаблоны
  быстрых ответов, AI-генерация ответов продавца.
- Корзина и второй item, payment link и провайдеры, refunds, partial
  fulfillment, multi-warehouse, variant inventory, Mini App, публичная
  веб-витрина, внешние службы доставки, рекомендации и свободный AI-commerce.
- Knowledge projection каталога, compensation inventory.

## Следующий этап

**P3 — пилот** по ROADMAP: onboarding runbook, pilot dashboard,
feedback-форма, incident handling, weekly metrics.

P3 операционный: он требует push, deploy, применённых migrations `0013–0023` и
настроенного webhook. Всё это остаётся заблокированным до отдельной одобренной
владельцем release/security-задачи, которая закрывает разделы 1–4
`SOTUVCHI_PRODUCTION_READINESS.md`. Governance gap зафиксирован в
`STATE.json`: между P2.7 и P3 в ROADMAP отсутствует security/release-фаза.
Изобретать скрытую feature-фазу вместо неё запрещено.

## Рабочая среда

Windows + PowerShell. Pre-existing untracked
`apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не изменять и не
добавлять в коммиты.
