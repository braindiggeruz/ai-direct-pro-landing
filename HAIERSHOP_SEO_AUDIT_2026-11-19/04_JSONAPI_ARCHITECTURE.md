# 04 — Архитектура JSON:API HaierShop.uz (фактически обнаруженная)

**Дата:** 19.11.2026. Доступ анонимный, только GET, заголовок `Accept: application/vnd.api+json`, ≤1 запроса/с.
**Объём:** 141 запрос к `/jsonapi` (UZ и RU), собрано 902 ресурсных объекта.

---

## 1. Доступность и формат
| Параметр | Значение |
|---|---|
| Endpoint | `https://haiershop.uz/jsonapi` (а также `/uz/jsonapi`, `/ru/jsonapi` — языковые варианты) |
| HTTP | 200, `Content-Type: application/vnd.api+json`, `Cache-Control: max-age=86400, public`, кеш nginx HIT |
| Спецификация | JSON:API 1.0 (модуль ядра Drupal `jsonapi`) |
| Индекс | 130 ссылок на типы ресурсов (`links`) |
| Пагинация | `page[limit]` (максимум 50) и `page[offset]`, ссылка `links.next` |
| Идентификаторы | UUID (`id`) плюс внутренние `drupal_internal__*` (product_id, tid, nid) |
| Язык | префикс пути (`/ru/jsonapi/...`) возвращает перевод. Атрибуты `langcode`, `default_langcode`, `content_translation_source` |
| Контроль доступа | по сущностям. Недоступные объекты попадают в `meta.omitted` («insufficient authorization»), а не отдаются |
| Режим read-only | **не проверялся**: это потребовало бы методов записи, а они запрещены условиями аудита |
| Признаки побочных эффектов GET | не обнаружены |

---

## 2. Публичные типы ресурсов и что из них читается анонимно

### 2.1 Контент каталога — читается (основной источник для аудита)
| Тип | Объектов (UZ) | Ключевые атрибуты | Связи |
|---|---|---|---|
| `commerce_product--{22 типа}` | 155 (типы: внутренние блоки VRF 27, кондиционеры 21, электроводонагреватели 18, фанкойлы 14, газовые котлы 11, … ; 3 типа пустые) | `title`, `path.alias`, `langcode`, `status`, `created/changed`, **`metatag`** (title/description/OG), `field_meta_tegi` (дубль метатегов в JSON-строке), `field_poddelnyy_zagolovok`, `field_nazvanie_modeli`, `field_opisanie_tovara_1..8`, `field_zagolovok_opisaniya_1..8`, десятки полей характеристик (`field_*`), `field_khit_prodazh`, `overall_rating` | `variations`, `default_variation`, `stores`, `field_vid_tovara` (→ таксономия), `field_izobrazhenie_opisaniya_*` (→ file, с alt/width/height), `uid` |
| `taxonomy_term--tekhnika` | 33 | `name`, `description` (HTML), `weight`, `path.alias`, **`metatag`**, `field_meta_tegi`, `field_otobrazhenie_kategorii_na_` | `parent`, `field_izobrazhenie` |
| `node--news` (блог) | 206 (UZ-перевод есть у 165; у 41 только RU) | `title`, `body`, `path.alias`, `created`, `metatag`, `promote` | изображения |
| `node--page` | 6 | инфостраницы | — |
| `node--slider` | 20 (6 omitted) | слайды главной | — |
| `menu--menu` | 8 | меню (без пунктов) | — |
| `commerce_product_attribute_value--cvet` | 22 | цвета | — |

### 2.2 Защищено (анонимно omitted или пусто) — это корректно
| Тип | Результат |
|---|---|
| `commerce_product_variation--default` | **omitted**: цена, SKU и остатки через API недоступны. Цены взяты из HTML |
| `menu_link_content` | 49 omitted |
| `metatag_defaults` | 11 omitted (шаблоны метатегов недоступны) |
| `pathauto_pattern` | 5 omitted |
| `xmlsitemap` | 2 omitted (две конфигурации sitemap: UZ и RU) |
| `configurable_language` | 4 omitted |
| `commerce_currency` | 2 omitted |
| `commerce_product_review--default` | **2 omitted**: в системе есть 2 отзыва, но публично они недоступны и на сайте не показаны |
| `commerce_store--online` | 0 объектов |
| `taxonomy_term--tags` | 0 объектов |

### 2.3 Перечислены в индексе, но **не запрашивались по соображениям безопасности**
`commerce_order--default`, `commerce_order_item--default`, `commerce_payment--*`, `commerce_payment_method--*`, `profile--customer`, `user--user`, `webform_submission--*`, `contact_message--*`, `sms_*`, `commerce_wishlist--default`, `commerce_shipment--default`, `commerce_promotion_coupon`.

**Статус доступа: НЕ ПРОВЕРЕН намеренно.** Эти типы могут содержать персональные данные. Условия аудита запрещают запрашивать такие данные и подбирать закрытые ресурсы.

