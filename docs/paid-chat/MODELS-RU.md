# Модели AI-чата: цепочки, запрос, сбои и проба

*WP-03 и WP-04 плана платного AI-чата (релиз R1), 2026-09-30. Код: `functions/lib/gpt-chat/config.ts`, `model-provider.ts`, `model-health-store.ts`, `model-spend-store.ts`, `turn-outcome.ts`, `turn-store.ts`, `openrouter-chat.ts`, `openrouter-stream.ts`, `functions/api/gpt/chat.ts`, `functions/platform/ai/model-policy.ts`, `functions/api/internal/gpt-model-probe.ts`, миграция `migrations/0066_gpt_chat_runtime.sql`. Тесты: `tests/gpt-model-policy.test.ts`, `tests/openrouter-model-catalogue.test.ts`, `tests/gpt-routing.test.ts`, `tests/gpt-chat-budget.test.ts`, `tests/gpt-chat-truncation.test.ts`, `tests/gpt-chat-runtime-schema.test.ts`.*

## Цепочки

Значения лежат в коде (`config.ts`) и в `wrangler.toml` (JSON и таблица), тест держит их равными.

| Цепочка | 1 | 2 | 3 |
|---|---|---|---|
| бесплатная (сайт и бот Javob — см. ниже) | `nvidia/nemotron-3-super-120b-a12b:free` | `dots-studio/dots-3-note-preview:free` | `google/gemma-4-31b-it:free` |
| пакет | `google/gemma-4-26b-a4b-it` | `mistralai/mistral-small-3.2-24b-instruct` | `google/gemma-4-31b-it:free` |

- MiniMax M3 `:free` убран отовсюду: у OpenRouter с 07.09 у него нет ни одного эндпоинта.
- В бесплатной цепочке только модели `:free`, что бы ни было в настройках. AEO и часовая проверка каталога берут её же (`freeChain`). Порядок с 01.10 (проба R1): gemma ответила 429 на все вызовы и ушла в хвост.
- Бесплатным на сайте и боту Javob (с WP-08, решение L15; `BOT-RU.md`) цепочку может возглавить платная основная (`freeTierChain`): при `GPT_FREE_TIER_PAID_PRIMARY = "true"` и `GPT_FREE_PAID_DAILY_USD` больше 0 цепочка `[google/gemma-4-26b-a4b-it, …бесплатная]`, с Z.ai — `[zai, gemma-26b, …бесплатная]`. Каждая попытка на платной модели идёт только через суточный бюджет (раздел «Бюджет»). В репозитории флаг `"false"`: включается шагом R1.1 после пробы.
- На ход не больше 3 запросов к моделям (у голосового ответа бота — 2, параметр `maxAttempts`). Модель на паузе (кулдаун) и модель без ключа попытку не занимают.

## Запрос

- `max_tokens` = `GPT_MAX_OUTPUT_TOKENS` (1600, от 400 до 4000; раньше 900).
- `reasoning: {enabled:false, exclude:true}` — только для моделей из `REASONING_OFF_MODELS` (`functions/platform/ai/model-policy.ts`): обе gemma, nemotron, dots. У всех четырёх по каталогу OpenRouter рассуждение необязательное. Этот же список читает AEO.
- `provider.allow_fallbacks`: `true` у платных (OpenRouter переходит к другому провайдеру этой модели в пределах `max_price`), `false` у `:free` (провайдер один).
- Ожидание первого слова в потоке — `GPT_FIRST_CONTENT_TIMEOUT_MS` (12000, от 5000 до 20000).
- Системный промпт больше не предлагает услуги GPTBot.uz (D9) и просит в длинном ответе сначала дать суть и закончить последнюю фразу.
- Контекст (`buildMessages`, `functions/lib/gpt-chat/prompt.ts`): системный промпт, история (последние `maxHistoryTurns` × 2 сообщения) и новое сообщение укладываются в 5700 байт UTF-8 (+32 на сообщение). Сначала отбрасывается старая история. Новое сообщение до 3000 символов (`GPT_MAX_INPUT_CHARS`) не обрезается никогда: если оно вместе с системным промптом больше 5700 байт, бюджет растёт до их размера, а история уходит. Потолок сообщения — 9000 байт (3000 символов по 3 байта: кириллица занимает 2, узбекские ‘ и ’ — 3). До 05.10.2026 русское сообщение длиннее ≈ 4400 байт (2200–2700 символов) обрезалось, и чат отвечал `context_too_large`, хотя поле пропускает 3000. Теперь `context_too_large` бывает только при поднятом `GPT_MAX_INPUT_CHARS`, когда сообщение больше 9000 байт.

