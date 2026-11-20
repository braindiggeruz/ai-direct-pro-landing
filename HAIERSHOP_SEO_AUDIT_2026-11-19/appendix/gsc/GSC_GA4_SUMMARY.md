> **ПОПРАВКА АУДИТОРА (19.11.2026).** В раунде 1 URL Inspection был проверен ошибочно сформированный URL `/ru/kondicionery/kondicioner-inverter-as18idhhra-w1u18idhfra-s-teneom-obogreva` (его нет на сайте; он попал в задание по ошибке аудитора). Его статус «URL is unknown to Google» — артефакт ошибки, этот URL удалён из `inspection.csv`. Реальный RU-URL товара — `/ru/kondicionery/kondicioner-inverter-s-nagrevatelnym-elementom-as18idhhra-w1u18idhfra`: Google при краулинге 14.10.2026 получил 403 (сейчас URL отдаёт 200), см. `inspection_round2.csv`. Раздел 2 (GA4 −26% за 90 дней) — эффект сезона; сравнение с тем же окном прошлого года — в `ga4_yoy_derived.md` (+228%).

# haiershop.uz — baseline Search Console + GA4 (read-only)

Сбор: 2026-11-19. Источник: OpenSEO MCP (project 5a185628-1ac2-4f0b-bf0f-1cbcd2c55d25), GSC property `https://haiershop.uz/`, GA4 `properties/417132707` ("Haiershop", TZ Asia/Tashkent, валюта USD). Все вызовы read-only, 0 кредитов. Сырые ответы каждого вызова: `raw/calls/NNN_*.json` (input + raw JSON). GSC: тип web, dataState=all (последние ~3 дня могут быть неполными), даты в Pacific Time. CTR — доля 0–1 как вернул GSC; position — как вернул GSC. Пометка **[derived]** = вычислено мной из полученных строк.

## 1. Итоги по периодам (GSC)

Окна — как их вернул инструмент. Клики/показы — сумма дневного ряда `date_16m` за то же окно (уровень property). CTR и средняя позиция (взвешенная по показам среднедневная) — **[derived]**. Суммы по строкам `page` — для сравнения (агрегация by-page, показы выше).

| period | start | end | days | clicks | impressions | CTR [derived] | avg pos [derived] | clicks Σpage-rows | impr Σpage-rows | page rows |
|---|---|---|---|---|---|---|---|---|---|---|
| 28d | 2026-10-20 | 2026-11-16 | 28 | 3289 | 126100 | 0.0261 | 6.07 | 3346 | 142443 | 809 |
| 3m | 2026-08-16 | 2026-11-16 | 93 | 9191 | 384462 | 0.0239 | 6.48 | 9305 | 427472 | 1018 |
| 6m | 2026-05-16 | 2026-11-16 | 185 | 22805 | 958840 | 0.0238 | 6.44 | 23054 | 1055496 | 1142 |
| 12m | 2025-11-16 | 2026-11-16 | 366 | 34975 | 1429568 | 0.0245 | 6.53 | 35372 | 1580282 | 1496 |
| 16m | 2025-07-19 | 2026-11-16 | 486 | 38600 | 1528188 | 0.0253 | 6.67 |  |  |  |

Контроль: сумма по `device` и по `country` за 3m = 9191 кликов / 384462 показов — совпадает с суммой дневного ряда за 2026-08-16..2026-11-16.

## 2. YoY (одинаковые окна, сумма дневного ряда) [derived]

| window | prev period | prev clicks | prev impr | prev CTR | prev pos | cur period | cur clicks | cur impr | cur CTR | cur pos | Δ clicks | Δ impr |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 28d | 2025-10-20..2025-11-16 | 1117 | 32484 | 0.0344 | 7.48 | 2026-10-20..2026-11-16 | 3289 | 126100 | 0.0261 | 6.07 | +194.4% | +288.2% |
| 90d | 2025-08-19..2025-11-16 | 2904 | 79808 | 0.0364 | 7.99 | 2026-08-19..2026-11-16 | 8918 | 371355 | 0.024 | 6.47 | +207.1% | +365.3% |

By-page (строки `page`): 2025-10-20..2025-11-16 — 291 URL, 1136 кликов, 36404 показов; 2026-10-20..2026-11-16 — 809 URL, 3346 кликов, 142443 показов (`pages_yoy_prev.csv` vs `pages_28d.csv`).

Топ-10 URL прошлого года (2025-10-20..2025-11-16) и их значения сейчас (pages_28d):

| page | clicks 2025 | impr 2025 | clicks 2026 | impr 2026 |
|---|---|---|---|---|
| /ru/otopitelnoe-oborudovanie | 155 | 3956 | 274 | 11614 |
| /ru | 131 | 2370 | 165 | 1801 |
| /ru/vodonagrevateli | 102 | 2601 | 102 | 2693 |
| /ru/kondicionery | 70 | 5194 | 98 | 4989 |
| /ru/stiralnye-mashiny | 57 | 2909 | 51 | 2563 |
| /ru/kholodilniki | 34 | 1321 | 54 | 2832 |
| /ru/blog/top-5-luchshikh-kondicionerov-2025-goda-sravnenie-modeley-i-cen | 31 | 712 | — (нет строки) |  |
| /ru/sushilnye-mashiny | 31 | 933 | 22 | 560 |
| /ru/blog/top-3-populyarnykh-vodonagrevateley-ariston | 30 | 2440 | 26 | 2361 |
| /ru/blog/kak-vybrat-luchshiy-vodonagrevatel-v-tashkente-sekrety-ekonomii-i-top-5-modeley | 28 | 194 | 9 | 168 |

## 3. Помесячный ряд (сумма дневного ряда date_16m) [derived]

