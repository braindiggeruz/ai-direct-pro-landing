# Bormi AUTH-1 — модель безопасности привязки Telegram-личности владельца

Дополняет [BORMI_OWNER_TELEGRAM_SELLER_BINDING_RUNBOOK.md](BORMI_OWNER_TELEGRAM_SELLER_BINDING_RUNBOOK.md),
который задаёт схему и выбор модели AUTH-B. Этот документ описывает
**реализованный** протокол, его свойства и модель угроз. Решения из ADR не
переписываются задним числом: AUTH-A и AUTH-C отклонены там и остаются
отклонёнными.

Статус на 2026-08-03: код реализован, покрыт тестами, репетирован локально,
задеплоен с флагом `false`. В production ничего не применено.

---

## 1. Что именно делает привязка

Одна строка в `memberships`:

```
org_id      = существующая организация
identity_id = существующая telegram-личность
role        = 'owner'
status      = 'active'
```

Ни новой организации, ни нового магазина, ни onboarding, ни миграции
actor/account. `memberships.identity_id` ссылается прямо на `identities.id` —
второго провайдера прицепить не к чему, поэтому вторая строка membership и есть
единственный примитив, который схема и resolver уже понимают.

## 2. Протокол

```
владелец (подписанный platform_owner токен)
  POST /api/admin/seller-binding/challenge
    -> 32 байта CSPRNG, показаны ровно один раз
    -> в БД пишется только SHA-256
    -> TTL 10 минут, single-use, scope = (org, 'seller.bind')

Telegram-аккаунт (сессия, выданная после проверки initData)
  POST /identity/seller-binding  { challenge }
    -> identity берётся из claims.sub проверенной сессии
    -> membership + audit + consume в одной транзакции
```

Две независимые власти должны встретиться. Ни одна сторона не завершает
привязку в одиночку, и привязывается всегда та личность, которая
**аутентифицировала запрос на погашение**, — никогда та, что названа в теле,
query-параметре или заголовке.

### Что не является доказательством владения

Username (изменяем и переназначаем), Telegram ID, введённый руками (человек
утверждает ровно то, что проверяется), имя, телефон, значение из localStorage,
клиентский флаг, путь роутинга, ответ владельца в чате. Ничего из этого не
участвует в решении.

## 3. API

| Метод | Путь | Аутентификация | Флаг off |
|---|---|---|---|
| `POST` | `/api/admin/seller-binding/challenge` | `withOwnerRole('platform_owner')` | `404 not_found` |
| `POST` | `/identity/seller-binding` | market-сессия (initData) | обработчик возвращает `null` → общий `404 resource_not_found` |

`GET/PUT/DELETE` на admin-маршруте — `405` с заголовком `Allow: POST`.

Ответ на погашение — только способности и имя магазина:

```json
{ "sellerRead": true, "sellerCommands": true, "storeName": "…", "alreadyBound": false }
```

Ни identity id, ни org id, ни store id, ни challenge.

### Словарь ошибок погашения

Все отказы по challenge (`challenge_invalid`, `challenge_expired`,
`challenge_spent`) схлопываются в один ответ `validation_failed 400`. Различать
их для вызывающей стороны — значит выдать перебирающему, какие коды когда-либо
существовали; легитимный человек в этот момент разговаривает с владельцем и
спросит у него.

| внутренний код | ответ Mini App |
|---|---|
| `challenge_invalid` / `challenge_expired` / `challenge_spent` / `binding_disabled` | `validation_failed` 400 |
| `rate_limited` | `rate_limited` 429 |
| `store_unavailable` / `store_ambiguous` | `storefront_unavailable` 409 |
| `membership_disabled` / `membership_conflict` / `identity_unsupported` | `state_conflict` 409 |
| `persistence_failed` | `internal_error` 500 |

## 4. Схема challenge

`migrations/0032_seller_identity_binding_challenge.sql`, таблица
`seller_identity_binding_challenges`:

| колонка | назначение |
|---|---|
| `challenge_hash` | PK, SHA-256 hex, `length = 64`. Сырое значение не хранится |
| `org_id`, `store_id` | scope, FK с `ON DELETE RESTRICT` |
| `action` | `CHECK (action IN ('seller.bind'))` — один замок, одна дверь |
| `created_by` | e-mail владельца, выпустившего challenge |
| `created_at`, `expires_at` | TTL |
| `redeemed_at` | NULL до погашения; строка не удаляется |

