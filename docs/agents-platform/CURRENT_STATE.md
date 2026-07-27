# CURRENT_STATE — фактическое состояние репозитория (2026-07-27, P1.4)

## Продукты в production (не ломать)
- SEO-фабрика, веб AI-чат, админка и существующие API работают по прежним
  контрактам.
- Javob `@gptbot_javob_bot`: `functions/api/telegram/assistant.ts` +
  `functions/lib/telegram/**`; P1.4 его endpoint, token, dedup и handler не
  изменял.
- Lead-бот `@aidirectprobot`: `functions/api/telegram/webhook.ts`; заморожен и
  не изменялся.
- Новый Agents webhook не настроен и не deployed.

## Инфраструктура
- Cloudflare Pages + Pages Functions; D1 `GPTBOT_DRAFTS_DB`; Workers AI и KV
  остаются без изменений.
- Добавлена, но не применена production, migration
  `0017_telegram_agents_transport.sql`: одна isolated dedup table и один index.
- R2, Durable Objects, Queues, cron и второй backend не добавлены.
- Push/deploy/setup webhook не выполнялись.

## P1.4 Telegram Agents transport
- Endpoint: `POST /api/telegram/agents`; GET/PUT/DELETE/PATCH/HEAD/OPTIONS
  возвращают controlled 405.
- Используются только:
  `TELEGRAM_AGENTS_BOT_TOKEN`,
  `TELEGRAM_AGENTS_WEBHOOK_SECRET`,
  `TELEGRAM_AGENTS_BOT_USERNAME`.
- Endpoint возвращает 503 при неполной конфигурации/D1. Protected username
  также не активирует route.
- `X-Telegram-Bot-Api-Secret-Token` сравнивается exact до чтения JSON и D1.
  Missing/wrong имеют разные внутренние safe codes, но одинаковый внешний 401.
- Body ограничен 64 KiB; malformed JSON и malformed supported update дают 400.
  Unsupported update/media/group дают 200 ignored.
- Supported update проходит strict normalization до dedup.
- Dedup namespace: `agents:<bot_username>:<update_id>`.
  `telegram_agent_updates` имеет `reserved|completed|failed`; legacy
  `telegram_updates` Javob не используется и не изменён.
- Reserve выполняется до Identity/Runtime/send. Duplicate не вызывает Runtime
  и не отправляет ответ второй раз.
- Failure policy at-most-once: processing/send failure становится terminal
  `failed`; скрытый повтор Runtime после send uncertainty запрещён. Логи
  содержат только allowlisted safe code.
- Долгая обработка запускается через `waitUntil` после durable reserve;
  HTTP webhook быстро возвращает 200 accepted.

## Deep links и trusted context
- Grammar: `agent_<routeCode>`.
- Payload ≤64, routeCode ≤32, lowercase letters/digits/hyphen. JSON/base64,
  arbitrary URL, дополнительные query parameters и underscore-поля
  отклоняются.
- `https://t.me/<expected_bot>?start=agent_<routeCode>` проверяет exact bot
  path и единственный `start` parameter.
- Route code разрешается только server-side mapping `(bot, routeCode) →
  orgId/agentId/locale`; payload никогда не становится прямым orgId.
- P1.4 route-local mapping содержит только `agent_demo → org-demo/demo`.
  Global production agent registry остаётся пустым.
- Durable identity→org/storefront binding не добавлен. Offline E2E использует
  injected identity allowlist; реальный onboarding/mapping относится к P2.1.

## Identity и inbound normalization
- Telegram user id проверяется как safe positive integer, сразу преобразуется
  в string и передаётся существующему Identity service с provider `telegram`.
- Username, first name и остальные profile fields не сохраняются channel
  adapter'ом.
- Runtime получает platform identityId, trusted orgId/agentId/locale и только
  `text` либо `action`.
- Runtime не получает Telegram update/message/user/callback objects,
  `chat_id`, `update_id`, token или bot username.
- Поддержаны private text, `/start`, safe callback action. Unsupported media и
  group chats игнорируются.

## Renderer
- Channel-neutral Runtime output рендерится только в
  `functions/channels/telegram/render.ts`.
- Используется существующий `TelegramClient`; output отправляется plain text
  без `parse_mode`.
- Сообщения делятся безопасно ниже Telegram limit.
- Safe choices превращаются в callback data `agent:<choiceId>` ≤64 bytes;
  invalid choices отбрасываются.
- Runtime rejected/handoff/error и unknown mapping дают deterministic RU/UZ
  fallback без внутренних codes/content.
- Media ref на P1.4 не отправляется отдельно; при наличии сохраняется text-only
  deterministic degradation.

## Demo и setup
- API route создаёт отдельный registry с одним `demoAgentManifest`; core
  Runtime concrete demo не импортирует, global registry не изменён.
- Offline E2E покрывает echo и Knowledge lookup на fake services: RU, Uzbek
  Latin, mixed, duplicate и cross-tenant.
- `scripts/telegram-agents-setup.ts` не запускается автоматически:
  `getMe` → exact expected username/protected guards → commands →
  exact `/api/telegram/agents` webhook с обязательным secret.
- Guard запрещает `aidirectprobot` и `gptbot_javob_bot`; dry-run не выполняет
  mutations. Token/secret не печатаются.

## Проверенный baseline P1.4
- `tsc -b` — exit 0.
- Telegram Agents 41/41; Runtime 49/49; Workflow 39/39; Knowledge 33/33;
  AI 15/15; tenancy 31/31; Events 20/20; boundaries 10/10; Telegram
  compatibility 1/1; Telegram assistant 60/60; gpt-chat 15/15.
- Functions typecheck — ровно 27 legacy errors в прежних 6 файлах, 0 в
  `functions/{platform,agents,channels}` и новом endpoint.
- Scoped ESLint — exit 0; direct boundary checker — 0 violations.
- Staged token/key/private-key/email/phone scans — 0. Старые env names
  встречаются только в отрицательных guards/comments.

## Следующий этап
Только **P2.1 — Onboarding магазина**: создать organization + owner membership,
собрать имя, язык, доставку и оплату, выдать безопасный storefront code и
связать его с trusted Telegram context. Не начинать P2.2 catalog, checkout,
orders, inventory, handoff, payments integration или deploy.

## Рабочая среда
Windows + PowerShell; при низкой virtual memory использовался `node --jitless`
и последовательные проверки. Pre-existing untracked
`apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не изменять и не
добавлять.
