# DECISIONS — журнал принятых архитектурных решений

## D-023 (2026-07-28, R0.2) Fastify 5 migration, npm lockfile policy и repository-sync merge вне лимита этапа

**Remote integration отдельным merge.** На старте R0.2 фактический `origin/main`
ушёл вперёд на два commit'а (`025a217`, `1a68a12`) — обе публикации SEO-кластеров
от GPTBot SEO Bot, затрагивающие только `content/`, `public/assets/` и
`reports/seo-clusters/`: 45 файлов, +4562/−10, ноль пересечений с backend,
`functions/`, `src/`, `migrations/`, governance и lockfiles. Пересечения путей с
27 локальными commit'ами нет вообще, `git merge-tree` дал чистое дерево без
конфликтов, secret-скан чист. Интеграция выполнена **обычным non-fast-forward
merge** `8f42081`, потому что 27 локальных stage SHA (включая R0.1 `6c0f723` и
`748de36`) обязаны остаться неизменными: rebase, reset и любая переписка истории
запрещены и не выполнялись. Этот merge — repository-sync, **он не входит в лимит
D-006 «максимум 2 commit'а на этап»**: R0.2 состоит ровно из code commit и relay
commit.

**Fastify 4 → 5 как контролируемая SemVer-major миграция.** `npm audit fix` и
широкий upgrade запрещены и не применялись. Fastify 4.29.1 переведён на 5.10.0
по официальному migration guide, потому что вся цепочка advisory (6 High)
закрывается только мажором: `fast-uri` 2.4.0/3.1.3 → 3.1.4/4.1.1 (path traversal
`GHSA-q3j6-qgpj-74h6`; host confusion `GHSA-v39h-62p7-jpjc`,
`GHSA-v2hh-gcrm-f6hx`, `GHSA-4c8g-83qw-93j6`), `find-my-way` 8.2.2 → 9.7.0
(`GHSA-c96f-x56v-gq3h`), `fast-json-stringify` 5.16.1 → 7.0.1,
`@fastify/ajv-compiler` 3.6.0 → 4.0.5, `@fastify/fast-json-stringify-compiler`
4.3.0 → 5.1.0, плюс сам Fastify (`GHSA-jx2c-rxcm-jvmq` content-type tab bypass,
`GHSA-444r-cwp2-x5xf` forwarded-header spoofing, `GHSA-mrq3-vjjr-p77c`).
Overrides для `find-my-way`, `fast-uri` и compiler-пакетов **не** использовались:
всё пришло через поддерживаемый граф Fastify 5. Supabase, OpenRouter, jose,
pino, zod, root-пакет и frontend не обновлялись.

**Node runtime.** Fastify 5 требует Node ≥ 20; backend уже объявляет
`engines.node: ">=20"`, и `railway.json` собирает через NIXPACKS, который это
объявление читает. Никакой deployment-файл менять не потребовалось и не менялся.

**Поверхность миграции оказалась узкой, потому что валидация — на zod.** Route
schema Fastify не используется, поэтому ужесточение «full JSON schema required»
неприменимо. Из удалённого/изменённого API не используется ничего: `routerPath`,
`routeConfig`, `request.connection`, `reply.redirect`, `getResponseTime`,
`reply.sent`, custom HEAD, `{version}`, decorator-reference-types,
нестандартные HTTP-методы. Логгер передаётся **опциями, а не инстансом**, так
что разделение `logger`/`loggerInstance` тоже не задело. Потребовалось ровно одно
изменение типов: `setErrorHandler` в v5 типизирует ошибку как `unknown`, пока не
закреплён generic — аннотирован `FastifyError`.

**Два осознанных изменения кода.** Первое: сборка приложения вынесена из
`server.ts` в новый `app.ts` с экспортом `buildApp()`, чтобы полностью собранное
приложение можно было прогонять через `app.inject()` без открытия порта;
`server.ts` остаётся единственным модулем, который слушает. Фейковые endpoint'ы
ради тестов запрещены и не создавались.

Второе: v5 отклоняет запрос с `Content-Type: application/json` и пустым телом
(`FST_ERR_CTP_EMPTY_JSON_BODY`). Cloudflare-gateway (`proxyToRailway`)
**безусловно** ставит этот заголовок на каждый forwarded-вызов, включая методы
без тела, поэтому `DELETE /v1/gpt/session/:id` начал бы отвечать 400 от
body-парсера вместо 401 от собственного auth-guard. Это подтверждено тестом до
исправления. Контракт v4 восстановлен точечным content-type parser: пустое тело
парсится в `undefined` и решение принимает route, а malformed JSON по-прежнему
fail-closed с контролируемым 400. Поскольку этот parser заменяет дефолтный,
построенный на `secure-json-parse` (`protoAction`/`constructorAction` = `error`),
его защита от prototype poisoning воспроизведена явно: ключ `__proto__` или
`constructor` отклоняется. Это единственное место, где миграция могла молча
ослабить безопасность, и оно закрыто тестом.

**npm как canonical backend package manager, lockfile — tracked.** `railway.json`
собирает `npm install && npm run build`, значит deployment-менеджер именно npm.
`apps/gpt-backend/package-lock.json` исторически лежал untracked, но **не был
gitignored** — его просто никогда не добавляли. Он соответствует manifest
(lockfileVersion 3), не содержит auth-материала и резолвится только на
`registry.npmjs.org`. Теперь он tracked и authoritative: `npm ci` в чистой
директории **вне репозитория** воспроизводит дерево и проходит typecheck и build,
то есть deploy становится воспроизводимым.

**Границы.** API-контракт сохранён; единственное поведенческое отличие,
которое внёс мажор, нейтрализовано и закрыто тестом. Push, deploy, Railway
deploy, применение migrations, настройка webhook, изменение и ротация secrets,
чтение credential-значений, переписка истории и force push не выполнялись.
`memory/test_credentials.md` не открывался — проверено только tracked-наличие.
Следующий этап — R0.3 Credential Incident Response.

## D-022 (2026-07-28, R0.1) Edge-first abuse control, isolated Turnstile actions и private Railway ingress

R0.1 сохраняет существующую optional-configuration policy Turnstile, но
устраняет fail-open при configured secret: объявленный server secret означает,
что каждый GPT Chat request обязан иметь валидный одноразовый token. Проверка
выполняется на Cloudflare edge до Railway, quota, IP hashing, D1 и provider
work. Network/non-2xx Siteverify error не включает fallback provider path.

