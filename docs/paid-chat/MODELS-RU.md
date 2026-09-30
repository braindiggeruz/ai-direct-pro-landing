# Модели AI-чата: цепочки, запрос, сбои и проба

*WP-03 и WP-04 плана платного AI-чата (релиз R1), 2026-09-30. Код: `functions/lib/gpt-chat/config.ts`, `model-provider.ts`, `model-health-store.ts`, `model-spend-store.ts`, `turn-outcome.ts`, `turn-store.ts`, `openrouter-chat.ts`, `openrouter-stream.ts`, `functions/api/gpt/chat.ts`, `functions/platform/ai/model-policy.ts`, `functions/api/internal/gpt-model-probe.ts`, миграция `migrations/0066_gpt_chat_runtime.sql`. Тесты: `tests/gpt-model-policy.test.ts`, `tests/openrouter-model-catalogue.test.ts`, `tests/gpt-routing.test.ts`, `tests/gpt-chat-budget.test.ts`, `tests/gpt-chat-truncation.test.ts`, `tests/gpt-chat-runtime-schema.test.ts`.*

## Цепочки

Значения лежат в коде (`config.ts`) и в `wrangler.toml` (JSON и таблица), тест держит их равными.

| Цепочка | 1 | 2 | 3 |
|---|---|---|---|
| бесплатная (бот Javob; сайт — см. ниже) | `google/gemma-4-31b-it:free` | `nvidia/nemotron-3-super-120b-a12b:free` | `dots-studio/dots-3-note-preview:free` |
| пакет | `google/gemma-4-26b-a4b-it` | `mistralai/mistral-small-3.2-24b-instruct` | `google/gemma-4-31b-it:free` |

- MiniMax M3 `:free` убран отовсюду: у OpenRouter с 07.09 у него нет ни одного эндпоинта.
- В бесплатной цепочке только модели `:free`, что бы ни было в настройках. Бот Javob, AEO и часовая проверка каталога берут её же (`freeChain`).
- Бесплатным на **сайте** цепочку может возглавить платная основная: при `GPT_FREE_TIER_PAID_PRIMARY = "true"` и `GPT_FREE_PAID_DAILY_USD` больше 0 цепочка `[google/gemma-4-26b-a4b-it, …бесплатная]`, с Z.ai — `[zai, gemma-26b, …бесплатная]`. Каждая попытка на платной модели идёт только через суточный бюджет (раздел «Бюджет»). В репозитории флаг `"false"`: включается шагом R1.1 после пробы.
- На ход не больше 3 запросов к моделям. Модель на паузе (кулдаун) и модель без ключа попытку не занимают.

## Запрос

- `max_tokens` = `GPT_MAX_OUTPUT_TOKENS` (1600, от 400 до 4000; раньше 900).
- `reasoning: {enabled:false, exclude:true}` — только для моделей из `REASONING_OFF_MODELS` (`functions/platform/ai/model-policy.ts`): обе gemma, nemotron, dots. У всех четырёх по каталогу OpenRouter рассуждение необязательное. Этот же список читает AEO.
- `provider.allow_fallbacks`: `true` у платных (OpenRouter переходит к другому провайдеру этой модели в пределах `max_price`), `false` у `:free` (провайдер один).
- Ожидание первого слова в потоке — `GPT_FIRST_CONTENT_TIMEOUT_MS` (12000, от 5000 до 20000).
- Системный промпт больше не предлагает услуги GPTBot.uz (D9) и просит в длинном ответе сначала дать суть и закончить последнюю фразу.

## Бюджет платной модели для бесплатных (`GPT_FREE_PAID_DAILY_USD`)

Решение L6: бюджет считается только по ходам **бесплатных**. Ходы пакета идут по платной цепочке под своим потолком попыток (`TurnStore.admitModelAttempt`) и бюджет не трогают.

