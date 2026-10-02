# Аналитика AI-чата: одно событие GA4 на сущность и 6 целей Метрики

Код: `src/gpt-chat/analytics.ts` (каталог `EV`, фильтр параметров `GA4_PARAMS`), `src/lib/analytics/yandexMetrika.ts` (цели из React, `reachYandexGoalOnce`), `scripts/analytics-metrika.ts` (закрытый каталог целей счётчика 111312750). Тесты: `tests/gpt-chat-honesty.test.ts` (каталог, параметры, одно событие на клик), `tests/yandex-metrika.test.ts` (цели). План — `10-PROD-PLAN.md` WP-09, карта `03` §8.

## GA4: что приходит теперь

Раньше одно сообщение давало 3–4 события, лимит — 4, клик в Telegram — 5. Теперь на каждое действие ровно одно событие, имена и параметры в snake_case. Параметр, которого нет в `GA4_PARAMS`, отбрасывается до отправки. Текст посетителя, контакт, код входа и сумма в параметры не попадают.

| Действие | Событие | Параметры |
|---|---|---|
| Просмотр страницы | `page_view` (загрузчик gtag в `<head>`) | — |
| Чат открылся (при монтировании, раз за просмотр) | `chat_opened` | `locale`, `entry` |
| Сообщение | `message_sent` | `source` (composer / template / answer_action / retry), `message_number`, `tool`, `role_id`, `template_id`, `anonymous`, `entry` |
| Ответ | ровно одно из `ai_response_success` (`finish` stop / length), `ai_response_error` (`code`), `generation_stopped` | `model`, `message_number` |
| Отказ сервера (429) | `limit_hit` | `reason`, `locale` |
| Окно пакета открыто | `pack_viewed` | `from`: header / limit_card / low_limit / after_10 / account_check / login_failed / login_resume / pay_return |
| Вход | `login_started`, `login_result` | `method` (bot / oidc), `status` (done / rejected / expired / failed) |
| Оплата началась | `checkout_started` | `provider`, `mode`, `resume` (true — возврат к существующему счёту) |
| Оплата закончилась | `checkout_result` | `status` (paid / pending — не подтверждена за 10 минут / cancelled), `provider`, `mode` |
| Покупка | `purchase` (ecommerce GA4) | `transaction_id` (номер заказа, не ПДн), `value` 20000, `currency` UZS, `items[{item_id: ai_paket_300}]`; только `mode=live`, один раз на заказ в браузере |
| Любая кнопка Telegram | `telegram_cta_clicked` | `from`, `channel` (bot / studio), `with_session` |
| Лид | `lead_form_opened`, `generate_lead` (только после ответа сервера), `lead_form_failed` | `method`, `intent`, `code` |
| Ссылка на цены в меню | `pricing_clicked` | `from` |
| Прочее | `prompt_chip_clicked` (`chip_id`), `template_used` (`template_id`), `message_copied`, `new_chat`, `role_selected`, `tool_opened`, `image_prompt_generated`, `official_link_clicked`, `locale_switched`, `business_clicked`, `offer_viewed`, `offer_dismissed`, `account_action_failed`, `account_logout` | — |

Удалены дубли: `GPTChatPageView`, `VisitChat`, `StartChat`, `GPTChatSessionStarted`, `GPTChatMessageSent`, `SendPrompt`, `GPTChatAnswerReceived`, `GPTChatProviderError`, `GPTChatLimitReached`, `LimitReached`, `paywall_viewed`, `ViewPricing`, `UpgradeClick`, `CopyAnswer`, `UseTemplate`, `TelegramClick`, `telegram_clicked`, `telegram_handoff_clicked`, `website_telegram_clicked`, `GPTChatLeadSubmitted`, `GPTChatLeadIntent`, `response_regenerated`, `account_opened`, `checkout_resumed`. Переименованы: `NewChat` → `new_chat`, `SelectRole` → `role_selected`, `GenerateImagePrompt` → `image_prompt_generated`, `BusinessDemoStarted` → `tool_opened`, `GPTChatOfficialLinkClick` → `official_link_clicked`, `GPTChatLocaleSwitch` → `locale_switched`, `account_login_*` → `login_*`.

События сервера в D1 (`gpt_events`, например `GPTChatLeadSubmitted`, `GPTChatHandoffClaimed`) — отдельный журнал, они не менялись.

## Воронка окна пакета на сервере (WP-17)

GA4 не видит тех, кто блокирует аналитику. Поэтому каждый шаг окна пакета параллельно уходит на сервер: `POST /api/gpt/event` → таблица `gpt_ui_events` (миграция `0068`, код `functions/lib/gpt-chat/ui-event-store.ts`, клиент `src/gpt-chat/ui-events.ts`). Шаги и квалификаторы — закрытые списки:

| Шаг | Квалификатор (`detail`) |
|---|---|
| `pack_viewed` | кнопка, открывшая окно (те же `from`, что в GA4) |
| `login_started` | `bot` / `oidc` |
| `login_result` | `done` / `rejected` / `expired` / `failed` |
| `checkout_started` | `click` / `uzum` / `payme` |
| `checkout_result` | `paid` / `pending` / `cancelled` |

В строке — шаг, квалификатор, случайный id вкладки (`view_id`, sessionStorage) и время. Ни текста, ни IP, ни аккаунта, ни сессии чата: строку нельзя связать с человеком или перепиской. `id` строки — свой у каждого события из браузера, повтор запроса считается один раз. Лимит — 60 событий в час на хеш IP. Пока оплата выключена (провайдер не предложен посетителю), роут отвечает 404 до тела и D1. Покупки здесь не считаются: их источник — заказы (`gpt_payment_orders_all`).

Агрегат для проверки (только числа): `SELECT type, detail, COUNT(*) FROM gpt_ui_events WHERE org_id='gptbot-consumer' AND created_at > <ms> GROUP BY type, detail`.

## Метрика: 6 целей

`chat_opened`, `chat_limit_hit`, `lead_form_success`, `calculator_lead_success`, `telegram_cta_studio`, `phone_click`. Лиды = `lead_form_success` + `calculator_lead_success`: форма чата теперь шлёт и `lead_form_success`, калькулятор — нет, двойного счёта нет. `chat_opened` — раз за просмотр, `chat_limit_hit` — раз на причину за просмотр. Блок Метрики в `<head>` не менялся. Полный каталог — `docs/analytics/yandex-metrika-111312750/README.md` §4.

## Что сделать владельцу (после выката R3)

1. GTM `GTM-NLR4WFX8`: убрать второй тег GA4, иначе `page_view` считается дважды.
2. GA4: зарегистрировать пользовательские параметры (custom dimensions, уровень события) `reason`, `from`, `provider`, `source`, `status`. Событие `purchase` отметить ключевым (key event) после первой живой покупки. Прежние имена параметров не были зарегистрированы, поэтому переименование ничего не ломает.
3. Метрика, счётчик 111312750: создать цели «JavaScript-событие» `chat_opened` и `chat_limit_hit` (остальные четыре уже есть).

## Проверка после деплоя

- GA4 DebugView или вкладка Network (`collect?…&en=`): на одно сообщение одно `message_sent`, на ответ одно `ai_response_success`, на просмотр одно `page_view` (после шага 1).
- Метрика: в Network запрос `watch/111312750` с `goal://…/chat_opened` при открытии чата; после 6-го сообщения за час — `chat_limit_hit`.
