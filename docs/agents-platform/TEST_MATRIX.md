# TEST_MATRIX — обязательный baseline GPTBot Agents Platform

## Исходный baseline P0.0 (2026-07-17, HEAD `5bf3d56`)

| Проверка | Результат |
|---|---|
| `npx tsc -b` | exit 0 |
| Legacy tests file-by-file | 143 pass / 0 fail |
| `npx vite build` | exit 0 |
| `npx tsx scripts/javob-eval.ts` | exit 0, 60 cases sound |
| `npx eslint .` | legacy-red: 84 problems (71 errors, 13 warnings) |

Исходные 143 теста: gpt-chat 15, telegram-assistant 60, intent-guard 16,
direct-generator 13, indexnow-engine 11, yandex-research 11, gpt-backend 17.
Глобальный ESLint — известный legacy-долг; новые файлы каждого этапа обязаны
давать scoped ESLint exit 0. На машине владельца тесты запускаются file-by-file
из-за OOM-риска.

## Добавленные platform suites

| Этап | Файл | Кол-во | Что покрывает |
|---|---|---:|---|
| P0.1 | `tests/agent-boundaries.test.ts` | 10 | import/handler boundaries, negative fixtures, registry |
| P0.2 | `tests/telegram-channel-compat.test.ts` | 1 | legacy shim и channel path имеют совместимую runtime/type surface |
| P0.3 | `tests/platform-events.test.ts` | 20 | ordered bus, durable append/idempotency, PII guard, Javob bridge |
| P0.4 | `tests/platform-tenancy.test.ts` | 31 | identities/orgs/memberships/contacts, atomic owner setup, negative tenant isolation |
| P0.5 | `tests/platform-ai.test.ts` | 15 | provider-neutral AI façade, policy/fallback, strict structured output, controlled failures |
| P1.1 | `tests/platform-knowledge.test.ts` | 33 | generic collections/items, payload projections, search/ranking, versions, tenant isolation |
| P1.2 | `tests/platform-workflow.test.ts` | 39 | schema bootstrap; definition/payload validation; create/transition/history; idempotency; optimistic version conflict; guards/actions; terminal/cancel; restart persistence; corrupt JSON; negative tenant isolation |
| P1.3 | `tests/platform-runtime.test.ts` | 49 | manifest/registry validation; deterministic-first routing; closed-list AI/tool execution; Facts/grounding; workflow port; demo RU/UZ/mixed; tenant isolation; content-free failures |
| P1.4 | `tests/telegram-agents-webhook.test.ts` | 41 | methods/secret/body security; isolated D1 dedup; strict deep links; identity/context normalization; renderer; offline Runtime E2E RU/UZ/mixed; tenant/setup guards |
| P2.1 | `tests/sotuvchi-onboarding.test.ts` | 28 | store validation; migration/bootstrap parity; persistent FSM; organization/owner/store/route linkage; opaque collision-safe codes; duplicate/restart; tenant isolation; Telegram seller RU/UZ/mixed and buyer route separation |
| P2.2 | `tests/sotuvchi-catalog.test.ts` | 54 | category/product validation; migration/bootstrap parity; integer UZS; lifecycle; optimistic version/idempotency; deterministic RU/UZ/mixed search; Facts/grounding; tenant negatives; offline Telegram seller/storefront |
| P2.3 | `tests/sotuvchi-buyer-qa.test.ts` | 39 | closed RU/UZ/mixed intents; extraction/price filter; channel-neutral cards; strict card grounding; session follow-up/idempotency; tenant negatives; offline Telegram buyer E2E |
| P2.4 | `tests/sotuvchi-checkout.test.ts` | 36 | quantity/name/phone/address validation; migration+bootstrap parity; persistent FSM and restart; product eligibility and price revalidation; atomic single-item order; idempotency and fingerprint conflict; tenant negatives; PII-minimal Facts/grounding; offline Telegram RU/UZ checkout |
| P2.5 | `tests/sotuvchi-orders-inventory.test.ts` | 37 | stock validation; status-pair derivation and transition table; migration+bootstrap parity; inventory persistence, movements, version conflicts and idempotency; seller list/detail PII separation; atomic confirm with single decrement; insufficient/missing stock fail-closed; unavailable and preorder policy; cancel/done/invalid transitions; notification intents and failure independence; Facts/grounding RU/UZ; tenant negatives; offline Telegram RU/UZ seller flow; no payment/multi-item |
| P2.7 | `tests/sotuvchi-pilot-readiness.test.ts` | 36 | closed event catalogue; scalar-only payload; buyer text/contact/injection rejection; unknown event name refused; trusted org+request required; duplicate append once; cross-tenant event isolation; analytics failure never repeats the domain call; funnel derived from Facts only; `/stats` owner-only with buyer/foreign/disabled/other-identity negatives; spoofed store, org and window fail closed; empty state; exact counts vs domain tables; seven-day window boundary; funnel kept apart; repeat-safe; RU/UZ rendering with grounding and no PII; unsupported number rejected; command and action routing; RU/UZ landing pair, canonical, hreflang, sitemap eligibility, inbound links, CTA safety, bot-identity guard, no unsafe or fabricated claim; pilot check read-only, no secret output, fails closed, migration order 0013–0023, no new migration; setup never calls setWebhook without an explicit apply; runbook and checklist exist, keep blockers visible and carry no credential material |
| P2.6 | `tests/sotuvchi-handoff.test.ts` | 40 | channel address bind/update/revoke per bot namespace and namespace isolation; bounded content RU/UZ; retention deadline, content clearing and unanswerable expiry; one open handoff per buyer session; escalation replay; content-free operation log; queue/detail PII separation and tenant negatives; durable unique reply target; repeated reply press; expired target; exactly one final reply, replay and concurrent-answer race; foreign seller negatives; close once and immutability; strict grounding RU/UZ with seller authorship marker; seller notice without question text; push once, buyer answer, failed delivery retry and missing address; P2.5 order intents through the same path; migration/bootstrap parity; offline Telegram RU/UZ E2E; no auto-escalation; no CRM/payment/attachment |
| R0.2 | `tests/gpt-backend-security.test.ts` | 30 | реальное приложение через `app.inject()` без сети; internal gateway secret (отсутствует / неверный / валидный / повторный); отсутствие секрета в ответах, заголовках и логах; malformed JSON и schema-invalid body; отклонение лишних свойств вместо доверия им как authority; body limit 413; неподдерживаемый content-type 415; tab-padded content-type (`GHSA-jx2c-rxcm-jvmq`); prototype poisoning `__proto__`/`constructor`; подменённые X-Forwarded-Host/Proto и произвольный Host не дают авторизации; запрещённый Origin 403; encoded/traversal/null-byte пути не доходят до handler; provider error без stack и секретов; отсутствие provider egress и store-мутации при отказе; health presence-only; ping boundary; отдельный admin guard на analytics и cleanup; неизменённый session/history/feedback контракт; DELETE с пустым JSON-телом доходит до auth guard (регрессия Fastify 5) |

