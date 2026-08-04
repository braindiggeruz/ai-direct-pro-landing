# ADMIN-4A — контракт данных «Заказы и вопросы»

Слой чтения: `functions/platform/admin/operations.ts`
Маршруты: `functions/api/admin/orders/**`, `functions/api/admin/questions/**`
Экраны: `Operations.tsx`, `OrderDetail.tsx`, `QuestionDetail.tsx`

Только чтение. Ни один оператор в этом слое не изменяет строку.

---

## 1. Аудит домена: что уже существует

| Что | Где | Кто пишет |
| --- | --- | --- |
| Заказы | `sotuvchi_orders` (0021), `fulfillment_status` (0022) | checkout покупателя и переходы продавца |
| Позиции заказа | `sotuvchi_order_items` (0021) | checkout |
| Обращения («вопросы») | `sotuvchi_handoffs` (0023) | агент и ответ продавца |
| Служебные ledger'ы | `sotuvchi_order_operations`, `sotuvchi_handoff_operations` | домен |

ADMIN-4A не создаёт домена, не добавляет таблиц и не добавляет миграций.

### Матрица решений

| Возможность | Решение | Почему |
| --- | --- | --- |
| ORDERS_LIST_READ | NEW_READ_ENDPOINT | существующий `/api/admin/agents/orders` не даёт ни общего числа, ни имени магазина, ни производного состояния |
| ORDER_DETAIL_READ | NEW_READ_ENDPOINT | детали не существовало вовсе |
| QUESTIONS_LIST_READ | NEW_READ_ENDPOINT | то же, что и для заказов |
| QUESTION_DETAIL_READ | NEW_READ_ENDPOINT | нужна телеметрия доставки, которой в списке нет |
| STATUS_MAPPING | ADAPTER | пара `(status, fulfillment_status)` сводится в одно слово по правилам, которые описала сама миграция 0022 |
| ATTENTION_MAPPING | ADAPTER | производится из «кто ждёт» и возраста строки; ничего не хранится |
| SERVER_PAGINATION | AS_IS | общий `parsePagination` владельческого слоя |
| SERVER_FILTERS | AS_IS | `parseEnumFilter` по закрытым спискам домена |
| SORTING | REJECTED_FROM_V1 | ровно один порядок, см. раздел 4 |
| Фильтр по магазину в UI | REJECTED_FROM_V1 | сервер поддерживает `?store=`, экран его не показывает: в маркетплейсе один активный магазин |
| WRITE_COMMANDS | NOT_AVAILABLE | это действия продавца по отношению к его же покупателю |

---

## 2. Что видно и чего не видно

Столбцы, которые таблицы содержат и которые **ни один оператор этого слоя не
выбирает**:

```
sotuvchi_orders:    buyer_name, buyer_phone, buyer_address
sotuvchi_handoffs:  buyer_identity_id, question_text, reply_text
```

`question_text` и `reply_text` встречаются в SQL ровно один раз каждый — внутри
`CASE WHEN … IS NULL … THEN 0 ELSE 1 END`, то есть проверяется только наличие
слов, а сами слова не покидают домен.

Тест `operations: no response carries a buyer, a phone or a message` засевает в
базу реальные значения (имя, телефон, адрес, текст вопроса и ответа) и проверяет,
что ни одно из них и ни одно имя столбца не появляется ни в одном из четырёх
ответов.

### Безопасная ссылка

* заказ — `order_number` (`SYN-1041` в фикстурах, `B-…` в проде);
* обращение — его собственный идентификатор.

Ни то, ни другое не идентифицирует человека.

---

## 3. Производные значения

**Стадия заказа** — из пары, как её определила 0022:

| status | fulfillment_status | стадия |
| --- | --- | --- |
| `draft` | — | `draft` |
| `placed` | `none` | `placed` |
| `placed` | `confirmed` | `confirmed` |
| `placed` | `done` | `done` |
| `cancelled` | `none` | `cancelled` |

**Кто ждёт** (`waiting_on`): заказ в `placed` ждёт продавца, `draft` ждёт
покупателя, остальное не ждёт никого. Обращение в `open` ждёт продавца;
`answered` без `buyer_delivered_at` ждёт покупателя; закрытое и истёкшее — никого.

**Внимание** (`attention`): `none` / `waiting` / `stalled`. `stalled` — это
ожидание продавца дольше 24 часов. Больше градаций нет: очередь, где каждая
открытая строка красная, — это очередь, чей цвет перестал что-либо значить.

