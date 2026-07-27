# DECISIONS — журнал принятых архитектурных решений

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
