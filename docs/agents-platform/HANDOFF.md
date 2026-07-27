# GPTBot Agents — Handoff

## 1. Состояние
- Дата: 2026-07-27
- Ветка: `main`
- Исходный HEAD P1.2: `efe1b2aaf85ebc6f1cf275fc8428e814cfcdbd4e`
- Code commit P1.2: `cc4484dc72604060068c016e307a8bc766c94cec`
- HEAD после relay: последний metadata-only commit в `git log`; по D-006
  `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA.
- Завершённый этап: **P1.2 — Workflow Engine minimum**
- Следующий этап: **P1.3 — Agent Runtime minimum**
- P1.1 подтверждён в ancestry: code
  `c7dc64b61ffbff88e58f8ff96a1c4a9a2c81472e`, relay/source
  `efe1b2aaf85ebc6f1cf275fc8428e814cfcdbd4e`.
- Рабочее дерево после relay должно содержать только pre-existing untracked
  `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`; оба объекта не
  изменялись, не удалялись и не добавлялись в коммиты.
- `origin/main` во время P1.2 оставался
  `93fab390733d3d5ffbf052e211d95b6038ee4bbd`; push/deploy отсутствуют.

## 2. Что сделано
1. До изменений подтверждены STATE/git gate, source HEAD, P1.1 ancestry,
   неизменность двух pre-existing untracked объектов и baseline всех platform/
   legacy suites.
2. Расширен declarative Workflow contract: typed payload schema, initial и
   terminal states, guards, closed-list action refs, workflow/version/context.
3. Добавлена additive migration `0016_platform_workflow.sql` с tenant-scoped
   `workflow_instances`, `workflow_transitions` и 4 indexes. Legacy/production
   таблицы не изменены.
4. Definition runtime validation fail-closed проверяет safe IDs, integer version,
   existing initial/target/terminal states, duplicate triggers, guards/actions,
   limits и dangerous object keys.
5. Payload сначала проходит agent-owned runtime schema, затем independent strict
   JSON-safe/depth/UTF-8-size validation. Trigger data и action input имеют
   отдельный меньший limit; raw content не включается в ошибки.
6. Create идемпотентен по `(org_id, idempotency_key)`, создаёт version 1 и
   `active` либо `completed` для terminal initial state.
7. Transition history insert и optimistic instance update выполняются одним D1
   `batch`. Update разрешён только exact org/id/state/version/active и только при
   существовании вставленного transition id.
8. Duplicate transition проверяется раньше expected-version conflict, возвращает
   прежний результат и не выполняет actions второй раз. Повтор ключа для другого
   instance отклоняется как idempotency conflict.
9. Guards получают data-only context/payload/trigger и не получают от engine
   DB/network/AI capabilities. False и exception дают controlled content-free
   errors без durable transition.
10. Actions разрешаются только через явный constructor registry. Все refs
    проверяются до commit, handlers выполняются после commit последовательно;
    ошибка останавливает следующие actions, но durable state/history сохраняются.
11. History metadata хранит только `instanceStatus`, aggregate `actionStatus` и
    action type/status/safe code. Action input, trigger data, exception и workflow
    payload туда не копируются; metadata дополнительно проходит существующий
    Events PII guard.
12. Terminal transition фиксирует `completed/completedAt`; дальнейшие новые
    transitions запрещены, exact duplicate остаётся безопасным.
13. `cancel()` разрешён только active instance, записывает audit transition без
    смены state, увеличивает version ровно один раз и идемпотентен через derived
    cancel key. Resume не добавлен.
14. Все store APIs tenant-first; каждый SQL содержит org predicate, composite FK
    блокирует cross-tenant history, org B не читает/переводит/cancel/history org A.
15. Новый `WorkflowEngine` object читает и продолжает instance из D1, поэтому
    state/payload переживают isolate/restart.
16. Добавлены 39 offline tests, включая validation negatives, concurrency,
    idempotency, guard/action failures, restart, terminal/cancel, corrupt storage
    и 4 negative tenant-isolation cases.
17. Migration дважды выполнена только в local Wrangler D1; проверены schema/FK,
    4 indexes и реальный conditional transition с exact replay.

## 3. Изменённые файлы
- `functions/platform/contracts/workflow.ts` — generic FSM/payload/guard/action
  contract; доверенные definitions остаются TypeScript-кодом.
- `functions/platform/contracts/index.ts` — type exports нового workflow contract.
- `functions/platform/index.ts` — экспорт runtime workflow module без handlers.
- `functions/platform/workflow/errors.ts` — controlled content-free errors.
- `functions/platform/workflow/types.ts` — instances, transitions, statuses,
  inputs/results и action registry/context.
- `functions/platform/workflow/validation.ts` — definition/trigger/payload/
  metadata validation, limits и safe serialization/parsing.
- `functions/platform/workflow/schema.ts` — idempotent runtime DDL с organizations
  prerequisite; normalized parity с migration 6/6 statements.
- `functions/platform/workflow/store.ts` — весь Workflow SQL, tenant-first reads,
  create idempotency, atomic transition batch и metadata update.
- `functions/platform/workflow/engine.ts` — create/get/history/transition/cancel,
  guards/actions, terminal и optimistic conflict orchestration.
- `functions/platform/workflow/index.ts` — публичные runtime/type exports.
- `migrations/0016_platform_workflow.sql` — 2 additive tables, 4 indexes,
  constraints/composite FK и rollback notes.
- `tests/platform-workflow.test.ts` — 39 offline unit/integration tests.
- `docs/agents-platform/{HANDOFF.md,STATE.json,CURRENT_STATE.md,TEST_MATRIX.md,DECISIONS.md}`
  — P1.2 relay и D-012.

## 4. Архитектурные решения
- **D-012:** definitions находятся в trusted TypeScript; D1 хранит только
  validated data/state/history.
- Instance/history commit атомарен через conditional insert + guarded update в
  одном D1 batch. Optimistic version никогда не silently retried.
- Idempotency scoped к tenant и имеет приоритет над stale retry, чтобы exact
  delivery replay был безопасным.
- Action policy P1.2 — explicit registry и at-most-once post-commit execution.
  Это предотвращает duplicate side effects, но смерть isolate после commit и до
  handler может потерять action. Durable action outbox/recovery отложен.
- Workflow events не emitted: существующий Events outbox нельзя атомарно связать
  с workflow write без отдельной dispatch/outbox policy. Ложная delivery
  гарантия не добавлялась.
- Timer/cron/scheduler API отсутствуют. Nullable `wake_at` — только future
  extraction field и не означает реализованный scheduling.
- Payload неизменяем в P1.2 transition cycle: arbitrary reducers и DB/AI code в
  definitions не допускаются.

## 5. Что сознательно не сделано
- Не начат P1.3 Agent Runtime; не создавались AgentManifest implementations,
  runtime turn loop или demo agent.
- Не добавлены Telegram agent webhook, Sotuvchi, product workflows, commerce,
  checkout, scheduling, notifications, billing или UI.
- Не добавлены cron/timers/Queues/Durable Objects/R2 и `listDue`.
- Не добавлены workflow Events bridge, dispatcher, durable action outbox,
  recovery/retry worker или exactly-once side-effect promise.
- Не добавлен payload reducer, resume cancelled workflow или API для `failed`.
- Не менялись Knowledge/AI/Events/Tenancy/Telegram/Javob/gpt-chat/SEO behavior.
- Не исправлялись 27 legacy TypeScript errors и global legacy lint.
- Production migration, push и deploy не выполнялись.

## 6. Проверки
- Baseline/post-change `npx tsc -b` → exit 0.
- Post-change `tests/platform-workflow.test.ts` → 39/39.
- Baseline/post-change Knowledge 33/33, AI 15/15, tenancy 31/31, Events 20/20,
  boundaries 10/10, Telegram compatibility 1/1, Telegram assistant 60/60,
  gpt-chat 15/15.
- Baseline/post-change
  `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, ровно 27 legacy errors
  в 6 старых файлах и 0 в `functions/{platform,agents,channels}`.
