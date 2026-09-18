# Query Analysis — gptbot.uz, 18.08–14.09.2026 (против 21.07–17.08)

Источник: `csv/queries_all.csv` (1 176 запросов за оба окна), `csv/topic_dynamics.csv`, `csv/query_categories_summary.csv`. Классификация — правила в `seo-audit/gsc-2026-09-17/scripts/analysis.py` (регулярные выражения по словам запроса: бренд, ChatGPT-подкластеры, услуги, язык, локальность). Только раскрытые запросы: 545 из 843 кликов.

## Кластеры (28 дней)

| Кластер | Запросов | Клики | Показы | CTR | Позиция | Доля кликов | Пред. 28: клики / показы | 90 дней: клики / показы |
|---|---|---|---|---|---|---|---|---|
| chatgpt_download (yuklab olish, skachat, apk, ilova) | 22 | 298 | 17 077 | 1,75% | 5,6 | 54,7% | 16 / 2 345 | 314 / 19 422 |
| chatgpt_login (kirish, ochish, login) | 11 | 126 | 33 059 | 0,38% | 7,2 | 23,1% | 1 / 120 | 127 / 33 179 |
| chatgpt_online (uzbek tilida, uzbekcha, online, bepul, фонетика «jaji piti») | 130 | 99 | 9 569 | 1,03% | 6,2 | 18,2% | 5 / 454 | 104 / 10 026 |
| chatgpt_translate (tarjima, tarjimon) | 6 | 5 | 463 | 1,08% | 6,4 | 0,9% | 0 / 10 | 5 / 473 |
| chatgpt_payment (оплатить, to‘lov) | 9 | 5 | 31 | 16,1% | 1,7 | 0,9% | 0 / 0 | 5 / 32 |
| chatgpt_prompts | 3 | 2 | 54 | 3,7% | 6,5 | 0,4% | 0 / 15 | 2 / 69 |
| chatgpt_alternatives | 4 | 0 | 4 | 0 | 29 | 0 | 0 / 4 | 0 / 10 |
| brand | 3 | 6 | 19 | 31,6% | 2,7 | 1,1% | 2 / 7 | 10 / 36 |
| seo (seo продвижение, продвижение сайтов, сео) | 205 | 0 | 1 751 | 0 | 58,9 | 0 | 0 / 557 | 0 / 2 308 |
| leads_automation (лид, заявки, crm, автоматизация) | 126 | 0 | 881 | 0 | 31,1 | 0 | 0 / 120 | 0 / 1 033 |
| chatbot_dev (чат-бот, бот для бизнеса, ai bot) | 40 | 0 | 300 | 0 | 43,2 | 0 | 0 / 112 | 0 / 481 |
| smm | 60 | 1 | 290 | 0,34% | 22,7 | 0,2% | 0 / 71 | 1 / 361 |
| digital_marketing (реклама, таргет, контекст) | 74 | 0 | 208 | 0 | 23,4 | 0 | 0 / 81 | 0 / 289 |
| instagram_bots | 24 | 0 | 149 | 0 | 18,8 | 0 | 0 / 49 | 0 / 231 |
| telegram_bots | 26 | 0 | 99 | 0 | 17,8 | 0 | 0 / 83 | 0 / 189 |
| telegram_ads | 18 | 0 | 96 | 0 | 36,7 | 0 | 0 / 0 | 0 / 96 |
| webdev (сайт, sayt yaratish) | 40 | 1 | 99 | 1,01% | 44,2 | 0,2% | 0 / 190 | 1 / 304 |
| ai_general (ии, ai chat) | 41 | 1 | 83 | 1,20% | 34,9 | 0,2% | 1 / 25 | 2 / 122 |
| whatsapp_bots | 4 | 0 | 52 | 0 | 35,0 | 0 | 0 / 15 | 0 / 67 |
| other (не отнесено) | 137 | 1 | 353 | 0,28% | 12,4 | 0,2% | 0 / 55 | 1 / 418 |
| irrelevant_ukr (украинские) | 1 | 0 | 29 | 0 | 85,7 | 0 | 0 / 12 | 0 / 53 |

