# Ревью Uzum (пакет C) по спецификации и доводка, октябрь 2026

*WP-15 плана `10-PROD-PLAN.md` (релиз R4), 2026-10-02. Сверялся код `functions/lib/gpt-chat/uzum-*.ts`, `payment-code-store.ts`, `fiscal-store.ts`, `functions/api/payments/uzum.ts`, `functions/api/payments/uzum-merchant/[op].ts`, `functions/api/internal/gpt-uzum-refund.ts`, `functions/api/gpt/{subscribe,account}.ts`, миграции `0065` и `0068` с тремя публичными спецификациями из `docs/paid-chat/uzum-spec/`: Uzum Checkout 1.10.3, Merchant API 1.0.0, Fiscalization 0.0.2 (скачаны 2026-09-30). Дефекты U1–U14 — из карты `02-billing-payments-login.md` §4.4. Как включать и обслуживать — `UZUM-RU.md`.*

## 1. Итог

- Открытых дефектов High и Medium нет. U1–U13 закрыты в коде и тестах, по U14 принято решение (раздел 3).
- Оба режима готовы к продакшену до получения ключей: Checkout (`UZUM_API=checkout`, `X-Terminal-Id` + `X-API-Key`) и Merchant API (`UZUM_API=merchant`, Basic). Чек есть у обоих: автофискализация Uzum или Fiscalization API.
- Без режима, `UZUM_API` и кредов все адреса Uzum отвечают 404 до чтения тела и до D1; крон Uzum возвращает `null`, не трогая D1; кнопки Uzum нет.
- Пакет доведён, а не переписан: машина состояний, журнал, периоды доступа и outbox общие с Click (`billing-store.ts`).

## 2. Соответствие спецификации

### 2.1. Uzum Checkout 1.10.3

| Операция | Что шлём или принимаем | Итог |
|---|---|---|
| `POST /api/v1/payment/register` | `X-Terminal-Id`, `X-API-Key`, `Content-Language` ru-RU / uz-UZ. `OrderPaymentRequest`: `amount` 2 000 000, `clientId` = псевдоним `acct_…`, `currency` 860, `orderNumber` `uzm_`+32 hex (36 символов, максимум спеки), `paymentDetails`, `successUrl`/`failureUrl` = страница чата `?pay=return`, `viewType` REDIRECT, `paymentParams.payType` ONE_STEP, `sessionTimeoutSecs` 1800 (600..1800). `merchantParams.cart` (`cartId`, `receiptType` PURCHASE, `total`, `items[{title, productId, quantity, unitPrice, total, receiptParams{spic(17), packageCode(≤20), vatPercent}}]`) — только при автофискализации. Ответ: `orderId` (uuid) и `paymentRedirectUrl` по allowlist хостов Uzum | соответствует |
| `POST /api/v1/payment/getOrderStatus` | Проверяются все обязательные поля `GetOrderStatusResponse`, кроме `operations` (не нужен: решение по суммам). Доступ — только `COMPLETED` с полной суммой и нашим `merchantOrderId` | соответствует, мягче по `operations` |
| `POST /api/v1/payment/getReceipts` | `receipts[{receiptUrl, receiptType}]`; ссылка — только `https://ofd.soliq.uz` или хост Uzum | соответствует |
| `POST /api/v1/acquiring/refund` | `X-Operation-Id` создаётся и сохраняется до вызова, повтор — тот же ключ, 3028 = принятый повтор. `RefundRequest{orderId, amount, cart?}`; `cart` (`FiscalizationCartRequest{total, items[{productId, quantity, receiptParams}]}`) — ровно для заказа, зарегистрированного с корзиной (иначе 3045 или 3058) | соответствует |
| Колбэк `AcquiringCallbackData` | Подписи в спеке нет, поэтому колбэк — подсказка: заказ ищется по обоим номерам, затем свой `getOrderStatus`. Ответ 200; 502 при сбое запроса, чтобы Uzum повторил (до 5 раз). Неизвестный или чужой заказ — 200 без запросов наружу | соответствует |
| Колбэк `ReceiptGeneratedCallbackData` | Только для заказа с автофискализацией и только после подтверждения через `getReceipts` | соответствует |

