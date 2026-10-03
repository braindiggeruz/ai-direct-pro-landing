# Тёмная репетиция покупки (WP-22, R7)

*Платный AI-чат, WP-22, 2026-10-03. Код: `scripts/paid-chat/dark-rehearsal.ts`, `tests/helpers/paid-chat-site.ts`. Тесты: `tests/paid-chat-e2e-rehearsal.test.ts` (слой 1), `tests/paid-chat-dark-rehearsal.test.ts` (слой 2 офлайн). План: `10-PROD-PLAN.md` §4 WP-22, решение L7.*

Покупку проходим целиком, пока ключей владельца нет и до того, как её увидят люди. Провайдер в режиме `test` виден и оплачивается только в сессии репетиции (cookie `__Host-gpt_rehearsal`). Её выдаёт админка или внутренний эндпоинт с Bearer-секретом. Остальные посетители видят `providers: []`, а `subscribe`, вход и шаги окна пакета отвечают им 404.

## Слой 1: тест в процессе

`node --import tsx --test tests/paid-chat-e2e-rehearsal.test.ts`

Тест вызывает те же функции Pages, что и прод: `siteDispatcher` подключает настоящие обработчики маршрутов. Работает на настоящем SQLite. Конфигурация — продовая: настройки биллинга берутся из `wrangler.toml` через `hydrateRuntimeConfig`, поверх них три настройки слоя 2 и креды, которые сгенерировал скрипт. Telegram и модель отвечают внутри теста, Click и Uzum — фейки из `tests/helpers`. Запрос к любому другому хосту падает.

| Сценарий | Что проверено |
|---|---|
| Click `test`, от начала до конца | Посетителю не предлагают ни провайдера, ни входа: `subscribe`, вход и `pack_viewed` — 404. Владелец открывает сессию репетиции из админки и входит через бота. Апдейты `/start login_…` и нажатие числа идут через вебхук бота `/api/telegram/assistant`. Повтор `update_id` второго вопроса не даёт. Чужой браузер попытку не заберёт: без cookie попытки 403, со своей cookie — `expired`. Дальше заказ, Prepare и два Complete одновременно с тестовым секретом: оба прочитали заказ как `prepared`, записывает один, по журналу с `version`. Повторный Complete и вторая транзакция Click дают −4. Пакет на 300 ответов, ход списан из пакета (`period_id` = заказ, `charged=1`). Cookie аккаунта, перенесённая в браузер без cookie репетиции, ведёт в live-контекст: там ни провайдера, ни заказа, ни пакета, ход бесплатный. Чек `skipped_test`, в Click не ушло ни одного вызова. В админке строка `test`, `paid`, чек −2. Затем «Отметить возврат» (повтор: `recorded:false`), пакет отозван. События `paid` и `refunded` лежат в outbox, но владельцу не отправлены |
| Click `test`, отказы | Поддельная подпись, чужой `service_id` → −1, другая сумма → −2, Complete до Prepare → −6, несуществующий заказ → −5. Заказ после этого всё ещё `pending`. Счёт просрочен (12 ч) → −5, пакета нет, в окне счёт «отменён» |
| Click `live` на заглушке `api.click.uz` | Ссылка `my.click.uz` с `service_id`, `merchant_id`, 20000.00 и `return_url`. Подпись тестовым секретом live-заказ не оплачивает (−1). Prepare и Complete с live-секретом, затем очередь чеков: `status_by_mti` → `submit_items` → `ofd_data`. Ссылка чека на ofd.soliq.uz есть в «Paketim». В строке чека ИКПУ `10305008002000000`, упаковка `1514296`, НДС 12 % внутри цены, TIN `310618348`. Владелец получает «AI paket: paid» и «AI paket: refunded». Тестовый заказ, оставшийся от репетиции, после включения live не объявляется |
| Uzum Checkout `test` | Регистрация на тестовом терминале. Колбэк без подписи — только подсказка: пока Uzum говорит REGISTERED, он ничего не меняет. При другой сумме — алерт `uzum_amount_mismatch` и никакой оплаты. Затем COMPLETED → колбэк → pull → пакет; поздний дубль ничего не меняет. Ход из пакета. Чеки продажи и возврата через Fiscalization API на тестовом хосте. «Отметить возврат» не проходит (409 `not_refunded_at_uzum`), пока сам Uzum не скажет REFUNDED. Невыкупленная сессия Uzum закрывается тиком обслуживания |
| Uzum Merchant API `test` | Код оплаты для приложения. Неверный Basic → 10001, другая сумма → 10011. `create`, затем повтор `transId` → 10010. Два `confirm` одновременно: одна оплата, один пакет. `status` → CONFIRMED. Ход из пакета, чек на тестовом хосте. `reverse` отзывает пакет и печатает чек возврата, повтор → 10018. «Отметить возврат» — `recorded:false`. `confirm` через 30 мин после `create` → 10015, заказ закрыт. Телефон плательщика не хранится |

