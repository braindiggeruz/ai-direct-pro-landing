# CURRENT_STATE — фактическое состояние репозитория (2026-07-26, P0.4)

## Продукты в production (не ломать)
- SEO-фабрика: `content/**` → `scripts/prerender*.ts` → статические страницы, sitemap, `llms.txt`, SEO build-gates.
- Веб AI-чат: `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` — `src/gpt-chat/**` + `functions/api/gpt/**`.
- Javob `@gptbot_javob_bot`: `functions/api/telegram/assistant.ts` + `functions/lib/telegram/**`; zero-prompt reply, voice transcription/reply, Tahlil, billing ledger, privacy/grounding guards.
- Lead-бот `@aidirectprobot`: `functions/api/telegram/webhook.ts`; заморожен и на P0.4 не изменялся.
- Админка `/admin-tools/` + `/api/admin/**`.

## Инфраструктура
- Cloudflare Pages + Pages Functions; основное хранилище D1 `GPTBOT_DRAFTS_DB`; Workers AI binding; KV `LOGIN_ATTEMPTS`.
- R2, Durable Objects, Queues и cron отсутствуют. P0.4 их не добавлял.
- Push в `main` запускает Cloudflare deploy, поэтому push/deploy разрешены только отдельной явной командой владельца.
- Каталог env-имён — `functions/_types.ts`. В P0.4 новые env/secrets не добавлены.

## GPTBot Agents Platform
- Завершены P0.1 boundaries/contracts/registry, P0.2 Telegram client extraction, P0.3 Events foundation и P0.4 Identity/Orgs/Tenancy.
- `functions/platform/identity/**` содержит provider-neutral identities для `telegram|web|email|phone|api`. External id хранится строкой, минимально нормализуется по provider и уникален в паре `(provider, external_id)`.
- Отдельная `persons` не введена: identity достаточно для ownership и contact linking; legacy `users`/`telegram_users` не мигрированы и не backfill.
- `functions/platform/orgs/**` содержит organizations как tenant root, owner/staff memberships и contacts в контексте конкретной organization.
- Public membership/contact API инкапсулирует D1 и получает `orgId` первым бизнес-аргументом. SQL tenant reads/updates всегда содержит `org_id`; cross-tenant lookup возвращает not found/null.
- Contacts не содержат phone, display name или raw channel profile. Хранятся только `org_id`, `identity_id`, nullable `ru|uz` locale и timestamps. Одна identity может иметь отдельные contacts в нескольких organizations.
- `createOrganizationForOwner` сначала разрешает global identity, затем атомарно создаёт organization и active owner membership через D1 `batch()`. При membership failure tenant batch откатывается; identity остаётся самостоятельной валидной записью.
- Каноническая additive migration — `migrations/0014_platform_identity_orgs.sql`; runtime bootstrap согласован с ней и идемпотентен. FK добавлены для целостности, но tenant isolation обеспечивается repository WHERE, а не только FK.
- `functions/platform/events/**` из P0.3 остаётся без изменений: request-local bus, PII guard, durable `events` outbox и один direct Javob dual-write bridge.
- `functions/channels/telegram/api.ts` остаётся реализацией Telegram client, старый `functions/lib/telegram/client.ts` — compatibility shim.
- Boundary rule сохраняется: agents/channels могут зависеть от platform; platform не импортирует agents/channels/legacy.

## Таблицы P0.4
- `identities`: global provider-scoped external identity.
- `organizations`: tenant root с unique safe slug, status `active|suspended|archived`, locale `ru|uz`.
- `memberships`: unique `(org_id, identity_id)`, role `owner|staff`, status `active|disabled`.
- `contacts`: unique `(org_id, identity_id)`, PII-minimal tenant contact.

## Проверенный baseline P0.4
- `npx tsc -b` — exit 0.
- Platform tenancy 31/31; platform events 20/20; boundaries 10/10; Telegram compatibility 1/1; Telegram assistant 60/60; gpt-chat 15/15.
- `npx tsc -p tsconfig.functions.json --noEmit` — ровно 27 известных legacy-ошибок, 0 в `functions/{platform,agents,channels}`.
- Scoped ESLint identity/orgs/test/index — exit 0. Глобальный legacy lint остаётся известным долгом из `KNOWN_ISSUES.md`.
- Migration `0014` дважды успешно выполнена только на локальной Wrangler D1; production migration/deploy не выполнялись.

## Следующий этап
Только P0.5 — Platform AI façade: provider-neutral `complete/stream/structured/transcribe` contracts и тонкие adapters поверх существующих AI implementations, model policy из config, strict validation structured output. Не переключать legacy массово и не начинать Knowledge, Workflow, Runtime, agent webhook или Sotuvchi.

## Рабочая среда
Windows + PowerShell. При OOM использовать `NODE_OPTIONS=--max-old-space-size=1400` и запускать тесты по одному файлу. Pre-existing untracked `apps/gpt-backend/package-lock.json` не относится к платформенным этапам: не добавлять, не удалять и не изменять.
