# GPTBot Agents — Handoff

## 1. Состояние
- Дата: 2026-07-27
- Ветка: `main`
- Исходный HEAD P0.5: `93fab390733d3d5ffbf052e211d95b6038ee4bbd`
- Code commit P0.5: `31021442c12fbc24a9c90f6a42422412c0d7cbb2`
- HEAD после relay: последний metadata-only commit в `git log`; по D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA
- Завершённый этап: **P0.5 — Platform AI façade**
- Следующий этап: **P1.1 — Knowledge Engine minimum**
- P0.4 подтверждён в ancestry: code `1f683380078629f67c2fef16a6fe68fd8ba96840`, relay `4fcfab36`; после них сохранена серия SEO-коммитов вплоть до source HEAD `93fab390`
- Рабочее дерево после relay: только pre-existing untracked `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`; оба объекта не изменены, не удалены и не добавлены в коммиты

## 2. Что сделано
1. Подтверждены branch/source HEAD, STATE gate, ancestry P0.4 и наличие identity/orgs implementation. SEO-коммиты после P0.4 не переписывались и не откатывались.
2. До изменений зафиксирован baseline: `tsc -b` exit 0; tenancy 31/31, events 20/20, boundaries 10/10, Telegram compatibility 1/1, Telegram assistant 60/60, gpt-chat 15/15; functions-config — ровно 27 legacy errors в 6 старых файлах и 0 platform-scope.
3. Изучены реальные `lib/llm`, gpt-chat OpenRouter и Telegram AI/STT реализации: provider chains, retries, circuit breaker, JSON mode, streaming, transcription, timeouts, errors, usage и env dependencies.
4. Добавлены provider-neutral contracts для сообщений, completion/structured requests/results, usage/attempt metadata и capability-based drivers. Streaming и transcription представлены отдельными typed capabilities без принудительной реализации каждым driver.
5. Добавлен `AiFacade` с `complete` и generic `structured`: deterministic task/tier policy, ordered fallback, ограниченный `maxAttempts`, deadline и нормализация ошибок.
6. Добавлен strict structured pipeline: `JSON.parse` и затем runtime schema `.parse(unknown)`. Invalid JSON и schema mismatch fail-closed как разные controlled errors.
7. Добавлена минимальная error model: configuration/provider/timeout/structured/unavailable. Raw provider errors, prompts и user content не копируются; unknown runtime task также не сохраняется в error fields.
8. Добавлен один узкий compatibility adapter поверх существующих gpt-chat OpenRouter и `lib/llm` structured router. Он переиспользует текущие env/model chains/retry behavior и не копирует production model names.
9. Boundary checker усилен: `LEGACY-SHIM` разрешён только в точном файле `functions/platform/ai/drivers/legacy.ts`; тот же marker в любом другом platform-файле не обходится.
10. Добавлены 15 offline fake-driver tests, включая оба legacy adapters через dependency injection. Реальные provider API не вызывались.
11. Production consumers Javob, gpt-chat и Telegram STT не переключались; prompts, temperatures, token limits, billing, SSE, model/env configuration и production behavior не менялись.

## 3. Изменённые файлы
- `functions/platform/ai/types.ts` — provider-neutral contracts и независимые capability interfaces.
- `functions/platform/ai/errors.ts` — пять controlled error families с content-free сообщениями.
- `functions/platform/ai/policy.ts` — валидируемая task/tier policy, ordered routes и ограничение attempts.
- `functions/platform/ai/structured.ts` — strict JSON + runtime schema fail-closed validation.
- `functions/platform/ai/facade.ts` — `complete`/`structured`, fallback, timeout и error normalization.
- `functions/platform/ai/drivers/legacy.ts` — единственная platform→legacy точка: gpt-chat OpenRouter text и `lib/llm` structured adapters.
- `functions/platform/ai/index.ts` — public AI exports.
- `functions/platform/index.ts` — экспорт AI module; handler exports не добавлены.
- `scripts/check-agent-boundaries.ts` — точный allowlist одного legacy adapter вместо глобального marker bypass.
- `tests/agent-boundaries.test.ts` — доказательство, что marker вне adapter и import без marker отклоняются.
- `tests/platform-ai.test.ts` — 15 изолированных façade/policy/validation/error/adapter tests.
- `docs/agents-platform/{HANDOFF.md,STATE.json,TEST_MATRIX.md,CURRENT_STATE.md,DECISIONS.md}` — P0.5 relay и D-010.

## 4. Архитектурные решения
- **D-010:** AI layer — capability façade, а не обязательный giant interface. P0.5 public façade реализует только безопасно объединённые `complete` и `structured`; stream/transcribe пока остаются typed capability contracts.
- Task/tier policy хранит driver routes и limits в configuration objects. Реальные production model chains по-прежнему читаются существующими adapters из env/config.
- Structured output никогда не считается domain value без strict JSON parse и runtime schema validation.
- Fallback выполняется один раз на каждый route в конфигурационном порядке и не превышает `maxAttempts`; внутренние retries legacy drivers не переписываются.
- Единственный `LEGACY-SHIM` расположен в `functions/platform/ai/drivers/legacy.ts` и защищён exact-path boundary rule.

## 5. Что сознательно не сделано
- Javob, gpt-chat, Tahlil, SSE streaming и Telegram transcription не мигрированы на façade.
- В `AiFacade` не добавлены `stream()` и `transcribe()`: на P0.5 есть только их typed capability contracts, чтобы не менять streaming/STT semantics.
- Не изменены prompts, model chains, env names, provider credentials, temperatures, token limits, retries/circuit breaker, quotas или billing ledger.
- Не добавлены новые provider/model, D1 model-policy storage, dashboard, prompt registry или live provider smoke tests.
- Не начаты Knowledge Engine, Workflow Engine, Agent Runtime, tools, RAG/vector search, agent webhook или Sotuvchi.
- Не исправлялись 27 legacy TypeScript errors и глобальный legacy lint.
- Production secrets, database, push и deploy не затрагивались.