## Два дневных бюджета в долларах: «бесплатное, проба, Р2» и «пакеты» (UE-3)

С 26.10.2026 (G0-код, `functions/lib/gpt-chat/model-spend-store.ts`) у платных моделей два отдельных дневных потолка, по строке `gpt_model_spend` на каждый (сутки UTC), без миграции:

| Корзина | `bucket` | Кто тратит | Потолок | Когда исчерпан |
|---|---|---|---|---|
| «бесплатное, проба, Р2» | `free_paid` | бесплатные и пробные ответы сайта, бесплатные ответы владельца пакета (Р2), бот Javob | `GPT_FREE_PAID_DAILY_USD`, 0..20, в проде **0,3** (решение №13, было 1) | платная модель пропускается до `:free`, фоновый `free_paid_budget_exhausted` раз в сутки |
| «пакеты» | `pack_paid` | ответы из пакета | `GPT_PACK_PAID_DAILY_USD`, 1..50 (никогда не 0), в проде **3** | платная модель пропускается до `:free` модели цепочки пакета, срочный `pack_paid_budget_exhausted` владельцу раз в сутки |

Так выполняется правило S5 «урезаем бесплатное, платное не трогаем»: исчерпанная бесплатная корзина не трогает пакеты. Корзина пакетов — аварийный тормоз (ошибка или атака, а не покупатели): при нынешнем объёме (3 пакета, до 50 ответов в сутки на пакет) пакеты тратят центы. Ответ пакета, кроме своей корзины, идёт под потолком попыток пакета (`TurnStore.admitModelAttempt`); корзину спрашивают первой, поэтому пропущенная ею модель попытку не тратит, а попытка, которую остановил потолок, возвращает свой резерв.

**Что считается платной моделью.** Платная модель OpenRouter (всё, кроме `:free`) — по потолку `max_price`. Модель Z.ai с ценой — по её прайсу (`model-pricing.ts`): Z.ai берёт прайс, а `max_tokens` ограничивает весь ответ вместе с размышлением, как и в худшем случае Studio. Сюда входит и **`glm-5.3-flash` из предоплаченного пакета**: с UE-3 она стоит в учёте по прайсу $0,15 / $0,50 за 1 млн токенов, а не $0. До UE-3 она проходила без бюджета, и после конца пакета (17.12.2026) оплата по факту шла бы без потолка. Пока пакет действует, Z.ai за эти токены денег не берёт: цифры в `cost_micro_usd` и в корзинах — теневые, сколько стоил бы ответ после пакета. Модели `:free` и бесплатные модели Z.ai (`glm-4.7-flash`, `glm-4.5-flash`) проходят без резерва. Модель Z.ai без цены в учёте не допускается ни одной корзиной.

С Р2 (05.10.2026, `LIMITS-RU.md`) у владельца пакета сначала идут бесплатные ответы. Такой ответ идёт по цепочке пакета, как и любой ход владельца, но платит за платную модель из корзины «бесплатное», как любой бесплатный, и потолок попыток пакета не трогает. Поэтому все ответы пакета остаются достижимы. Модель Z.ai с оплатой по токенам (`glm-4.5-air`, `glm-4.7-flashx` в `ZAI_MODEL_PAID`) бесплатный ответ не вызывает вовсе: в цепочке её заменяет `ZAI_MODEL_FREE` (`holderFreeChain`), а бюджет её пропускает. Предоплаченная модель из `ZAI_PREPAID_MODELS` (сейчас `glm-5.3-flash`) бесплатному ответу доступна, но резервирует свою цену в корзине «бесплатное» (`ZAI-RU.md`).

