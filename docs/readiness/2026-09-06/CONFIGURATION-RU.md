# Подключение подготовленного контура

Сервис: https://gptbot.uz. Production Pages: ai-direct-pro-landing. D1: gptbot-ai-drafts. Секреты — только Cloudflare secret storage, не публичная группа интеграторов и не Git.

## Что передать интеграторам

- Click Prepare и Complete: `https://gptbot.uz/api/payments/click`, POST form-urlencoded, action 0/1.
- Payme Merchant API: `https://gptbot.uz/api/payments/payme`, POST JSON-RPC, Basic authorization. Счёт: `account.order_id`; сумма 2 000 000 тийин за выбранный пакет. Реализованы CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction, GetStatement, SetFiscalData.
- Callback Telegram Login: `https://gptbot.uz/api/gpt/auth/callback`. В BotFather нужны Login Client ID/Secret и разрешённый callback. Не менять webhook существующих ботов.
- Возврат браузера: RU `/ru/gpt-chat/`, UZ `/uz/gpt-uzbek-tilida/`. Подтверждение оплаты приходит серверным callback, не параметром URL.

Просим у каждого платёжного провайдера подтвердить версию протокола, тестовые реквизиты/сценарии, production реквизиты, разрешённые endpoint URLs, фискальные параметры, правила возврата и сверки, комиссии, процедуру допуска в live. У Payme автосписание через Subscribe API — отдельное согласование; текущий продукт работает с ручным продлением.

## Переменные Pages

| Название | Смысл |
|---|---|
| GPT_BILLING_MODE | Отсутствует = checkout выключен. `test` — только изолированный тестовый контур; `live` — реальные callbacks и контур |
| GPT_BILLING_LIVE_READY | Только `true` вместе с ключами и актуальными условиями разрешает новые live checkout. Это операционный допуск, не автоматическое доказательство приёмки |
| GPT_TELEGRAM_CLIENT_ID / GPT_TELEGRAM_CLIENT_SECRET | Telegram Login; не Bot API token |
| GPT_IDENTITY_SECRET | Случайный секрет минимум 32 символа для устойчивого псевдонима; генерирует инженер и сохраняет защищённо. Не менять без плана миграции идентичностей |
| GPT_PAYME_MERCHANT_ID / GPT_PAYME_TEST_KEY / GPT_PAYME_KEY | Касса, тестовый ключ, production ключ |
| GPT_CLICK_TEST_SERVICE_ID / GPT_CLICK_TEST_SECRET | Тестовый Click |
| GPT_CLICK_SERVICE_ID / GPT_CLICK_MERCHANT_ID / GPT_CLICK_SECRET | Production Click |
| GPT_BILLING_TERMS_RU / GPT_BILLING_TERMS_UZ | Опубликованные и утверждённые абсолютные HTTPS URL на gptbot.uz; другие origin/порт запрещены |
| GPT_BILLING_TERMS_VERSION | Версия утверждённого предложения: 1–80 латинских букв, цифр, точек, дефисов/подчёркиваний. Новая версия снимает старое согласие |
| OPENROUTER_API_KEY | Имеющийся серверный ключ; лимит расходов и реальный баланс проверяются отдельно |
| GPT_NOTIFY_BOT_TOKEN / GPT_NOTIFY_CHAT_ID | Уведомления владельцу; тексты разговоров не включаются. Тестовый контур не отправляет сообщения |
| GPT_BILLING_MAINTENANCE_SECRET | Отдельный ключ для внутреннего обслуживания/диагностики; не merchant secret |

Несекретные production vars обязательно согласовать с авторитетным wrangler.toml перед выпуском: ручной dashboard-only параметр может исчезнуть при upload. Секреты сохраняются через secret storage. Не включать test на live-сайте и не использовать его D1 для sandbox: глобальные cooldown/аккаунты — общие для выбранной БД. Приёмку проводить на отдельной тестовой БД/preview с test-ключами. Локальный rehearsal содержит только синтетические данные и вообще не загружает .env.

## Обслуживание и безопасная остановка продаж

В существующем automation worker есть опциональный вызов Pages `/api/internal/gpt-billing-maintenance`. Включение требует `GPT_BILLING_MAINTENANCE_ENABLED=true` и совпадающего maintenance secret на worker/Pages. Сам worker в этом выпуске отдельно не разворачивается и расписание не считается запущенным. Сначала проверить Pages-вызов и dry-run/тестовые уведомления, затем существующее расписание. Отдельный новый backend не нужен.

Чтобы остановить новые продажи, выключить GPT_BILLING_LIVE_READY, сохранив live mode/ключи/обработчики для уже созданных платежей и сверки. Не удалять финансовые таблицы. Возврат приложения допустим после согласования pending-транзакций; rollback URL/commit фиксируется в release receipt.

Пользовательская заявка на возврат не возвращает деньги сама. Payme подтверждает возврат своим callback. Для Click внутренний `/api/internal/gpt-click-refund-record` фиксирует возврат только после фактической операции у провайдера и требует отдельной служебной авторизации. Не нажимать его как способ «сделать возврат» без подтверждения провайдера.

## Приёмка до публичного включения

1. Настоящий Telegram Login → выход → вход на другом устройстве → тот же доступ; чужая история не показывается.
2. Sandbox invoice → Prepare/Create → Complete/Perform → ровно один период; повтор callback и повторный клик не удваивают период.
3. Неверная подпись/сумма/чужой заказ отвергаются; interruption и delayed callback восстанавливают тот же счёт.
4. Продление ставит следующий календарный период; отмена/возврат отзывают свой период; фискальный чек и кабинет провайдера согласованы.
5. После merchant acceptance провести согласованный реальный платёж и возврат. Зафиксировать ID транзакции только в защищённой операционной записи, не в публичной аналитике.
6. Убедиться, что лимиты/качество RU/UZ, cost cap и воронка работают; только затем включать публичные продажи.

Это конкретные настройки оставшегося подключения, а не подтверждение, что реквизиты уже получены или оплата работает в live.
