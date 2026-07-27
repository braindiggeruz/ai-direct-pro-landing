# GPTBot Agents — Handoff

## 1. Состояние
- Дата: 2026-07-27
- Ветка: `main`
- Исходный HEAD P1.1: `fc6b896d522c216839c7f82c2b7de6f1bb681127`
- Code commit P1.1: `c7dc64b61ffbff88e58f8ff96a1c4a9a2c81472e`
- HEAD после relay: последний metadata-only commit в `git log`; по D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA
- Завершённый этап: **P1.1 — Knowledge Engine minimum**
- Следующий этап: **P1.2 — Workflow Engine minimum**
- P0.5 подтверждён в ancestry: code `31021442c12fbc24a9c90f6a42422412c0d7cbb2`, relay/source HEAD `fc6b896d522c216839c7f82c2b7de6f1bb681127`; SEO-история после P0.4 сохранена
- Рабочее дерево после relay: только pre-existing untracked `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`; оба объекта не изменены, не удалены и не добавлены в коммиты

## 2. Что сделано
1. До изменений подтверждены STATE/git gate и baseline P0.5: build 0; AI 15/15, tenancy 31/31, events 20/20, boundaries 10/10, Telegram compatibility 1/1, Telegram assistant 60/60, gpt-chat 15/15; functions-config — 27 legacy errors и 0 platform.
2. Добавлена additive migration `0015_platform_knowledge.sql` с tenant-scoped `knowledge_collections` и `knowledge_items`; legacy/production tables не изменены.
3. Collection хранит `org_id`, extensible `agent_id`/`kind`, `schema_version`, nullable name, status и timestamps; unique `(org_id, agent_id, kind)`.
4. Item дублирует `org_id`, хранит structured JSON, normalized `search_text`, channel-neutral media refs, три indexed numeric values, status и optimistic version. Composite FK `(org_id, collection_id)` физически блокирует cross-tenant parent link.
5. Runtime bootstrap полностью повторяет migration, сначала обеспечивает organizations schema, идемпотентен через per-D1 WeakMap и создаёт 2 tables + 6 indexes.
6. Добавлен validation-library-neutral `KnowledgePayloadSchema<T>`: `validate(unknown)`, `toSearchText`, optional `toMediaRefs` и `toNumericValues`. Schema не знает D1, Telegram API или AI.
7. Payload после schema validation дополнительно проверяется как strict JSON-safe value, ограничивается 65,536 bytes и только затем сериализуется. Raw payload не попадает в errors.
8. Поиск нормализует NFKC/lowercase/whitespace/dash/punctuation для кириллицы и Latin без transliteration, stemming или NLP dependency; Uzbek apostrophe variants схлопываются детерминированно.
9. Candidate SQL параметризован: exact/prefix/any-token через `json_each(?)`, active collection+item, org/agent/kind и optional numeric bounds. Финальный TypeScript score: exact 4000, prefix 3000, all tokens `2000+n`, partial `1000+n`; tie-break `updated_at DESC`, затем `id ASC`.
10. Пустой query fail-closed как `invalid_query`; result limit 1–50. Hidden/archived items и archived collections исключаются по умолчанию.
11. Item начинает с version 1. Payload update и status change требуют `expectedVersion`, увеличивают version на 1 и отклоняют stale write через `KnowledgeVersionConflictError`.
12. Media refs имеют вид `{source:'channel', channel, ref}` или `{source:'store', store, key}`. Engine только хранит opaque ref; Telegram `file_id` не переносим между ботами и не скачивается/отправляется Knowledge Engine.
13. Добавлены 33 in-memory D1 tests: collections, payload/limits/media, items/versioning, negative tenant isolation, active visibility, RU/Uzbek/mixed deterministic search, ranking/tie-break/numeric filter/limit.
14. Migration дважды успешно выполнена только на локальном Wrangler D1; проверены columns/defaults, 6 indexes, composite FK и реальный search SQL. Production D1 не затрагивалась.