- **Перед каждой попыткой на платной модели** ход резервирует худший случай: промпт по верхней оценке токенов (байты UTF-8 + 32 на сообщение + 256 на шаблон, `promptTokenBound`) и весь ответ `GPT_MAX_OUTPUT_TOKENS`, у OpenRouter оба по потолку `PAID_PRICE_CEILING` (тот же `max_price`, выше которого OpenRouter не возьмёт), у Z.ai — по прайсу модели. Для короткого вопроса на OpenRouter это ≈ $0,00067, для самого длинного сообщения ≈ $0,0016; на `glm-5.3-flash` самый длинный — до $0,0025. После расчёта по факту обычный пробный ответ на `glm-5.3-flash` стоит ≈ $0,0005 (1500 токенов на вход, 500 на выход), так что $0,3 — это ≈ 600 таких ответов в сутки при нынешних 25–57 ходах в сутки на весь чат (`docs/monetization/2026-10-25-tariffs-roadmap/04-funnel-data.md`).
- Резерв — **один атомарный** `INSERT … ON CONFLICT DO UPDATE … WHERE reserved + x ≤ потолок RETURNING` в `gpt_model_spend` (сутки UTC, `bucket = 'free_paid'` или `'pack_paid'`). Сколько бы ходов ни шло одновременно, потолок не превысить.
- **Ответ пришёл** — резерв заменяется ценой по прайсу (`estimateCostUsd`): `actual_micro` растёт на неё, разница возвращается. **Попытка упала** или usage не пришёл — резерв остаётся целиком: провайдер мог её оплатить.
- **Бюджет исчерпан** — платная модель пропускается (попытку не занимает), отвечает `:free`, пишется фоновый `free_paid_budget_exhausted` или срочный `pack_paid_budget_exhausted` (одна строка в сутки). Если бюджет не прочитать (сбой D1), платная тоже пропускается: деньги закрываются, чат отвечает.
- **Админка** («AI-чат» → «Модели и алерты») показывает обе корзины за сегодня, ходы пакета с исходом `no_model` за 7 дней и часы с ответом Z.ai 1113 за 7 дней.
- Если при этом все модели `:free` на паузе, запрос не уходит вовсе. Ход закрывается как `no_model`, а владелец получает срочный `chat_models_cooling`, как и без платной основной. Это не `chat_model_unavailable`: цепочка не устарела, её модели просто на паузе.
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

`remaining` и `hourRemaining` (только у бесплатных; у владельца пакета `remaining` — остаток пакета, даже после бесплатного ответа, а `hourRemaining` — `null`) в `done`, в `error: partial` и в JSON считаются **после** закрытия хода, поэтому несписанный ход уже возвращён. В JSON-пути ответ доходит целиком или никак, поэтому «Стоп» там не списывается никогда.

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

Путь ответа бота пробует `?target=javob` (`BOT-RU.md`).

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

Цепочку можно вернуть без кода: `OPENROUTER_MODEL_*` в `wrangler.toml` (JSON и таблица), затем деплой. Размер ответа — `GPT_MAX_OUTPUT_TOKENS`. Платную основную для бесплатных — `GPT_FREE_TIER_PAID_PRIMARY = "false"` или `GPT_FREE_PAID_DAILY_USD = "0"` (тогда и `glm-5.3-flash` бесплатным недоступна, они уходят на `:free`). Тормоз пакетов — `GPT_PACK_PAID_DAILY_USD` (1..50). Что менять 15.11, 17.11 и 17.12 — `MODEL-CLIFF-1712-RU.md`. Порог «Стопа» — `GPT_STOP_CHARGE_MIN_CHARS`. Всё остальное — `git revert` и guarded-деплой; колонки и таблицы 0066 остаются, старый код их не читает.