| month | days | clicks | impressions | CTR | note |
|---|---|---|---|---|---|
| 2025-07 | 13 | 400 | 9083 | 0.044 | partial |
| 2025-08 | 31 | 600 | 19476 | 0.0308 |  |
| 2025-09 | 30 | 821 | 21674 | 0.0379 |  |
| 2025-10 | 31 | 1205 | 30012 | 0.0402 |  |
| 2025-11 | 30 | 1077 | 33320 | 0.0323 |  |
| 2025-12 | 31 | 1413 | 50185 | 0.0282 |  |
| 2026-01 | 31 | 2246 | 82215 | 0.0273 |  |
| 2026-02 | 28 | 1998 | 72318 | 0.0276 |  |
| 2026-03 | 31 | 2254 | 97832 | 0.023 |  |
| 2026-04 | 30 | 2303 | 97850 | 0.0235 |  |
| 2026-05 | 31 | 3287 | 124432 | 0.0264 |  |
| 2026-06 | 30 | 4574 | 188671 | 0.0242 |  |
| 2026-07 | 31 | 5528 | 241065 | 0.0229 |  |
| 2026-08 | 31 | 3050 | 144093 | 0.0212 |  |
| 2026-09 | 30 | 2723 | 116440 | 0.0234 |  |
| 2026-10 | 31 | 3244 | 129572 | 0.025 |  |
| 2026-11 | 16 | 1877 | 69950 | 0.0268 | partial |

Пик дневного ряда по кликам: 2026-07-19 — 380 кликов / 17271 показов; по показам: 2026-07-19 — 17271 показов.

## 4. Топ-30 страниц, 12 мес (2025-11-16..2026-11-16)

| # | page | clicks | impressions | ctr | position |
|---|---|---|---|---|---|
| 1 | /ru/kondicionery | 3289 | 156464 | 0.021 | 6.8 |
| 2 | /ru | 2157 | 21004 | 0.1027 | 5.8 |
| 3 | /ru/teplovye-nasosy | 1622 | 38964 | 0.0416 | 6.3 |
| 4 | /ru/kholodilniki | 1550 | 55616 | 0.0279 | 7.8 |
| 5 | /ru/otopitelnoe-oborudovanie | 1412 | 48886 | 0.0289 | 6.3 |
| 6 | /ru/vodonagrevateli | 992 | 29240 | 0.0339 | 5.4 |
| 7 | /uz/konditsionerlar | 745 | 37486 | 0.0199 | 6.4 |
| 8 | /ru/blog/skolko-elektrichestva-potreblyaet-kondicioner-za-1-chas-kalkulyator-kvtch-ponyatnyy-gid | 686 | 28405 | 0.0242 | 4.1 |
| 9 | /uz/blog/konditsioner-1-soatda-qancha-elektr-yeydi-kvtsoat-kalkulyator-tushunarli-qollanma | 619 | 10632 | 0.0582 | 4 |
| 10 | /uz/blog/konditsioner-narxlari-9121824-va-inverter-toshkentda-brendlarni-solishtirish | 609 | 60329 | 0.0101 | 7.1 |
| 11 | /ru/morozilniki | 600 | 17628 | 0.034 | 9 |
| 12 | /ru/stiralnye-mashiny | 507 | 25287 | 0.02 | 9.9 |
| 13 | /ru/blog/top-3-populyarnykh-vodonagrevateley-ariston | 479 | 64824 | 0.0074 | 3.7 |
| 14 | /ru/otopitelnoe-oborudovanie/elektricheskie-kotly | 452 | 11745 | 0.0385 | 5.5 |
| 15 | /ru/blog/haier-smart-tv-obzor-funkciy-android-tv-ustanovka-allplay-itvuz-i-drugikh-prilozheniy-v | 435 | 39650 | 0.011 | 4.9 |
| 16 | /ru/blog/skolko-stoit-ustanovka-kondicionera-v-tashkente-i-chto-vkhodit-v-cenu-chestnyy-razbor-2025 | 424 | 42877 | 0.0099 | 7.1 |
| 17 | /uz/blog/2025-yilning-top-7-kir-yuvish-mashinalari-reytingi-ekspertlar-tanlovi-va-haqiqiy-sharhlar | 403 | 7917 | 0.0509 | 4.4 |
| 18 | /ru/blog/kholodilniki-v-tashkente-ceny-gde-kupit-malikabu-sakhiyonlayn-skidki-i-rassrochka-polnyy-gid | 387 | 26907 | 0.0144 | 8.7 |
| 19 | /uz/kir-yuvish-mashinalari | 373 | 29464 | 0.0127 | 8.1 |
| 20 | /ru/vstraivaemaya-tekhnika/varochnye-paneli | 366 | 14334 | 0.0255 | 8.7 |
| 21 | /ru/blog/reyting-top-7-stiralnykh-mashin-2025-goda-ekspertnyy-vybor-i-realnye-otzyvy | 335 | 10140 | 0.033 | 5.6 |
| 22 | /ru/posudomoechnye-mashiny | 310 | 18149 | 0.0171 | 9.6 |
| 23 | /ru/blog/kak-rasschitat-moschnost-kondicionera-po-ploschadi-v-tashkente-m2-kvt-btu | 307 | 16604 | 0.0185 | 4.9 |
| 24 | /ru/kulery-dlya-vody | 299 | 19082 | 0.0157 | 8.6 |
| 25 | /uz/issiqlik-nasosi | 294 | 4571 | 0.0643 | 5.3 |
| 26 | /ru/sushilnye-mashiny | 266 | 10385 | 0.0256 | 13.4 |
| 27 | /uz/blog/konditsioner-9-12-18-yoki-24-quvvatni-tanlash-va-inverter-kerakmi-haiershopuz | 220 | 6420 | 0.0343 | 5.4 |
| 28 | /ru/blog/chto-takoe-teplovoy-nasos-i-kak-ekonomit-vashi-dengi-na-otoplenii-i-kondicionirovanii-v | 209 | 13128 | 0.0159 | 6.9 |
| 29 | /ru/blog/kak-vybrat-televizor-dlya-doma-v-2026-polnyy-gid-po-tashkentu | 204 | 5076 | 0.0402 | 5.6 |
| 30 | /ru/blog/skolko-elektrichestva-potreblyaet-kondicioner-haier-v-tashkente | 199 | 24334 | 0.0082 | 3.7 |

## 5. Топ-30 запросов, 3 мес (2026-08-16..2026-11-16)

