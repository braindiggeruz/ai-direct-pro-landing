# CURRENT_STATE — фактическое состояние репозитория (снято 2026-07-17, HEAD 5bf3d56)

## Продукты в проде (не ломать)
- SEO-фабрика: content/**(JSON) → scripts/prerender*.ts → ~183 стат. страниц; sitemap 186; llms.txt; seo-audit — build-гейт.
- Веб AI-чат: `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` — app-shell island `src/gpt-chat/` + `functions/api/gpt/*` (SSE-стриминг, квоты hashed-IP, D1-fallback gateway на Railway-код).
- **Javob** `@gptbot_javob_bot`: `functions/api/telegram/assistant.ts` + `functions/lib/telegram/**` (15 модулей): zero-prompt reply, voice→Whisper(Groq→OpenAI)→транскрипт→ответ, Tahlil-анализ (consent, strict-JSON, sanitize, grounded timestamps), биллинг-леджер, миграции 0009–0012.
- Lead-бот `@aidirectprobot`: `functions/api/telegram/webhook.ts` — in-memory лид-форма Ads. ЗАМОРОЖЕН.
- Админка `/admin-tools/` + `/api/admin/**` (JWT), контент коммитится в GitHub Octokit'ом.

## Инфраструктура (подтверждено кодом/конфигом)
- Cloudflare Pages + Pages Functions; D1 единственная (`GPTBOT_DRAFTS_DB`), Workers AI binding; KV `LOGIN_ATTEMPTS`. R2/Durable Objects/Queues/cron — НЕТ.
- Деплой: push main → CF `build:cf`. Тестов в CI нет (только seo-audit-гейт).
- env-каталог: `functions/_types.ts` (единственный источник имён).

## Платформа GPTBot Agents
- Статус: этап P0.0 (этот). Каталогов `functions/{platform,agents,channels}` ещё НЕ существует.
- Переиспользуемые образцы для ядра: TelegramClient (`lib/telegram/client.ts`), webhook-скелет (`api/telegram/assistant.ts`), идемпотентный леджер (`lib/telegram/billing.ts`), schema-bootstrap (`lib/telegram/schema.ts`), pseudoUser/logEvent (`lib/telegram/store.ts`), guard-валидаторы (`lib/telegram/{validator,analysis}.ts`), i18n-паттерн, `lib/llm/*` (роутер+circuit-breaker), тест-фейк D1 (`tests/telegram-assistant.test.ts`).

## Baseline (см. TEST_MATRIX.md, снят на этом этапе)
tsc 0 · tests 143/143 (file-by-file) · vite build OK · javob:eval offline OK · `eslint .` КРАСНЫЙ: 84 problems (71 err) — весь красняк legacy, не относится к платформе (список в KNOWN_ISSUES.md).

## Известные особенности машины разработки
Windows, PowerShell 5.1, node OOM при открытом Chrome (лечение: NODE_OPTIONS=--max-old-space-size=1400, тесты по одному файлу, ждать free RAM ≥2GB).
