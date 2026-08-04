# Миграция 0033 — расширение словаря аудита и её репетиция

Файл: `migrations/0033_owner_audit_listing_actions.sql`
Скрипт репетиции: `scripts/admin-audit-migration-rehearsal.ts`
Команда: `npm run admin:audit-rehearsal -- <path-to-backup.sql>`

---

## 1. Зачем

`owner_audit_events` ограничивает два столбца, которые действие над объявлением
не может удовлетворить:

* `action` — закрытый список из семи глаголов, все о магазине, пилоте, задаче
  автоматизации или доступе продавца. Ни один не означает «владелец платформы
  опубликовал это объявление». Записать публикацию как `store.suspend` или
  `automation.replay` значит сделать след активно вводящим в заблуждение — это
  хуже, чем не иметь записи вовсе. А не иметь записи нельзя: неаудированное
  изменение того, что видит покупатель, — ровно то, ради предотвращения чего эта
  таблица существует.
* `target_type` — `('store', 'automation_job')`. Действие выполняется над
  товаром. Миграция 0031 намеренно не расширяла этот столбец, и была права:
  выдача доступа продавцу даётся *к магазину*, поэтому целью был магазин.
  Публикация выполняется не над магазином.

`reason_code` **не** расширялся: существующих восьми значений достаточно.

---

## 2. Что делает миграция

SQLite не умеет менять CHECK на месте, поэтому таблица пересобирается:

1. `CREATE TABLE owner_audit_events_new` — те же столбцы, те же значения по
   умолчанию, тот же PK, тот же `UNIQUE (idempotency_key)`, те же ограничения
   длин; отличий ровно два — три новых `action` и один новый `target_type`;
2. `INSERT … SELECT` всех строк по именам столбцов;
3. `DROP TABLE owner_audit_events`;
4. `ALTER TABLE … RENAME TO owner_audit_events`;
5. три `CREATE INDEX` — `idx_owner_audit_actor`, `idx_owner_audit_created`,
   `idx_owner_audit_target`.

Ни одна бизнес-таблица не затрагивается: в файле нет упоминаний
`sotuvchi_products`, `sotuvchi_categories`, `sotuvchi_orders` и `memberships`
(проверяется тестом).

### Про «пять индексов»

Их действительно пять, и три из них создаются явно. Ещё два — автоматические:
`sqlite_autoindex_owner_audit_events_1` для `event_id TEXT PRIMARY KEY` и
`sqlite_autoindex_owner_audit_events_2` для `UNIQUE (idempotency_key)`.
`ALTER TABLE … RENAME` переименовывает и их, поэтому после миграции список
имён индексов совпадает с исходным посимвольно. Это проверено локально на
полностью применённом реестре миграций:

```
BEFORE: idx_owner_audit_actor, idx_owner_audit_created, idx_owner_audit_target,
        sqlite_autoindex_owner_audit_events_1, sqlite_autoindex_owner_audit_events_2
AFTER:  то же самое, в том же порядке
```

---

## 3. Что проверяет репетиция

Скрипт восстанавливает экспорт D1 в локальную базу, снимает отпечаток, применяет
0033 и сравнивает. Он никогда не обращается к продакшену и печатает счётчики,
отпечатки и схему — никогда строку, адрес или имя.

| Проверка | Что доказывает |
| --- | --- |
| `AUDIT_ROWS_BEFORE == AUDIT_ROWS_AFTER` | ни одна строка не потеряна |
| SHA-256 по всем строкам совпадает | ни одно значение не изменилось |
| список индексов совпадает | ни один индекс не потерян |
| `PRODUCTS_BEFORE == PRODUCTS_AFTER` | бизнес-таблицы не тронуты |
| старый CHECK отклоняет `listing.publish` | миграция вообще нужна |
| после — все три новых действия принимаются | миграция сделала то, что должна |
| выдуманное действие отклоняется | список расширился, а не открылся |
| выдуманный `target_type` отклоняется | то же для целей |
| повторный `idempotency_key` отклоняется | UNIQUE пережил пересборку |
| `integrity_check` / `foreign_key_check` до и после | база цела |

---

## 4. Результат репетиции

Прогон воспроизведён 2026-08-04 против экспорта продакшена
`bormi-recovery/D1-BACKUP-PRECANARY-20260803-1804/gptbot-ai-drafts-precanary.sql`
(10.9 МБ, снят в предыдущей сессии; продакшен в этой сессии не читался):

```
restored: 3274 statements applied, 0 skipped

AUDIT_ROWS_BEFORE=6
AUDIT_FINGERPRINT_BEFORE=90efa0c22d68dcb8…
AUDIT_INDEXES_BEFORE=idx_owner_audit_actor, idx_owner_audit_created,
                     idx_owner_audit_target,
                     sqlite_autoindex_owner_audit_events_1,
                     sqlite_autoindex_owner_audit_events_2
PRODUCTS_BEFORE=48

PASS  the current CHECK rejects listing.publish (migration is needed)
PASS  every audit row survived  — 6 -> 6
PASS  every surviving row is byte-identical
PASS  every index survived  — все пять, теми же именами
PASS  business tables untouched  — products 48 -> 48
PASS  all three listing actions are accepted  — 3/3
PASS  an action outside the list is still refused
PASS  a target type outside the list is still refused
PASS  a duplicate idempotency key is still refused
PASS  integrity_check / foreign_key_check до и после

ADMIN_AUDIT_MIGRATION_REHEARSAL=PASS
```

Дополнительно подтверждено в этой сессии:

* поведение системы **без** миграции: команда отвечает
  `listing_transition_conflict` (409) и не меняет объявление
  (`tests/bormi-admin-commands.test.ts`);
* сплиттер операторов, которым пользуется скрипт репетиции, корректно разбирает
  именно этот файл — 8 операторов, применяются без ошибок.

Экспорт от 2026-08-03 не обязательно совпадает с продом на день применения,
поэтому перед применением репетицию нужно прогнать заново на свежем бэкапе —
это шаг 2 в [BORMI_ADMIN_V1_PRODUCTION_RELEASE.md](BORMI_ADMIN_V1_PRODUCTION_RELEASE.md).

---

## 5. Откат

Обратная пересборка — та же таблица без трёх глаголов и без `product` —
допустима **только пока ни одна строка их не использует**. После первого
аудированного действия над объявлением сужение CHECK либо упадёт на копировании,
либо потребует удалить ту самую строку, которая фиксирует, что владелец сделал с
объявлением продавца. Удаление истории аудита ради восстановления ограничения —
не откат.

Поэтому после появления такой строки откатывается **действие**, а не схема:
обратным доменным переходом (`publish` ↔ `unpublish`; у `archive` обратного
перехода в домене каталога нет). Схема остаётся.

---

## 6. Известное ограничение скрипта репетиции

`statements()` разбивает дамп по точкам с запятой, отслеживая одиночные кавычки.
Апостроф внутри `--`-комментария сдвигает этот учёт. В `0033` такой апостроф
ровно один и находится в завершающем комментарии об откате, после последнего
оператора, поэтому разбор корректен — это проверено. Для файла, где комментарий
с апострофом стоял бы между операторами, скрипт потребовал бы более честного
парсера. Зафиксировано здесь, чтобы следующая миграция не наткнулась на это
молча.
