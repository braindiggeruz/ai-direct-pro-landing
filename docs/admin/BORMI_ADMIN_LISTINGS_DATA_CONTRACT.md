# Bormi Admin · ADMIN-3A data contract

Date: 2026-08-04
Branch: `feature/bormi-admin-listings`
Base: `d3f6b02` (`backup/bormi-admin-ux-20260804`)
Read model: `functions/platform/admin/listings.ts`

Everything below was checked against the schema and against production D1 with
read-only statements. `rows_written` was `0` on every one of them.

## 1. What the catalogue actually is

`sotuvchi_products`, created by `migrations/0019_sotuvchi_catalog.sql` and
extended twice since. The columns this surface reads:

| Column | Type | Constraint | Used for |
|--------|------|-----------|----------|
| `id` | TEXT | PRIMARY KEY | Detail address, sort tiebreak |
| `org_id`, `store_id` | TEXT | FK to `sotuvchi_stores(org_id, id)` | Store label, media key |
| `category_id` | TEXT NULL | FK to `sotuvchi_categories` | Category label and filter |
| `sku` | TEXT NULL | UNIQUE per store | Detail only |
| `name` | TEXT | — | The column a person reads |
| `normalized_name` | TEXT | — | Ordering and search |
| `description` | TEXT NULL | — | Quality, buyer preview |
| `price_minor` | INTEGER | `0 … 1e12` | Price |
| `currency` | TEXT | `= 'UZS'` | Shown, never converted |
| `availability` | TEXT | `available \| unavailable \| preorder` | Filter, quality |
| `status` | TEXT | `draft \| published \| archived` | Filter, summary |
| `media_refs_json` | TEXT | JSON array | Photo count, gallery |
| `search_terms_json` | TEXT | JSON array (`0027`) | Detail count only |
| `specifications_json` | TEXT | JSON array (`0027`) | Detail |
| `version` | INTEGER | `>= 1` | Detail |
| `created_at`, `updated_at` | TEXT | ISO | Shown, never sorted on |

`sotuvchi_categories` carries `id, org_id, store_id, name, slug, status
(active|archived), sort_order, created_at, updated_at`.

**`price_minor` is not a minor unit.** The column name says it is; the data says
otherwise. A product in production is named "Тестовый товар 1 000 000" and
carries `price_minor = 1000000`, and the buyer's own presenter
(`formatBuyerPrice`) prints the stored number followed by "сум" with no
division. The admin panel divided by 100 and therefore showed every price at a
hundredth of what the buyer was quoted. Fixed in this stage; locked by a test.

**Stock is not in this table.** `sotuvchi_inventory` (`0022`) holds `on_hand`
per product. ADMIN-3A does not read it: joining a second table for a column no
filter uses would cost a lookup per row for a number the availability field
already summarises. Recorded as a gap, not shown as a zero.

## 2. Index evidence

Every plan below is `EXPLAIN QUERY PLAN` against production D1 on 2026-08-04.

| Query shape | Plan | Verdict |
|---|---|---|
| `WHERE store_id=? AND status=?` `ORDER BY normalized_name, id` | `SEARCH p USING COVERING INDEX idx_sotuvchi_products_store_status_name (store_id=? AND status=?)` | Ideal — index answers filter and order |
| `WHERE status=?` `ORDER BY normalized_name, id` | `SCAN p USING COVERING INDEX …_store_status_name` + `USE TEMP B-TREE FOR ORDER BY` | Covering scan, no table read |
| no filter, `ORDER BY normalized_name, id` | same as above | Covering scan |
| `WHERE normalized_name LIKE 'x%'` | `SCAN p USING COVERING INDEX …` + temp B-tree | Covering scan |
| `WHERE store_id=? AND category_id=? AND status=?` | `SEARCH p USING INDEX …_store_status_name (store_id=? AND status=?)` | Indexed search, table read for `category_id` |
| joins to store and category | `SCAN p USING INDEX …_store_category` + `SEARCH s/c USING sqlite_autoindex (id=?)` | Labels resolved through primary keys |
| **`ORDER BY updated_at DESC`** | **`SCAN p`** + `USE TEMP B-TREE FOR ORDER BY` | **No index at all — not offered** |
| `WHERE store_id=?` `GROUP BY category_id, status` | `SEARCH p USING COVERING INDEX …_store_category (store_id=?)` | Ideal |
| `GROUP BY category_id, status` (all stores) | `SCAN p USING COVERING INDEX …_store_category` + temp B-tree | Covering scan |
| categories list `WHERE store_id=?` | `SEARCH c USING COVERING INDEX idx_sotuvchi_categories_store_status_sort (store_id=?)` | Ideal |

The indexes that exist:

```
idx_sotuvchi_products_store_status_name  (store_id, status, normalized_name, id)
idx_sotuvchi_products_store_category     (store_id, category_id, status, id)
idx_sotuvchi_products_org_store          (org_id, store_id)
idx_sotuvchi_categories_store_status_sort (store_id, status, sort_order, name, id)
idx_sotuvchi_categories_org_store        (org_id, store_id)
```

**What was removed because of this table**, rather than shipped and hidden
behind a 48-row catalogue:

- **Sorting by "обновлено".** `SCAN p`, full table, no index. The column is
  still shown in the row; it is not a sort key. The screen says so.
- **Filtering by an updated-at period.** Same column, same absence. It cannot
  narrow through any index and would only add a per-row read.

Both need `CREATE INDEX … (updated_at)`, which is a migration, and ADMIN-3A adds
none. That is an owner gate of its own.

Current volume, read 2026-08-04: **48 products, 7 categories, 1 store,
1 membership.** Small — which is exactly why the plans above were checked rather
than inferred.