- Scoped P1.2 ESLint → exit 0.
- `npx tsx scripts/check-agent-boundaries.ts` → exit 0, no violations.
- Runtime/migration normalized parity → 6/6 named statements.
- Local-only migration `0016` → два запуска по 6/6 statements, exit 0; 2 tables,
  4 indexes, 13/10 columns и composite FK подтверждены.
- Реальный local D1 transition `draft → review` → version `1 → 2`, одна history
  row; exact replay → version 2 и всё ещё одна row.
- Forbidden imports, SQL outside workflow store/schema, destructive runtime SQL,
  handler exports, explicit `any`, P1.3+/product scope terms → 0.
- Credential/PII literal scans и `git diff --check` → clean.

## 7. Известные проблемы
- Существовали до P1.2: 27 functions-config legacy errors, global legacy-red
  ESLint, OOM-риск; полный перечень — `KNOWN_ISSUES.md`.
- Ограничение P1.2: post-commit actions at-most-once, но не durable-recoverable.
  До production non-idempotent side effects нужен action outbox/recovery.
- Ограничение P1.2: workflow domain events отсутствуют до atomic outbox policy.
- Ограничение P1.2: `wake_at` не обслуживается runner'ом; timers отсутствуют.
- Внешняя среда: C: ранее имел 0 free bytes; local Wrangler успешно проверен с
  TEMP/TMP/WRANGLER_LOG_PATH на F:. Код/migration причиной не были.
