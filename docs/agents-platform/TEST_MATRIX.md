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

## Post-change baseline P1.2

| Проверка | Команда | Результат |
|---|---|---|
| App typecheck | `npx tsc -b` | exit 0 |
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
| P1.2 lint | `npx eslint functions/platform/contracts/workflow.ts functions/platform/contracts/index.ts functions/platform/index.ts functions/platform/workflow/*.ts tests/platform-workflow.test.ts` | exit 0 |
| Direct boundary gate | `npx tsx scripts/check-agent-boundaries.ts` | exit 0, no violations |

## P1.2 D1 и static verification
- `0016_platform_workflow.sql` выполнена local-only два раза: каждый запуск 6/6 statements, exit 0.
- `sqlite_master` подтвердил 2 workflow tables и 4 indexes.
- `pragma_table_info` подтвердил 13 instance columns и 10 transition columns с ожидаемыми defaults/checks.
- `pragma_foreign_key_list` подтвердил composite `(org_id, instance_id)` → `(org_id, id)`.
- Реальный local D1 conditional transition дал `draft → review`, version `1 → 2`, одну history row; exact replay оставил version 2 и одну row.
- Migration/runtime normalized parity: 6/6 named statements.
- Destructive runtime SQL, forbidden imports, SQL вне store/schema, Cloudflare handlers, explicit `any`, P1.3+/product scope terms: 0.
- Staged credential/PII literal scan и `git diff --check`: clean.
- Production D1 не затрагивалась.

## Правило следующего этапа
P1.3 не имеет права уменьшить ни одно число выше. Functions gate допускает только
те же 27 известных legacy errors и требует 0 ошибок в
`functions/{platform,agents,channels}`. Новые/изменённые P1.3 файлы должны иметь
scoped ESLint exit 0; direct boundary checker и все suites выше остаются зелёными.