Категории, которых в данных нет и которые не создавались: «разработка сайтов» как отдельный кластер с кликами (40 запросов, 1 клик), «AI-агенты» (единичные), «локальные» как отдельный кластер — локальность помечена флагом `is_local`. Запросов с гео-словами (Ташкент/Toshkent/Узбекистан/O‘zbekiston и т. п., без голого «uz») за 28 дней — 53: 10 кликов, 564 показа; из них сервисные — 38 запросов, 280 показов, 0 кликов («o'zbekistonda biznes uchun ai bot» 40, «seo ташкент» 30, «чат бот на заказ ташкент» 25, «разработка чат ботов ташкент» 23, «seo в ташкенте» 22, «telegram bot buyurtma o'zbekiston» 19).

## По языку (28 дней)

| Язык | Запросов | Клики | Доля кликов | Показы | Доля показов | CTR | Позиция |
|---|---|---|---|---|---|---|---|
| Узбекский (латиница + кириллица + фонетика) | 139 | 511 | 93,8% | 59 144 | 91,5% | 0,86% | 6,6 |
| Русский | 705 | 11 | 2,0% | 4 112 | 6,4% | 0,27% | 41,3 |
| Английский | 33 | 5 | 0,9% | 404 | 0,6% | 1,24% | 8,3 |
| Нейтральный (chatgpt, gptbot, chatgpt.uz) | 106 | 18 | 3,3% | 977 | 1,5% | 1,84% | 8,5 |
| Украинский | 1 | 0 | 0 | 29 | 0 | 0 | 85,7 |

705 русскоязычных запросов дают 11 кликов: это коммерческие/информационные RU-запросы на позициях 20–80, из них большая часть показов не из Узбекистана.

## По интенту (28 дней)

| Интент | Запросов | Клики | Доля кликов | Показы | CTR | Позиция |
|---|---|---|---|---|---|---|
| Навигационный (скачать/войти в ChatGPT) | 36 | 430 | 78,9% | 50 155 | 0,86% | 6,7 |
| Транзакционный (использовать чат на узбекском) | 130 | 99 | 18,2% | 9 569 | 1,03% | 6,2 |
| Информационный | 223 | 13 | 2,4% | 2 030 | 0,64% | 35,7 |
| Коммерческий (с модификаторами цена/заказ/Ташкент) | 192 | 2 | 0,4% | 712 | 0,28% | 30,7 |
| Коммерческое исследование (услуги без модификаторов) | 265 | 0 | 0 | 1 818 | 0 | 44,7 |
| Не определён | 138 | 1 | 0,2% | 382 | 0,26% | 18,0 |

## Распределение по позициям (28 дней, `csv/query_position_buckets.csv`)

| Диапазон | Запросов | Клики | Показы | CTR | Примеры (показы) |
|---|---|---|---|---|---|
| 1–3 | 43 | 12 | 84 | 14,3% | «как оплатить чат gpt в узбекистане» (22), «gptbot» (7), «чат гпт узб» (26) |
| 4–10 | 345 | 531 | 60 873 | 0,87% | «chatgpt kirish» (24 641), «chatgpt yuklab olish uzbek tilida» (9 604), «chatgpt yuklab olish» (3 732), «chatgpt ochish» (3 237) |
| 11–20 | 91 | 1 | 274 | 0,36% | «услуги смм специалиста»→ стр. 15,8, «o'zbekistonda biznes uchun ai bot» (40, 17,9), «smm продвижение» (15, 16,3) |
| 21–50 | 303 | 1 | 1 589 | 0,06% | «лид это» (99, 24,4), «seo ташкент» (30, 38), «чат бот на заказ ташкент» (25, 45) |
| 51+ | 202 | 0 | 1 846 | 0 | «seo продвижение» (228, 60), «seo продвижение сайтов» (109, 55), «продвижение сайтов» (103, 53) |