- Новых production blockers нет.
- Pre-existing untracked package-lock/audit artifacts намеренно не тронуты.

## 8. Следующая задача
Только **P1.3 — Agent Runtime minimum**: уточнить AgentManifest types, реализовать
единую `agents/registry.ts`, tools с Facts-контрактом, deterministic-first
turn cycle, grounding fail-closed и один demo agent (`echo + 1 knowledge
question`). Не начинать P1.4 webhook или Sotuvchi.

## 9. Acceptance criteria следующего этапа
1. Подтверждены `STATE.json.next_stage == "P1.3"`, source HEAD/tree и P1.2 code/
   relay ancestry; два pre-existing untracked объекта не затронуты.
2. AgentManifest contract остаётся channel/provider-neutral, runtime-validatable
   и closed-list по capabilities/tools; новый agent не требует изменения core
   platform behavior.
3. `functions/agents/registry.ts` — единственная production registration point;
   duplicate/unknown agent fail controlled, imports соблюдают boundaries.
4. Tools принимают `OrgContext`, валидируют input и возвращают structured output
   плюс явный `Facts`; agent не получает прямой D1/channel/legacy доступ.
5. Turn cycle сначала выполняет deterministic rule/workflow/tool path. AI, если
   нужен, может выбрать только closed-list manifest tool и не исполняет raw code.
6. Response проходит grounding against collected Facts; unsupported exact claims
   fail-closed и не отправляются как выдуманный ответ.
7. Demo agent покрывает только echo и один Knowledge question end-to-end на
   offline fakes; production webhook/token/Telegram behavior не добавляются.
8. Tenant context не теряется; negative org A/org B tests и content-free
   errors/logging обязательны.
9. Все P1.2 baseline gates не ниже TEST_MATRIX; новые P1.3 tests, scoped ESLint и
   direct boundary checker зелёные; functions-config остаётся ≤27 legacy и 0
   platform/agents/channels.
10. Обновлены STATE/HANDOFF/TEST_MATRIX/CURRENT_STATE/DECISIONS; максимум code+
    relay commits; production migration, push и deploy отсутствуют.

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
node --import tsx --test tests/platform-workflow.test.ts
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
- Не смешивать P1.3 runtime с P1.4 Telegram routing или Sotuvchi product flow.
- Не давать Agent Runtime прямой доступ к D1, channel clients, secrets или
  legacy libraries; только platform contracts/services/tools.
- Не позволять AI обходить deterministic path, closed-list tools или Facts
  grounding.
- Не объявлять P1.2 actions exactly-once/durable: текущая гарантия уже и явно
  описана в D-012.
- Не создавать workflow events отдельным best-effort write и не обещать atomic
  delivery без общей outbox policy.
- Не добавлять cron/runner из-за наличия nullable `wake_at`.
- Не логировать workflow/knowledge payload, inbound text, action input или PII.
- Lead bot, Javob, gpt-chat, SEO и существующие platform gates неприкосновенны.

## 12. Rollback
1. Если relay commit уже создан, сначала `git revert <P1.2-relay-SHA>`.
2. Затем `git revert cc4484dc72604060068c016e307a8bc766c94cec`.
3. Production D1 не мигрировалась, поэтому production schema rollback не нужен.
4. Для одноразовой очистки только локальной тестовой D1 можно удалить сначала
   `workflow_transitions`, затем `workflow_instances`; эти destructive SQL не
   выполнять в production и не включать в runtime migration.
5. Revert не должен затрагивать P1.1 commits, два pre-existing untracked объекта
   или unrelated SEO/legacy history.
