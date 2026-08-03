# Bormi AUTH-1 — привязка Telegram-личности владельца к существующему магазину

Дата: 2026-08-03 · Ветка: `feature/bormi-quickpost` · Статус: **read-only аудит, ничего не применено**

`AUTH_1_APPLIED=NO`. Ни одной записи в D1 не сделано. Все запросы этого
аудита вернули `rows_written: 0` и `changed_db: false`.

---

## 1. Фактическая схема

Прочитана из production D1 (`gptbot-ai-drafts`), не из миграций.

```sql
CREATE TABLE identities (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL CHECK (provider IN ('telegram','web','email','phone','api')),
  external_id TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (provider, external_id)
);

CREATE TABLE memberships (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  identity_id TEXT NOT NULL REFERENCES identities(id)     ON DELETE RESTRICT,
  role        TEXT NOT NULL CHECK (role IN ('owner','staff')),
  status      TEXT NOT NULL CHECK (status IN ('active','disabled')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (org_id, identity_id)
);

CREATE TABLE sotuvchi_stores (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('draft','active','suspended')),
  ...
);

CREATE TABLE sotuvchi_onboardings (
  id TEXT PRIMARY KEY,
  owner_identity_id TEXT NOT NULL UNIQUE REFERENCES identities(id) ON DELETE RESTRICT,
  org_id TEXT UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
  workflow_instance_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('starting','active','completed','cancelled','failed')),
  ...
);
```

### Главный факт

**Таблиц `actors` и `accounts` не существует.** `memberships.identity_id`
ссылается напрямую на `identities.id`. Identity и есть принципал; никакого
промежуточного субъекта, к которому можно было бы подвесить вторую
provider-личность, в схеме нет.

### Живые агрегаты (без идентификаторов)

| Что | Значение |
| --- | --- |
| identities, provider=`api` | 1 |
| identities, provider=`telegram` | 7 |
| memberships всего | **1** (`owner` / `active`) |
| provider единственного membership | **`api`** |
| organizations | 1, `active` |
| sotuvchi_stores | 1, `active` |
| **sotuvchi_onboardings** | **0 строк** |
| sotuvchi_products | 48 `published` |
| org с несколькими активными `owner` | 0 |
| ledger `d1_migrations` MAX(id) | 25 |

Семь Telegram-личностей существуют и ни одна не имеет membership. Владелец
заходит в Mini App как Telegram-личность, а магазином владеет `api`-личность —
ровно поэтому у владельца нет `sellerCommands` внутри Mini App.

---

## 2. Что именно проверяет сервер

Один и тот же предикат в обоих местах — `findOwnedActiveStore` и
`findOwnedActiveStoreByIdentity` (`functions/agents/sotuvchi/catalog/store.ts`):

```sql
JOIN memberships AS membership
  ON membership.org_id = store.org_id
 AND membership.identity_id = ?
 AND membership.role = 'owner'
 AND membership.status = 'active'
JOIN organizations AS organization
  ON organization.id = store.org_id AND organization.status = 'active'
WHERE store.status = 'active'
```

И `resolveMarketAccess` (`functions/market/access.ts`) прямо документирует, что
онбординг — не единственный путь:

> «The onboarding record is the path a seller who signed up through the bot
> walks. It is not the only way a store comes to exist — one seeded outside that
> workflow has an owner in `memberships` and no onboarding row at all.»

Кандидат берётся либо из завершённого онбординга, либо из
`findOwnedStoreByIdentity`, и **оба** проходят один и тот же
`orders.resolveSeller` → `catalog.resolveOwnerContext` → тот же SQL выше.

Следствия:

* `role='staff'` не даёт ничего: предикат требует `'owner'`. Схема не
  предлагает более слабой роли, которая давала бы seller-команды.
* `sellerRead` и `sellerCommands` дополнительно требуют env-флагов
  `MARKET_MINI_APP_SELLER_READS_ENABLED` и
  `MARKET_MINI_APP_SELLER_COMMANDS_ENABLED` — оба сейчас `"true"` в production.

