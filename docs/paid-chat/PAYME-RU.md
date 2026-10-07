# Payme: действующая интеграция GPTBot.uz

Актуальный этап07.10.2026: владелец подтвердил активацию кассы и включение Payme для чата и двух тарифов Studio. До этого Payme временно был hidden/test. Подробные доказательства и факт выпуска: `docs/PAYME_ACTIVATION_20261007.md`; старое разрешение запустить без сдачи песочницы больше не является основанием этого запуска.

## Касса и адреса

- Merchant API, одна касса: `https://gptbot.uz/api/payments/payme`.
- Поле account: `order_id`, текст до36 символов; `pay_` и32 hex — чат, `stu_` и32 hex — Studio. Не ограничивать поле только числовыми значениями.
- Боевой checkout: `https://checkout.paycom.uz`; тестовый: `https://test.paycom.uz`. Суммы в параметре `a` — тийины.
- Чат:20 000 сум /2 000 000 тийин; Kunlik:5 900/590 000; Oylik:39 900/3 990 000. Сумма и название чека определяются существующим заказом и версией тарифа.

## Конфигурация запуска

`GPT_PAYMENT_PROVIDERS=click,payme`, `GPT_BILLING_MODE_PAYME=live`, Click live/Uzum off, `GPT_BILLING_LIVE_READY=true`. GPT packed JSON и обычная таблица wrangler должны совпадать. Studio: `STUDIO_PAYMENTS=live`, `STUDIO_PAYMENT_PROVIDERS=click,payme`; paid service/full deck on, photo off. Условия обеих систем: `ai-paket-2026-10-v5`, одобрение07.10.2026. Стоп-условия готовности обязательны, не обходить их.

Секреты только в Cloudflare: `GPT_PAYME_MERCHANT_ID`, `GPT_PAYME_KEY`, `GPT_PAYME_TEST_KEY`. Проверка их формы/наличия не доказывает кассу; callback auth проверен отдельно без денежных действий. В чате ключи повторно не запрашивать и не печатать. Публичное API сообщает только доступные способы оплаты.

## Корректность денежных событий

Basic auth проверяется до D1. CheckPerform/Create принимают только новый заказ текущего режима и точную сумму; transaction ID принадлежит одному продукту. Create/Perform/Cancel идемпотентны. Платёж выдаёт права один раз; отмена отзывает соответствующий пакет. Неправильная авторизация -32504, неверная сумма -31001, неизвестный/неподходящий order_id -31050, неизвестная транзакция -31003. Начатые операции заканчиваются даже после остановки продаж; для другого режима допускается только его settlement.

## Фискализация

Payme печатает чек по `detail.items` из CheckPerformTransaction: ИКПУ10305008002000000, упаковка1514296, НДС12% включён. Каждый продукт отдаёт своё название и сумму. Наша очередь повторный чек Payme не выпускает. SetFiscalData сохраняет информацию чека, поиск чека идёт по Payme transaction ID. По фактической оплате проверить фискальный чек у покупателя/в Payme и его callback; сообщение «касса активирована» не подтверждает настройку фискализации. Алерты: `payme_fiscal_failed`, `payme_processing`.

## Выпуск и контроль

Штатные commit → build:production → deploy_runner.py check → deploy; DR_ROOT указывает integration checkout. Затем полный release marker/readback, публичные providers chat/Studio, UI RU/UZ, checkout всех3 сумм и callback detail. Реальную оплату выполняет владелец, затем сверяются права, заказ и чек. Не симулировать paid через production PerformTransaction. Сведения о подтверждённых проверках читать в актуальном release report.

## Откат и возврат

Вернуть mode Payme в test в packed JSON и таблице, штатно выпустить. Payme исчезает из продаж, Click остаётся. Не выключать endpoint/ключи и не убирать Payme из внутреннего allowlist: production key продолжает доводить боевые транзакции. Реальный возврат выполняет владелец в кабинете Payme; CancelTransaction синхронизирует права. Не подменять возврат ручной записью админки. Полное выключение адреса допустимо только после сверки всех открытых операций.

Источники: [Merchant API](https://developer.help.paycom.uz/protokol-merchant-api/), [песочница и последовательность проверки](https://developer.help.paycom.uz/pesochnitsa/), [параметры GET checkout](https://developer.help.paycom.uz/initsializatsiya-platezhey/otpravka-cheka-po-metodu-get/).
