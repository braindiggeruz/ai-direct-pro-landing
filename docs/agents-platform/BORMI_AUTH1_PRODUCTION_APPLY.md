# Bormi AUTH-1 — production apply

Дата: 2026-08-03. Ветка `feature/bormi-quickpost`. Owner approval получен:
`AUTH-1 APPLY APPROVED. APPLY AUDITED BINDING AND ENABLE QUICKPOST CANARY.`

Схемная часть применена и проверена. Привязка **не выполнена**: она требует
действия владельца, которое нельзя ни делегировать, ни симулировать.

Идентификаторы (D1, organization, store, identity, Telegram) в этом документе не
приводятся сознательно.

---

## 1. Live reconciliation до первой записи

```
ACTUAL_BRANCH=feature/bormi-quickpost
ACTUAL_HEAD=cb4579e4775ded1351afc31378f285a30449780c
ACTUAL_ORIGIN_MAIN=253c1b75639454585f7d21559067739b95b41a2e
REMOTE_FEATURE_HEAD=cb4579e (совпадает с локальным)
WORKTREE_CLEAN=YES        MERGE_REBASE_STATE=none        STASH_COUNT=0
AUTH1_COMMITS_PRESENT=bb361f6, 5763d14, 05d783b, c16af37, cb4579e — все пять
```

Cloudflare, read-only:

| | было |
|---|---|
| root | `6b3d80f1-8484-4a76-b547-4f83e1122556` (c16af37, `main`) |
| static | `a9372929-5d19-4248-ada5-0c8458a6e7ef` (c092353, `feature/gptbot-market-mini-app-synthetic-candidate`) |
| Smart Placement | `mode = "smart"` |
| bindings | GPTBOT_DRAFTS_DB, LOGIN_ATTEMPTS, MARKET_MEDIA, AI, AUTOMATION_QUEUE |
| vars | 18, все флаги как задокументировано |

D1, read-only:

```
D1_LEDGER_LAST=0025_owner_control_center_audit.sql   (25 строк)
PHYSICAL_0026_0030_PASS=yes
  0026: 4 колонки + 1 индекс · 0027: 2 колонки · 0028: 2 таблицы
  0029: 1 колонка · 0030: 3 таблицы
AUDIT_ROWS_BEFORE=6          AUDIT_INDEXES_BEFORE=3
CHALLENGE_TABLE_EXISTS=no
TELEGRAM_IDENTITY_CANDIDATES=7
TELEGRAM_ACTIVE_OWNER_MEMBERSHIPS=0
ORGANIZATIONS_BEFORE=1  (1 active)     STORES_BEFORE=1  (1 active)
ONBOARDINGS_BEFORE=0    MEMBERSHIPS_BEFORE=1 (provider=api)
IDENTITIES_BEFORE=8     PRODUCTS_BEFORE=48
```

Ровно одна активная организация и ровно один активный магазин —
target однозначен. Семь Telegram-личностей существуют, но ни одна не имеет
membership; какая именно будет привязана, решает аутентифицированная сессия
погашения, а не этот список.

## 2. Pre-apply gates

| гейт | результат |
|---|---|
| TypeScript functions / root / Mini App | 0 / 0 / 0 |
| ESLint changed scope | 0 |
| market-owner-telegram-binding | 45/45 |
| Полный корпус | 1299/1302 |
| boundaries | OK |
| secret scan | clean, 3017 файлов |
| `git diff --check` | clean |
| local rehearsal | 42/42 |
| production rows_written до apply | 0 |

Три унаследованных падения, ранее воспроизведённые на чистом `31e56f0`:
productization route baseline, sitemap 240≠234, sotuvchi-onboarding.

## 3. Backup

```
BACKUP_CREATED=YES
BACKUP_TIMESTAMP=20260803-1516
BACKUP_PATH=F:\Claude\bormi-recovery\D1-BACKUP-20260803-1516\   (вне Git)
BACKUP_SIZE=10 861 501 байт (10.36 MB)
BACKUP_SHA256=EC8EC87981EAD1E9B26E22B421B032176A7F2F1586F897008BADB5C8F1D446F7
BACKUP_READ_CHECK=PASS
```