| # | query | clicks | impressions | ctr | position |
|---|---|---|---|---|---|
| 1 | haier | 118 | 1288 | 0.0916 | 2.7 |
| 2 | haiershop | 83 | 116 | 0.7155 | 1.8 |
| 3 | тепловой насос | 72 | 3841 | 0.0187 | 5.3 |
| 4 | haier uz | 44 | 224 | 0.1964 | 2.1 |
| 5 | водонагреватель | 43 | 1630 | 0.0264 | 3.1 |
| 6 | haier кондиционер | 41 | 534 | 0.0768 | 3.4 |
| 7 | haier холодильник | 37 | 371 | 0.0997 | 4.4 |
| 8 | электрический котел | 36 | 654 | 0.055 | 4.2 |
| 9 | haier shop | 29 | 45 | 0.6444 | 2.2 |
| 10 | eng yaxshi kir yuvish mashinasi | 27 | 120 | 0.225 | 1.4 |
| 11 | eng yaxshi avtomat kir yuvish mashinasi | 24 | 114 | 0.2105 | 1.3 |
| 12 | haier uzbekistan | 24 | 182 | 0.1319 | 2.9 |
| 13 | haier стиральная машина | 24 | 617 | 0.0389 | 4.5 |
| 14 | тепловой насос на 200 м2 цена | 24 | 407 | 0.059 | 3.9 |
| 15 | haier водонагреватель | 23 | 88 | 0.2614 | 1.3 |
| 16 | konditsioner narxlari | 23 | 3287 | 0.007 | 6.8 |
| 17 | котел | 22 | 3217 | 0.0068 | 3.8 |
| 18 | тепловой насос нархи узбекистонда | 22 | 367 | 0.0599 | 3.7 |
| 19 | muzlatgich narxlari | 18 | 1150 | 0.0157 | 5.5 |
| 20 | двухконтурный котел | 18 | 2722 | 0.0066 | 8.2 |
| 21 | кондиционер | 18 | 8448 | 0.0021 | 7.5 |
| 22 | haier katyol | 17 | 116 | 0.1466 | 1.1 |
| 23 | konditsioner 12 narxlari | 17 | 1791 | 0.0095 | 7.1 |
| 24 | haier kondisioner narxlari | 16 | 89 | 0.1798 | 1.6 |
| 25 | тепловой насос купить в ташкенте | 16 | 71 | 0.2254 | 2.6 |
| 26 | холодильник haier htf-450lm6ru | 16 | 44 | 0.3636 | 2.1 |
| 27 | haier котел | 15 | 67 | 0.2239 | 1.3 |
| 28 | issiqlik nasosi | 15 | 261 | 0.0575 | 6.2 |
| 29 | газовый котел | 15 | 445 | 0.0337 | 4 |
| 30 | водонагреватель haier 50 литров | 14 | 75 | 0.1867 | 3.1 |

Охват query-данных: 1000 строк (hasMore=true) дают 3151 из 9191 кликов и 122193 из 384462 показов за 3m; остальное — хвост за пределами 1000 строк и анонимизированные запросы.

## 6. Brand vs non-brand, 3 мес [derived]

Правило: запрос содержит haier / хаер / хайер / хаиер / haiershop / хайершоп / "haier shop" (без учёта регистра). Классифицированы только 1000 строк queries_3m.

| segment | query rows | clicks | impressions | ctr |
|---|---|---|---|---|
| brand | 244 | 1056 | 8056 | 0.1311 |
| non-brand | 756 | 2095 | 114137 | 0.0184 |
| outside top-1000 rows / anonymized (property total from date series minus listed queries) |  | 6040 | 262269 |  |
| property total 3m (date series) |  | 9191 | 384462 | 0.0239 |

Доля бренда среди классифицированных кликов: 1056 / 3151 = 33.5%; среди всех кликов property 3m: 1056 / 9191 = 11.5% (нижняя граница, т.к. хвост не классифицирован) [derived]. Вариант "hayer" (1 клик, 80 показов) в правило не входит и учтён как non-brand.

Топ-30 брендовых запросов:

| query | clicks | impressions | ctr | position |
|---|---|---|---|---|
| haier | 118 | 1288 | 0.0916 | 2.7 |
| haiershop | 83 | 116 | 0.7155 | 1.8 |
| haier uz | 44 | 224 | 0.1964 | 2.1 |
| haier кондиционер | 41 | 534 | 0.0768 | 3.4 |
| haier холодильник | 37 | 371 | 0.0997 | 4.4 |
| haier shop | 29 | 45 | 0.6444 | 2.2 |
| haier стиральная машина | 24 | 617 | 0.0389 | 4.5 |
| haier uzbekistan | 24 | 182 | 0.1319 | 2.9 |
| haier водонагреватель | 23 | 88 | 0.2614 | 1.3 |
| haier katyol | 17 | 116 | 0.1466 | 1.1 |
| haier kondisioner narxlari | 16 | 89 | 0.1798 | 1.6 |
| холодильник haier htf-450lm6ru | 16 | 44 | 0.3636 | 2.1 |
| haier котел | 15 | 67 | 0.2239 | 1.3 |
| водонагреватель haier 50 литров | 14 | 75 | 0.1867 | 3.1 |
| холодильник haier | 13 | 122 | 0.1066 | 4.5 |
| haier котел газовый | 13 | 48 | 0.2708 | 1.8 |
| haier hcr7818dwpt | 12 | 28 | 0.4286 | 2.4 |
| водонагреватель haier 100 литров | 11 | 44 | 0.25 | 3.2 |
| водонагреватель haier 80 литров | 10 | 98 | 0.102 | 2.9 |
| тепловой насос haier | 10 | 19 | 0.5263 | 1.3 |
| haier посудомоечная машина | 9 | 31 | 0.2903 | 1.4 |
| haier greenline | 9 | 27 | 0.3333 | 1 |
| хаер котел | 9 | 16 | 0.5625 | 1 |
| haier air conditioner | 8 | 100 | 0.08 | 2.1 |
| haier konditsioner | 8 | 85 | 0.0941 | 1.1 |
| haier hw120-bd14397su1 | 8 | 38 | 0.2105 | 2.9 |
| haier кондиционер 12 | 7 | 204 | 0.0343 | 2 |
| кондиционер haier 12 инверторный | 7 | 152 | 0.0461 | 2.6 |
| сушильная машина haier | 7 | 38 | 0.1842 | 4.3 |
| холодильники haier | 7 | 33 | 0.2121 | 6.5 |

## 7. ru vs uz (по строкам page) [derived]

Правило: сегмент пути `ru` → ru, `uz` → uz (включая `/index.php/ru/...`), иначе other (корень `/` и пр.). Агрегация by-page.

