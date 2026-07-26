# GPTBot Agents — Handoff

## 1. Состояние
- Дата: 2026-07-17
- Ветка: main
- HEAD: код-коммит P0.1 `chore(platform): scaffold module boundaries` (SHA = STATE.json.last_commit) + relay-коммит (D-006)
- Завершённый этап: **P0.1 — Границы модулей**
- Следующий этап: **P0.2 — Telegram channel extraction**
- Рабочее дерево: clean (давний untracked `apps/gpt-backend/package-lock.json` — не трогать)

## 2. Что сделано
1. Проверен P0.0: HEAD/коммиты/11 файлов/JSON/секреты/production-неизменность — целы. SHA-двусмысленность устранена правилом **D-006** (last_commit = код-коммит этапа; metadata-follow-up = state_commit; максимум 2 коммита) — отдельный alignment-коммит `45839a5`.
2. Smoke-baseline перед этапом: telegram-assistant 60/60, gpt-chat 15/15, tsc -b 0.
3. Создан scaffold: `functions/platform/contracts/{context,facts,tool,agent,channel,events,workflow,index}.ts` + `platform/index.ts`; `functions/agents/{types,registry,index}.ts`; `functions/channels/{types,index}.ts`. Только типы + registry (Map, дубликат-детект DuplicateAgentIdError, clearAgentsForTests). Никаких onRequest*, D1, endpoints, продуктовой логики, Sotuvchi.
4. Boundary-чекер `scripts/check-agent-boundaries.ts`: чистая `checkBoundaries(files)` + `scanTree` + CLI (exit 1 при нарушении, сообщение = файл:строка + правило + деталь). Правила: platform↛agents, platform↛channels, agents↛channels, channels↛agents, *↛functions/lib (кроме строки с маркером `LEGACY-SHIM`), запрет onRequest*-экспортов во всех трёх пространствах; относительные пути резолвятся, `@/`-alias учтён, dynamic import/require ловятся.
5. `tests/agent-boundaries.test.ts` — 10 тестов: реальное дерево чистое + **негативные fixtures на каждое правило** (in-memory, production не ломался) + registry (register/get/list/duplicate-throw/пустой при импорте).

## 3. Изменённые файлы
- `functions/platform/contracts/*` — контракты: OrgContext (orgId обязателен), FactSheet (только скаляры — граундинг-щит), Tool/UnknownTool+eraseTool (validation-lib-neutral; единственный документированный cast), AgentManifest (id/version/locales/capabilities-closed-list/tools/workflows?/knowledgeKinds?), ChannelAdapter+Inbound/Outbound (channel-neutral), PlatformEvent (scalar-payload, PII-safe by type), WorkflowDefinition (данные, без исполнителя). Ограничение: НЕ добавлять поля «на будущее» без этапа.
- `functions/agents/registry.ts` — регистрация агентов; production-пустой; менять только добавлением registerAgent-вызовов в этапах агентов.
- `functions/{agents,channels}/{types,index}.ts`, `platform/index.ts` — барели, side-effect-free.
- `scripts/check-agent-boundaries.ts`, `tests/agent-boundaries.test.ts` — см. выше; чекер экспортирует чистое ядро, CLI-ветка выполняется только при прямом запуске.
- `docs/agents-platform/{STATE.json,DECISIONS.md,TEST_MATRIX.md,KNOWN_ISSUES.md,HANDOFF.md}` — эстафета.

