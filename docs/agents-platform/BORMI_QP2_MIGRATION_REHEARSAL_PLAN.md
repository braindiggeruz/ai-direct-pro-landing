# QP-2 — план сверки ledger и репетиции миграции

Дата: 2026-08-03 · Статус: **подготовка · ничего не применено**
`QP_2_REMOTE_MIGRATION_APPLIED=NO`

---

## 1. Главная находка: ledger отстал, схема — нет

Прочитано read-only из живой D1 (`rows_written: 0` на каждом запросе).

**Ledger `d1_migrations` заканчивается на `id=25`,
`0025_owner_control_center_audit.sql`.**

В репозитории 30 файлов миграций. Проверено, присутствует ли физически то, что
делают 0026–0030:

| Файл | Что делает | Физически в базе |
| --- | --- | --- |
| `0026_market_buyer_experience.sql` | +4 колонки в `sotuvchi_storefront_sessions` | **4 / 4 есть** |
| `0027_market_catalog_quality.sql` | +`search_terms_json`, +`specifications_json` в `sotuvchi_products` | **2 / 2 есть** |
| `0028_market_product_comparison.sql` | 2 таблицы + 2 индекса | **2 / 2 таблицы есть** |
| `0029_market_checkout_comment.sql` | +`buyer_comment` в `sotuvchi_orders` | **есть** |
| `0030_market_telegram_reliability.sql` | 3 таблицы + 3 индекса | **3 / 3 таблицы есть** |

Вывод: **изменения применены, запись в ledger не произошла.** Ничего не
потеряно; ledger недосчитывает пять миграций.

### 1.1. Почему нельзя просто запустить `migrations apply --remote`

Wrangler выполнит всё, чего нет в ledger, то есть 0026–0030 заново.

* `CREATE TABLE IF NOT EXISTS` и `CREATE INDEX IF NOT EXISTS` — идемпотентны,
  пройдут без вреда.
* **`ALTER TABLE … ADD COLUMN` в SQLite не идемпотентен** и `IF NOT EXISTS` не
  поддерживает. 0026, 0027 и 0029 упадут с `duplicate column name`.

Значит наивный `apply --remote` **сломается на первой же миграции** и оставит
ledger в том же состоянии. Это и есть причина, по которой ledger нельзя чинить
повторным прогоном.

---

## 2. Порядок работ (ничего из этого ещё не выполнено)

### Шаг 0 — backup / export

```
npx wrangler d1 export gptbot-ai-drafts --remote --output ./backups/d1-<stamp>.sql
```

Хранить вне репозитория. Проверить размер и что дамп содержит
`CREATE TABLE sotuvchi_products`. Без успешного дампа — стоп.

### Шаг 1 — локальная копия и репетиция

```
npx wrangler d1 execute gptbot-ai-drafts --local --file ./backups/d1-<stamp>.sql
```

Дальше всё репетируется **только** с `--local`.

### Шаг 2 — ремонт ledger (единственная запись, которая понадобится в prod)

Не прогон, а вставка отсутствующих записей — потому что изменения уже
физически есть:

```sql
-- 0031_ledger_repair.sql   (DRAFT — метаданные, схему не трогает)
INSERT OR IGNORE INTO d1_migrations (id, name) VALUES
  (26, '0026_market_buyer_experience.sql'),
  (27, '0027_market_catalog_quality.sql'),
  (28, '0028_market_product_comparison.sql'),
  (29, '0029_market_checkout_comment.sql'),
  (30, '0030_market_telegram_reliability.sql');
```

Перед вставкой обязательно перепроверить физическое наличие каждого объекта тем
же запросом, что дал таблицу выше. Если хоть один отсутствует — **не вставлять
эту строку**, а прогнать именно её миграцию.

Rollback шага: `DELETE FROM d1_migrations WHERE id BETWEEN 26 AND 30;` —
метаданные, данные не затрагиваются.

**Это единственная production-запись, которую QP-2 попросит до самой миграции,
и она требует owner gate.**

### Шаг 3 — forward migration (черновик в ADR ownership)

`0032_market_classified_listings.sql` — колонки владения и классифайд-фактов,
`market_locations`, `market_categories`, индексы. Полный текст —
`ADR_BORMI_CLASSIFIED_LISTING_OWNERSHIP.md` §3.

Backfill после DDL:

```sql
UPDATE sotuvchi_products
   SET owner_identity_id = (
         SELECT m.identity_id FROM memberships m
          WHERE m.org_id = sotuvchi_products.org_id
            AND m.role = 'owner' AND m.status = 'active'
          LIMIT 1),
       seller_kind = 'business',
       discoverable = CASE WHEN status = 'published' THEN 1 ELSE 0 END
 WHERE owner_identity_id IS NULL;
```

Blast radius: **48 строк, 1 магазин, 1 организация.**

### Шаг 4 — rollback migration (черновик)

```sql
-- 0032_down.sql
DROP INDEX IF EXISTS idx_products_expiry;
DROP INDEX IF EXISTS idx_products_location;
DROP INDEX IF EXISTS idx_products_owner;
DROP INDEX IF EXISTS idx_products_discovery;
ALTER TABLE sotuvchi_products DROP COLUMN market_category_id;
ALTER TABLE sotuvchi_products DROP COLUMN discoverable;
ALTER TABLE sotuvchi_products DROP COLUMN listing_expires_at;
ALTER TABLE sotuvchi_products DROP COLUMN location_id;
ALTER TABLE sotuvchi_products DROP COLUMN condition;
ALTER TABLE sotuvchi_products DROP COLUMN seller_kind;
ALTER TABLE sotuvchi_products DROP COLUMN owner_identity_id;
DROP TABLE IF EXISTS market_categories;
DROP TABLE IF EXISTS market_locations;
```

`ALTER TABLE … DROP COLUMN` поддержан SQLite с 3.35; версию движка D1 **проверить
на локальной копии до того, как полагаться на этот откат**. Если не поддержан —
откат становится восстановлением из дампа шага 0, и это меняет план.

### Шаг 5 — query impact analysis

Каждый покупательский запрос, сегодня фильтрующий `store_id = ?`, должен
получить `discoverable = 1` и по-прежнему исключать `status='draft'`.
Затрагиваются `catalog/store.ts` (каталог, поиск, vocabulary), buyer facts и
comparison. Тест обязан доказать, что черновик не попадает в покупательский
ответ ни по одному пути.

### Шаг 6 — index plan

Четыре индекса из §3 ADR. На 48 строках их эффект не измерить — план исходит из
формы запроса, а не из текущего объёма, и это указано честно.

### Шаг 7 — fixtures и bounded pilot

Фикстуры: одно частное объявление и один товар магазина в одной выдаче.
Пилот: ограниченная когорта, `discoverable` включается только для неё.

---

## 3. Чего этот план НЕ делает

`wrangler d1 migrations apply --remote` не запускался и не будет запущен без
отдельного owner gate. Production schema не изменялась. Частные продавцы не
создавались. Buyer discovery не менялся. Дамп не снимался — шаг 0 тоже требует
разрешения, потому что это выгрузка производственных данных.

## 4. Owner gate

1. Разрешить экспорт/дамп производственной D1.
2. Разрешить ремонт ledger (вставку строк 26–30).
3. Утвердить схему из ownership ADR.
4. Отдельно разрешить изменение buyer discovery.

До этого: `QP_2_LEDGER_RECONCILED=YES` (сверка выполнена, ремонт — нет),
`QP_2_SCHEMA_SELECTED=NO`, `QP_2_REHEARSAL=NOT_RUN`.
