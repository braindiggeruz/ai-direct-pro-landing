# Ревью безопасности платного AI-чата, октябрь 2026

*WP-21 плана `10-PROD-PLAN.md` (релиз R7), 2026-10-03. Проверен весь платный контур на ветке `paid-chat/prod-readiness`: дифф `f53cabcb..2dec6673` (88 коммитов, R1–R7 без WP-21). Построчно прочитаны маршруты `functions/api/payments/*`, `functions/api/gpt/{subscribe,account,chat,event}.ts`, `functions/api/gpt/auth/**`, `functions/api/internal/gpt-*` и `javob-setup.ts`, `functions/api/admin/ai-chat/*`. Прочитаны и библиотеки `functions/lib/gpt-chat/{billing-*,payment-protocol,identity-store,rehearsal,bot-login*,telegram-identity,uzum-*,click-merchant,fiscal-*,payment-code-store,seller-refund,ui-event-store,admin-store,http,hash}.ts`, `functions/lib/telegram/web-login.ts`, крон-вызов `workers/gpt-billing-maintenance.ts`, ссылки и маскировка во фронтенде (`src/gpt-chat/**`, `src/shared/payment-hosts.ts`, `scripts/analytics-metrika.ts`). Ничего не задеплоено. Cloudflare, удалённая D1, боты и вебхуки не трогались.*

Метод. План просит `/security-review` по диффу и ручной чек-лист. Команда `/security-review` в сессии исполнителя не запустилась: рабочая папка сессии не была Git-репозиторием. Поэтому дифф просмотрен вручную по тому же чек-листу, без автоматического прохода. Каждый пункт сверен с кодом, проверен грепом по всем исходникам (SQL-интерполяции, `fetch`, `console.*`, `redirect`) и подтверждён тестами, которые прогнаны по одному файлу.

## 1. Итог

- **Открытых находок High и Medium нет.** Найдено 10 пунктов уровня Low. Два исправлены с тестами (S1, S2), по восьми принято решение (раздел 3).
- `npm audit --omit=dev`: **0 уязвимостей**, 117 продовых зависимостей (раздел 4).
- Секретов в Git нет: `scan:secrets` чисто, регэксп токена Telegram по диффу пуст.
- Платёжные инварианты держатся. Подписи сверяются за постоянное время. Сумма строго 2 000 000 тийинов в UZS (860). Повтор внешнего входа ничего не меняет. Гонки закрывает журнал с `version`. Без режима и кредов провайдер инертен: 404 до тела и D1.

## 2. Чек-лист плана