Не используются: двухстадийная оплата, привязка карт, `merchantPay`, `purchaseReceipt`, `/acquiring/reverse` (только для двухстадийной).

### 2.2. Merchant API 1.0.0

| Вебхук | Запрос | Ответ | Коды |
|---|---|---|---|
| все | `Authorization: Basic …` | Basic проверяется до тела и D1: схема в любом регистре, сравнение декодированных `login:password` за постоянное время (U9) | 10001; 10003 — неизвестная операция; 10002 — не JSON; 10005 — нет обязательного поля; 10006 — чужой `serviceId` |
| `/check` | `serviceId`, `timestamp`, `params.account` (числом или строкой, U1) | `{serviceId, timestamp, status: OK, data: {account: {value}, product: {value: "AI paket 300"}}}` | 10007 — опечатка, чужой код, оферта не принята, синтетический аккаунт в live; 10008 — у аккаунта идёт другая оплата (U10, U7); 99999 — продажи остановлены |
| `/create` | `transId`, `amount`, `params.account` | `{serviceId, transId, status: CREATED, transTime, amount}`; заказ создаётся на лету, `request_id = transId` | 10010 — повтор `transId`; 10011 — сумма не 2 000 000; 10007, 10008, 99999 — как в `/check` |
| `/confirm` | `transId`, `paymentSource`, `phone` (не хранится) | `{CONFIRMED, confirmTime, amount}`; `confirm_requested_at` пишется до `paid` (U8) | 10014, 10015 (отменена или 30 минут без подтверждения), 10016 (уже подтверждена) |
| `/reverse` | `transId` | `{REVERSED, reverseTime, amount}`; после оплаты — возврат с закрытием пакета и чеком возврата | 10014, 10018 (уже отменена). 10017 не нужен: отменить можно в любом состоянии |
| `/status` | `transId` | `{CREATED / CONFIRMED / REVERSED, transTime, confirmTime \| null, reverseTime \| null, amount}`; незавершённое подтверждение довершается (U8) | `FAILED` 10015 — правило 30 минут или замена новой оплатой; 10014 |

Ошибки — HTTP 400 и `errorCode` строкой; внутренний сбой — 99999 с HTTP 500, после чего Uzum спрашивает `/status`. Коды 10012 и 10013 не используются: цена фиксированная, любое расхождение — 10011.

### 2.3. Fiscalization 0.0.2

| Метод | Что шлём | Ответы |
|---|---|---|
| `POST /v2/receipt` | `X-API-Key`; `payment_id` (uuid платежа Uzum), `operation_id` (наш uuid, сохранён до вызова), `date_time` (момент оплаты, Ташкент `+05:00`, в пределах суток после подтверждения), `cash_amount` 0, `card_amount` 2 000 000, `items[{product_name ≤ 63, price, count 1, spic, package_code, vat_percent}]`, `receipt_type` 0 | 200 со ссылкой — напечатан; 200 без ссылки и 202 — принят, ссылка позже; 400 `code: 2` — уже был, спрашиваем ссылку; 400 `code: 1` — неверные ИКПУ или упаковка; 403, 422, 500 — повтор с бэкоффом |
| `POST /v2/refund_receipt` | те же поля без `receipt_type`; `payment_id` — как у чека продажи, `date_time` — момент возврата | как выше; 404 — чека продажи нет, повтор |
| `GET /v2/receipt/{operation_id}/receipt_url` | — | 200 — ссылка; 202 — ещё печатается; 404 — не получен |