## Post-change baseline R0.2

| Проверка | Команда | Результат |
|---|---|---|
| R0.2 backend security | `node --import tsx --test tests/gpt-backend-security.test.ts` | 30/30 |
| Railway GPT backend | `node --import tsx --test tests/gpt-backend.test.ts` | 18/18 |
| R0.1 web security | `node --import tsx --test tests/web-security-hardening.test.ts` | 13/13 |
| Required Agents baseline | file-by-file по списку P2.7 ниже | 584/584 |
| Full repository | все `tests/*.test.ts` file-by-file | **706/706, 27 suites** |
| App typecheck | `npx tsc -b` | exit 0 |
| Production build | `corepack yarn build` | exit 0; SEO gate пройден; sitemap 207 (106 pages + 98 articles) |
| Railway backend | `npm --prefix apps/gpt-backend run typecheck` + `build` | exit 0 |
| Clean install | `npm ci --ignore-scripts` в директории вне репозитория + typecheck + build | exit 0 / exit 0 / exit 0; `dist/server.js` создан |
| Backend audit | `npm audit --omit=dev` в `apps/gpt-backend` | **0 findings** (было 6 High / 0 Critical) |
| Dependency tree | `npm ls fastify @fastify/ajv-compiler @fastify/fast-json-stringify-compiler fast-json-stringify fast-uri find-my-way` | exit 0; fastify 5.10.0, ajv-compiler 4.0.5, fjs-compiler 5.1.0, fast-json-stringify 7.0.1, fast-uri 3.1.4/4.1.1, find-my-way 9.7.0 |
| Functions typecheck | `npx tsc -p tsconfig.functions.json --noEmit` | exit 2; ровно 27 прежних errors в тех же 6 legacy files; 0 новых |
| R0.2 scoped lint | `npx eslint apps/gpt-backend/src/app.ts apps/gpt-backend/src/server.ts tests/gpt-backend-security.test.ts tests/gpt-backend.test.ts` | exit 0 |
| Boundary gate | test + direct checker | 10/10; 0 violations |
| Whitespace gate | `git diff --cached --check` | exit 0 |
| Staged secret scan | staged diff по token/key/JWT/private-key паттернам | 0 совпадений |