Siteverify success недостаточен сам по себе: проверяются exact action и request
hostname. GPT Chat использует `gpt_chat`, admin login — `admin_login`; token
одного flow не может быть принят другим. Token ограничен по длине, живёт только
в React state, очищается после попытки и удаляется из Railway proxy body.
Public config раскрывает только required flag и public site key.

Railway `/v1/gpt/chat` является private costly ingress и до Origin/body/provider
проверяет constant-time internal gateway secret. Это не меняет Supabase,
provider, quota или плановую семантику и не является R0.2 dependency upgrade.

React Router обновлён в пределах 7.x до 7.18.1. Admin route constants и deep
route/wildcard regression связывают тест с реальным `AdminApp`. Public GPT
Chat/Sotuvchi/404/canonical routing остаётся вне Router. Оставшийся
`GHSA-qwww-vcr4-c8h2` документирован как RSC-only и неприменимый, пока приложение
не использует React Server Components; major migration отложена до реальной
applicability.

## D-021 (2026-07-28, P2.7) Domain tables как source-of-truth статистики, content-free best-effort события и owner-only `/stats`

P2.7 делает Sotuvchi измеримым и операционно готовым к пилоту. Payments, CRM,
staff-роли, рассылки, Mini App, внешний dashboard и полная история переписки в
этап не входят, production не изменяется.

Главное решение — не создавать вторую аналитическую истину. Каждое число,
которое продавец видит как точное, читается из таблицы, которой это число уже
принадлежит: опубликованные товары из `sotuvchi_products`, начатые оформления
и оформленные заказы из `sotuvchi_orders`, переходы
подтверждён/отменён/выполнен из `sotuvchi_notifications`, открытые и
отвеченные вопросы из `sotuvchi_handoffs`. `sotuvchi_notifications` подходит
как ledger переходов не случайно: `UNIQUE (order_id, audience, type)` даёт
ровно одну строку на переход, а строка пишется в том же D1 batch, что и сам
переход, поэтому счёт атомарен и устойчив к повтору. Дублировать эти же
переходы событиями означало бы завести второй, более слабый источник, который
неизбежно разойдётся с доменом.

Поэтому каталог событий Sotuvchi сознательно узкий — четыре имени:
`sotuvchi.buyer_started`, `sotuvchi.catalog_answered`,
`sotuvchi.catalog_no_result`, `sotuvchi.stats_viewed`. Они покрывают ровно то,
чего нет ни в одной domain-таблице: повторные открытия витрины и исход
buyer-вопроса. События не являются authority ни для статуса заказа, ни для
остатка, ни для состояния handoff, ни для прав продавца.

Новая migration не создавалась. События пишутся в существующий P0.3 outbox
`events` (migration `0013`), отчёт читает существующие таблицы. Отдельная
daily-aggregate таблица не заводилась: точные счётчики получаются bounded
tenant-scoped запросами, а таблица агрегатов немедленно стала бы третьим
источником истины с собственным лагом.

Гарантия доставки названа честно. `PlatformEventsService` сначала durable
append, затем emit, и duplicate по idempotency key не вызывает второй emit;
но доменная запись и append событий **не** атомарны. Recorder выполняется
после успешной доменной операции, никогда её не повторяет и глушит собственные
ошибки. Следствие зафиксировано прямо: аналитика может недосчитать, но не
может продублировать доменный эффект, и exactly-once для неё не заявляется.
Idempotency key — trusted channel `requestId`, поэтому повторный Telegram
update не добавляет вторую строку. Ради идеальной атомарности событий крупный
рефакторинг P2.1–P2.6 не проводился.

Точка съёма воронки — декоратор domain-порта `withSotuvchiAnalytics`. Он
читает уже произведённые scalar Facts buyer-операции (`catalog.query.intent`,
`catalog.result.count`, `catalog.result.full_card`) и физически не может
изменить, повторить или отменить доменный вызов. `buyer_started` пишется в
endpoint при разрешении deep-link витрины, потому что trusted route и org там
уже известны, а повторное открытие витрины не оставляет следа в домене.

Payload события — только closed-list токены, boolean и bounded счётчики.
`intent` валидируется по закрытому buyer-списку, поэтому строка покупателя не
может попасть в событие даже как «интент». Отклоняются произвольные строки,
длинные значения, неизвестное имя события, пустой org/request. Chat/thread
ref, storefront code, имя, телефон, адрес, текст вопроса и ответа не
передаются вовсе, а PII-guard платформы дополнительно режет опасные ключи.

`/stats` — owner-only и content-free. Authority только из trusted Runtime
`OrgContext.actorId` плюс active owner membership и active store через
существующий `catalog.resolveOwnerContext`. Покупатель, чужой владелец,
отключённое membership и другая identity в том же Telegram-чате получают
одинаковый content-free отказ, поэтому отчёт не подтверждает существование
чужого магазина. Tool не принимает параметров вообще: окно, tenant и store
определяются сервером. Запросы параметризованы, tenant-scoped, ограничены по
времени и возвращают только `COUNT(*)`; ни имя, ни телефон, ни адрес, ни текст
вопроса не читаются.

Отчёт разделён на два блока и это разделение видно продавцу: «Точные данные» и
«Оценка воронки (приблизительно, может быть занижена)». Смешивать их
запрещено. Revenue, прибыль, средний чек, conversion rate и
time-to-seller-reply не считаются: текущая схема не позволяет посчитать их
честно, а неверная метрика хуже отсутствующей. Все числа собираются кодом из
trusted query results и проходят существующий strict grounding.

Публичная ссылка на бота централизована в `src/shared/sotuvchi-config.ts`.
Username Agents-бота ещё не зарегистрирован, поэтому константа равна `null`, а
CTA лендинга ведёт на секцию `#pilot` вместо угаданного `t.me`-адреса: рабочая
ссылка на чужой бот в production опаснее отсутствующей ссылки. Хелпер отказывает
для `aidirectprobot` и `gptbot_javob_bot` и собирает `?start=agent_seller`
только для валидного username. Лендинги `/ru/sotuvchi/` и `/uz/sotuvchi/`
следуют существующему content/prerender-паттерну и позиционируют продукт как
независимый AI-сервис без обещаний роста, гарантий и выдуманных отзывов.

