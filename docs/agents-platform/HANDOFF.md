# GPTBot Agents — Handoff

## 1. Состояние
- Дата: 2026-07-26
- Ветка: `main`
- Исходный HEAD P0.3: `46a4412f1b5c84f7bbcf5aeb1295ad8ae3dcdf5f`
- Code commit P0.3: `1776679fdbce570b83d7d372d3fe3d4c94528a89`
- HEAD после relay: последний metadata-only commit в `git log`; по D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA
- Завершённый этап: **P0.3 — Events foundation**
- Следующий этап: **P0.4 — Identity/Orgs/Tenancy**
- Рабочее дерево после relay: только давний pre-existing untracked `apps/gpt-backend/package-lock.json`; файл не изменён, не удалён и не добавлен в коммиты

## 2. Что сделано
1. До изменений проверены branch/HEAD/state gate и baseline P0.2: build 0, boundaries 10/10, Telegram compatibility 1/1, Telegram assistant 60/60, gpt-chat 15/15, ровно 27 legacy functions-config errors и 0 в platform/agents/channels.
2. Существующий `PlatformEvent` расширен рекурсивным JSON-safe `PiiSafePayload`; envelope не дублирован.
3. Создан request-local dependency-free `EventBus`: subscribe/emit, несколько subscribers, порядок регистрации, отсутствие subscribers без ошибки, агрегированное явное поведение ошибок.
4. Создан D1 outbox store с additive migration `0013`, runtime bootstrap и методами `appendEvent`, `getEventById`, `listUnprocessed`, `markProcessed`.
5. Запись идемпотентна по обязательному `idempotency_key`; duplicate возвращает существующую строку со статусом `duplicate` и не вызывает второй emit.
6. Создан runtime PII guard с рекурсией, запретом опасных ключей, безопасными error messages, depth/size limits, JSON validation и fail-closed чтением повреждённого payload.
7. `PlatformEventsService` фиксирует порядок validate → durable append → in-process emit. Ошибка subscriber не удаляет сохранённое событие.
8. Ровно один Javob flow (`javob_message_received` для direct/copied text) переведён на dual-write. Legacy `logEvent` сохранён и выполняется первым.
9. Platform bridge использует Telegram `update_id` для детерминированных event id/idempotency key и сохраняет только `channel`, `locale`, `language`, `sourceType`; raw message и channel identifiers не передаются.
10. Platform outbox failure в bridge не ломает Javob reply и логируется одной content-free константой.
11. Добавлены 20 platform events tests и интеграционная проверка dual-write в существующем Telegram assistant suite.

## 3. Изменённые файлы
- `functions/platform/contracts/events.ts` — рекурсивные `EventValue`/`PiiSafePayload`, существующий `PlatformEvent` использует новый payload type.
- `functions/platform/contracts/index.ts`, `functions/platform/index.ts` — публичные type/module exports без Pages handler exports.
- `functions/platform/events/bus.ts` — request-local bus и `EventDispatchError`.
- `functions/platform/events/pii.ts` — runtime PII/JSON/depth/size guard; лимиты 5 уровней и 8192 encoded bytes.
- `functions/platform/events/store.ts` — единственное место runtime SQL: bootstrap DDL, append/read/list/mark, idempotency и fail-closed JSON.
- `functions/platform/events/schema.ts` — per-D1 WeakMap bootstrap guard, делегирующий DDL store.
- `functions/platform/events/service.ts` — envelope validation и durable-first publish orchestration.
- `functions/platform/events/index.ts` — public events surface.
- `migrations/0013_platform_events.sql` — additive `events` schema, три индекса, rollback notes.
- `functions/lib/telegram/platform-events.ts` — узкий legacy → platform bridge с best-effort failure policy.
- `functions/lib/telegram/handler.ts` — direct `javob_message_received` направлен в bridge; forwarded и остальные legacy events не мигрированы.
- `tests/platform-events.test.ts` — 20 unit/integration cases на in-memory D1 fake.
- `tests/telegram-assistant.test.ts` — D1 fake понимает outbox SQL; direct flow проверяет safe dual-write.
- `docs/agents-platform/{HANDOFF.md,STATE.json,TEST_MATRIX.md,CURRENT_STATE.md,DECISIONS.md}` — relay состояния и D-008.