Post-sync baseline после merge `8f42081` (до изменений R0.2) совпал с R0.1
ровно: 676/676 по 26 suites. R0.2 добавляет 30 backend security regressions,
поэтому полный total вырос с 676 до **706/706**. Обязательный Agents baseline
не изменился и остаётся **584/584**. Ни одно прежнее число не уменьшилось.

Запускать backend security suite отдельным процессом: он поднимает реальное
Fastify-приложение, поэтому требует установленных зависимостей в
`apps/gpt-backend/node_modules` (в отличие от `tests/gpt-backend.test.ts`,
который импортирует только чистые модули с type-only зависимостями).

## Post-change baseline R0.1

| Проверка | Команда | Результат |
|---|---|---|
| R0.1 web security | `npm run test:web-security` | 13/13 |
| Railway GPT backend | `npm run test:gpt-backend` | 18/18 |
| Required Agents baseline | file-by-file по списку P2.7 ниже | 584/584 |
| Full repository | все `tests/*.test.ts` file-by-file | 676/676, 26 suites |
| App typecheck | `npx tsc -b` | exit 0 |
| Production build | `npm run build` | exit 0; SEO gate 0 critical, 105 published, sitemap 198 |
| Railway backend | `npm --prefix apps/gpt-backend run typecheck` + `build` | exit 0 |
| Functions typecheck | `npx tsc -p tsconfig.functions.json --noEmit` | exit 2; ровно 27 прежних errors в тех же 6 legacy files; 0 в изменённых/platform/agents/channels |
| R0.1 scoped lint | changed R0.1 TypeScript/TSX files | exit 0 |
| Boundary gate | test + direct checker | 10/10; 0 violations |
| Dependency state | root production audit | Router 7.18.1; только RSC-only `GHSA-qwww-vcr4-c8h2` (current app has no RSC) |
| Staged security review | code-review + security-guidance + credential scan | approved; 0 real credential patterns |

Обязательный Agents baseline не изменился и остаётся **584/584**. R0.1 добавляет
13 security regressions и один backend regression, поэтому полный total вырос с
662 до **676/676**.

## Post-change baseline P2.7