## 6. Проверки
- Baseline/post-change `npx tsc -b` → exit 0.
- Post-change `node --import tsx --test tests/platform-ai.test.ts` → 15/15.
- Baseline/post-change `node --import tsx --test tests/platform-tenancy.test.ts` → 31/31.
- Baseline/post-change `node --import tsx --test tests/platform-events.test.ts` → 20/20.
- Baseline/post-change `node --import tsx --test tests/agent-boundaries.test.ts` → 10/10.
- Baseline/post-change `node --import tsx --test tests/telegram-channel-compat.test.ts` → 1/1.
- Baseline/post-change `node --import tsx --test tests/telegram-assistant.test.ts` → 60/60.
- Baseline/post-change `node --import tsx --test tests/gpt-chat.test.ts` → 15/15.
- Baseline/post-change `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, ровно 27 legacy errors в 6 старых файлах, 0 в `functions/{platform,agents,channels}`.
- `npx eslint functions/platform/ai tests/platform-ai.test.ts scripts/check-agent-boundaries.ts tests/agent-boundaries.test.ts functions/platform/index.ts` → exit 0.
- `npx tsx scripts/check-agent-boundaries.ts` → `agent-boundaries: OK (no violations)`, exit 0.
- Static scope scan → agents/channels imports 0, Cloudflare handler exports 0, explicit `any` 0; четыре legacy imports только в exact adapter и все с `LEGACY-SHIM`.
- Staged secret/PII scan → clean; API keys, Telegram tokens, env/dev-vars, email/phone fixtures и реальные user prompts не обнаружены.
- `git diff --check` и staged `git diff --check` → exit 0.

## 7. Известные проблемы
- Существовали до P0.5: 27 functions-config legacy errors; global legacy-red ESLint; OOM-риск машины; остальные пункты `KNOWN_ISSUES.md`.
- Ограничение P0.5: facade-level timeout прекращает ожидание, но legacy provider может завершать собственный уже начатый fetch по старой semantics; production consumers не используют новый façade.
- Ограничение P0.5: stream/transcribe имеют contracts, но не подключены к façade и не адаптированы.
- Новых production-блокеров и внешних зависимостей нет.
- Pre-existing untracked `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` намеренно не тронуты.

## 8. Следующая задача
Только **P1.1 — Knowledge Engine minimum**: добавить tenant-scoped `knowledge_collections`/`knowledge_items`, schema validation payload, нормализованный `search_text`, numeric indexes и детерминированный normalize+LIKE+score поиск. `knowledge_revisions` вводить только при доказанной необходимости для Sotuvchi.

## 9. Acceptance criteria следующего этапа
1. Source HEAD, `STATE.json.next_stage == "P1.1"` и два pre-existing untracked объекта подтверждены; P0.5 commits сохранены в ancestry.
2. Additive migration создаёт `knowledge_collections` и `knowledge_items` с `org_id`, agent/kind/schema metadata, status, validated `payload_json`, normalized `search_text`, numeric index columns, media refs/version/timestamps и нужными индексами.
3. Store API получает `orgId` первым бизнес-аргументом; cross-tenant create/read/list/search/update не раскрывает и не меняет строки другого tenant.
4. Payload проходит runtime schema validation до записи; invalid JSON/schema mismatch fail-closed и не оставляют partial row.
5. Поиск v1 детерминирован: normalize + parameterized LIKE + явный stable scoring/tie-break; embeddings, Vectorize и LLM-ranking отсутствуют.
6. Tenant tests покрывают org A/org B isolation, invalid payload, normalized search, numeric filters/scoring, idempotency/uniqueness и migration/runtime bootstrap.
7. `knowledge_revisions` добавляется только при конкретном Sotuvchi requirement, иначе решение об откладывании документируется.
8. Все текущие gates не ниже: AI 15/15, tenancy 31/31, events 20/20, boundaries 10/10, compatibility 1/1, Telegram 60/60, gpt-chat 15/15, `tsc -b` 0, functions-config ≤27 legacy и 0 platform-scope; scoped ESLint 0.
9. P1.2 Workflow/Runtime/Sotuvchi не начинаются; production migration, push и deploy не выполняются без отдельного разрешения.

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
- Не связывать Knowledge payload со свободным LLM JSON без отдельной runtime schema validation.
- Не допускать SQL вне knowledge store/schema и запросы без tenant `org_id`.
- Не использовать embeddings/Vectorize или AI façade для deterministic v1 search.
- Не мигрировать Javob/gpt-chat на façade «заодно» и не расширять единственный legacy shim.
- Не менять AI prompts/models/retries/billing, existing identity/org/event contracts или Telegram routes.
- Lead-бот `aidirectprobot`, его route/token/webhook неприкосновенны.
- Не исправлять legacy errors, не добавлять pre-existing package-lock/audit artifacts и не выполнять push.

## 12. Rollback
- Отменить metadata relay P0.5: `git revert <последний metadata-only SHA из git log>`.
- Затем отменить code commit: `git revert 31021442c12fbc24a9c90f6a42422412c0d7cbb2`.
- P0.5 не содержит migrations, production state или external side effects; дополнительных ручных rollback-действий нет.
- Не использовать `reset --hard` или `clean -fd`: pre-existing package-lock и audit directory должны сохраниться.