94% показов и 97% кликов — в диапазоне 4–10. Позиций 1–3 по объёмным запросам нет: выдача по «chatgpt …» навигационная, верх занимают chatgpt.com и магазины приложений.

## Топ-25 запросов по кликам (28 дней)

| Запрос | Клики | Показы | CTR | Позиция | Кластер | Страница-получатель |
|---|---|---|---|---|---|---|
| chatgpt yuklab olish uzbek tilida | 176 | 9 604 | 1,83% | 4,7 | download | /uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/ |
| chatgpt kirish | 80 | 24 641 | 0,32% | 7,4 | login | /uz/blog/chatgptga-qanday-kirish-mumkin/ |
| chatgpt ilovasini yuklab olish | 54 | 1 930 | 2,80% | 5,7 | download | …yuklab-olish/ |
| chatgpt yuklab olish | 48 | 3 732 | 1,29% | 7,1 | download | …yuklab-olish/ |
| chatgpt ochish | 22 | 3 237 | 0,68% | 6,1 | login | login-статья / download-статья (делят) |
| chatgpt uz | 12 | 685 | 1,75% | 5,1 | online | /ru/gpt-chat/ (desktop), /uz/gpt-uzbek-tilida/ (mobile) |
| chatgpt bepul kirish | 11 | 2 206 | 0,50% | 8,4 | login | /uz/gpt-uzbek-tilida/ |
| chatgpt uzbekcha bepul | 9 | 967 | 0,93% | 5,3 | online | /uz/gpt-uzbek-tilida/ |
| chatgpt kirish uzbek tilida | 8 | 2 014 | 0,40% | 5,9 | login | /uz/gpt-uzbek-tilida/ |
| chatgpt uzbek tilida online | 8 | 700 | 1,14% | 5,9 | online | /uz/gpt-uzbek-tilida/ |
| chatgpt uzbekcha online | 7 | 1 079 | 0,65% | 5,1 | online | **/ru/gpt-chat/** |
| chat gpt yuklash | 7 | 613 | 1,14% | 7,2 | download | …yuklab-olish/ |
| chatgpt uzbek tilida gaplashish | 6 | 647 | 0,93% | 7,0 | online | /uz/gpt-uzbek-tilida/ |
| chatgpt uzbekcha | 6 | 984 | 0,61% | 6,2 | online | /uz/gpt-uzbek-tilida/ |
| gptbot | 6 | 7 | 85,7% | 1,0 | brand | / |
| chat gpt uzbekcha | 5 | 180 | 2,78% | 6,2 | online | /uz/gpt-uzbek-tilida/ |
| как оплатить чат gpt в узбекистане | 5 | 22 | 22,7% | 1,2 | payment | /ru/blog/kak-oplatit-chatgpt-v-uzbekistane/ |
| chatgpt bepul | 4 | 241 | 1,66% | 6,3 | online | /ru/gpt-chat/ |
| jaji piti online | 4 | 670 | 0,60% | 7,0 | online | **/ru/gpt-chat/** |
| чат джипити узбекча | 4 | 38 | 10,5% | 6,3 | online | /ru/gpt-chat/ |
| chatgpt uzbekistan | 3 | 161 | 1,86% | 4,7 | online | /ru/gpt-chat/ |
| чат гпт узбекча | 3 | 176 | 1,70% | 5,6 | online | /uz/gpt-uzbek-tilida/ |
| chatgpt yuklash apk | 3 | 65 | 4,62% | 7,1 | download | …yuklab-olish/ |
| chatgpt uzbekcha скачать | 3 | 327 | 0,92% | 8,6 | download | /ru/gpt-chat/ |
| chatgpt tarjima | 3 | 337 | 0,89% | 6,5 | translate | /ru/gpt-chat/ |

## Рост (28 vs предыдущие 28), `csv/queries_growing.csv`

12 запросов с ростом ≥ +3 кликов и ≥ +50%: «chatgpt yuklab olish uzbek tilida» 11→176 кликов (позиция 8,2→4,7), «chatgpt ilovasini yuklab olish» 3→54 (7,3→5,7), «chatgpt yuklab olish» 2→48 (4,8→7,1, позиция ухудшилась при росте показов 130→3 732 — расширение выдачи по более широкому запросу), «chatgpt ochish» 1→22 (9,2→6,1), «chatgpt uz» 0→12, «chatgpt kirish uzbek tilida» 0→8, «chatgpt uzbek tilida online» 0→8, «chatgpt uzbekcha online» 0→7, «chat gpt yuklash» 0→7.

Понедельно по «chatgpt yuklab olish uzbek tilida»: позиция 9,1 (нед. 3 авг) → 7,8 → 7,5 → 4,4 → 4,2 → 4,2; клики 1 → 9 → 10 → 32 → 50 → 74.

## Падение, `csv/queries_declining.csv`

По порогам (пред. клики ≥ 5 и −30%, либо пред. показы ≥ 150 и −30%; для 7 дней ≥ 5 кликов/≥ 150 показов и −40%) — **0 запросов**. Никакого отката по значимым запросам нет.

## Новые и потерянные (`csv/queries_new.csv`, `csv/queries_lost.csv`)

- Новых с ≥ 20 показами: 55. Крупнейшие — «chatgpt kirish» (24 641 показ, 80 кликов), «chatgpt bepul kirish» (2 206), «chatgpt uzbekcha» (984), «chatgpt uzbekcha bepul» (967), «jaji piti online» (670), «chatgpt uzbekcha скачать» (327), «chatgpt ozbekcha» (257), «chatgpt yozish» (243), «chatgpt bepul» (241). Почти все — следствие публикации статьи входа (1 сен) и роста узбекского чата.
- Потерянных с ≥ 10 показами: 4 («сайт для бизнеса» 17, «ии для салона красоты» 11, «ai бот для сайта» 10, «прием и обработка заявок» 10) — все на позициях 27–89, потерь кликов нет.

## Запросы без кликов при заметных показах (`csv/queries_no_clicks.csv`, 41 запрос ≥ 30 показов)

Релевантные и близкие к топ-10: «chachipiti oʻzbek tilida» 161 (8,3), «chatgpt online kirish» 136 (5,3), «chatgpt yuklab olish kompyuter uchun» 132 (7,2), «chatgpt ga kirish» 122 (8,0), «chatgpt 4 uzbek tilida» 112 (9,1), «chatgpt uzbek» 102 (6,6), «chatgpt uzbek tilida skachat» 100 (7,7), «chatgpt узбекча» 99 (6,6), «onlayn chatgpt» 87 (6,1), «услуги смм специалиста» 78 (9,2).
Нерелевантная география/интент: «seo продвижение» 228 (60,3), «seo продвижение сайтов» 109 (54,6), «продвижение сайтов» 103 (52,8), «лид это» 99 (24,4) — RU-запросы преимущественно из России/Украины.

## Запросы около топ-10 (позиция 8–20, ≥ 40 показов) — `csv/queries_near_top10.csv`, 8 шт.

«chatgpt bepul kirish» 2 206 (8,4), «chatgpt uzbekcha скачать» 327 (8,6), «chatgpt yozish» 243 (8,9), «chachipiti oʻzbek tilida» 161 (8,3), «chatgpt 4 uzbek tilida» 112 (9,1), «услуги смм специалиста» 78 (9,2), «chatgpt ga kirish» 122 (8,0), «o'zbekistonda biznes uchun ai bot» 40 (17,9).

## CTR-возможности (`csv/queries_ctr_opportunities.csv`)

Ожидаемый CTR — медиана по небрендовым запросам сайта с ≥ 60 показами в том же диапазоне позиций: 4–6 → 1,56%; 7–10 → 0,85%; 21+ → 0. Диапазоны 1–3 и 11–20 не имеют достаточной выборки. Отбор: ≥ 150 показов, позиция ≤ 20, CTR < 60% ожидаемого.

| Запрос | Показы | CTR | Позиция | Ожид. CTR | Потенциал кликов/28д | Страница |
|---|---|---|---|---|---|---|
| chatgpt kirish | 24 641 | 0,32% | 7,4 | 0,85% | +130,6 | /uz/blog/chatgptga-qanday-kirish-mumkin/ |
| chatgpt kirish uzbek tilida | 2 014 | 0,40% | 5,9 | 1,56% | +23,5 | /uz/gpt-uzbek-tilida/ |
| chatgpt uzbekcha online | 1 079 | 0,65% | 5,1 | 1,56% | +9,9 | /ru/gpt-chat/ |
| chatgpt bepul kirish | 2 206 | 0,50% | 8,4 | 0,85% | +7,9 | /uz/gpt-uzbek-tilida/ |
| chatgpt ochish uzbek tilida | 471 | 0,21% | 6,2 | 0,85% | +3,0 | login-статья |
| chatgpt ozbekcha | 257 | 0,78% | 6,0 | 1,56% | +2,0 | /ru/gpt-chat/ |
| chatgpt uzbek tilida | 284 | 0,35% | 6,6 | 0,85% | +1,4 | /uz/gpt-uzbek-tilida/ |
| chachipiti oʻzbek tilida | 161 | 0 | 8,3 | 0,85% | +1,4 | /uz/gpt-uzbek-tilida/ |
| chatgpt yozish | 243 | 0,41% | 8,9 | 0,85% | +1,1 | /ru/gpt-chat/ |

Почему CTR низкий (по сопоставлению сниппета и запроса, см. PAGE_ANALYSIS.md): title статьи входа — «ChatGPT login: rasmiy sayt, ro‘yxatdan o‘tish va xatolar», а запросы содержат «kirish»/«ochish»; title узбекского чата не содержит «kirish»; для «uzbekcha/ozbekcha/jaji piti» Google показывает русскую страницу с русским title. Навигационная природа «chatgpt kirish» (пользователь хочет chatgpt.com) ограничивает потолок CTR, поэтому ориентир — медиана сайта, а не «средний CTR по позиции 7».

## Устройства и страны по запросам

- Mobile vs desktop (`csv/device_query_split.csv`): по «chatgpt uz», «chatgpt ozbekcha», «chat gpt uz» на mobile Google показывает /uz/gpt-uzbek-tilida/, на desktop — /ru/gpt-chat/ (`csv/query_device_page_mismatch.csv`, 6 запросов). Позиции по устройствам для топ-запросов близки (±1).
- Узбекистан vs Россия (`csv/query_country_position_gap.csv`): разница позиций по 16 общим запросам в пределах −2…+1,4 — географических аномалий нет; из России лучше кликают «chatgpt ilovasini yuklab olish» (22 клика с 354 показов, CTR 6,2%).
- Из Узбекистана по услугам (`csv/country_query_top.csv`): «o'zbekistonda biznes uchun ai bot» 40 показов (17,9), «seo ташкент» 30 (38,3), «instagram direct nima» 29 (7,0), «savollarga javoblar beruvchi bot» 26 (8,3), «чат бот на заказ ташкент» 25 (45,4), «разработка чат ботов ташкент» 23 (42,9), «telegram bot buyurtma o'zbekiston» 19 (9,8), «smm продвижение» 15 (16,3), «смм продвижение» 14 (11,9), «seo продвижение цена» 7 (12,4). Суммарно услуги из Узбекистана: 291 запрос, 927 показов, 2 клика.