| Проверка | Команда | Результат |
|---|---|---|
| App typecheck | `npx tsc -b` | exit 0 |
| Production build | `npm run build` | exit 0; `dist/{ru,uz}/sotuvchi/index.html` созданы, обе в `sitemap.xml` |
| SEO gate | `npx tsx scripts/seo-audit.ts` | 0 critical; 105 published; orphan 0 |
| Sotuvchi pilot readiness | `node --import tsx --test tests/sotuvchi-pilot-readiness.test.ts` | 36/36 |
| Sotuvchi handoff | `node --import tsx --test tests/sotuvchi-handoff.test.ts` | 40/40 |
| Sotuvchi orders/inventory | `node --import tsx --test tests/sotuvchi-orders-inventory.test.ts` | 37/37 |
| Sotuvchi checkout | `node --import tsx --test tests/sotuvchi-checkout.test.ts` | 36/36 |
| Sotuvchi Buyer Q&A | `node --import tsx --test tests/sotuvchi-buyer-qa.test.ts` | 39/39 |
| Sotuvchi catalog | `node --import tsx --test tests/sotuvchi-catalog.test.ts` | 54/54 |
| Sotuvchi onboarding | `node --import tsx --test tests/sotuvchi-onboarding.test.ts` | 28/28 |
| Telegram Agents | `node --import tsx --test tests/telegram-agents-webhook.test.ts` | 41/41 |
| Agent Runtime | `node --import tsx --test tests/platform-runtime.test.ts` | 49/49 |
| Workflow | `node --import tsx --test tests/platform-workflow.test.ts` | 39/39 |
| Knowledge | `node --import tsx --test tests/platform-knowledge.test.ts` | 33/33 |
| AI | `node --import tsx --test tests/platform-ai.test.ts` | 15/15 |
| Tenancy | `node --import tsx --test tests/platform-tenancy.test.ts` | 31/31 |
| Events | `node --import tsx --test tests/platform-events.test.ts` | 20/20 |
| Boundaries | `node --import tsx --test tests/agent-boundaries.test.ts` | 10/10 |
| Telegram compatibility | `node --import tsx --test tests/telegram-channel-compat.test.ts` | 1/1 |
| Telegram assistant | `node --import tsx --test tests/telegram-assistant.test.ts` | 60/60 |
| Web gpt-chat | `node --import tsx --test tests/gpt-chat.test.ts` | 15/15 |
| Functions typecheck | `npx tsc -p tsconfig.functions.json --noEmit` | exit 2; exactly 27 legacy errors in 6 old files; 0 in platform/agents/channels |
| P2.7 scoped lint | `npx eslint functions/agents/sotuvchi functions/platform/events functions/api/telegram/agents.ts src/shared/sotuvchi-config.ts scripts/sotuvchi-pilot-check.ts tests/sotuvchi-pilot-readiness.test.ts` | exit 0 |
| Pilot check | `npx tsx scripts/sotuvchi-pilot-check.ts` | `blocked` (bot и env ещё не заданы); сетевых вызовов нет |
| Boundary gate | `node --import tsx --test tests/agent-boundaries.test.ts` | 10/10; checker reports 0 violations |

Обязательный post-P2.7 regression total: **584/584**.
Полный repository total (25 suites): **662/662**.

## P2.7 static verification

- P2.7 не добавляет migration: события пишутся в существующую `events`
  (migration `0013`), отчёт читает уже существующие domain-таблицы.
- Каталог событий закрыт четырьмя именами; тест проверяет, что ни одно из них
  не дублирует lifecycle-переход заказа, остатка или handoff.
- Payload события — closed-list токены, boolean и bounded счётчики; вопрос
  покупателя, номер телефона, SQL-подобная строка и слишком длинное значение
  отклоняются, а таблица `events` при этом остаётся пустой.
- Idempotency key — trusted channel `requestId`; повторный вызов даёт
  `duplicate` и ровно одну строку.
- Тест с падающим recorder подтверждает: доменный вызов выполняется ровно один
  раз и не повторяется, событие не появляется.
- `countEventsByType` всегда содержит предикат `org_id`: события одного org не
  видны другому.
- `/stats` отклоняет покупателя, чужого владельца, отключённое membership,
  другую identity в том же чате, а также любой параметр в tool input.
- Точные счётчики сверены с фактическим содержимым БД; окно 7 дней проверено
  сдвигом строк за границу.
- RU и UZ отчёты проходят strict grounding; подделанное число отклоняется;
  в тексте нет имени, телефона, адреса, названия товара, org и store id.