Хосты из раздела Testing: тест `https://test-ofd.ipt-merch.com`, бой `https://ofd-key.inplat-tech.com`. В том же разделе путь получения ссылки записан как `/v2/receipt_url/{operation_id}`, а в списке путей — `/v2/receipt/{operation_id}/receipt_url`; вызываем путь из списка (вопрос к Uzum). Не передаются: `phone_number` (телефон не храним, кэшбэка нет), `ppt_id`, `card_type`, `commission_info` (своя продажа, U14), `owner_type` (необязательный, вопрос к Uzum), `discount`, `voucher`, `labels` (услуга без маркировки).

## 3. Дефекты U1–U14 и смежные пункты

| # | Было | Что сделано | Где |
|---|---|---|---|
| U1 | Код заказа `uzm_…` в приложении; числовой `account` отвергался; экрана нет | Постоянный код аккаунта `gpt_payment_codes`: 8 случайных цифр + контрольная Луна, `PRIMARY KEY(org_id, code)`, `UNIQUE(org_id, user_id)`, с офертой, которую человек принял. `/check` принимает число и строку, `/create` создаёт заказ на лету. `subscribe` → `{mode: "code", paymentCode}`, `account` → `uzumFlow: "code"` и `paymentCode`. Экран — WP-17 | `payment-code-store.ts`, `[op].ts`, `subscribe.ts`, `account.ts` |
| U2 | Merchant API без чека | Клиент Fiscalization API и общая очередь чеков (`provider='uzum'`, `PERFORM` и `CANCEL`), `operation_id` до вызова | `uzum-fiscal.ts`, `fiscal-store.ts`, `billing-store.ts` |
| U3 | Live Checkout без чека разрешён | Live требует автофискализацию **или** ключ Fiscalization API (тогда чек печатаем мы). Кто печатает — записано в заказ при регистрации (`autofiscal`) | `billing-config.ts`, `uzum-store.ts` |
| U4 | Просроченный `prepared` закрывался без запроса | Перед закрытием — `getOrderStatus`; Uzum недоступен — ничего не закрывается. Крон сверяет зарегистрированные заказы через 35 минут | `uzum-store.ts` `createOrder`, `uzum-maintenance.ts` |
| U5 | В тесте не было ссылки на оплату | В тесте Checkout регистрирует заказ на тестовом терминале и отдаёт `checkoutUrl` (только сессии репетиции) | `subscribe.ts` |
| U6 | Алерты не писались в тесте | Закрыто в Б7 (WP-13): `recordServiceAlert` пишет в любом режиме; тестовые чеки сами алертов не создают | — |
| U7 | Две оплаты у разных провайдеров | WP-13 закрыл для сайта; для приложения: невиденный провайдером счёт закрывается, неподтверждённая оплата в приложении заменяется, остальное — 10008 | `uzum-store.ts` `appPaymentAction` |
| U8 | Сбой `/confirm` превращался в отмену | `confirm_requested_at` до `paid`; `/status` и повторный `/confirm` довершают; крон через 10 минут довершает и шлёт `uzum_confirm_recovered` | `[op].ts`, `uzum-maintenance.ts` |
| U9 | Basic как точная строка | Схема без учёта регистра, декодирование, сравнение за постоянное время | `uzum-config.ts` `merchantAuthorized` |
| U10 | `/check` отвечал 10008 по смыслу «оплачено» на заказ в процессе | С кодами аккаунта `/check` не смотрит на заказ: 10008 — только если у аккаунта идёт оплата, которую нельзя заменить | `[op].ts` |
| U11 | Чек виден только при дошедшем колбэке | `getReceipts` при открытии панели и в кроне (48 часов), через сутки без чека — `uzum_receipt_missing` | `account.ts`, `uzum-maintenance.ts` |
| U12 | Боевой адрес не из настроек | Адрес Checkout — `UZUM_CHECKOUT_BASE_URL` (боевого значения по умолчанию нет); адреса Fiscalization API — `UZUM_FISCAL_BASE_URL`, `UZUM_FISCAL_TEST_BASE_URL` с умолчаниями из спеки; все за allowlist | `uzum-config.ts`, `wrangler.toml` |
| U13 | `seq` пересекается между таблицами | Сортировка по `(created_at, provider, id)` | `billing-store.ts` |
| U14 | TIN/PINFL комитента не передаются | Решение: не передаём. Мы продаём свою услугу, а не как комиссионер; в обеих спеках поле — данные принципала. Вопрос Uzum в `UZUM-RU.md` §2 | — |
| Б9 | DDL Uzum на каждом ходе чата | Перепроверено: `ensureUzumSchema` вызывают только пути Uzum (колбэк, вебхуки, возврат, ветки Uzum в `account` и `subscribe`, шаг `uzum` крона); в `ensureBillingSchema` объектов Uzum нет (тест в `gpt-paid-chat-schema`) | `billing-schema.ts` |
| WP-14 | `allowedUzumReceipt` пропускал любой поддомен `soliq.uz` | То же правило, что у панели: ровно `ofd.soliq.uz` или хост Uzum | `uzum-config.ts` |