Ни Telegram id, ни username, ни initData, ни e-mail продавца. Погашенные строки
не удаляются: когда привязку позже поставят под вопрос, вопрос звучит «был ли
этот challenge использован, когда и успешно ли», и удалённая строка на него не
отвечает.

Зеркальный DDL в `functions/platform/admin/seller-binding.ts` держит паритет для
тестов и локальных запусков; тест
`the runtime DDL and migration 0032 build the same table` сравнивает колонки,
внешние ключи и индексы обеих версий.

## 5. Атомарность

Порядок операторов в батче — это и есть свойство безопасности.

```
1. INSERT OR IGNORE INTO owner_audit_events   ... WHERE <все предусловия>
2. INSERT OR IGNORE INTO memberships          ... WHERE EXISTS(audit event) AND <предусловия>
3. UPDATE seller_identity_binding_challenges  ... WHERE redeemed_at IS NULL AND EXISTS(audit) AND EXISTS(membership)
```

`prepareOwnerAuditInsert` выпускает `INSERT OR IGNORE`, а SQLite при `OR IGNORE`
молча пропускает строку, нарушающую **любое** ограничение — включая `CHECK` на
`action`. На базе, где миграция 0031 ещё не применена, audit-строка
`seller.bind` исчезает без единого исключения. При обратном порядке (сначала
membership, audit под его условием) это дало бы зафиксированную выдачу прав
продавца **без аудита** — молча, ровно на той базе, против которой это едет.

Поэтому membership зависит от `event_id` аудита. Не записался аудит — не
записался membership, не погашен challenge, вызывающий получает ошибку. Это та
же форма, что у `transitionPilotStateWithAudit`, по той же причине.

Компенсации в обратную сторону нет и не нужно: таблица аудита append-only
(инвариант проверяется тестом `no source file issues an UPDATE or DELETE against
the audit table`), а audit-строка здесь не может пережить свою выдачу. Если
событие записано, все guard-условия membership уже истинны в этой же
транзакции, и единственное ограничение, способное ещё пропустить вставку, —
`UNIQUE (org_id, identity_id)`, то есть membership уже был, owner и active,
потому что guard аудита не пропустил бы никакой другой.

После батча читается обратно тройка: `granted = 1`, `audited = 1`, `spent = 1`.
Любое расхождение — `persistence_failed`.

## 6. Модель угроз

