# CURRENT_STATE — фактическое состояние репозитория (2026-07-26, P0.3)

## Продукты в production (не ломать)
- SEO-фабрика: `content/**` → `scripts/prerender*.ts` → статические страницы, sitemap, `llms.txt`, SEO build-gates.
- Веб AI-чат: `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` — `src/gpt-chat/**` + `functions/api/gpt/**`.
- Javob `@gptbot_javob_bot`: `functions/api/telegram/assistant.ts` + `functions/lib/telegram/**`; zero-prompt reply, voice transcription/reply, Tahlil, billing ledger, privacy/grounding guards.
- Lead-бот `@aidirectprobot`: `functions/api/telegram/webhook.ts`; заморожен и на P0.3 не изменялся.
- Админка `/admin-tools/` + `/api/admin/**`.

## Инфраструктура
- Cloudflare Pages + Pages Functions; основное хранилище D1 `GPTBOT_DRAFTS_DB`; Workers AI binding; KV `LOGIN_ATTEMPTS`.
- R2, Durable Objects, Queues и cron отсутствуют. P0.3 их не добавлял.
- Push в `main` запускает Cloudflare deploy, поэтому push/deploy разрешены только отдельной явной командой владельца.
- Каталог env-имён — `functions/_types.ts`. В P0.3 новые env/secrets не добавлены.

## GPTBot Agents Platform
- Завершены P0.1 boundaries/contracts/registry, P0.2 Telegram client extraction и P0.3 Events foundation.
- `functions/platform/events/**` содержит request-local `EventBus`, runtime PII guard, service, D1 store и runtime schema bootstrap.
- Канонический durable outbox — additive таблица `events` из `migrations/0013_platform_events.sql`: `id`, unique `idempotency_key`, nullable `org_id`/`agent_id`, `type`, `aggregate_ref`, `payload_json`, `occurred_at`, `created_at`, nullable `processed_at`.
- Publish-порядок: validate → durable append → последовательный in-process emit. Duplicate возвращает существующее событие и повторно не emit.
- Bus не имеет singleton/import-time registration. Все subscribers выполняются в порядке регистрации; ошибки агрегируются в `EventDispatchError` после запуска остальных subscribers.
- PII guard рекурсивно разрешает только JSON-safe значения, запрещает PII/content-ключи без учёта регистра, включая составные snake_case/camelCase ключи, ограничивает глубину до 5 и encoded size до 8192 bytes. Это guardrail, не DLP.
- Единственный legacy bridge находится в `functions/lib/telegram/platform-events.ts`: direct `javob_message_received` dual-write. Legacy `telegram_events` остаётся действующим; platform payload не содержит raw message, Telegram user/chat/file identifiers или username.
- Platform outbox failure для этого аналитического bridge логируется безопасной константой и не прерывает Javob user flow. Queue/dispatcher/retry/DLQ на P0.3 отсутствуют.
- `functions/channels/telegram/api.ts` остаётся реализацией Telegram client, старый `functions/lib/telegram/client.ts` — compatibility shim.
- Boundary rule сохраняется: agents/channels могут зависеть от platform; platform не импортирует agents/channels/legacy.

## Проверенный baseline P0.3
- `npx tsc -b` — exit 0.
- Platform events 20/20; boundaries 10/10; Telegram compatibility 1/1; Telegram assistant 60/60; gpt-chat 15/15.
- `npx tsc -p tsconfig.functions.json --noEmit` — ровно 27 известных legacy-ошибок, 0 в `functions/{platform,agents,channels}`.
- Scoped ESLint новых platform events и изменённых Javob-файлов — exit 0. Глобальный legacy lint остаётся известным долгом из `KNOWN_ISSUES.md`.

## Следующий этап
Только P0.4 — Identity/Orgs/Tenancy: additive schema для identities, organizations, memberships и contacts (persons — только при доказанной необходимости), repository-слой `functions/platform/{identity,orgs}` и негативные tenant-isolation tests. Не начинать P0.5 AI façade, Runtime, Knowledge, Workflow, Sotuvchi, dashboard или миграцию остальных legacy events.

## Рабочая среда
Windows + PowerShell. При OOM использовать `NODE_OPTIONS=--max-old-space-size=1400` и запускать тесты по одному файлу. Pre-existing untracked `apps/gpt-backend/package-lock.json` не относится к платформенным этапам: не добавлять, не удалять и не изменять.