| period | lang | URL rows | clicks | impressions | CTR | click share | impr share |
|---|---|---|---|---|---|---|---|
| 3m | ru | 582 | 7498 | 315529 | 0.0238 | 0.8058 | 0.7381 |
| 3m | uz | 434 | 1781 | 111193 | 0.016 | 0.1914 | 0.2601 |
| 3m | other | 2 | 26 | 750 | 0.0347 | 0.0028 | 0.0018 |
| 12m | ru | 859 | 28297 | 1216851 | 0.0233 | 0.8 | 0.77 |
| 12m | uz | 607 | 6963 | 359245 | 0.0194 | 0.1969 | 0.2273 |
| 12m | other | 30 | 112 | 4186 | 0.0268 | 0.0032 | 0.0026 |

## 8. Устройства, страны, search appearance (3 мес)

| device | clicks | impressions | ctr | position |
|---|---|---|---|---|
| MOBILE | 6736 | 306083 | 0.022 | 6.4 |
| DESKTOP | 2363 | 76248 | 0.031 | 6.9 |
| TABLET | 92 | 2131 | 0.0432 | 6.3 |

Страны: 154 строк. Топ-10 по кликам:

| country | clicks | impressions | ctr | position |
|---|---|---|---|---|
| uzb | 8416 | 339638 | 0.0248 | 6.4 |
| rus | 292 | 16119 | 0.0181 | 7.4 |
| zzz | 78 | 1689 | 0.0462 | 6.3 |
| kaz | 58 | 3694 | 0.0157 | 6.8 |
| tjk | 32 | 1268 | 0.0252 | 6.9 |
| blr | 29 | 1716 | 0.0169 | 6.5 |
| tkm | 26 | 1236 | 0.021 | 5.7 |
| kgz | 21 | 2185 | 0.0096 | 6.1 |
| ukr | 21 | 1725 | 0.0122 | 16 |
| deu | 19 | 1058 | 0.018 | 6.3 |

Uzbekistan (uzb) = 8416 / 9191 кликов (91.6%) и 339638 / 384462 показов (88.3%) [derived].

| searchAppearance | clicks | impressions | ctr | position |
|---|---|---|---|---|
| REVIEW_SNIPPET | 96 | 2189 | 0.0439 | 7 |
| PRODUCT_SNIPPETS | 1284 | 17703 | 0.0725 | 5.3 |

## 9. Striking distance и low-CTR (3 мес)

Фильтры применяются сервером внутри каждого окна из 1000 строк (сортировка по кликам), поэтому выгрузка пагинирована до hasMore=false (startRow 0..12000). Позиции 4–10, ≥50 показов: **374** запросов, 1063 кликов, 107037 показов. Позиции 11–20, ≥50 показов: **41** запросов, 28 кликов, 5537 показов.

Топ-15 (4–10) по показам:

| query | clicks | impressions | ctr | position |
|---|---|---|---|---|
| кондиционер | 18 | 8448 | 0.0021 | 7.5 |
| тепловой насос | 72 | 3841 | 0.0187 | 5.3 |
| konditsioner narxlari | 23 | 3287 | 0.007 | 6.8 |
| play market o'rnatish | 5 | 3143 | 0.0016 | 6.3 |
| konditsioner | 6 | 2816 | 0.0021 | 7 |
| двухконтурный котел | 18 | 2722 | 0.0066 | 8.2 |
| аристон | 7 | 2062 | 0.0034 | 6.9 |
| котёл | 11 | 1995 | 0.0055 | 5.3 |
| konditsioner 12 narxlari | 17 | 1791 | 0.0095 | 7.1 |
| kir yuvish mashinasi | 11 | 1565 | 0.007 | 6.3 |
| ariston | 3 | 1541 | 0.0019 | 8.3 |
| бойлер | 10 | 1328 | 0.0075 | 5.8 |
| посудомоечная машина | 8 | 1284 | 0.0062 | 9.1 |
| кондиционер нархлари | 3 | 1275 | 0.0024 | 9.1 |
| kir moshina narxlari | 3 | 1189 | 0.0025 | 7.9 |

Топ-10 (11–20) по показам:

| query | clicks | impressions | ctr | position |
|---|---|---|---|---|
| стиральная машина | 5 | 1140 | 0.0044 | 11.6 |
| холодильник ташкент | 8 | 585 | 0.0137 | 11.5 |
| стиральная машина ташкент | 2 | 375 | 0.0053 | 11.4 |
| марки стиральных машин | 0 | 228 | 0 | 17.3 |
| лучшая стиральная машина | 1 | 199 | 0.005 | 19 |
| марка стиральной машины | 0 | 187 | 0 | 18.8 |
| куплю холодильник | 0 | 173 | 0 | 11.2 |
| isitgichlar | 0 | 149 | 0 | 12.1 |
| холодильник купить ташкент | 0 | 129 | 0 | 11.5 |
| встраиваемые посудомоечные машины | 0 | 111 | 0 | 18.8 |

Low-CTR страницы [derived] (pages_3m, impressions ≥ 500 и ctr < 0.02): **84** URL, 225375 показов, 2539 кликов. Топ-10 по показам:

| page | clicks | impressions | ctr | position |
|---|---|---|---|---|
| /ru/kondicionery | 296 | 17973 | 0.0165 | 7.2 |
| /uz/kir-yuvish-mashinalari | 165 | 13151 | 0.0125 | 7.6 |
| /uz/blog/konditsioner-narxlari-9121824-va-inverter-toshkentda-brendlarni-solishtirish | 96 | 11295 | 0.0085 | 7.1 |
| /ru/blog/kholodilniki-v-tashkente-ceny-gde-kupit-malikabu-sakhiyonlayn-skidki-i-rassrochka-polnyy-gid | 149 | 10848 | 0.0137 | 8.8 |
| /ru/blog/haier-smart-tv-obzor-funkciy-android-tv-ustanovka-allplay-itvuz-i-drugikh-prilozheniy-v | 124 | 9426 | 0.0132 | 6.1 |
| /ru/kulery-dlya-vody | 93 | 7650 | 0.0122 | 7.9 |
| /ru/blog/chto-takoe-teplovoy-nasos-i-kak-ekonomit-vashi-dengi-na-otoplenii-i-kondicionirovanii-v | 120 | 7530 | 0.0159 | 6.2 |
| /ru/blog/top-3-populyarnykh-vodonagrevateley-ariston | 66 | 7170 | 0.0092 | 7.3 |
| /ru/stiralnye-mashiny | 137 | 6925 | 0.0198 | 9.5 |
| /ru/blog/vazhnye-kharakteristiki-pri-vybore-vodonagrevatelya-ariston-v-tashkente | 56 | 6180 | 0.0091 | 6 |

