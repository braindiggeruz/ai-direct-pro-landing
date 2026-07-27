# CURRENT_STATE — фактическое состояние репозитория (2026-07-27, P1.1)

## Продукты в production (не ломать)
- SEO-фабрика: `content/**` → `scripts/prerender*.ts` → статические страницы, sitemap, `llms.txt`, SEO build-gates.
- Веб AI-чат: `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` — `src/gpt-chat/**` + `functions/api/gpt/**`.
- Javob `@gptbot_javob_bot`: `functions/api/telegram/assistant.ts` + `functions/lib/telegram/**`; reply, voice/Tahlil, billing и privacy/grounding guards.
- Lead-бот `@aidirectprobot`: `functions/api/telegram/webhook.ts`; заморожен и на P1.1 не изменялся.
- Админка `/admin-tools/` + `/api/admin/**`.

## Инфраструктура
- Cloudflare Pages + Pages Functions; одна D1 `GPTBOT_DRAFTS_DB`; Workers AI binding; KV `LOGIN_ATTEMPTS`.
- R2, Durable Objects, Queues и cron отсутствуют. P1.1 их не добавлял.
- Push в `main` запускает Cloudflare deploy; push/deploy только по отдельной явной команде владельца.
- P1.1 не добавлял env/secrets и не применял migration к production.

## GPTBot Agents Platform
- Завершены P0.1 boundaries/contracts/registry, P0.2 Telegram channel extraction, P0.3 Events, P0.4 Identity/Orgs/Tenancy, P0.5 AI façade и P1.1 Knowledge Engine minimum.
- `functions/platform/knowledge/**` хранит generic collections per org+agent+kind и structured knowledge items. Движок не знает product/doctor/dish и не импортирует agents/channels/lib/AI.
- Каноническая migration — `0015_platform_knowledge.sql`; runtime bootstrap идентичен и сначала обеспечивает organizations schema.
- Collection unique в `(org_id, agent_id, kind)`. Item содержит собственный `org_id`; composite FK `(org_id, collection_id)` усиливает repository tenant checks.
- Agent schema реализует `validate(unknown)`, `toSearchText`, optional `toMediaRefs`/`toNumericValues`. После validation engine требует strict JSON-safe payload и применяет фиксированные limits.
- Search v1: Unicode normalization для RU/Uzbek Latin без transliteration/stemming; parameterized exact/prefix/token candidates через SQLite `json_each`; deterministic score и stable tie-break. Empty query отклоняется.
- `numeric_1..3` имеют tenant indexes и optional range filters. Search работает только по active collections/items; hidden/archived исключаются.
- Item version начинается с 1; payload/status writes требуют expectedVersion и отвергают stale update.
- Media refs channel-neutral/opaque. Telegram file_id bot-scoped; Knowledge не выполняет transport/media operations.
- По D-011 revisions и knowledge events отложены до доказанного продуктового требования/отдельной policy.
- `functions/platform/ai/**`, identity/orgs/events и Telegram channel extraction остаются без изменений поведения.

## Таблицы P1.1
- `knowledge_collections`: tenant+agent+kind schema root, status `active|archived`.
- `knowledge_items`: tenant child, status `active|hidden|archived`, validated payload/search/media/numeric projections, optimistic version.
- `knowledge_revisions` не создана по D-011.

## Limits P1.1
- IDs 120 chars; agent/kind 64; collection name 120.
- Payload 65,536 UTF-8 bytes; normalized search text 4,096 chars.
- Media refs 10, opaque value 512 chars.
- Search query 256 chars / 16 unique tokens; result limit 50; candidate cap 200.

## Проверенный baseline P1.1
- `npx tsc -b` — exit 0.
- Knowledge 33/33; AI 15/15; tenancy 31/31; events 20/20; boundaries 10/10; Telegram compatibility 1/1; Telegram assistant 60/60; gpt-chat 15/15.
- `npx tsc -p tsconfig.functions.json --noEmit` — ровно 27 известных legacy errors в 6 старых файлах, 0 в `functions/{platform,agents,channels}`.
- Scoped ESLint Knowledge/test/index — exit 0; direct boundary checker — exit 0.
- Local-only migration `0015` выполнена дважды; 2 tables, 6 indexes, defaults/composite FK/search SQL подтверждены. Production D1 не затронута.
- Secret/PII, destructive SQL, parity, dependency и SQL-scope scans чисты.

## Следующий этап
Только P1.2 — Workflow Engine minimum: declarative persistent FSM, tenant-scoped `workflow_instances`, deterministic transitions, idempotent actions и restart test. Без cron, Agent Runtime, Telegram webhook или Sotuvchi.

## Рабочая среда
Windows + PowerShell. При OOM использовать `NODE_OPTIONS=--max-old-space-size=1400`. Диск C: на P1.1 был заполнен; для Wrangler local проверки понадобились TEMP/TMP/WRANGLER_LOG_PATH на F:. Pre-existing untracked `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не добавлять, не удалять и не изменять.