Вручную проверено, что тесты ловят поломки. Тест падает, если:
- снять проверку подписи Click;
- сделать так, что outbox игнорирует режим;
- в `subscribe` не учитывать контекст репетиции;
- печатать тестовые чеки;
- убрать `version` из условия журнала;
- записать возврат Uzum Checkout без слова Uzum;
- отвязать вход через бота от браузера;
- открыть `test` по одной cookie аккаунта.

## Слой 2: прод в тёмном режиме

Слой 2 запускает **ведущий после деплоя сборки R5–R7.** Агент WP-22 его не запускал. Офлайн тот же прогон проверяет `tests/paid-chat-dark-rehearsal.test.ts`. Скрипт:
- не печатает и не пишет в квитанцию значения кредов, cookie, токены, номера заказов и коды оплаты;
- ходит только на `https://gptbot.uz`;
- не следует редиректам.

**Предусловия.** В проде сборка R5–R7, миграции `0069` и `0070` применены, ни один провайдер не в `live`.

1. **Тестовые креды** (вне Git):
   ```
   node --import tsx scripts/paid-chat/dark-rehearsal.ts credentials --out C:/Users/Borinio/.config/gptbot-private/dark-rehearsal
   ```
   Появятся два файла:
   - `GPT_CLICK_CREDENTIALS_JSON.json` — `{"test":{service_id, merchant_id, secret_key, merchant_user_id}}`, id фиктивные `9xxxxxxxx`, ключ — 32 случайных байта;
   - `UZUM_CREDENTIALS_JSON.json` — `{"merchant":{"test":{serviceId, login, password}}}`.

   Папку внутри репозитория скрипт не примет и существующий файл не перезапишет: секрет, который уже положили, остаётся парой к своему файлу.
2. **Секреты, настройки, деплой.**
   - Секреты:
     ```
     python F:/Claude/gptbot-tools/wr.py --stdin <dir>/GPT_CLICK_CREDENTIALS_JSON.json -- pages secret put GPT_CLICK_CREDENTIALS_JSON --project-name ai-direct-pro-landing
     python F:/Claude/gptbot-tools/wr.py --stdin <dir>/UZUM_CREDENTIALS_JSON.json -- pages secret put UZUM_CREDENTIALS_JSON --project-name ai-direct-pro-landing
     ```
     По квитанции R4 этих секретов в Pages нет. Перед `put` проверить по именам: `python F:/Claude/gptbot-tools/wr.py -- pages secret list --project-name ai-direct-pro-landing`. Если хоть один уже есть, его не перетирать: там могут быть ключи владельца. Тогда секреты собирает `scripts/paid-chat/ingest-keys.ts --apply --test-credentials <эта папка>` (WP-23, `ONBOARDING-KEYS-RU.md`): блок `test` идёт рядом с `live`.
   - В `wrangler.toml`, в упакованном JSON и во вложенной таблице: `GPT_BILLING_MODE_CLICK="test"`, `UZUM_API="merchant"`, `GPT_BILLING_MODE_UZUM="test"` (`DARK_REHEARSAL_SETTINGS` в скрипте).
   - Это временный коммит. Тест `gpt-live-readiness` «the committed configuration is inert» на нём падает так и задумано, после шага 4 снова зелёный. `runtime-config` и `pages-config-parity` должны быть зелёными.
   - `npm run build:production` → `deploy_runner.py check` → `deploy`. Live-гейт режим `test` не держит.
