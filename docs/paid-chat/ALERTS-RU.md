# Алерты AI-чата, сторож тишины и крон обслуживания

*WP-02 плана «AI-чат + оплата», 2026-09-30 (D6). Код: `functions/lib/gpt-chat/alert-policy.ts`, `billing-maintenance-store.ts`, `watchdog-store.ts`, `operator-alert.ts`, `billing-operations-store.ts`, `functions/api/internal/gpt-billing-maintenance.ts`, `workers/gpt-billing-maintenance.ts`. Тесты: `tests/gpt-watchdog.test.ts`, `tests/gpt-operations.test.ts`.*

## Коротко

- Каждый сбой чата записывается в `gpt_service_alerts` в **любом** режиме оплаты: без `GPT_BILLING_MODE`, в `test` и в `live`. Раньше в `test` запись пропускалась, а сообщения уходили только в `live`, поэтому из 185 записанных алертов не дошёл ни один.
- Владельцу в Telegram уходят только **срочные** коды. Остальные (фоновые) не шлются сами: они попадают в срочное сообщение строкой «Фон за час» и остаются в D1 для админки.
- Сторож тишины раз в 10 минут смотрит, отвечает ли чат вообще. Если ходы есть, а ответов нет, он поднимает `chat_silence`. Условие требует трафика, поэтому тихой ночью ложных тревог нет.
- Основной хост — крон Worker'а `gptbot-automation` (каждые 15 минут). Второй контур — каждый неудачный ход чата: он запускает сторожа и доставку сам, поэтому сигнал проходит и без крона.

## Какие коды срочные

Точный список — `URGENT_ALERT_PATTERNS` в `alert-policy.ts`. Там же тексты сообщений.

| Код | Что значит |
|---|---|
| `chat_no_key`, `chat_account_unavailable` | чат не может отвечать никому: нет ключа, или провайдер отклонил аккаунт (401, или 402 на `:free`-модели) |
| `chat_model_unavailable` | вся цепочка моделей отклонена как неизвестная (так выглядел простой 04.09) |
| `chat_models_cooling` | все модели цепочки на паузе после сбоев, запрос даже не отправлен; посетитель видит «модели обновляются» |
| `openrouter_credit_exhausted` | 402 на платной модели: у OpenRouter нет кредитов. Платные модели выключены на 15 минут, отвечают `:free` |
| `catalogue_*` | часовая проверка: модель цепочки пропала из OpenRouter или вышла за потолок цены (`catalogue_model_unavailable`), либо проверка не прошла (`catalogue_check_failed`) |
| `openrouter_free_tier_50rpd`, `openrouter_key_credit_low` | аккаунт OpenRouter на бесплатном уровне (50 запросов к `:free` в сутки на чат, бота и AEO вместе); лимит ключа почти исчерпан. **Не чаще раза в сутки.** |
| `chat_silence`, `chat_degraded`, `chat_no_turns` | сторож тишины (ниже) |
| `zai_*`, `bot_*`, `click_*`, `uzum_*` | Z.ai, бот, платёжные провайдеры |
| `drill` | учебный алерт |

Фоновые коды — всё остальное: `chat_rate_limit`, `chat_timeout`, `chat_provider_error`, `chat_empty`, `chat_budget_exhausted`, `stale_reservations`, `chat_truncation_high`, `free_paid_budget_exhausted`, `openrouter_key_unavailable`, `payme_*`.

`free_paid_budget_exhausted` (WP-04) значит: бесплатные ответы за сутки UTC потратили бюджет платной модели `GPT_FREE_PAID_DAILY_USD`, и до конца суток бесплатным отвечают модели `:free`. Это не сбой, а сведение, поэтому код фоновый и пишется одной строкой в сутки (`MODELS-RU.md`, раздел «Бюджет»).

## Как доставляется