| Пункт | Итог | Где и чем проверено |
|---|---|---|
| Подписи: MD5 Click, Basic Uzum, секрет вебхука — за постоянное время | держится | Click: `sameSecret(sign_string, clickSignature)` до D1, только `x-www-form-urlencoded`, повтор ключа в форме → −8 (`payments/click.ts`). Uzum Merchant: `merchantAuthorized` — Basic в любом регистре, декодированные `login:password` сравниваются `sameSecret` до тела (`uzum-config.ts`). Payme: `sameSecret` до тела. Вебхук бота: `x-telegram-bot-api-secret-token` через `sameSecret`, а без секрета бот выключен целиком (`telegramConfigured`). Bearer внутренних маршрутов: `sameSecret`, с WP-21 и длина ≥ 32 (S1). Cookie репетиции: HMAC через `crypto.subtle.verify`. Длина сравниваемых строк раскрывается (S9) |
| Суммы и валюта строго 2 000 000 / 860 | держится | D1: `CHECK(amount=2000000)` и `CHECK(currency='UZS')` в `gpt_payment_orders` и `gpt_uzum_orders`. Click: `parseClickAmount(amount) === row.amount` и `currency='UZS'`, иначе −2. Uzum Merchant `/create`: `amount !== PRICE_TIYIN` → 10011. Uzum Checkout: регистрация с `currency: 860`; доступ даёт только `COMPLETED`, где `amount`, `completedAmount` и `merchantOrderId` равны заказу. Возврат засчитывается только при `refundedAmount`/`reversedAmount`, равном заказу, иначе алерт. Ссылка Click — `amount=20000.00` |
| Идемпотентность `UNIQUE(provider, external_id)`; гонки переходов; повторы колбэков | держится | `UNIQUE(org_id,provider,mode,external_id)` и `UNIQUE(org_id,user_id,request_id)` в обеих таблицах, частичный уникальный индекс открытого счёта. `BillingStore.transition`: журнальная запись с условием `version`, остальные операторы пакета под `EXISTS(журнал)`; батч D1 атомарен, до 8 попыток. Повтор Prepare или Complete Click даёт тот же ответ или −4. Повтор `transId` Uzum → 10010, повтор `/confirm` → 10016. Колбэк Checkout — только подсказка: статус берётся своим запросом. Telegram: `claimUpdate(update_id)`. События окна: `INSERT OR IGNORE` по id из браузера. Чеки: PK `(org_id,order_id,kind)` и аренда. Возврат Uzum: `X-Operation-Id` сохраняется до вызова. Тесты: `gpt-billing`, `gpt-uzum-*`, `gpt-click-fiscal`, `paid-chat-e2e-rehearsal` (гонка двух Complete и двух `/confirm`) |
| Fail-closed конфигурации; инертность (404 до тела и D1) | держится | `providerMode` и креды проверяются до тела у Click, Uzum, Uzum Merchant и Payme. Битый `GPT_CLICK_CREDENTIALS_JSON` — «ничего», без отката на старые переменные. Секрет короче 32 символов считается незаданным, теперь и у Bearer (S1). Продажа в live — только при пустом `liveReadiness()`, при деплое его держит `scripts/release/live-gate.ts`. Вход и события окна дают 404, пока провайдер не предложен. Квитанция R4: все платёжные, входные и событийные маршруты в проде — 404 |
| SSRF: base URL только https и из allowlist | держится | Uzum Checkout и Fiscalization: `apiBase` — https, без порта, логина и query, хост из allowlist (`UZUM_HOST`, `UZUM_FISCAL_HOST_PATTERN`). Click: хост `api.click.uz` прошит в коде. Telegram, OpenRouter, Z.ai, OIDC — фиксированные хосты. Все вызовы с ключами платежей (Click, Uzum, Uzum Fiscalization, крон Worker'а) идут с `redirect: "manual"`, 3xx = ошибка. Остальные — S8 |
| Allowlist редиректов и ссылок чеков | держится | Браузер уходит платить только на `my.click.uz`, `checkout.paycom.uz` или хост Uzum (`allowedCheckoutUrl`; на сервере `allowedUzumRedirect`). Ссылка чека — только `https://ofd.soliq.uz` или хост Uzum: сервер (`receiptLink`, `ofdReceiptLink`), колбэк чека и панель «Paketim» (`safeAccountLink`) берут одно правило из `src/shared/payment-hosts.ts`. Оферта — только `https://gptbot.uz` (`termsUrl`). Deep link входа — только `t.me` (`isBotLoginUrl`). OIDC — только `https://oauth.telegram.org`. Возврат после оплаты — фиксированный путь чата `?pay=return` |
| Утечки: секреты в логах и ответах; тексты и ПДн в событиях и админке | держится | Все `console.*` в диффе — постоянные коды без значений. Ответы — закрытые коды без стектрейсов. Готовность — только имена (`liveReadiness`). Админка: покупатель и посетитель — HMAC-псевдонимы на соли, без соли — `salt_missing`. `content` и `contact_*` в SQL админки запрещены тестом. `gpt_ui_events` — закрытые списки, без IP и аккаунта. Владельцу уходят номер заказа и событие. Телефон `/confirm` Uzum не хранится. В Uzum уходит псевдоним `acct_…`. Webvisor: окно пакета, переписка и код Uzum скрыты, поле кода входа — S2 |
| Cookie `__Host-`, `SameSite`; CSRF на POST | держится | Сессия, вход, попытка входа ботом и репетиция — cookie `__Host-` с `Path=/; HttpOnly; Secure; SameSite=Lax`, без `Domain`. Проверка `Origin` (`sameOrigin`, без заголовка — 403) стоит на `subscribe`, `account` POST, `auth/start`, `auth/logout`, `auth/bot/start`, `auth/bot/status` и `event`. Админка авторизуется Bearer-JWT, а не cookie. У `chat` проверки `Origin` нет: пакет защищает `SameSite=Lax` (S5) |
| Флуд-лимиты | держится, с оговорками | Бесплатно 15 в сутки и 5 в час по аккаунту и хешу IP. Пакет: 50 в сутки, 2 одновременно. Вход 10 в час на хеш IP. Опрос входа 60 в минуту на браузер. Открытие ссылки в боте 10 в час на человека. Оплата 10 в час на аккаунт. Сверка Uzum 6 в час на аккаунт. События 60 в час на хеш IP. Колбэки Uzum 300 в час на хеш IP. Алерты 6 в час. Оговорки — S3, S4, S6 |
| Роли админки; сессия репетиции только в `test` | держится | Все пять маршрутов `api/admin/ai-chat/*` — `withOwnerRole('platform_owner')`. `openRehearsal` и `rehearsalActive` требуют провайдера в `test`, иначе 404 или 409. Синтетический `acct_rh_…` не покупает в live: `subscribe`, `BillingStore.createOrder` и `payableHolder` Uzum. Тестовый пакет расходуется только в сессии репетиции (`access(user, viewerMode)`) |
| Соль и перекей; удаление переписки выключено | держится | `hashIp` солит после `GPT_HASH_SALT_SINCE` (2026-10-02T00:00:00Z). Перекей завершён 2026-10-02, все агрегаты шага 7 равны 0. Live требует `GPT_HASH_SALT` и наступивший `SINCE`. `GPT_MESSAGES_RETENTION_DAYS = ""`, удаление переписки выключено |
| В боте нет цен и внешних оплат | держится | Провайдеры Javob — `DisabledProvider`. Тексты бота и входа проверяют тесты (`telegram-assistant`, `gpt-bot-login`: нет сумм, Plus, Pro, тарифа и ссылок на оплату) |
| Во всех именах продукта нет «GPT/Plus» | держится | `ai_paket`, «AI paket 300», «AI paket 300 (xizmat, 1 oy)», `ai_paket_300`. В `paymentDetails` есть только домен `gptbot.uz` (решение L16, исключён из проверки). Тест `gpt-live-readiness` |

Дополнительно проверено:
- **SQL-инъекции.** Все интерполяции в SQL — константы кода (имена таблиц из закрытого набора, плейсхолдеры `?`, фрагменты правил); пользовательские значения — только через `bind`.
- **XSS.** Ответ модели проходит `renderMarkdown`, который экранирует ввод до разметки и строит только свои теги без атрибутов из ввода; остальное — React. CSP есть.
- **Вход через бота.**
  - Nonce 128 бит, в базе только sha256 от него.
  - Попытка привязана к cookie браузера и к первому открывшему её человеку в Telegram. Второй открывший отклоняет попытку.
  - В режиме pick одно нажатие, в режиме code одна попытка ввода. Подделанный `callback_data` даёт одну догадку из 90.
  - Есть «Выйти на всех устройствах».
- **OIDC (не включён).** PKCE S256, `state` в `__Host-gpt_login`, `jwtVerify` с проверкой издателя и аудитории, RS256, возраст токена 10 минут.

## 3. Находки

| # | Уровень | Что | Решение | Тест |
|---|---|---|---|---|
| S1 | Low | Bearer семи внутренних маршрутов (`gpt-billing-maintenance`, `gpt-click-reversal`, `gpt-uzum-refund`, `gpt-click-refund-record`, `gpt-rehearsal-session`, `gpt-model-probe`, `javob-setup`) принимал `GPT_BILLING_MAINTENANCE_SECRET` любой длины. Остальной биллинг считает секрет короче 32 символов незаданным. Два маршрута возвращают деньги. Короткое значение, заданное по ошибке, закрывало бы их подбираемым паролем | **Исправлено.** Одна проверка `internalAuthorized` (`functions/lib/gpt-chat/internal-auth.ts`): секрет не короче 32 символов, сравнение за постоянное время. Семь копий кода заменены ею. Значение в проде — 64 hex: по квитанции R4 тик обслуживания не назвал `GPT_BILLING_MAINTENANCE_SECRET` недостающим, поэтому крон не ломается. `ALERTS-RU.md` дополнен | `paid-chat-security-review` (S1): короткий секрет → 403 на всех семи, тело не прочитано, D1 не тронута. Секрет из 32 символов пропускает только свой Bearer. Мутация (без проверки длины) тест роняет. `telegram-assistant`: `javob-setup` с коротким секретом → 403 |
| S2 | Low | Поле кода входа в режиме `code` (6 цифр из бота) и его форма не несли `ym-disable-keys` и `ym-disable-submit`. Договор Metrika требует их на каждом поле ввода, потому что Webvisor включён (`scripts/analytics-metrika.ts`). Код одноразовый и живёт 10 минут, режим `code` сейчас выключен | **Исправлено.** `BotLoginScreen.tsx`: форма `ym-disable-submit`, поле `ym-disable-keys` | `yandex-metrika`: файл в списке `MASKED`, плюс отдельный тест на каждый `<input>` экрана. Снятие любого из классов тест роняет |
| S3 | Low | Лимиты по IP берут полный адрес IPv6, без группировки по /64. Хост с подсетью /64 меняет адрес и обходит лимиты на IP: бесплатные 15 ответов, старт входа, события, колбэки | **Принято для R7.** Деньги ограничены: бесплатные ходы на платных моделях — не больше `GPT_FREE_PAID_DAILY_USD` ($1 в сутки), основная модель Z.ai flash бесплатна. Пакет считается по аккаунту, а вход требует аккаунт Telegram. Группировка по /64 меняет все хранимые хеши IP, поэтому это отдельный WP. Сначала правило rate limiting Cloudflare для `/api/gpt/*` или Turnstile, когда раздел «Посетители» админки покажет злоупотребление | — |
| S4 | Low | У `/api/gpt/event` нет общего потолка (пункт из ревью WP-20): только 60 в час на хеш IP | **Принято.** Строки без текста, хранятся 93 дня (WP-24). Общий потолок не убирает запись лимита на каждый запрос: квоты D1 и запросов Workers так же жжёт любой публичный маршрут. Правильный уровень — правило rate limiting Cloudflare (действие владельца, здесь Cloudflare не менялся) | — |
| S5 | Low | `/api/gpt/chat` не проверяет `Origin`. Чужая страница может «простым» запросом (`text/plain`) отправить ход от имени браузера посетителя | **Принято.** Cookie аккаунта `SameSite=Lax` в межсайтовый POST не уходит, так что пакет чужая страница не тратит. Тратится только бесплатная квота IP посетителя и бесплатный бюджет. При `TURNSTILE_SECRET_KEY` ход без токена отклоняется. Контракт маршрута старый (Railway, тесты), пересмотреть вместе с S3 | — |
| S6 | Low | Каждый закрытый live-счёт присылает владельцу «AI paket: cancelled» (так задумано, `CHECKOUT-RU.md`). Аккаунт может открыть и закрыть до 10 счетов в час, это до 10 сообщений владельцу в час | **Принято.** Ограничено лимитом оплаты (10 в час на аккаунт) и входа (10 в час на IP). Пересмотреть после первых недель live: возможно, уведомлять только `paid`/`refunded` | — |
| S7 | Low | Вход pick: кто получил чужую ссылку и нажал верное число (одно из трёх наугад или по подсказке мошенника), впускает тот браузер в свой аккаунт (L11) | **Принято по L11.** Бот предупреждает, показывает браузер и время, есть «Это не я» и «Выйти на всех устройствах». Переключатель `GPT_BOT_LOGIN_MODE=code` готов, если ссылки начнут пересылать | — |
| S8 | Low | `fetch` с ключом к фиксированным сторонним хостам идёт с редиректами по умолчанию: обмен кода OIDC (`oauth.telegram.org`, секрет клиента; OIDC не включён), OpenRouter, Z.ai | **Принято.** Хосты прошиты в коде, только https. Ключи платежей (Click, Uzum, Fiscalization) и крон Worker'а уже идут с `redirect: "manual"`. При включении OIDC добавить `redirect: "manual"` в `auth/callback.ts` | — |
| S9 | Info | `sameSecret` сразу возвращает `false` при разной длине: время ответа выдаёт длину ожидаемого значения, но не его | **Принято.** Сравниваемые значения — фиксированного формата: MD5 (32 hex) или случайный секрет ≥ 32 | — |
| S10 | Info | Cookie репетиции — предъявительский токен на 2 часа, не привязанный к браузеру | **Принято.** Он открывает только тестовый контекст: тестовые провайдеры с ключами, которые сгенерировал агент, без денег. Runbook WP-22: cookie не передавать | — |

## 4. `npm audit --omit=dev`

В репозитории `yarn.lock`, а не `package-lock.json`. Yarn на машине нет, поэтому `npm audit` в папке проекта не запускается (`ENOLOCK`). Отчёт снят на копии вне репозитория:
- `package.json` и `yarn.lock`, затем `npm i --package-lock-only --ignore-scripts --legacy-peer-deps`. npm берёт версии из `yarn.lock`: все 17 прямых продовых зависимостей совпали;
- `npm audit --omit=dev`: 0 уязвимостей (info 0, low 0, moderate 0, high 0, critical 0) на 117 продовых пакетов.

Отчёт только для сведения: зависимости не менялись.

## 5. Вне ревью

- Конфигурация зоны Cloudflare (WAF, правила rate limiting, Bot Fight) и включён ли в проде `TURNSTILE_SECRET_KEY`: значения секретов не читались.
- Поведение провайдеров вживую (Click, Uzum, OFD): проверяется тёмной репетицией WP-22 (слой 2) и одной покупкой владельца с возвратом (runbook WP-23).
- Бэкенд Railway и страницы GPTBot Market: вне платного контура.

## 6. Как повторить

```
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b ; npm run typecheck:functions
node --import tsx --test tests/paid-chat-security-review.test.ts
node --import tsx --test tests/yandex-metrika.test.ts
node --import tsx --test tests/telegram-assistant.test.ts
npm run scan:secrets
```