Setup остаётся read-only по умолчанию. `scripts/sotuvchi-pilot-check.ts` не
делает сетевых вызовов вообще, не печатает значения секретов и не меняет
webhook; мутация webhook остаётся исключительно за
`scripts/telegram-agents-setup.ts setup` без `--dry-run`. Release остаётся
blocked: `SOTUVCHI_PRODUCTION_READINESS.md` не отмечает ни одного пункта
автоматически, а в ROADMAP между P2.7 и P3 отсутствует security/release-фаза —
это зафиксировано как governance gap в `STATE.json`.

## D-020 (2026-07-28, P2.6) Durable human handoff bridge, channel address book и opportunistic dispatcher

P2.6 добавляет двусторонний мост между вопросом покупателя и владельцем
магазина, платформенную адресную книгу и outbound-диспетчер. CRM, ticketing,
назначение оператору, SLA-таймер, staff-роли, вложения, голос, payments и
Mini App в этап не входят.

Escalation остаётся явной. Автоматически создаётся только
`buyer_requested_human`: неизвестный вопрос по-прежнему получает safe help,
теперь с подсказкой, как позвать человека. Автоэскалация каждого непонятого
сообщения одновременно спамила бы продавца и сохраняла бы в БД текст, который
покупатель не собирался отправлять человеку. Причины `unknown_intent`,
`catalog_no_result`, `order_question` и `seller_initiated` объявлены в схеме,
но в P2.6 не создаются кодом — это точки расширения, а не мёртвые ветки.

Одна живая переписка на buyer-сессию обеспечивается partial unique index
`(buyer_session_id) WHERE status IN ('open','answered')`. Это делает
невозможным и флуд очереди одним покупателем, и потерю уже отправленного
вопроса: повторный запрос детерминированно резолвится в существующий handoff.

Bounded `question_text` и `reply_text` — единственные free-form колонки всего
агента. Оба очищаются, когда проходит `expires_at`, то есть окно retention
(7 дней) обеспечивается данными, а не договорённостью: после очистки handoff
переходит в `expired`, содержимое читается как null и ответ невозможен. Строка
остаётся как метаданные и никогда не удаляется, поэтому очередь и статистика
не искажаются задним числом. Transcript, вложения, профиль и chat id не
хранятся; operation log содержит только шаг, SHA-256 fingerprint и target.
Scheduler'а в платформе нет, поэтому sweep opportunistic на каждом scoped
чтении/записи: момент физической очистки не гарантируется, гарантируется
нечитаемость просроченного контента.

Reply-мост состоит из двух согласованных частей: durable `workflow_instances`
(FSM `sotuvchi-seller-reply` v1 с payload из одного `handoffId`) и
store-scoped `sotuvchi_seller_reply_sessions` с собственным TTL 24 часа,
заведомо более коротким, чем retention контента. FSM даёт переживание isolate
restart и единый способ отмены, таблица сессии даёт быстрый store-scoped
lookup и `request_key`-guard, из-за которого повторное нажатие «Ответить»
ничего не меняет.

Idempotent replay ответа разрешается раньше проверки состояния сессии.
Отправка ответа переводит сессию в `completed`, поэтому проверка состояния
первой заставляла повторный Telegram update читать settled-сессию как
отсутствующую цель и падать. Порядок теперь: найти сессию любого состояния →
проверить replay по trusted `requestId` → и только затем требовать
`awaiting_reply`. Fingerprint покрывает шаг и target, но не текст ответа —
как и в `handoff.create`.

Ровно один финальный ответ обеспечивается conditional UPDATE, который
одновременно требует `status = 'open'`, `reply_text IS NULL`, совпадения
`version`, непросроченности и owner membership. Ответ, проигравший гонку
конкурентному ответу, отклоняется как content-free `reply_conflict` и ничего
не перезаписывает.

`channel_addresses` вынесена в `functions/platform/channels`, а не в Sotuvchi,
потому что «где достать эту identity» — вопрос платформы, а не агента, и он
одинаков для будущих агентов. Адрес принципиально не является authority:
tenant membership, store ownership и принадлежность переписки заново выводятся
из домена перед каждой отправкой. `namespace` изолирует ботов, делящих канал,
поэтому адрес, привязанный через Agents-бота, не может быть использован для
Javob или lead-бота. Binding выполняется best-effort на inbound: его отказ не
ломает текущий turn, а лишь откладывает будущие pushed-сообщения.

Delivery state живёт на самом агрегате handoff, а не во втором outbox.
Conditional UPDATE, штампующий `seller_notified_at` или `buyer_delivered_at`,
и есть claim, поэтому один интент не может быть сохранён дважды, а дубликат
push не может создать второе доменное изменение. Успешная доставка ответа
покупателю и есть закрытие переписки. Неудачная доставка сохраняет ответ и
повторяется позже, поэтому второй ответ продавца никогда не требуется.

Диспетчер opportunistic: cron'а нет, поэтому pending-интенты магазина
доставляются сразу после turn'а, который их коснулся. Контракт —
durable intent + at-least-once попытка + идемпотентные доменные эффекты;
повторный текст возможен, exactly-once не заявляется. Тот же путь доставляет
notification-интенты заказов P2.5, которые до P2.6 физически некуда было
слать: это закрывает долг P2.5, не заводя второй транспорт.

Pushed-сообщения проходят тот же strict grounding, что и turn-ответы: черновик
собирается из scalar Facts и валидируется до отправки, поэтому неподдерживаемое
число не доставляется вообще. Ответ покупателю всегда несёт маркер авторства
(`Ответ продавца` / `Sotuvchining javobi`), поэтому человеческий ответ нельзя
принять за ответ бота. Seller notice сознательно не содержит текст вопроса:
превью уведомления — самое лёгкое место утечки текста покупателя на экран
блокировки.

Events P2.6 не публикуются: atomic domain-write/outbox policy платформы
по-прежнему не согласована, а фиктивная гарантия доставки запрещена. Migration
`0023` additive и не применялась. Rollback кода: relay revert, затем P2.6 code
revert. Если `0023` когда-либо применена отдельно, после отключения handoff
traffic удаляются только её пять индексов и четыре таблицы в обратном порядке;
удаление `channel_addresses` останавливает доставку интентов P2.5, но не
теряет их.

