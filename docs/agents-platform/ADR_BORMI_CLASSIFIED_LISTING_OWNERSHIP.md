# ADR — владение объявлением и разъединение buyer discovery

Дата: 2026-08-03 · Статус: **PROPOSED · требует owner gate**
Ветка: `feature/bormi-quickpost` · База: `5e3695c`

**Supersedes** `ADR_BORMI_PRIVATE_SELLER_PROVISIONING.md` только в части выбора
модели: тот ADR отклонил Model A (невидимая частная витрина) и назвал Model B
курсом. Здесь Model B доводится до конкретной схемы. Отклонение Model A
остаётся в силе и не переписывается.

Владелец уже утвердил (OWNER_DECISION_QP2, OWNER_DECISION_FIELDS):

* объявление должно иметь реального владельца-пользователя;
* buyer discovery не должен навсегда оставаться привязанным к одной storefront
  route;
* `condition` и `location` — **first-class structured data**, не ключи в
  `specifications_json`.

Remote migration и production provisioning запрещены. Ниже — доказательства и
проект схемы, не применение.

---

## 1. Evidence (live, read-only, `rows_written: 0`)

```
sotuvchi_products   FK (org_id, store_id) → sotuvchi_stores        NOT NULL
                    FK (org_id, store_id, category_id) → sotuvchi_categories
                    колонок владельца, состояния, локации, типа продавца НЕТ
sotuvchi_stores     org_id UNIQUE                → один магазин на организацию
sotuvchi_categories UNIQUE (store_id, slug)      → словарь живёт внутри магазина
storefront sessions привязывают сессию к одному (org_id, store_id)
```

Buyer discovery: `functions/market/access.ts` → `resolveStorefrontRoute` /
`resolveStoredStorefrontContext` / `resolveDirectPilotStorefront`; каталог,
поиск и главная читают из `access.buyer.storeId`.

Масштаб на сегодня: **1 организация, 1 магазин, 1 membership, 48 товаров,
7 категорий, 0 черновиков.** Blast radius миграции — 48 строк в одной витрине.

Проверено отсутствие целевых колонок:
`owner_identity_id`, `condition`, `location_id`, `seller_kind` — **0 из 4**.

---

## 2. Варианты схемы

### Вариант 1 — расширить `sotuvchi_products` на месте · **РЕКОМЕНДОВАН**

Товар и объявление остаются одной строкой. Добавляются колонки владения и
классифайд-фактов; store/business-каталог продолжает работать без изменений.

**За:** `sotuvchi_orders`, `sotuvchi_order_items`, `sotuvchi_inventory`,
`sotuvchi_buyer_presentations`, `sotuvchi_buyer_comparisons` — все ссылаются на
`(org_id, store_id, product_id)`. Параллельная таблица объявлений раздвоила бы
каждую из этих связей и весь поиск. 48 строк мигрируются тривиально. Откат —
`DROP COLUMN` либо просто прекращение чтения новых колонок.

**Против:** таблица накапливает обе роли — товар магазина и частное объявление.
Смягчается тем, что разделяет их одна колонка `seller_kind`, а не форма записи.

### Вариант 2 — отдельная таблица `market_listings` + presentation-слой

**За:** чистое разделение бизнес-каталога и классифайдов.
**Против:** удваивает orders/inventory/comparison/search; buyer read должен
объединять два источника; 48 существующих товаров либо копируются, либо живут в
другой модели. Рост сложности несопоставим с выигрышем при одном магазине.

### Вариант 3 — оставить как есть, частник только через бота

Это статус-кво и то, что поручено убрать.

---

## 3. Рекомендованная схема (проект, не применено)