3. **Прогон.** Нужен один из двух файлов вне Git:
   - **токен админки** (предпочтительно). Владелец входит на `https://gptbot.uz/admin-tools/login`, значение `localStorage.gptbot_admin_token` сохраняют в файл, например `C:/Users/Borinio/.config/gptbot-private/admin-token.txt`. Токен живёт 12 ч. Он нужен и в шаге 5, файл удалить после него. Если 12 ч к шагу 5 прошли, `verify-off` идёт с `--bearer-file`;
   - **Bearer** `C:/Users/Borinio/.config/gptbot-private/gpt-billing-maintenance-secret.txt`. Без токена админки по нему идут сессия и возврат через внутренние маршруты, но без проверок списка оплат.

   Bearer ещё запускает один тик обслуживания (режимы провайдеров в квитанции), а с `--drill` — учебный алерт. Без `--bearer-file` скрипт `--drill` не примет и не сделает ни одного запроса. Учебный алерт записывается не чаще раза в час (по часу UTC). Если в этом часу его уже отправляли, шаг `drill` упадёт с `drill not sent`: повторить прогон в следующем часу.
   ```
   node --import tsx scripts/paid-chat/dark-rehearsal.ts run --site https://gptbot.uz \
     --credentials C:/Users/Borinio/.config/gptbot-private/dark-rehearsal \
     --admin-token-file C:/Users/Borinio/.config/gptbot-private/admin-token.txt \
     --bearer-file C:/Users/Borinio/.config/gptbot-private/gpt-billing-maintenance-secret.txt --drill
   ```
   Шаги прогона:
   - **Click.** Посетитель ничего не видит. Сессия репетиции с синтетическим аккаунтом `acct_rh_…`, тестовый заказ. Prepare с поддельной подписью (−1), с другой суммой (−2), правильный (0). Два Complete одновременно, повтор (−4). Пакет на 300 ответов. Строка админки: `test`, `paid`, репетиция, чек −2. «Отметить возврат» и его повтор. Пакет отозван. Браузер с одной cookie аккаунта ничего не видит.
   - **Uzum Merchant.** Код оплаты из сессии, затем 22 шага Uzum Bank из `uzum-sandbox-rehearsal.ts`: отказы, потерянный `confirm`, `status`, `reverse`, замена неподтверждённой транзакции. В конце пакета нет.
   - **Квитанция.** `docs/paid-chat/releases/R7-dark-rehearsal.json`: шаги, режимы, строки по режиму и провайдеру, агрегаты для ведущего. Код выхода 1, если хоть один шаг упал.
   - **По желанию — владелец.** В админке «Сессия репетиции», затем экраны окна пакета 375×812 RU и UZ. Вход через бота настоящий. Cookie репетиции никому не передавать.
4. **Выключение.** Вернуть три настройки в `""` (`git revert` временного коммита) → сборка → деплой.
5. **Проверка выключения:**
   ```
   node --import tsx scripts/paid-chat/dark-rehearsal.ts verify-off --site https://gptbot.uz --admin-token-file <файл>   # или --bearer-file <файл>
   ```
   Проверяется:
   - `providers: []`, входа нет;
   - `subscribe` click/uzum, колбэк Click и вебхук Uzum Merchant → 404;
   - сессию репетиции не открыть (админка 409, Bearer 404).

   Фаза `after_off` дописывается в ту же квитанцию. `F:/Claude/gptbot-tools/paid-chat/inert-smoke.mjs` снова зелёный.
6. **Агрегаты.** Только чтение, без текстов и id: `python F:/Claude/gptbot-tools/wr.py -- d1 execute gptbot-ai-drafts --remote --json --command "<sql>"`. SQL и ожидаемые значения лежат в квитанции (`lead_aggregates`):
   - заказы по режиму, провайдеру и состоянию: live-строк нет;
   - шаги окна пакета в `gpt_ui_events` с начала прогона: нет, если владелец не ходил по экранам;
   - доставленные владельцу события тестовых заказов: 0.

   Владелец подтверждает, что сообщений «AI paket: …» за время прогона не было, а учебный алерт пришёл.

Секреты с тестовыми блоками после прогона можно оставить: без режима они инертны (`providerMode` = null, маршруты 404). Строки `mode='test'` и аккаунты `acct_rh_*` остаются в D1. Админка помечает их как тестовые и репетиционные, а outbox их не доставляет.

## Офлайн

```
node --import tsx scripts/paid-chat/dark-rehearsal.ts run --simulate local [--receipt <файл>]
```
Скрипт поднимает обработчики сайта на 127.0.0.1 над временным SQLite. Конфигурация как у прода после шага 2. Креды, токен админки и Bearer-секрет генерируются во временную папку и удаляются после прогона. Затем выполняются шаги 3 и 5 по HTTP. В этом режиме fetch ходит только на заглушку. Telegram отвечает внутри процесса, и его сообщения проверяются: о тестовом заказе владелец не узнаёт. Тот же режим гоняет `tests/paid-chat-dark-rehearsal.test.ts`.

## Чего репетиция не проверяет

- Настоящие серверы Click и Uzum: их подписи, тайминги и ответы кабинета. Это S1 и S3 по runbook WP-23 с ключами владельца: 15 сценариев Click и тесты Uzum.
- Фискализацию в проде: тестовые заказы `skipped_test`. Печать проверена слоем 1 на заглушках, живой чек будет на первой покупке владельца (S2).
- Ход в чате в проде: вызов модели тратит бюджет, а списание из пакета проверяет слой 1.
- Deep link Telegram на iOS и Android: только если владелец пройдёт экраны в шаге 3.
