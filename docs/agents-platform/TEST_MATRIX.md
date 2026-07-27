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
| P2.5 | `tests/sotuvchi-orders-inventory.test.ts` | 37 | stock validation; status-pair derivation and transition table; migration+bootstrap parity; inventory persistence, movements, version conflicts and idempotency; seller list/detail PII separation; atomic confirm with single decrement; insufficient/missing stock fail-closed; unavailable and preorder policy; cancel/done/invalid transitions; notification intents and failure independence; Facts/grounding RU/UZ; tenant negatives; offline Telegram RU/UZ seller flow; no payment/handoff/multi-item |

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
P2.6 не имеет права уменьшить ни одно число выше. Functions gate допускает только
те же 27 известных legacy errors и требует 0 ошибок в
`functions/{platform,agents,channels}`. Новые/изменённые P2.6 файлы должны иметь
scoped ESLint exit 0; direct boundary checker и все suites выше остаются зелёными.
