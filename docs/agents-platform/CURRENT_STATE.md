# CURRENT_STATE — фактическое состояние репозитория (2026-07-27, P0.5)

## Продукты в production (не ломать)
- SEO-фабрика: `content/**` → `scripts/prerender*.ts` → статические страницы, sitemap, `llms.txt`, SEO build-gates.
- Веб AI-чат: `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` — `src/gpt-chat/**` + `functions/api/gpt/**`.
- Javob `@gptbot_javob_bot`: `functions/api/telegram/assistant.ts` + `functions/lib/telegram/**`; zero-prompt reply, voice transcription/reply, Tahlil, billing ledger, privacy/grounding guards.
- Lead-бот `@aidirectprobot`: `functions/api/telegram/webhook.ts`; заморожен и на P0.5 не изменялся.
- Админка `/admin-tools/` + `/api/admin/**`.

## Инфраструктура
- Cloudflare Pages + Pages Functions; основное хранилище D1 `GPTBOT_DRAFTS_DB`; Workers AI binding; KV `LOGIN_ATTEMPTS`.
- R2, Durable Objects, Queues и cron отсутствуют. P0.5 их не добавлял.
- Push в `main` запускает Cloudflare deploy, поэтому push/deploy разрешены только отдельной явной командой владельца.
- Каталог env-имён — `functions/_types.ts`. В P0.5 новые env/secrets/model names не добавлены.

## GPTBot Agents Platform
- Завершены P0.1 boundaries/contracts/registry, P0.2 Telegram client extraction, P0.3 Events, P0.4 Identity/Orgs/Tenancy и P0.5 Platform AI façade.
- `functions/platform/ai/**` — provider-neutral AI layer. `AiFacade` предоставляет `complete` и generic `structured`; capability contracts отдельно описывают text, structured, streaming и transcription drivers без обязательной реализации всех методов.
- `AiPolicyResolver` детерминированно выбирает exact task+tier policy либо default tier, затем идёт по configured driver routes не более `maxAttempts`. Policy может задавать model override/temperature/maxTokens/timeout, но реальные legacy model chains остаются в существующей env/config.
- Structured result проходит strict `JSON.parse`, затем runtime schema `.parse(unknown)`. Invalid JSON и schema mismatch возвращают controlled fail-closed errors, а raw output не становится domain value.
- Error model ограничен configuration/provider/timeout/structured/unavailable; raw provider message, prompt и user content не переносятся в ошибки.
- Единственная platform→legacy точка — `functions/platform/ai/drivers/legacy.ts`: adapters над gpt-chat OpenRouter text helper и `lib/llm` structured router. Boundary checker разрешает `LEGACY-SHIM` только этому exact path.
- Streaming/STT представлены typed capability contracts, но не включены в façade и не мигрированы. Javob, gpt-chat, Tahlil и transcription по-прежнему используют старые production paths, поэтому поведение не изменено.
- `functions/platform/identity/**` содержит provider-neutral identities; `functions/platform/orgs/**` — organizations, owner/staff memberships и PII-minimal contacts с tenant-scoped repositories.
- `functions/platform/events/**` сохраняет request-local bus, PII guard, durable outbox и один direct Javob dual-write bridge.
- `functions/channels/telegram/api.ts` остаётся реализацией Telegram client, `functions/lib/telegram/client.ts` — compatibility shim.
- Boundary direction: agents/channels могут зависеть от platform; platform не импортирует agents/channels. Legacy lib разрешён только одному P0.5 adapter-файлу.

## Состояние данных P0.5
- Новых таблиц и migrations на P0.5 нет.
- С P0.4 существуют `identities`, `organizations`, `memberships`, `contacts`; remote/production migration в рамках P0.5 не выполнялась.
- AI policy не хранится в D1, billing ledger не менялся.

## Проверенный baseline P0.5
- `npx tsc -b` — exit 0.
- Platform AI 15/15; tenancy 31/31; events 20/20; boundaries 10/10; Telegram compatibility 1/1; Telegram assistant 60/60; gpt-chat 15/15.
- `npx tsc -p tsconfig.functions.json --noEmit` — ровно 27 известных legacy-ошибок в 6 старых файлах, 0 в `functions/{platform,agents,channels}`.
- Scoped ESLint AI/test/boundary/shared index — exit 0; direct boundary checker — exit 0.
- Secret/PII scan чист; реальные provider network calls в tests отсутствуют.
- Production database, push и deploy не затрагивались.

## Следующий этап
Только P1.1 — Knowledge Engine minimum: tenant-scoped `knowledge_collections/items`, schema validation payload, normalized `search_text`, numeric indexes и deterministic normalize+LIKE+scoring search. Revisions — только если нужны Sotuvchi. Не начинать Workflow, Runtime, agent webhook или Sotuvchi.

## Рабочая среда
Windows + PowerShell. При OOM использовать `NODE_OPTIONS=--max-old-space-size=1400` и запускать тесты по одному файлу. Pre-existing untracked `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не относятся к P0.5: не добавлять, не удалять и не изменять.