Проверка чтения — не размером файла, а восстановлением: дамп загружен в
локальную SQLite целиком. 72 `CREATE TABLE`, 3104 `INSERT`, и каждый агрегат
совпал с production (ledger 25, audit 6, memberships 1, identities 8, orgs 1,
stores 1, onboardings 0, products 48), `integrity_check=ok`, 0 нарушений FK.

## 4. Ledger reconciliation

`wrangler d1 execute --remote --file scripts/d1/reconcile-ledger-0026-0030.sql`

```
LEDGER_ROWS_INSERTED=5        (25 → 30, id 26–30 подряд)
LEDGER_LAST_AFTER=0030_market_telegram_reliability.sql
BUSINESS_ROWS_CHANGED=0
FOREIGN_KEY_CHECK=PASS  (748 строк просмотрено, 0 нарушений)
```

D1 отчитался «Rows written: 15» при пяти вставках: это учёт записи в уникальный
индекс `name` и в `sqlite_sequence` (3 записи на строку). Таблица получила ровно
5 строк, что подтверждено прямым запросом.

После реконсиляции `wrangler d1 migrations list --remote` показал к применению
ровно `0031` и `0032` — 0026–0030 больше не переигрываются. Это и было целью.

## 5. Migration 0031

```
AUDIT_ROWS_BEFORE=6        AUDIT_ROWS_AFTER=6
AUDIT_INDEXES_BEFORE=3     AUDIT_INDEXES_AFTER=3
AUDIT_NEW_ACTION_ACCEPTED=yes   (CHECK содержит seller.bind)
LEFTOVER owner_audit_events_new=0
```

Сохранность доказана не счётчиком, а отпечатком. Все 6 строк выгружены до и
после и захешированы:

```
до    sha256 = 6b280b4687f6dac725b36dcef036611c4114b2c7079a844f9353ac32890d663d
после sha256 = 6b280b4687f6dac725b36dcef036611c4114b2c7079a844f9353ac32890d663d
```

Побайтово идентичны. Определения всех трёх индексов совпадают с
зафиксированными до перестройки:

```
idx_owner_audit_actor    (actor_email, created_at DESC)
idx_owner_audit_created  (created_at DESC)
idx_owner_audit_target   (target_type, target_id, created_at DESC)
```

## 6. Migration 0032

```
CHALLENGE_TABLE_CREATED=yes
CHALLENGE_COLUMNS=challenge_hash, org_id, store_id, action, created_by,
                  created_at, expires_at, redeemed_at
RAW_TOKEN_COLUMN_PRESENT=no   (0 колонок с token/raw/secret в имени)
CHALLENGE_FKS=2               (organizations, sotuvchi_stores)
CHALLENGE_INDEXES=idx_seller_binding_challenge_open + PK autoindex
CHALLENGE_ROWS=0
```

## 7. Integrity и foreign keys

`PRAGMA integrity_check` на D1 remote запрещён — возвращает
`not authorized: SQLITE_AUTH [code: 7500]`. Это ограничение платформы, не сбой.

Замена: post-migration состояние выгружено целиком и проверено локально.

```
FOREIGN_KEY_CHECK (remote)  = PASS, 0 нарушений
INTEGRITY_CHECK (по выгрузке post-migration) = ok
FK_VIOLATIONS (по выгрузке) = 0
```