## 3. Изменённые файлы
- `migrations/0015_platform_knowledge.sql` — две additive tables, constraints, composite tenant FK, search/numeric indexes и rollback notes.
- `functions/platform/knowledge/constants.ts` — фиксированные безопасные limits без новых env.
- `functions/platform/knowledge/errors.ts` — controlled validation/not-found/version/duplicate/size/persistence errors без raw data.
- `functions/platform/knowledge/types.ts` — collections/items/statuses, generic payload schema, media refs, numeric/search contracts.
- `functions/platform/knowledge/normalize.ts` — deterministic Unicode RU/Uzbek Latin normalization/tokenization без `\b`.
- `functions/platform/knowledge/validation.ts` — runtime validation, JSON-safe serialization, projections, limits, media/numeric/query checks.
- `functions/platform/knowledge/schema.ts` — idempotent runtime DDL с organizations prerequisite.
- `functions/platform/knowledge/store.ts` — весь production SQL, tenant-first repository, composite ownership checks и optimistic updates.
- `functions/platform/knowledge/search.ts` — чистый deterministic scorer и stable ordering.
- `functions/platform/knowledge/service.ts` — orchestration schema → projections → store и public search.
- `functions/platform/knowledge/index.ts` — public Knowledge exports.
- `functions/platform/index.ts` — экспорт Knowledge module; Cloudflare handlers не добавлены.
- `tests/platform-knowledge.test.ts` — 33 offline unit/integration tests на отдельном in-memory D1 fake.
- `docs/agents-platform/{HANDOFF.md,STATE.json,TEST_MATRIX.md,CURRENT_STATE.md,DECISIONS.md}` — P1.1 relay и D-011.

## 4. Архитектурные решения
- **D-011:** P1.1 использует две таблицы и optimistic item versions; `knowledge_revisions` отложена до доказанного требования Sotuvchi на audit/rollback.
- Domain events на P1.1 не emitted: atomic knowledge write не связывается с best-effort event bridge без отдельной idempotency/dispatch policy.
- Empty query всегда controlled validation error, а не неявный list operation.
- Search v1 остаётся normalize+parameterized LIKE/`json_each`+fixed scorer; AI façade, embeddings и external indexes не участвуют.
- Media refs channel-neutral и opaque; доставка/скачивание принадлежит будущему Media/channel driver.

## 5. Что сознательно не сделано
- Не создана `knowledge_revisions`: Sotuvchi v0 не требует history/rollback, optimistic versioning уже предотвращает lost updates.
- Не добавлены knowledge events, global dispatcher или analytics bridge.
- Не созданы product/doctor/dish schemas, agents manifests, ingest wizard, CRUD UI, CSV/PDF/web import.
- Не добавлены embeddings, Vectorize, RAG, semantic search, chunking, LLM indexing или AI dependency.
- Не реализованы R2 driver, Telegram media delivery, Mini App или dashboard.
- Не начаты P1.2 Workflow Engine, Agent Runtime, Sotuvchi, commerce, scheduling или payments.
- Не исправлялись 27 legacy TypeScript errors и global legacy lint.
- Production migration, push и deploy не выполнялись.