- **Канал:** `GPT_NOTIFY_BOT_TOKEN` + `GPT_NOTIFY_CHAT_ID`, а если их нет — `TELEGRAM_ASSISTANT_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID`. Это тот же бот и чат, что у заявок. Лимит уведомлений о заявках алерты не расходуют.
- **Одно сообщение на пачку.** Все срочные коды, которые ещё не доставлены, уходят одним сообщением. Пачку забирает один `UPDATE`, поэтому крон и сбойный ход не пришлют её дважды.
- **Повтор кода** — не чаще раза в час (строка `код:час`). Для двух кодов OpenRouter о состоянии аккаунта — раз в сутки.
- **Общий потолок** — `GPT_ALERTS_MAX_PER_HOUR` сообщений в час (по умолчанию 6). Пачка сверх потолка ждёт следующего часа.
- **Не дошло** (Telegram недоступен) — повтор через 5 минут.
- **Старше 24 часов** — не шлётся: это уже не новость. Строки всех алертов удаляются через 93 дня.
- **Аварийный выключатель:** `GPT_ALERTS_ENABLED = "false"`. Запись идёт дальше, сообщения не шлются.

## Сторож тишины

Проверки идут по `gpt_turn_reservations` (без текста разговоров). Ход считается завершённым, если он `done`, `released` или `reserved` после срока резерва (2 минуты).

С миграции 0066 (WP-04) у хода есть исход (`outcome`). Ходы, которые ничего не говорят о здоровье чата, сторож не считает вовсе: посетитель нажал «Стоп» или ушёл (`client_gone`), провайдер отклонил этот один вопрос (`refused`), сообщение не влезло (`context_too_large`). Иначе один посетитель, трижды нажавший «Стоп» тихой ночью, поднял бы срочный `chat_silence`. Ответ, обрезанный по длине (`truncated`), считается ответом: модель ответила, просто не списала ход. У ходов до 0066 исхода нет, они считаются как раньше.

| Код | Условие | Срочный |
|---|---|---|
| `chat_silence` | за `GPT_WATCHDOG_WINDOW_MINUTES` (180) не меньше `GPT_WATCHDOG_MIN_TURNS` (3) завершённых ходов и ни одного ответа | да |
| `chat_degraded` | за 60 минут не меньше 4 завершённых ходов, и ответ получили меньше половины (вместе с `chat_silence` не поднимается) | да |
| `chat_no_turns` | за окно сессии открыли посетители не меньше чем с `GPT_WATCHDOG_MIN_TURNS` разных IP (по хешу), а ходов нет совсем: запросы падают до резерва (Turnstile или D1). Считаются разные IP, а не строки: сессию создаёт `POST /api/gpt/session` без Turnstile, и один клиент в цикле не должен будить владельца | да |
| `stale_reservations` | за час больше 3 ходов зависли в `reserved` (изолят умер посреди ответа) | нет |
| `chat_truncation_high` | за 24 часа из не меньше 20 ходов с исходом больше 15 % обрезаны (`outcome = 'truncated'`, миграция 0066) | нет |

Простой 25.08–03.09 (89 сессий, 0 ответов) сторож поймал бы не позже чем через 3 часа.

## Крон обслуживания

Worker `gptbot-automation` на каждом тике крона (`*/15`) делает `POST https://gptbot.uz/api/internal/gpt-billing-maintenance` с `Authorization: Bearer <GPT_BILLING_MAINTENANCE_SECRET>`, таймаут 20 секунд. Эндпоинт выполняет шаги по порядку. У каждого шага свой try/catch и свой бюджет времени, в сумме меньше 20 секунд:

1. `providers` (6 с), раз в час: эндпоинты моделей цепочки OpenRouter (`/api/v1/models/{id}/endpoints`, не больше 6 моделей) и ключ (`/api/v1/key`). Модель без эндпоинта в потолке цены (`PAID_PRICE_CEILING` в `model-pricing.ts`, тот же, что в запросе к модели) выключается на час.
2. `watchdog` (2 с), раз в 10 минут: сторож тишины.
3. `alerts` (4,5 с): доставка срочных алертов.
4. `maintenance` (2,5 с): чистка старых строк (с WP-07 и закрытых окон `gpt_rate_limits` старше 2 суток); уведомления об оплатах — только в `live`.
5. `rekey` (2 с): после `GPT_HASH_SALT_SINCE` — пачка старых хешей в солёные (WP-07, `SALT-RU.md`). До этого — `off`, `no_since` (соль есть, а `SINCE` пустой или с опечаткой) или `waiting`, без обращений к D1.
6. `retention` (1 с): удаление переписки старше `GPT_MESSAGES_RETENTION_DAYS`. Пока настройка пустая — `{"enabled":false}` (`SALT-RU.md`).
7. `diagnostics` (1 с): очередь уведомлений, ходы за час, заблокированные модели.