---

## 3. Выбранная модель — AUTH-B

**Одна строка в `memberships`** для Telegram-личности владельца в той же
организации, `role='owner'`, `status='active'`.

Ни новой организации, ни нового магазина, ни онбординга, ни изменения
существующего membership.

### Почему не AUTH-A

Модель «добавить Telegram-identity тому же actor» **невыполнима**: actor'а нет.
`identities` — плоская таблица, `UNIQUE(provider, external_id)`, и никакой
колонки, связывающей две identity между собой, не существует. Реализовать
AUTH-A можно было бы только миграцией, вводящей actor/account — а это далеко за
пределами AUTH-1 и запрещено.

### Почему не AUTH-C

1. `sotuvchi_onboardings` **пуста** — существующий магазин демонстрируемо возник
   не через онбординг, поэтому онбординг нельзя назвать каноническим механизмом
   доступа к нему.
2. `sotuvchi_onboardings.org_id` — **UNIQUE**. Строка онбординга для
   Telegram-личности на ту же организацию конфликтовала бы, как только
   организация получила бы любой онбординг.
3. Онбординг — рабочий процесс *создания* (`workflow_instance_id`,
   `status IN ('starting','active','completed',…)`), а не механизм выдачи
   доступа к уже существующему магазину. Использовать его здесь означало бы
   изготовить фиктивную историю создания — то самое «fake onboarding», которое
   запрещено.

Выбор сделан по семантике личности и least privilege, а не по простоте SQL:
AUTH-B — единственная модель, которую схема и резолвер уже поддерживают без
изменения ни того, ни другого.

---

## 4. Канонический примитив уже существует

`functions/platform/orgs/store.ts`:

```ts
async addMembership(orgId, identityId, role): Promise<MembershipResolution> {
  ...
  const result = await db
    .prepare(`INSERT OR IGNORE INTO memberships
      (id, org_id, identity_id, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(...)
    .run();
  if ((result.meta?.changes ?? 0) > 0) return { status: 'created', membership };
  const existing = await findMembership(tenantId, memberIdentityId);
  if (!existing) throw new TenantStoreError('persistence_failed');
  return { status: 'existing', membership: existing };
}
```

`INSERT OR IGNORE` поверх `UNIQUE(org_id, identity_id)` — идемпотентность
встроена в примитив, повтор возвращает `status: 'existing'` и пишет ноль строк.

**У `addMembership` сейчас нет ни одного вызывающего** — ни сервисного метода,
ни HTTP-маршрута, ни команды Owner Control Center. Примитив есть, поверхности
нет. Поэтому применять AUTH-1 надо либо скриптом, повторяющим ровно эту форму
записи, либо новым owner-аутентифицированным маршрутом, вызывающим сам примитив
(предпочтительно, но это отдельная задача с кодом и тестами).

---

## 5. Доказательство владения

Нельзя привязывать личность по имени пользователя. Username в Telegram
меняется, не уникален во времени и не является доказательством владения.

**Механизм: owner-issued challenge + initData-authenticated claim.**

1. Владелец, уже аутентифицированный в собственной админ-сессии, запрашивает
   одноразовый binding-challenge для конкретной организации. Сервер выдаёт
   короткоживущий (≤10 минут) одноразовый код и хранит его хэш.
2. Владелец открывает Bormi Mini App **со своего** Telegram-аккаунта и вводит
   код там.
3. Сервер принимает код только из запроса, чья сессия построена на проверенном
   `initData`. Привязывается **та личность, которая этот запрос
   аутентифицировала** — `claims.sub`, а не что-либо переданное клиентом.
4. Код гасится при первом использовании; истёкший или уже использованный
   отклоняется.

Почему это доказывает владение: выпустить аутентифицированную Mini App сессию
для Telegram-личности может только тот, кто держит этот Telegram-аккаунт,
потому что `initData` подписан ботом для конкретного пользователя. Совпадение
«владелец выпустил код» + «код предъявлен из аутентифицированной сессии»
привязывает именно ту личность, которой владелец управляет.

Что это исключает: привязку чужого аккаунта (чужой не имеет кода), подмену по
username (username вообще не читается), и повторную привязку (код одноразовый,
а `UNIQUE` не даст второй строки).

Код не должен попадать в логи, в аналитику и в отчёты. В этом документе не
приводится ни одного Telegram ID, identity ID, org ID, store ID или username.

---

## 6. План записи

| | |
| --- | --- |
| `AUTH_1_TABLES_TO_WRITE` | `memberships` — и только она |
| `AUTH_1_ROWS_TO_INSERT` | **1** |
| `AUTH_1_ROWS_TO_UPDATE` | **0** |
| `AUTH_1_AUDIT_ROWS` | **0** — см. ниже |

Вставляемая строка:

```
id          = newId('membership')
org_id      = <существующая active организация>
identity_id = <telegram-личность, доказавшая владение>
role        = 'owner'
status      = 'active'
created_at  = updated_at = now()
```

Существующий `api`-membership **не трогается**: он остаётся владельцем, и
audit-след того, кто владел магазином раньше, сохраняется целиком. После
операции у организации будет два активных владельца — схема это допускает
(`UNIQUE(org_id, identity_id)` уникален по паре, не по org), и сегодня таких
организаций ноль.

Транзакция: одна `INSERT OR IGNORE`. Батч не нужен — записывается ровно одна
строка, и её уникальный индекс сам является барьером.

### Аудит — открытый вопрос для владельца

`owner_audit_events.action` имеет CHECK-ограничение:

```
CHECK (action IN ('store.suspend','store.restore','pilot.activate','pilot.pause','automation.replay'))
```

Действия про membership/binding в списке **нет**, а `target_type` ограничен
`('store','automation_job')`. Записать аудит-событие о привязке в эту таблицу
**невозможно без миграции**, а миграции запрещены.

Три варианта, решение за владельцем:

* **A** — применить AUTH-1 без строки в `owner_audit_events`, опираясь на
  `created_at` самой строки membership как на след. Ноль дополнительных
  изменений, но слабее аудит.
* **B** — сначала миграция 0026, расширяющая CHECK на `membership.grant` /
  `membership.revoke` и `target_type='membership'`, затем AUTH-1 с полноценным
  аудитом. Требует отдельного разрешения на remote migration и упирается в
  расхождение ledger (метаданные заканчиваются на 0025, физический DDL 0026–0030
  присутствует).
* **C** — писать событие в общий `events`, если его схема это допускает; не
  проверялось в этом аудите и требует отдельного чтения.

Рекомендация: **A** для самой привязки, **B** отдельной задачей позже. Причина —
B тянет за собой ledger-ремонт, который явно вынесен за рамки.

---

## 7. Предусловия

Проверить непосредственно перед применением:

1. Организация существует и `status='active'`.
2. Магазин существует, `org_id` тот же, `status='active'`.
3. Ровно одна Telegram-личность прошла challenge; совпадений не ноль и не два.
4. У этой личности **нет** membership в этой организации (иначе операция —
   no-op, и это надо сообщить, а не «починить»).
5. `MARKET_MINI_APP_SELLER_READS_ENABLED` и
   `MARKET_MINI_APP_SELLER_COMMANDS_ENABLED` = `"true"`.
6. Challenge не истёк и не использован.

---

## 8. Ожидаемый результат

| | До | После |
| --- | --- | --- |
| memberships всего | 1 | 2 |
| memberships `owner`/`active` | 1 | 2 |
| membership у provider=`telegram` | 0 | 1 |
| organizations / stores | 1 / 1 | 1 / 1 — без изменений |
| onboardings | 0 | 0 — без изменений |
| products | 48 | 48 — без изменений |
| ledger MAX(id) | 25 | 25 — без изменений |

`AUTH_1_EXPECTED_SELLER_READ=true`
`AUTH_1_EXPECTED_SELLER_COMMANDS=true`

Пост-проверка (read-only, после применения):

* агрегаты выше совпадают;
* владелец в Mini App видит раздел магазина в кабинете;
* «Подать → Продать» при `MARKET_QUICKPOST_ENABLED=false` по-прежнему ведёт в
  бот — привязка даёт полномочия, а не экран;
* ни один другой человек не получил ничего: `memberships` выросла ровно на 1.

---

## 9. Откат

```sql
UPDATE memberships SET status = 'disabled', updated_at = ?
WHERE org_id = ? AND identity_id = ? AND role = 'owner';
```

`DELETE` не использовать: внешние ключи объявлены `ON DELETE RESTRICT`, а
удалённая строка стирает и след того, что привязка вообще была. `disabled`
мгновенно закрывает доступ, потому что предикат резолвера требует
`status='active'`.

Откат возвращает ровно исходное поведение: у Telegram-личности снова нет
`sellerCommands`, `api`-владелец не затронут, магазин и товары не тронуты.

D1-откат чего-либо ещё не требуется — больше ничего не пишется.

---

## 10. Требования к скрипту

Скрипт **не написан и не выполнен** — apply не разрешён. Когда он появится:

* dry-run по умолчанию, запись только по явному `--apply`;
* ровно одно совпадение личности, иначе отказ;
* проверка challenge на сервере, username как доказательство не принимается;
* никакого вывода PII: ни Telegram ID, ни identity/org/store ID, ни username,
  ни самого кода — только `status: created|existing` и агрегаты;
* никаких новых org/store/onboarding;
* минимум строк: 1 insert, 0 update;
* идемпотентность через `INSERT OR IGNORE` + `UNIQUE(org_id, identity_id)`;
* режим отката (`--revoke`), выполняющий UPDATE из раздела 9;
* пост-проверка агрегатов после применения.

---

## 11. Что делать нельзя

* Привязывать по username или по «владелец назвал аккаунт».
* Создавать организацию, магазин или онбординг.
* Менять или удалять существующий `api`-membership.
* Выполнять remote migration и чинить ledger в рамках AUTH-1.
* Выдавать полномочия из клиента, из маршрута или из feature flag.
* Печатать в логи или в отчёт challenge, Telegram ID и любые внутренние ID.

---

## 12. Owner gate

```
AUTH_1_SELECTED_MODEL=AUTH-B (одна строка memberships, role=owner, той же организации)
AUTH_1_OWNER_PROOF=owner-issued одноразовый challenge, предъявленный из initData-аутентифицированной Mini App сессии; привязывается claims.sub
AUTH_1_TABLES_TO_WRITE=memberships
AUTH_1_ROWS_TO_INSERT=1
AUTH_1_ROWS_TO_UPDATE=0
AUTH_1_AUDIT_ROWS=0 (CHECK не допускает membership-действие; варианты A/B/C в разделе 6)
AUTH_1_EXPECTED_SELLER_READ=true
AUTH_1_EXPECTED_SELLER_COMMANDS=true
AUTH_1_ROLLBACK=UPDATE memberships SET status='disabled' (никогда DELETE)
AUTH_1_RISK=низкий при доказанном владении; главный риск — привязка не той личности, что снимается одноразовым challenge и правилом «ровно одно совпадение»
AUTH_1_APPLY_AUTHORIZED=NO
```

Решения, которые нужны от владельца, прежде чем что-либо применять:

1. Подтвердить модель AUTH-B.
2. Выбрать вариант аудита — A, B или C.
3. Выбрать поверхность: одноразовый скрипт или owner-аутентифицированный
   маршрут поверх существующего `addMembership`.
4. Отдельно разрешить apply.