- Landing pages: взаимный canonical/hreflang, попадание в sitemap, входящие
  внутренние ссылки, CTA не ведёт на lead/Javob-бот, отсутствие небезопасных и
  выдуманных утверждений, наличие явного отказа от аффилиации.
- `scripts/sotuvchi-pilot-check.ts` не печатает значения секретов, fail-closed
  на пустой конфигурации, перечисляет `0013–0023` по возрастанию.
- `telegram-agents-setup.ts setup --dry-run` вызывает `getMe` и никогда
  `setWebhook`; token в URL логов не появляется.
- Runbook и checklist существуют, содержат имена env без значений, не имеют
  ни одного отмеченного пункта и не заявляют production ready.

## Post-change baseline P2.6

| Проверка | Команда | Результат |
|---|---|---|
| App typecheck | `npx tsc -b` | exit 0 |
| Sotuvchi handoff | `node --import tsx --test tests/sotuvchi-handoff.test.ts` | 40/40 |
| Sotuvchi orders/inventory | `node --import tsx --test tests/sotuvchi-orders-inventory.test.ts` | 37/37 |
| Sotuvchi checkout | `node --import tsx --test tests/sotuvchi-checkout.test.ts` | 36/36 |
| Sotuvchi Buyer Q&A | `node --import tsx --test tests/sotuvchi-buyer-qa.test.ts` | 39/39 |
| Sotuvchi catalog | `node --import tsx --test tests/sotuvchi-catalog.test.ts` | 54/54 |
| Sotuvchi onboarding | `node --import tsx --test tests/sotuvchi-onboarding.test.ts` | 28/28 |
| Telegram Agents | `node --import tsx --test tests/telegram-agents-webhook.test.ts` | 41/41 |
| Agent Runtime | `node --import tsx --test tests/platform-runtime.test.ts` | 49/49 |
| Workflow | `node --import tsx --test tests/platform-workflow.test.ts` | 39/39 |
| Knowledge | `node --import tsx --test tests/platform-knowledge.test.ts` | 33/33 |
| AI | `node --import tsx --test tests/platform-ai.test.ts` | 15/15 |
| Tenancy | `node --import tsx --test tests/platform-tenancy.test.ts` | 31/31 |
| Events | `node --import tsx --test tests/platform-events.test.ts` | 20/20 |
| Boundaries | `node --import tsx --test tests/agent-boundaries.test.ts` | 10/10 |
| Telegram compatibility | `node --import tsx --test tests/telegram-channel-compat.test.ts` | 1/1 |
| Telegram assistant | `node --import tsx --test tests/telegram-assistant.test.ts` | 60/60 |
| Web gpt-chat | `node --import tsx --test tests/gpt-chat.test.ts` | 15/15 |
| Functions typecheck | `npx tsc -p tsconfig.functions.json --noEmit` | exit 2; exactly 27 legacy errors in 6 old files; 0 in platform/agents/channels |
| P2.6 scoped lint | `npx eslint functions/agents/sotuvchi functions/platform/channels functions/channels/telegram functions/api/telegram/agents.ts tests/sotuvchi-handoff.test.ts tests/sotuvchi-orders-inventory.test.ts tests/sotuvchi-catalog.test.ts tests/sotuvchi-onboarding.test.ts` | exit 0 |
| Boundary gate | `node --import tsx --test tests/agent-boundaries.test.ts` | 10/10; checker reports 0 violations |

Обязательный post-P2.6 regression total: **548/548**.
Полный repository total (24 suites): **626/626**.

## P2.6 static verification

- Migration/bootstrap `0023` создают `channel_addresses`,
  `sotuvchi_handoffs`, `sotuvchi_handoff_operations`,
  `sotuvchi_seller_reply_sessions` и пять индексов; repeated bootstrap,
  отсутствие destructive SQL и отсутствие transcript/attachment/profile/chat-id
  columns подтверждены actual SQLite.
