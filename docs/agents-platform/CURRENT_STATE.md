# CURRENT_STATE — фактическое состояние репозитория (2026-07-27, P1.2)

## Продукты в production (не ломать)
- SEO-фабрика: `content/**` → `scripts/prerender*.ts` → статические страницы, sitemap, `llms.txt`, SEO build-gates.
- Веб AI-чат: `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` — `src/gpt-chat/**` + `functions/api/gpt/**`.
- Javob `@gptbot_javob_bot`: `functions/api/telegram/assistant.ts` + `functions/lib/telegram/**`; reply, voice/Tahlil, billing и privacy/grounding guards.
- Lead-бот `@aidirectprobot`: `functions/api/telegram/webhook.ts`; заморожен и на P1.2 не изменялся.
- Админка `/admin-tools/` + `/api/admin/**`.

## Инфраструктура
- Cloudflare Pages + Pages Functions; одна D1 `GPTBOT_DRAFTS_DB`; Workers AI binding; KV `LOGIN_ATTEMPTS`.
- R2, Durable Objects, Queues и cron отсутствуют. P1.2 их не добавлял.
- Push в `main` запускает Cloudflare deploy; P1.2 не выполнял push/deploy и не применял migration к production.
- Новые env/secrets не добавлены.

## GPTBot Agents Platform
- Завершены P0.1 boundaries/contracts/registry, P0.2 Telegram channel extraction, P0.3 Events, P0.4 Identity/Orgs/Tenancy, P0.5 AI façade, P1.1 Knowledge Engine и P1.2 Workflow Engine minimum.
- `functions/platform/workflow/**` реализует tenant-first persistent FSM. Определения остаются доверенным TypeScript-кодом; D1 хранит только instance/state/payload/history, а не исполняемые выражения.
- Публичный контракт задаёт `id`, integer `version`, `initial`, `states`, optional `terminalStates`, runtime payload schema, guards и closed-list action refs.
- Runtime validation fail-closed проверяет идентификаторы, все ссылки state/target, уникальность trigger внутри state, guards/actions и JSON-safe limits.
- Instance создаётся с version 1 и статусом `active` либо `completed`, если initial state терминальный. Статусы: `active|completed|cancelled|failed`; P1.2 реально переводит в active/completed/cancelled, а `failed` зарезервирован.
- Transition history и optimistic instance version сохраняются атомарно через D1 `batch`: conditional `INSERT OR IGNORE ... SELECT` + guarded `UPDATE ... EXISTS(new transition id)`.
- Idempotency scoped к `(org_id, idempotency_key)`. Повтор transition проверяется раньше stale-version и не запускает actions второй раз; конфликт ключа между разными instances fail-closed.
- Guards получают только immutable payload/context/trigger data; engine не передаёт им DB/network/AI capability. Ошибки guards content-free.
- Action handlers регистрируются явно в constructor registry и запускаются последовательно после durable transition. Неизвестный action блокирует transition до записи.
- Успех/ошибка action сохраняются только как PII-safe type/status/code. Raw payload, trigger data и exception не записываются в metadata.
- Action policy P1.2 — at-most-once после commit. При смерти isolate между commit и handler возможна потеря action; durable action outbox/recovery должен быть отдельным этапом до non-idempotent production actions.
- Workflow platform events не emitted: отдельный Events outbox нельзя честно связать атомарно с workflow batch без принятой dispatch/outbox policy.
- Payload проходит agent-owned schema, затем independent strict JSON-safe/depth/UTF-8-size validation; сохраняется без произвольного reducer-кода и переживает новый engine/isolate object.
- `cancel()` разрешён только active instance, создаёт audit transition в том же state, повышает version ровно один раз и идемпотентен через derived key.
- Timer execution, scheduler, cron и `listDue` отсутствуют. Nullable `wake_at` — только schema extraction point и не имеет runtime API.
- Workflow module не импортирует agents/channels/legacy/Telegram/AI и не экспортирует Cloudflare handler.

## Таблицы P1.2
- `workflow_instances`: `org_id`, workflow id/version, state/status, validated `payload_json`, optimistic version, creation idempotency key, nullable `wake_at`, timestamps.
- `workflow_transitions`: tenant+instance history, from/to/trigger, transition idempotency key, resulting instance version, PII-safe action metadata, timestamp.
- Composite FK `(org_id, instance_id)` физически блокирует cross-tenant history links.
- 4 indexes покрывают tenant status/workflow/wake lookups и ordered transition history.

## Limits P1.2
- General IDs 120 chars; definition/state/action type 64; trigger 120; idempotency key 240.
- Payload 65,536 UTF-8 bytes и depth 20.
- Action input/trigger data 8,192 UTF-8 bytes и depth 10.
- Не более 100 states, 50 transitions/state и 20 actions/transition.

## Проверенный baseline P1.2
- `npx tsc -b` — exit 0.
- Workflow 39/39; Knowledge 33/33; AI 15/15; tenancy 31/31; events 20/20; boundaries 10/10; Telegram compatibility 1/1; Telegram assistant 60/60; gpt-chat 15/15.
- `npx tsc -p tsconfig.functions.json --noEmit` — ровно 27 известных legacy errors в 6 старых файлах, 0 в `functions/{platform,agents,channels}`.
- Scoped ESLint workflow/contracts/test/index — exit 0; direct boundary checker — exit 0.
- Local-only migration `0016` выполнена дважды; 2 tables, 4 indexes, defaults/composite FK и реальный atomic transition/idempotent replay подтверждены. Production D1 не затронута.
- Runtime/migration parity, secret/PII, destructive SQL, dependency, SQL-scope, handler export, explicit-any и scope scans чисты.

## Следующий этап
Только P1.3 — Agent Runtime minimum: уточнить `AgentManifest` types, registry, tools с Facts-контрактом, deterministic-first turn cycle, grounding fail-closed и demo agent `echo + 1 knowledge question`. Без Telegram agent webhook, Sotuvchi, commerce, scheduling, payments или deploy.

## Рабочая среда
Windows + PowerShell. Тесты запускать file-by-file из-за OOM-риска. При необходимости использовать `NODE_OPTIONS=--max-old-space-size=1400`. Для Wrangler local направлять TEMP/TMP/WRANGLER_LOG_PATH на F:, так как C: ранее был заполнен. Pre-existing untracked `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не добавлять, не удалять и не изменять.