## 4. Архитектурные решения
- **D-008:** canonical outbox = `events`; publish = validate → durable append → sequential emit; duplicate не emit; bus после запуска всех subscribers выбрасывает aggregated `EventDispatchError`; единственный P0.3 bridge — direct `javob_message_received`, legacy-first и best-effort для platform части.
- Event envelope: `{ id, type, occurredAt, orgId: string|null, agentId: string|null, aggregate, payload: PiiSafePayload }`.
- Схема: `events(id PK, idempotency_key UNIQUE NOT NULL, org_id NULL, agent_id NULL, type, aggregate_ref, payload_json, occurred_at, created_at, processed_at NULL)` + индексы `(org_id, created_at)`, `(type, created_at)`, `(processed_at, created_at)`.
- Idempotency bridge: event id `javob-message-received:<update_id>`; key `telegram:update:<update_id>:message.received`.
- PII policy — runtime guardrail, не DLP: разрешены JSON scalars/arrays/plain objects; запрещены content/PII/channel-identifier keys case-insensitive, включая snake_case/camelCase compounds; errors содержат code/path, но не rejected value.

## 5. Что сознательно не сделано
- Не реализованы P0.4 identities, organizations, memberships, contacts, persons или tenancy.
- Не созданы event dispatcher, queue, cron, retries, dead-letter queue и обработчик `processed_at`.
- Не мигрированы `javob_forward_received`, `javob_context_detected` и любые другие Javob/legacy events; `telegram_events` не изменялась и не удалялась.
- Не создана полноценная аналитика, `/stats`, dashboard или analytics UI.
- Не реализованы Agent Runtime, AI façade, Knowledge/Workflow Engine, agent webhook или Sotuvchi.
- Не исправлялись 27 legacy TypeScript errors и глобальный legacy lint.
- Не выполнялись реальная D1 migration, push или deploy.