- Partial unique `idx_sotuvchi_handoffs_active (buyer_session_id) WHERE status
  IN ('open','answered')` делает вторую живую переписку одной buyer-сессии
  невозможной на уровне хранилища.
- `question_text`/`reply_text` bounded CHECK ≤1000; после `expires_at` оба
  читаются как null, статус `expired`, ответ невозможен, строка сохраняется как
  метаданные.
- Reply target durable: `workflow_instances` плюс store-scoped
  `sotuvchi_seller_reply_sessions` с TTL 24 часа; `request_key` guard делает
  повторное нажатие «Ответить» no-op.
- Replay ответа проверяется раньше состояния сессии, поэтому повторный
  Telegram update возвращает сохранённый ответ вместо `no_reply_session`.
- Conditional answer UPDATE требует `status='open'`, `reply_text IS NULL`,
  совпадения `version`, непросроченности и owner membership: второй ответ и
  ответ, проигравший гонку, отклоняются и ничего не перезаписывают.
- Delivery claim — сам conditional UPDATE `seller_notified_at` /
  `buyer_delivered_at`; тест подтверждает один push, retry без второго
  доменного изменения и сохранение ответа при отказе доставки.
- Pushed-сообщения проходят тот же strict grounding, что и turn-ответы; ответ
  покупателю всегда содержит маркер авторства продавца.
- Seller notice и queue не содержат текст вопроса; тест сканирует
  handoff/notification/address строки на контакты — 0 совпадений.
- Boundary checker: 0 violations; handoff/delivery не импортируют
  channel/Telegram/legacy paths, Platform не импортирует Sotuvchi.
- Credential/private-key/token/email/phone scans staged diff: 0;
  `memory/test_credentials.md` в staged changes отсутствует.
- Migrations `0018/0019/0020/0021/0022/0023` не применялись local/production;
  setup script, push и deploy не запускались.

## Post-change baseline P2.5

| Проверка | Команда | Результат |
|---|---|---|
| App typecheck | `npx tsc -b` | exit 0 |
| Sotuvchi orders/inventory | `node --import tsx --test tests/sotuvchi-orders-inventory.test.ts` | 37/37 |
| Sotuvchi checkout | `node --import tsx --test tests/sotuvchi-checkout.test.ts` | 36/36 |
| Sotuvchi Buyer Q&A | `node --import tsx --test tests/sotuvchi-buyer-qa.test.ts` | 39/39 |
| Sotuvchi catalog | `node --import tsx --test tests/sotuvchi-catalog.test.ts` | 54/54 |
| Sotuvchi onboarding | `node --import tsx --test tests/sotuvchi-onboarding.test.ts` | 28/28 |
| Telegram Agents | `node --import tsx --test tests/telegram-agents-webhook.test.ts` | 41/41 |
| Agent Runtime | `node --import tsx --test tests/platform-runtime.test.ts` | 49/49 |
| Workflow | `node --import tsx --test tests/platform-workflow.test.ts` | 39/39 |
| Knowledge | `node --import tsx --test tests/platform-knowledge.test.ts` | 33/33 |
| AI | `node --import tsx --test tests/platform-ai.test.ts` | 15/15 |
| Tenancy | `node --import tsx --test tests/platform-tenancy.test.ts` | 31/31 |
| Events | `node --import tsx --test tests/platform-events.test.ts` | 20/20 |
| Boundaries | `node --import tsx --test tests/agent-boundaries.test.ts` | 10/10 |
| Telegram compatibility | `node --import tsx --test tests/telegram-channel-compat.test.ts` | 1/1 |
| Telegram assistant | `node --import tsx --test tests/telegram-assistant.test.ts` | 60/60 |
| Web gpt-chat | `node --import tsx --test tests/gpt-chat.test.ts` | 15/15 |
| Functions typecheck | `npx tsc -p tsconfig.functions.json --noEmit` | exit 2; exactly 27 legacy errors in 6 old files; 0 in platform/agents/channels |
| P2.5 scoped lint | `npx eslint functions/agents/sotuvchi functions/api/telegram/agents.ts functions/channels/telegram tests/sotuvchi-orders-inventory.test.ts tests/sotuvchi-onboarding.test.ts tests/sotuvchi-catalog.test.ts tests/sotuvchi-checkout.test.ts` | exit 0 |
| Boundary gate | `node --import tsx --test tests/agent-boundaries.test.ts` | 10/10; checker reports 0 violations |

