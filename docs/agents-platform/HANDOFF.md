# GPTBot Agents — Handoff

## 1. Состояние
- Дата: 2026-07-27.
- Ветка: `main`.
- Исходный HEAD P1.3: `3e12d1c934a88fc15a69eac7f026438ae736b57a`.
- Code commit P1.4:
  `539525410f086ef1c705c221950b29d808982899`.
- HEAD после relay: последний metadata-only commit в `git log`; по D-006
  `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA.
- Завершённый этап: **P1.4 — Telegram agent webhook**.
- Следующий этап: **P2.1 — Onboarding магазина**.
- P1.3 подтверждён в ancestry: code
  `854a3cf63d860f8f930ad8f66fc1d3c87a132036`, relay/source
  `3e12d1c934a88fc15a69eac7f026438ae736b57a`.
- После relay рабочее дерево должно содержать только pre-existing untracked
  `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`; они не изменялись,
  не удалялись и не добавлялись в коммиты.
- `origin/main` во время P1.4 оставался
  `93fab390733d3d5ffbf052e211d95b6038ee4bbd`.
- Push, deploy, Telegram setup и применение migration отсутствуют.

## 2. Что сделано
1. До изменений подтверждены STATE/git gate, исходный HEAD, P1.3 ancestry,
   чистый tracked tree, два pre-existing untracked объекта и полный baseline.
2. Добавлен отдельный endpoint `POST /api/telegram/agents`; остальные HTTP
   методы возвращают controlled 405.
3. Введены только отдельные env names:
   `TELEGRAM_AGENTS_BOT_TOKEN`,
   `TELEGRAM_AGENTS_WEBHOOK_SECRET`,
   `TELEGRAM_AGENTS_BOT_USERNAME`.
   Значения не документируются и не логируются.
4. Endpoint fail-closed возвращает 503 при неполной конфигурации, недоступной
   D1 binding или protected username.
5. Exact `X-Telegram-Bot-Api-Secret-Token` проверяется до чтения JSON и D1.
   Missing/wrong имеют разные внутренние safe codes и одинаковый внешний 401.
6. Body ограничен 64 KiB. Malformed JSON/supported update возвращает 400;
   unsupported update, media и group chat — 200 ignored.
7. Добавлен строгий Telegram ingest: private text, `/start` и safe callback;
   Telegram user id валидируется как positive safe integer и сразу становится
   string. Profile, username, raw update и Telegram objects не идут в Runtime.
8. Deep-link grammar ограничена `agent_<routeCode>`: payload не более 64,
   route code не более 32, только lowercase ASCII/digits/hyphen. URL проверяет
   exact expected bot и единственный `start` query.
9. Payload не содержит org/agent. Только server-side resolver преобразует
   `(bot username, route code)` в trusted `orgId/agentId/locale`.
10. P1.4 route-local mapping содержит только
    `agent_demo → org-demo/demo`. Endpoint создаёт локальный registry с
    `demoAgentManifest`; global production registry остаётся пустым.
11. Identity service вызывается с provider `telegram` и provider id string.
    Runtime получает только platform `identityId`, trusted org/agent/locale и
    normalized `text` либо `action`.
12. Добавлен isolated D1 dedup store `telegram_agent_updates` с состояниями
    `reserved|completed|failed` и ключом
    `agents:<bot_username>:<update_id>`.
13. Reserve происходит до Identity/Runtime/send. Duplicate не вызывает Runtime
    и не отправляет второй ответ. Processing/send failure терминален: политика
    at-most-once исключает скрытый повтор после неопределённого send.
14. Долгая обработка запускается через `waitUntil` только после durable reserve.
    Logger принимает только allowlisted safe code, без body/profile/secret.
15. Renderer преобразует channel-neutral Runtime output в plain-text вызовы
    существующего `TelegramClient`, безопасно делит длинный текст, формирует
    callback `agent:<choiceId>` и даёт deterministic RU/UZ fallback.
16. Добавлен guarded setup helper/script: `getMe`, exact expected username,
    запрет `aidirectprobot`/`gptbot_javob_bot`, exact webhook route, обязательный
    secret и dry-run. Скрипт не запускается автоматически и не печатает secrets.
17. Добавлена additive migration `0017_telegram_agents_transport.sql`, но она не
    применялась local или production.
18. Добавлен 41 offline test для HTTP/security/dedup/deep links/identity/
    normalization/rendering/setup и E2E Runtime на RU/UZ/mixed.

## 3. Изменённые файлы
- `functions/api/telegram/agents.ts` — отдельный Pages Function endpoint.
- `functions/channels/telegram/deep-link.ts` — строгий payload/URL parser и
  server-side route resolution.
- `functions/channels/telegram/identity.ts` — Telegram-to-platform identity
  adapter и trusted context resolver.
- `functions/channels/telegram/ingest.ts` — strict update normalization.
- `functions/channels/telegram/render.ts` — outbound text/chunk/choice renderer.
- `functions/channels/telegram/schema.ts` — isolated dedup DDL.
- `functions/channels/telegram/store.ts` — reserve/status D1 store.
- `functions/channels/telegram/webhook.ts` — secure orchestration и at-most-once
  lifecycle.
- `functions/channels/telegram/setup.ts` — guarded setup logic.
- `functions/channels/telegram/index.ts` — channel exports.
- `functions/_types.ts` — отдельные optional Agents env bindings.
- `migrations/0017_telegram_agents_transport.sql` — additive dedup table/index.
- `scripts/telegram-agents-setup.ts` — explicit guarded CLI entrypoint.
- `tests/telegram-agents-webhook.test.ts` — 41 offline tests.
- `docs/agents-platform/{HANDOFF.md,STATE.json,CURRENT_STATE.md,TEST_MATRIX.md,DECISIONS.md}`
  — P1.4 relay и D-014.

## 4. Архитектурные решения
- **D-014:** Telegram Agents — новый изолированный transport, а не расширение
  Javob или lead bot.
- Secret-header проверяется раньше body parsing/D1; config и bot identity
  fail-closed.
- Dedup durable-first и at-most-once. Failed reservation остаётся terminal,
  потому что повтор после возможного успешного Telegram send опаснее пропуска.
- Deep link — только короткий opaque route code; tenant/agent/locale приходят
  исключительно из server-side allowlisted mapping.
- Channel adapter владеет Telegram schema/ids/rendering. Platform Runtime не
  получает Telegram client, update, chat id, callback object, token или secret.
- Production global registry остаётся пустым. Demo подключён только route-local,
  чтобы P1.4 можно было доказать E2E без объявления product behavior.
- Renderer остаётся channel-specific, Runtime output — channel-neutral.
- Setup — отдельное явное действие с identity guard; code commit ничего не
  настраивает и не публикует.
- Durable identity-to-org/storefront mapping сознательно отложен до P2.1.

## 5. Что сознательно не сделано
- Не начат P2.1: нет реального onboarding, storefront, owner binding или
  постоянного Telegram identity-to-org mapping.
- Не начат P2.2: нет catalog, checkout, orders, inventory, seller handoff,
  payment integration или Mini App.
- Demo не зарегистрирован в global production registry.
- Новая migration не применена local/production.
- Setup script, webhook mutation, push и deploy не выполнялись.
- Не изменялись Javob endpoints/store/config/setup и lead bot
  `@aidirectprobot`.
- Не изменялись gpt-chat, SEO, billing, Knowledge/Workflow production behavior.
- Не исправлялись 27 известных legacy Functions errors и global legacy lint.

## 6. Проверки
- До изменений `tsc -b` — exit 0.
- До изменений: Runtime 49/49, Workflow 39/39, Knowledge 33/33, AI 15/15,
  tenancy 31/31, Events 20/20, boundaries 10/10, Telegram compatibility 1/1,
  Telegram assistant 60/60, gpt-chat 15/15.
- После изменений Telegram Agents — 41/41.
- После изменений все прежние suites сохранили те же значения:
  Runtime 49/49, Workflow 39/39, Knowledge 33/33, AI 15/15, tenancy 31/31,
  Events 20/20, boundaries 10/10, Telegram compatibility 1/1,
  Telegram assistant 60/60, gpt-chat 15/15.
- Финальный `tsc -b` — exit 0.
- До и после Functions typecheck — exit 2, ровно 27 legacy errors в тех же
  6 старых файлах; 0 в P1.4 endpoint и `functions/{platform,agents,channels}`.
- Scoped P1.4 ESLint — exit 0.
- Direct boundary checker — 0 violations; suite — 10/10.
- Schema/migration parity, duplicate/terminal-failure и no-second-send покрыты
  тестами.
- Credential/token/private-key/email/phone/Bearer/dynamic-code scans — 0.
  `.env` совпал только как `process.env`; старые env names — только в
  comments/negative assertions.
- `git diff --cached --check` перед code commit — clean.
- На машине с низкой virtual memory проверки выполнялись последовательно через
  `node --jitless` с ограниченным heap; пользовательские процессы не завершались.

## 7. Известные проблемы
- Сохраняются 27 Functions legacy errors в 6 старых файлах, global legacy-red
  ESLint и риск Node OOM; полный список — `KNOWN_ISSUES.md`.
- At-most-once может оставить update в `failed` после ошибки отправки. Это
  намеренная безопасная политика P1.4, но durable recovery/outbox отсутствует.
- Static `agent_demo` route — техническая E2E интеграция, не production
  storefront discovery.
- Реальный пользователь пока не получает durable owner/org context: это P2.1.
- Global production registry пуст, поэтому новые production agents должны
  подключаться только следующим явным этапом.
- Renderer не отправляет `mediaRef`: сохраняется deterministic text-only
  degradation.
- Pre-existing untracked package-lock/audit artifacts намеренно не тронуты.

## 8. Следующая задача
Только **P2.1 — Onboarding магазина**:

1. Создать organization и owner membership через существующий tenancy service.
2. Собрать минимальные поля магазина: имя, язык, условия доставки и оплаты.
3. Выдать безопасный opaque storefront code.
4. Создать durable trusted mapping storefront/Telegram identity → org/agent/
   locale без прямого доверия deep-link payload.
5. Подключить mapping к существующему `/api/telegram/agents`, не смешивая env,
   dedup или setup с Javob/lead bot.

Не начинать P2.2 catalog, checkout, orders, inventory, handoff, payments или
Mini App.

## 9. Acceptance criteria следующего этапа
1. Подтверждены `STATE.next_stage == "P2.1"`, P1.4 code/relay ancestry,
   исходный tree и два pre-existing untracked объекта.
2. Organization + owner membership создаются атомарно существующим tenancy
   слоем; cross-tenant reads/writes маскируются/отклоняются.
3. Onboarding строго валидирует name/language/delivery/payment и не сохраняет
   Telegram profile/raw update как бизнес-данные.
4. Storefront code opaque, bounded, collision-safe и не кодирует orgId/agentId.
5. Deep link не может напрямую подменить org/agent; mapping берётся из D1 после
   tenant-scoped проверки.
6. Identity-to-org binding durable, idempotent и не позволяет одной Telegram
   identity получить чужой tenant context.
7. `/api/telegram/agents`, его `TELEGRAM_AGENTS_*`, dedup namespace и setup
   остаются отдельными от Javob и `aidirectprobot`.
8. P1.4 Telegram Agents 41/41 и все прежние baseline suites не уменьшаются.
9. Functions остаётся ровно 27 legacy errors и 0 в platform/agents/channels/
   новом P2.1 scope; scoped lint, boundary и secret/PII scans зелёные.
10. P2.2 catalog/checkout/orders не добавлены; migration/setup/push/deploy не
    выполняются без отдельной явной команды владельца.

## 10. Команды для старта
```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ARCHITECTURE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ROADMAP.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\CURRENT_STATE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\TEST_MATRIX.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\KNOWN_ISSUES.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\DECISIONS.md
git status --short
git branch --show-current
git rev-parse HEAD
git log -12 --oneline
git diff
node --jitless --max-old-space-size=384 --max-semi-space-size=2 node_modules\typescript\bin\tsc -b
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/telegram-agents-webhook.test.ts
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/platform-runtime.test.ts
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/platform-workflow.test.ts
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/platform-knowledge.test.ts
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/platform-ai.test.ts
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/platform-tenancy.test.ts
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/platform-events.test.ts
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/agent-boundaries.test.ts
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/telegram-channel-compat.test.ts
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/telegram-assistant.test.ts
node --jitless --max-old-space-size=192 --max-semi-space-size=2 --import tsx --test tests/gpt-chat.test.ts
npx tsc -p tsconfig.functions.json --noEmit
```

## 11. Риски
- Не принимать orgId/agentId/locale из deep-link payload или Telegram profile.
- Не создавать параллельные identity/tenancy contracts вместо существующих
  platform services.
- Не передавать raw update, chat id, token, secret или D1 handle в Runtime,
  manifest, rules и tools.
- Не менять at-most-once семантику без отдельного durable outbox/recovery design.
- Не импортировать channel/API/demo в platform runtime и не регистрировать demo
  глобально как production product.
- Не смешивать Agents env, webhook, dedup table/key и setup с Javob/lead bot.
- Не запускать setup до `getMe`/exact username/protected-bot guard.
- Не применять migration и не push/deploy без отдельной явной команды владельца.

## 12. Rollback
1. Если relay commit создан, сначала `git revert <P1.4-relay-SHA>`.
2. Затем `git revert 539525410f086ef1c705c221950b29d808982899`.
3. Migration P1.4 не применялась, поэтому текущему production schema rollback не
   нужен.
4. Если migration когда-либо была применена отдельно, сначала отключить новый
   endpoint, затем отдельным согласованным ops change удалить только index/table
   `telegram_agent_updates`; не затрагивать legacy `telegram_updates`.
5. Revert не должен затрагивать P1.3 commits, два pre-existing untracked объекта,
   Javob/lead bot или unrelated production history.
