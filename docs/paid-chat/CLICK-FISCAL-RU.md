# Чеки Click (ОФД) и возврат через Merchant API

*WP-14 плана «AI-чат + оплата», 2026-10-01 (D3). Код: `functions/lib/gpt-chat/click-merchant.ts` (клиент Click), `fiscal-store.ts` (очередь чеков), `functions/api/payments/click.ts` (запуск после оплаты), `functions/api/internal/gpt-click-reversal.ts` (возврат), `migrations/0068_gpt_paid_chat.sql`. Тесты: `tests/gpt-click-fiscal.test.ts`, `tests/gpt-paid-chat-schema.test.ts`. Источник: docs.click.uz, Merchant API, разделы «Подключение и выполнение запросов» и «Фискализация товаров и услуг».*

## Коротко

- Каждая **боевая** оплата Click получает фискальный чек ОФД. Ссылка на него (`https://ofd.soliq.uz/...`) появляется у покупателя в окне «Мой пакет».
- Тестовые оплаты не пробиваются: их строка сразу помечена `skipped_test`.
- Чек пробивается сразу после того, как Click подтвердил оплату (Complete). Если не вышло, крон обслуживания повторяет попытку каждые 15 минут по расписанию повторов (ниже).
- Один чек на оплату: повторный Complete, два параллельных обработчика и потерянный ответ Click второй чек не создают.
- Если чек не удаётся пробить 6 попыток подряд или сутки после оплаты, вам приходит срочный алерт `click_fiscal_failed`.

## Что уходит в чек

| Поле Click | Значение |
|---|---|
| `Name` | `AI paket 300 (xizmat, 1 oy)` |
| `SPIC` | `GPT_FISCAL_IKPU` = 10305008002000000 |
| `PackageCode` | `GPT_FISCAL_PACKAGE_CODE` = 1514296 («услуга (раз)») |
| `Price` | 2 000 000 тийин (20 000 сум, весь пакет) |
| `Amount` | 1 |
| `VAT`, `VATPercent` | 214 286 тийин (2 142,86 сум) при `GPT_FISCAL_VAT_PERCENT` = 12: НДС входит в цену |
| `CommissionInfo` | `TIN` = `GPT_FISCAL_TIN` (9 цифр) или `PINFL` (14 цифр) |
| `received_card` | 2 000 000; `received_cash` и `received_ecash` = 0 |

`payment_id` (номер платежа в Click) мы не угадываем: берём его у Click по номеру нашего заказа (`status_by_mti`) и сохраняем.

## Что нужно, чтобы чеки шли

1. В кабинете Click включён Merchant API, и в секрете `GPT_CLICK_CREDENTIALS_JSON` в блоке `live` есть `merchant_user_id`. Подпись делается тем же `secret_key`.
2. `GPT_FISCAL_IKPU`, `GPT_FISCAL_PACKAGE_CODE`, `GPT_FISCAL_VAT_PERCENT`, `GPT_FISCAL_TIN` (уже в `wrangler.toml`).
3. Работает крон обслуживания: `GPT_BILLING_MAINTENANCE_SECRET` на Pages и в Worker'е, `GPT_BILLING_MAINTENANCE_ENABLED="true"` в Worker'е.

Без пунктов 1 и 2 Click в live не откроется: `liveReadiness()` называет недостающие имена. Если их убрать уже после продаж, чеки оплаченных заказов не теряются: строки ждут в очереди с `last_error = config_missing`, а через 6 попыток придёт алерт. Выключение продаж Click (`GPT_BILLING_MODE_CLICK`) печать чеков не останавливает.

## Как работает очередь

Таблица `gpt_fiscal_receipts`, одна строка `PERFORM` на оплаченный заказ Click. Строка создаётся в той же транзакции, что переводит заказ в `paid`.

| `status_code` | Что значит |
|---|---|
| `-1` | ждёт печати |
| `0` | напечатан, `receipt_url` — ссылка на ofd.soliq.uz |
| `-2` | не печатается: `skipped_test` (тестовый заказ) или `skipped_refunded` (деньги вернули раньше, чем пробился чек) |

Попытка: найти `payment_id` → при повторе сначала спросить у Click, нет ли чека уже → отправить позицию (`submit_items`), если раньше Click её не принимал → получить ссылку (`ofd_data`). Чек считается напечатанным, только если Click вернул `error_code = 0` и ссылку на `https://ofd.soliq.uz`. Ссылку на другой хост мы не показываем.

Повторы после неудачи: через 1, 5, 15, 60 минут, дальше каждые 6 часов. Крон берёт не больше 5 чеков за тик. Шаг `fiscal` идёт параллельно с проверкой моделей и сторожем: новые чеки он начинает только в первые 5 секунд тика и укладывается в 8 секунд, даже если Click отвечает медленно.

