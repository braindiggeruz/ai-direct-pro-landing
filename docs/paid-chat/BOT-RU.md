# Бот @gptbotuz_bot (Javob): ответы, лимиты, алерты и профиль

*WP-08 плана платного AI-чата (релиз R2), 2026-10-01. Код: `functions/lib/telegram/service.ts`, `handler.ts`, `billing.ts`, `i18n.ts`, `store.ts`, `schema.ts`, `bot-profile.ts`, `functions/api/telegram/assistant.ts`, `functions/api/internal/javob-setup.ts`, `functions/api/internal/gpt-model-probe.ts` (`?target=javob`), `functions/lib/gpt-chat/openrouter-chat.ts` (`maxAttempts`), `watchdog-store.ts` (`bot_silent`), `alert-policy.ts`, миграция `migrations/0067_javob_plans_retire.sql`. Тесты: `tests/telegram-assistant.test.ts`, `tests/telegram-web-handoff.test.ts`, `tests/gpt-watchdog.test.ts`, `tests/gpt-model-policy.test.ts`.*

## Почему бот молчал с 13.09

Голосовой путь просил ответ у одной модели: цепочку обрезали **до** фильтра здоровья (`maxModels: 1`). Первой в цепочке стояла MiniMax, которую OpenRouter удалил 07.09. Сайт каждый час заново ставил её на паузу, поэтому кандидатов не оставалось, и запрос не уходил вовсе (8 из 8 сбоев 15.09). Сбоев никто не видел: бот не писал алертов, а `telegram_updates.status` всегда был `ok`.

## Как бот отвечает теперь

- **Цепочка** — та же, что у бесплатных на сайте (`freeTierChain`, решение L15): платная основная только при `GPT_FREE_TIER_PAID_PRIMARY = "true"` и только из общего суточного бюджета `GPT_FREE_PAID_DAILY_USD` (`gpt_model_spend`, `bucket = 'free_paid'`), затем модели `:free`. Пока флаг `"false"` (кредитов OpenRouter нет), бот ходит только в `:free`. Z.ai боту недоступен.
- **Попытки считаются после фильтра здоровья** (`chatComplete(…, maxAttempts)`): модель на паузе попытку не занимает. Текст — до 3 запросов, голос — до 2.
- **Один дедлайн.** `waitUntil` даёт обработке 30 с после ответа Telegram. Работа моделей заканчивается через 25 с после прихода апдейта, чтобы ответ или ошибка успели сохраниться и уйти к 28 с. Первая генерация — не больше 14 с, повтор после валидатора — не больше 10 с. Генерация, на которую осталось меньше секунды, не начинается: первая даёт `timeout`, повтор — `validation_failed`. Голос: скачивание ≤ 6 с, расшифровка ≤ 10 с, одна генерация ≤ 10 с без повтора.
- **Обрезанный ответ** (`finish_reason = length`) не отправляется: в Telegram он выглядел бы законченным. Код — `truncated`.
- **Ошибка** — сообщение «не удалось» с кнопками «Повторить» и «Сначала». «Сначала» (`restart:`) теперь работает как `/new`.
- **Событие `javob_reply_failed`** несёт `code` и `issues` — коды замечаний валидатора через запятую (`invented_number`, `invented_fact`, `wrong_language`, `system_leak`, `meta_preamble`). Текста ответа и `detail` в нём нет.
- **Секрет вебхука** сравнивается за постоянное время.

## Лимиты (решение L15)

| Имя | Вид | Значение | Если не задано |
|---|---|---|---|
| `TELEGRAM_FREE_DAILY_LIMIT` | публичная (JSON и таблица `wrangler.toml`) | `10` | строка `plans.free` (сейчас 3) |
| `TELEGRAM_FREE_MONTHLY_LIMIT` | то же | `100` | строка `plans.free` (сейчас 30) |

- Сутки и месяц считаются по Ташкенту (UTC+5): лимит обновляется в 00:00 по Ташкенту, а не в 05:00, как раньше. Так же считается дневной анализ Tahlil.
- Значение не целое, ноль или мусор считается незаданным. Если не задано ни в настройке, ни в каталоге, ответов нет (fail closed).
- `/plans` («лимит» / «limit» в меню) показывает лимит и сколько осталось сегодня. Каталог тарифов бот больше не читает.

