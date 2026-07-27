# CURRENT_STATE — фактическое состояние репозитория (2026-07-27, P1.3)

## Продукты в production (не ломать)
- SEO-фабрика: `content/**` → `scripts/prerender*.ts` → статические страницы,
  sitemap, `llms.txt`, SEO build-gates.
- Веб AI-чат: `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` —
  `src/gpt-chat/**` + `functions/api/gpt/**`.
- Javob `@gptbot_javob_bot`: `functions/api/telegram/assistant.ts` +
  `functions/lib/telegram/**`; reply, voice/Tahlil, billing и privacy/grounding
  guards.
- Lead-бот `@aidirectprobot`: `functions/api/telegram/webhook.ts`; заморожен и
  на P1.3 не изменялся.
- Админка `/admin-tools/` + `/api/admin/**`.

## Инфраструктура
- Cloudflare Pages + Pages Functions; одна D1 `GPTBOT_DRAFTS_DB`; Workers AI
  binding; KV `LOGIN_ATTEMPTS`.
- R2, Durable Objects, Queues и cron отсутствуют. P1.3 их не добавлял.
- Push в `main` запускает Cloudflare deploy; P1.3 не выполнял push/deploy и не
  применял migrations.
- Новые env/secrets, routes, webhooks и production registrations не добавлены.

## GPTBot Agents Platform
- Завершены P0.1–P0.5, P1.1 Knowledge Engine, P1.2 Workflow Engine и
  **P1.3 Agent Runtime minimum**.
- `functions/platform/runtime/**` — единый channel-neutral turn runtime.
  Нормализованный вход содержит обязательные `requestId`, `orgId`, `agentId`,
  locale и text/action message; provider metadata и неизвестные поля
  отклоняются.
- `AgentManifest` runtime-validatable: safe kebab id, semver-like version,
  непустые уникальные locales, известные уникальные capabilities/tools,
  уникальные deterministic rule id/priority, strict policies и валидные
  optional workflow definitions/knowledge kinds.
- Trusted handlers и schemas остаются TypeScript-кодом; dynamic filesystem
  loading, generated code и произвольное function calling отсутствуют.
- `functions/agents/registry.ts` — единственная production registration point.
  Registry пуст на P1.3; demo agent не импортируется и не доступен production
  routing. Duplicate и unknown agent имеют controlled content-free errors.
- Порядок turn: caller-provided active workflow через injected port →
  deterministic rules по уникальному ascending priority → optional AI
  closed-list selection → controlled fallback. AI не вызывается первым и не
  пишет финальный ответ.
- AI selector использует существующий Platform AI façade, получает только
  manifest tool names/descriptions и текущий normalized message, возвращает
  strict `{tool, arguments}`. Tool вне manifest, invalid JSON/schema и invalid
  args fail-closed.
- Tool input начинается как `unknown`, проходит `inputSchema`, затем trusted
  handler. `ToolContext` содержит только org/request/locale и narrow
  Knowledge/Workflow service ports: без raw D1, channel client, secrets или
  platform container.
- Любые вложенные `orgId`/tenant override keys в tool arguments отклоняются;
  runtime `orgId` — единственный tenant source.
- Tool output не рендерится напрямую. Trusted projection создаёт `FactSheet`:
  safe namespaced scalar values, максимум 64 facts, без nested blobs; tool
  identity проверяется.
- Финальный tool response строится deterministic locale template с
  `{{namespace.fact}}`. Подстановки образуют explicit claims.
- Grounding P1.3 — механическая, не семантическая проверка истинности:
  explicit exact claims обязаны совпасть с Facts, а все числа в text/choice
  labels должны присутствовать среди Fact values. Failure возвращает
  `rejected`, reason code и пустой outbound.
- Trusted deterministic answer также проходит grounding. Demo `echo` отражает
  только уже валидированный пользовательский фрагмент без превращения его в
  production Facts.
- Runtime result channel-neutral: status, outbound messages, Facts,
  tool-execution summaries, grounding result и optional reason code. Telegram
  markup/renderer отсутствуют.
- Optional workflow boundary минимален: если caller передал active instance,
  runtime делегирует injected `WorkflowServicePort`. Реальная D1-интеграция и
  product workflow на P1.3 не добавлены.
- Events не emitted: действующая publish path может возвращать failure после
  durable append, а согласованной best-effort policy для turn result нет.
  Conversation storage/history также отсутствуют; `conversationRef` только
  opaque normalized reference.
- `functions/agents/demo/**` — offline fixture: deterministic `echo` и один
  `knowledge.lookup` через narrow port, deterministic RU/UZ templates. Это не
  Sotuvchi и не product schema.

## Сохранённые движки P1.1/P1.2
- Knowledge остаётся tenant-scoped: collections/items, runtime payload schemas,
  deterministic search/ranking и optimistic versions.
- Workflow остаётся persistent tenant-scoped FSM с atomic transition/history,
  optimistic versions, idempotency и closed-list post-commit actions.
- Workflow action policy всё ещё at-most-once, не durable-recoverable; domain
  events/timer runner отсутствуют.

## Проверенный baseline P1.3
- `npx tsc -b` — exit 0.
- Runtime 49/49; Workflow 39/39; Knowledge 33/33; AI 15/15; tenancy 31/31;
  Events 20/20; boundaries 10/10; Telegram compatibility 1/1; Telegram
  assistant 60/60; gpt-chat 15/15.
- `npx tsc -p tsconfig.functions.json --noEmit` — ровно 27 известных legacy
  errors в 6 старых файлах, 0 в `functions/{platform,agents,channels}`.
- Scoped ESLint runtime/agents/contracts/tests — exit 0; boundary suite —
  10/10.
- Staged secret/PII, `.env`/`.dev.vars`, credential-shape и diff scans чисты.
- Единственная provider-specific fixture — `chat_id` в negative test,
  доказывающем fail-closed runtime input.

## Следующий этап
Только **P1.4 — Telegram agent webhook**: отдельный agent route, собственные
`TELEGRAM_SOTUVCHI_*` token/secret, secret-header, dedup, `?start=` deep links,
нормализация через `channels/telegram` и end-to-end demo agent. Обязательный
guard: новый username отличается от `aidirectprobot` и `gptbot_javob_bot`.
Не начинать Sotuvchi product flows P2.

## Рабочая среда
Windows + PowerShell. Тесты запускать file-by-file из-за OOM-риска; безопасно
использовались Node limits 256–512 MB. Pre-existing untracked
`apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не добавлять, не
удалять и не изменять.