## 4. Чек-лист безопасности

- **Инертность.** Нет режима, `UZUM_API` или кредов — 404 до тела и D1 (тесты подают тело потоком, который нельзя читать, и D1, который нельзя трогать). Крон Uzum и витрина без D1.
- **Ключи.** Один секрет `UZUM_CREDENTIALS_JSON`; значения не логируются, в `last_error` только грубые коды, `liveReadiness()` отдаёт только имена. Ключи уходят только на хосты из allowlist: Checkout (`uzumbank.uz`, `uzumcheckout.uz`, `uzum.uz`), Fiscalization API (ещё `ipt-merch.com`, `inplat-tech.com`); только https, без порта, логина и query; перенаправление не выполняется (`redirect: "manual"`, ответ 3xx — сбой; режима `"error"` в workerd нет, раньше из-за него каждый вызов падал ещё до отправки); таймаут 8 секунд; ответ не больше 64 и 16 КБ.
- **Подлинность.** Колбэк Checkout денег не двигает: решает свой `getOrderStatus`. Неизвестный заказ не вызывает запросов наружу (нельзя заставить нас звонить в Uzum). Лимит 300 колбэков в час на IP. Вебхуки Merchant API — Basic за постоянное время до тела и D1.
- **Идемпотентность (AGENTS §4).** `UNIQUE(org_id, provider, mode, external_id)`; журнал-гейт на каждом переходе; повтор `transId` — 10010; `X-Operation-Id` и `operation_id` сохраняются до вызова; чек — `PRIMARY KEY(org_id, order_id, kind)`; половинчатый `/create` с тем же `transId` подхватывается.
- **Изоляция (AGENTS §3).** `org_id` в каждом запросе; тесты «чужая org не видит» для кодов, заказов, транзакций и очереди чеков.
- **Персональные данные.** Телефон из `/confirm` не хранится и не логируется; в Uzum уходит только псевдоним `acct_…`; код аккаунта случайный.
- **Деньги.** Несовпадение суммы, частичный возврат, оплата закрытого заказа — алерт, доступ не меняется. Возврат Checkout меняет учёт только по `REFUNDED` от Uzum; возврат приложения — по `/reverse` или подтверждению владельца.
- **Тёмный тест.** Тестовый провайдер виден и оплачивается только в сессии репетиции; тестовый заказ не даёт боевого пакета; синтетический аккаунт в live не платит ни на сайте, ни кодом в приложении.

## 5. Решения и отклонения от плана