---

## 4. Планы запросов и сознательный пробел

`EXPLAIN QUERY PLAN` на полностью мигрированной схеме:

| Запрос | План |
| --- | --- |
| заказы, без фильтра | `SCAN o USING INDEX idx_sotuvchi_orders_store_status` + `USE TEMP B-TREE FOR ORDER BY` |
| заказы, фильтр по стадии | то же |
| заказы, счётчик | `SCAN o USING COVERING INDEX idx_sotuvchi_orders_fulfillment` |
| вопросы, без фильтра | `SCAN h USING INDEX idx_sotuvchi_handoffs_queue` + `USE TEMP B-TREE FOR ORDER BY` |
| вопросы, счётчик | `SCAN h USING COVERING INDEX idx_sotuvchi_handoffs_queue` |
| карточка заказа | `SEARCH o USING INDEX sqlite_autoindex_sotuvchi_orders_1 (id=?)` |
| позиция заказа | `SEARCH … USING COVERING INDEX idx_sotuvchi_order_items_single (order_id=?)` |
| карточка обращения | `SEARCH h USING INDEX sqlite_autoindex_sotuvchi_handoffs_1 (id=?)` |

Оба списка сканируют индекс и затем сортируют во временном B-дереве, потому что
оба составных индекса начинаются с `org_id`, а `created_at` стоит за `status`.

Это реальная цена, и она не спрятана. ADMIN-4A поэтому предлагает **один**
порядок — новые сверху, единственный осмысленный для очереди, — а не селектор
сортировки, который размножил бы планы, которых никто не мерил. Сервер отвечает
`sort: "created_desc"` и игнорирует любое `?sort=` (проверено тестом).

Индекс, который убрал бы временное B-дерево:

```sql
CREATE INDEX idx_sotuvchi_orders_created   ON sotuvchi_orders   (created_at DESC, id);
CREATE INDEX idx_sotuvchi_handoffs_created ON sotuvchi_handoffs (created_at DESC, id);
```

Он **не добавлен**: ADMIN-4A — это чтение, а миграция ради чтения на объёме
пилота была бы схемой, добавленной под предположение. Когда очередь вырастет
настолько, что сортировка станет заметна, это отдельный, измеренный шаг.

---

## 5. Стоимость страницы

Одна страница — четыре подготовленных оператора и не больше:

1. список (один `SELECT` с `JOIN sotuvchi_stores` и `LEFT JOIN sotuvchi_order_items`);
2. счётчик по тем же фильтрам;
3. и 4. два счётчика сводки.

N+1 отсутствует по построению: имя магазина приходит `JOIN`'ом, а позиция —
`LEFT JOIN`'ом, который не может размножить строки, потому что
`idx_sotuvchi_order_items_single` уникален по `order_id` (доменное правило: один
заказ несёт ровно одну карточку каталога). Тест
`operations: a page of rows costs a bounded number of statements` считает
`db.prepare` в теле функции списка.

`JOIN` на магазин связывает и `org_id`, и `id`: магазин уникален в пределах
арендатора, и соединение по одному идентификатору было бы кросс-арендным чтением,
ждущим своего часа.

---

## 6. Границы

* Лимит страницы — общий владельческий: по умолчанию 25, максимум 100.
  `?limit=100000` обрезается до 100, отрицательный `offset` — до 0.
* Значение фильтра вне закрытого списка — 400 (`invalid_stage`,
  `invalid_status`), а не «показать всё».
* `?store=` проверяется тем же шаблоном идентификатора, что и остальной
  владельческий слой: `' OR 1=1 --` — это `invalid_store` (400).
* Идентификатор в пути проверяется до SQL: `invalid_order_id` /
  `invalid_question_id`.
* Несуществующая строка — 404 с кодом, а не пустой экран.
* Каждый ответ несёт `Cache-Control: no-store` и `X-Robots-Tag: noindex, nofollow`.
* Браузер никогда не обращается к D1: только BFF владельца.

---

## 7. Что осталось у старых endpoint'ов

`/api/admin/agents/orders` и `/api/admin/agents/handoffs` не изменялись: они
по-прежнему `support_readonly` и по-прежнему обслуживают прежнюю консоль.
ADMIN-4A встал рядом, а не поверх.