| # | Атака | Воздействие | Митигация | Остаточный риск | Тест |
|---|---|---|---|---|---|
| 1 | Украденный challenge (скриншот, плечо) | Чужой Telegram получает права владельца | TTL 10 мин, single-use, только одна живая на организацию | Реален в течение окна. Смягчается тем, что владелец видит успех сразу и откат — один UPDATE | `a challenge lives ten minutes and no longer` |
| 2 | Пересланный challenge | То же | То же + владелец обязан передавать код вне канала с историей | Тот же | `the same challenge cannot be spent a second time` |
| 3 | Утечка через URL/referrer | Секрет в логах прокси | Challenge передаётся только в теле `POST`; в путях и query его нет | Нет | `the response carries capabilities and no identifiers` |
| 4 | Логирование запроса | Секрет в наблюдаемости | В service и route нет ни одного `console.log/info/warn/debug`; ошибки — закрытый список токенов | Платформенные логи тела запроса не под нашим контролем | `nothing logs a challenge, initData or anything about the person` |
| 5 | Replay | Вторая выдача, второй audit | `redeemed_at` + `UNIQUE(idempotency_key) = seller_bind_<hash>` | Нет | `the same challenge cannot be spent a second time` |
| 6 | Гонка двух погашений одного challenge | Один challenge связывает **два** аккаунта | Guard аудита перечитывает challenge внутри транзакции: `redeemed_at IS NULL AND expires_at > ?` | Нет | `two callers racing one challenge produce exactly one winner` |
| 7 | Две Telegram-личности у владельца | Не та привязана | Привязывается ровно `claims.sub` погасившего; вторая требует нового challenge | Владелец обязан гасить из нужного аккаунта | `redemption binds the identity that authenticated` |
| 8 | Скомпрометированная сессия владельца | Атакующий выпускает challenge | Выпуск требует подписанного `platform_owner` токена; сам по себе challenge никого не связывает — нужен ещё Telegram-аккаунт | Реален при полной компрометации admin-токена | `minting a challenge requires a signed platform_owner token` |
| 9 | Скомпрометированный Telegram-аккаунт | Атакующий гасит выданный владельцем challenge | Вне модели: Telegram-аккаунт и есть привязываемая личность | Принят. Откат — `status='disabled'` | `disabling the membership takes the authority straight back` |
| 10 | Replay initData | Поддельная сессия | Существующая проверка `verifyTelegramInitData` при обмене сессии; AUTH-1 её не трогает и не обходит | Наследуется от механизма сессий | `redemption binds the identity that authenticated` |
| 11 | Путаница организаций | Cross-tenant привязка | org/store читаются из БД, не из запроса; при **двух** активных магазинах выпуск отказывает (`store_ambiguous`), а не выбирает | Нет | `minting refuses to guess which store was meant` |
| 12 | Реактивация отключённого membership | Отозванный продавец восстанавливает себя | `status <> 'active'` → `membership_disabled`, ничего не пишется, challenge остаётся живым | Нет | `a disabled membership is refused, not revived` |
| 13 | Конфликт роли (`staff`) | Непрозрачный 500 либо audit без выдачи | Явный `membership_conflict` до батча | Нет | `an existing membership in another role is a conflict, not a 500` |
| 14 | Подавление аудита | Права выданы без записи | Порядок батча (см. §5) | Нет | `without migration 0031 nothing is granted at all` |
| 15 | Частичная транзакция | Membership без аудита / погашенный challenge без выдачи | Один `db.batch`, взаимные guard-условия, обратная вычитка тройки | Нет | `a redemption grants one membership, one audit row, one spent challenge` |
| 16 | Перебор challenge | Подбор секрета | 2^256 пространство + лимит 5 попыток / 10 мин на вызывающего в самом сервисе + `enforceMarketRateLimit('command')` в роутере | Isolate-local, best-effort | `both halves stop grinding after five attempts` |
| 17 | Обход rate-limit сменой isolate | Больше попыток | Принято: настоящая защита — single-use и энтропия, лимит только ограничивает нагрузку | Принят | — |
| 18 | Просроченные challenge накапливаются | Рост таблицы | Не более одной живой на организацию; выпуск только владельцем и с лимитом. Уборка вручную: `DELETE FROM seller_identity_binding_challenges WHERE redeemed_at IS NULL AND expires_at < datetime('now','-1 day')` | Рост пренебрежим | `only one challenge is live at a time` |
| 19 | Флаг включён по ошибке | Дверь открыта | Флаг сам по себе никого не связывает: нужен подписанный owner-токен **и** проверенная Telegram-сессия | Принят | `the flag opens a door and never walks through it` |

Короткий TTL сам по себе защитой не считается. Свойство держится на связке
initData + scope + single-use; TTL только сокращает окно.

## 7. Флаг

`MARKET_OWNER_TELEGRAM_BINDING_ENABLED`, по умолчанию `"false"`.

- включает ровно строка `"true"` после `trim().toLowerCase()`;
- off — обе половины отвечают как несуществующие;
- не является клиентской властью: в bootstrap Mini App не попадает, в
  `apps/market-mini-app/src/types.ts` слова `binding` нет;
- предполагается включить на время одной привязки и выключить обратно.

## 8. Откат

Привязка отменяется на уровне приложения:

```sql
UPDATE memberships SET status = 'disabled', updated_at = ?
 WHERE org_id = ? AND identity_id = ?;
```

Права исчезают немедленно — resolver требует `role='owner' AND status='active'`.
Запись аудита о выдаче переживает откат, и это правильно.

Схемный откат 0031 (сужение `CHECK` обратно до пяти глаголов) допустим только
пока ни одна строка не использует `seller.bind`/`seller.unbind`. После первой
привязки сужение потребовало бы удалить ту самую строку, которая фиксирует
выдачу. Удаление истории аудита ради восстановления ограничения — не откат.

Откат 0032 — `DROP TABLE seller_identity_binding_challenges;` — безопасен в
любой момент и привязку не отменяет.