## Без цен и ссылок на оплату (D11)

Цифровые товары внутри Telegram можно продавать только за Stars. Поэтому в боте нет цен, тарифов, кнопок на страницы с ценами и на оплату:

- `/plans` — лимит, а не каталог; в тексте лимита — когда он обновится;
- кнопки «Посмотреть тарифы» больше нет (UZ-версия вела на B2B-прайс `/uz/chat-bot-narxi/`);
- у отчёта Tahlil нет кнопки «Подробнее» с Day Pass 4 900 UZS. Старые кнопки `analysis_details:`, `analysis_pay_intent:`, `analysis_later:` в истории чатов отвечают нейтральным текстом, событие `payment_intent` больше не пишется;
- миграция 0067 выключает строки `day_pass` и `plus` в `plans` (заказов, подписок и прав в проде 0).

Тесты проверяют: ни одна клавиатура не содержит `tarify|narxi|oferta|click|uzum|payme` и url-кнопок; в текстах бота нет цен, «Plus», «Day Pass», «тариф/tarif», «obuna/подписк» и ссылок на страницы сайта.

## Алерты и сторож

- Каждый неудачный ответ записывается как `bot_<code>` в `gpt_service_alerts` (одна строка на код в час) и запускает доставку и сторожа, как неудачный ход чата (`operator-alert.ts`). Не считаются сбоем `content_refused` и `bad_request`.
- **Срочные:** `bot_no_key`, `bot_account_unavailable`, `bot_model_unavailable`, `bot_models_cooling` (ответить не может никто) и `bot_silent`. Остальные (`bot_rate_limit`, `bot_timeout`, `bot_validation_failed`, `bot_truncated`, `bot_provider_error`…) — фон: попадают в «Фон за час».
- **`bot_silent`** (сторож, раз в 10 минут): за 24 часа не меньше 3 апдейтов, которые закончились ошибкой или так и не закончились, и ни одного `javob_reply_generated`. Пишется одной строкой в сутки (UTC), а не в час: окно — сутки, и три сбоя, после которых никто не пишет боту, иначе будили бы владельца каждый час до следующего дня.

## Исход апдейта (`telegram_updates.status`)

| Статус | Когда |
|---|---|
| `processing` | апдейт принят, обработка идёт; если так осталось дольше 2 минут — её оборвал лимит `waitUntil` |
| `done` | обработано, в том числе лимит, устаревшая кнопка, приветствие |
| `failed:<code>` | человек получил ошибку вместо ответа: код модели (`models_cooling`, `rate_limit`, `timeout`, `validation_failed`, `truncated`…), голоса (`download_failed`, `stt_unavailable`, `stt_failed`), анализа (`analysis_<code>`) или `exception` |
| `ok` | строки до R2 |

Строки хранятся 7 дней.

## Вход на сайт через бота (WP-16)

`/start login_<32 hex>` и кнопки `lg:`, `lgx:`, `lgout:` обрабатывает `web-login.ts` раньше Javob: без моделей и без бесплатных ответов, только в личном чате. Бот спрашивает число с сайта (или присылает код в режиме `code`) и даёт кнопку «Выйти на всех устройствах». Подробно — `LOGIN-RU.md`. Сбой на нашей стороне — срочный алерт `bot_login_failed` и исход апдейта `failed:login_failed`.

## Команды и описания бота (`POST /api/internal/javob-setup`)

Тексты — в `functions/lib/telegram/bot-profile.ts`, их же применяет `scripts/telegram-setup.ts setup`. Эндпоинт делает это на сервере: токен бота не покидает Pages, BotFather не нужен. Вебхук эндпоинт не трогает. Если токен принадлежит защищённому боту (@aidirectprobot), ответ 409 и ничего не меняется.