## 10. Кандидаты на каннибализацию (query_page_3m) [derived]

Запросы, где ≥2 URL получили ≥20 показов каждый; топ-25 по суммарным показам запроса в выгрузке. Основано на 1000 строках query×page (hasMore=true; 3034 кликов из 9191).

Всего запросов, удовлетворяющих условию: 32.

| query | Σimpr | Σclicks | URLs ≥20 impr | URLs (clicks/impr/pos) |
|---|---|---|---|---|
| кондиционер | 8373 | 18 | 2 | /ru/kondicionery (15cl/6073im/pos 7.8); /ru/promyshlennye-kondicionery (3cl/2300im/pos 6.7) |
| тепловой насос | 5589 | 73 | 2 | /ru/teplovye-nasosy (54cl/2987im/pos 5.6); /ru/blog/chto-takoe-teplovoy-nasos-i-kak-ekonomit-vashi-dengi-na-otoplenii-i-kondicionirovanii-v (19cl/2602im/pos 6.8) |
| холодильник | 2611 | 8 | 2 | /ru/blog/kholodilniki-v-tashkente-ceny-gde-kupit-malikabu-sakhiyonlayn-skidki-i-rassrochka-polnyy-gid (2cl/1389im/pos 11.5); /ru/kholodilniki (6cl/1222im/pos 8.8) |
| аристон | 2159 | 7 | 2 | /ru/blog/top-3-populyarnykh-vodonagrevateley-ariston (4cl/1371im/pos 7.6); /ru/blog/vazhnye-kharakteristiki-pri-vybore-vodonagrevatelya-ariston-v-tashkente (3cl/788im/pos 6.1) |
| котёл | 1999 | 11 | 2 | /ru/otopitelnoe-oborudovanie (9cl/1764im/pos 5.5); /ru/otopitelnoe-oborudovanie/elektricheskie-kotly (2cl/235im/pos 3.9) |
| haier | 1865 | 121 | 5 | /ru (102cl/1224im/pos 2.7); /ru/kondicionery (6cl/363im/pos 8.6); /uz/konditsionerlar (2cl/106im/pos 6.9); / (4cl/82im/pos 5.2); /ru/kholodilniki (2cl/73im/pos 8.8) |
| haier стиральная машина | 1353 | 24 | 3 | /ru/blog/reyting-stiralnykh-mashin-haier-top-5-luchshikh-modeley-2026-goda (1cl/580im/pos 7.5); /ru/stiralnye-mashiny (22cl/433im/pos 3.8); /ru/stiralnye-mashiny/stiralnaya-mashina-haier-hw120-bd14397su1 (1cl/340im/pos 7.2) |
| стиральная машина | 947 | 4 | 2 | /ru/blog/kak-vybrat-stiralnuyu-mashinu-v-tashkente-polnyy-gid-chek-list (2cl/894im/pos 11.2); /ru/blog/reyting-top-7-stiralnykh-mashin-2025-goda-ekspertnyy-vybor-i-realnye-otzyvy (2cl/53im/pos 11.3) |
| teplovoy nasos | 758 | 13 | 3 | /ru/blog/chto-takoe-teplovoy-nasos-i-kak-ekonomit-vashi-dengi-na-otoplenii-i-kondicionirovanii-v (8cl/417im/pos 5.5); /ru/teplovye-nasosy (3cl/286im/pos 6.3); /uz/issiqlik-nasosi (2cl/55im/pos 7.6) |
| бытовая техника | 573 | 3 | 2 | /ru (2cl/389im/pos 10); /ru/blog/top-10-nadyozhnykh-internet-magazinov-bytovoy-tekhniki-v-tashkente (1cl/184im/pos 8.5) |
| teplovoy nasos narxlari | 549 | 12 | 2 | /uz/issiqlik-nasosi (11cl/420im/pos 4.2); /ru/teplovye-nasosy (1cl/129im/pos 4.8) |
| тепловой насос на 200 м2 цена | 501 | 23 | 2 | /ru/blog/teplovoy-nasos-v-tashkente-uzbekistan-kupit-po-cene-dlya-otopleniya (16cl/323im/pos 4); /ru/teplovye-nasosy (7cl/178im/pos 4.3) |
| канальный кондиционер | 479 | 6 | 3 | /ru/promyshlennye-kondicionery/kanalnye-kondicionery (4cl/191im/pos 4.2); /ru/blog/kanalnye-kondicionery-skrytoe-okhlazhdenie-dlya-bolshikh-pomescheniy (1cl/181im/pos 8.3); /ru/promyshlennye-kondicionery (1cl/107im/pos 3.7) |
| haier katyol | 311 | 18 | 4 | /ru/otopitelnoe-oborudovanie (12cl/113im/pos 1.5); /ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-proline-s-140 (2cl/76im/pos 1.4); /ru/otopitelnoe-oborudovanie/elektricheskie-kotly (1cl/68im/pos 2.8); /ru/otopitelnoe-oborudovanie/gazovyy-kotel-haier-proline-232-ti (3cl/54im/pos 1.5) |
| haier uz | 303 | 45 | 3 | /ru (40cl/219im/pos 2.1); /ru/vstraivaemaya-tekhnika (2cl/45im/pos 4.7); /ru/kondicionery (2cl/32im/pos 5.4) |
| аристон водонагреватель | 275 | 4 | 2 | /ru/blog/vazhnye-kharakteristiki-pri-vybore-vodonagrevatelya-ariston-v-tashkente (3cl/148im/pos 5); /ru/blog/top-3-populyarnykh-vodonagrevateley-ariston (1cl/127im/pos 9.2) |
| купить холодильник в ташкенте | 246 | 10 | 2 | /ru/kholodilniki (7cl/140im/pos 11.4); /ru/blog/kholodilniki-v-tashkente-ceny-gde-kupit-malikabu-sakhiyonlayn-skidki-i-rassrochka-polnyy-gid (3cl/106im/pos 10.7) |
| тепловой насос для отопления дома | 242 | 12 | 2 | /ru/teplovye-nasosy (10cl/148im/pos 2.2); /ru/blog/chto-takoe-teplovoy-nasos-i-kak-ekonomit-vashi-dengi-na-otoplenii-i-kondicionirovanii-v (2cl/94im/pos 5.7) |
| стиральная машина haier | 236 | 6 | 2 | /ru/blog/reyting-stiralnykh-mashin-haier-top-5-luchshikh-modeley-2026-goda (3cl/127im/pos 7.1); /ru/stiralnye-mashiny (3cl/109im/pos 4.1) |
| водонагреватель аристон | 229 | 4 | 2 | /ru/blog/vazhnye-kharakteristiki-pri-vybore-vodonagrevatelya-ariston-v-tashkente (3cl/127im/pos 5.9); /ru/blog/top-3-populyarnykh-vodonagrevateley-ariston (1cl/102im/pos 10.5) |
| тепловые насосы | 228 | 6 | 2 | /ru/blog/chto-takoe-teplovoy-nasos-i-kak-ekonomit-vashi-dengi-na-otoplenii-i-kondicionirovanii-v (4cl/128im/pos 4.5); /ru/teplovye-nasosy (2cl/100im/pos 3.9) |
| chiller sistema | 207 | 3 | 2 | /ru/blog/sistema-chiller-fankoyl-polnoe-rukovodstvo-po-ustroystvu-i-principu-raboty (1cl/136im/pos 5.4); /ru/chillery (2cl/71im/pos 4.3) |
| haier ariston | 170 | 5 | 2 | /ru/vodonagrevateli (4cl/88im/pos 2.9); /ru/blog/vodonagrevatel-v-tashkente-kak-vybrat-nakip-bak-anod-resheniya-haier-i-sravnenie-s-ariston (1cl/82im/pos 6.5) |
| issiqlik nasoslari narxi | 162 | 10 | 2 | /uz/issiqlik-nasosi (9cl/113im/pos 4.2); /uz/issiqlik-nasosi/issiqlik-nasosi-haier-hpm08-nd2 (1cl/49im/pos 8.1) |
| vrf система | 146 | 3 | 2 | /ru/blog/chto-takoe-vrf-sistema-kondicionirovaniya-polnoe-rukovodstvo-dlya-biznesa-i-chastnykh-domov-v (2cl/78im/pos 5.2); /ru/promyshlennye-kondicionery/vrf-sistemy (1cl/68im/pos 2.1) |