```sql
-- 0031_market_classified_listings.sql   (DRAFT — NOT APPLIED)

-- Владение. Nullable, потому что 48 существующих товаров принадлежат магазину,
-- а не человеку; backfill ставит владельца-организации из memberships(role='owner').
ALTER TABLE sotuvchi_products ADD COLUMN owner_identity_id TEXT
  REFERENCES identities(id) ON DELETE RESTRICT;

-- Кто продаёт. Выводится СЕРВЕРОМ из ownership/capability, никогда из клиента.
ALTER TABLE sotuvchi_products ADD COLUMN seller_kind TEXT NOT NULL
  DEFAULT 'business' CHECK (seller_kind IN ('private', 'business'));

-- Состояние вещи. Nullable: у товара магазина его может не быть.
ALTER TABLE sotuvchi_products ADD COLUMN condition TEXT
  CHECK (condition IS NULL OR condition IN
    ('new', 'like_new', 'good', 'used', 'for_repair'));

ALTER TABLE sotuvchi_products ADD COLUMN location_id TEXT
  REFERENCES market_locations(id) ON DELETE RESTRICT;

-- Классифайд живёт не вечно. Nullable = не истекает (товар магазина).
ALTER TABLE sotuvchi_products ADD COLUMN listing_expires_at TEXT;

-- Виден ли листинг за пределами своей витрины. Это и есть рычаг разъединения
-- buyer discovery: чтение перестаёт быть "store_id = ?" и становится
-- "discoverable = 1", а витрина магазина остаётся отдельным фильтром.
ALTER TABLE sotuvchi_products ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 0
  CHECK (discoverable IN (0, 1));

CREATE TABLE IF NOT EXISTS market_locations (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES market_locations(id) ON DELETE RESTRICT,
  kind        TEXT NOT NULL CHECK (kind IN ('country', 'region', 'district')),
  code        TEXT NOT NULL UNIQUE,
  name_ru     TEXT NOT NULL,
  name_uz     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Общий словарь категорий. Магазинные категории НЕ трогаются — они остаются
-- каталогом витрины; общая категория живёт рядом и используется для поиска.
CREATE TABLE IF NOT EXISTS market_categories (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES market_categories(id) ON DELETE RESTRICT,
  slug        TEXT NOT NULL UNIQUE,
  name_ru     TEXT NOT NULL,
  name_uz     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  sort_order  INTEGER NOT NULL CHECK (sort_order >= 0 AND sort_order <= 1000000),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

ALTER TABLE sotuvchi_products ADD COLUMN market_category_id TEXT
  REFERENCES market_categories(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_products_discovery
  ON sotuvchi_products (discoverable, status, market_category_id);
CREATE INDEX IF NOT EXISTS idx_products_owner
  ON sotuvchi_products (owner_identity_id, status);
CREATE INDEX IF NOT EXISTS idx_products_location
  ON sotuvchi_products (location_id, status);
CREATE INDEX IF NOT EXISTS idx_products_expiry
  ON sotuvchi_products (listing_expires_at) WHERE listing_expires_at IS NOT NULL;
```

`condition` хранится кодом, а RU/UZ подписи живут в i18n рядом с существующим
`labelForStatus` — так же, как уже сделано для handoff reason/status.

**Enum состояния не утверждается этим ADR.** Он требует category review: для
части категорий шкала «как новое» бессмысленна. До ревью — пять значений выше
как кандидат.

---

## 4. Ответы на доменные вопросы

| Вопрос | Ответ |
| --- | --- |
| Расширять `sotuvchi_products`? | Да, Вариант 1 |
| Отдельная listing-абстракция? | Только presentation-уровень (DTO), не таблица |
| Как отвязать discovery от одного storeId | `discoverable = 1` заменяет `store_id = ?` в каталоге; витрина магазина остаётся отдельным фильтром |
| Как сохранить бизнес-каталог | Он и есть `seller_kind='business'` + `discoverable` по решению магазина; store-категории не трогаются |
| Владелец-частник | `owner_identity_id` + `seller_kind='private'` |
| Tenant isolation | `(org_id, store_id)` остаётся на месте; запись по-прежнему требует membership; чтение расширяется только для `discoverable` и только на публичные поля |
| Категории | Новый общий словарь рядом с магазинным, а не вместо него |
| Сосуществование private/business | Одна таблица, одна колонка различия, разная подача |
| Orders только для orderable | Заказ разрешён при `seller_kind='business'` **и** наличии inventory; частное объявление — contact-first |
| Contact-first без фиктивного checkout | Частное объявление не открывает checkout; кнопка ведёт в существующий handoff-канал |
| Ранжирование private + business | Существующий scorer; `seller_kind` — не буст, а фильтр/подпись |
| Archive / expiry / moderation | `status='archived'` уже есть; `listing_expires_at` даёт истечение; модерация по `owner_identity_id` |
| Bormi Match | Читает те же `discoverable` строки — второй источник не заводится |
| Rollback | Прекратить читать новые колонки; при необходимости `DROP COLUMN`; данные магазина не затронуты |

---

## 5. Privacy / threat model

* `location_id` — только район, без координат и без домашнего адреса; ориентир,
  если появится, — приватное поле, не выдаваемое в публичный DTO.
* `owner_identity_id` **никогда** не выходит в покупательский DTO; наружу
  только `seller_kind` и подпись.
* `seller_kind` выводится сервером; клиентское значение не принимается — иначе
  это self-promotion.
* Чтение чужого объявления даёт только публичные поля; запись по-прежнему
  требует membership на `(org_id, store_id)`.
* Расширение buyer read — самая опасная часть: `discoverable` должен войти в
  каждый catalog-запрос, иначе черновик утечёт в выдачу. Тест обязан проверять,
  что `status='draft'` не появляется в покупательских ответах.

---

## 6. Owner gate

1. Подтвердить Вариант 1 (расширение `sotuvchi_products`), а не отдельную
   таблицу объявлений.
2. Утвердить enum `condition` после category review.
3. Утвердить справочник локаций (источник данных по Узбекистану).
4. Разрешить ledger repair (см. rehearsal plan) — это единственная запись в D1,
   которая понадобится до самой миграции.
5. Разрешить изменение buyer discovery — отдельным gate, потому что это
   затрагивает каждый покупательский запрос.

До ответа: `QP_2_SCHEMA_SELECTED=NO`, `QP_2_REMOTE_MIGRATION_APPLIED=NO`.

## 7. Что этот ADR НЕ разрешает

Применение миграции; изменение покупательского чтения; создание частных
продавцов; выдачу `seller_kind` клиентом; удаление магазинных категорий;
параллельный marketplace backend; vision.
