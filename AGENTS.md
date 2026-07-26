# AGENTS.md — правила для coding-агентов GPTBot Agents Platform

Ты работаешь в живом production-монорепозитории GPTBot.uz. Здесь одновременно живут:
SEO-фабрика (~183 prerendered страниц), веб AI-чат, Telegram-боты **@gptbot_javob_bot** (Javob)
и **@aidirectprobot** (lead-бот Ads), админка, и строящаяся платформа **GPTBot Agents**.

## 0. Порядок чтения (обязателен, в этом порядке)
1. `docs/agents-platform/STATE.json` — какой этап текущий. Выполняй ТОЛЬКО его.
2. `docs/agents-platform/HANDOFF.md` — что оставил предыдущий агент.
3. `docs/agents-platform/ARCHITECTURE.md` — утверждённая архитектура платформы (источник направления).
4. `docs/agents-platform/ROADMAP.md` — карта этапов P0.0…P3.
5. `docs/agents-platform/CURRENT_STATE.md`, `KNOWN_ISSUES.md`, `TEST_MATRIX.md`, `DECISIONS.md`.
6. При расхождениях приоритет: актуальный код → фактическая инфраструктура → ARCHITECTURE.md → старые handoff.

## 1. Архитектура в двух абзацах
Modular monolith в этом репозитории. Целевые пространства: `functions/platform/` (доменные
сервисы ядра, каждый существует один раз), `functions/agents/` (агенты = декларации: manifest,
knowledge-схема, workflows, prompts, i18n; регистрация одной строкой в `agents/registry.ts`),
`functions/channels/` (адаптеры каналов; Telegram — канал, не домен). Правило зависимостей:
`agents/*`и `channels/*` импортируют только `platform/*`; `platform/*` не знает ни об агентах,
ни о каналах; legacy `functions/lib/**` может звать platform, platform не зависит от lib
(кроме помеченных `// LEGACY-SHIM`).

Детерминизм выше LLM: цены, остатки, деньги, статусы, слоты — только код+БД. LLM разрешён
для интерпретации языка и выбора из закрытого списка (structured output). Grounding fail-closed:
факты ответа ⊆ facts() вызванных tools; нарушение = отказ, не «примерно правильный» ответ.

## 2. Жёсткие запреты
- НЕ трогать `functions/api/telegram/webhook.ts` и секрет `TELEGRAM_BOT_TOKEN` (живой lead-бот).
- НЕ перенастраивать webhook бота `aidirectprobot` (guard в `scripts/telegram-setup.ts` не обходить).
- НЕ ломать: gpt-chat (веб), Javob (`functions/lib/telegram/**`), SEO-скрипты (`scripts/prerender*`,
  `generate-*`), admin, canonical/URL структуру, существующие API-контракты.
- НЕ создавать второй repo/fork/микросервисы/отдельный backend.
- НЕ использовать `git add .`, `git reset --hard`, `git clean -fd`, `git push --force`.
- НЕ хранить секреты в коде/логах/чатах; токены только через env/`wrangler pages secret put`.
- НЕ выводить пользовательские тексты/PII в события и логи (паттерн: pseudo-ключи + SAFE-поля).
- НЕ смешивать рефакторинг ядра и продуктовую фичу в одном коммите.
- НЕ push без разрешения владельца. Deploy = push в main (CF Pages авто) — только по команде.

## 3. Tenant isolation (закон)
Любая таблица данных агентов имеет `org_id`. Любой repository-метод принимает `orgId` первым
аргументом и включает его в WHERE. SQL живёт ТОЛЬКО в repository/storage-слое
(`functions/platform/**/store.ts`, legacy: `functions/lib/*/store.ts`). Для каждой новой
сущности обязателен негативный тест «org B не видит данные org A».

## 4. Идемпотентность (закон)
Каждый внешний вход несёт ключ: Telegram — `update_id` (INSERT OR IGNORE в
`telegram_updates`-паттерне), списания — `usage_ledger.idempotency_key` UNIQUE, гранты —
UNIQUE(source, source_id), платежи — UNIQUE(provider, external_transaction_id). Новые
webhook/операции обязаны следовать этому паттерну + негативный тест на повтор.

