# GPTBot Agents — Handoff

## 1. Состояние
- Дата: 2026-07-26
- Ветка: `main`
- HEAD: code commit P0.2 `1159226b5cec26176704d2da36e9dfaaa6407edc` + текущий metadata relay по D-006 (`STATE.json.state_commit = "HEAD"`; фактический SHA определяется через `git log`)
- Завершённый этап: **P0.2 — Telegram channel extraction**
- Следующий этап: **P0.3 — Events foundation**
- Рабочее дерево после relay: только давний pre-existing untracked `apps/gpt-backend/package-lock.json`; файл не изменён, не удалён и не добавлен в коммиты

## 2. Что сделано
1. Проверены исходный HEAD `954bf44dcb9a1ce7e1ebc19a7715f5ddd9a96078`, коммиты `45839a5`, `abd8192`, `954bf44`, состояние P0.1 и обязательные gates `STATE.json`.
2. До изменений подтверждён baseline: boundary 10/10, Telegram assistant 60/60, gpt-chat 15/15, `tsc -b` exit 0, functions-config ровно 27 legacy-ошибок и 0 в `functions/{platform,agents,channels}`.
3. Реализация Telegram Bot API client физически перенесена из `functions/lib/telegram/client.ts` в `functions/channels/telegram/api.ts`. Логика, константы, HTTP payload, retry/backoff, timeout, `retry_after`, split, escaping, error handling и публичные сигнатуры не менялись.
4. Старый путь оставлен тонким compatibility shim: `export * from '../../channels/telegram/api';`. Production-потребитель `functions/api/telegram/assistant.ts` и существующий Telegram suite продолжают импортировать старый путь без изменений.
5. Создан channel-local barrel `functions/channels/telegram/index.ts` без Cloudflare handler exports.
6. Добавлен сетево-независимый compatibility test старого и нового путей: одинаковые runtime exports по ссылке и совместимая type surface.

## 3. Изменённые файлы
- `functions/channels/telegram/api.ts` — фактическая реализация Telegram client; 207 строк, идентична прежней реализации кроме описательной первой строки комментария; не импортирует legacy lib, agents или platform.
- `functions/channels/telegram/index.ts` — re-export public surface из `./api`; не является Pages route и не экспортирует `onRequest*`.
- `functions/lib/telegram/client.ts` — трёхстрочный `LEGACY-SHIM`, сохраняющий все старые imports.
- `tests/telegram-channel-compat.test.ts` — targeted proof для runtime и type compatibility; сеть не вызывается.
- `docs/agents-platform/STATE.json` — P0.2 completed, следующий этап P0.3, SHA code commit по D-006.
- `docs/agents-platform/HANDOFF.md` — текущая 12-раздельная эстафета.
- `docs/agents-platform/TEST_MATRIX.md` — зафиксирован P0.2 compatibility gate и post-change baseline.

## 4. Архитектурные решения
- Новых решений не принято. Этап следует существующим D-006 (code commit + metadata relay) и D-007 (functions-config допускает только фиксированные 27 legacy-ошибок, 0 в platform/agents/channels).

## 5. Что сознательно не сделано
- Production consumers не переключались на новый import path и массовые замены imports не выполнялись.
- Не переносились `handler.ts`, config, i18n, webhook, transcription или другие Telegram-файлы.
- Не менялись Telegram retry, timeout, payloads, parse mode, split, error classes/logging, env names, bot config или Javob business logic.
- Не создавались channel adapter, Runtime, routes, events, outbox, tenancy, AI façade, Knowledge/Workflow Engine или Sotuvchi.
- Не исправлялись 27 legacy TypeScript errors и глобальный legacy lint.
- Push и deploy не выполнялись.