## 6. Проверки
- Baseline и post-change `npx tsc -b` → exit 0.
- Baseline и post-change `node --import tsx --test tests/agent-boundaries.test.ts` → 10/10.
- Baseline и post-change `node --import tsx --test tests/telegram-channel-compat.test.ts` → 1/1.
- Baseline и post-change `node --import tsx --test tests/telegram-assistant.test.ts` → 60/60.
- Baseline и post-change `node --import tsx --test tests/gpt-chat.test.ts` → 15/15.
- Post-change `node --import tsx --test tests/platform-events.test.ts` → 20/20.
- Baseline и post-change `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, ровно 27 известных legacy errors, 0 в `functions/{platform,agents,channels}`.
- `npx eslint functions/platform/events tests/platform-events.test.ts functions/lib/telegram/platform-events.ts functions/lib/telegram/handler.ts tests/telegram-assistant.test.ts` → exit 0.
- `git diff --check` и staged `git diff --check` перед code commit → exit 0.
- Staged secret/PII scan: Telegram token pattern 0; `.env/.dev.vars/secrets` 0; email — только два употребления фиктивного `test@example.invalid`; phone-like — только дата `2026-07-26`; реальные пользовательские данные не добавлены.

## 7. Известные проблемы
- Существовали до P0.3: 27 functions-config TypeScript errors в legacy-файлах; глобальный legacy-red ESLint; OOM-риск машины; остальные пункты `KNOWN_ISSUES.md`.
- Ограничение P0.3: если platform append временно падает, legacy metric и user flow сохраняются, но platform-копия этого события теряется — retry/dispatcher сознательно отложены.
- Ограничение P0.3: `processed_at` и `listUnprocessed` подготовлены, но consumer отсутствует, поэтому новые события остаются unprocessed.
- Новых блокеров нет.
- Pre-existing untracked `apps/gpt-backend/package-lock.json` намеренно не тронут.

## 8. Следующая задача
Только **P0.4 — Identity/Orgs/Tenancy**. Проверить следующий свободный номер migration (ожидается `0014`), затем минимально добавить additive schema для `identities`, `organizations`, `memberships`, `contacts` (`persons` — только если реальная модель без него невозможна), repository/store слой в `functions/platform/{identity,orgs}` и негативные tenant-isolation tests. Не начинать P0.5 и не интегрировать новую модель массово в Javob.

## 9. Acceptance criteria следующего этапа
1. `STATE.json.next_stage == "P0.4"` и исходный HEAD/дерево сверены; pre-existing package-lock не тронут.
2. Migration и runtime bootstrap согласованы, additive и имеют rollback notes; существующие production tables не меняются деструктивно.
3. Identity/org contracts минимальны и не дублируют существующие platform contracts без необходимости.
4. SQL находится только в соответствующем repository/store слое; generic ORM не добавлен.
5. Каждое tenant-scoped чтение/изменение требует `orgId`; негативные тесты доказывают, что org A не читает и не меняет данные org B.
6. External channel identity отделена от person/contact/org role; сырые identifiers не попадают в events/logs.
7. System records без org разрешены только при явно документированном контракте; случайный cross-org lookup fail-closed.
8. Все прежние gates не ниже: platform events 20/20, boundaries 10/10, compatibility 1/1, Telegram 60/60, gpt-chat 15/15, `tsc -b` 0, functions-config ≤27 legacy и 0 в platform/agents/channels; новые файлы ESLint 0.
9. Не начаты AI façade, Runtime, Knowledge, Workflow, channel webhook, Sotuvchi или миграция остальных legacy events.
10. STATE/HANDOFF/TEST_MATRIX/CURRENT_STATE обновлены, stage commit локальный; push/deploy не выполнены без отдельного разрешения.

## 10. Команды для старта
```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ARCHITECTURE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ROADMAP.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\CURRENT_STATE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\TEST_MATRIX.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\KNOWN_ISSUES.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\DECISIONS.md
git status --short
git branch --show-current
git rev-parse HEAD
git log -7 --oneline
git diff
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
node --import tsx --test tests/platform-events.test.ts
node --import tsx --test tests/agent-boundaries.test.ts
node --import tsx --test tests/telegram-channel-compat.test.ts
node --import tsx --test tests/telegram-assistant.test.ts
node --import tsx --test tests/gpt-chat.test.ts
npx tsc -p tsconfig.functions.json --noEmit
```

## 11. Риски
- Не ослаблять boundary checker и не направлять `functions/platform/**` к agents/channels/legacy.
- Не превращать nullable `org_id` P0.3 в обход tenant enforcement P0.4; platform-internal event feed не является tenant-facing repository.
- Не хранить Telegram user/chat/file IDs, username, raw message, transcript, prompt, email, phone или address в event payload/log errors.
- Не менять `telegram_events` и не расширять Javob dual-write во время P0.4.
- Lead-бот `aidirectprobot`, его route/token/webhook неприкосновенны.
- Не исправлять legacy errors «заодно», не добавлять package-lock, generated files или secrets.
- Не выполнять push: он может инициировать production deploy.

## 12. Rollback
- Чтобы отменить metadata relay P0.3, выполнить `git revert <последний metadata-only SHA из git log>`.
- Затем отменить code commit: `git revert 1776679fdbce570b83d7d372d3fe3d4c94528a89`.
- На P0.3 migration не применялась и deploy не выполнялся. Если `0013` когда-либо применили вручную и outbox ещё не имеет consumers, отдельно удалить `idx_events_org_created`, `idx_events_type_created`, `idx_events_unprocessed`, затем таблицу `events`; git revert сам D1 schema не откатывает.
- Не использовать `reset --hard` или `clean -fd`; pre-existing untracked package-lock должен сохраниться.
