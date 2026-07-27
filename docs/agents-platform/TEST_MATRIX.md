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

## Post-change baseline P1.4

| Проверка | Команда | Результат |
|---|---|---|
| App typecheck | `npx tsc -b` | exit 0 |
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
| P1.4 scoped lint | `node --jitless --max-old-space-size=384 --max-semi-space-size=2 node_modules/eslint/bin/eslint.js functions/api/telegram/agents.ts functions/channels/telegram/deep-link.ts functions/channels/telegram/identity.ts functions/channels/telegram/ingest.ts functions/channels/telegram/render.ts functions/channels/telegram/schema.ts functions/channels/telegram/setup.ts functions/channels/telegram/store.ts functions/channels/telegram/webhook.ts functions/channels/telegram/index.ts functions/_types.ts scripts/telegram-agents-setup.ts tests/telegram-agents-webhook.test.ts` | exit 0 |
| Boundary gate | `node --import tsx --test tests/agent-boundaries.test.ts` | 10/10, current tree has 0 violations |

## P1.4 static verification
- Runtime `telegram_agent_updates` DDL и migration содержат одинаковые table/
  index names; store test подтверждает reserve/duplicate/completed/failed.
- Boundary checker: 0 violations; platform/runtime не менялся и не импортирует
  channel/API/demo.
- Existing `functions/api/telegram/{assistant,webhook}.ts`,
  `functions/lib/telegram/**` и старый setup script не входят в code diff.
- Credential/token/private-key/email/phone/dynamic-code scans: 0.
  `.env` и старые env names совпали только как `process.env`,
  comments/negative assertions.
- Migration не применялась local/production; setup script, push и deploy не
  запускались.

## Правило следующего этапа
P2.1 не имеет права уменьшить ни одно число выше. Functions gate допускает только
те же 27 известных legacy errors и требует 0 ошибок в
`functions/{platform,agents,channels}`. Новые/изменённые P2.1 файлы должны иметь
scoped ESLint exit 0; direct boundary checker и все suites выше остаются зелёными.
