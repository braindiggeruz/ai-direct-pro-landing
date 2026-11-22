# 02 — Технический SEO-аудит HaierShop.uz

**Дата:** 19.11.2026 · **Режим:** только чтение (GET), без изменений на production
**Охват:**
- FULL INVENTORY: все URL из обоих XML-sitemap (283 UZ и 319 RU) и все опубликованные сущности, видимые через JSON:API. Всего 806 URL; HTML получен для 760 URL со статусом 200.
- SAMPLED: 152 URL, которые есть только в GSC (≥3 кликов за 12 мес, но отсутствуют в sitemap/API). Плюс 34 граничных теста, 65 URL в URL Inspection (66 запросов, 1 ошибочный URL исключён) и 4 прогона Lighthouse.

Идентификаторы находок (HS-xx) совпадают с `10_AUDIT_EVIDENCE.csv`.

---

## 0. Технологический профиль (подтверждено)

| Признак | Значение | Источник |
|---|---|---|
| CMS | Drupal (≥10.1) + Drupal Commerce 2 | заголовок `x-commerce-core: 2`; `expires: Sun, 19 Nov 1978` (сигнатура Drupal); формат агрегированных ассетов `?delta=…&language=…&theme=…&include=…` (появился в Drupal 10.1); JSON:API |
| Модули (подтверждены по ресурсам JSON:API) | metatag, pathauto, xmlsitemap, search_api, webform, commerce_wishlist, commerce_product_review, entity_comparison, slick/blazy, taxonomy_menu, sms | `/jsonapi` index |
| Модуль Redirect | **не обнаружен** (типа `redirect--redirect` в индексе JSON:API нет). Это вывод, а не факт: модуль может быть установлен без экспорта в JSON:API | `/jsonapi` |
| Сервер | nginx (Engintron/cPanel), кеш upstream (`X-Nginx-Upstream-Cache-Status: HIT/MISS`) | заголовки |
| Тема | `maintheme` (кастомная) | URL агрегированных CSS/JS |
| Языки | `uz` (язык по умолчанию, префикс `/uz`), `ru` (префикс `/ru`) | html lang, hreflang, Content-Language |
| Аналитика на странице | gtag `G-Z7VOFSGE4Y`, `AW-11422457381`, `GTM-P32VKSJ3`, Яндекс Метрика 98348792, Facebook Pixel, Jivochat. В сетевом трафике Lighthouse отправляют данные **оба** GA4-тега: `G-H9DF7V4DMX` (подключённый поток, через GTM) и `G-Z7VOFSGE4Y`. На товарах и категориях есть только событие `page_view`, ecommerce-событий нет | HTML + сеть Lighthouse |

---

## 1. Сканирование и индексируемость

### 1.1 robots.txt — стандартный файл Drupal
- Отдаёт 200 (2 027 байт), `Last-Modified: 12.02.2026`.
- **Директивы `Sitemap:` нет.**
- Правила `Disallow` (`/user/register`, `/user/login`, `/search/`, `/admin/`) прописаны **без языковых префиксов**. Поэтому `/uz/user/register`, `/ru/search?...` и `/ru/user/login` для роботов открыты (см. HS-17).
- `/jsonapi` не закрыт.
- Доказательство того, что это влияет на индекс: URL Inspection по `/uz/user/register` возвращает **«Submitted and indexed»**. По GSC за 12 мес у этого URL 51 клик и 4 087 показов. Ссылаются на него `/uz/user/login?destination=/uz/product/NNN/add-review` (ссылки «написать отзыв»).

> Правка robots.txt по классификации задания относится к **RED**. Менее рискованная альтернатива — `meta robots noindex,follow` на системных страницах: правила сканирования каталога она не меняет. По типу это тоже изменение правил индексации (**RED**), фактический риск оценён как низкий. Решение за владельцем.