## D-019 (2026-07-27, P2.5) Inventory ledger, idempotent seller order transitions и durable notification intents

P2.5 добавляет seller-сторону поверх P2.4: управление заказом, количественный
inventory и durable notification outbox. Payments, refunds, partial
fulfillment, multi-item cart, multi-warehouse, variant inventory, CRM, human
handoff и Mini App в этап не входят.

Order lifecycle не получает новую колонку статуса. P2.4 зафиксировал узкий
`CHECK (status IN ('draft','placed','cancelled'))`, а SQLite не расширяет
CHECK без полного table rebuild; rebuild живой таблицы заказов — неоправданный
риск ради трёх значений. Поэтому добавлена одна additive колонка
`fulfillment_status IN ('none','confirmed','done')`, и фактический seller-статус
выводится из пары `(status, fulfillment_status)`: `placed`, `confirmed`,
`cancelled`, `done`. Любая другая пара считается corrupt row, а не новым
состоянием. Разрешены только `placed → confirmed`, `placed → cancelled`,
`confirmed → done`. `confirmed → cancelled` запрещён сознательно: компенсирующее
движение склада создало бы второй путь изменения баланса и риск двойного
возврата, поэтому compensation-движения не существует вовсе. Отменённый заказ
всегда сохраняет `fulfillment_status = 'none'`; инвариант держится conditional
SQL каждого перехода, потому что table-level CHECK к существующей таблице
SQLite добавить нельзя. Продавцу видны только заказы с `placed_at IS NOT NULL`,
поэтому отменённые покупателем draft-заказы в seller-скоуп не попадают.

Inventory — отдельный количественный источник истины, а не производная от
каталога. `sotuvchi_inventory` хранит integer `on_hand` `0..1 000 000` с
optimistic `version` и PK `(org_id, store_id, product_id)`;
`sotuvchi_inventory_moves` — append-only ledger с типами `initial`,
`manual_adjustment`, `order_confirmed`. Декларативное `availability` никогда не
превращается в число: `available` требует существующую строку баланса и
`on_hand >= quantity`, отсутствие строки — fail-closed, а не «бесконечный
остаток»; `preorder` подтверждается без списания и помечается явно;
`unavailable` подтвердить нельзя. Availability проверяется по живому товару в
момент подтверждения, поэтому продавец, снявший товар с продажи, обязан сначала
вернуть его в продажу. Manual arbitrary delta не добавлен: продавец задаёт
абсолютный остаток, а delta вычисляется сервером.

Подтверждение выполняется одним D1 batch: conditional decrement (по
`version` и `on_hand >= quantity`, с вложенной проверкой заказа, товара,
магазина и owner membership), вставка движения, условный переход
`placed → confirmed`, operation row и notification intent. Guard'ы вложены так,
что первый statement применяется тогда и только тогда, когда применяются
остальные; иначе не применяется ничего. Из-за этого недостижимы `confirmed` без
движения, движение без `confirmed`, отрицательный остаток, двойное списание,
дублирующее движение и дублирующий notification intent. Двойное списание
закрыто тремя независимыми барьерами: условием `fulfillment_status = 'none'`,
условием inventory `version` и partial unique index
`(order_id, type) WHERE order_id IS NOT NULL`.

Идемпотентность переиспользует существующую `sotuvchi_order_operations` как
единый store-scoped журнал для buyer checkout и seller операций: trusted
`requestId`, имя операции, SHA-256 fingerprint без PII, target и версия
результата. Повтор того же ключа возвращает сохранённый результат; другой
fingerprint на том же ключе даёт content-free conflict. Повтор перехода с
другим requestId, когда заказ уже в целевом состоянии, возвращает `unchanged`
и ничего не пишет; повторная установка того же остатка тоже ничего не пишет.

Notification — durable intent, а не отправка. Domain mutation никогда не
вызывает Telegram: placement и каждый seller transition пишут строку в
`sotuvchi_notifications` внутри собственного batch, а `UNIQUE (order_id,
audience, type)` не даёт создать второй intent. Строка не содержит payload
вообще: renderer заново читает trusted order, поэтому имя, телефон и адрес
покупателя физически не попадают в outbox. Таблица вынесена в отдельный модуль
`functions/agents/sotuvchi/outbox`, потому что у неё два писателя — checkout и
seller-переходы — и ни один модуль не должен импортировать другой. Delivery
semantics заявляются честно: durable intent плюс at-least-once попытка плюс
идемпотентные доменные эффекты; при падении после отправки возможен повторный
текст. Exactly-once не заявляется. Фактический push продавцу и покупателю в
P2.5 не реализован: он требует durable mapping identity → chat reference,
которого в repository нет, а его создание принадлежит транспортному этапу.
Platform events по-прежнему не публикуются до atomic outbox policy ядра.

Seller authority остаётся server-derived. Closed list из семи операций:
`seller.orders.list`, `seller.order.get`, `seller.order.confirm`,
`seller.order.cancel`, `seller.order.done`, `seller.inventory.get`,
`seller.inventory.set`. Актор берётся только из trusted Runtime
`OrgContext.actorId`, магазин — из active owner membership через существующий
`catalog.resolveOwnerContext`, и owner membership дополнительно проверяется
внутри каждого мутирующего SQL, чтобы авторитет не устарел между чтением и
записью. Продавец не может передать `orgId`, `storeId`, чужой заказ, баланс или
авторитет над товаром; покупатель seller tools не получает. PII-политика
разделена по представлениям: список заказов не содержит имя, телефон и адрес,
а detail отдаёт их авторизованному владельцу магазина, потому что именно он
выполняет доставку. Facts остаются scalar и namespaced, ответы собираются
deterministic composer'ом и проходят существующий strict grounding.

Migration `0022_sotuvchi_orders_inventory.sql` additive и не применялась.
Safe code rollback: relay revert, затем P2.5 code revert. Если `0022` будет
применена отдельно, после отключения seller traffic удаляются только её
индексы и три таблицы в обратном порядке; колонка `fulfillment_status`
остаётся, потому что её физическое удаление требует отдельного одобренного
SQLite table rebuild.

## D-018 (2026-07-27, P2.4) Single-product persistent checkout, immutable Catalog snapshot и PII-minimal order placement