## 6. Проверки
- Baseline/post-change `npx tsc -b` → exit 0.
- Post-change `node --import tsx --test tests/platform-knowledge.test.ts` → 33/33.
- Baseline/post-change `node --import tsx --test tests/platform-ai.test.ts` → 15/15.
- Baseline/post-change `node --import tsx --test tests/platform-tenancy.test.ts` → 31/31.
- Baseline/post-change `node --import tsx --test tests/platform-events.test.ts` → 20/20.
- Baseline/post-change `node --import tsx --test tests/agent-boundaries.test.ts` → 10/10.
- Baseline/post-change `node --import tsx --test tests/telegram-channel-compat.test.ts` → 1/1.
- Baseline/post-change `node --import tsx --test tests/telegram-assistant.test.ts` → 60/60.
- Baseline/post-change `node --import tsx --test tests/gpt-chat.test.ts` → 15/15.
- Baseline/post-change `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, ровно 27 legacy errors в 6 старых файлах, 0 в `functions/{platform,agents,channels}`.
- `npx eslint functions/platform/knowledge tests/platform-knowledge.test.ts functions/platform/index.ts` → exit 0.
- `npx tsx scripts/check-agent-boundaries.ts` → `agent-boundaries: OK (no violations)`, exit 0.
- Knowledge static scan → forbidden agents/channels/lib/AI imports 0; SQL outside store/schema 0; handler exports 0; explicit `any` 0.
- Local-only `npx wrangler d1 execute GPTBOT_DRAFTS_DB --local --file migrations/0015_platform_knowledge.sql` → exit 0 два раза после переноса TEMP/log path на F:.
- Local `sqlite_master` verification → 2 knowledge tables + 6 indexes; `pragma_table_info` подтвердил defaults/status/version/numeric columns; `pragma_foreign_key_list` подтвердил composite collection FK.
- Реальный local D1 search SQL с `json_each`, active/tenant/numeric predicates → exit 0.
- Migration/runtime named parity scan, executable destructive-SQL scan, staged secret/PII scan и `git diff --check` → clean.

## 7. Известные проблемы
- Существовали до P1.1: 27 functions-config legacy errors; global legacy-red ESLint; OOM-риск; остальные пункты `KNOWN_ISSUES.md`.
- Ограничение P1.1: revisions/events отложены по D-011; это сознательная граница, не незавершённая реализация.
- Ограничение P1.1: deterministic search рассчитан на bounded tenant catalog, а не на documents/full-text corpus; candidate cap 200.
- Внешняя проблема среды: диск C: имел 0 free bytes, поэтому первый Wrangler local запуск упал `ENOSPC`; проверки успешно завершены с TEMP/TMP/WRANGLER_LOG_PATH на F:. Код/migration причиной не были.
- Новых production-блокеров нет.
- Pre-existing untracked `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` намеренно не тронуты.

## 8. Следующая задача
Только **P1.2 — Workflow Engine minimum**: расширить declarative FSM contracts и добавить tenant-scoped persistent `workflow_instances`, deterministic transitions, idempotent actions и restart/reload test. Cron/timers не нужны Sotuvchi v0 и не входят в этап.

## 9. Acceptance criteria следующего этапа
1. `STATE.json.next_stage == "P1.2"`, source HEAD/tree и два pre-existing untracked объекта подтверждены; P1.1 commits находятся в ancestry.
2. Следующий additive migration number проверен; `workflow_instances` имеет `org_id`, workflow id/version, current state, JSON-safe payload, idempotency/version metadata и timestamps.
3. Runtime bootstrap полностью совпадает с migration и повторяется безопасно; production migration не выполняется.
4. Workflow definition/runtime validation fail-closed: initial/state/transition references существуют, unsafe identifiers/payload отклоняются без raw content в errors.
5. Store API принимает `orgId` первым бизнес-аргументом; org B не читает, не возобновляет и не переводит instance org A.
6. Instance переживает новый service/isolate object: после reload продолжается из сохранённого state.
7. Transition deterministic; action idempotency key не выполняет один action повторно; stale concurrent transition отклоняется.
8. Без cron/wake timers, LLM, Agent Runtime, Telegram webhook или Sotuvchi behavior.
9. Все gates не ниже: Knowledge 33/33, AI 15/15, tenancy 31/31, events 20/20, boundaries 10/10, compatibility 1/1, Telegram 60/60, gpt-chat 15/15, `tsc -b` 0, functions-config ≤27 legacy и 0 platform; scoped ESLint 0.
10. STATE/HANDOFF/TEST_MATRIX/CURRENT_STATE/DECISIONS обновлены; максимум code+relay commits; push/deploy отсутствуют.

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
git log -12 --oneline
git diff
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
node --import tsx --test tests/platform-knowledge.test.ts
node --import tsx --test tests/platform-ai.test.ts
node --import tsx --test tests/platform-tenancy.test.ts
node --import tsx --test tests/platform-events.test.ts
node --import tsx --test tests/agent-boundaries.test.ts
node --import tsx --test tests/telegram-channel-compat.test.ts
node --import tsx --test tests/telegram-assistant.test.ts
node --import tsx --test tests/gpt-chat.test.ts
npx tsc -p tsconfig.functions.json --noEmit
```

## 11. Риски
- Не смешивать Workflow Engine с Agent Runtime, Telegram routing или Sotuvchi product flows.
- Не хранить workflow state в памяти: D1 instance — единственная истина и должен переживать reload.
- Не добавлять cron/timers на P1.2: ROADMAP явно исключает их для Sotuvchi v0.
- Не ослаблять tenant-first SQL, expected-version concurrency или action idempotency.
- Не модифицировать Knowledge schema/migration «заодно»; P1.1 contract уже завершён.
- Не логировать workflow payload, knowledge payload/media refs или PII.
- Lead-бот `aidirectprobot`, Javob, gpt-chat, SEO и existing platform gates неприкосновенны.
- Не добавлять pre-existing package-lock/audit artifacts и не выполнять push.

## 12. Rollback
- Отменить metadata relay P1.1: `git revert <последний metadata-only SHA из git log>`.
- Затем отменить code commit: `git revert c7dc64b61ffbff88e58f8ff96a1c4a9a2c81472e`.
- Production D1 не изменялась. Локальная Wrangler D1 содержит `knowledge_items`/`knowledge_collections`; при необходимости удалить только локально в этом порядке.
- Если `0015` позже применят к production и следующие stages ещё не используют данные, вручную удалить `knowledge_items`, затем `knowledge_collections`; git revert D1 schema не откатывает.
- Не использовать `reset --hard` или `clean -fd`: pre-existing package-lock и audit directory должны сохраниться.