1. **Чек Checkout без автофискализации.** Карта (U3) называла ключ Fiscalization API запасным путём, спецификация Checkout прямо отсылает к нему при выключенной автофискализации. Сделано: live Checkout требует автофискализацию или ключ. Кто печатает — фиксируется при регистрации (`gpt_uzum_orders.autofiscal`), поэтому смена `UZUM_AUTOFISCAL` не даёт двух чеков и не оставляет без чека начатую оплату; корзина в возврате идёт по тому же признаку.
2. **`operation_id` — у строки чека** (`gpt_fiscal_receipts.operation_id`), а не `gpt_uzum_orders.fiscal_operation_id` из плана: чеку возврата нужен свой ключ, а очередь, аренда и бэкофф уже живут в строке чека.
3. **`gpt_payment_codes`** хранит ещё и принятую оферту (версия, ссылка, язык, время) и `UNIQUE(org_id, user_id)`: заказ из приложения получает такое же согласие, как заказ с сайта. Код — 9 цифр вместе с контрольной (как в примере карты «1234 5678 9»).
4. **Одна оплата аккаунта за раз в приложении** (`appPaymentAction`): закрыть невиденное, заменить неподтверждённое, остальное — 10008. Без замены человек, у которого первая попытка в приложении не прошла, ждал бы 30 минут.
5. **Новые оплаты в приложении слушают выключатель продаж** (`providerReady`): `/check` и `/create` отвечают 99999, остальные вебхуки работают. Иначе `GPT_BILLING_LIVE_READY=false` не остановил бы продажи по постоянному коду.
6. **Крон довершает зависшее подтверждение** через 10 минут (сверх U8): `/confirm` — подтверждение Uzum, что деньги списаны. Худший случай — пакет без оплаты (Uzum вернул деньги и не прислал `/reverse`), он виден по алерту `uzum_confirm_recovered`; обратный худший случай — оплата без пакета — хуже.
7. **Возврат по ключам режима заказа.** `gpt-uzum-refund` сначала читает заказ (D1 после проверки Bearer), чтобы взять его режим и API: деньги можно вернуть и после выключения продаж. Для Merchant API — только запись возврата, который сделал Uzum.
8. **Тестовые чеки печатаются** на тестовом хосте при `fiscal.test.apiKey` (Uzum требует прислать их ссылки до выдачи боевого ключа), без алертов; без ключа — `skipped_test`.
9. **`UZUM_WEBHOOK_IPS` не сделан:** Uzum списка IP не давал, защита держится на Basic и самостоятельном запросе статуса.
10. **Uzum предлагается на сайте в обоих режимах**, витрина говорит какой (`uzumFlow`); экран кода — WP-17. Текущий интерфейс на ответ `mode: "code"` просто обновляет панель.

## 6. Что не закрыто кодом (нужен Uzum)

Вопросы менеджеру — `UZUM-RU.md` §2: тип договора, боевой адрес Checkout, автофискализация на терминале, ключи Fiscalization API, `owner_type` и чеки рассрочки и кэшбэка, путь ссылки на чек, повтор `/create` и поведение после 10 неудачных `/status`, актуальные тест-карты, название услуги в каталоге.

## 7. Проверки

- `tests/gpt-uzum-payments.test.ts` — Checkout, инертность, настройки, U3–U5, U7, U11, U13, возвраты, 0065.
- `tests/gpt-uzum-merchant.test.ts` — U1, U8–U10, коды, Basic, повторы, замена, изоляция, возвраты приложения, инертность всех операций.
- `tests/gpt-uzum-fiscal.test.ts` — тело чека, `operation_id` до вызова, окно 24 часа, 202, «уже был», бэкофф и алерты, тестовый хост, чек возврата, аренда, изоляция.
- `tests/gpt-uzum-rehearsal.test.ts` — шаги `scripts/uzum-sandbox-rehearsal.ts` в процессе с настоящим сбоем записи посреди `/confirm`, тот же скрипт по HTTP (`--simulate local`), последовательность Checkout одного аккаунта.
- `tests/gpt-paid-chat-schema.test.ts` — паритет `0068` с обеими инициализациями, репетиция миграции дважды через ledger.
- `node --import tsx scripts/uzum-sandbox-rehearsal.ts --api merchant --simulate local` — 22/22 шага.