## 11. URL Inspection (36 URL)

Набор: 20 URL из задания + 10 топ-URL карточек товара по кликам из pages_12m (≥3 сегментов пути, не /blog/, последний сегмент содержит цифру — модельный slug; исключены 2 уже бывших в списке и /index.php/-дубли) + 6 подкатегорий, которые попадают в топ-10 по буквальному правилу "3+ сегмента, не /blog/" (elektricheskie-kotly уже был в списке). Т.е. проверены оба толкования "top 10".

| coverageState (verbatim) | URLs |
|---|---|
| Submitted and indexed | 29 |
| Not found (404) | 2 |
| Blocked due to access forbidden (403) | 2 |
| Duplicate, Google chose different canonical than user | 1 |
| URL is unknown to Google | 1 |
| Discovered - currently not indexed | 1 |

Canonical: совпадает googleCanonical = userCanonical у 28 URL; **расхождение у 2**; у 6 поле не возвращено (не проиндексированы/не получены).

| url | coverageState | googleCanonical | userCanonical |
|---|---|---|---|
| https://haiershop.uz/uz | Duplicate, Google chose different canonical than user | https://haiershop.uz/ | https://haiershop.uz/uz |
| https://haiershop.uz/ | Submitted and indexed | https://haiershop.uz/ | https://haiershop.uz/uz |

Не "Submitted and indexed":

| url | group | clicks 12m | coverageState | pageFetchState | lastCrawlTime |
|---|---|---|---|---|---|
| /uz | given_list | 43 | Duplicate, Google chose different canonical than user | SUCCESSFUL | 2026-11-18T08:14:21Z |
| /ru/kondicionery/kondicioner-inverter-as18idhhra-w1u18idhfra-s-teneom-obogreva | given_list |  | URL is unknown to Google | PAGE_FETCH_STATE_UNSPECIFIED |  |
| /uz/konditsionerlar/konditsioner-inverter-as18idhhra-w1u18idhfra-isitish-elementi-bilan | given_list | 1 | Discovered - currently not indexed | PAGE_FETCH_STATE_UNSPECIFIED |  |
| /ru/otopitelnoe-oborudovanie/elektricheskiy-kotyol-haier-cozy-208 | top12m_3plus_segments_model_slug | 84 | Not found (404) | NOT_FOUND | 2026-10-14T10:10:15Z |
| /ru/stiralnye-mashiny/stiralnaya-mashina-haier-hw105-bp14406s | top12m_3plus_segments_model_slug | 75 | Blocked due to access forbidden (403) | ACCESS_FORBIDDEN | 2026-07-22T01:29:13Z |
| /ru/vstraivaemaya-tekhnika/vstraivaemaya-mikrovolnovaya-pech-haier-hmx-btg259b | top12m_3plus_segments_model_slug | 72 | Not found (404) | NOT_FOUND | 2026-11-05T06:42:50Z |
| /ru/vodonagrevateli/vodonagrevatel-haier-es80h-d3 | top12m_3plus_segments_model_slug | 71 | Blocked due to access forbidden (403) | ACCESS_FORBIDDEN | 2026-11-04T18:39:36Z |