## 6. Проверки
- Baseline `npx tsc -b` → exit 0.
- Baseline `node --import tsx --test tests/agent-boundaries.test.ts` → 10/10.
- Baseline `node --import tsx --test tests/telegram-assistant.test.ts` → 60/60.
- Baseline `node --import tsx --test tests/gpt-chat.test.ts` → 15/15.
- Baseline `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, 27 legacy errors, 0 в platform/agents/channels.
- Post-change `npx tsc -b` → exit 0.
- Post-change `node --import tsx --test tests/agent-boundaries.test.ts` → 10/10.
- Post-change `node --import tsx --test tests/telegram-assistant.test.ts` → 60/60.
- Post-change `node --import tsx --test tests/gpt-chat.test.ts` → 15/15.
- `node --import tsx --test tests/telegram-channel-compat.test.ts` → 1/1.
- Post-change `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, ровно 27 legacy errors, 0 в platform/agents/channels.
- `npx tsx scripts/check-agent-boundaries.ts` → OK, exit 0.
- `npx eslint functions/channels/telegram/api.ts functions/channels/telegram/index.ts functions/lib/telegram/client.ts tests/telegram-channel-compat.test.ts` → exit 0.
- Implementation comparison → 207/207 строк, идентична кроме первой строки комментария.
- Secret scan изменённых/staged файлов по Telegram token pattern → 0 совпадений; `.env`/`.dev.vars` в status → 0.
- `git diff --check` и staged `git diff --check` → exit 0.

## 7. Известные проблемы
- Существовали до этапа: 27 functions-config TypeScript errors в legacy-файлах; глобальный eslint legacy-red; OOM-риск машины; остальные пункты `KNOWN_ISSUES.md`.
- Появилось в этапе: ничего.
- Внешние блокеры: без изменений; для P0.2 не требовались.
- Pre-existing untracked: `apps/gpt-backend/package-lock.json`, намеренно не тронут.

## 8. Следующая задача
Только **P0.3 — Events foundation**: реализовать минимальный in-process bus в `functions/platform/events`, durable outbox с аддитивной миграцией таблицы `events` и мост ровно из одного существующего Javob `logEvent`-потока. Не переходить к identity/orgs P0.4.

## 9. Acceptance criteria следующего этапа
1. Сначала сверить `STATE.json.next_stage == "P0.3"` и повторить baseline P0.2.
2. In-process event contract/bus находится только в `functions/platform/events` и не импортирует agents/channels/legacy без точечного, явно обоснованного `LEGACY-SHIM` по действующей boundary-политике.
3. Аддитивная миграция следующего свободного номера создаёт outbox `events`: `id`, nullable `org_id`, nullable `agent_id`, `type`, `aggregate`, PII-free `payload_json`, `created_at`, nullable `processed_at`; runtime bootstrap согласован с миграцией.
4. Дублирование идёт из одного существующего Javob `logEvent`-потока; legacy `telegram_events` продолжает записываться без изменения контракта.
5. Идемпотентность и отсутствие PII доказаны позитивными и негативными тестами; tenant-поля не выдумываются при legacy bridge.
6. Boundary 10/10+, Telegram 60/60, gpt-chat 15/15, compatibility 1/1, `tsc -b` 0; functions-config не больше 27 legacy и 0 ошибок в platform/agents/channels; новые файлы eslint 0.
7. Не реализовывать P0.4 tenancy, Runtime, AI façade, Workflow, Knowledge или Sotuvchi.

## 10. Команды для старта
```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
git status --short
git branch --show-current
git rev-parse HEAD
git log -7 --oneline
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
node --import tsx --test tests/agent-boundaries.test.ts
node --import tsx --test tests/telegram-channel-compat.test.ts
node --import tsx --test tests/telegram-assistant.test.ts
node --import tsx --test tests/gpt-chat.test.ts
npx tsc -p tsconfig.functions.json --noEmit
```

## 11. Риски
- Не превращать `functions/channels/telegram/**` в Pages route: exports `onRequest*` запрещены.
- Не направлять channels к `functions/lib/**` или `functions/agents/**`; boundary checker не ослаблять.
- Не менять legacy consumers/shim во время P0.3 без отдельной необходимости.
- Lead-бот `functions/api/telegram/webhook.ts`, его token и webhook неприкосновенны.
- Event payload не должен содержать Telegram IDs, usernames, file IDs, сообщения, транскрипты, prompts или secrets.
- Не исправлять legacy errors «заодно» и не начинать P0.4.

## 12. Rollback
- Сначала отменить metadata relay P0.2: `git revert <SHA metadata relay>`.
- Затем отменить code commit: `git revert 1159226b5cec26176704d2da36e9dfaaa6407edc`.
- Миграций, внешних записей, push или deploy на P0.2 не было; rollback полностью локальный и безопасный.
