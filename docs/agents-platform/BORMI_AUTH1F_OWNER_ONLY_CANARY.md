# Bormi AUTH-1F — owner-only canary при выключенном глобальном флаге

Дата: 2026-08-03. Ветка `feature/bormi-quickpost`. Предшествующий релиз —
[BORMI_AUTH1_BINDING_CEREMONY_RELEASE.md](BORMI_AUTH1_BINDING_CEREMONY_RELEASE.md)
(`3c8da0a`, обе поверхности в production, флаг выключен).

Документ фиксирует конфликт в отгруженном коде, выбранную минимальную схему
canary и то, чем она ограничена. Ни одного кода, идентификатора, токена и
значения ключа здесь нет и быть не может.

---

## 1. Требование владельца

```
AUTH-1F APPLY APPROVED.
1. MARKET_OWNER_TELEGRAM_BINDING_ENABLED=false глобально.
2. Церемония доступна только текущей подтверждённой owner-сессии.
3. Не открывать другим owner, seller, user, store, session.
```

## 2. Конфликт в отгруженном коде

`bindingEnabled(env)` — это один булев env-var, и он читается всеми четырьмя
дверями:

| место | что делает при `false` |
|---|---|
| `createSellerBindingChallenge` (сервис) | `binding_disabled` |
| `POST /api/admin/seller-binding/challenge` | 404, как будто маршрута нет |
| `inspectSellerBindingChallenge` | `binding_disabled` |
| `redeemSellerBindingChallenge` | `binding_disabled` |
| `POST /identity/seller-binding[/inspect]` | маршрут отвечает как неизвестный путь |
| `flags.ownerTelegramBinding` в bootstrap | строка привязки не показывается |

```
GLOBAL_FLAG_REQUIRED_FOR_CREATE=yes
GLOBAL_FLAG_REQUIRED_FOR_INSPECT=yes
GLOBAL_FLAG_REQUIRED_FOR_REDEEM=yes
CLIENT_UI_REQUIRES_FLAG=yes (презентация; сервер проверяет отдельно)
CANARY_OVERRIDE_EXISTS=no
```

Отсюда: требования 1 и 2 в отгруженном коде взаимно исключают друг друга.
`true` открывает церемонию всем сразу, `false` не открывает никому. Нужен
второй, более узкий путь.

## 3. Отклонённые варианты

| вариант | почему нет |
|---|---|
| **D. Глобальный флаг `true`** | прямо отклонён владельцем; открывает mint любой owner-сессии и redeem любой Telegram-сессии |
| **C. Allowlist по username / Telegram ID / IP** | client-controlled или PII; Telegram-идентичность владельца до церемонии вообще неизвестна — это то, что церемония и устанавливает |
| **A. Grant в отдельной таблице** | требует новой миграции; `action` в `seller_identity_binding_challenges` имеет CHECK `IN ('seller.bind')`, чужую строку туда не положить. Миграции запрещены текущим scope |
| **Хранение owner JWT / его хэша в env** | сырой токен или его дериват в конфигурации; отклонено §10 |
| **Клиентский флаг / query / localStorage** | презентация не является полномочием |

## 4. Выбранная схема — B, stateless owner-session grant

Контракт:

```
BINDING_ALLOWED = globalFlag === true
                  OR (canary window open AND owner presents the canary key)
```

Grant — не строка в базе и не «включить для owner-сессий». Это одноразовый
ключ, который существует только в двух местах: в руках владельца и в виде
SHA-256 в одном env-var. Проверка идёт целиком на сервере.

```
MARKET_OWNER_TELEGRAM_BINDING_CANARY = "v1|<digest>|<issuedAt>|<expiresAt>|<expectedChallenges>"

digest = SHA-256("bormi-auth1f-canary|v1|<key>|<orgId>|<issuedAt>|<expiresAt>|<expectedChallenges>")
```

`<key>` — 32 случайных байта, выдаётся владельцу вне репозитория и вне логов.
В env уходит только digest, и он покрывает окно и предусловие целиком: любая
правка plaintext-частей строки делает digest недействительным.

### Что проверяется при mint

1. `withOwnerRole('platform_owner')` — подписанный admin-токен, роль проверена
   сервером. Ничем из тела нельзя выбрать роль, организацию или магазин.
2. env-var разобран, версия `v1`.
3. `issuedAt <= now < expiresAt`.
4. `expiresAt - issuedAt <= 15 минут` — TTL не декларация, а структурное
   ограничение: строка с более широким окном не проходит разбор.
5. Владелец предъявил ключ; digest пересчитан с org, разрешённой из базы, и
   сравнён константным временем.
6. `COUNT(*) FROM seller_identity_binding_challenges WHERE org_id = ?`
   равен `<expectedChallenges>`.
7. Дальше — все прежние проверки: ровно один активный магазин, ни одного
   живого challenge.

Пункт 6 — это single-use, и он durable, а не «в памяти изолята». Для этой
церемонии `<expectedChallenges>` равен `0`. Как только challenge создан, строк
становится 1, предусловие больше никогда не выполнится, и mint закрыт
навсегда — включая ту же owner-сессию, тот же ключ и то же окно. Вторая
церемония возможна только через новый явный approval: новый ключ, новый digest,
новое значение предусловия, новый deploy.

### Что открыто для redeem

