# Emerging Keywords — запросы, по которым показы только начались (gptbot.uz)

Источник: `date × query` за 17.06–14.09.2026 (5 693 строки, только раскрытые запросы), `query × page` за 28 дней. Скрипт `seo-audit/gsc-2026-09-17/scripts/emerging.py`; таблицы `csv/queries_emerging.csv` (145 запросов), `csv/queries_emerging_by_cluster.csv`, `csv/queries_emerging_weekly.csv` (недельная динамика топ-40), `summary_emerging.json`.

Сегменты (запрос с ≥ 10 показами за 28 дней):

| Сегмент | Определение | Запросов | Показы 28д | Клики 28д |
|---|---|---|---|---|
| new_14d | первый показ 1–14 сентября | 22 | 1 105 | 10 |
| new_28d | первый показ 18–31 августа | 58 | 32 692 | 148 |
| rising | показы за 14 дней ≥ ×2 к предыдущим 14 и ≥ 30 (не новые) | 17 | 14 996 | 164 |
| visible_no_clicks | ≥ 20 показов за 28 дней, 0 кликов (не новые, не растущие) | 48 | 2 008 | 0 |

Итого 145 запросов, 50 801 показ (68% всех показов сайта за 28 дней), 322 клика. Почти весь рост сайта — это «новые» и «растущие» узбекские ChatGPT-запросы; коммерческие запросы попадают в основном в «видны, но без кликов».

## 1. Новые за последние 14 дней (first_seen ≥ 1 сентября)

22 запроса, 733 показа — chatgpt_online, 239 — chatgpt_login, 58 — download, 42 — translate. Средняя позиция 6–9: страницы сразу входят в топ-10.