Обязательный post-P2.5 regression total: **508/508**.
Полный repository total (23 suites): **586/586**.

## P2.5 static verification

- Migration/bootstrap `0022` создают `sotuvchi_inventory`,
  `sotuvchi_inventory_moves`, `sotuvchi_notifications` и additive колонку
  `sotuvchi_orders.fulfillment_status`; repeated bootstrap, отсутствие
  destructive SQL и отсутствие payload/PII columns подтверждены actual
  SQLite.
- `idx_sotuvchi_inventory_moves_order_type` (partial UNIQUE
  `(order_id, type)`) делает второе списание по заказу невозможным на уровне
  хранилища; conditional `fulfillment_status = 'none'` и conditional
  inventory `version` дублируют защиту на уровне SQL.
- Confirm выполняется одним D1 batch, в котором guard'ы вложены так, что все
  statements применяются вместе либо не применяются вовсе: `confirmed` без
  движения и движение без `confirmed` недостижимы.
- `available` без строки баланса fail-closed; `preorder` подтверждается без
  движения; `unavailable` подтвердить нельзя; `available` не считается
  бесконечным остатком.
- `confirmed → cancelled` запрещён, поэтому compensation-движений нет.
- Notification row не содержит payload; тест сканирует таблицу на имя,
  телефон, адрес и название товара — 0 совпадений. Failed delivery не
  откатывает доменное состояние.
- Seller list не содержит контактов; detail отдаёт их только владельцу.
  Покупатель и анонимный actor получают authorization error.
- Facts scalar-only; RU и UZ ответы для списка, детали, перехода и остатков
  проходят strict grounding; unsupported число и unsupported claim
  отклоняются.
- Boundary checker: 0 violations; orders/inventory/outbox не импортируют
  channel/Telegram/legacy paths, Platform не импортирует Sotuvchi.
- Credential/private-key/token/email scans staged diff: 0;
  `memory/test_credentials.md` в staged changes отсутствует.
- Migrations `0018/0019/0020/0021/0022` не применялись local/production;
  setup script, push и deploy не запускались.

## Post-change baseline P2.4

| Проверка | Команда | Результат |
|---|---|---|
| App typecheck | `npx tsc -b` | exit 0 |
| Sotuvchi checkout | `node --import tsx --test tests/sotuvchi-checkout.test.ts` | 36/36 |
| Sotuvchi Buyer Q&A | `node --import tsx --test tests/sotuvchi-buyer-qa.test.ts` | 39/39 |
| Sotuvchi catalog | `node --import tsx --test tests/sotuvchi-catalog.test.ts` | 54/54 |
| Sotuvchi onboarding | `node --import tsx --test tests/sotuvchi-onboarding.test.ts` | 28/28 |
| Telegram Agents | `node --import tsx --test tests/telegram-agents-webhook.test.ts` | 41/41 |
| Agent Runtime | `node --import tsx --test tests/platform-runtime.test.ts` | 49/49 |
| Workflow | `node --import tsx --test tests/platform-workflow.test.ts` | 39/39 |
| Knowledge | `node --import tsx --test tests/platform-knowledge.test.ts` | 33/33 |
| AI | `node --import tsx --test tests/platform-ai.test.ts` | 15/15 |
| Tenancy | `node --import tsx --test tests/platform-tenancy.test.ts` | 31/31 |
| Events | `node --import tsx --test tests/platform-events.test.ts` | 20/20 |
| Boundaries | `node --import tsx --test tests/agent-boundaries.test.ts` | 10/10 |
| Telegram compatibility | `node --import tsx --test tests/telegram-channel-compat.test.ts` | 1/1 |
| Telegram assistant | `node --import tsx --test tests/telegram-assistant.test.ts` | 60/60 |
| Web gpt-chat | `node --import tsx --test tests/gpt-chat.test.ts` | 15/15 |
| Functions typecheck | `npx tsc -p tsconfig.functions.json --noEmit` | exit 2; exactly 27 legacy errors in 6 old files; 0 in platform/agents/channels |
| P2.4 scoped lint | `npx eslint functions/agents/sotuvchi functions/api/telegram/agents.ts functions/channels/telegram functions/platform/contracts functions/platform/runtime tests/sotuvchi-checkout.test.ts` | exit 0 |
| Boundary gate | `node --import tsx --test tests/agent-boundaries.test.ts` + `npx tsx scripts/check-agent-boundaries.ts` | 10/10; checker reports 0 violations |