- **Перед каждой попыткой на платной модели** ход резервирует худший случай: промпт по верхней оценке токенов (байты UTF-8 + 32 на сообщение + 256 на шаблон, `promptTokenBound`) и весь ответ `GPT_MAX_OUTPUT_TOKENS`, оба по потолку `PAID_PRICE_CEILING` (тот же `max_price`, выше которого OpenRouter не возьмёт). Для короткого вопроса это ≈ $0,00067, для самого длинного контекста ≈ $0,0011; $1 вмещает ≈ 900 таких резервов сразу, а после расчёта по факту (≈ $0,0002 за обычный ответ) — несколько тысяч ответов в сутки.
- Резерв — **один атомарный** `INSERT … ON CONFLICT DO UPDATE … WHERE reserved + x ≤ потолок RETURNING` в `gpt_model_spend` (сутки UTC, `bucket = 'free_paid'`). Сколько бы ходов ни шло одновременно, потолок не превысить.
- **Ответ пришёл** — резерв заменяется ценой по прайсу (`estimateCostUsd`): `actual_micro` растёт на неё, разница возвращается. **Попытка упала** или usage не пришёл — резерв остаётся целиком: провайдер мог её оплатить.
- **Бюджет исчерпан** — платная модель пропускается (попытку не занимает), отвечает `:free`, пишется фоновый `free_paid_budget_exhausted` (одна строка в сутки). Если бюджет не прочитать (сбой D1), платная тоже пропускается: деньги закрываются, чат отвечает.
- Деньги — целые микродоллары (1e-6 USD). Строки старше 93 дней удаляет крон обслуживания.

## Исход хода, обрезка и «Стоп» (решение L4)

Каждый резерв закрывается один раз и без текста (`gpt_turn_reservations`, миграция 0066): `outcome`, `charged`, `model`, `finish_reason`, `cancel_reason`, `ttft_ms` (от начала перебора до первого слова, с упавшими попытками), `total_ms`, `tokens_in`, `tokens_out`, `reasoning_tokens`, `cost_micro_usd` (всегда, а не только для сохранённой переписки) и `attempts`.

| Исход | Когда | Списан |
|---|---|---|
| `answered` | модель закончила ответ | да |
| `truncated` | `finish_reason` = `length` или `model_context_window_exceeded` | **никогда**; в SSE `done` и в JSON `truncated: true, charged: false` |
| `client_gone` | «Стоп» или закрытая вкладка (запись в поток не прошла или сработал `request.signal`) | только если посетителю уже ушло ≥ `GPT_STOP_CHARGE_MIN_CHARS` символов (600; `0` — никогда) |
| `upstream_error` | провайдер упал до ответа или посреди него | нет |
| `no_model` | нет ключа, все модели на паузе или неизвестны, отказ аккаунта или потолок попыток пакета | нет |
| `refused` | провайдер отклонил этот вопрос (модерация, 400) | нет |
| `context_too_large` | сообщение не влезло | нет |

`remaining` и `hourRemaining` (только у бесплатных) в `done`, в `error: partial` и в JSON считаются **после** закрытия хода, поэтому несписанный ход уже возвращён. В JSON-пути ответ доходит целиком или никак, поэтому «Стоп» там не списывается никогда.

`enable_request_signal` (`wrangler.toml`) нужен, чтобы уход посетителя обрывал запрос к модели и в ожидании между кусками, и в JSON-пути. Флаг действует на весь Pages-проект, но входящий `request.signal` читает только чат, а в подзапросы он не передаётся (это другой флаг, `request_signal_passthrough`). Локальный `wrangler dev` и Miniflare уход клиента в `request.signal` не передают, поэтому проверять его можно только на превью или в проде.

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

Нужна после деплоя, который меняет модели (релиз R1, шаг R1.1), и перед включением `GPT_FREE_TIER_PAID_PRIMARY`. Доступ — Bearer `GPT_BILLING_MAINTENANCE_SECRET` (как у эндпоинта обслуживания, см. `ALERTS-RU.md`). Проба шлёт каждой модели обеих цепочек тот же запрос, что и чат (рабочий промпт, `max_tokens`, `reasoning`, потолок цены), с двумя постоянными вопросами — на узбекском и на русском. Она ничего не пишет в D1 и не возвращает текст ответа. В ответе на каждый вызов только HTTP-код, `finish_reason`, `reasoning_tokens`, время до первого слова (`ttftMs`) и машинный код сбоя `error` (тот же класс, что у чата: `rate_limit`, `bad_request`, `model_unavailable`…, а также `empty`, `timeout`, `network`; у удачного вызова его нет). На модель — сводка: `statuses`, `errors`, `rate429`, `finishReasons`, `reasoningTokensMax`, `ttftMsMedian`.

