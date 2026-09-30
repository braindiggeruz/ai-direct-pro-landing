# Модели AI-чата: цепочки, запрос, сбои и проба

*WP-03 плана платного AI-чата (релиз R1), 2026-09-30. Код: `functions/lib/gpt-chat/config.ts`, `model-provider.ts`, `model-health-store.ts`, `openrouter-chat.ts`, `openrouter-stream.ts`, `functions/platform/ai/model-policy.ts`, `functions/api/internal/gpt-model-probe.ts`. Тесты: `tests/gpt-model-policy.test.ts`, `tests/openrouter-model-catalogue.test.ts`, `tests/gpt-routing.test.ts`.*

## Цепочки

Значения лежат в коде (`config.ts`) и в `wrangler.toml` (JSON и таблица), тест держит их равными.

| Цепочка | 1 | 2 | 3 |
|---|---|---|---|
| бесплатная (сайт и бот Javob) | `google/gemma-4-31b-it:free` | `nvidia/nemotron-3-super-120b-a12b:free` | `dots-studio/dots-3-note-preview:free` |
| пакет | `google/gemma-4-26b-a4b-it` | `mistralai/mistral-small-3.2-24b-instruct` | `google/gemma-4-31b-it:free` |

- MiniMax M3 `:free` убран отовсюду: у OpenRouter с 07.09 у него нет ни одного эндпоинта.
- В бесплатной цепочке только модели `:free`, что бы ни было в настройках. Бот Javob берёт её же (`freeChain`).
- `GPT_FREE_TIER_PAID_PRIMARY` (платная основная для бесплатных под суточным бюджетом `GPT_FREE_PAID_DAILY_USD`) пока **ни на что не влияет**: её читает бюджет из WP-04. Включать только после WP-04 и пробы (ниже).
- На ход не больше 3 запросов к моделям. Модель на паузе (кулдаун) и модель без ключа попытку не занимают.

## Запрос

- `max_tokens` = `GPT_MAX_OUTPUT_TOKENS` (1600, от 400 до 4000; раньше 900).
- `reasoning: {enabled:false, exclude:true}` — только для моделей из `REASONING_OFF_MODELS` (`functions/platform/ai/model-policy.ts`): обе gemma, nemotron, dots. У всех четырёх по каталогу OpenRouter рассуждение необязательное. Этот же список читает AEO.
- `provider.allow_fallbacks`: `true` у платных (OpenRouter переходит к другому провайдеру этой модели в пределах `max_price`), `false` у `:free` (провайдер один).
- Ожидание первого слова в потоке — `GPT_FIRST_CONTENT_TIMEOUT_MS` (12000, от 5000 до 20000).
- Системный промпт больше не предлагает услуги GPTBot.uz (D9) и просит в длинном ответе сначала дать суть и закончить последнюю фразу.

## Как читаются сбои OpenRouter

| Ответ | Код | Что происходит |
|---|---|---|
| 400 «not a valid model» / «No endpoints found», 404 | `model_unavailable` | модель на паузе на час |
| другой 400 | `bad_request` | паузы нет, пробуем следующую модель; алерта нет |
| 403 | `content_refused` | модерация отклонила этот вопрос: паузы нет, следующая модель; алерта нет |
| 402 на платной модели | `paid_credit_exhausted` | нет кредитов: все платные на паузе 15 минут, ход идёт к `:free`, срочный алерт `openrouter_credit_exhausted` |
| 402 на `:free`, 401 | `account_unavailable` | весь OpenRouter на паузе 30 секунд, срочный алерт `chat_account_unavailable` |
| 429 | `rate_limit` | модель на паузе на минуту |
| все модели уже на паузе | `models_cooling` | запрос не отправляется; посетитель видит `model_unavailable`, владелец — срочный `chat_models_cooling` |

Из тела 400 читается не больше 2 КБ и только для сравнения с этими словами. Тело не пишется в лог, в базу и в ответ: в нём может быть текст посетителя.