## 5. AI grounding (закон)
- LLM никогда не пишет цифры/цены/остатки/даты в финальный ответ — только шаблоны из БД.
- LLM-вызовы только через структурированный выбор из закрытого списка (json_schema strict, T≈0)
  или через будущий `platform/ai` фасад.
- Пользовательский/пересланный текст = ДАННЫЕ (инъекция-щит в system prompt — см.
  `functions/lib/telegram/prompts.ts` как образец).
- Пост-валидация обязательна (образцы: `functions/lib/telegram/validator.ts`, `analysis.ts`
  sanitize). Нарушение → retry максимум 1 → fail-closed.

## 6. Миграции БД
Одна D1 (`GPTBOT_DRAFTS_DB`). Канонические файлы `migrations/NNNN_*.sql` (следующий номер —
смотри каталог) + runtime-bootstrap `CREATE TABLE IF NOT EXISTS` в schema.ts соответствующего
домена (образцы: `functions/lib/telegram/schema.ts`). ALTER-колонки — через try/catch-список
(SQLite без IF NOT EXISTS для колонок). Миграции только аддитивные; rollback-notes в шапке файла.

## 7. Обязательные команды проверки
```
$env:NODE_OPTIONS='--max-old-space-size=1400'   # машина владельца страдает OOM при открытом Chrome
npx tsc -b                                       # 0 ошибок обязательно
node --import tsx --test tests/<файл>.test.ts    # затронутые файлы; полный список в TEST_MATRIX.md
npx vite build                                   # если менялся src/
npx tsx scripts/prerender.ts                     # если менялся src/ или content/ или prerender
npx tsx scripts/seo-audit.ts                     # если менялся content/
npx eslint <твои файлы>                          # ТВОИ файлы = 0 ошибок; глобальный lint красный (legacy, см. KNOWN_ISSUES)
```
При OOM (exit 134 / malloc): жди свободной RAM ≥2GB, гоняй тесты по одному файлу.

## 8. Правила коммитов
Один этап = один атомарный коммит (2–3 только при явных независимых частях). Conventional
Commits, тело на английском, сообщение через файл UTF-8 no-BOM: `git commit -F msg.txt`
(PowerShell 5.1 ломает кириллицу и here-strings с кавычками). Перед коммитом: git diff
просмотрен; секретов нет (`\d{8,10}:[A-Za-z0-9_-]{30,}` — grep обязателен при работе с
Telegram); generated-файлы (`dist/` изменения, `*.log`, `.dev.vars`) не добавлены; targeted
`git add <files>` (никогда `git add .`); тесты этапа зелёные; HANDOFF.md и STATE.json обновлены
В ТОМ ЖЕ коммите.

## 9. Формат handoff и STATE
После этапа полностью перезаписывай `docs/agents-platform/HANDOFF.md` по
`HANDOFF_TEMPLATE.md` (12 разделов) и обновляй `STATE.json`: completed-этап, next_stage
(ровно один), last_commit = фактический SHA, baseline. При блокере: stage_status=blocked,
blocked=true, причина в blockers[], этап НЕ помечается завершённым.

## 10. Как определить текущий этап
`STATE.json.next_stage` — это твой этап. Описание этапа — в ROADMAP.md. Выполняй только его,
не начинай соседние «заодно». Контекст ограничен: при приближении к лимиту — целостное дерево,
тесты, коммит, handoff, стоп.

## 11. Ловушки окружения (сэкономят тебе час)
Windows + PowerShell 5.1: нет `&&`; UTF-16 по умолчанию (пиши файлы UTF-8 no-BOM); node
падает OOM при открытом Chrome — `NODE_OPTIONS=--max-old-space-size=1400` и file-by-file
тесты. JS `\b` не работает с кириллицей — используй lookahead `(?![а-яё])`.
`toLocaleString('ru-RU')` вставляет NBSP (U+00A0) — eslint это ловит. Telegram file_id
валиден только внутри своего бота. tests используют in-memory D1-фейк, узнающий SQL по
regex — изменил SQL в store → почини фейк.