| Запрос | Первый показ | Показы 14д | Клики | Поз. | Страница | Действие |
|---|---|---|---|---|---|---|
| chatgpt yozish | 01.09 | 243 | 1 | 8,9 | **/ru/gpt-chat/** (RU) | E1: раздел «o‘zbek tilida matn yozish» в UZ-чате; T12 insho-статья |
| chatgpt bepul | 01.09 | 241 | 4 | 6,3 | /ru/gpt-chat/ | E2: H2 «ChatGPT bepul reja» в UZ-чате; T04 ссылка на UZ |
| chatgpt ga kirish | 01.09 | 122 | 0 | 8,0 | login-статья | T01 (kirish/ochish в сниппете) |
| chatgptga kirish | 02.09 | 64 | 1 | 3,7 | login-статья | T01 |
| chatgpt õzbekcha | 03.09 | 48 | 0 | 7,1 | /uz/gpt-uzbek-tilida/ | T03 (написания uzbekcha/o‘zbekcha) |
| chat gpt kirish | 03.09 | 43 | 0 | 8,1 | login-статья | T01 |
| chaji piti online | 07.09 | 43 | 0 | 5,9 | /ru/gpt-chat/ | T03/T04 (фонетические варианты на UZ-странице) |
| жажипити | 02.09 | 39 | 0 | 3,5 | /ru/gpt-chat/ | T03/T04 |
| chatgpt skachat qilish | 03.09 | 37 | 0 | 8,7 | download-статья | T09 |
| chatgpt oʻzbekcha tarjimon | 03.09 | 25 | 0 | 6,0 | /uz/gpt-uzbek-tilida/ | T11 (статья «tarjima») |
| таргет нима | 03.09 | 23 | 0 | 8,3 | /uz/blog/target-reklama-nima/ | нет действия: информационный, страница на месте |
| chatgptga | 04.09 | 22 | 0 | 6,1 | login-статья | T01 |
| chatgpt oʻrnatish | 02.09 | 21 | 0 | 8,6 | download-статья | T09 |
| jaji piti bot | 05.09 | 20 | 0 | 5,8 | /ru/gpt-chat/ | T04 |
| chatgpt bepul versiyasi | 01.09 | 18 | 2 | 7,8 | download-статья | E2 |
| чатгпт онлайн | 03.09 | 18 | 0 | 5,9 | /ru/gpt-chat/ | нет: RU-написание, страница верная |
| chatgpt tarjimon | 02.09 | 17 | 1 | 7,8 | /uz/gpt-uzbek-tilida/ | T11 |
| bepul chatgpt | 04.09 | 14 | 1 | 6,6 | /uz/gpt-uzbek-tilida/ | E2 |
| chatgpt saytiga kirish | 09.09 | 10 | 0 | 5,5 | login-статья | T01 |

Вывод: 9 из 22 новых запросов уходят на **русскую** страницу чата — это подтверждает T04 (ссылка на UZ-версию) и T03 (узбекские написания на UZ-странице) как первоочередные.

## 2. Новые за 15–28 дней (first_seen 18–31 августа)

58 запросов, 32 692 показа, 148 кликов; из них login-кластер — 4 запроса и 27 098 показов (в основном «chatgpt kirish» с 18 августа — до публикации статьи входа 1 сентября показы шли на другие страницы).

| Запрос | Первый показ | Показы 28д | Клики | Поз. 14д | Страница | Действие |
|---|---|---|---|---|---|---|
| chatgpt kirish | 18.08 | 24 641 | 80 | 7,3 | login-статья | T01 |
| chatgpt bepul kirish | 24.08 | 2 206 | 11 | 8,3 | /uz/gpt-uzbek-tilida/ | T03 |
| chatgpt uzbekcha | 23.08 | 984 | 6 | 6,1 | /uz/gpt-uzbek-tilida/ | T03 |
| chatgpt uzbekcha bepul | 24.08 | 967 | 9 | 5,1 | /uz/gpt-uzbek-tilida/ | T03/E2 |
| jaji piti online | 27.08 | 670 | 4 | 7,0 | /ru/gpt-chat/ | T03/T04 |
| chatgpt uzbekcha скачать | 26.08 | 327 | 3 | 8,7 | /ru/gpt-chat/ | T04 + ссылка на download-статью |
| chatgpt ozbekcha | 18.08 | 257 | 2 | 5,8 | /ru/gpt-chat/ | T03/T04 |
| chat gpt uzbekcha | 23.08 | 180 | 5 | 5,7 | /uz/gpt-uzbek-tilida/ | T03 |
| чат гпт узбекча | 20.08 | 176 | 3 | 5,7 | /uz/gpt-uzbek-tilida/ | — |
| chachipiti oʻzbek tilida | 18.08 | 161 | 0 | 8,3 | /uz/gpt-uzbek-tilida/ | T03 (фонетика) |
| chatgpt skachat uzbek tilida | 24.08 | 137 | 2 | 7,0 | download-статья | T09 |
| chatgpt online kirish | 24.08 | 136 | 0 | 5,2 | login-статья | T01 |
| chatgpt oʻzbekcha | 25.08 | 118 | 2 | 6,9 | /uz/gpt-uzbek-tilida/ | T03 |
| chatgpt yuklash | 29.08 | 117 | 1 | 7,3 | download-статья | T09 |
| chatgpt kirish login | 27.08 | 115 | 3 | 6,2 | login-статья | T01 |
| chatgpt 4 uzbek tilida | 20.08 | 112 | 0 | 9,1 | /uz/gpt-uzbek-tilida/ | E2 |
| chatgpt uzbek | 23.08 | 102 | 0 | 6,7 | /uz/gpt-uzbek-tilida/ | T03 |
| chatgpt uzbek tilida skachat | 26.08 | 100 | 0 | 7,7 | /uz/gpt-uzbek-tilida/ | ссылка UZ-чат → download-статья с якорем «skachat» |
| chatgpt узбекча | 23.08 | 99 | 0 | 6,6 | /ru/gpt-chat/ | T04 |
| onlayn chatgpt | 24.08 | 87 | 0 | 6,4 | /ru/gpt-chat/ | T04 |
| chat gpt 4 uzbekistan | 20.08 | 85 | 1 | 7,2 | /uz/gpt-uzbek-tilida/ | E2 |
| chatgpt yuklash apk | 29.08 | 65 | 3 | 7,0 | download-статья | — (CTR 4,6%) |
| chatgpt uzbekcha tarjimon | 28.08 | 57 | 1 | 4,4 | /uz/gpt-uzbek-tilida/ | T11 |
| savollarga javoblar beruvchi bot | 08.2026 | 26 | 0 | 8,4 | /uz/gpt-bot-biznes-uchun/ | E3 |
| процент рекламы телеграм от общего рынка… | 08.2026 | 26 | 0 | 8,8 | /ru/telegram-ads-uzbekistan/ | нет: статистический запрос, страница отвечает |

Коммерческие новые (leads_automation 9 запросов/125 показов, поз. 38; chatbot_dev 3/69, поз. 27; seo 3/50, поз. 51) — единичные показы на дальних позициях, действий не требуют.

## 3. Растущие (показы за 14 дней ≥ ×2)

| Запрос | Показы пред. 14 → посл. 14 | Клики 14д | Поз. пред. → посл. | Страница | Действие |
|---|---|---|---|---|---|
| chatgpt ochish | 362 → 2 875 (+694%) | 20 | 7,7 → 5,9 | login-статья (делит с download) | T01/T02 — закрепить за login-статьёй |
| chatgpt yuklab olish | 772 → 2 960 (+283%) | 42 | 7,8 → 6,9 | download-статья | T09 |
| chatgpt kirish uzbek tilida | 360 → 1 654 (+359%) | 8 | 6,9 → 5,7 | /uz/gpt-uzbek-tilida/ | T03 |
| chatgpt ilovasini yuklab olish | 613 → 1 317 (+115%) | 45 | 6,7 → 5,3 | download-статья | — (CTR 3,4%) |
| chatgpt uzbekcha online | 276 → 803 (+191%) | 3 | 6,1 → 4,8 | **/ru/gpt-chat/** | T03/T04 |
| chat gpt yuklash | 89 → 524 (+489%) | 7 | 8,7 → 6,9 | download-статья | — |
| chatgpt uzbek tilida gaplashish | 189 → 458 (+142%) | 4 | 7,9 → 6,7 | /uz/gpt-uzbek-tilida/ | — |
| chatgpt ochish uzbek tilida | 37 → 434 (+1 073%) | 0 | 6,7 → 6,1 | login-статья | T01 |
| chatgpt tarjima | 62 → 275 (+344%) | 3 | 6,3 → 6,5 | /uz/gpt-uzbek-tilida/ | T11 |
| chatgpt uzbek tilida | 86 → 198 (+130%) | 1 | 7,3 → 6,3 | /uz/gpt-uzbek-tilida/ | T03 |
| chatgpt uzbekistan | 50 → 111 (+122%) | 3 | 6,0 → 4,1 | /ru/gpt-chat/ | — |
| chatgpt yuklab olish kompyuter uchun | 35 → 97 (+177%) | 0 | 7,5 → 7,1 | download-статья | T09 |
| chatgpt o'rnatish | 16 → 45 (+181%) | 1 | 8,1 → 5,9 | download-статья | — |
| чат-бот мастер для бизнеса | 20 → 53 (+165%) | 0 | 61,5 → 57,3 | /ru/chat-bot-dlya-biznesa/ | нет: «бот-мастер» — чужой бренд/интент |

Позиции по 13 из 17 растущих улучшились одновременно с ростом показов — рост спроса (учебный год) и укрепление страниц идут вместе.

## 4. Видны, но без кликов (≥ 20 показов, 0 кликов)

48 запросов, 2 008 показов. По кластерам: seo — 26 запросов, 1 168 показов, средняя позиция 63; leads_automation — 9, 334, поз. 30; instagram_bots — 2, 83, поз. 13,5; smm — 1, 78, поз. 8,7; chatgpt_online — 5, 195, поз. 5,5; chatgpt_download — 2, 58, поз. 6,7; chatbot_dev — 2, 63, поз. 32.

Релевантные и близкие к топ-10 (действовать):
- «услуги смм специалиста» 78 показов, поз. 8,7 → T18.
- «чат жпт узбекча» 51 (6,8), «chat gpt uzbek tilida» 44 (4,9), «chat gpt uzbek» 34 (4,9) → T03.
- «чат гпт на узбекском» 44 (4,4) на /ru/gpt-chat/ → корректно (RU-написание), T04 добавит переход.
- «chpt yuklab olish» 33 (6,7) → download-статья, T09.
- «бот для инстаграм директ» 54 (18,7) → T16.
- «o'zbekistonda biznes uchun ai bot» 40 (19,8) на /uz/ → CANNIBALIZATION.md §2, ссылки на лендинг.

Не действовать: «seo продвижение» 228 (57,9), «seo продвижение сайтов» 109 (55,5), «продвижение сайтов» 103 (54,8), «лид это» 99 (26), «лид» 63 (29,7), «что такое сео/seo продвижение» 61/59 (72–77) — RU-информационные, география Россия/Украина, позиции 25–80.

## 5. Что это меняет в плане

1. Волна 1 (T01–T04) закрывает ≥ 70% emerging-показов: login-кластер (27 337 показов new_28d + rising), «uzbekcha/o‘zbekcha/фонетика» на UZ-странице, переток с RU-чата.
2. Три новых микро-задачи для месяца 1–2: **E1** «yozish» (243), **E2** «bepul / bepul versiyasi / ChatGPT 4» (≈ 370), **E3** узбекские коммерческие формулировки «savollarga javob beruvchi bot», «telegram bot buyurtma» (45) — все на существующих страницах.
3. Единственная новая страница, оправданная emerging-данными, — «ChatGPT bilan tarjima» (T11): translate-кластер 463 показа/28д (tarjima 337 ↑344%, uzbekcha tarjimon 57, tarjimon 17, oʻzbekcha tarjimon 25) без владельца.
4. Повторять срез еженедельно (`emerging.py`): порог для нового контента — ≥ 200 показов/28д на интент без страницы-владельца.