## Проба моделей (`POST /api/internal/gpt-model-probe`)

Нужна после деплоя, который меняет модели (релиз R1, шаг R1.1), и перед включением `GPT_FREE_TIER_PAID_PRIMARY`. Доступ — Bearer `GPT_BILLING_MAINTENANCE_SECRET` (как у эндпоинта обслуживания, см. `ALERTS-RU.md`). Проба шлёт каждой модели обеих цепочек тот же запрос, что и чат (рабочий промпт, `max_tokens`, `reasoning`, потолок цены), с двумя постоянными вопросами — на узбекском и на русском. Она ничего не пишет в D1 и не возвращает текст ответа. В ответе на каждый вызов только HTTP-код, `finish_reason`, `reasoning_tokens` и время до первого слова (`ttftMs`), а на модель — сводка: `statuses`, `rate429`, `finishReasons`, `reasoningTokensMax`, `ttftMsMedian`.

```bash
# $f — временный файл с секретом, как в ALERTS-RU.md; секрет не печатается.
h="$(mktemp)"; printf 'Authorization: Bearer %s' "$(cat "$f")" > "$h"
curl -sS -X POST https://gptbot.uz/api/internal/gpt-model-probe -H @"$h"                  # все модели × 2 вызова
curl -sS -X POST https://gptbot.uz/api/internal/gpt-model-probe -H @"$h" \
  -d '{"model":"google/gemma-4-31b-it:free","calls":20}'                                  # доля 429 у головы :free
rm -f "$h"
```

- `calls` — от 1 до 20 на модель, всего не больше 40 вызовов. Вызовы к одной модели идут по очереди, модели — параллельно. На всю пробу отводится 110 секунд: вызовы, которые не успели начаться, не делаются (`calls` < `planned`).
- **Цена.** Платный вызов стоит меньше $0,001. Каждый вызов `:free` расходует дневной лимит OpenRouter, пока на аккаунте не куплены кредиты: 50 запросов в сутки на чат, бота и AEO вместе.

**Что должно получиться (приёмка WP-03):**
1. У всех моделей `statuses` — только `200`.
2. У моделей с `reasoningOff: true` значение `reasoningTokensMax` равно `0`.
3. У `google/gemma-4-31b-it:free` на 20 вызовах `rate429` ≤ 0,1. Иначе она уходит из головы бесплатной цепочки: `OPENROUTER_MODEL_FREE` и `OPENROUTER_MODEL_FREE_FALLBACKS` в `wrangler.toml` (JSON и таблица), затем деплой. Код менять не нужно.
4. `ttftMsMedian` меньше `firstContentTimeoutMs`.

Если у модели 400 на всех вызовах, скорее всего она не принимает `reasoning`. Тогда уберите её из `REASONING_OFF_MODELS` (это код, нужен коммит). Чат при этом не лежит: такой 400 не ставит паузу, и ход уходит к следующей модели.

## Проверка после релиза (агрегат)

```sql
-- Через час после деплоя: у MiniMax нет действующей паузы (0). Старая строка
-- с прошедшим blocked_until остаётся историей: таблицу никто не чистит.
SELECT COUNT(*) AS minimax_active FROM gpt_model_health
WHERE org_id = 'gptbot-consumer' AND model LIKE 'minimax/%' AND blocked_until > strftime('%s', 'now') * 1000;

-- Какие модели сейчас на паузе и почему
SELECT model, code, datetime(blocked_until / 1000, 'unixepoch') AS until FROM gpt_model_health
WHERE org_id = 'gptbot-consumer' AND blocked_until > strftime('%s', 'now') * 1000;
```

## Откат

Цепочку можно вернуть без кода: `OPENROUTER_MODEL_*` в `wrangler.toml` (JSON и таблица), затем деплой. Размер ответа — `GPT_MAX_OUTPUT_TOKENS`. Всё остальное — `git revert` и guarded-деплой.