`bindingCeremonyOpen(env, now)` = глобальный флаг **или** разобранное окно
canary, ещё не истёкшее с запасом в один TTL challenge (10 минут). Ключ здесь
не нужен и не предъявляется: у Telegram-стороны его нет и быть не должно.
Дверь при этом не открыта — за ней всё та же проверка, которая была отгружена:

- сессия Telegram проверена по `initData`, привязывается `claims.sub`;
- challenge должен существовать, быть не погашенным и не истёкшим;
- организация и магазин перечитываются и перепроверяются в транзакции;
- гонку решает `redeemed_at IS NULL` внутри batch.

Другого challenge не существует и не может быть создан, поэтому «открытый
redeem» — это доступ ровно к одному конкретному коду, который держит владелец.

### Презентация

`flags.ownerTelegramBinding` = тот же предикат. Строка «Привязать магазин»
появляется в кабинете на время окна и только у сессий без seller-полномочий.

**Принятое отклонение от §13.** Отгруженный Mini App достаёт этот экран только
из строки в «Настройках и помощи»; ни deep-link, ни `start_param` в бандле нет,
а добавлять их — это заявка в BotFather, которая вне scope. Поэтому на время
церемонии (минуты между mint и redeem) строка видна и другим Telegram-сессиям
без магазина. Она не даёт ничего: за ней поле для кода, а без точных 64 hex
сервер отвечает тем же закрытым `validation_failed`, что и на любой мусор, с
лимитом 5 попыток на 10 минут. Альтернатива с нулевой видимостью — скрытый
жест на существующем элементе — отклонена: в Telegram WebView жест ненадёжен, а
mint одноразовый, поэтому сорванный жест означал бы тупик, из которого выходят
новым деплоем.

## 5. Почему без миграции

Ни новой таблицы, ни `ALTER`. Переиспользуются: существующий challenge и его
TTL, существующий owner-auth, существующий audit-протокол, существующее
предусловие «ни одного живого challenge». Ledger остаётся 32.

## 6. Границы

| свойство | значение |
|---|---|
| scope | одна текущая подтверждённая owner-сессия, предъявившая ключ |
| target | одна организация и один магазин, разрешённые из базы |
| операция | только `seller.bind` |
| TTL | не более 15 минут, ограничение структурное |
| single-use | durable, через счётчик строк challenge |
| второй challenge | невозможен без нового approval и нового деплоя |
| хранится ли JWT | нет — ни сырой, ни хэш |
| PII в env | нет |
| client authority | нет |
| fail closed | да: отсутствует var, не разобран, истёк, не сошёлся digest, не сошлось предусловие — mint закрыт |
| закрытие | удалить var + root deploy; глобальный флаг всё время `false` |

## 7. Что остаётся выключенным

```
MARKET_OWNER_TELEGRAM_BINDING_ENABLED = false   (не меняется)
MARKET_QUICKPOST_ENABLED              = false   (до проверки sellerCommands)
MARKET_QUICKPOST_AI_ENABLED           = false   (всегда)
```

## 8. Гейты

| гейт | результат |
|---|---|
| TypeScript functions / root / Mini App | 0 / 0 / 0 |
| ESLint по изменённым файлам | 0 |
| market-owner-telegram-binding | 76/76 (было 59) |
| соседние market-суиты | 110/110 |
| полный корпус | 1330/1333 |
| canary rehearsal (`scripts/d1/rehearse-auth1f-canary.ts`) | 41/41 |
| AUTH-1 rehearsal (прежний) | 42/42 |
| secret scan | clean |
| root build / Mini App build | PASS / PASS |
| `git diff --check` | clean |
| новых миграций | 0 (ledger 32) |
| записей в production D1 | 0 |

Унаследованные падения — те же три, что и в предыдущем релизе: productization
route baseline, sitemap 240≠234, sotuvchi-onboarding. Ни одно не связано с
привязкой.

Mini App не изменялся ни на байт: сборка даёт те же чанки и те же размеры, что
уже в production (`SellerBindingRedeem` 3.82 kB, `QuickPost` 13.81 kB), поэтому
static-деплой в этом релизе не нужен.

Коммиты: `b858b6d` (gate), `b20345d` (тесты и rehearsal).

## 9. Церемония — что делает владелец

Готовится, но не запускается, пока владелец не скажет, что он у консоли.
Ключ живёт 15 минут, mint одноразовый, поэтому окно открывается один раз и
под присмотром.

1. Свежий post-migration backup, восстановление и сверка агрегатов.
2. Агент генерирует ключ (32 случайных байта) и digest, коммитит **только**
   digest-строку в `wrangler.toml`, деплоит root по точному SHA.
3. Ключ передаётся владельцу вне репозитория, логов и отчётов.
4. Owner Control Center → магазин → «Привязка Telegram» → «Создать
   одноразовый код» → вставить ключ канарейки → подтвердить.
5. Скопировать код. Он показывается один раз.
6. Telegram → Bormi Mini App → Кабинет → Настройки и помощь →
   «Привязать магазин» → вставить код → проверить имя магазина → подтвердить.
7. Проверка: 1 membership, 1 audit `seller.bind`, 1 погашенный challenge,
   replay отклонён, sellerRead/sellerCommands = true.
8. Удалить canary-строку из `wrangler.toml`, root deploy. Окно закрыто.
9. Только после этого — `MARKET_QUICKPOST_ENABLED=true` и root deploy.

Если шаг 6 не успевает в 10 минут: код истекает, привязка не выполнена, и
второй код требует нового решения владельца — новый ключ, новое предусловие,
новый деплой. Это не сбой, это свойство single-use.