P2.4 добавляет ровно один сценарий: покупатель оформляет **один published
product × целое quantity**. Корзины, второй позиции, inventory reservation,
списания остатка, seller order management, уведомления продавцу, платежей,
CRM, human handoff и Mini App в этапе нет. `ROADMAP.md` P2.4 и master handoff
§1.3 совпадают, поэтому выбран узкий MVP scope без расширения.

Checkout — declarative FSM `sotuvchi-checkout` v1 на существующем P1.2 Workflow
Engine: `idle → awaiting_quantity → awaiting_name → awaiting_phone →
awaiting_address → awaiting_confirmation → completed`, плюс `cancelled` из
любого нетерминального состояния. Таймеров и `expired` нет: без scheduler
фиктивный timeout не имитируется. Workflow payload содержит **только**
`{ orderId }`. Имя, телефон и адрес живут исключительно в `sotuvchi_orders`,
поэтому platform-таблицы `workflow_instances`/`workflow_transitions` остаются
PII-free.

Порядок внутри шага: сначала domain write (условный SQL по
`org+store+id+status='draft'+version+buyer_session_id`), затем workflow
transition. Падение между ними оставляет prompt на прежнем шаге, а повтор того
же значения идемпотентен; обратный порядок мог бы дать `placed` заказ без
данных, поэтому запрещён.

Trusted authority: Telegram identity → `sotuvchi_storefront_sessions` (active
route + active store) → server-side org/store → собственный draft заказа
покупателя. Из пользовательского ввода нельзя задать `orgId`, `storeId`,
`buyerSessionId`, workflow instance, владельца заказа, цену, валюту, статус
публикации и product authority. Checkout стартует только с trusted full card
action `buyer-checkout.<opaque productId>`; свободный текст checkout не
открывает, поэтому P2.3 Q&A не изменился.

Product eligibility проверяется через публичный Catalog API на старте и
повторно на подтверждении: published, active store, active или отсутствующая
category, availability `available|preorder`. `unavailable` запрещён, preorder
явно показывается покупателю. Цена всегда читается из Catalog; callback,
текст, карточка и tool arguments ценой быть не могут. Если цена изменилась,
подтверждение не проходит молча: snapshot обновляется, покупатель получает
новый review с пометкой и обязан подтвердить ещё раз; второй draft при этом не
создаётся.

Заказ хранится в трёх additive таблицах migration `0021_sotuvchi_checkout.sql`:
`sotuvchi_orders`, `sotuvchi_order_items`, `sotuvchi_order_operations`. Item
вынесен в отдельную таблицу ради будущей P2.5, но `UNIQUE (order_id)`
(`idx_sotuvchi_order_items_single`) делает второй item невозможным, а P2.4 API
его не принимает. `idx_sotuvchi_orders_active_draft` — partial UNIQUE по
`buyer_session_id WHERE status='draft'`: один активный checkout на покупателя.
Старт для другого товара при активном draft возвращает существующий заказ с
выбором «Продолжить/Отменить» и не создаёт второй. Table-level CHECK запрещает
`placed` без имени, телефона, адреса, суммы и `placed_at`; conditional UPDATE
дополнительно требует непустое quantity, совпадение `line_total_minor` с
`total_minor` и живой published product с той же ценой — placement и запись
operation выполняются одним D1 batch.

Идемпотентность: trusted `requestId` канала (`tg-agents-<update_id>`) —
store-scoped ключ в `sotuvchi_order_operations`. Ключ проверяется **до**
FSM-состояния, поэтому повтор start/quantity/name/phone/address/confirm/cancel
возвращает сохранённый результат вместо второго эффекта или ошибки состояния.
Тот же ключ с другим fingerprint fail-closed. Fingerprint покрывает только
шаг и не-PII значения: имя, телефон и адрес никогда не хешируются в operation
log.