Post-migration выгрузка: `F:\Claude\bormi-recovery\D1-BACKUP-POST-MIGRATION-20260803-1519\`

## 8. Инварианты бизнес-данных

| | до | после миграций |
|---|---|---|
| organizations | 1 | 1 |
| sotuvchi_stores | 1 | 1 |
| sotuvchi_onboardings | 0 | 0 |
| memberships | 1 | 1 |
| identities | 8 | 8 |
| sotuvchi_products | 48 | 48 |
| owner_audit_events | 6 | 6 |
| таблиц | 73 | 74 (+ challenge) |

```
membership rows inserted = 0
audit binding rows       = 0
challenge rows           = 0
```

## 9. Binding flag deployment

`wrangler.toml` — единственное изменение: `MARKET_OWNER_TELEGRAM_BINDING_ENABLED`
`"false"` → `"true"`. Закоммичено (`d0e3a73`), чтобы задеплоенная конфигурация
соответствовала реальному SHA, а не существовала только на диске.

```
root deployment: fc22fdc8-12ff-4df3-8141-23f470c0c951  (d0e3a73, main)
rollback target: 6b3d80f1-8484-4a76-b547-4f83e1122556  (c16af37, main)
static: не передеплоен — под apps/ ноль изменений; service worker bormi-shell-v13
MARKET_QUICKPOST_ENABLED=false   MARKET_QUICKPOST_AI_ENABLED=false
Smart Placement, bindings, vars, secrets, auto-deploy off — без изменений
```

Проверка после деплоя: `POST /api/admin/seller-binding/challenge` без токена →
`401`, `GET` → `405`. Включённый флаг публичную дверь не открывает.

## 10. Почему привязка не выполнена: половина протокола не реализована

ADR, раздел 5, шаг 2:

> Владелец открывает Bormi Mini App **со своего** Telegram-аккаунта и **вводит
> код там**.

Этого экрана не существует. Во всём `apps/market-mini-app/src` нет ни одного
упоминания `seller-binding`, `sellerBinding` или `challenge`: AUTH-1 добавил
серверный маршрут `POST /identity/seller-binding`, но клиентскую половину — нет.
Фронтенд в этой работе не менялся вовсе, что подтверждено пустым
`git diff --name-only -- apps/`.

Обходного пути нет, и это следствие правильного решения, а не упущения:

- **Выпуск.** Требует подписанного `platform_owner` JWT. Секрет живёт в
  Cloudflare Pages; получать или вводить учётные данные владельца агент не
  вправе. Владелец может выпустить challenge сам из своей admin-сессии.
- **Погашение.** Требует market-сессии. Токен сессии — модульная переменная
  `let sessionToken = ''` в `apps/market-mini-app/src/lib/api.ts`: он не
  сохраняется ни в `localStorage`, ни в `sessionStorage`, и не выставлен ни на
  `window`, ни на `globalThis`. Достать его из консоли DevTools нельзя. Это
  сделано намеренно и ослаблять это ради одной операции неправильно.
- Вставить строку `memberships` напрямую в D1 — ровно тот путь, который вся эта
  конструкция существует, чтобы запретить: тогда привязка не была бы доказана
  ничем.

Поэтому окно было закрыто обратно: флаг, через который никто не может пройти, —
это бессмысленная, пусть и крошечная, поверхность.

```
d0e3a73  открыл окно   (deployment fc22fdc8)
b9be438  закрыл окно   (deployment e1c24a99)  ← текущее production
```

Схема при этом остаётся применённой и корректной. Ledger, перестроенная таблица
аудита и таблица challenge отката не требуют и не получают.

## 11. Что осталось до привязки

Один фронтенд-срез в Mini App — экран ввода кода, вызывающий уже существующий
`POST /identity/seller-binding`:

- поле ввода 64 hex-символов, RU/UZ, light/dark, BackButton;
- один вызов существующего API, без нового серверного кода;
- обработка закрытого словаря ошибок (`validation_failed`, `state_conflict`,
  `rate_limited`, `storefront_unavailable`);
- тесты и static deploy (`gptbot-market-mini-app`), с бампом service worker.

После него последовательность достраивается без изменений: включить флаг,
владелец выпускает код в admin-сессии и вводит его в Mini App, флаг выключается,
QuickPost включается.

Это отдельное решение владельца: в утверждённый список из шестнадцати
production-изменений сборка и деплой нового экрана Mini App не входит.

## 12. Что не выполнялось

Ни одной строки membership, ни одного audit-события привязки, ни одного
challenge. QuickPost не включён. AI и vision не включались. Организации,
магазины, onboarding, identities и существующая API-owner membership не
изменялись. BotFather, webhook, Railway, n8n не трогались. QP-1B и QP-2 не
начинались.