## 4. Архитектурные решения
- **D-006** (SHA-правило) — см. DECISIONS.md.
- **D-007**: официальный typecheck-гейт репо (`tsc -b`) НЕ покрывает functions/** (tsconfig.functions.json не в references — исторический факт, обнаружен на этом этапе). Для платформенных пространств обязательная проверка — `npx tsc -p tsconfig.functions.json --noEmit` с фильтром «0 ошибок в functions/{platform,agents,channels}»; глобальное подключение functions в tsc -b отложено (сломает build: 27 legacy-ошибок).

## 5. Что сознательно не сделано
- Не перенесён telegram client (это P0.2). Legacy-импорты Javob/чата не тронуты.
- Не чинились 27 legacy-tsc-ошибок functions-проекта и 84 eslint-legacy (KNOWN_ISSUES).
- Никакого Event Bus/outbox/orgs/migrations/AI-фасада/endpoints.
- vite build не запускался: src/** и compile-graph island'а не затронуты (functions/** не входит в vite-граф); tsc -b это подтверждает.
- Push не выполнялся.

## 6. Проверки (точные)
- `npx tsc -b` → exit 0
- `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, **27 ошибок, ВСЕ в legacy** (6 файлов: admin/ai-drafts status, cockpit, yandex/quick-launch, seo-autopilot/normalise, telegram/{analysis,handler}); **в functions/{platform,agents,channels} — 0**
- `node --import tsx --test tests/agent-boundaries.test.ts` → 10/10
- `npx tsx scripts/check-agent-boundaries.ts` → OK, exit 0
- `node --import tsx --test tests/telegram-assistant.test.ts` → 60/60
- `node --import tsx --test tests/gpt-chat.test.ts` → 15/15
- `npx eslint functions/platform functions/agents functions/channels scripts/check-agent-boundaries.ts tests/agent-boundaries.test.ts` → exit 0

## 7. Известные проблемы
- До этапа: KNOWN_ISSUES.md + новооткрытое legacy: functions-tsconfig не в гейте, 27 tsc-ошибок в 6 старых файлах (внесено в KNOWN_ISSUES).
- Появилось в этапе: ничего.
- Среда: node/tsc падают OOM при commit-давлении RAM; лечение — RAM-гейт ≥2.3GB и повтор (см. AGENTS.md §11).

## 8. Следующая задача (P0.2)
Перенести `functions/lib/telegram/client.ts` → `functions/channels/telegram/api.ts` БЕЗ изменения поведения; на старом пути оставить re-export shim (`export * from '../../channels/telegram/api'` + комментарий LEGACY-SHIM… ВНИМАНИЕ: lib→channels импорт разрешён — правила ограничивают только platform/agents/channels; чекер lib не сканирует). Javob продолжает работать через старый путь. Ничего больше не переносить (llm/gpt-chat — P0.5).

## 9. Acceptance criteria P0.2
1. `functions/channels/telegram/api.ts` = бывший client.ts (содержимое идентично, кроме шапки-комментария); старый путь — тонкий re-export. 2. `git diff` Javob-модулей = только отсутствие изменений (импорты не трогаем). 3. telegram-assistant 60/60; gpt-chat 15/15; boundary-тест 10/10 (channels/telegram/api.ts не должен нарушить правила: он не импортирует agents/lib — проверить, client.ts самодостаточен). 4. tsc -b 0; tsc functions-проект: ошибок в platform/agents/channels = 0 (legacy-27 не выросли). 5. eslint перенесённого файла 0 (файл уже чистый). 6. Один коммит `refactor(channels): move telegram client behind compatibility shim` + relay-коммит по D-006. 7. HANDOFF/STATE/TEST_MATRIX обновлены.

## 10. Команды для старта
```
cd F:\Claude\gptbot-repo
git status; git log -5 --oneline; type docs\agents-platform\STATE.json
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
node --import tsx --test tests/agent-boundaries.test.ts
node --import tsx --test tests/telegram-assistant.test.ts
```

## 11. Риски
Не трогать: lead-бот webhook, Javob-логику, prerender/scripts, content. При переносе client.ts НЕ менять ни одной строки логики (retry/split/секрет-дисциплина проверены прод-боем). Помнить: файлы в functions/ без onRequest* — безопасные модули; чекер держит это инвариантом.

## 12. Rollback
`git revert` коммитов P0.1 (scaffold+docs; кода, на который кто-то ссылается, нет — откат тривиален). Alignment-коммит `45839a5` откатывать не нужно (только документация правила).