Order number генерируется сервером: `S-` + 6 символов алфавита
`23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (30 бит, без 0/1/I/O), `UNIQUE (org_id,
store_id, order_number)` и до пяти попыток. Он не кодирует org, store, user или
row id.

Buyer-facing вывод строится только из scalar Facts
(`checkout.product.*`, `checkout.quantity`, `checkout.total_*`,
`checkout.customer.phone_masked`, `checkout.customer.address_present`,
`checkout.order.number/status`). Raw order row в renderer не попадает. Имя и
адрес не эхо-показываются вовсе, телефон только как `+998 ** *** ** NN`.
Поддержан один формат номера — Uzbekistan `+998` + девять цифр. Все числа и
claims проходят существующий strict grounding; unsupported total, цена,
quantity или order number отклоняются. Разрешённые actions: `Оформить`,
`Продолжить`, `Подтвердить`, `Отменить`; кнопок оплаты, управления заказом,
оператора и изменения остатка нет.

Заказ — заявка, а не оплаченная покупка: продавец на P2.4 уведомления и
интерфейса не получает, остаток не меняется, платёж не создаётся. Events по-
прежнему не публикуются до atomic outbox policy.

Migration `0021` не применялась ни локально, ни на production. Runtime
bootstrap `ensureSotuvchiCheckoutSchema` структурно эквивалентен и создаёт те
же объекты. Rollback кода: relay revert, затем P2.4 code revert. Если `0021`
была применена отдельно, после отключения checkout traffic удаляются только её
пять индексов и три таблицы в обратном порядке; shared store/catalog/session/
workflow/tenant таблицы не трогаются.

## D-017 (2026-07-27, P2.3) Deterministic Buyer Q&A, grounded cards и минимальный follow-up

P2.3 оставляет Catalog единственным source-of-truth и не добавляет LLM intent:
buyer parser полностью deterministic-first. Closed intents:
`catalog.list`, `catalog.search`, `product.price`, `product.availability`,
`product.details`, `catalog.filter_price`, `catalog.help`, `unknown`. Порядок
фиксирован: bounded/control validation, public Knowledge normalization,
conservative typo repair, exact phrases, integer price extraction, contextual
follow-up, RU/Uzbek Latin/mixed patterns, bounded plain product-name search,
unknown. Транслитерация, float/currency conversion и profile recommendations
запрещены.

Buyer authority существует только после trusted deep-link route lookup и
durable identity→org/store session. Read path всегда повторно проверяет active
route/store, published product и active category. User text/tool input не
задаёт org/store/agent/storefront code; buyer не получает seller mutation
authority. Opaque product ID разрешён как bounded action ref, потому что он
server-generated и каждый callback revalidated внутри current storefront.

Для card output Platform расширен generic `OutboundCard` и trusted deterministic
tool composer. Это channel-neutral contract, не Sotuvchi import: Runtime
валидирует bounds/controls/action IDs, затем grounding требует, чтобы card
title, description и field values буквально присутствовали в scalar Facts;
claims и numeric scan сохраняются. Telegram только рендерит card plain text и
safe buttons. Разрешены `Подробнее`, `Следующие товары`, `Назад к каталогу`;
Buy/checkout/order/handoff actions отсутствуют.

Facts namespaced по result index и содержат только opaque id, name, integer
price/source+localized display, currency, declarative availability/source+
localized display, bounded description, optional category и result metadata.
Raw rows, org/store/SKU/version/media/storefront code не доходят до renderer.
Unknown/help не содержит product claims. Price filter принимает только bounded
integer UZS и сортирует price asc → normalized name → opaque ID.

Для одного безопасного pronoun follow-up существующая
`sotuvchi_storefront_sessions` получает additive nullable
`last_product_id`, `last_intent`, `selection_request_key`, `selected_at`.
Сохраняются только exact single-product result и trusted request ID; raw
message/query/transcript/profile/contact не сохраняются. Conditional session
update идемпотентен, stale/unpublished/foreign product fail-closed. Conversation
table и TTL/profile memory не создаются.

Migration `0020` не применялась. Safe code rollback оставляет nullable columns;
их физическое удаление требует отдельного SQLite table rebuild change. Events
не добавлены до atomic outbox policy. Cart, checkout, order, quantity,
inventory, payments, seller notification, CRM/operator/human bridge, public
storefront и Mini App переходят только в отдельные этапы.

## D-016 (2026-07-27, P2.2) Catalog source-of-truth, deterministic domain search и trusted domain port

P2.2 хранит каталог в собственных tenant-scoped domain tables migration `0019`:
`sotuvchi_categories`, `sotuvchi_products`, `sotuvchi_catalog_operations` и
`sotuvchi_storefront_sessions`. Категории имеют server-generated opaque
`id`/`slug`, status `active|archived` и deterministic sort order. Category
version сознательно не добавлена: P2.2 требует optimistic concurrency только
для продукта; category mutation остаётся owner-only, идемпотентной и
archive-only вместо delete.

Продукт хранит optional same-store category/SKU, Unicode name, bounded plain
description, integer `price_minor` в единственной валюте `UZS`, декларативное
`available|unavailable|preorder`, opaque media refs, status
`draft|published|archived` и optimistic `version`. Разрешены только
`draft → published`, `published → draft`, `draft|published → archived`;
archived immutable и restore отсутствует. Conditional SQL проверяет
`org_id + store_id + version`, owner membership и active store. Publication
дополнительно требует active category, если она назначена.

Runtime получает новый agent-neutral optional `AgentDomainServicePort`. Manifest
по-прежнему задаёт closed-list tool и сам выбирает `agentId`/operation; caller
не может передать arbitrary operation, `orgId` или store authority. Sotuvchi
domain port разрешает owner store только из trusted Runtime `OrgContext.actorId`
и active membership. Buyer store разрешается из trusted storefront route/org.
Platform не импортирует Sotuvchi, endpoint не содержит catalog SQL, AI selection
остаётся disabled.

Category/product source-of-truth не проецируется в Knowledge на P2.2. Причина:
без атомарной связки catalog write + Knowledge write/outbox projection могла бы
стать stale и выдать неправильный publication/availability. Вместо этого
catalog переиспользует публичные Knowledge normalization/tokenization, а
parameterized domain search ранжирует exact normalized name → prefix → all
tokens → partial tokens → normalized name/id tie-break. Buyer query/result/token
ограничены; видны только published products активного store в active category
или без категории. Это решение можно пересмотреть после atomic outbox policy.

Повтор mutation использует channel-derived `requestId` как store-scoped
idempotency key. `sotuvchi_catalog_operations` хранит только operation,
SHA-256 fingerprint и target/version; mutation и operation row записываются
одним D1 batch. Повтор того же input возвращает сохранённый result, повтор ключа
с другим fingerprint fail-closed. Product name, description, SKU, price и raw
input в operation log не сохраняются.

Buyer deep-link по-прежнему разрешается существующей trusted route. P2.2
добавляет минимальную durable binding `(bot_username, platform identity) →
org/store`, чтобы следующий текст после `/start` остался в том же storefront.
Binding содержит только internal IDs/status/timestamps и при чтении повторно
проверяет active store и active route; storefront code не становится seller
authority. Seller UX — deterministic actions плюс короткие structured commands,
без нового conversational workflow. Buyer responses создаются из scalar
catalog Facts; raw row в renderer не передаётся, price/availability проходят
существующий grounding.

Catalog events не публикуются: atomic domain-write/outbox policy всё ещё не
согласована, поэтому exactly-once не имитируется. Checkout, orders, quantity,
inventory reservation/ledger, delivery/address/phone, payment integration,
human handoff, CRM, analytics, public web storefront, Mini App, R2 upload, CSV
и AI descriptions отсутствуют. Migration `0019` additive и не применялась.
Rollback кода: relay revert, затем P2.2 code revert. Если `0019` когда-либо
применена отдельно, после отключения catalog traffic удаляются только восемь её
индексов и четыре таблицы в обратном порядке; shared store/onboarding/tenant
tables не удаляются.

## D-015 (2026-07-27, P2.1) Recoverable Sotuvchi onboarding, opaque routes и один owner-store

P2.1 добавляет первый production manifest `sotuvchi` только с capability
`store.onboarding`, RU/UZ, deterministic rules, trusted workflow port и пустым
tool allowlist. AI и arbitrary update tool отсутствуют. Catalog, checkout,
orders, inventory, payments integration, handoff и Mini App не входят в этап.

Onboarding хранится в P1.2 Workflow Engine. Trusted TypeScript definition может
использовать optional `reducePayload`, но reducer output всегда повторно проходит
payload validation до commit. FSM:
`start → awaiting_name → awaiting_locale → awaiting_delivery →
awaiting_payment → review → completed`, плюс `cancelled`; payload содержит
только `storeName`, `locale`, `deliveryMode`, `paymentMethods`.

Поскольку workflow tenant-scoped уже при создании instance, orchestration
двухфазная и recoverable. `sotuvchi_onboardings` сначала атомарно закрепляет
уникальный platform identity claim, затем существующий P0.4
`createOrganizationWithOwner` создаёт organization + owner membership одним
D1 batch. После owner check финальный D1 batch создаёт `sotuvchi_stores` и
`telegram_agent_routes`. Foreign keys запрещают store без organization/owner и
route без store; strict inserts и unique constraints откатывают collision.
Interruption до completion оставляет максимум resumable provisional
organization, а не второй tenant/store. Автоматический GC provisional
organizations отсутствует.

MVP policy: одна owner identity имеет максимум один Sotuvchi store. Повторный
start возвращает active onboarding или existing store; completed confirmation и
duplicate Telegram update не повторяют side effects. Store profile хранит
validated name, `ru|uz`, `pickup|delivery|both`, декларативные `cash`,
`card_transfer`, `cash_on_delivery`, status и timestamps. Telegram profile,
phone/address, raw update, payment details и user-supplied org/storefront code
не сохраняются.

Storefront code генерируется сервером как `s-` + 16 lowercase RFC 4648 base32
символов (`a-z2-7`): 80 бит entropy, bounded length, unique constraint и до 5
collision retries. Он не кодирует org/identity/name/phone и служит только lookup
key. Seller входит через allowlisted `agent_seller`; buyer deep-link
`agent_<storefrontCode>` разрешается exact server-side lookup
`(bot_username, route_code) → org/agent/locale`. Buyer route никогда не
запускает seller onboarding.

Tenant-sensitive store API принимает trusted identity context. Owner membership
проверяется на read/write, workflow instance scoped к org, user/agent input не
может передать другой orgId. Endpoint связывает Telegram channel и Runtime, но
business SQL остаётся в Sotuvchi domain, а Runtime остаётся channel-neutral.

P2.1 events не публикуются: согласованной atomic domain-write/outbox policy для
этого completion нет, поэтому exactly-once не заявляется. Migration
`0018_sotuvchi_store_onboarding.sql` additive и не применялась. Rollback code —
relay revert, затем P2.1 code revert; если migration применена отдельно, после
отключения route удаляются только её три индекса и таблицы в обратном порядке,
без удаления shared organizations/memberships/workflow data.

## D-014 (2026-07-27, P1.4) Изолированный Telegram Agents transport и at-most-once update policy
P1.4 использует только новый env namespace `TELEGRAM_AGENTS_BOT_TOKEN`,
`TELEGRAM_AGENTS_WEBHOOK_SECRET`, `TELEGRAM_AGENTS_BOT_USERNAME`. Он не
переиспользует `TELEGRAM_BOT_TOKEN`, Javob credentials или endpoints.
`POST /api/telegram/agents` проверяет exact Telegram secret-header до чтения
body и D1; остальные HTTP methods дают 405. Raw update, secret и profile fields
не логируются.

Update после strict ingest резервируется отдельным ключом
`agents:<bot_username>:<update_id>` в additive
`telegram_agent_updates`, не связанной с legacy `telegram_updates`. Статусы
`reserved|completed|failed` фиксируют at-most-once policy: duplicate не
повторяет Runtime/send, а send/processing failure остаётся terminal и требует
операторского разбирательства вместо скрытого повторения side effects. Long
processing выполняется через `waitUntil` только после durable reserve.

Deep-link grammar P1.4 — `agent_<routeCode>`, где routeCode имеет safe bounded
charset и разрешается исключительно trusted server-side mapping. Payload не
содержит и не задаёт `orgId`; arbitrary agent/org и URL отклоняются. Route-local
registry содержит только demo manifest, global production registry остаётся
пустым. Реальный business/storefront mapping и durable identity→org channel
binding не создавались: offline E2E использует injected identity allowlist, а
route mapping принимает только allowlisted start code. Эта граница переходит к
P2.1 onboarding.

Telegram user id преобразуется в string и передаётся Identity service; Runtime
получает только platform `identityId`, trusted org/agent/locale и normalized
text/action. `chat_id`, `update_id`, token, raw user/profile/callback objects
остаются в channel adapter. Renderer отправляет plain text через существующий
`TelegramClient`, делит сообщения, превращает safe choices в bounded callback
buttons и предсказуемо игнорирует media ref beyond text.

Setup вынесен в неисполняемый автоматически
`scripts/telegram-agents-setup.ts`: `getMe` и exact expected username guard
выполняются до mutations; `aidirectprobot` и `gptbot_javob_bot` запрещены;
webhook path/secret обязательны; поддержан dry-run. Скрипт, migration, webhook
setup, push и deploy в рамках этапа не запускались.

## D-013 (2026-07-27, P1.3) Deterministic-first Runtime, explicit Facts и offline demo
P1.3 уточняет один общий `AgentManifest` вместо параллельного контракта:
manifest и его declarations runtime-validatable, а schema/rule/tool handlers
остаются trusted TypeScript-кодом без dynamic loading. Production registration
имеет одну явную точку в `functions/agents/registry.ts`; registry пуст до
отдельного product/channel этапа, demo не импортируется production path.

Turn order фиксирован: caller-provided active workflow через narrow injected
port → deterministic rules по уникальному ascending priority → optional
closed-list AI selection через существующий Platform AI façade → controlled
fallback. AI выбирает только manifest tool и structured arguments; tool input
повторно проходит runtime schema, а tenant override keys запрещены. Runtime
`orgId` — единственный tenant source.

Tool получает только `OrgContext`, request/locale и narrow Knowledge/Workflow
service ports: raw D1, channel clients, secrets и unrestricted platform
container не передаются. Tool output сначала проецируется в namespaced
scalar-only `FactSheet`, затем deterministic locale template формирует exact
claims. Grounding P1.3 механический, а не универсальный truth detector:
template-derived claims должны точно совпасть с Facts, и числа в text/choice
labels должны встречаться в Fact values. Unsupported claim/number даёт
`rejected` с пустым outbound.

Demo agent поддерживает только offline echo и один Knowledge lookup на fake
ports, не регистрируется production и не является Sotuvchi. Workflow
интеграция ограничена injected stub/port без real D1 product flow. Turn Events
не добавлены: существующая publish semantics и требуемая best-effort политика
для сохранения runtime result не согласованы. Conversation history/storage
также отложены. P1.3 не требует migration.

## D-012 (2026-07-27, P1.2) Persistent FSM, atomic transition history и ограниченная action policy
P1.2 хранит tenant-scoped instances и transition history в двух additive D1
таблицах, а доверенные определения FSM — только в TypeScript. Переход фиксируется
одним D1 `batch`: conditional history insert и optimistic instance update,
связанный существованием нового transition id; unique `(org_id, idempotency_key)`
делает create/transition replay идемпотентным, а duplicate проверяется раньше
stale-version. Guards получают только data context без переданных DB/network/AI
capabilities. Closed-list actions валидируются до commit, выполняются
последовательно после durable transition и не повторяются по тому же ключу;
history хранит только PII-safe type/status/code. Политика P1.2 для action —
at-most-once: isolate может умереть между commit и handler, поэтому
non-idempotent production actions требуют будущий durable action outbox/recovery.
Workflow events также отложены до policy, которая атомарно свяжет domain write и
outbox; фиктивная гарантия доставки запрещена. Timer runner/cron/scheduler
отсутствуют, nullable `wake_at` оставлен только как extraction point.

## D-011 (2026-07-27, P1.1) Две Knowledge tables, deterministic search и отложенные revisions/events
P1.1 использует tenant-scoped `knowledge_collections`/`knowledge_items` с
composite tenant FK, agent-owned runtime schema, strict JSON-safe projections и
optimistic item versions. Search v1 — NFKC/lowercase/punctuation normalization,
parameterized exact/prefix/token candidates и fixed deterministic score со
stable tie-break; empty query fail-closed. `knowledge_revisions` отложена до
доказанного audit/rollback требования Sotuvchi. Knowledge events отложены до
отдельной idempotency/dispatch policy. Media refs остаются opaque
channel/store references; доставка не принадлежит Knowledge Engine.

## D-010 (2026-07-27, P0.5) Capability AI façade, config policy и один exact legacy shim
`platform/ai` — provider-neutral capability layer с `complete` и generic
`structured`; streaming/transcription остаются отдельными typed driver
contracts. Task+tier policy задаёт ordered routes и limits. Structured result
успешен только после strict JSON parse и runtime schema validation; errors
content-free/fail-closed. Единственная platform→legacy зависимость разрешена в
exact `functions/platform/ai/drivers/legacy.ts` с маркером `LEGACY-SHIM`.
Production Javob/gpt-chat/STT consumers массово не переключались.

## D-009 (2026-07-26, P0.4) Identity без persons, organization как tenant root и PII-minimal contacts
P0.4 добавил independent identities, organizations, memberships и contacts без
изменения legacy users. Organization — tenant root; repository methods принимают
`orgId` первым бизнес-аргументом и маскируют cross-tenant доступ как not found.
Contacts не хранят raw profile/phone/display name. Organization+owner membership
создаются атомарным D1 batch; identity остаётся самостоятельной записью.

## D-008 (2026-07-26, P0.3) Events durable-first, PII-safe и с точечным bridge
Canonical platform outbox — additive D1 `events`; envelope имеет nullable
org/agent, aggregate ref и runtime-validated `PiiSafePayload`. Idempotency key
создаёт максимум одну row и duplicate не вызывает emit повторно. Service сначала
persist, затем последовательно вызывает in-process subscribers. P0.3 bridge
добавлен только к одному Javob direct-message потоку, не содержит raw content и
не ломает legacy behavior при отказе platform event path. Dispatcher/retries/
queue/cron не реализованы.

## D-007 (2026-07-17, P0.1) Отдельный functions typecheck gate
Официальный `tsc -b` исторически не покрывает `functions/**`. Обязательный gate:
`npx tsc -p tsconfig.functions.json --noEmit` с 0 ошибок в
`functions/{platform,agents,channels}`. Ровно 27 legacy errors в 6 старых файлах
зафиксированы и не должны расти. Включение functions в app build — отдельная
работа после устранения legacy debt.

## D-006 (2026-07-17, P0.1-pre) Правило SHA и максимум двух коммитов
`STATE.json.last_commit` хранит SHA code commit завершённого этапа. Следующий
metadata-only relay отмечается `state_commit: "HEAD"` и определяется git history,
не записывая собственный SHA. На этап разрешены максимум два коммита: code и
relay; рекурсивные SHA-fix commits запрещены.

## D-005 (2026-07-17, P0.0) Push/deploy только по явной команде
Commit обязателен по завершении этапа. Push в `main`, который запускает Cloudflare
deploy, выполняется только по отдельной явной команде владельца.

## D-004 (2026-07-17, P0.0) Baseline не ухудшается
TEST_MATRIX фиксирует минимальные числа pass. Глобальный ESLint признан
legacy-red debt, но новые файлы обязаны иметь scoped ESLint exit 0. Тесты на
машине владельца запускаются file-by-file из-за RAM/OOM.

## D-003 (2026-07-17, P0.0) Поэтапная relay-разработка
Один этап имеет ограниченный scope, проверяется целиком и заканчивается code
commit плюс полная перезапись HANDOFF по шаблону. `STATE.json` — машинная точка
продолжения, HANDOFF — фактологическая передача следующему агенту.

## D-002 (2026-07-17, P0.0) Приоритет источников истины
Фактический код и инфраструктура приоритетнее ARCHITECTURE, а актуальная
ARCHITECTURE приоритетнее старых handoff. Расхождения фиксируются, а не
замалчиваются.

## D-001 (2026-07-17, P0.0) Modular monolith в текущем репозитории
Платформа развивается в `functions/{platform,agents,channels}` без
микросервисов, форков и второго backend. Зависимости направлены
agents/channels → platform contracts; platform не знает agents/channels.

## Унаследованные продуктовые законы
- LLM не пишет точные цифры; deterministic-first и grounding fail-closed.
- Tenant isolation обеспечивается repository/store слоем и `orgId` в каждом SQL.
- Каждый внешний вход имеет idempotency key/unique constraint.
- PII и raw content не попадают в события, аналитику и ошибки.
- Telegram — канал; AI providers — заменяемые drivers.
- `aidirectprobot` неприкосновенен; новые боты имеют отдельные tokens/secrets.
- Sotuvchi MVP использует общий bot+deep links, D1 FSM, Telegram `file_id`,
  без Mini App и платёжных интеграций в v0.