Если какой-то шаг упал, эндпоинт отвечает 503 со списком `failed`, остальные шаги всё равно выполнены. Worker пишет в лог `gpt_billing_maintenance_failed`.

## Настройки

| Имя | Вид | По умолчанию | Где |
|---|---|---|---|
| `GPT_ALERTS_ENABLED` | публичная | `true` | `wrangler.toml` (JSON и таблица) |
| `GPT_ALERTS_MAX_PER_HOUR` | публичная | `6` (1..60) | то же |
| `GPT_WATCHDOG_WINDOW_MINUTES` | публичная | `180` (60..1440) | то же |
| `GPT_WATCHDOG_MIN_TURNS` | публичная | `3` (1..100) | то же |
| `GPT_BILLING_MAINTENANCE_ENABLED` | var Worker'а | `true` | `wrangler.automation.toml` |
| `GPT_BILLING_MAINTENANCE_SECRET` | **секрет** Pages **и** Worker'а | — | задаёт агент при релизе |

Без секрета крон ничего не вызывает, даже при `GPT_BILLING_MAINTENANCE_ENABLED = "true"`. Сторож и доставка при этом работают на втором контуре — на неудачных ходах чата.

## Секрет `GPT_BILLING_MAINTENANCE_SECRET` (при релизе R1)

Значение генерирует агент: не меньше 32 случайных байт. Оно одинаковое в Pages и в Worker'е, передаётся только через stdin из временного файла без перевода строки и никуда не печатается. Команды для Git Bash:

```bash
f="$(mktemp)"
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$f"
npx wrangler pages secret put GPT_BILLING_MAINTENANCE_SECRET --project-name ai-direct-pro-landing < "$f"
npx wrangler secret put GPT_BILLING_MAINTENANCE_SECRET -c wrangler.automation.toml < "$f"
# Секрет Pages вступает в силу только со следующим деплоем Pages (guarded, deploy_runner.py).
# Worker: npx wrangler deploy -c wrangler.automation.toml --dry-run --outdir <tmp>, затем deploy.
```

Учебный алерт, сразу после деплоя Pages и Worker'а (сообщение должно прийти за минуту):

```bash
h="$(mktemp)"; printf 'Authorization: Bearer %s' "$(cat "$f")" > "$h"
curl -sS -X POST https://gptbot.uz/api/internal/gpt-billing-maintenance -H @"$h" -d '{"drill":true}'
rm -f "$f" "$h"
```

В ответе `alerts.status` должен быть `sent`, а в `alerts.codes` — `["drill"]`. Второй `drill` в тот же час ничего не шлёт (`idle`). Прочитать секрет из Cloudflare нельзя. Если он понадобится снова, выпустите новый: `secret put` в оба места и передеплой Pages.

## Проверка после релиза (только агрегаты)

```sql
-- тики крона: должны быть catalogue и watchdog, next_at в будущем
SELECT task, datetime(next_at / 1000, 'unixepoch') AS next FROM gpt_billing_ops WHERE org_id = 'gptbot-consumer';

-- алерты за сутки: у срочных delivered должен совпадать с n
SELECT code, COUNT(*) AS n, SUM(delivered_at IS NOT NULL) AS delivered
FROM gpt_service_alerts
WHERE org_id = 'gptbot-consumer' AND created_at >= (strftime('%s', 'now') - 86400) * 1000
GROUP BY code ORDER BY n DESC;
```

## Откат

- Слишком много сообщений: `GPT_ALERTS_ENABLED = "false"` (JSON и таблица в `wrangler.toml`), затем деплой. Запись продолжается.
- Остановить крон: `GPT_BILLING_MAINTENANCE_ENABLED = "false"` в `wrangler.automation.toml`, затем деплой Worker'а. Сторож и доставка остаются на неудачных ходах.
- Код: `git revert` и guarded-деплой. Строки `gpt_service_alerts` совместимы в обе стороны.