Наблюдения из данных: из 12 проинспектированных карточек товара с модельным slug (топ-12 по кликам за 12m; 10 добавленных + 2 из списка задания) у 4 по последнему сохранённому краулу Google статус 404 или 403 (cozy-208 — 404, краул 2026-10-14; hw105-bp14406s — 403, краул 2026-07-22; hmx-btg259b — 404, краул 2026-11-05; es80h-d3 — 403, краул 2026-11-04). Inspection читает индекс GSC, живой краул не выполнялся. Для cozy-208 в pages_28d есть строка с другим путём `/ru/otopitelnoe-oborudovanie/elektricheskie-kotly/elektricheskiy-kotyol-haier-cozy-208` (12 кликов / 100 показов за 28d). hmx-btg259b и es80h-d3 ещё имеют клики в pages_3m (19 и 21). Оба AS18IDHHRA-URL из задания отсутствуют в pages_28d и pages_3m; в pages_12m есть только uz-версия (1 клик).

Rich results (detectedItems): Breadcrumbs — 27 URL, Product snippets — 8 URL, Merchant listings — 8 URL, Review snippets — 8 URL. Breadcrumbs везде с именем "Unnamed item". Предупреждения Merchant listings: `Missing field "validFrom"` — на всех 8 карточках с Merchant listings; `Invalid value in field "sku"` — 1 (proline-s-224). На главных `/`, `/ru`, `/uz` richResultsResult не возвращён. Mobile verdict: VERDICT_UNSPECIFIED у всех 36 (не возвращён). crawledAs: MOBILE у всех, где поле есть. lastCrawlTime проиндексированных URL: от 2026-09-30T17:29:17Z до 2026-11-19T03:28:37Z.

## 12. GA4 (Organic Search, если не указано иное)

**28 дней:** 2026-10-22..2026-11-18 vs 2026-09-24..2026-10-21

| metric | current | previous | abs Δ | % Δ |
|---|---|---|---|---|
| sessions | 4364 | 3662 | 702 | +19.2% |
| activeUsers | 3199 | 2680 | 519 | +19.4% |
| engagedSessions | 2893 | 2315 | 578 | +25.0% |
| engagementRate | 0.6629239230064161 | 0.6321682140906608 | 0.030755708915755298 | +4.9% |
| keyEvents | 114 | 116 | -2 | -1.7% |
| transactions | 0 | 0 | 0 |  |
| purchaseRevenue | 0 | 0 | 0 |  |

**90 дней:** 2026-08-21..2026-11-18 vs 2026-05-23..2026-08-20

| metric | current | previous | abs Δ | % Δ |
|---|---|---|---|---|
| sessions | 12077 | 16333 | -4256 | -26.1% |
| activeUsers | 8828 | 13307 | -4479 | -33.7% |
| engagedSessions | 7900 | 10680 | -2780 | -26.0% |
| engagementRate | 0.6541359609174464 | 0.653890895732566 | 0.00024506518488043305 | +0.0% |
| keyEvents | 358 | 463 | -105 | -22.7% |
| transactions | 0 | 0 | 0 |  |
| purchaseRevenue | 0 | 0 | 0 |  |

Каналы (90 дней, все каналы) vs предыдущие 90:

| channel | sessions | prev | Δ% | engagementRate | keyEvents | prev keyEvents | transactions |
|---|---|---|---|---|---|---|---|
| Organic Search | 12077 | 16333 | -26.1% | 0.6541 | 358 | 463 | 0 |
| Direct | 2898 | 1641 | +76.6% | 0.2609 | 44 | 37 | 0 |
| Unassigned | 719 | 1215 | -40.8% | 0.4896 | 31 | 41 | 0 |
| Referral | 446 | 226 | +97.3% | 0.2601 | 6 | 26 | 0 |
| AI Assistant | 45 | 166 | -72.9% | 0.6222 | 2 | 6 | 0 |
| Organic Social | 22 | 23 | -4.3% | 0.7273 | 0 | 0 | 0 |
| Cross-network | 2 | 2 | +0.0% | 1.0 | 0 | 0 | 0 |
| Paid Social | 1 |  |  | 0.0 | 0 |  | 0 |
| Paid Search |  | 26 |  |  |  | 0 |  |

Organic Search = 12077 из 16210 сессий всех каналов за 90 дней (74.5%) [derived].
Примечание: GA4 Organic Search включает все поисковые системы (не только Google), а окна GA4 (TZ Tashkent, до 2026-11-18) и GSC (Pacific, до 2026-11-16) различаются — сессии GA4 и клики GSC не сопоставимы один к одному. Падение 90д −26.1% сравнивается с окном 2026-05-23..2026-08-20, куда входит июльский пик GSC (2026-07: 5528 кликов).

Key events (90 дней):

| channel | event | keyEvents | users | prev keyEvents | Δ% |
|---|---|---|---|---|---|
| organic_search | click_tg | 170 | 131 | 207 | -17.9% |
| organic_search | click_tel | 138 | 126 | 163 | -15.3% |
| organic_search | zvonok | 27 | 24 | 44 | -38.6% |
| organic_search | order | 20 | 8 | 39 | -48.7% |
| organic_search | mail_click | 3 | 3 | 10 | -70.0% |
| all | click_tg | 206 | 159 | 243 | -15.2% |
| all | click_tel | 174 | 160 | 204 | -14.7% |
| all | zvonok | 33 | 29 | 54 | -38.9% |
| all | order | 24 | 11 | 61 | -60.7% |
| all | mail_click | 4 | 4 | 11 | -63.6% |

**Ecommerce:** отчёт по товарам за 90 дней пуст и для organic, и для всех каналов (itemsViewed = itemsAddedToCart = itemsPurchased = itemRevenue = 0, статус `none`); по посадочным: transactions = 0 и purchaseRevenue = 0 во всех 300 выгруженных строках; во всех overview/каналах transactions = 0. Ключевое событие `purchase` настроено (2023-11-24), но строк по нему нет. **GA4 ecommerce-трекинг фактически не записывает ни просмотров товаров, ни корзины, ни покупок.** Единственный «заказоподобный» сигнал — кастомное событие `order` (organic 20 за 90д, все каналы 24). Остальные key events — клики: click_tg, click_tel, zvonok, mail_click.

Топ-10 органических посадочных (90 дней, из 300 выгруженных строк из 522):