> **HS-24 (безопасность, не SEO).** Само перечисление типов в индексе для Drupal штатно. Тем не менее рекомендуется авторизованная проверка прав анонимного пользователя на эти типы, а также:
> - включить режим JSON:API «только чтение» (Drupal: *Accept only JSON:API read operations*);
> - отключить неиспользуемые ресурсы, например через модуль JSON:API Extras;
> - добавить `X-Robots-Tag: noindex` для `/jsonapi`.

---

## 3. SEO-данные, доступные через API
| Данные | Доступно | Примечание |
|---|---|---|
| Meta title / description по сущности | **да** (`metatag` вычисленный) | совпадают с HTML |
| Пользовательские метатеги | да, `field_meta_tegi` (JSON-строка) | дублирующее хранение. Сверка по 376 сущностям (товары и категории, 2 языка): title совпадает 357/357, description 352/357 (5 отличаются хвостом). У 19 сущностей поле пустое. **При сверке найдено:** в meta description RU-товара `/ru/teplovye-nasosy/otopitelnoe-oborudovanie/teplovoy-nasos-haier-hpm08-nd2` вставлен целиком ответ AI-ассистента («Я проанализировал данные… Ниже представлены мои рекомендации…») — HS-27 |
| Алиасы URL | да, `path.alias` (без языкового префикса) | публичный URL = `https://haiershop.uz/{langcode}{alias}` — **100% сопоставление** для товаров, категорий и статей |
| Языковые версии | да | `content_translation_source: ru` у 154 из 155 товаров (оригинал на RU, UZ — перевод) |
| Описания / характеристики | да | основа для анализа полноты (документ 03, §4) |
| Изображения | да, file-связи с `alt`/`title`/`width`/`height` | у проверенных изображений `alt` пустой |
| Цены / наличие / SKU | **нет** (вариации omitted) | только из HTML или JSON-LD |
| Canonical / hreflang / robots | нет | только из HTML |
| Отзывы | нет (omitted) | — |
| Шаблоны метатегов, pathauto, конфигурация sitemap | нет (omitted) | — |

---

## 4. Сопоставление API ↔ публичные URL ↔ sitemap
| Сущности | В API (на язык) | Публичный URL 200 | В sitemap |
|---|---|---|---|
| Товары UZ | 155 | 155 | **76** |
| Товары RU | 155 | 155 | **74** |
| Категории UZ / RU | 33 / 33 | 33 / 33 | 33 / 33 |
| Статьи UZ | 165 переведённых (+41 RU-фолбэк в UZ-ленте API) | 165 (41 фолбэк → 404 на `/uz/`) | 165 |
| Статьи RU | 206 (из них 2 только UZ) | 204 | 204 |
| Страницы | 6 / 6 | 6 / 6 | 6 / 6 |

URL в sitemap без сущности в публичном API (снятые с публикации, на сайте отдают 403):
- `/uz/ornatilgan-tehnika/mikrotolqinli-pechlar/ornatiladigan-mikrotolqinli-pech-haier-hmx-btg259b`
- `…-hmx-btg259x`
- `/ru/vodonagrevateli/vodonagrevatel-haier-es80h-d3`

Это подтверждает, что xmlsitemap включает неопубликованные сущности или не обновляется после снятия с публикации.

---

## 5. Особенности реализации
- **UZ-лента API отдаёт RU-фолбэк** для непереведённых статей (`langcode: ru` в `/uz/jsonapi/node/news`). Публичный `/uz/blog/<ru-alias>` при этом отдаёт 404. Расхождение поведения API и сайта нужно учитывать в будущих интеграциях.
- **Тип `primer_dlya_dublirovaniya_potom_`** («пример для дублирования потом») — технический тип товара без товаров; на SEO не влияет.
- **Оригинал контента — RU.** UZ-переводы создавались позже: `content_translation_source = ru`. Это объясняет RU-строки в UZ-шаблонах (HS-07).
- **Отзывы.** 2 отзыва в системе (omitted), `overall_rating = null` у товаров. Значение 4.9/9 в JSON-LD не берётся из этих данных — оно **захардкожено в шаблоне** (HS-01).

---

## 6. Рекомендации по использованию API для будущего мониторинга (read-only)
1. Ежедневный снимок `commerce_product--*` и `taxonomy_term--tekhnika` (UZ и RU): `title`, `path.alias`, `status`, `metatag`, `changed`. Это **детектор смены алиасов и снятия с публикации** — главной найденной причины потерь трафика (HS-02).
2. Сверка множества `{langcode}{path.alias}` с sitemap и с GSC-страницами, у которых есть клики.
3. Для цен, наличия и SKU API непригоден (закрыт). Нужен HTML или JSON-LD, либо служебный read-only токен (если владелец предоставит; в отчёты не сохранять).