```bash
# Секрет обслуживания — из gptbot-private, не печатается (как в ALERTS-RU.md).
h="$(mktemp)"; printf 'Authorization: Bearer %s' "$(cat C:/Users/Borinio/.config/gptbot-private/gpt-billing-maintenance-secret.txt)" > "$h"
curl -sS -X POST https://gptbot.uz/api/internal/javob-setup -H @"$h"                       # только проверка
curl -sS -X POST https://gptbot.uz/api/internal/javob-setup -H @"$h" -d '{"apply":true}'   # применить и проверить
rm -f "$h"
```

В ответе: `bot`, `applied.failed` (пусто — всё применилось), `matches` и для `default` и `uz` — команды и описания, которые сейчас у Telegram. Ожидается `matches: true` и команда `plans` с описанием «лимит» / «limit».

## Проба пути ответа (`POST /api/internal/gpt-model-probe?target=javob`)

Прогоняет `runJavobValidated` на постоянном сообщении на узбекском и на русском: как текст (с повтором после валидатора) и как голос (до 2 моделей, 10 с). Это настоящий путь бота: модели на паузе пропускаются, сбой ставит модель на паузу, платная основная тратит общий бюджет (и, как любой ответ, пишет `openrouter_credit_exhausted` при 402 и `free_paid_budget_exhausted` при исчерпанном бюджете). Квоту бота проба не тратит, `bot_<код>` не пишет, текста не возвращает. Текстовый прогон — до 6 запросов к моделям (3 и ещё 3 при повторе после валидатора), голосовой — до 2; прогоны идут одновременно, запросы к `:free` идут в дневной лимит OpenRouter, пока кредиты не куплены. В ответе на каждый прогон: `mode`, `locale`, `ok`, `code`, `issues`, `model`, `retried`, `latencyMs`.

```bash
h="$(mktemp)"; printf 'Authorization: Bearer %s' "$(cat C:/Users/Borinio/.config/gptbot-private/gpt-billing-maintenance-secret.txt)" > "$h"
curl -sS -X POST "https://gptbot.uz/api/internal/gpt-model-probe?target=javob" -H @"$h"
rm -f "$h"
```

Ожидается: все 4 прогона `ok: true`; у голосовых нет `models_cooling`.

## Релиз R2: шаги для бота (делает ведущий)

1. Миграция 0067 — в том же `migrations apply`, что и релиз R2 (порядок относительно кода не важен: код платные строки не читает). Сверка: `SELECT code, is_active FROM plans ORDER BY display_order` → `free 1`, остальные `0`.
2. Деплой Pages (guarded).
3. Проба `?target=javob` — все 4 прогона `ok`.
4. `javob-setup`: проверка → `{"apply":true}` → `matches: true`.
5. По желанию владелец за минуту отправляет боту текст и голосовое.
6. Через сутки (только агрегаты):

```sql
-- сбои ответа по кодам и замечаниям валидатора, без текста
SELECT json_extract(meta_json,'$.code') code, COALESCE(json_extract(meta_json,'$.issues'),'') issues, COUNT(*) n
FROM telegram_events WHERE event='javob_reply_failed' AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 day') GROUP BY 1,2;
-- ответы и входы за сутки
SELECT event, COUNT(*) FROM telegram_events WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 day')
  AND event IN ('javob_reply_generated','voice_reply_generated','javob_message_received','javob_forward_received','voice_received') GROUP BY 1;
-- исходы апдейтов
SELECT status, COUNT(*) FROM telegram_updates WHERE processed_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 day') GROUP BY 1;
```

Ожидается: среди `javob_reply_failed` нет синтетического `rate_limit` при модели на паузе (теперь это `models_cooling`), в `telegram_updates` видны `done` и `failed:<код>`.

7. **R2.1:** 7 дней ответов не меньше 90 % (`javob_reply_generated` / (`javob_reply_generated` + `javob_reply_failed`)) → `GPT_BOT_HANDOFF_ENABLED = "true"` в `wrangler.toml` (JSON и таблица) → деплой. До этого флаг остаётся `"false"`.

**Откат.** Код — `git revert` и guarded-деплой; миграцию при этом не откатывать: старый код покажет в `/plans` только Free, без цен. Откат самой миграции (`UPDATE plans SET is_active = 1 WHERE code IN ('day_pass','plus')`) вернул бы цены в бот старого кода.