## 3. Cost per screen

| Screen | Statements | Notes |
|---|---|---|
| Listings | 3 | page, filtered count, summary. The count skips both joins because nothing filters on a label. |
| Listing detail | 1 | primary-key lookup with two label joins |
| One image | 1 | primary-key lookup, then one R2 `get` |
| Categories | 2 | batched: the category rows, and one grouped aggregate |

No statement runs inside a loop anywhere in the read model, and a test asserts
it. Page size is the shared `OWNER_LIMITS` — default 25, maximum 100 — not a
new limit invented here.

## 4. Ordering and paging

Ordering is `(normalized_name, id)`. `id` is the primary key, so the order is
total: two rows can never compare equal, and a page boundary cannot duplicate or
drop a row within a stable catalogue.

Paging is `limit`/`offset` through the shared `parsePagination`, the same
validator every other owner endpoint uses. This is a deliberate choice over a
keyset cursor: introducing a second pagination model for one screen would leave
the surface with two, and the property a cursor protects — a stable, total order
— is already held by `(normalized_name, id)`.

The honest limitation: with offset paging, a row inserted or deleted between two
page requests can shift the window. For a catalogue an owner reads while sellers
edit it, that means a row could in principle be seen twice or missed once across
a page turn. Nothing is lost or corrupted; the view is simply not a snapshot.

## 5. Filters, and where each is applied

Every one is applied by SQLite. There is no client-side filter in this panel.

| Filter | Values | Applied as | Index help |
|---|---|---|---|
| `status` | closed list of 3 | `product.status = ?` | Yes, second column |
| `store` | identifier | `product.store_id = ?` | Yes, first column |
| `category` | identifier or `uncategorised` | `= ?` or `IS NULL` | Partial |
| `availability` | closed list of 3 | `product.availability = ?` | No — evaluated over the narrowed set |
| `media` | `with` / `without` | `json_array_length(…) > 0` / `= 0` | No — computed |
| `quality` | closed list of 3 | derived expression over four columns | No — computed |
| `q` | normalised prefix, 2–80 chars | `normalized_name LIKE ? ESCAPE '\'` | Yes |
| `sort` | `name` / `name_desc` | `ORDER BY` | Yes |

An unrecognised value is **refused**, never widened to "all": `parseEnumFilter`
throws, so a typo cannot silently return more rows than the control claims.

The search term is normalised with `normalizedProductName` — the catalogue's own
function, the one that produced the stored `normalized_name`. A term is compared
against what the column holds rather than against the display name. A term under
two characters is dropped rather than run, because a one-character prefix
matches most of the catalogue and reads like a broken filter. There is no
leading wildcard, because a leading wildcard cannot use the index.

## 6. Quality rules

Deterministic, total, and each one names the column that produced it.

| Reason | Expression | Blocking |
|---|---|---|
| `no_photo` | `json_array_length(media_refs_json) = 0` | yes |
| `no_category` | `category_id IS NULL` | yes |
| `no_description` | `description IS NULL OR trim(description) = ''` | no |
| `unavailable` | `availability = 'unavailable'` | no |

State: `incomplete` if any blocking reason is present; otherwise
`needs_attention` if any non-blocking reason is; otherwise `good`.

Blocking means the card cannot do its job — a listing with no photo is not
opened and a listing with no category is not reachable by browsing. There is no
score, no percentage and no ranking, because Bormi records no views, no clicks
and no conversions: any number here would be an opinion with a decimal point.
The same four rules already back the Command Center's attention list, and the
wording is shared so one problem is not called two things on two screens.

## 7. Media

`media_refs_json` holds two kinds of reference. A stored image is `r2.<16 chars>`
and lives in this platform's `MARKET_MEDIA` bucket; anything else is a Telegram
`file_id`, and the bytes are Telegram's.

The reference itself never leaves the server. A client receives an index and a
kind, and asks for bytes by index. The object key is built server-side from the
product's own `org_id` and `store_id` through the existing `mediaObjectKey`, so a
request can only ever address an object inside the store that owns the product it
named. The bucket is never listed.

Telegram-hosted images are **named, not proxied**: the admin console does not
become a second Telegram client. The tile says where the image lives.

The Mini App's media route could not be reused: it resolves the caller through
`claims.sub` and a buyer access context this console does not have and must not
mint. Reusing it would have meant giving the panel a buyer session.

## 8. What is not read

- Buyer identity, Telegram id, username, phone, address, `initData`, sessions.
- `sotuvchi_orders`, `sotuvchi_inventory`, `sotuvchi_handoffs`.
- Anything from `identities` or `memberships`.
- Stock levels, views, conversion, revenue — the first exists and is not read,
  the rest do not exist at all and are named as absent rather than drawn as zero.

## 9. Response shapes

`GET /api/admin/listings` → `{ generated_at, actor, page{limit,offset,sort},
total, count, read_only: true, filters{…echoed…}, summary{total, by_status,
quality, attention}, listings[] }`.

`total` is the filtered count; `summary.total` is the catalogue. They are named
apart on purpose: a screen that confuses them tells the owner the marketplace
shrank when a filter was applied.

`GET /api/admin/listings/:id` → `{ generated_at, actor, read_only: true,
listing{…, media[{index, kind}], specifications[], search_terms[], preview{…} } }`.

`GET /api/admin/listings/:id/media/:index` → image bytes, or a closed-list error
token (`invalid_media_index`, `listing_not_found`, `media_not_found`,
`media_not_stored_here`).

`GET /api/admin/categories` → `{ generated_at, actor, read_only: true, count,
categories[] }`, including one synthetic `uncategorised` row when products with
no category exist.