### 1.2 XML Sitemap (модуль xmlsitemap) — HS-10
| Факт | Значение |
|---|---|
| `/sitemap.xml` (= `/uz/sitemap.xml`) | 283 URL, только `/uz/`. 165 блог, остальное каталог и инфостраницы |
| `/ru/sitemap.xml` | 319 URL, только `/ru/`. 204 блог. **Ни в robots.txt, ни в индексном sitemap не объявлен** |
| `xhtml:link` hreflang | только «другой» язык, **без self-reference**. Google: каждый `<url>` должен содержать `xhtml:link`, который «lists every alternate version of the page, including itself» ([localized-versions](https://developers.google.com/search/docs/specialty/international/localized-versions)). Взаимность UZ↔RU в sitemap соблюдена в 275 из 275 пар |
| `priority` | 1.0 у всех URL; `changefreq` хаотичен (Google оба поля игнорирует, влияние нулевое) |
| **Опубликованные товары, отсутствующие в sitemap** | **79 из 155 (UZ) и 81 из 155 (RU), то есть ~51%** |
| URL в sitemap со статусом ≠200 | 3 (все 403, неопубликованные товары): `/uz/ornatilgan-tehnika/mikrotolqinli-pechlar/ornatiladigan-mikrotolqinli-pech-haier-hmx-btg259b`, `…-hmx-btg259x`, `/ru/vodonagrevateli/vodonagrevatel-haier-es80h-d3` |
| Неканонические URL в sitemap | 4: две страницы сертификатов (canonical на 404, HS-08) и `/uz/haier-shop-butun-oila-uchun-maishiy-texnika`, `/ru/haier-shop-bytovaya-tekhnika-dlya-vsey-semi` (canonical на главную) |
| Страницы контактов | `/uz/kontaktlar`, `/ru/kontakty` (200, self-canonical) в sitemap отсутствуют |

**Влияние на индексацию сейчас низкое.** Выборочная URL Inspection 20 товаров, которых нет в текущем sitemap: **20/20 «Submitted and indexed»**. Статус «Submitted» означает, что раньше эти URL были в sitemap: состав sitemap со временем менялся. Товары находятся по внутренним ссылкам: у всех 310 товарных URL есть входящие ссылки, сирот 0. Пропуск в sitemap — это вопрос гигиены и мониторинга (P2), а не блокер.

### 1.3 HTTP-статусы и редиректы (граничные тесты, `raw/edge.jsonl`)
| Сценарий | Результат | Оценка |
|---|---|---|
| `http://` и `www.` | один 301 → `https://haiershop.uz/…` | ✅ цепочек нет |
| `/index.php/ru/...` | 301 → чистый URL | ✅ (в GSC 12 мес ещё 146 таких URL, 145 кликов: исторический хвост, гаснет) |
| Слеш в конце, верхний регистр | 200 + canonical на чистый URL | ✅ допустимо |
| `/uz/taxonomy/term/1`, `/ru/product/121`, `/ru/node/37` | 200 + canonical на алиас | ✅ допустимо |
| `?utm_source=`, `?sort_by=` | 200 + canonical без параметра | ✅ |
| `?page=1` на категории | 200 + **self-canonical с `?page=1`** | ⚠️ низкий риск: пагинации на категориях нет, ссылок на `?page` нет. В GSC 57 параметрических URL, 625 показов за 12 мес |
| Несуществующий URL | честный **404** | ✅ для несуществующих URL soft-404 нет. Но есть **риск soft-404 на 8 пустых категориях** (0 товаров, ~10 видимых слов): `/ru/vstraivaemaya-tekhnika/dukhovki` (70 кликов, 2 584 показа за 12 мес), `/ru/vstraivaemaya-tekhnika/mikrovolnovye-pechi`, `/ru/vitrinnye-kholodilniki`, `/ru/morozilniki/morozilnye-shkafy` и их UZ-версии (HS-26, P1) |
| Алиас другого языка (`/ru/konditsionerlar`) | 404 | ✅ |
| Корень без префикса (`/konditsionerlar`) | 200 + canonical `/uz/konditsionerlar` | ✅ |
| `/rss.xml`, `/favicon.ico` | 404 | мелочь |

### 1.4 Потерянные URL с органической историей — **HS-02 (P0)**
Метод: взяты все URL из GSC с ≥3 кликами за 12 мес, которых нет в текущем sitemap/API (152 URL). Для каждого проверен текущий статус (`raw/gsc_extra.jsonl`).

| Класс | URL | Кликов за 12 мес (GSC) |
|---|---|---|
| **404** | 84 | **1 203** |
| **403** (неопубликованная сущность) | 44 | **599** |
| 301 (`/index.php/…`) | 18 | 106 |
| 200 self-canonical | 3 | 62 (в т.ч. `/uz/user/register`) |
| 200 canonical на другой URL | 3 | 12 |

- **128 мёртвых URL в сумме принесли 1 802 клика за 12 мес.** У 28 из них было ≥20 кликов (980 кликов). Строгая классификация соответствия живым URL:

  | Класс | URL | Кликов за 12 мес |
  |---|---|---|
  | **A.** Тот же slug жив под новым родителем (**подтверждено**: алиас изменён без 301) — 29 товаров + 2 категории фанкойлов (`/ru/teplovye-nasosy/fankoyly` → `/ru/chillery/fankoyly`, UZ — аналогично) | 31 | 484 |
  | **B.** Тот же цифровой код, другой slug (**вероятно**; серию и модель проверить вручную — например, `proline-232-ti` ↔ `proline-s-232`) | 9 | 152 |
  | **C.** Только частичное совпадение (кандидат) | 8 | 100 |
  | **D.** Живого аналога нет (снятые модели) | 70 | 926 |
  | Блог: 404, статьи с тем же slug нет (удалена **или** переименована) | 10 | 140 |

- Примеры класса A:
  - `/ru/otopitelnoe-oborudovanie/elektricheskiy-kotyol-haier-cozy-208` (84 клика) → `/ru/otopitelnoe-oborudovanie/elektricheskie-kotly/elektricheskiy-kotyol-haier-cozy-208` (200, проиндексирован)
  - `/ru/teplovye-nasosy/teplovoy-nasos-haier-hpm10-nd2` (56) → `/ru/teplovye-nasosy/otopitelnoe-oborudovanie/teplovoy-nasos-haier-hpm10-nd2`
  - `/ru/morozilniki/morozilnyy-lar-haier-hce379r` (23) → `/ru/morozilniki/morozilnye-lari/morozilnyy-lar-haier-hce379r`
- Пример класса B, требующий ручной проверки: `/ru/otopitelnoe-oborudovanie/gazovyy-kotel-haier-proline-232-ti` (54) → `/ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-proline-s-232`.
- Класс D включает Electrolux EACSI-09/12. **10 URL статей блога с трафиком отдают 404** — это удалённые или переименованные без 301 статьи, например `/ru/blog/top-5-luchshikh-kondicionerov-2025-goda-sravnenie-modeley-i-cen` (78 кликов).
- **Паттерн временного снятия с публикации.** URL Inspection показывает 403 при последнем краулинге Google, а сейчас эти страницы отдают 200:
  - `/ru/kondicionery/kondicioner-inverter-s-nagrevatelnym-elementom-as18idhhra-w1u18idhfra` (Google, 14.10.2026: 403)
  - `/ru/vodonagrevateli/vodonagrevatel-haier-es80v-f3` (25.06.2026: 403)
  - `/uz/kir-yuvish-mashinalari/kir-yuvish-mashinasi-haier-hw105-bp14406s` (24.07.2026: 403)
  
  Такие страницы выпадают из индекса на месяцы.

**Вывод.** Главный механизм потерь трафика на сайте — смена URL и снятие товаров с публикации без редиректов. Это прямой аргумент за Preservation Framework (документ 07).

### 1.5 Canonical
- Self-canonical стоит на **755 из 760** страниц со статусом 200 (вместе с блогом). Пять исключений перечислены ниже, плюс `/ru/blog` (проверялся отдельно граничным тестом). Два из этих исключений корректны: страницы-дубли главной `/uz/haier-shop-butun-oila-uchun-maishiy-texnika` → `/uz` и `/ru/haier-shop-bytovaya-tekhnika-dlya-vsey-semi` → `/ru`.
- Исключения:
  - **HS-08:** `/uz/sifat-sertifikatlari-va-ozbekistondagi-haier-rasmiy-kafolati` и `/ru/sertifikaty-kachestva-i-oficialnaya-garantiya-haier-v-uzbekistane` → canonical `https://haiershop.uz/ru/sertifikaty-i-garantiya`, а этот URL отдаёт **404**. По URL Inspection Google canonical игнорирует и выбирает саму страницу. Плюс `max-snippet:1`: сниппет ограничен одним символом.
  - **HS-09:** `/ru/blog` (и `/ru/blog?page=N`) → canonical `https://haiershop.uz/uz/blog`, хотя hreflang `ru` указывает на `/ru/blog`. Google выбирает `/ru/blog` (игнорирует).
  - Корень `/` → canonical `/uz`. **Google выбрал `/`**: в URL Inspection `/uz` помечен как «Duplicate, Google chose different canonical than user» (HS-22).

### 1.6 Meta robots / X-Robots-Tag
- `X-Robots-Tag` не используется.
- `unavailable_after:2025-03-01` стоит на живом товаре `/ru/promyshlennye-kondicionery/kanalnyy-kondicioner-haier-ab71s1lg1fa1u71s1lr1fa-r32`. Google: «Do not show this page in search results after the specified date/time» ([robots-meta-tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)). URL Inspection: **«Crawled — currently not indexed»** (**HS-03, P0**).
- `max-snippet:1, max-video-preview:1` стоит на 2 страницах сертификатов (HS-08). Google: «Use a maximum of [number] characters as a textual snippet», то есть сниппет не длиннее 1 символа.
- `notranslate, max-image-preview:standard` стоит на `/ru` и `/ru/haier-shop-bytovaya-tekhnika-dlya-vsey-semi`. `max-image-preview:standard` уменьшает превью изображений главной в выдаче (низкий приоритет).
- На 14 страницах meta robots отсутствует. Это равносильно `index,follow` и **проблемой не является**.

### 1.7 Дубли и параметры
- Фасетных фильтров и сортировок в ссылках нет. Пагинации на категориях нет: все товары категории на одной странице. **Индексного шума от фильтров нет** (сильная сторона).
- Классификация 1 496 URL из GSC за 12 мес:

  | Класс | URL | Кликов | Показов |
  |---|---|---|---|
  | Каталог/инфо | 635 | 20 588 | 731 449 |
  | Блог | 642 | 12 249 | 810 391 |
  | Главные | 4 | 2 316 | 26 988 |
  | `index.php` | 146 | 145 | 5 361 |
  | Параметры | 57 | 5 | 625 |
  | User/cart | 9 | 57 | 5 010 |
  | `/node/N` | 3 | 12 | 458 |

  Доля шума (index.php + user/cart + параметры + `/node/N`) — **0.72%** показов (11 454 из 1 580 282).

---

## 2. Мультиязычность (технический слой; подробно — документ 03, §5)
- `html lang` совпадает с префиксом URL на **760 из 760** страниц со статусом 200.
- **Hreflang в HTML взаимный на всех 760 страницах.** Все цели отдают 200, рассогласований нет.
- Исключение — 2 страницы сертификатов: self-hreflang не совпадает с canonical, потому что canonical ведёт на 404.
- `x-default` указывает на RU-версию на 714 страницах и на UZ-версию на 46. Это 24 сущности: 17 категорий (`/uz/issiqlik-nasosi`, `/uz/sanoat-konditsionerlari/…`, `/uz/televizorlar`, `/uz/suv-kulerlar` и др.), 6 UZ-статей и 1 товар. Судя по всему, x-default следует языку-оригиналу сущности. Язык по умолчанию сайта — UZ, корень `/` отдаёт UZ.
- 41 RU-статья не имеет UZ-перевода. `/uz/blog/<ru-alias>` → **404** (правильно, дублей нет), а hreflang этих статей не указывает на несуществующий UZ.

---

## 3. Структурированные данные (подробно — документ 03, §6)
| Тип | Где | Статус |
|---|---|---|
| Product + Offer + Brand + MerchantReturnPolicy + OfferShippingDetails | 310 из 310 товарных страниц | есть, но с нарушениями (HS-01, HS-04, HS-07) |
| AggregateRating | 310 из 310 | **4.9 / 9 отзывов на всех 310**, на странице отзывов нет → **HS-01 (P0)**. Google: «Make sure the review content you mark up are readily available to users from the marked-up page» ([review-snippet](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)); «Your structured data must be a true representation of the page content». Нарушение «can result in a manual action», страница «loses eligibility for appearance as a rich result»; на ранжирование в веб-поиске, по документации, не влияет ([sd-policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)) |
| BreadcrumbList | все страницы | ✅ валидно. «Unnamed item» в GSC — штатное отображение, не ошибка |
| Article + FAQPage + Organization | ~121 статья блога | есть. **FAQ rich results в Google больше не показываются** (документация FAQPage: «This feature will no longer appear in Google Search starting May 7, 2026»). Разметка безвредна, но эффекта в выдаче не даёт |
| Organization / WebSite на главной | — | **отсутствуют** (HS-18) |
| Предупреждения GSC (Merchant listings) | 8 из 8 проверенных карточек | `Missing field "validFrom"` (WARNING); `Invalid value in field "sku"` на proline-s-224 |

Цена в JSON-LD совпадает с видимой ценой на **60 из 60** проверенных карточек (UZS). `availability` = InStock на всех 310; на проверенных страницах видимый статус «В наличии»/«Sotuvda».

---

## 4. Производительность (Core Web Vitals) — HS-16
**Данные CrUX: НЕДОСТУПНЫ.** PageSpeed Insights API ответил 429 (исчерпана анонимная квота), ключа CrUX нет. Ниже — **лабораторные** данные: один прогон Lighthouse 12.6.1 mobile на тип страницы, симулированный троттлинг, локально через прокси. Абсолютные секунды ненадёжны, достоверны **механизмы**.

| Тип | URL | Perf | Механизм LCP | TBT | CLS |
|---|---|---|---|---|---|
| Главная | `/ru` | 0.14 | `<img loading="eager">` баннер слайдера | 4.1 s | 0.487 (3 сдвига) |
| Категория | `/ru/otopitelnoe-oborudovanie` | 0.43 | **LCP-картинка товара с `loading="lazy"`** (аудит `lcp-lazy-loaded` провален) | 2.2 s | 0.001 |
| Товар | `/ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-proline-s-224` | 0.28 | **LCP — фон слайда blazy/slick, грузится лениво через JS** | 2.3 s | 0.185 (6 сдвигов) |
| Блог | `/ru/blog/skolko-elektrichestva-…` | 0.46 | H1 (текст) | 2.0 s | 0 |

Общие механизмы (повторяются на всех 4 типах):
- **Сторонний JS:** GTM ~782 KB, Jivochat ~366 KB, Facebook ~211 KB, Яндекс Метрика ~110 KB. Блокировка главного потока 2.2–3.8 с.
- Неиспользуемый JS ~640 KB.
- `toastr` подключается с cdnjs по URL `/latest/`, без фиксации версии.
- Вес HTML: в среднем 305 KB, главная 506 KB (75 KB inline-скриптов). DOM на главной 4 030 элементов.
- TTFB (документ) ~370–380 мс: кеш nginx работает ✅.

Безопасный порядок действий:
1. Получить полевые данные (GSC → отчёт Core Web Vitals, либо CrUX API с ключом).
2. Только потом точечно: `loading="eager"` + `fetchpriority="high"` для первой карточки/слайда; отложить Jivochat до взаимодействия; ревизия тегов GTM; резерв высоты под слайдер.

**Удалять функциональность (чат, аналитику) ради балла Lighthouse не рекомендуется.**

---

## 5. Внутренняя перелинковка (кратко; подробно — документ 03, §7)
- У каждой товарной страницы есть входящие ссылки из краулингового множества. В среднем на товарной странице ~75 уникальных внутренних ссылок.
- Сирот среди каталога нет. Без входящих ссылок только `/uz/haier-shop-butun-oila-uchun-maishiy-texnika` (её canonical указывает на главную).
- Ссылок на URL со статусом ≠200 внутри краулингового множества нет.
- Слабо связаны:
  - `/uz/sovutgichlarni-korsatish` (2 входящих)
  - `/ru/vitrinnye-kholodilniki` (2)
  - `/ru/haier-shop-bytovaya-tekhnika-dlya-vsey-semi` (1)

---

## 6. Прочее техническое
- **og:type="products"** (такого значения нет в спецификации OG) стоит на 759 из 760 страниц. `og:image` главной `/conditioners.png` отдаёт 200.
- llms.txt присутствует (14.6 KB, RU). Утверждение «официальный авторизованный магазин» публичными данными не проверено (HS-25).
- **JSON:API** открыт анонимно, подробно в документе 04. Это не SEO-проблема, а вопрос безопасности (HS-24).

---

## 7. Сводка технических находок
| ID | Находка | Приоритет | Риск исправления | Уверенность |
|---|---|---|---|---|
| HS-01 | Фиктивный AggregateRating 4.9/9 на 310 товарах | P0 | YELLOW | HIGH |
| HS-02 | 128 мёртвых URL (1 802 клика/12 мес): 31 подтверждённая смена алиаса без 301, 17 кандидатов, 70 снятых моделей, 10 статей | P0/P1 | YELLOW (точечные, не массовые редиректы) | HIGH |
| HS-03 | `unavailable_after:2025-03-01` на товаре (не в индексе) | P0 | **RED по типу** (директива индексации); фактический риск низкий — ждёт решения владельца | HIGH |
| HS-04 | JSON-LD возврата и доставки противоречит политикам | P0 | YELLOW | HIGH |
| HS-08 | Canonical на 404 + `max-snippet:1` (сертификаты) | P1 | **RED по типу** (canonical); фактически низкий: Google уже выбрал саму страницу | HIGH |
| HS-09 | `/ru/blog` canonical → `/uz/blog` | P1 | **RED по типу** (canonical); фактически низкий | HIGH |
| HS-10 | Sitemap: 51% товаров отсутствует, 3 URL с 403, нет `Sitemap:` | P1/P2 | GREEN/YELLOW | HIGH |
| HS-26 | 8 пустых категорий (0 товаров) отдают 200 и индексируются — риск soft-404 | P1 | YELLOW (шаблон + новые ссылки) | HIGH |
| HS-16 | Производительность (лабораторно): сторонний JS, ленивый LCP | P2 | YELLOW | MEDIUM |
| HS-17 | Индексный шум: `/uz/user/register`, `/ru/search` | P2 | **RED по типу** (правила индексации); фактически низкий | HIGH |
| HS-18 | Нет Organization/WebSite; невалидный og:type | P2 | YELLOW (шаблон / разметка) | HIGH |
| HS-22 | `/` vs `/uz`, непоследовательный x-default | P3 | RED | HIGH |
| HS-23 | Несогласованная URL-архитектура (суффиксы pathauto) | P3 | RED | HIGH |