| landingPage | sessions | engagementRate | keyEvents | sessionKeyEventRate |
|---|---|---|---|---|
| /ru/otopitelnoe-oborudovanie | 711 | 0.7468 | 23 | 0.0267 |
| (not set) | 620 | 0.0242 | 2 | 0.0032 |
| /ru/teplovye-nasosy | 559 | 0.7907 | 22 | 0.0304 |
| /ru | 543 | 0.8674 | 41 | 0.0608 |
| /ru/blog/skolko-elektrichestva-potreblyaet-kondicioner-za-1-chas-kalkulyator-kvtch-ponyatnyy-gid | 450 | 0.5978 | 11 | 0.0244 |
| /ru/otopitelnoe-oborudovanie/elektricheskie-kotly | 372 | 0.7769 | 12 | 0.0188 |
| /ru/vodonagrevateli | 361 | 0.7784 | 11 | 0.0277 |
| /ru/kondicionery | 309 | 0.6893 | 2 | 0.0065 |
| /ru/blog/posudomoechnaya-mashina-plokho-moet-posudu-10-prichin-i-chek-list | 274 | 0.4964 | 0 | 0.0 |
| /ru/kholodilniki | 217 | 0.788 | 13 | 0.0507 |

`(not set)` — 620 органических сессий при engagementRate 0.0242.

Measurement health: 1 web-поток `G-H9DF7V4DMX` (defaultUri https://haiershop.uz), enhanced measurement включён полностью (scrolls, outbound, site search `q,s,search,query,keyword`, video, downloads, page changes, forms); 6 key events: purchase, order, zvonok, mail_click, click_tg, click_tel; custom dimensions/metrics: 0; issues: 0. Подробно — `ga4_measurement_health.md`.

## 13. Search opportunities (окно инструмента по умолчанию)

Окно 2026-10-20..2026-11-16; формула `round(100 * (0.5 * demand + 0.3 * businessValue + 0.2 * reachability))`, businessValue = sessionKeyEventRate. Возвращено 100 из 667 кандидатов (truncated.candidates = true); coverage: GSC rows 809, GA4 rows 359, matched 362, unmatched GSC 305. Warning: source_time_zones_differ.

| page | score | clicks | impr | position | GA4 sessions | keyEvents |
|---|---|---|---|---|---|---|
| /ru/teplovye-nasosy | 92 | 191 | 3834 | 4.55 | 213 | 5 |
| /ru/otopitelnoe-oborudovanie/elektricheskie-kotly | 91 | 183 | 4473 | 4.83 | 188 | 3 |
| /ru/vodonagrevateli | 90 | 102 | 2693 | 4.76 | 123 | 3 |
| /uz/issiqlik-nasosi | 90 | 53 | 1045 | 4.89 | 48 | 4 |
| /uz/suv-isitgichlar | 89 | 24 | 1167 | 4.76 | 35 | 2 |
| /ru/otopitelnoe-oborudovanie | 88 | 274 | 11614 | 5.75 | 324 | 10 |
| /ru | 87 | 165 | 1801 | 5.37 | 198 | 10 |
| /ru/blog/chto-takoe-teplovoy-nasos-i-kak-ekonomit-vashi-dengi-na-otoplenii-i-kondicionirovanii-v | 86 | 39 | 2378 | 5.79 | 32 | 1 |
| /uz/konditsionerlar | 86 | 53 | 2164 | 5.62 | 56 | 2 |
| /ru/chillery/fankoyly/napolnyy-fankoyl-haier-hfp-51lm-y3e1 | 85 | 11 | 345 | 4.26 | 15 | 1 |
| /ru/vodonagrevateli/protochnye-vodonagrevateli | 84 | 43 | 1025 | 5.76 | 41 | 2 |
| /ru/vodonagrevateli/boylery-kosvennogo-nagreva | 84 | 25 | 945 | 5.62 | 24 | 1 |
| /ru/blog/rezhim-auto-v-kondicionere-chto-eto-i-kogda-vklyuchat-v-tashkente | 84 | 3 | 532 | 5.3 | 15 | 2 |
| /uz/kir-yuvish-mashinalari | 82 | 56 | 3471 | 7.37 | 43 | 2 |
| /uz/blog/konditsioner-narxlari-9121824-va-inverter-toshkentda-brendlarni-solishtirish | 81 | 45 | 4147 | 7.15 | 41 | 1 |

## 14. DATA AVAILABLE / NOT AVAILABLE

**Получено:**
- GSC pages: 28d 809 строк (полностью), 3m 1018 (полностью), 6m 1142 (полностью), 12m 1496 (полностью) — все пагинированы до hasMore=false (ниже лимита 2000).
- GSC queries 28d/3m/12m — по 1000 строк, hasMore=true (хвост не выгружался по заданию: rowLimit 1000).
- query×page 3m — 1000 строк, hasMore=true.
- devices 3, countries 154, searchAppearance 2 (REVIEW_SNIPPET, PRODUCT_SNIPPETS), date 486 дней (2025-07-19..2026-11-16).
- pages_yoy_prev 291 строка (полностью). YoY-итоги посчитаны из дневного ряда (новых вызовов не требовалось).
- striking 4–10: 374, striking 11–20: 41 (обе пагинированы до hasMore=false).
- URL Inspection: 36/36 URL получили ответ, ошибок вызова нет.
- GA4: overview 28d и 90d, landing pages, ecommerce item (organic + all) и landing_page, key events (organic + all, с прошлым периодом), channels с прошлым периодом, measurement health, opportunities.

**Не получено / ограничения:**
- GSC: средняя позиция и CTR на уровне всего периода инструментом отдельно не возвращаются — в разделе 1 они [derived] из дневного ряда.
- GSC queries: хвост за пределами 1000 строк и анонимизированные запросы (3m: 6040 кликов / 262269 показов не классифицированы).
- GA4 organic landing pages: 300 из 522 строк (limit 300 по заданию); ecommerce по посадочным: 300 из 522.
- Opportunities: 100 из 667 кандидатов; warning `source_time_zones_differ` (GSC America/Los_Angeles vs GA4 Asia/Tashkent).
- GA4 ecommerce по товарам: 0 строк (нет активности ни в одном канале).
- Mobile usability verdict: не возвращён (VERDICT_UNSPECIFIED у всех).
- Частичные периоды: месяцы 2025-07 (с 19-го) и 2026-11 (по 16-е) в date_16m; в GA4-трендах первая и последняя недели каждого окна неполные (90д: 202634 и 202647; 28д: 202643 и 202647).
- Ошибок инструментов не было. Запрещённые/кредитные инструменты не вызывались; haiershop.uz напрямую не запрашивался.

