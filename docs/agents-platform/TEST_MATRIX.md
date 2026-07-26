# TEST_MATRIX — baseline P0.0 (2026-07-17, HEAD 5bf3d56, до любых изменений платформы)

## Команды и точные результаты
| Проверка | Команда | Результат |
|---|---|---|
| Typecheck | `npx tsc -b` | exit 0 |
| Тесты (всего) | по файлам, см. ниже | **143 pass / 0 fail** |
| Build | `npx vite build` | exit 0 (~24s) |
| Javob eval (offline) | `npx tsx scripts/javob-eval.ts` | exit 0, 60 кейсов sound |
| Lint (глобально) | `npx eslint .` | **exit 1 — 84 problems (71 errors, 13 warnings), ВСЁ legacy** |

## Тесты по файлам (эталон для регрессии)
| Файл | Кол-во | Статус | Что покрывает |
|---|---|---|---|
| tests/gpt-chat.test.ts | 15 | ✅ | конфиг/квоты/валидация/markdown/roles/templates/storage веб-чата |
| tests/telegram-assistant.test.ts | 60 | ✅ | Javob: guard aidirectprobot, dedup, auto-reply, модификаторы, ownership, лимиты/леджер, day-pass, fail-closed галлюцинации, voice/Tahlil, feedback, приватность аналитики, 429-retry |
| tests/intent-guard.test.ts | 16 | ✅ | SEO intent-guard |
| tests/direct-generator.test.ts | 13 | ✅ | SEO direct-генератор |
| tests/indexnow-engine.test.ts | 11 | ✅ | IndexNow |
| tests/yandex-research.test.ts | 11 | ✅ | Yandex research |
| tests/gpt-backend.test.ts | 17 | ✅ | Railway/Fastify backend (опц.) |

Запуск одним процессом (`npm run test`) на машине владельца может падать OOM'ом при
занятой RAM — это ограничение среды, не кода. Эталонный способ: по одному файлу
с `NODE_OPTIONS=--max-old-space-size=800..1400`.

## Правило для последующих этапов
Каждый этап добавляет строку(и) сюда и НЕ имеет права уменьшить ни одно число pass.
Красный `eslint .` — legacy-долг; новые файлы этапа обязаны давать `npx eslint <файлы>` = 0.

## Добавлено P0.1
| tests/agent-boundaries.test.ts | 10 | ✅ | границы platform/agents/channels + негативные fixtures + registry |
Команда чекера: `npx tsx scripts/check-agent-boundaries.ts` (exit 0).
Typecheck платформы: `npx tsc -p tsconfig.functions.json --noEmit` — допустимы ТОЛЬКО 27 известных legacy-ошибок (KNOWN_ISSUES), 0 в functions/{platform,agents,channels}.

## Добавлено P0.2
| Файл | Кол-во | Статус | Что покрывает |
|---|---:|---|---|
| `tests/telegram-channel-compat.test.ts` | 1 | ✅ | старый shim и новый channel path экспортируют одинаковые runtime values и совместимую type surface без сетевых side effects |

Post-change baseline: `tsc -b` exit 0; boundaries 10/10; telegram-assistant 60/60;
gpt-chat 15/15; functions-config = ровно 27 legacy-ошибок и 0 в
`functions/{platform,agents,channels}`; scoped P0.2 eslint = 0.

## Добавлено P0.3
| Файл | Кол-во | Статус | Что покрывает |
|---|---:|---|---|
| `tests/platform-events.test.ts` | 20 | ✅ | порядок и ошибки in-process bus; durable append; duplicate/idempotency; unprocessed/processed; recursive PII guard; fail-closed JSON; durable-first service; один PII-safe Javob bridge и сохранение legacy logging |

Post-change baseline P0.3:
- `npx tsc -b` → exit 0;
- `tests/platform-events.test.ts` → 20/20;
- `tests/agent-boundaries.test.ts` → 10/10;
- `tests/telegram-channel-compat.test.ts` → 1/1;
- `tests/telegram-assistant.test.ts` → 60/60;
- `tests/gpt-chat.test.ts` → 15/15;
- `npx tsc -p tsconfig.functions.json --noEmit` → ровно 27 legacy-ошибок, 0 в `functions/{platform,agents,channels}`;
- scoped ESLint для `functions/platform/events`, новых/изменённых Javob-файлов и затронутых тестов → exit 0.