HTTP 200 ещё не значит, что модель ответила: OpenRouter может начать поток с кодом 200 и прислать ошибку внутри (например, 429 от провайдера до первого слова). Поэтому удачный вызов — это вызов без `error`, а `rate429` считает все `rate_limit`, и HTTP 429, и 429 внутри потока. Чат ставит модель на паузу в обоих случаях.

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
- **CPU.** Проба разбирает каждый ответ целиком, как чат. На Workers Free (10 мс CPU на запрос) длинный прогон может оборваться ошибкой лимита (503 / 1102 вместо JSON). Тогда разбейте его: по одной модели, а 20 вызовов к gemma — двумя прогонами по 10, и сложите `rate_limit` из `errors`.

**Что должно получиться (приёмка WP-03, шаг R1.1):**
1. У всех моделей `statuses` — только `200`, а `errors` пуст (`{}`).
2. У моделей с `reasoningOff: true` значение `reasoningTokensMax` равно `0`.
3. У `google/gemma-4-31b-it:free` на 20 вызовах `rate429` ≤ 0,1. Иначе она уходит из головы бесплатной цепочки: `OPENROUTER_MODEL_FREE` и `OPENROUTER_MODEL_FREE_FALLBACKS` в `wrangler.toml` (JSON и таблица), затем деплой. Код менять не нужно.
4. `ttftMsMedian` меньше `firstContentTimeoutMs`.

Если всё так, шаг R1.1 включает платную основную для бесплатных: `GPT_FREE_TIER_PAID_PRIMARY = "true"` в `wrangler.toml` (JSON и таблица), затем guarded-деплой. Без кредитов OpenRouter платная основная получит 402, ход уйдёт к `:free`, а владелец получит `openrouter_credit_exhausted`: включать её имеет смысл только с кредитами (вход владельца, план §8).

Если у модели на всех вызовах `error: "bad_request"` (HTTP 400), скорее всего она не принимает `reasoning`. Тогда уберите её из `REASONING_OFF_MODELS` (это код, нужен коммит). Чат при этом не лежит: такой 400 не ставит паузу, и ход уходит к следующей модели. `model_unavailable` значит другое: OpenRouter больше не знает эту модель, её нужно заменить в `OPENROUTER_MODEL_*`.

## Проверка после релиза (агрегат)

```sql
-- Через 24 ч после R1.1 (приёмка WP-04): доля ответов ≥ 90 %, обрезанных ≤ 5 %,
-- медиана ttft_ms записана. Ходы, закрытые до 0066, исхода не имеют.
SELECT COUNT(*) AS turns,
  ROUND(100.0 * SUM(outcome IN ('answered','truncated')) / COUNT(*), 1) AS answered_pct,
  ROUND(100.0 * SUM(outcome = 'truncated') / COUNT(*), 1) AS truncated_pct,
  SUM(outcome = 'client_gone') AS stopped, SUM(charged) AS charged
FROM gpt_turn_reservations
WHERE org_id = 'gptbot-consumer' AND outcome IS NOT NULL AND created_at >= (strftime('%s','now') - 86400) * 1000;

SELECT ttft_ms AS median_ttft_ms FROM gpt_turn_reservations
WHERE org_id = 'gptbot-consumer' AND ttft_ms IS NOT NULL AND created_at >= (strftime('%s','now') - 86400) * 1000
ORDER BY ttft_ms LIMIT 1 OFFSET (SELECT COUNT(*) / 2 FROM gpt_turn_reservations
  WHERE org_id = 'gptbot-consumer' AND ttft_ms IS NOT NULL AND created_at >= (strftime('%s','now') - 86400) * 1000);

-- Бюджет за сутки: actual_micro должен быть много меньше 1 000 000 ($1).
SELECT day, reserved_micro, actual_micro, attempts FROM gpt_model_spend
WHERE org_id = 'gptbot-consumer' AND bucket = 'free_paid' ORDER BY day DESC LIMIT 7;
```

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

Цепочку можно вернуть без кода: `OPENROUTER_MODEL_*` в `wrangler.toml` (JSON и таблица), затем деплой. Размер ответа — `GPT_MAX_OUTPUT_TOKENS`. Платную основную для бесплатных — `GPT_FREE_TIER_PAID_PRIMARY = "false"` или `GPT_FREE_PAID_DAILY_USD = "0"`. Порог «Стопа» — `GPT_STOP_CHARGE_MIN_CHARS`. Всё остальное — `git revert` и guarded-деплой; колонки и таблицы 0066 остаются, старый код их не читает.
