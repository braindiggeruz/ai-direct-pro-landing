# GPTBot Agents — Handoff

## 1. Состояние
- Дата: 2026-07-17
- Ветка: main
- HEAD: см. STATE.json.last_commit (заполняется фиксирующим коммитом)
- Завершённый этап: **P0.0 — Baseline и эстафета**
- Следующий этап: **P0.1 — Границы модулей**
- Рабочее дерево: clean (кроме давнего untracked `apps/gpt-backend/package-lock.json` — чужой артефакт, не трогать)

## 2. Что сделано
1. Проверено состояние репо: main @ 5bf3d56 (Javob voice+Tahlil в проде), чужих незакоммиченных изменений нет.
2. Снят baseline ДО изменений: tsc 0; тесты **143/143** (7 файлов, по одному — RAM-ограничение машины); vite build 0; javob:eval 0; `eslint .` красный **84 problems (71 err) — весь legacy**.
3. Создан каталог `docs/agents-platform/` с: ARCHITECTURE.md (копия утверждённого документа 2026-07-17), SOTUVCHI_PLAN.md (копия утверждённого аудита), ROADMAP.md (карта этапов P0.0–P3 + 15 критериев MVP), CURRENT_STATE.md, TEST_MATRIX.md (эталонные числа), KNOWN_ISSUES.md (legacy-долг отделён от платформы), DECISIONS.md (D-001…D-005 + унаследованные законы), HANDOFF_TEMPLATE.md, STATE.json.
4. Создан корневой **AGENTS.md** — правила для любого следующего coding-агента (архитектура, зависимости, запреты, tenant isolation, grounding, миграции, коммиты, handoff, ловушки окружения).

## 3. Изменённые файлы
- `AGENTS.md` (новый) — операционная конституция для агентов; менять только через DECISIONS.
- `docs/agents-platform/ARCHITECTURE.md`, `SOTUVCHI_PLAN.md` (новые) — копии утверждённых документов; НЕ редактировать без решения владельца (это источники направления).
- `docs/agents-platform/{ROADMAP,CURRENT_STATE,TEST_MATRIX,KNOWN_ISSUES,DECISIONS,HANDOFF_TEMPLATE,HANDOFF}.md`, `STATE.json` (новые) — механизм эстафеты. HANDOFF.md перезаписывается каждым этапом; TEST_MATRIX только пополняется.
- Production-код НЕ менялся. Каталоги `functions/{platform,agents,channels}` НЕ созданы (это P0.1).

## 4. Архитектурные решения
D-001…D-005 в DECISIONS.md (monolith-границы; приоритет истины; эстафета; baseline-политика; push только по команде владельца).

## 5. Что сознательно не сделано
- Никакого scaffold'а platform/agents/channels (P0.1).
- Не чинился legacy-lint (целевые этапы, не «заодно»).
- Не удалялся мусор gptbot-audit/.emergent (нужна отмашка владельца, janitor-коммит вне этапов).
- `last_commit` в STATE.json заполняется вторым фиксирующим коммитом этого же этапа (SHA нельзя знать до коммита).
- Push НЕ выполнен (ожидает команды владельца; deploy этапу не нужен).

## 6. Проверки
- `npx tsc -b` → exit 0
- тесты по файлам (NODE_OPTIONS=--max-old-space-size=800..1400): gpt-chat 15/15, telegram-assistant 60/60, intent-guard 16/16, direct-generator 13/13, indexnow 11/11, yandex 11/11, gpt-backend 17/17 → **143/143**
- `npx vite build` → exit 0
- `npx tsx scripts/javob-eval.ts` → exit 0 (60 кейсов sound)
- `npx eslint .` → exit 1, 84 problems — ДО этапа, файлы в KNOWN_ISSUES.md
- Новые файлы этапа — только Markdown/JSON, lint не затрагивают.

## 7. Известные проблемы
- До этапа: см. KNOWN_ISSUES.md (lint-долг, мусорные каталоги, in-memory lead-бот, нет cron, 3 AI-обвязки, Railway-неопределённость).
- Появилось в этапе: ничего.
- Внешние блокеры: Click/Payme, my.soliq, Instagram/WhatsApp API — не считать доступными.
- Среда: node OOM при занятой RAM (Chrome) — метод обхода в AGENTS.md §7/§11.

## 8. Следующая задача
**P0.1 — Границы модулей**: создать `functions/platform/`, `functions/agents/` (с пустым `registry.ts`), `functions/channels/`; минимальные типовые contracts (без логики); механизм контроля границ импортов (eslint-правило `no-restricted-imports`/зоны ИЛИ тест на import-graph: agents/channels → только platform; platform не импортирует agents/channels/lib кроме `LEGACY-SHIM`). Ни одной строки продуктовой логики.

## 9. Acceptance criteria P0.1
1. Каталоги+contracts существуют; `npx tsc -b` = 0. 2. Boundary-проверка выполняется командой и ПАДАЕТ на нарочном нарушении (негативный тест продемонстрирован в тестах). 3. 143/143 legacy-тестов зелёные. 4. `npx eslint <новые файлы>` = 0. 5. vite build 0 (island не затронут). 6. HANDOFF.md перезаписан, STATE.json → next_stage P0.2, TEST_MATRIX пополнен строкой boundary-теста. 7. Один атомарный коммит `chore(platform): scaffold module boundaries`.

## 10. Команды для старта
```
cd F:\Claude\gptbot-repo
git status; git branch --show-current; git log -5 --oneline
type docs\agents-platform\STATE.json
# smoke-baseline (минимум): tsc + telegram-assistant + gpt-chat
$env:NODE_OPTIONS='--max-old-space-size=1400'; npx tsc -b
node --import tsx --test tests/telegram-assistant.test.ts
node --import tsx --test tests/gpt-chat.test.ts
```

## 11. Риски
Не трогать: `functions/api/telegram/webhook.ts`, `functions/lib/telegram/**` (Javob live), scripts/prerender*, content/**, `functions/_types.ts` без нужды. Новые каталоги не должны попасть в Pages-роутинг как endpoints: в `functions/` любой экспортирующий onRequest файл станет роутом — contracts делать ТОЛЬКО типами/чистыми модулями без onRequest*.

## 12. Rollback
`git revert` двух коммитов этапа P0.0 (docs+AGENTS.md; production-код не затронут — откат безопасен всегда).
