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

## Post-change baseline P2.3

| Проверка | Команда | Результат |
|---|---|---|
| App typecheck | `npx tsc -b` | exit 0 |
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
| P2.3 scoped lint | `npx eslint functions/agents/sotuvchi functions/api/telegram/agents.ts functions/channels/telegram tests/sotuvchi-buyer-qa.test.ts` | exit 0 |
| Boundary gate | `node --import tsx --test tests/agent-boundaries.test.ts` | 10/10, current tree has 0 violations |

Обязательный post-P2.3 regression total: **435/435**.

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
P2.4 не имеет права уменьшить ни одно число выше. Functions gate допускает только
те же 27 известных legacy errors и требует 0 ошибок в
`functions/{platform,agents,channels}`. Новые/изменённые P2.4 файлы должны иметь
scoped ESLint exit 0; direct boundary checker и все suites выше остаются зелёными.
