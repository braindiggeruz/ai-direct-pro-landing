# DECISIONS — журнал принятых архитектурных решений

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