Обязательный post-P2.4 regression total: **471/471**.
Полный repository total (21 + 1 suites): **549/549**.

## P2.4 static verification

- Migration/bootstrap `0021` создают `sotuvchi_orders`,
  `sotuvchi_order_items`, `sotuvchi_order_operations` и пять индексов;
  repeated bootstrap, отсутствие destructive SQL и отсутствие
  message/transcript columns подтверждены actual SQLite.
- `idx_sotuvchi_order_items_single` делает второй item в заказе невозможным;
  `idx_sotuvchi_orders_active_draft` — один активный draft на buyer session.
- Placement выполняется одним conditional UPDATE + operation insert в D1 batch
  и повторно проверяет published product, active store/category, availability
  и текущую цену.
- Price change перед подтверждением обновляет snapshot и требует второго
  явного подтверждения; заказ остаётся draft.
- Idempotency key канала проверяется раньше FSM-состояния; duplicate confirm
  даёт один placed order и один order number, чужой fingerprint fail-closed.
- Facts scalar-only: имя и адрес не эхо-показываются, телефон только masked;
  workflow payload содержит только `{ orderId }`.
- Boundary checker: 0 violations; checkout не импортирует channel/Telegram/
  legacy paths, Platform не импортирует Sotuvchi.
- Credential/private-key/token/email/env/real-phone scans staged diff: 0;
  `memory/test_credentials.md` в staged changes отсутствует.
- Migrations `0018/0019/0020/0021` не применялись local/production; setup
  script, push и deploy не запускались.

## P2.3 static verification

- Migration/bootstrap `0020` добавляют четыре nullable session columns;
  repeated bootstrap и отсутствие destructive SQL подтверждены actual SQLite.
- Parser использует public Knowledge normalization, closed intents и bounded
  extraction; AI disabled.
- Price filter видит только published same-store rows и стабильно сортирует
  price/name/opaque ID.
- Card title/description/field values обязаны присутствовать в scalar Facts;
  unsupported price/status/number tests fail grounding.
- Follow-up сохраняет только opaque product/intent/request/timestamp,
  идемпотентен и повторно проверяет tenant/store/publication/category.
- Boundary checker: 0 violations; buyer не импортирует channel/Telegram/
  legacy/Javob/lead paths, Platform не импортирует Sotuvchi.
- Credential/private-key/token/email/phone/env/known-real-ID scans staged diff:
  0.
- Migrations `0018/0019/0020` не применялись local/production; setup script, push и
  deploy не запускались.

## Правило следующего этапа
Следующий этап не имеет права уменьшить ни одно число выше. Functions gate
допускает только те же 27 известных legacy errors и требует 0 ошибок в
`functions/{platform,agents,channels}`. Новые/изменённые файлы должны иметь
scoped ESLint exit 0; direct boundary checker и все suites выше остаются
зелёными. Поскольку в репозитории теперь есть публичные страницы Sotuvchi,
любое изменение `content/` дополнительно обязано проходить
`npx tsx scripts/seo-audit.ts` без critical issues.