Коды в `last_error` (без текстов и ключей): `config_missing`; `payment_id:<причина>` — Click не нашёл платёж; `submit:<причина>` — Click не принял чек; `ofd:<причина>` — не удалось прочитать ссылку; `qr_pending` — чек принят, ссылки ещё нет; `qr_host` — ссылка не на ofd.soliq.uz. Причина: `network`, `http_<код>`, `click_<error_code>`, `shape`.

Тик обслуживания показывает очередь в поле `fiscal`: `printed`, `retried`, `skipped`, `queued`, `failing` (ждут после 6+ попыток).

## Если чек не пробивается

Повторы сами не прекращаются. Пока строка в статусе `-1`, после шестой неудачи каждая следующая попытка (раз в 6 часов) снова присылает `click_fiscal_failed`. Что делать:

1. Узнать причину, только чтение: `SELECT last_error, attempts, COUNT(*) AS n FROM gpt_fiscal_receipts WHERE provider = 'click' AND status_code = -1 GROUP BY last_error, attempts;`
2. `config_missing` — вернуть `merchant_user_id` в `GPT_CLICK_CREDENTIALS_JSON` или значения `GPT_FISCAL_*`. `click_<код>` и `qr_host` — вопрос к Click с этим кодом. После исправления очередь сама допечатает чек, трогать ничего не нужно.
3. Если чек пробили другим путём (кабинет Click, бухгалтер), строку закрывают вручную, только с согласия владельца: `UPDATE gpt_fiscal_receipts SET status_code = -2, last_error = 'manual', lease_until = 0 WHERE org_id = 'gptbot-consumer' AND kind = 'PERFORM' AND status_code = -1 AND order_id = '<pay_…>';`. После этого алерты прекращаются. Строку не удаляют.

## Проверка на первой живой оплате (шаг S2)

Через ≤ 15 минут после покупки (обычно сразу) — запрос только для чтения, без номеров заказов:

```sql
SELECT r.status_code, r.attempts, r.last_error,
       r.payment_id = o.external_id AS payment_id_is_click_trans_id,
       r.receipt_url IS NOT NULL AS has_link
FROM gpt_fiscal_receipts r JOIN gpt_payment_orders o ON o.org_id = r.org_id AND o.id = r.order_id
WHERE r.provider = 'click' AND o.mode = 'live' ORDER BY o.perform_time DESC LIMIT 1;
```

Затем откройте ссылку из «Мой пакет» и сверьте в чеке: сумма 20 000, НДС 2 142,86, ИКПУ, количество 1, ИНН продавца. Ответ на `payment_id_is_click_trans_id` закрывает вопрос к Click о том, какой это номер.

## Возврат через API (для агента, не кнопка админки)

Только для исключений оферты (раздел 8, WP-25): оплаченный пакет не возвращается, Продавец возвращает лишь деньги, списанные по ошибке (дважды за одну покупку или без пакета), — целиком, на ту же карту, не позднее 10 рабочих дней со дня обращения, — и случаи, когда возврат прямо требует закон. Запроса возврата у покупателя на сайте нет.

`POST https://gptbot.uz/api/internal/gpt-click-reversal`, заголовок `Authorization: Bearer <GPT_BILLING_MAINTENANCE_SECRET>`, тело `{"orderId":"pay_…","version":<версия заказа>,"confirmReversal":true}`. `version` — текущее `gpt_payment_orders.version` заказа: если заказ изменился, ответ 409 `version_changed`.

- `200 {reversed:true}` — Click вернул деньги, заказ `refunded`, доступ отозван, вам ушло уведомление. Поле `receiptPrinted: true` значит, что чек продажи уже был пробит: чек возврата Click не описывает, решите его с бухгалтером.
- `200 {reversed:false, state:"refunded"}` — заказ уже возвращён, Click не вызывали.
- `502 click_reversal_failed` — Click отказал (поле `click` — код). Условия Click: платёж онлайн-картой, текущий отчётный месяц (прошлый — только 1-го числа), UZCARD может отклонить. Сначала перечитайте заказ: если он уже `refunded`, возврат сделал параллельный вызов, повторять ничего не нужно (второй возврат того же платежа Click отклоняет). Иначе возврат делается в кабинете Click и отмечается через `gpt-click-refund-record`.
- `503 record_failed` с `reversed:true` — деньги вернулись, а запись не прошла: отметьте возврат через `gpt-click-refund-record`.

## Вопросы к Click (план §8, п. 5)

1. `payment_id` для `ofd_data` — это `click_trans_id` или `click_paydoc_id`? (Мы берём его через `status_by_mti`; первая оплата ответит.)
2. `Amount` — штуки (1) или тысячные (1000)?
3. Для оплаты кошельком Click — `received_card` или `received_ecash`?
4. Обязателен ли `CommissionInfo` при продаже собственной услуги?
5. Как фискализируется отмена через `payment/reversal`?
6. Есть ли отдельный тестовый сервис для Merchant API?
